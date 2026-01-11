/**
 * Personal Panopticon Server
 *
 * Main entry point.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";

import { prisma } from "./lib/prisma.js";
import { getLLMRouter } from "./lib/llm-router.js";
import { scheduler, initializeScheduledJobs } from "./lib/scheduler.js";
import { getQueueStats } from "./lib/queue.js";
import { registerBuiltinSkills, skillRegistry } from "./lib/skills/index.js";
import { getSubAgentManager } from "./lib/subagent-manager.js";

// Import routes
import { agentsRouter } from "./routes/agents.js";
import { jobsRouter } from "./routes/jobs.js";

// Import worker (starts processing jobs)
import "./agents/worker.js";

const app = express();
const PORT = parseInt(process.env.PORT || "8000");

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// Routes
// ============================================================================

// Health check
app.get("/", async (req, res) => {
  res.json({
    status: "ok",
    service: "panopticon",
    time: new Date().toISOString(),
  });
});

// System status
app.get("/status", async (req, res) => {
  try {
    const llm = getLLMRouter();
    const queueStats = await getQueueStats();
    const schedulerStatus = scheduler.getStatus();

    res.json({
      env: process.env.NODE_ENV || "development",
      llmProviders: llm.getAvailableProviders(),
      queue: queueStats,
      scheduler: {
        jobs: schedulerStatus.length,
        running: schedulerStatus.filter((j) => j.running).length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// LLM stats
app.get("/llm/stats", (req, res) => {
  const llm = getLLMRouter();
  res.json(llm.getStats());
});

// LLM providers
app.get("/llm/providers", (req, res) => {
  const llm = getLLMRouter();
  res.json({ providers: llm.getAvailableProviders() });
});

// Direct LLM chat (for testing)
app.post("/llm/chat", async (req, res) => {
  try {
    const { prompt, system, task, provider } = req.body;
    const llm = getLLMRouter();

    const response = await llm.chat(prompt, { system, task, provider });

    res.json({
      content: response.content,
      provider: response.provider,
      model: response.model,
      tokens: response.inputTokens + response.outputTokens,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Briefs
app.get("/briefs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 7;
    const briefs = await prisma.brief.findMany({
      orderBy: { date: "desc" },
      take: limit,
    });
    res.json({ briefs });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/briefs/:date", async (req, res) => {
  try {
    const { date } = req.params;
    const brief = await prisma.brief.findUnique({
      where: { date },
    });

    if (!brief) {
      return res.status(404).json({ error: "Brief not found" });
    }

    res.json(brief);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Mount routers
app.use("/agents", agentsRouter);
app.use("/jobs", jobsRouter);

// ============================================================================
// Skills & Sub-agent Routes
// ============================================================================

// List all registered skills
app.get("/skills", (req, res) => {
  const skills = skillRegistry.getAll().map((s) => ({
    name: s.name,
    description: s.description,
  }));
  res.json({ skills, count: skills.length });
});

// Check sub-agent availability
app.get("/subagent/status", (req, res) => {
  const manager = getSubAgentManager();
  res.json({
    available: manager.isAvailable(),
    skillCount: skillRegistry.list().length,
  });
});

// Run a sub-agent task (for testing)
app.post("/subagent/run", async (req, res) => {
  try {
    const { name, description, skills, task, systemPrompt } = req.body;

    if (!task) {
      return res.status(400).json({ error: "task is required" });
    }

    const manager = getSubAgentManager();
    if (!manager.isAvailable()) {
      return res.status(503).json({ error: "Claude API not configured" });
    }

    const result = await manager.runSubAgent(
      {
        name: name || "test-agent",
        description: description || "Test agent",
        skills: skills || skillRegistry.list(),
        systemPrompt,
      },
      task
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// Start server
// ============================================================================

async function start() {
  console.log("🔭 Starting Personal Panopticon Server...\n");

  // Check database connection
  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }

  // Check LLM providers
  const llm = getLLMRouter();
  const providers = llm.getAvailableProviders();
  console.log(`✅ LLM providers available: ${providers.join(", ") || "none"}`);

  // Register built-in skills
  registerBuiltinSkills();
  console.log(`✅ Skills registered: ${skillRegistry.list().join(", ")}`);

  // Check sub-agent availability
  const subAgentManager = getSubAgentManager();
  if (subAgentManager.isAvailable()) {
    console.log("✅ Claude sub-agent support available");
  } else {
    console.log("⚠️  Claude sub-agent not available (missing ANTHROPIC_API_KEY)");
  }

  // Initialize scheduled jobs
  await initializeScheduledJobs();

  // Start scheduler
  scheduler.start();

  // Start server
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down...");
  scheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});

start().catch(console.error);
