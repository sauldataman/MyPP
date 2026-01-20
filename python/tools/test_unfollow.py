#!/usr/bin/env python3
"""
Test unfollow endpoint with OAuth 1.0a
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import hashlib
import hmac
import time
import urllib.parse
import secrets
import httpx

from utils.config import init_env, get_env


def get_oauth_config():
    return {
        "api_key": get_env("X_API_KEY"),
        "api_secret": get_env("X_API_SECRET"),
        "access_token": get_env("X_ACCESS_TOKEN"),
        "access_secret": get_env("X_ACCESS_SECRET"),
    }


def generate_oauth_signature(method: str, url: str, params: dict, oauth_params: dict, config: dict) -> str:
    all_params = {**params, **oauth_params}
    sorted_params = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in sorted(all_params.items())
    )

    base_string = "&".join([
        method.upper(),
        urllib.parse.quote(url, safe=""),
        urllib.parse.quote(sorted_params, safe=""),
    ])

    signing_key = f"{urllib.parse.quote(config['api_secret'], safe='')}&{urllib.parse.quote(config['access_secret'], safe='')}"

    signature = hmac.new(
        signing_key.encode(),
        base_string.encode(),
        hashlib.sha1
    ).digest()

    import base64
    return base64.b64encode(signature).decode()


def build_oauth_header(method: str, url: str, params: dict = None) -> str:
    config = get_oauth_config()
    params = params or {}

    oauth_params = {
        "oauth_consumer_key": config["api_key"],
        "oauth_token": config["access_token"],
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_nonce": secrets.token_hex(16),
        "oauth_version": "1.0",
    }

    oauth_params["oauth_signature"] = generate_oauth_signature(method, url, params, oauth_params, config)

    header_params = ", ".join(
        f'{urllib.parse.quote(k, safe="")}="{urllib.parse.quote(v, safe="")}"'
        for k, v in sorted(oauth_params.items())
    )

    return f"OAuth {header_params}"


def get_my_user_id() -> str:
    """Get the authenticated user's ID."""
    url = "https://api.twitter.com/2/users/me"
    auth_header = build_oauth_header("GET", url)

    response = httpx.get(url, headers={"Authorization": auth_header}, timeout=30)
    data = response.json()

    if "data" in data:
        return data["data"]["id"]
    else:
        raise Exception(f"Failed to get user ID: {data}")


def unfollow_user(my_user_id: str, target_user_id: str) -> dict:
    """Unfollow a user."""
    url = f"https://api.twitter.com/2/users/{my_user_id}/following/{target_user_id}"
    auth_header = build_oauth_header("DELETE", url)

    response = httpx.delete(url, headers={"Authorization": auth_header}, timeout=30)
    return {"status": response.status_code, "data": response.json()}


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m tools.test_unfollow <user_id>")
        sys.exit(1)

    target_user_id = sys.argv[1]

    init_env()

    config = get_oauth_config()
    if not all(config.values()):
        print("❌ OAuth 1.0a credentials required (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET)")
        sys.exit(1)

    print("=" * 50)
    print("🧪 Testing Unfollow Endpoint")
    print("=" * 50)

    # Get my user ID
    print("\n1️⃣ Getting my user ID...")
    try:
        my_user_id = get_my_user_id()
        print(f"   ✅ My user ID: {my_user_id}")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        sys.exit(1)

    # Try to unfollow
    print(f"\n2️⃣ Attempting to unfollow user {target_user_id}...")
    result = unfollow_user(my_user_id, target_user_id)

    if result["status"] == 200:
        print(f"   ✅ Success! Response: {result['data']}")
    else:
        print(f"   ❌ Failed with status {result['status']}")
        print(f"   Response: {result['data']}")

        if result["status"] == 403:
            print("\n   ⚠️  This endpoint might require a higher API tier.")


if __name__ == "__main__":
    main()
