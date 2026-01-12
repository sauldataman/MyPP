/**
 * Test OAuth 1.0a authentication
 */
import { createHmac, randomBytes } from "crypto";
import { config } from "dotenv";

config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const OAUTH_CONFIG = {
  apiKey: process.env.X_API_KEY || "",
  apiSecret: process.env.X_API_SECRET || "",
  accessToken: process.env.X_ACCESS_TOKEN || "",
  accessSecret: process.env.X_ACCESS_SECRET || "",
};

console.log("=== OAuth 1.0a Configuration Check ===\n");
console.log("X_API_KEY:", OAUTH_CONFIG.apiKey ? `${OAUTH_CONFIG.apiKey.slice(0, 8)}...` : "❌ NOT SET");
console.log("X_API_SECRET:", OAUTH_CONFIG.apiSecret ? `${OAUTH_CONFIG.apiSecret.slice(0, 8)}...` : "❌ NOT SET");
console.log("X_ACCESS_TOKEN:", OAUTH_CONFIG.accessToken ? `${OAUTH_CONFIG.accessToken.slice(0, 8)}...` : "❌ NOT SET");
console.log("X_ACCESS_SECRET:", OAUTH_CONFIG.accessSecret ? `${OAUTH_CONFIG.accessSecret.slice(0, 8)}...` : "❌ NOT SET");

if (!OAUTH_CONFIG.apiKey || !OAUTH_CONFIG.apiSecret || !OAUTH_CONFIG.accessToken || !OAUTH_CONFIG.accessSecret) {
  console.log("\n❌ Missing OAuth credentials. Please set all 4 environment variables.");
  process.exit(1);
}

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

async function testOAuth() {
  console.log("\n=== Testing OAuth 1.0a with /users/me ===\n");

  const url = "https://api.twitter.com/2/users/me";
  const method = "GET";

  const authHeader = buildOAuthHeader(method, url);
  console.log("Authorization header generated ✓\n");

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
      },
    });

    const data = await response.json();

    if (response.ok) {
      console.log("✅ OAuth 1.0a authentication successful!\n");
      console.log("Your user info:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ Error ${response.status}:`);
      console.log(JSON.stringify(data, null, 2));

      if (data.reason === "client-not-enrolled") {
        console.log("\n⚠️  Your app is not enrolled in the appropriate API access level.");
        console.log("   This might mean:");
        console.log("   1. The followers endpoint requires Pro tier ($5000/month)");
        console.log("   2. Or you need to regenerate tokens after adding app to project");
      }
    }
  } catch (error) {
    console.log("❌ Request failed:", error);
  }
}

testOAuth();
