/**
 * X (Twitter) Agent
 *
 * Monitors mentions, analyzes engagement, generates replies.
 * Uses Grok for X-specific analysis.
 */

import { BaseAgent, type AgentResult, type AgentContext } from "./base-agent.js";

interface Tweet {
  id: string;
  text: string;
  author: string;
  authorId: string;
  createdAt: string;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
  };
}

interface MentionAnalysis {
  summary: string;
  sentiment: "positive" | "negative" | "mixed" | "neutral";
  priorityReplies: Array<{
    mentionAuthor: string;
    mentionText: string;
    suggestedReply: string;
    priorityReason: string;
  }>;
  actionItems: string[];
}

export class XAgent extends BaseAgent {
  name = "x";
  description = "X (Twitter) content management powered by Grok";

  private config = {
    accountContext: "",
    replyTone: "friendly and helpful",
    autoReply: false,
  };

  async run(context: AgentContext): Promise<AgentResult> {
    try {
      this.log("Starting X agent run");

      // Load config from state
      const savedConfig = await this.getState<typeof this.config>("config");
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }

      // 1. Fetch mentions
      const mentions = await this.fetchMentions();
      this.log(`Fetched ${mentions.length} mentions`);

      // 2. Analyze with Grok (best for X context)
      let analysis: MentionAnalysis | null = null;
      if (mentions.length > 0) {
        analysis = await this.analyzeMentions(mentions);
        this.log(`Analysis complete: ${analysis.sentiment} sentiment`);
      }

      // 3. Process handoffs from other agents
      const handoffs = await this.getHandoffs();
      for (const handoff of handoffs) {
        if (handoff.type === "post_request") {
          // Another agent wants us to post something
          this.log(`Received post request from ${handoff.fromAgentName}`);
          // Would process and queue for review
        }
        await this.markHandoffProcessed(handoff.id);
      }

      // 4. Send handoffs if needed
      if (analysis && analysis.priorityReplies.length > 0) {
        await this.sendHandoff("personal", "alert", {
          type: "priority_mentions",
          count: analysis.priorityReplies.length,
          summary: analysis.summary,
        });
      }

      // 5. Generate brief
      const brief = this.generateBrief(mentions.length, analysis);

      return {
        status: "success",
        result: {
          mentionsCount: mentions.length,
          priorityReplies: analysis?.priorityReplies.length ?? 0,
          sentiment: analysis?.sentiment ?? "N/A",
        },
        brief,
        tokensUsed: this.tokensUsed,
        costUsd: this.costUsd,
      };
    } catch (error) {
      this.log(`Error: ${error}`, "error");
      return {
        status: "failed",
        error: String(error),
        tokensUsed: this.tokensUsed,
        costUsd: this.costUsd,
      };
    }
  }

  private async fetchMentions(): Promise<Tweet[]> {
    // TODO: Implement actual X API
    // For now, return mock data
    const bearerToken = process.env.X_BEARER_TOKEN;

    if (!bearerToken) {
      // Return mock data for testing
      return [
        {
          id: "1",
          text: "@you This is amazing! How did you build this?",
          author: "curious_dev",
          authorId: "123",
          createdAt: new Date().toISOString(),
          metrics: { likes: 5, retweets: 2, replies: 1 },
        },
        {
          id: "2",
          text: "@you Thanks for sharing!",
          author: "grateful_user",
          authorId: "456",
          createdAt: new Date().toISOString(),
          metrics: { likes: 12, retweets: 0, replies: 0 },
        },
      ];
    }

    // Real implementation would use X API
    return [];
  }

  private async analyzeMentions(mentions: Tweet[]): Promise<MentionAnalysis> {
    const mentionsText = mentions
      .slice(0, 20)
      .map(
        (m) =>
          `- @${m.author}: "${m.text}" (likes: ${m.metrics?.likes ?? 0})`
      )
      .join("\n");

    const prompt = `Analyze these X (Twitter) mentions and provide:
1. A brief summary of overall sentiment and themes
2. Which mentions need priority replies
3. Suggested reply drafts for priority mentions
4. Any action items

Account context: ${this.config.accountContext || "Tech content creator"}

Mentions:
${mentionsText}

Respond in JSON format with keys: summary, sentiment, priorityReplies (array), actionItems (array)`;

    const response = await this.callLLM(prompt, {
      task: "analysis",
      provider: "grok", // Grok is best for X analysis
    });

    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback
    }

    return {
      summary: response,
      sentiment: "neutral",
      priorityReplies: [],
      actionItems: [],
    };
  }

  private generateBrief(mentionsCount: number, analysis: MentionAnalysis | null): string {
    let brief = `**X Activity Summary**
- Mentions: ${mentionsCount}
- Priority replies needed: ${analysis?.priorityReplies.length ?? 0}
- Sentiment: ${analysis?.sentiment ?? "N/A"}
`;

    if (analysis?.summary) {
      brief += `\n**Summary**: ${analysis.summary}\n`;
    }

    if (analysis?.actionItems && analysis.actionItems.length > 0) {
      brief += `\n**Action items**:\n${analysis.actionItems.map((i) => `- ${i}`).join("\n")}`;
    }

    return brief;
  }
}
