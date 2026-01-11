/**
 * Task Queue using BullMQ
 *
 * Features:
 * - Async job execution
 * - Job retries with exponential backoff
 * - Job progress tracking
 * - Dashboard monitoring (via Bull Board)
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";

// Redis connection
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Job types
export interface AgentJobData {
  agentName: string;
  triggeredBy: "cron" | "manual" | "handoff";
  context?: Record<string, unknown>;
}

export interface AgentJobResult {
  status: "success" | "failed" | "timeout";
  brief?: string;
  error?: string;
  tokensUsed: number;
  costUsd: number;
  duration: number;
}

// Queue definitions
export const agentQueue = new Queue<AgentJobData, AgentJobResult>("agents", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
    },
  },
});

// Queue events for monitoring
export const agentQueueEvents = new QueueEvents("agents", {
  connection: redisConnection,
});

// Helper to add agent job
export async function queueAgentRun(
  agentName: string,
  options: {
    triggeredBy?: "cron" | "manual" | "handoff";
    context?: Record<string, unknown>;
    priority?: number;
    delay?: number;
  } = {}
): Promise<Job<AgentJobData, AgentJobResult>> {
  return agentQueue.add(
    `run:${agentName}`,
    {
      agentName,
      triggeredBy: options.triggeredBy || "manual",
      context: options.context,
    },
    {
      priority: options.priority,
      delay: options.delay,
    }
  );
}

// Get queue stats
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    agentQueue.getWaitingCount(),
    agentQueue.getActiveCount(),
    agentQueue.getCompletedCount(),
    agentQueue.getFailedCount(),
    agentQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

// Get recent jobs
export async function getRecentJobs(limit = 20) {
  const [waiting, active, completed, failed] = await Promise.all([
    agentQueue.getWaiting(0, limit),
    agentQueue.getActive(0, limit),
    agentQueue.getCompleted(0, limit),
    agentQueue.getFailed(0, limit),
  ]);

  return {
    waiting: waiting.map(formatJob),
    active: active.map(formatJob),
    completed: completed.map(formatJob),
    failed: failed.map(formatJob),
  };
}

function formatJob(job: Job<AgentJobData, AgentJobResult>) {
  return {
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
  };
}

// Cleanup old jobs
export async function cleanupOldJobs(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
  const grace = olderThanMs;
  await Promise.all([
    agentQueue.clean(grace, 1000, "completed"),
    agentQueue.clean(grace, 1000, "failed"),
  ]);
}
