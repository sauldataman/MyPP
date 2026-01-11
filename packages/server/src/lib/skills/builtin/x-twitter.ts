/**
 * X/Twitter Skills
 *
 * Skills for interacting with X/Twitter using Grok API.
 * Grok has special capabilities for X data analysis.
 */

import { z } from "zod";
import { Skill, SkillResult } from "../types.js";

// Grok API configuration
const GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_API_KEY = process.env.XAI_API_KEY || "";

/**
 * Helper to call Grok API
 */
async function callGrok(
  prompt: string,
  options: { model?: string; temperature?: number } = {}
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!GROK_API_KEY) {
    return { success: false, error: "XAI_API_KEY not configured" };
  }

  try {
    const response = await fetch(GROK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: options.model || "grok-2-latest",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant with access to real-time X/Twitter data. " +
              "Provide accurate, factual information about tweets and users.",
          },
          { role: "user", content: prompt },
        ],
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Grok API error: ${response.status} ${error}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return { success: true, content };
  } catch (error) {
    return { success: false, error: `Grok request failed: ${error}` };
  }
}

/**
 * Fetch recent tweets from a user
 */
export const fetchUserTweetsSkill: Skill = {
  name: "fetch_user_tweets",
  description:
    "Fetch recent tweets from a specific X/Twitter user. Uses Grok's real-time X data access.",
  inputSchema: z.object({
    username: z.string().describe("X/Twitter username (without @)"),
    hours: z.number().min(1).max(168).default(24).describe("Hours to look back (max 168 = 7 days)"),
    includeReplies: z.boolean().optional().describe("Include reply tweets"),
    includeRetweets: z.boolean().optional().describe("Include retweets"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, hours = 24, includeReplies = false, includeRetweets = false } = input as {
      username: string;
      hours?: number;
      includeReplies?: boolean;
      includeRetweets?: boolean;
    };

    const prompt = `Please retrieve the tweets from @${username} from the past ${hours} hours.

Requirements:
- ${includeReplies ? "Include" : "Exclude"} reply tweets
- ${includeRetweets ? "Include" : "Exclude"} retweets
- For each tweet, provide:
  1. Tweet text (full content)
  2. Timestamp
  3. Engagement metrics (likes, retweets, replies) if available
  4. Any media attachments (describe them)

Format the output as a structured list. If no tweets are found, indicate that clearly.`;

    const result = await callGrok(prompt);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        username,
        timeRange: `${hours} hours`,
        tweets: result.content,
      },
    };
  },
};

/**
 * Analyze a user's tweet patterns and themes
 */
export const analyzeTweetPatternsSkill: Skill = {
  name: "analyze_tweet_patterns",
  description:
    "Analyze patterns in a user's recent tweets - topics, sentiment, engagement patterns.",
  inputSchema: z.object({
    username: z.string().describe("X/Twitter username (without @)"),
    hours: z.number().min(1).max(168).default(24).describe("Hours to analyze"),
    analysisType: z
      .enum(["topics", "sentiment", "engagement", "all"])
      .default("all")
      .describe("Type of analysis"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, hours = 24, analysisType = "all" } = input as {
      username: string;
      hours?: number;
      analysisType?: string;
    };

    let analysisPrompt = `Analyze the tweets from @${username} over the past ${hours} hours.\n\n`;

    if (analysisType === "all" || analysisType === "topics") {
      analysisPrompt += `## Topics Analysis
- What are the main topics/themes they tweeted about?
- Any recurring subjects or interests?
- Key hashtags used?\n\n`;
    }

    if (analysisType === "all" || analysisType === "sentiment") {
      analysisPrompt += `## Sentiment Analysis
- Overall emotional tone (positive/negative/neutral)
- Any notable mood shifts?
- Tone of engagement with others?\n\n`;
    }

    if (analysisType === "all" || analysisType === "engagement") {
      analysisPrompt += `## Engagement Analysis
- Which tweets got the most engagement?
- Posting frequency and timing patterns
- Interaction patterns with other users?\n\n`;
    }

    analysisPrompt += `Provide concrete examples from their tweets to support your analysis.`;

    const result = await callGrok(analysisPrompt);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        username,
        timeRange: `${hours} hours`,
        analysisType,
        analysis: result.content,
      },
    };
  },
};

/**
 * Generate a summary report of a user's Twitter activity
 */
export const generateTweetSummarySkill: Skill = {
  name: "generate_tweet_summary",
  description:
    "Generate a comprehensive summary report of a user's recent Twitter activity.",
  inputSchema: z.object({
    username: z.string().describe("X/Twitter username (without @)"),
    hours: z.number().min(1).max(168).default(24).describe("Hours to summarize"),
    format: z
      .enum(["brief", "detailed", "executive"])
      .default("detailed")
      .describe("Summary format"),
    language: z.string().default("en").describe("Output language (e.g., 'en', 'zh')"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, hours = 24, format = "detailed", language = "en" } = input as {
      username: string;
      hours?: number;
      format?: string;
      language?: string;
    };

    const formatInstructions = {
      brief: "Provide a 2-3 paragraph summary highlighting only the most important points.",
      detailed:
        "Provide a comprehensive summary with sections for: Overview, Key Topics, Notable Tweets, Engagement Highlights, and Observations.",
      executive:
        "Provide an executive summary suitable for a busy reader: key takeaways in bullet points, followed by a brief analysis.",
    };

    const prompt = `Generate a ${format} summary of @${username}'s Twitter activity over the past ${hours} hours.

${formatInstructions[format as keyof typeof formatInstructions]}

${language !== "en" ? `Please write the summary in ${language}.` : ""}

Include:
1. Activity overview (number of tweets, main activity periods)
2. Key topics and themes discussed
3. Most impactful/notable tweets
4. Overall sentiment and tone
5. Any significant interactions or conversations

Make the summary actionable and insightful.`;

    const result = await callGrok(prompt);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        username,
        timeRange: `${hours} hours`,
        format,
        summary: result.content,
        generatedAt: new Date().toISOString(),
      },
    };
  },
};

/**
 * Search for tweets about a topic from a specific user
 */
export const searchUserTweetsSkill: Skill = {
  name: "search_user_tweets",
  description: "Search a user's tweets for specific topics or keywords.",
  inputSchema: z.object({
    username: z.string().describe("X/Twitter username (without @)"),
    query: z.string().describe("Search query/topic"),
    hours: z.number().min(1).max(168).default(72).describe("Hours to search"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, query, hours = 72 } = input as {
      username: string;
      query: string;
      hours?: number;
    };

    const prompt = `Search @${username}'s tweets from the past ${hours} hours for content related to: "${query}"

For each relevant tweet found:
1. Quote the tweet text
2. Explain why it's relevant to the query
3. Provide the approximate timestamp
4. Note any engagement metrics

If no relevant tweets are found, indicate that clearly.`;

    const result = await callGrok(prompt);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        username,
        query,
        timeRange: `${hours} hours`,
        results: result.content,
      },
    };
  },
};

export const xTwitterSkills = [
  fetchUserTweetsSkill,
  analyzeTweetPatternsSkill,
  generateTweetSummarySkill,
  searchUserTweetsSkill,
];
