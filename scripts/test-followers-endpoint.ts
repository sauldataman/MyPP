/**
 * Test followers endpoint directly with OAuth 1.0a
 */
import { createHmac, randomBytes } from "crypto";

const OAUTH_CONFIG = {
  apiKey: process.env.X_API_KEY || "",
  apiSecret: process.env.X_API_SECRET || "",
  accessToken: process.env.X_ACCESS_TOKEN || "",
  accessSecret: process.env.X_ACCESS_SECRET || "",
};

console.log("=== Testing Followers Endpoint ===\n");
console.log("OAuth credentials loaded:", {
  apiKey: OAUTH_CONFIG.apiKey ? "✓" : "✗",
  apiSecret: OAUTH_CONFIG.apiSecret ? "✓" : "✗",
  accessToken: OAUTH_CONFIG.accessToken ? "✓" : "✗",
  accessSecret: OAUTH_CONFIG.accessSecret ? "✓" : "✗",
});

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  oauthParams: Record<string, string>
): string {
  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");

  const signingKey = `${encodeURIComponent(OAUTH_CONFIG.apiSecret)}&${encodeURIComponent(OAUTH_CONFIG.accessSecret)}`;
  const signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  return signature;
}

function buildOAuthHeader(method: string, url: string, params: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: OAUTH_CONFIG.apiKey,
    oauth_token: OAUTH_CONFIG.accessToken,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_version: "1.0",
  };

  oauthParams.oauth_signature = generateOAuthSignature(method, url, params, oauthParams);

  const headerParams = Object.keys(oauthParams)
    .sort()
    .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(", ");

  return `OAuth ${headerParams}`;
}

async function test() {
  // Step 1: Get my user ID
  console.log("\n1️⃣ Getting user ID via /users/me...");
  const meUrl = "https://api.twitter.com/2/users/me";
  const meResponse = await fetch(meUrl, {
    headers: { Authorization: buildOAuthHeader("GET", meUrl) },
  });

  if (!meResponse.ok) {
    const error = await meResponse.json();
    console.log("❌ Failed to get user:", JSON.stringify(error, null, 2));
    return;
  }

  const meData = await meResponse.json();
  const userId = meData.data.id;
  console.log(`✅ Got user ID: ${userId} (@${meData.data.username})`);

  // Step 2: Try to get followers
  console.log("\n2️⃣ Testing /users/{id}/followers endpoint...");
  const followersBaseUrl = `https://api.twitter.com/2/users/${userId}/followers`;
  const params = { max_results: "10" };
  const fullUrl = `${followersBaseUrl}?${new URLSearchParams(params)}`;

  const followersResponse = await fetch(fullUrl, {
    headers: { Authorization: buildOAuthHeader("GET", followersBaseUrl, params) },
  });

  const followersData = await followersResponse.json();

  if (!followersResponse.ok) {
    console.log(`❌ Followers endpoint failed (${followersResponse.status}):`);
    console.log(JSON.stringify(followersData, null, 2));

    if (followersData.reason === "client-not-enrolled") {
      console.log("\n⚠️  This confirms the issue is API ACCESS LEVEL, not authentication.");
      console.log("   Your Basic tier likely doesn't include the followers endpoint.");
      console.log("   Options:");
      console.log("   1. Upgrade to Pro tier ($5000/month) - includes all endpoints");
      console.log("   2. Use Grok API instead for analysis (you have this working)");
      console.log("   3. Check Twitter's API tier comparison: https://developer.twitter.com/en/docs/twitter-api");
    }
  } else {
    console.log("✅ Followers endpoint works!");
    console.log(`   Found ${followersData.data?.length || 0} followers`);
    console.log(JSON.stringify(followersData, null, 2));
  }
}

test().catch(console.error);
