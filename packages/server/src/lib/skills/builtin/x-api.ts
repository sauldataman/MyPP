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

/**
 * Get your following list (people you follow)
 */
export const getMyFollowingSkill: Skill = {
  name: "x_get_my_following",
  description: "Get list of users you are following",
  inputSchema: z.object({
    limit: z.number().min(1).max(1000).default(100).describe("Number of users to fetch"),
    paginationToken: z.string().optional().describe("Token for pagination"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { limit = 100, paginationToken } = input as {
      limit?: number;
      paginationToken?: string;
    };

    // First get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }

    const userId = (meResult.data as { data: { id: string } }).data.id;

    const params: Record<string, string> = {
      max_results: String(Math.min(limit, 1000)),
      "user.fields": "description,public_metrics,created_at,profile_image_url,username",
    };

    if (paginationToken) {
      params.pagination_token = paginationToken;
    }

    const result = await callXAPI(`/users/${userId}/following`, { params });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const data = result.data as {
      data: Array<{ id: string; username: string; name: string }>;
      meta?: { next_token?: string; result_count: number };
    };

    return {
      success: true,
      data: {
        following: data.data || [],
        count: data.meta?.result_count || 0,
        nextToken: data.meta?.next_token,
        hasMore: !!data.meta?.next_token,
      },
    };
  },
};

/**
 * Get your followers list
 */
export const getMyFollowersSkill: Skill = {
  name: "x_get_my_followers",
  description: "Get list of users following you",
  inputSchema: z.object({
    limit: z.number().min(1).max(1000).default(100).describe("Number of users to fetch"),
    paginationToken: z.string().optional().describe("Token for pagination"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { limit = 100, paginationToken } = input as {
      limit?: number;
      paginationToken?: string;
    };

    // First get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }

    const userId = (meResult.data as { data: { id: string } }).data.id;

    const params: Record<string, string> = {
      max_results: String(Math.min(limit, 1000)),
      "user.fields": "description,public_metrics,created_at,profile_image_url,username",
    };

    if (paginationToken) {
      params.pagination_token = paginationToken;
    }

    const result = await callXAPI(`/users/${userId}/followers`, { params });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const data = result.data as {
      data: Array<{ id: string; username: string; name: string }>;
      meta?: { next_token?: string; result_count: number };
    };

    return {
      success: true,
      data: {
        followers: data.data || [],
        count: data.meta?.result_count || 0,
        nextToken: data.meta?.next_token,
        hasMore: !!data.meta?.next_token,
      },
    };
  },
};

/**
 * Follow a user
 */
export const followUserSkill: Skill = {
  name: "x_follow_user",
  description: "Follow a user by their username or ID",
  inputSchema: z.object({
    username: z.string().optional().describe("Username to follow (without @)"),
    userId: z.string().optional().describe("User ID to follow"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, userId } = input as {
      username?: string;
      userId?: string;
    };

    if (!username && !userId) {
      return { success: false, error: "Either username or userId is required" };
    }

    // Get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }
    const myUserId = (meResult.data as { data: { id: string } }).data.id;

    // Get target user ID if username provided
    let targetUserId = userId;
    if (username && !targetUserId) {
      const userResult = await callXAPI(`/users/by/username/${username}`);
      if (!userResult.success) {
        return { success: false, error: userResult.error };
      }
      targetUserId = (userResult.data as { data: { id: string } }).data.id;
    }

    // Follow the user
    const result = await callXAPI(`/users/${myUserId}/following`, {
      method: "POST",
      body: { target_user_id: targetUserId },
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        followed: true,
        username,
        userId: targetUserId,
      },
    };
  },
};

/**
 * Unfollow a user
 */
export const unfollowUserSkill: Skill = {
  name: "x_unfollow_user",
  description: "Unfollow a user by their username or ID",
  inputSchema: z.object({
    username: z.string().optional().describe("Username to unfollow (without @)"),
    userId: z.string().optional().describe("User ID to unfollow"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { username, userId } = input as {
      username?: string;
      userId?: string;
    };

    if (!username && !userId) {
      return { success: false, error: "Either username or userId is required" };
    }

    // Get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }
    const myUserId = (meResult.data as { data: { id: string } }).data.id;

    // Get target user ID if username provided
    let targetUserId = userId;
    let targetUsername = username;
    if (username && !targetUserId) {
      const userResult = await callXAPI(`/users/by/username/${username}`);
      if (!userResult.success) {
        return { success: false, error: userResult.error };
      }
      targetUserId = (userResult.data as { data: { id: string } }).data.id;
    }

    // Unfollow the user
    const result = await callXAPI(`/users/${myUserId}/following/${targetUserId}`, {
      method: "DELETE",
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: {
        unfollowed: true,
        username: targetUsername,
        userId: targetUserId,
      },
    };
  },
};

/**
 * Batch unfollow multiple users
 */
export const batchUnfollowSkill: Skill = {
  name: "x_batch_unfollow",
  description: "Unfollow multiple users at once. Use with caution - respects rate limits.",
  inputSchema: z.object({
    usernames: z.array(z.string()).optional().describe("List of usernames to unfollow"),
    userIds: z.array(z.string()).optional().describe("List of user IDs to unfollow"),
    delayMs: z.number().min(1000).default(2000).describe("Delay between unfollows (ms) to respect rate limits"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { usernames = [], userIds = [], delayMs = 2000 } = input as {
      usernames?: string[];
      userIds?: string[];
      delayMs?: number;
    };

    if (usernames.length === 0 && userIds.length === 0) {
      return { success: false, error: "Provide usernames or userIds to unfollow" };
    }

    // Get my user ID
    const meResult = await callXAPI("/users/me");
    if (!meResult.success) {
      return { success: false, error: meResult.error };
    }
    const myUserId = (meResult.data as { data: { id: string } }).data.id;

    const results: Array<{ username?: string; userId: string; success: boolean; error?: string }> = [];

    // Process usernames first - need to lookup IDs
    for (const username of usernames) {
      const userResult = await callXAPI(`/users/by/username/${username}`);
      if (!userResult.success) {
        results.push({ username, userId: "", success: false, error: userResult.error });
        continue;
      }

      const targetUserId = (userResult.data as { data: { id: string } }).data.id;

      const unfollowResult = await callXAPI(`/users/${myUserId}/following/${targetUserId}`, {
        method: "DELETE",
      });

      results.push({
        username,
        userId: targetUserId,
        success: unfollowResult.success,
        error: unfollowResult.error,
      });

      // Rate limit delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Process user IDs
    for (const targetUserId of userIds) {
      const unfollowResult = await callXAPI(`/users/${myUserId}/following/${targetUserId}`, {
        method: "DELETE",
      });

      results.push({
        userId: targetUserId,
        success: unfollowResult.success,
        error: unfollowResult.error,
      });

      // Rate limit delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return {
      success: true,
      data: {
        total: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
      },
    };
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
  getMyFollowingSkill,
  getMyFollowersSkill,
  followUserSkill,
  unfollowUserSkill,
  batchUnfollowSkill,
];
