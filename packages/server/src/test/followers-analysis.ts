/**
 * Followers Analysis Tool
 *
 * Fetches all your followers and provides:
 * 1. Complete list with details
 * 2. Statistics and analysis
 * 3. Filtering options
 *
 * Usage:
 *   npx tsx src/test/followers-analysis.ts [--export csv|json] [--filter inactive|low-followers]
 */

// Load .env from project root
import { config } from "dotenv";
config({ path: process.env.DOTENV_CONFIG_PATH || "../../.env" });

import { skillRegistry, registerBuiltinSkills } from "../lib/skills/index.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../../output/followers");

// Parse command line arguments
const args = process.argv.slice(2);
const exportFormat = args.includes("--export")
  ? args[args.indexOf("--export") + 1]
  : "json";
const filterType = args.includes("--filter")
  ? args[args.indexOf("--filter") + 1]
  : null;

interface Follower {
  id: string;
  username: string;
  name: string;
  description?: string;
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
  created_at?: string;
  profile_image_url?: string;
}

interface FollowerStats {
  total: number;
  avgFollowers: number;
  avgFollowing: number;
  avgTweets: number;
  verified: number;
  inactive: number; // < 10 tweets
  lowFollowers: number; // < 100 followers
  highFollowers: number; // > 10000 followers
  oldAccounts: number; // > 2 years
  newAccounts: number; // < 6 months
}

