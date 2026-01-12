/**
 * X Analysis Test
 *
 * Test script for the X/Twitter analysis feature.
 * This demonstrates the full flow:
 * 1. Research Agent receives X analysis task
 * 2. Delegates to X Analyst sub-agent
 * 3. Sub-agent uses Grok to fetch and analyze tweets
 * 4. Results are written to a report file
 *
 * Usage:
 *   npx tsx src/test/x-analysis.test.ts [username] [hours]
 *
 * Examples:
 *   npx tsx src/test/x-analysis.test.ts elonmusk 24
 *   npx tsx src/test/x-analysis.test.ts sama 48
 */

// Load .env from project root if DOTENV_CONFIG_PATH is set
import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH || "../../.env" });

import { ResearchAgent } from "../agents/research-agent.js";
import { registerBuiltinSkills } from "../lib/skills/index.js";

// Parse command line arguments
const username = process.argv[2] || "elonmusk";
const hours = parseInt(process.argv[3] || "24");

async function runTest() {
  console.log("═".repeat(60));
  console.log("🔭 Personal Panopticon - X Analysis Test");
  console.log("═".repeat(60));
  console.log();

  // Check environment
  console.log("📋 Environment Check:");
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "✅ Set" : "❌ Missing"}`);
  console.log(`   XAI_API_KEY: ${process.env.XAI_API_KEY ? "✅ Set" : "❌ Missing"}`);
  console.log();

  if (!process.env.XAI_API_KEY) {
    console.error("❌ XAI_API_KEY is required for X analysis");
    console.log("\nPlease set your Grok API key:");
    console.log("  export XAI_API_KEY=your-key-here");
    process.exit(1);
  }

  // Register skills
  console.log("📚 Registering skills...");
  registerBuiltinSkills();
  console.log();

  // Create and run the research agent
  const agent = new ResearchAgent();

  console.log("🚀 Starting X Analysis:");
  console.log(`   Username: @${username}`);
  console.log(`   Time Range: Past ${hours} hours`);
  console.log(`   Language: Chinese (中文)`);
  console.log();
  console.log("─".repeat(60));

  const startTime = Date.now();

  try {
    const result = await agent.run({
      triggeredBy: "manual",
      handoffData: {
        type: "x-analysis",
        username,
        hours,
        language: "zh",
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("─".repeat(60));
    console.log();
    console.log("📊 Results:");
    console.log(`   Status: ${result.status === "success" ? "✅ Success" : "❌ Failed"}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Tokens Used: ${result.tokensUsed}`);
    console.log(`   Cost: $${result.costUsd.toFixed(4)}`);
    console.log();

    if (result.status === "success" && result.result) {
      console.log("📝 Analysis Result:");
      console.log("─".repeat(40));

      const res = result.result as Record<string, unknown>;

      if (res.toolCalls) {
        console.log("\n🔧 Tool Calls:");
        (res.toolCalls as Array<{ tool: string; success: boolean }>).forEach((tc, i) => {
          console.log(`   ${i + 1}. ${tc.tool}: ${tc.success ? "✅" : "❌"}`);
        });
      }

      if (res.iterations) {
        console.log(`\n🔄 Iterations: ${res.iterations}`);
      }

      if (res.analysis) {
        console.log("\n📄 Analysis:");
        console.log(res.analysis);
      }
    } else if (result.error) {
      console.log("❌ Error:", result.error);
    }

    console.log();
    console.log("═".repeat(60));
    console.log("✨ Test completed!");
    console.log();
    console.log("📁 Check the output directory for the generated report:");
    console.log("   packages/server/output/reports/");

  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  }
}

runTest().catch(console.error);
