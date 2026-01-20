/**
 * Test X API user lookup by ID
 */

const BEARER_TOKEN = process.env.X_BEARER_TOKEN || "";

async function lookupUser(userId: string) {
  const url = `https://api.twitter.com/2/users/${userId}?user.fields=public_metrics,description,verified`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BEARER_TOKEN}`,
    },
  });

  return response.json();
}

async function main() {
  if (!BEARER_TOKEN) {
    console.log("❌ X_BEARER_TOKEN required");
    process.exit(1);
  }

  console.log("=== Testing X API User Lookup ===\n");

  // Test with a few known user IDs
  const testIds = [
    "44196397",      // Elon Musk
    "29873662",      // MKBHD (real ID)
    "872725361271873538",  // The ID from your test that returned MKBHD incorrectly
  ];

  for (const userId of testIds) {
    console.log(`Looking up ID: ${userId}`);
    const result = await lookupUser(userId);

    if (result.data) {
      console.log(`  ✅ @${result.data.username} - ${result.data.name}`);
      console.log(`     Followers: ${result.data.public_metrics?.followers_count}`);
    } else if (result.errors) {
      console.log(`  ❌ Error: ${result.errors[0]?.detail || JSON.stringify(result)}`);
    } else {
      console.log(`  ❌ ${JSON.stringify(result)}`);
    }
    console.log();
  }
}

main();
