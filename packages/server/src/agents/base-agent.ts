/**
 * Base Agent class
 *
 * All domain agents extend this class.
 */

import { prisma } from "../lib/prisma.js";
import { getLLMRouter, type LLMMessage, type TaskType } from "../lib/llm-router.js";
import {
  getSubAgentManager,
  type SubAgentConfig,
  type SubAgentResult,
} from "../lib/subagent-manager.js";
import { randomUUID } from "crypto";

export interface AgentResult {
  status: "success" | "failed" | "timeout";
  result?: Record<string, unknown>;
  brief?: string;
  error?: string;
  tokensUsed: number;
  costUsd: number;
}

export interface AgentContext {
  triggeredBy: "cron" | "manual" | "handoff";
  handoffData?: Record<string, unknown>;
  sessionId?: string;
}

export abstract class BaseAgent {
  abstract name: string;
  abstract description: string;

  protected llm = getLLMRouter();
  protected subAgentManager = getSubAgentManager();
  protected tokensUsed = 0;
  protected costUsd = 0;
  protected sessionId = randomUUID();

  /**
   * Main execution method - implement in subclass
   */
  abstract run(context: AgentContext): Promise<AgentResult>;

  /**
   * Call LLM with tracking
   */
  protected async callLLM(
    prompt: string,
    options: {
      system?: string;
      task?: TaskType;
      provider?: "gemini" | "grok" | "claude" | "ollama";
    } = {}
  ): Promise<string> {
    const response = await this.llm.chat(prompt, options);

    // Track usage
    this.tokensUsed += response.inputTokens + response.outputTokens;
    this.costUsd += response.costUsd;

    // Log to database
    await prisma.lLMUsage.create({
      data: {
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: response.costUsd,
        latencyMs: response.latencyMs,
        agentName: this.name,
      },
    });

    return response.content;
  }

  /**
   * Send handoff to another agent
   */
  protected async sendHandoff(
    toAgentName: string,
    type: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const agent = await prisma.agent.findUnique({
      where: { name: this.name },
    });

    if (!agent) {
      console.warn(`Agent ${this.name} not found in database`);
      return;
    }

    await prisma.handoff.create({
      data: {
        fromAgentId: agent.id,
        toAgentName,
        type,
        payload,
      },
    });

    console.log(`📤 Handoff sent: ${this.name} -> ${toAgentName} (${type})`);
  }

  /**
   * Get pending handoffs for this agent
   */
  protected async getHandoffs(): Promise<
    Array<{
      id: string;
      fromAgentName: string;
      type: string;
      payload: unknown;
    }>
  > {
    const handoffs = await prisma.handoff.findMany({
      where: {
        toAgentName: this.name,
        status: "pending",
      },
      include: {
        fromAgent: true,
      },
    });

    return handoffs.map((h) => ({
      id: h.id,
      fromAgentName: h.fromAgent.name,
      type: h.type,
      payload: h.payload,
    }));
  }

  /**
   * Mark handoff as processed
   */
  protected async markHandoffProcessed(handoffId: string): Promise<void> {
    await prisma.handoff.update({
      where: { id: handoffId },
      data: {
        status: "processed",
        processedAt: new Date(),
      },
    });
  }

  /**
   * Get/set agent state
   */
  protected async getState<T>(key: string): Promise<T | null> {
    const state = await prisma.state.findUnique({
      where: {
        domain_key: {
          domain: this.name,
          key,
        },
      },
    });
    return state?.value as T | null;
  }

  protected async setState(key: string, value: unknown): Promise<void> {
    await prisma.state.upsert({
      where: {
        domain_key: {
          domain: this.name,
          key,
        },
      },
      update: { value: value as object },
      create: {
        domain: this.name,
        key,
        value: value as object,
      },
    });
  }

  /**
   * Log a trace for debugging/improvement
   */
  protected log(message: string, level: "info" | "warn" | "error" = "info") {
    const prefix = {
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    }[level];
    console.log(`${prefix} [${this.name}] ${message}`);
  }

  /**
   * Delegate a task to a sub-agent with specific skills
   *
   * Sub-agents use Claude with tools to complete specialized tasks autonomously.
   *
   * @example
   * const result = await this.delegateToSubAgent({
   *   name: "data-analyzer",
   *   description: "Analyzes data patterns",
   *   skills: ["fetch_url", "parse_json", "aggregate_data"],
   * }, "Fetch https://api.example.com/data and calculate the average price");
   */
  protected async delegateToSubAgent(
    config: Omit<SubAgentConfig, "name"> & { name?: string },
    task: string
  ): Promise<SubAgentResult> {
    const subAgentConfig: SubAgentConfig = {
      name: config.name || `${this.name}-subagent-${Date.now()}`,
      description: config.description,
      skills: config.skills,
      systemPrompt: config.systemPrompt,
      model: config.model,
      maxIterations: config.maxIterations,
      temperature: config.temperature,
    };

    this.log(`Delegating task to sub-agent: ${subAgentConfig.name}`);

    const result = await this.subAgentManager.runSubAgent(subAgentConfig, task, {
      agentName: this.name,
      sessionId: this.sessionId,
    });

    // Track usage from sub-agent
    this.tokensUsed += result.tokensUsed.input + result.tokensUsed.output;
    this.costUsd += result.costUsd;

    if (result.success) {
      this.log(
        `Sub-agent completed: ${result.toolCalls.length} tool calls, ` +
          `${result.iterations} iterations`
      );
    } else {
      this.log(`Sub-agent failed: ${result.response}`, "error");
    }

    return result;
  }

  /**
   * Check if Claude sub-agents are available
   */
  protected isSubAgentAvailable(): boolean {
    return this.subAgentManager.isAvailable();
  }
}
