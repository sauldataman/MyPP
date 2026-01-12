/**
 * X API Skills
 *
 * Skills for managing your own X/Twitter account via official X API.
 * Requires X_BEARER_TOKEN or OAuth credentials.
 *
 * Use cases:
 * - Post/delete tweets from your account
 * - Get your own timeline
 * - Manage your account
 *
 * Note: This is different from Grok API which is for analyzing ANY user's tweets.
 * X API is for managing YOUR OWN account.
 */

import { z } from "zod";
import { Skill, SkillResult } from "../types.js";

// X API v2 configuration
const X_API_BASE = "https://api.twitter.com/2";
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || "";

/**
 * Helper to call X API
 */
async function callXAPI(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!X_BEARER_TOKEN) {
    return { success: false, error: "X_BEARER_TOKEN not configured" };
  }

  const { method = "GET", body, params } = options;

  let url = `${X_API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${X_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      return {
        success: false,
        error: `X API error ${response.status}: ${JSON.stringify(error)}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: `X API request failed: ${error}` };
  }
}

/**
 * Get authenticated user info
 */
export const getMyProfileSkill: Skill = {
  name: "x_get_my_profile",
  description: "Get your own X/Twitter profile information",
  inputSchema: z.object({}),
  execute: async (): Promise<SkillResult> => {
    const result = await callXAPI("/users/me", {
      params: {
        "user.fields": "description,public_metrics,created_at,profile_image_url",
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

/**
 * Get your own recent tweets
 */
export const getMyTweetsSkill: Skill = {
  name: "x_get_my_tweets",
  description: "Get your own recent tweets",
  inputSchema: z.object({
    limit: z.number().min(5).max(100).default(20).describe("Number of tweets to fetch"),
    excludeReplies: z.boolean().optional().describe("Exclude reply tweets"),
    excludeRetweets: z.boolean().optional().describe("Exclude retweets"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { limit = 20, excludeReplies = false, excludeRetweets = false } = input as {
      limit?: number;
      excludeReplies?: boolean;
      excludeRetweets?: boolean;
    };

    // First get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }

    const userId = (meResult.data as { data: { id: string } }).data.id;

    // Build exclude parameter
    const exclude: string[] = [];
    if (excludeReplies) exclude.push("replies");
    if (excludeRetweets) exclude.push("retweets");

    const result = await callXAPI(`/users/${userId}/tweets`, {
      params: {
        max_results: String(limit),
        "tweet.fields": "created_at,public_metrics,text",
        ...(exclude.length > 0 && { exclude: exclude.join(",") }),
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

/**
 * Post a new tweet
 */
export const postTweetSkill: Skill = {
  name: "x_post_tweet",
  description: "Post a new tweet from your account",
  inputSchema: z.object({
    text: z.string().max(280).describe("Tweet text (max 280 characters)"),
    replyToId: z.string().optional().describe("Tweet ID to reply to"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { text, replyToId } = input as {
      text: string;
      replyToId?: string;
    };

    const body: Record<string, unknown> = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    const result = await callXAPI("/tweets", {
      method: "POST",
      body,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        posted: true,
        tweet: result.data,
      },
    };
  },
};

/**
 * Delete a tweet
 */
export const deleteTweetSkill: Skill = {
  name: "x_delete_tweet",
  description: "Delete one of your own tweets",
  inputSchema: z.object({
    tweetId: z.string().describe("ID of the tweet to delete"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { tweetId } = input as { tweetId: string };

    const result = await callXAPI(`/tweets/${tweetId}`, {
      method: "DELETE",
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        deleted: true,
        tweetId,
      },
    };
  },
};

/**
 * Get your home timeline
 */
export const getHomeTimelineSkill: Skill = {
  name: "x_get_home_timeline",
  description: "Get tweets from your home timeline (people you follow)",
  inputSchema: z.object({
    limit: z.number().min(5).max(100).default(20).describe("Number of tweets"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { limit = 20 } = input as { limit?: number };

    // First get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }

    const userId = (meResult.data as { data: { id: string } }).data.id;

    const result = await callXAPI(`/users/${userId}/reverse_chronological_timeline`, {
      params: {
        max_results: String(limit),
        "tweet.fields": "created_at,public_metrics,author_id",
        expansions: "author_id",
        "user.fields": "username,name",
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

/**
 * Get mentions of your account
 */
export const getMyMentionsSkill: Skill = {
  name: "x_get_my_mentions",
  description: "Get tweets that mention your account",
  inputSchema: z.object({
    limit: z.number().min(5).max(100).default(20).describe("Number of mentions"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { limit = 20 } = input as { limit?: number };

    // First get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }

    const userId = (meResult.data as { data: { id: string } }).data.id;

    const result = await callXAPI(`/users/${userId}/mentions`, {
      params: {
        max_results: String(limit),
        "tweet.fields": "created_at,public_metrics,author_id",
        expansions: "author_id",
        "user.fields": "username,name",
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

/**
 * Lookup a user by username
 */
export const lookupUserSkill: Skill = {
  name: "x_lookup_user",
  description: "Look up a user by their username",
  inputSchema: z.object({
    username: z.string().describe("Username (without @)"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username } = input as { username: string };

    const result = await callXAPI(`/users/by/username/${username}`, {
      params: {
        "user.fields": "description,public_metrics,created_at,profile_image_url",
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

/**
 * Get a user's recent tweets (public)
 */
export const getUserTweetsSkill: Skill = {
  name: "x_get_user_tweets",
  description: "Get recent tweets from any public user (via X API, not Grok)",
  inputSchema: z.object({
    username: z.string().describe("Username (without @)"),
    limit: z.number().min(5).max(100).default(20).describe("Number of tweets"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, limit = 20 } = input as {
      username: string;
      limit?: number;
    };

    // First lookup the user
    const userResult = await callXAPI(`/users/by/username/${username}`);
    if (!userResult.success) {
      return { success: false, error: userResult.error };
    }

    const userId = (userResult.data as { data: { id: string } }).data.id;

    const result = await callXAPI(`/users/${userId}/tweets`, {
      params: {
        max_results: String(limit),
        "tweet.fields": "created_at,public_metrics,text",
      },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  },
};

export const xApiSkills = [
  getMyProfileSkill,
  getMyTweetsSkill,
  postTweetSkill,
  deleteTweetSkill,
  getHomeTimelineSkill,
  getMyMentionsSkill,
  lookupUserSkill,
  getUserTweetsSkill,
];
