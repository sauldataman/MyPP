/**
 * X API vs Grok Comparison Test
 *
 * This test compares two methods of getting tweet data:
 * 1. X API - Official API, structured data, rate limited
 * 2. Grok - AI-powered, real-time, more flexible analysis
 *
 * Usage:
 *   npx tsx src/test/x-comparison.test.ts [username]
 */

// Load .env from project root
import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH || "../../.env" });

import { skillRegistry, registerBuiltinSkills } from "../lib/skills/index.js";

const username = process.argv[2] || "elonmusk";

async function runComparison() {
  console.log("═".repeat(60));
  console.log("🔬 X API vs Grok Comparison Test");
  console.log("═".repeat(60));
  console.log();
  console.log(`Testing with: @${username}`);
  console.log();

  // Check environment
  const hasXApi = !!process.env.X_BEARER_TOKEN;
  const hasGrok = !!process.env.XAI_API_KEY;

  console.log("📋 API Availability:");
  console.log(`   X API (X_BEARER_TOKEN): ${hasXApi ? "✅ Available" : "❌ Missing"}`);
  console.log(`   Grok (XAI_API_KEY): ${hasGrok ? "✅ Available" : "❌ Missing"}`);
  console.log();

  if (!hasXApi && !hasGrok) {
    console.error("❌ At least one API key is required");
    process.exit(1);
  }

  // Register skills
  registerBuiltinSkills();
  console.log();

  const context = {
    agentName: "test",
    sessionId: "test-session",
    state: new Map(),
  };

  // ========================================
  // Test 1: X API - Get User Tweets
  // ========================================
  if (hasXApi) {
    console.log("─".repeat(60));
    console.log("📊 Method 1: X API (x_get_user_tweets)");
    console.log("─".repeat(60));

    const startTime = Date.now();
    const result = await skillRegistry.execute(
      "x_get_user_tweets",
      { username, limit: 10 },
      context
    );
    const duration = Date.now() - startTime;

    if (result.success) {
      const data = result.data as { data?: Array<{ text: string; created_at: string }> };
      console.log(`✅ Success (${duration}ms)`);
      console.log(`   Tweets fetched: ${data.data?.length || 0}`);
      console.log();
      console.log("   Sample tweets:");
      data.data?.slice(0, 3).forEach((tweet, i) => {
        console.log(`   ${i + 1}. ${tweet.text?.slice(0, 80)}...`);
        console.log(`      Posted: ${tweet.created_at}`);
      });
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    console.log();
  }

  // ========================================
  // Test 2: Grok - Fetch User Tweets
  // ========================================
  if (hasGrok) {
    console.log("─".repeat(60));
    console.log("🤖 Method 2: Grok (fetch_user_tweets)");
    console.log("─".repeat(60));

    const startTime = Date.now();
    const result = await skillRegistry.execute(
      "fetch_user_tweets",
      { username, hours: 24, includeReplies: false },
      context
    );
    const duration = Date.now() - startTime;

    if (result.success) {
      const data = result.data as { tweets: string };
      console.log(`✅ Success (${duration}ms)`);
      console.log();
      console.log("   Response (truncated):");
      console.log("   " + data.tweets?.slice(0, 500).replace(/\n/g, "\n   "));
      if (data.tweets?.length > 500) console.log("   ...[truncated]");
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    console.log();
  }

  // ========================================
  // Test 3: Grok - Analyze Patterns
  // ========================================
  if (hasGrok) {
    console.log("─".repeat(60));
    console.log("🧠 Method 3: Grok Analysis (analyze_tweet_patterns)");
    console.log("─".repeat(60));

    const startTime = Date.now();
    const result = await skillRegistry.execute(
      "analyze_tweet_patterns",
      { username, hours: 24, analysisType: "all" },
      context
    );
    const duration = Date.now() - startTime;

    if (result.success) {
      const data = result.data as { analysis: string };
      console.log(`✅ Success (${duration}ms)`);
      console.log();
      console.log("   Analysis (truncated):");
      console.log("   " + data.analysis?.slice(0, 800).replace(/\n/g, "\n   "));
      if (data.analysis?.length > 800) console.log("   ...[truncated]");
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    console.log();
  }

  // ========================================
  // Summary
  // ========================================
  console.log("═".repeat(60));
  console.log("📝 Comparison Summary");
  console.log("═".repeat(60));
  console.log();
  console.log("| Feature          | X API              | Grok               |");
  console.log("|------------------|--------------------|--------------------|");
  console.log("| Data Format      | Structured JSON    | Natural Language   |");
  console.log("| Real-time        | Near real-time     | Real-time          |");
  console.log("| Rate Limits      | Strict             | More flexible      |");
  console.log("| Analysis         | Raw data only      | AI-powered         |");
  console.log("| Cost             | API tier pricing   | Token-based        |");
  console.log("| Best For         | Automation, CRUD   | Analysis, Insights |");
  console.log();
  console.log("Recommendation:");
  console.log("- Use X API for: Managing your account, posting, following/unfollowing");
  console.log("- Use Grok for: Analyzing any user's content, sentiment analysis, trends");
}

runComparison().catch(console.error);
