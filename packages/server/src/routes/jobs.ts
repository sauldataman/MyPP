/**
 * Job Queue API routes
 *
 * For monitoring and managing async jobs.
 */

import { Router, type Router as RouterType } from "express";
import { getQueueStats, getRecentJobs, agentQueue } from "../lib/queue.js";
import { scheduler } from "../lib/scheduler.js";

export const jobsRouter: RouterType = Router();

// Get queue stats
jobsRouter.get("/stats", async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get recent jobs
jobsRouter.get("/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const jobs = await getRecentJobs(limit);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get job by ID
jobsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const job = await agentQueue.getJob(id);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({
      id: job.id,
      name: job.name,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      progress: job.progress,
      attempts: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      state: await job.getState(),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Retry failed job
jobsRouter.post("/:id/retry", async (req, res) => {
  try {
    const { id } = req.params;
    const job = await agentQueue.getJob(id);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    await job.retry();
    res.json({ status: "retrying", jobId: id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get scheduled jobs
jobsRouter.get("/scheduled/list", async (req, res) => {
  try {
    const status = scheduler.getStatus();
    res.json({ scheduledJobs: status });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Run scheduled job manually
jobsRouter.post("/scheduled/:name/run", async (req, res) => {
  try {
    const { name } = req.params;
    await scheduler.runNow(name);
    res.json({ status: "triggered", job: name });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
