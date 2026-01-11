/**
 * Sub-Agent Manager
 *
 * Creates and manages sub-agents that can execute tasks with skills/tools.
 * Uses Claude API with tool use for intelligent task execution.
 */

import Anthropic from "@anthropic-ai/sdk";
import { skillRegistry } from "./skills/registry.js";
import { SkillContext, SkillResult } from "./skills/types.js";
import { prisma } from "./prisma.js";
import { randomUUID } from "crypto";

// Sub-agent configuration
export interface SubAgentConfig {
  name: string;
  description: string;
  skills: string[]; // Skill names to assign
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;
  temperature?: number;
}

// Sub-agent execution result
export interface SubAgentResult {
  success: boolean;
  response: string;
  toolCalls: Array<{
    tool: string;
    input: unknown;
    result: SkillResult;
  }>;
  tokensUsed: {
    input: number;
    output: number;
  };
  costUsd: number;
  iterations: number;
}

// Pricing for Claude models (per 1M tokens)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model] || PRICING["claude-sonnet-4-20250514"];
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  );
}

export class SubAgentManager {
  private client: Anthropic | null = null;
  private defaultModel = "claude-sonnet-4-20250514";

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Check if Claude is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Create and run a sub-agent
   */
  async runSubAgent(
    config: SubAgentConfig,
    task: string,
    parentContext?: { agentName: string; sessionId: string }
  ): Promise<SubAgentResult> {
    if (!this.client) {
      return {
        success: false,
        response: "Claude API not configured (missing ANTHROPIC_API_KEY)",
        toolCalls: [],
        tokensUsed: { input: 0, output: 0 },
        costUsd: 0,
        iterations: 0,
      };
    }

    const sessionId = parentContext?.sessionId || randomUUID();
    const model = config.model || this.defaultModel;
    const maxIterations = config.maxIterations || 10;

    // Build skill context
    const skillContext: SkillContext = {
      agentName: config.name,
      parentAgent: parentContext?.agentName,
      sessionId,
      state: new Map(),
    };

    // Get tools for assigned skills
    const tools = skillRegistry.toTools(config.skills);
    if (tools.length === 0) {
      console.warn(`Sub-agent ${config.name} has no skills assigned`);
    }

    // Build system prompt
    const systemPrompt =
      config.systemPrompt ||
      `You are ${config.name}, a specialized sub-agent. ${config.description}

Your available skills:
${config.skills.map((s) => `- ${s}`).join("\n")}

Complete the task efficiently using the available tools. Be concise and direct.`;

    // Execute with tool loop
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: task },
    ];

    const toolCalls: SubAgentResult["toolCalls"] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    let finalResponse = "";

    console.log(`🤖 Sub-agent ${config.name} starting task: ${task.slice(0, 100)}...`);

    while (iterations < maxIterations) {
      iterations++;

      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          messages,
          temperature: config.temperature ?? 0.7,
        });

        // Track usage
        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        // Process response
        const hasToolUse = response.content.some(
          (block) => block.type === "tool_use"
        );

        if (response.stop_reason === "end_turn" || !hasToolUse) {
          // Extract text response
          const textBlocks = response.content.filter(
            (block) => block.type === "text"
          ) as Anthropic.Messages.TextBlock[];
          finalResponse = textBlocks.map((b) => b.text).join("\n");
          break;
        }

        // Process tool calls
        const assistantContent = response.content;
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            console.log(`  🔧 Tool call: ${block.name}`);
            const result = await skillRegistry.execute(
              block.name,
              block.input,
              skillContext
            );

            toolCalls.push({
              tool: block.name,
              input: block.input,
              result,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result.success
                ? JSON.stringify(result.data)
                : `Error: ${result.error}`,
            });
          }
        }

        // Add assistant message and tool results
        messages.push({ role: "assistant", content: assistantContent });
        messages.push({ role: "user", content: toolResults });
      } catch (error) {
        console.error(`Sub-agent ${config.name} error:`, error);
        return {
          success: false,
          response: `Sub-agent error: ${error}`,
          toolCalls,
          tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
          costUsd: calculateCost(model, totalInputTokens, totalOutputTokens),
          iterations,
        };
      }
    }

    const costUsd = calculateCost(model, totalInputTokens, totalOutputTokens);

    console.log(
      `✅ Sub-agent ${config.name} completed in ${iterations} iterations ` +
        `(${totalInputTokens + totalOutputTokens} tokens, $${costUsd.toFixed(4)})`
    );

    // Log to database
    try {
      await prisma.lLMUsage.create({
        data: {
          provider: "claude",
          model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd,
          latencyMs: 0, // Could track this too
          agentName: config.name,
        },
      });
    } catch (e) {
      // Ignore DB errors for logging
    }

    return {
      success: true,
      response: finalResponse,
      toolCalls,
      tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      costUsd,
      iterations,
    };
  }

  /**
   * Create a pre-configured sub-agent factory
   */
  createSubAgent(config: SubAgentConfig) {
    return {
      name: config.name,
      description: config.description,
      run: (task: string, parentContext?: { agentName: string; sessionId: string }) =>
        this.runSubAgent(config, task, parentContext),
    };
  }
}

// Singleton instance
let manager: SubAgentManager | null = null;

export function getSubAgentManager(): SubAgentManager {
  if (!manager) {
    manager = new SubAgentManager();
  }
  return manager;
}
