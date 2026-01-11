/**
 * Database Skills
 *
 * Skills for interacting with the Prisma database.
 * Provides safe, read-heavy operations for agents.
 */

import { z } from "zod";
import { Skill, SkillResult } from "../types.js";
import { prisma } from "../../prisma.js";

/**
 * Query agent runs
 */
export const queryAgentRunsSkill: Skill = {
  name: "query_agent_runs",
  description: "Query agent run history from the database",
  inputSchema: z.object({
    agentName: z.string().optional().describe("Filter by agent name"),
    status: z.enum(["success", "failed", "timeout"]).optional().describe("Filter by status"),
    limit: z.number().min(1).max(100).default(20).describe("Maximum results"),
    includeResult: z.boolean().optional().describe("Include run results"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { agentName, status, limit = 20, includeResult = false } = input as {
      agentName?: string;
      status?: string;
      limit?: number;
      includeResult?: boolean;
    };

    try {
      const runs = await prisma.agentRun.findMany({
        where: {
          ...(agentName && {
            agent: { name: agentName },
          }),
          ...(status && { status }),
        },
        include: {
          agent: {
            select: { name: true },
          },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
      });

      const data = runs.map((run) => ({
        id: run.id,
        agentName: run.agent.name,
        status: run.status,
        triggeredBy: run.triggeredBy,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs: run.finishedAt
          ? run.finishedAt.getTime() - run.startedAt.getTime()
          : null,
        brief: run.brief,
        ...(includeResult && { result: run.result }),
      }));

      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

/**
 * Query handoffs
 */
export const queryHandoffsSkill: Skill = {
  name: "query_handoffs",
  description: "Query handoff messages between agents",
  inputSchema: z.object({
    toAgentName: z.string().optional().describe("Filter by recipient agent"),
    fromAgentName: z.string().optional().describe("Filter by sender agent"),
    status: z.enum(["pending", "processed", "failed"]).optional(),
    limit: z.number().min(1).max(100).default(20),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { toAgentName, fromAgentName, status, limit = 20 } = input as {
      toAgentName?: string;
      fromAgentName?: string;
      status?: string;
      limit?: number;
    };

    try {
      const handoffs = await prisma.handoff.findMany({
        where: {
          ...(toAgentName && { toAgentName }),
          ...(fromAgentName && {
            fromAgent: { name: fromAgentName },
          }),
          ...(status && { status }),
        },
        include: {
          fromAgent: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const data = handoffs.map((h) => ({
        id: h.id,
        from: h.fromAgent.name,
        to: h.toAgentName,
        type: h.type,
        status: h.status,
        payload: h.payload,
        createdAt: h.createdAt,
        processedAt: h.processedAt,
      }));

      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

/**
 * Get agent state
 */
export const getAgentStateSkill: Skill = {
  name: "get_agent_state",
  description: "Get stored state for an agent domain",
  inputSchema: z.object({
    domain: z.string().describe("Agent domain/name"),
    key: z.string().optional().describe("Specific key to retrieve"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { domain, key } = input as { domain: string; key?: string };

    try {
      if (key) {
        const state = await prisma.state.findUnique({
          where: { domain_key: { domain, key } },
        });
        return {
          success: true,
          data: state?.value ?? null,
        };
      }

      const states = await prisma.state.findMany({
        where: { domain },
      });

      const data = Object.fromEntries(
        states.map((s) => [s.key, s.value])
      );

      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

/**
 * Save agent state
 */
export const saveAgentStateSkill: Skill = {
  name: "save_agent_state",
  description: "Save state for an agent domain",
  inputSchema: z.object({
    domain: z.string().describe("Agent domain/name"),
    key: z.string().describe("State key"),
    value: z.unknown().describe("Value to store"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { domain, key, value } = input as {
      domain: string;
      key: string;
      value: unknown;
    };

    try {
      await prisma.state.upsert({
        where: { domain_key: { domain, key } },
        update: { value: value as object },
        create: { domain, key, value: value as object },
      });

      return { success: true, data: { saved: `${domain}/${key}` } };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

/**
 * Query LLM usage stats
 */
export const queryLLMUsageSkill: Skill = {
  name: "query_llm_usage",
  description: "Query LLM usage statistics",
  inputSchema: z.object({
    agentName: z.string().optional().describe("Filter by agent"),
    provider: z.string().optional().describe("Filter by provider"),
    since: z.string().optional().describe("ISO date string for start time"),
    groupBy: z.enum(["provider", "agent", "model"]).optional(),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { agentName, provider, since, groupBy } = input as {
      agentName?: string;
      provider?: string;
      since?: string;
      groupBy?: string;
    };

    try {
      const where = {
        ...(agentName && { agentName }),
        ...(provider && { provider }),
        ...(since && { createdAt: { gte: new Date(since) } }),
      };

      if (groupBy) {
        const usage = await prisma.lLMUsage.groupBy({
          by: [groupBy as "provider" | "agentName" | "model"],
          where,
          _sum: {
            inputTokens: true,
            outputTokens: true,
            costUsd: true,
          },
          _count: true,
        });

        return { success: true, data: usage };
      }

      // Get totals
      const totals = await prisma.lLMUsage.aggregate({
        where,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
        },
        _count: true,
      });

      return {
        success: true,
        data: {
          calls: totals._count,
          inputTokens: totals._sum.inputTokens || 0,
          outputTokens: totals._sum.outputTokens || 0,
          totalTokens: (totals._sum.inputTokens || 0) + (totals._sum.outputTokens || 0),
          costUsd: totals._sum.costUsd || 0,
        },
      };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

/**
 * Get recent briefs
 */
export const getRecentBriefsSkill: Skill = {
  name: "get_recent_briefs",
  description: "Get recent daily briefs",
  inputSchema: z.object({
    days: z.number().min(1).max(30).default(7).describe("Number of days"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { days = 7 } = input as { days?: number };

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const briefs = await prisma.brief.findMany({
        where: {
          date: { gte: since },
        },
        orderBy: { date: "desc" },
      });

      return { success: true, data: briefs };
    } catch (error) {
      return { success: false, error: `Database error: ${error}` };
    }
  },
};

export const databaseSkills = [
  queryAgentRunsSkill,
  queryHandoffsSkill,
  getAgentStateSkill,
  saveAgentStateSkill,
  queryLLMUsageSkill,
  getRecentBriefsSkill,
];
