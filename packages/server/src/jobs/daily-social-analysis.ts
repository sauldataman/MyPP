/**
 * Daily Social Media Analysis Job
 *
 * Fetches tweets from watchlist accounts and analyzes them using Grok API.
 * Designed to run as a daily cron job.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "../../../../");

// Grok API configuration
const GROK_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || "";
const GROK_API_BASE = "https://api.x.ai/v1";

interface WatchlistAccount {
  username: string;
  enabled: boolean;
  notes?: string;
}

interface WatchlistConfig {
  name: string;
  description: string;
  settings: {
    hoursLookback: number;
    maxPostsPerUser: number;
    promptTemplate: string;
    outputDir: string;
  };
  accounts: WatchlistAccount[];
}

interface Tweet {
  username: string;
  text: string;
  timestamp?: string;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
  };
}

/**
 * Load watchlist configuration
 */
function loadWatchlist(): WatchlistConfig {
  const configPath = join(PROJECT_ROOT, "config/watchlist.json");
  const content = readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load prompt template (strips frontmatter if present)
 */
function loadPromptTemplate(templateName: string): string {
  const promptPath = join(PROJECT_ROOT, "prompts", templateName);
  const content = readFileSync(promptPath, "utf-8");

  // Strip frontmatter if present (content between --- markers at start)
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
  return content.replace(frontmatterRegex, "").trim();
}

/**
 * Fetch tweets from a user using Grok API
 */
async function fetchUserTweets(
  username: string,
  hoursLookback: number,
  maxPosts: number
): Promise<Tweet[]> {
  if (!GROK_API_KEY) {
    throw new Error("GROK_API_KEY or XAI_API_KEY is required");
  }

  const prompt = `Get the most recent tweets from @${username} from the past ${hoursLookback} hours.
Return up to ${maxPosts} tweets.
For each tweet, provide:
- The full tweet text
- Approximate engagement metrics if visible (likes, retweets, replies)

Format the response as a JSON array:
[
  {
    "text": "tweet content here",
    "likes": 123,
    "retweets": 45,
    "replies": 12
  }
]

Only return the JSON array, no other text.`;

  try {
    const response = await fetch(`${GROK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-latest",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant with real-time access to X/Twitter data. Return data in the exact JSON format requested.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to fetch tweets for @${username}:`, error);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Extract JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`No valid JSON found for @${username}`);
      return [];
    }

    const tweets = JSON.parse(jsonMatch[0]);
    return tweets.map((t: { text: string; likes?: number; retweets?: number; replies?: number }) => ({
      username,
      text: t.text,
      metrics: {
        likes: t.likes,
        retweets: t.retweets,
        replies: t.replies,
      },
    }));
  } catch (error) {
    console.error(`Error fetching tweets for @${username}:`, error);
    return [];
  }
}

/**
 * Analyze tweets using Grok API
 */
async function analyzeTweets(tweets: Tweet[], promptTemplate: string): Promise<string> {
  if (!GROK_API_KEY) {
    throw new Error("GROK_API_KEY or XAI_API_KEY is required");
  }

  // Format tweets for the prompt
  const formattedPosts = tweets
    .map((t, i) => {
      const metrics = t.metrics
        ? ` [Likes: ${t.metrics.likes || "N/A"}, RTs: ${t.metrics.retweets || "N/A"}, Replies: ${t.metrics.replies || "N/A"}]`
        : "";
      return `**Post ${i + 1} (@${t.username}):**${metrics}\n${t.text}`;
    })
    .join("\n\n---\n\n");

  const usernames = [...new Set(tweets.map((t) => t.username))].join(", ");
  const date = new Date().toISOString().split("T")[0];

  // Replace variables in prompt template
  let prompt = promptTemplate
    .replace(/\{\{posts\}\}/g, formattedPosts)
    .replace(/\{\{usernames\}\}/g, usernames)
    .replace(/\{\{date\}\}/g, date);

  try {
    const response = await fetch(`${GROK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-latest",
        messages: [
          {
            role: "system",
            content:
              "You are an expert social media analyst and copywriting coach. Provide detailed, actionable insights.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Analysis failed: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Analysis failed - no content returned";
  } catch (error) {
    throw new Error(`Analysis error: ${error}`);
  }
}

/**
 * Save report to file
 */
function saveReport(content: string, outputDir: string, usernames: string[]): string {
  const fullOutputDir = join(PROJECT_ROOT, outputDir);
  if (!existsSync(fullOutputDir)) {
    mkdirSync(fullOutputDir, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0];
  const time = new Date().toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
  const filename = `analysis-${date}-${time}.md`;
  const filepath = join(fullOutputDir, filename);

  const report = `# Daily Social Media Analysis Report

**Date:** ${date}
**Accounts Analyzed:** ${usernames.join(", ")}
**Generated:** ${new Date().toISOString()}

---

${content}
`;

  writeFileSync(filepath, report);
  return filepath;
}

/**
 * Main execution
 */
async function main() {
  console.log("═".repeat(60));
  console.log("📊 Daily Social Media Analysis");
  console.log("═".repeat(60));
  console.log();

  // Check API key
  if (!GROK_API_KEY) {
    console.error("❌ GROK_API_KEY or XAI_API_KEY environment variable is required");
    process.exit(1);
  }

  // Load configuration
  console.log("📋 Loading watchlist...");
  const watchlist = loadWatchlist();
  const enabledAccounts = watchlist.accounts.filter((a) => a.enabled);

  if (enabledAccounts.length === 0) {
    console.log("⚠️  No enabled accounts in watchlist");
    process.exit(0);
  }

  console.log(`   Found ${enabledAccounts.length} accounts to analyze`);
  enabledAccounts.forEach((a) => console.log(`   • @${a.username}`));
  console.log();

  // Load prompt template
  console.log("📝 Loading prompt template...");
  const promptTemplate = loadPromptTemplate(watchlist.settings.promptTemplate);
  console.log(`   Using: ${watchlist.settings.promptTemplate}`);
  console.log();

  // Fetch tweets from each account
  console.log("📥 Fetching tweets...");
  const allTweets: Tweet[] = [];

  for (const account of enabledAccounts) {
    process.stdout.write(`   @${account.username}... `);
    const tweets = await fetchUserTweets(
      account.username,
      watchlist.settings.hoursLookback,
      watchlist.settings.maxPostsPerUser
    );
    console.log(`${tweets.length} tweets`);
    allTweets.push(...tweets);
  }

  if (allTweets.length === 0) {
    console.log("\n⚠️  No tweets found in the specified time period");
    process.exit(0);
  }

  console.log(`\n📊 Total tweets collected: ${allTweets.length}`);
  console.log();

  // Analyze tweets
  console.log("🔍 Analyzing tweets with Grok...");
  const analysis = await analyzeTweets(allTweets, promptTemplate);
  console.log("   Analysis complete!");
  console.log();

  // Save report
  console.log("💾 Saving report...");
  const usernames = enabledAccounts.map((a) => `@${a.username}`);
  const reportPath = saveReport(analysis, watchlist.settings.outputDir, usernames);
  console.log(`   Saved to: ${reportPath}`);
  console.log();

  console.log("═".repeat(60));
  console.log("✅ Daily analysis complete!");
  console.log("═".repeat(60));
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
