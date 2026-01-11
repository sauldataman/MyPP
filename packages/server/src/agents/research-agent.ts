/**
 * Research Agent
 *
 * Orchestrates research tasks by delegating to specialized sub-agents.
 * Supports multiple research types including X/Twitter analysis.
 */

import { BaseAgent, AgentResult, AgentContext } from "./base-agent.js";
import { getPrompt } from "../lib/prompts/loader.js";

// Research task types
type ResearchType = "general" | "x-analysis" | "web-research";

interface XAnalysisParams {
  type: "x-analysis";
  username: string;
  hours?: number;
  language?: string;
}

interface WebResearchParams {
  type: "web-research";
  topic: string;
  sources?: string[];
}

interface GeneralResearchParams {
  type?: "general";
  topic: string;
}

type ResearchParams = XAnalysisParams | WebResearchParams | GeneralResearchParams;

export class ResearchAgent extends BaseAgent {
  name = "research";
  description = "Researches topics and synthesizes findings using sub-agents";

  async run(context: AgentContext): Promise<AgentResult> {
    const params = context.handoffData as ResearchParams | undefined;

    // Determine research type
    const researchType = params?.type || "general";

    switch (researchType) {
      case "x-analysis":
        return this.runXAnalysis(params as XAnalysisParams);
      case "web-research":
        return this.runWebResearch(params as WebResearchParams);
      default:
        return this.runGeneralResearch(params as GeneralResearchParams);
    }
  }

  /**
   * X/Twitter Analysis - Analyze a user's tweets using Grok
   */
  private async runXAnalysis(params: XAnalysisParams): Promise<AgentResult> {
    const { username, hours = 24, language = "zh" } = params;

    if (!username) {
      return {
        status: "failed",
        error: "username is required for X analysis",
        tokensUsed: 0,
        costUsd: 0,
      };
    }

    this.log(`Starting X analysis for @${username} (past ${hours}h)`);

    // Check sub-agent availability
    if (!this.isSubAgentAvailable()) {
      this.log("Claude sub-agents not available, using direct Grok", "warn");
      return this.fallbackXAnalysis(username, hours, language);
    }

    // Load customizable prompt from file
    const customPrompt = getPrompt("x-analyst", {
      username,
      hours: String(hours),
      language,
    });

    // Delegate to X analyst sub-agent
    const result = await this.delegateToSubAgent(
      {
        name: "x-analyst",
        description: `Analyzes @${username}'s Twitter activity`,
        skills: [
          "fetch_user_tweets",
          "analyze_tweet_patterns",
          "generate_tweet_summary",
          "write_report",
        ],
        systemPrompt: customPrompt || undefined,
        model: "claude-sonnet-4-20250514",
        maxIterations: 15,
        temperature: 0.3,
      },
      `Analyze @${username}'s tweets from the past ${hours} hours.

Steps:
1. Fetch their recent tweets using fetch_user_tweets
2. Analyze patterns using analyze_tweet_patterns
3. Generate a summary using generate_tweet_summary
4. Save the report using write_report with title "${username}-twitter-analysis"

Output language: ${language === "zh" ? "Chinese (中文)" : "English"}`
    );

    if (!result.success) {
      return {
        status: "failed",
        error: result.response,
        tokensUsed: this.tokensUsed,
        costUsd: this.costUsd,
      };
    }

    return {
      status: "success",
      result: {
        type: "x-analysis",
        username,
        timeRange: `${hours} hours`,
        analysis: result.response,
        toolCalls: result.toolCalls.map((tc) => ({
          tool: tc.tool,
          success: tc.result.success,
        })),
        iterations: result.iterations,
      },
      brief: `Completed X analysis for @${username}: ${result.toolCalls.length} tools used`,
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
    };
  }

  /**
   * Fallback X analysis when sub-agents are not available
   */
  private async fallbackXAnalysis(
    username: string,
    hours: number,
    language: string
  ): Promise<AgentResult> {
    // Use Grok directly for X analysis
    const analysis = await this.callLLM(
      `Analyze @${username}'s Twitter activity from the past ${hours} hours.

Provide:
1. Activity summary
2. Main topics discussed
3. Sentiment analysis
4. Notable tweets
5. Key insights

Output in ${language === "zh" ? "Chinese (中文)" : "English"}.`,
      { provider: "grok", task: "analysis" }
    );

    return {
      status: "success",
      result: {
        type: "x-analysis",
        username,
        analysis,
        method: "direct-grok",
      },
      brief: `X analysis for @${username} (fallback mode)`,
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
    };
  }

  /**
   * Web Research - Research a topic from the web
   */
  private async runWebResearch(params: WebResearchParams): Promise<AgentResult> {
    const { topic, sources } = params;

    if (!topic) {
      return {
        status: "failed",
        error: "topic is required for web research",
        tokensUsed: 0,
        costUsd: 0,
      };
    }

    this.log(`Starting web research on: ${topic}`);

    if (!this.isSubAgentAvailable()) {
      return {
        status: "failed",
        error: "Web research requires Claude sub-agents",
        tokensUsed: 0,
        costUsd: 0,
      };
    }

    const result = await this.delegateToSubAgent(
      {
        name: "web-researcher",
        description: "Researches topics from web sources",
        skills: ["fetch_url", "parse_json", "extract_data", "write_report"],
      },
      `Research the topic: "${topic}"
${sources?.length ? `Focus on these sources: ${sources.join(", ")}` : ""}

Gather information, analyze it, and produce a research report.`
    );

    return {
      status: result.success ? "success" : "failed",
      result: result.success ? { topic, research: result.response } : undefined,
      error: result.success ? undefined : result.response,
      brief: `Web research on: ${topic}`,
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
    };
  }

  /**
   * General Research (original implementation)
   */
  private async runGeneralResearch(params: GeneralResearchParams): Promise<AgentResult> {
    const topic = params?.topic || "default topic";

    this.log(`Starting general research on: ${topic}`);

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
