/**
 * Cron Scheduler
 *
 * Manages scheduled jobs:
 * - Agent runs on schedule
 * - Daily brief generation
 * - Cleanup tasks
 */

import cron, { ScheduledTask } from "node-cron";
import { queueAgentRun } from "./queue.js";
import { prisma } from "./prisma.js";

interface ScheduledJob {
  name: string;
  schedule: string; // Cron expression
  handler: () => Promise<void>;
  task?: ScheduledTask;
}

class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private started = false;

  /**
   * Register a job
   */
  register(name: string, schedule: string, handler: () => Promise<void>) {
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression for job ${name}: ${schedule}`);
    }

    this.jobs.set(name, { name, schedule, handler });
    console.log(`📅 Registered job: ${name} (${schedule})`);
  }

  /**
   * Start all registered jobs
   */
  start() {
    if (this.started) return;

    for (const [name, job] of this.jobs) {
      job.task = cron.schedule(job.schedule, async () => {
        console.log(`⏰ Running scheduled job: ${name}`);
        try {
          await job.handler();
          console.log(`✅ Job completed: ${name}`);
        } catch (error) {
          console.error(`❌ Job failed: ${name}`, error);
        }
      });
    }

    this.started = true;
    console.log(`🚀 Scheduler started with ${this.jobs.size} jobs`);
  }

  /**
   * Stop all jobs
   */
  stop() {
    for (const [_, job] of this.jobs) {
      job.task?.stop();
    }
    this.started = false;
    console.log("🛑 Scheduler stopped");
  }

  /**
   * Get job status
   */
  getStatus() {
    return Array.from(this.jobs.values()).map((job) => ({
      name: job.name,
      schedule: job.schedule,
      running: job.task?.running ?? false,
    }));
  }

  /**
   * Run a job manually
   */
  async runNow(name: string) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }
    await job.handler();
  }
}

export const scheduler = new Scheduler();

// ============================================================================
// Default scheduled jobs
// ============================================================================

/**
 * Initialize default jobs based on agent configurations
 */
export async function initializeScheduledJobs() {
  // Load agents with schedules from database
  try {
    const agents = await prisma.agent.findMany({
      where: {
        enabled: true,
        schedule: { not: null },
      },
    });

    for (const agent of agents) {
      if (agent.schedule) {
        scheduler.register(`agent:${agent.name}`, agent.schedule, async () => {
          await queueAgentRun(agent.name, { triggeredBy: "cron" });
        });
      }
    }
  } catch (error) {
    console.warn("Could not load agents from database:", error);
  }

  // Daily brief generation - every day at 7 AM
  scheduler.register("daily-brief", "0 7 * * *", async () => {
    // Queue brief generation
    console.log("Generating daily brief...");
    // This would aggregate results from all agents
  });

  // Cleanup old jobs - every day at 3 AM
  scheduler.register("cleanup", "0 3 * * *", async () => {
    const { cleanupOldJobs } = await import("./queue.js");
    await cleanupOldJobs();
    console.log("Cleaned up old jobs");
  });

  // Health check - every 5 minutes
  scheduler.register("health-check", "*/5 * * * *", async () => {
    // Check queue health, database connection, etc.
    const { getQueueStats } = await import("./queue.js");
    const stats = await getQueueStats();
    if (stats.failed > 10) {
      console.warn(`⚠️ High failure rate: ${stats.failed} failed jobs`);
    }
  });
}

// ============================================================================
// Cron expression helpers
// ============================================================================

export const CronPresets = {
  EVERY_MINUTE: "* * * * *",
  EVERY_5_MINUTES: "*/5 * * * *",
  EVERY_15_MINUTES: "*/15 * * * *",
  EVERY_30_MINUTES: "*/30 * * * *",
  EVERY_HOUR: "0 * * * *",
  EVERY_2_HOURS: "0 */2 * * *",
  EVERY_6_HOURS: "0 */6 * * *",
  DAILY_6AM: "0 6 * * *",
  DAILY_7AM: "0 7 * * *",
  DAILY_9AM: "0 9 * * *",
  DAILY_10PM: "0 22 * * *",
  WEEKLY_MONDAY: "0 9 * * 1",
} as const;

/**
 * Parse a human-readable schedule into a cron expression
 */
export function parseSchedule(input: string): string {
  const presets: Record<string, string> = {
    "every minute": CronPresets.EVERY_MINUTE,
    "every 5 minutes": CronPresets.EVERY_5_MINUTES,
    "every 15 minutes": CronPresets.EVERY_15_MINUTES,
    "every 30 minutes": CronPresets.EVERY_30_MINUTES,
    "every hour": CronPresets.EVERY_HOUR,
    hourly: CronPresets.EVERY_HOUR,
    "every 2 hours": CronPresets.EVERY_2_HOURS,
    "every 6 hours": CronPresets.EVERY_6_HOURS,
    daily: CronPresets.DAILY_7AM,
    "daily 6am": CronPresets.DAILY_6AM,
    "daily 7am": CronPresets.DAILY_7AM,
    "daily 9am": CronPresets.DAILY_9AM,
    "daily 10pm": CronPresets.DAILY_10PM,
    "weekly monday": CronPresets.WEEKLY_MONDAY,
  };

  const normalized = input.toLowerCase().trim();
  return presets[normalized] || input; // Return as-is if not a preset
}