async function fetchAllFollowers(): Promise<Follower[]> {
  const context = {
    agentName: "followers-analysis",
    sessionId: "analysis-session",
    state: new Map(),
  };

  const allFollowers: Follower[] = [];
  let paginationToken: string | undefined;
  let page = 1;

  console.log("📥 Fetching followers...");

  while (true) {
    process.stdout.write(`   Page ${page}...`);

    const result = await skillRegistry.execute(
      "x_get_my_followers",
      { limit: 1000, paginationToken },
      context
    );

    if (!result.success) {
      console.log(` ❌ Error: ${result.error}`);
      break;
    }

    const data = result.data as {
      followers: Array<{
        id: string;
        username: string;
        name: string;
        description?: string;
        public_metrics?: {
          followers_count: number;
          following_count: number;
          tweet_count: number;
        };
        created_at?: string;
        profile_image_url?: string;
      }>;
      nextToken?: string;
      hasMore: boolean;
    };

    const followers = data.followers.map((f) => ({
      id: f.id,
      username: f.username,
      name: f.name,
      description: f.description,
      followers_count: f.public_metrics?.followers_count,
      following_count: f.public_metrics?.following_count,
      tweet_count: f.public_metrics?.tweet_count,
      created_at: f.created_at,
      profile_image_url: f.profile_image_url,
    }));

    allFollowers.push(...followers);
    console.log(` ✅ Got ${followers.length} (Total: ${allFollowers.length})`);

    if (!data.hasMore || !data.nextToken) {
      break;
    }

    paginationToken = data.nextToken;
    page++;

    // Rate limit protection
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return allFollowers;
}

function calculateStats(followers: Follower[]): FollowerStats {
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

  const stats: FollowerStats = {
    total: followers.length,
    avgFollowers: 0,
    avgFollowing: 0,
    avgTweets: 0,
    verified: 0,
    inactive: 0,
    lowFollowers: 0,
    highFollowers: 0,
    oldAccounts: 0,
    newAccounts: 0,
  };

  let totalFollowers = 0;
  let totalFollowing = 0;
  let totalTweets = 0;
  let countWithMetrics = 0;

  for (const f of followers) {
    if (f.followers_count !== undefined) {
      totalFollowers += f.followers_count;
      totalFollowing += f.following_count || 0;
      totalTweets += f.tweet_count || 0;
      countWithMetrics++;

      if (f.tweet_count !== undefined && f.tweet_count < 10) {
        stats.inactive++;
      }
      if (f.followers_count < 100) {
        stats.lowFollowers++;
      }
      if (f.followers_count > 10000) {
        stats.highFollowers++;
      }
    }

    if (f.created_at) {
      const createdDate = new Date(f.created_at);
      if (createdDate < twoYearsAgo) {
        stats.oldAccounts++;
      }
      if (createdDate > sixMonthsAgo) {
        stats.newAccounts++;
      }
    }
  }

  if (countWithMetrics > 0) {
    stats.avgFollowers = Math.round(totalFollowers / countWithMetrics);
    stats.avgFollowing = Math.round(totalFollowing / countWithMetrics);
    stats.avgTweets = Math.round(totalTweets / countWithMetrics);
  }

  return stats;
}

function filterFollowers(followers: Follower[], filterType: string): Follower[] {
  switch (filterType) {
    case "inactive":
      return followers.filter((f) => (f.tweet_count || 0) < 10);
    case "low-followers":
      return followers.filter((f) => (f.followers_count || 0) < 100);
    case "high-followers":
      return followers.filter((f) => (f.followers_count || 0) > 10000);
    case "new":
      const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
      return followers.filter((f) => f.created_at && new Date(f.created_at) > sixMonthsAgo);
    case "no-bio":
      return followers.filter((f) => !f.description || f.description.trim() === "");
    default:
      return followers;
  }
}

function printTable(followers: Follower[], limit = 20) {
  console.log();
  console.log("┌" + "─".repeat(118) + "┐");
  console.log(
    "│ " +
      "Username".padEnd(20) +
      "Name".padEnd(25) +
      "Followers".padStart(12) +
      "Following".padStart(12) +
      "Tweets".padStart(10) +
      "Created".padEnd(12) +
      " │"
  );
  console.log("├" + "─".repeat(118) + "┤");

  const displayFollowers = followers.slice(0, limit);
  for (const f of displayFollowers) {
    const created = f.created_at ? new Date(f.created_at).toLocaleDateString() : "N/A";
    console.log(
      "│ " +
        `@${f.username}`.slice(0, 19).padEnd(20) +
        (f.name || "").slice(0, 24).padEnd(25) +
        String(f.followers_count ?? "N/A").padStart(12) +
        String(f.following_count ?? "N/A").padStart(12) +
        String(f.tweet_count ?? "N/A").padStart(10) +
        created.padEnd(12) +
        " │"
    );
  }

  if (followers.length > limit) {
    console.log("│ " + `... and ${followers.length - limit} more`.padEnd(116) + " │");
  }
  console.log("└" + "─".repeat(118) + "┘");
}

function exportData(followers: Follower[], stats: FollowerStats, format: string) {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csvHeader = "id,username,name,description,followers_count,following_count,tweet_count,created_at\n";
    const csvRows = followers
      .map((f) =>
        [
          f.id,
          f.username,
          `"${(f.name || "").replace(/"/g, '""')}"`,
          `"${(f.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
          f.followers_count ?? "",
          f.following_count ?? "",
          f.tweet_count ?? "",
          f.created_at ?? "",
        ].join(",")
      )
      .join("\n");

    const csvPath = join(OUTPUT_DIR, `followers-${timestamp}.csv`);
    writeFileSync(csvPath, csvHeader + csvRows, "utf-8");
    console.log(`📄 Exported CSV: ${csvPath}`);
  }

  // Always export JSON with stats
  const jsonData = {
    exportedAt: new Date().toISOString(),
    stats,
    followers,
  };

  const jsonPath = join(OUTPUT_DIR, `followers-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), "utf-8");
  console.log(`📄 Exported JSON: ${jsonPath}`);
}

async function main() {
  console.log("═".repeat(60));
  console.log("👥 Followers Analysis Tool");
  console.log("═".repeat(60));
  console.log();

  // Check environment
  if (!process.env.X_BEARER_TOKEN) {
    console.error("❌ X_BEARER_TOKEN is required");
    console.log("   Set it in your .env file");
    process.exit(1);
  }

  // Register skills
  registerBuiltinSkills();
  console.log();

  // Fetch all followers
  const followers = await fetchAllFollowers();

  if (followers.length === 0) {
    console.log("❌ No followers found or error occurred");
    process.exit(1);
  }

  // Calculate stats
  const stats = calculateStats(followers);

  // Print statistics
  console.log();
  console.log("─".repeat(60));
  console.log("📊 Statistics");
  console.log("─".repeat(60));
  console.log(`   Total Followers: ${stats.total}`);
  console.log(`   Avg Followers per User: ${stats.avgFollowers}`);
  console.log(`   Avg Following per User: ${stats.avgFollowing}`);
  console.log(`   Avg Tweets per User: ${stats.avgTweets}`);
  console.log();
  console.log("   Distribution:");
  console.log(`   • Inactive (< 10 tweets): ${stats.inactive} (${((stats.inactive / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   • Low followers (< 100): ${stats.lowFollowers} (${((stats.lowFollowers / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   • High followers (> 10k): ${stats.highFollowers} (${((stats.highFollowers / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   • Old accounts (> 2 years): ${stats.oldAccounts} (${((stats.oldAccounts / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   • New accounts (< 6 months): ${stats.newAccounts} (${((stats.newAccounts / stats.total) * 100).toFixed(1)}%)`);

  // Apply filter if specified
  let displayFollowers = followers;
  if (filterType) {
    displayFollowers = filterFollowers(followers, filterType);
    console.log();
    console.log(`🔍 Filtered by: ${filterType}`);
    console.log(`   Matching: ${displayFollowers.length} followers`);
  }

  // Sort by followers count (descending)
  displayFollowers.sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0));

  // Print table
  printTable(displayFollowers);

  // Export data
  console.log();
  exportData(filterType ? displayFollowers : followers, stats, exportFormat);

  console.log();
  console.log("═".repeat(60));
  console.log("✨ Analysis complete!");
  console.log();
  console.log("Available filters: --filter [inactive|low-followers|high-followers|new|no-bio]");
  console.log("Export formats: --export [csv|json]");
}

main().catch(console.error);
