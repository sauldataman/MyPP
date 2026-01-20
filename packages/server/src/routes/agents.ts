/**
 * Agent API routes
 */

import { Router, type Router as RouterType } from "express";
import { prisma } from "../lib/prisma.js";
import { queueAgentRun, getQueueStats, getRecentJobs } from "../lib/queue.js";
import { getRegisteredAgents, getAgent } from "../agents/worker.js";

export const agentsRouter: RouterType = Router();

// List all agents
agentsRouter.get("/", async (req, res) => {
  try {
    const registered = getRegisteredAgents();
    const dbAgents = await prisma.agent.findMany({
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const agents = registered.map((name) => {
      const db = dbAgents.find((a) => a.name === name);
      const agent = getAgent(name);
      return {
        name,
        description: agent?.description || db?.description || "",
        enabled: db?.enabled ?? true,
        schedule: db?.schedule,
        lastRun: db?.runs[0]?.startedAt,
        lastStatus: db?.runs[0]?.status,
      };
    });

    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get agent details
agentsRouter.get("/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const agent = getAgent(name);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const dbAgent = await prisma.agent.findUnique({
      where: { name },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    res.json({
      name: agent.name,
      description: agent.description,
      enabled: dbAgent?.enabled ?? true,
      schedule: dbAgent?.schedule,
      config: dbAgent?.config || {},
      recentRuns: dbAgent?.runs.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        duration: r.duration,
        tokensUsed: r.tokensUsed,
        costUsd: r.costUsd,
        brief: r.brief,
        error: r.error,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Run agent
agentsRouter.post("/:name/run", async (req, res) => {
  try {
    const { name } = req.params;
    const { context } = req.body;

    const agent = getAgent(name);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const job = await queueAgentRun(name, {
      triggeredBy: "manual",
      context,
    });

    res.json({
      status: "queued",
      jobId: job.id,
      agent: name,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Run all agents
agentsRouter.post("/run-all", async (req, res) => {
  try {
    const registered = getRegisteredAgents();
    const jobs = await Promise.all(
      registered.map((name) =>
        queueAgentRun(name, { triggeredBy: "manual" })
      )
    );

    res.json({
      status: "queued",
      jobs: jobs.map((j) => ({ id: j.id, name: j.name })),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update agent config
agentsRouter.patch("/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { enabled, schedule, config } = req.body;

    const agent = await prisma.agent.upsert({
      where: { name },
      update: {
        enabled: enabled !== undefined ? enabled : undefined,
        schedule: schedule !== undefined ? schedule : undefined,
        config: config !== undefined ? config : undefined,
      },
      create: {
        name,
        enabled: enabled ?? true,
        schedule,
        config: config ?? {},
      },
    });

    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get agent runs history
agentsRouter.get("/:name/runs", async (req, res) => {
  try {
    const { name } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const dbAgent = await prisma.agent.findUnique({
      where: { name },
    });

    if (!dbAgent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const runs = await prisma.agentRun.findMany({
      where: { agentId: dbAgent.id },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
