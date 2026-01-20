#!/usr/bin/env python3
"""
Look up X/Twitter user by username or ID.

Usage:
    python -m tools.lookup_user bitfish
    python -m tools.lookup_user --id 123456789
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
from utils.config import init_env, get_env


def lookup_by_username(username: str) -> dict | None:
    """Look up user by username."""
    token = get_env("X_BEARER_TOKEN")
    if not token:
        print("❌ X_BEARER_TOKEN required")
        return None

    url = f"https://api.twitter.com/2/users/by/username/{username}"
    params = {"user.fields": "public_metrics,description,created_at,verified"}

    response = httpx.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    data = response.json()

    if "data" in data:
        return data["data"]
    elif "errors" in data:
        print(f"❌ Error: {data['errors'][0].get('detail', data['errors'])}")
        return None
    else:
        print(f"❌ Unknown error: {data}")
        return None


def lookup_by_id(user_id: str) -> dict | None:
    """Look up user by ID."""
    token = get_env("X_BEARER_TOKEN")
    if not token:
        print("❌ X_BEARER_TOKEN required")
        return None

    url = f"https://api.twitter.com/2/users/{user_id}"
    params = {"user.fields": "public_metrics,description,created_at,verified"}

    response = httpx.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=30)
    data = response.json()

    if "data" in data:
        return data["data"]
    elif "errors" in data:
        print(f"❌ Error: {data['errors'][0].get('detail', data['errors'])}")
        return None
    else:
        print(f"❌ Unknown error: {data}")
        return None


def print_user(user: dict):
    """Pretty print user info."""
    metrics = user.get("public_metrics", {})
    print(f"""
📋 User Info
{'─' * 40}
ID:          {user.get('id')}
Username:    @{user.get('username')}
Name:        {user.get('name')}
Followers:   {metrics.get('followers_count', 0):,}
Following:   {metrics.get('following_count', 0):,}
Tweets:      {metrics.get('tweet_count', 0):,}
Verified:    {'✓' if user.get('verified') else '✗'}
Created:     {user.get('created_at', 'N/A')[:10] if user.get('created_at') else 'N/A'}
Bio:         {user.get('description', '')[:100]}
{'─' * 40}
""")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Look up X/Twitter user")
    parser.add_argument("query", nargs="?", help="Username (without @)")
    parser.add_argument("--id", help="Look up by user ID instead")
    args = parser.parse_args()

    if not args.query and not args.id:
        parser.print_help()
        sys.exit(1)

    init_env()

    if args.id:
        user = lookup_by_id(args.id)
    else:
        user = lookup_by_username(args.query)

    if user:
        print_user(user)


if __name__ == "__main__":
    main()
