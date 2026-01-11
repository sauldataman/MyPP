/**
 * Research Agent
 *
 * Example agent demonstrating sub-agent delegation.
 * Delegates data gathering and analysis to specialized sub-agents.
 */

import { BaseAgent, AgentResult, AgentContext } from "./base-agent.js";

export class ResearchAgent extends BaseAgent {
  name = "research";
  description = "Researches topics and synthesizes findings using sub-agents";

  async run(context: AgentContext): Promise<AgentResult> {
    const { handoffData } = context;
    const topic = (handoffData?.topic as string) || "default topic";

    this.log(`Starting research on: ${topic}`);

    // Check if Claude sub-agents are available
    if (!this.isSubAgentAvailable()) {
      // Fallback to direct LLM call
      this.log("Sub-agents not available, using direct LLM", "warn");

      const analysis = await this.callLLM(
        `Research and summarize the following topic: ${topic}`,
        { task: "analysis" }
      );

      return {
        status: "success",
        result: { analysis },
        brief: `Research completed on: ${topic}`,
        tokensUsed: this.tokensUsed,
        costUsd: this.costUsd,
      };
    }

    // Delegate to data-gathering sub-agent
    const gatherResult = await this.delegateToSubAgent(
      {
        name: "data-gatherer",
        description: "Gathers data from various sources",
        skills: ["fetch_url", "parse_json", "extract_data", "store_data"],
        systemPrompt: `You are a data gathering specialist. Your job is to:
1. Find relevant data sources
2. Fetch and parse the data
3. Extract key information
4. Store the findings for later analysis

Be thorough but efficient. Focus on high-quality, relevant data.`,
      },
      `Gather data on the topic: "${topic}".

Try to find relevant APIs, documentation, or data sources.
Store key findings using the store_data skill for later analysis.`
    );

    if (!gatherResult.success) {
      return {
        status: "failed",
        error: `Data gathering failed: ${gatherResult.response}`,
        tokensUsed: this.tokensUsed,
        costUsd: this.costUsd,
      };
    }

    // Delegate to analysis sub-agent
    const analysisResult = await this.delegateToSubAgent(
      {
        name: "analyst",
        description: "Analyzes data and produces insights",
        skills: ["retrieve_data", "transform_array", "aggregate_data"],
        systemPrompt: `You are a data analyst. Your job is to:
1. Retrieve stored data from previous gathering
2. Analyze patterns and trends
3. Produce actionable insights

Focus on clarity and actionable conclusions.`,
      },
      `Analyze the gathered data on "${topic}" and produce a summary with key insights.

Use retrieve_data to get previously stored findings, then analyze them.`
    );

    // Synthesize findings
    const synthesis = await this.callLLM(
      `Based on the following research findings, provide a concise synthesis:

Data Gathering Phase:
${gatherResult.response}

Analysis Phase:
${analysisResult.response}

Provide:
1. Key findings (3-5 bullet points)
2. Main insights
3. Recommended next steps`,
      { task: "generation" }
    );

    // Send handoff to content agent for publishing if needed
    await this.sendHandoff("content", "research_complete", {
      topic,
      synthesis,
      gatheringToolCalls: gatherResult.toolCalls.length,
      analysisToolCalls: analysisResult.toolCalls.length,
    });

    return {
      status: "success",
      result: {
        topic,
        synthesis,
        phases: {
          gathering: {
            success: gatherResult.success,
            toolCalls: gatherResult.toolCalls.length,
            iterations: gatherResult.iterations,
          },
          analysis: {
            success: analysisResult.success,
            toolCalls: analysisResult.toolCalls.length,
            iterations: analysisResult.iterations,
          },
        },
      },
      brief: `Research completed on "${topic}" with ${gatherResult.toolCalls.length + analysisResult.toolCalls.length} tool calls`,
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
    };
  }
}
