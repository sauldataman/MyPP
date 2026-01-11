/**
 * Agent Worker
 *
 * Processes agent jobs from the BullMQ queue.
 */

import { Worker, Job } from "bullmq";
import { redisConnection, type AgentJobData, type AgentJobResult } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { BaseAgent, type AgentContext } from "./base-agent.js";

// Import all agents
import { XAgent } from "./x-agent.js";
import { ResearchAgent } from "./research-agent.js";
// import { FinancesAgent } from "./finances-agent.js";
// import { ContentAgent } from "./content-agent.js";
// ... add more as needed

// Agent registry
const agents: Map<string, BaseAgent> = new Map([
  ["x", new XAgent()],
  ["research", new ResearchAgent()],
  // ["finances", new FinancesAgent()],
  // ["content", new ContentAgent()],
]);

/**
 * Process an agent job
 */
async function processAgentJob(
  job: Job<AgentJobData, AgentJobResult>
): Promise<AgentJobResult> {
  const { agentName, triggeredBy, context } = job.data;
  const startTime = Date.now();

  console.log(`🤖 Processing agent job: ${agentName} (triggered by: ${triggeredBy})`);

  // Get agent
  const agent = agents.get(agentName);
  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`);
  }

  // Update job progress
  await job.updateProgress(10);

  // Create run record
  const dbAgent = await prisma.agent.upsert({
    where: { name: agentName },
    update: {},
    create: {
      name: agentName,
      description: agent.description,
    },
  });

  const run = await prisma.agentRun.create({
    data: {
      agentId: dbAgent.id,
      status: "running",
    },
  });

  try {
    await job.updateProgress(20);

    // Execute agent
    const agentContext: AgentContext = {
      triggeredBy,
      handoffData: context,
    };

    const result = await agent.run(agentContext);

    await job.updateProgress(90);

    // Update run record
    const duration = Date.now() - startTime;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        completedAt: new Date(),
        result: result.result as object,
        brief: result.brief,
        error: result.error,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        duration,
      },
    });

    await job.updateProgress(100);

    console.log(`✅ Agent job completed: ${agentName} (${duration}ms)`);

    return {
      status: result.status,
      brief: result.brief,
      error: result.error,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update run record
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: errorMessage,
        duration,
      },
    });

    console.error(`❌ Agent job failed: ${agentName}`, error);

    return {
      status: "failed",
      error: errorMessage,
      tokensUsed: 0,
      costUsd: 0,
      duration,
    };
  }
}

// Create worker
export const agentWorker = new Worker<AgentJobData, AgentJobResult>(
  "agents",
  processAgentJob,
  {
    connection: redisConnection,
    concurrency: 3, // Process up to 3 agents in parallel
  }
);

// Worker events
agentWorker.on("completed", (job, result) => {
  console.log(`📋 Job ${job.id} completed:`, result.status);
});

agentWorker.on("failed", (job, error) => {
  console.error(`💥 Job ${job?.id} failed:`, error.message);
});

agentWorker.on("error", (error) => {
  console.error("Worker error:", error);
});

/**
 * Register a new agent
 */
export function registerAgent(agent: BaseAgent) {
  agents.set(agent.name, agent);
  console.log(`📝 Registered agent: ${agent.name}`);
}

/**
 * Get list of registered agents
 */
export function getRegisteredAgents(): string[] {
  return Array.from(agents.keys());
}

/**
 * Get agent by name
 */
export function getAgent(name: string): BaseAgent | undefined {
  return agents.get(name);
}
