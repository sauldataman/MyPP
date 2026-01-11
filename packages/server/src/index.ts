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
