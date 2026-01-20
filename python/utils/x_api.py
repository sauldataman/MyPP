"""
X API client for user lookups.
Uses Bearer Token (Application-Only) authentication.
"""

import time
from typing import Any

import httpx

from .config import get_env

X_API_BASE = "https://api.twitter.com/2"


def get_bearer_token() -> str:
    """Get X API Bearer Token from environment."""
    return get_env("X_BEARER_TOKEN")


def lookup_user_by_id(user_id: str) -> dict | None:
    """
    Look up a single user by ID.

    Returns user dict with id, username, name, public_metrics, etc.
    Returns None if not found or error.
    """
    bearer_token = get_bearer_token()
    if not bearer_token:
        raise ValueError("X_BEARER_TOKEN environment variable is required")

    url = f"{X_API_BASE}/users/{user_id}"
    params = {
        "user.fields": "public_metrics,description,verified,created_at,profile_image_url"
    }

    try:
        response = httpx.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {bearer_token}"},
            timeout=30.0,
        )

        data = response.json()

        if response.status_code == 200 and "data" in data:
            return data["data"]
        elif response.status_code == 429:
            # Rate limited
            print("⚠️ Rate limited, waiting 60s...")
            time.sleep(60)
            return lookup_user_by_id(user_id)  # Retry
        else:
            # User not found or other error
            return None

    except Exception as e:
        print(f"Error looking up user {user_id}: {e}")
        return None


def lookup_users_batch(user_ids: list[str]) -> list[dict]:
    """
    Look up multiple users by ID (max 100 per request).

    Returns list of user dicts.
    """
    bearer_token = get_bearer_token()
    if not bearer_token:
        raise ValueError("X_BEARER_TOKEN environment variable is required")

    if not user_ids:
        return []

    # API limit is 100 users per request
    if len(user_ids) > 100:
        user_ids = user_ids[:100]

    url = f"{X_API_BASE}/users"
    params = {
        "ids": ",".join(user_ids),
        "user.fields": "public_metrics,description,verified,created_at,profile_image_url"
    }

    try:
        response = httpx.get(
            url,
            params=params,
            headers={"Authorization": f"Bearer {bearer_token}"},
            timeout=30.0,
        )

        data = response.json()

        if response.status_code == 200:
            return data.get("data", [])
        elif response.status_code == 429:
            # Rate limited
            print("⚠️ Rate limited, waiting 60s...")
            time.sleep(60)
            return lookup_users_batch(user_ids)  # Retry
        else:
            print(f"API error {response.status_code}: {data}")
            return []

    except Exception as e:
        print(f"Error looking up users: {e}")
        return []


def enrich_users_via_api(
    user_ids: list[str],
    batch_size: int = 100,
    delay: float = 1.0
) -> list[dict]:
    """
    Enrich a list of user IDs using X API.

    Args:
        user_ids: List of Twitter user IDs
        batch_size: Number of users per API call (max 100)
        delay: Delay between API calls

    Returns:
        List of enriched user dicts
    """
    all_results = []
    total_batches = (len(user_ids) + batch_size - 1) // batch_size
    found_ids = set()

    print(f"\n📡 Fetching details for {len(user_ids)} users via X API ({total_batches} batches)...")

    for i in range(0, len(user_ids), batch_size):
        batch = user_ids[i:i + batch_size]
        batch_num = i // batch_size + 1

        print(f"   Batch {batch_num}/{total_batches}...", end=" ", flush=True)

        results = lookup_users_batch(batch)

        for user in results:
            found_ids.add(user["id"])
            # Normalize the data format
            metrics = user.get("public_metrics", {})
            all_results.append({
                "user_id": user["id"],
                "username": user.get("username", ""),
                "display_name": user.get("name", ""),
                "followers_count": metrics.get("followers_count", 0),
                "following_count": metrics.get("following_count", 0),
                "bio": user.get("description", "")[:100] if user.get("description") else "",
                "verified": user.get("verified", False),
            })

        print(f"got {len(results)} users")

        # Rate limit delay between batches
        if i + batch_size < len(user_ids):
            time.sleep(delay)

    # Mark not found users
    for uid in user_ids:
        if uid not in found_ids:
            all_results.append({
                "user_id": uid,
                "username": "NOT_FOUND",
                "display_name": "N/A",
                "followers_count": 0,
                "following_count": 0,
                "bio": "",
                "verified": False,
            })

    return all_results
