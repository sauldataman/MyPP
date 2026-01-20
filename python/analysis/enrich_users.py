#!/usr/bin/env python3
"""
Enrich Twitter Archive Data with User Details

Takes mutual follows (or any user ID list) and fetches details via Grok API:
- Username (@handle)
- Display Name (nickname)
- Follower count
- Following count
- Bio

Usage:
    python -m analysis.enrich_users /path/to/twitter-archive/data --type mutual
    python -m analysis.enrich_users /path/to/twitter-archive/data --type following
    python -m analysis.enrich_users /path/to/twitter-archive/data --type followers
"""

import json
import re
import sys
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.config import init_env, get_reports_dir
from utils.grok import get_api_key, chat_completion

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn
    console = Console()
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False


def parse_twitter_js(filepath: Path) -> list[dict]:
    """Parse Twitter archive JS file format."""
    content = filepath.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\[[\s\S]*\])", content)
    if not match:
        raise ValueError(f"Could not parse {filepath.name}")
    return json.loads(match.group(1))


def get_account_ids(data: list[dict], key: str) -> set[str]:
    """Extract account IDs from parsed data."""
    ids = set()
    for item in data:
        inner = item.get(key, {})
        if inner.get("accountId"):
            ids.add(inner["accountId"])
    return ids


def fetch_single_user_details(user_id: str) -> dict | None:
    """
    Fetch details for a single user ID using Grok.
    More accurate than batch lookup.
    """
    prompt = f"""Look up this specific Twitter/X user by their numeric user ID.

User ID: {user_id}
Profile URL: https://twitter.com/intent/user?user_id={user_id}

Visit the profile URL and return the EXACT information you find:
- user_id: {user_id} (keep this exact ID)
- username: their current @handle (without @)
- display_name: their display name shown on profile
- followers_count: exact number of followers
- following_count: exact number they follow
- bio: their bio text (first 100 chars)
- verified: true if blue checkmark, false otherwise

If the account is suspended, deleted, or not found, return:
{{"user_id": "{user_id}", "username": "NOT_FOUND", "display_name": "N/A", "followers_count": 0, "following_count": 0, "bio": "", "verified": false}}

Return ONLY a single JSON object, no other text."""

    try:
        response = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You have real-time access to X/Twitter. Look up the EXACT user ID provided. Do NOT guess or confuse with similar accounts. Return accurate data only.",
            temperature=0.0,
            max_tokens=500,
        )

        # Extract JSON
        json_match = re.search(r"\{[\s\S]*\}", response)
        if not json_match:
            return None

        result = json.loads(json_match.group())
        # Ensure user_id matches what we asked for
        result["user_id"] = user_id
        return result
    except Exception as e:
        return None


def fetch_user_details_batch(user_ids: list[str], batch_size: int = 5) -> list[dict]:
    """
    Fetch user details for a batch of user IDs using Grok.
    Uses smaller batches with explicit ID mapping for accuracy.
    """
    if not user_ids:
        return []

    # Create explicit URL list for each ID
    id_url_pairs = [f"- ID {uid}: https://twitter.com/intent/user?user_id={uid}" for uid in user_ids]

    prompt = f"""Look up these specific Twitter/X users by their numeric user IDs.
Visit each profile URL to get accurate information.

{chr(10).join(id_url_pairs)}

For EACH user ID above, return their profile info.
IMPORTANT: Match each result to the EXACT user_id provided. Do not confuse users.

Return as a JSON array with one object per user ID:
[
  {{
    "user_id": "the exact ID from above",
    "username": "their @handle without @",
    "display_name": "their display name",
    "followers_count": number,
    "following_count": number,
    "bio": "bio text (max 100 chars)",
    "verified": true/false
  }}
]

If an account is not found/suspended, use username "NOT_FOUND".
Return ONLY the JSON array."""

    try:
        response = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You have real-time access to X/Twitter. Look up EACH user ID exactly as provided. Do NOT guess or substitute different users. Return accurate data only.",
            temperature=0.0,
            max_tokens=4000,
        )

        # Extract JSON
        json_match = re.search(r"\[[\s\S]*\]", response)
        if not json_match:
            print(f"Warning: Could not parse response for batch")
            return []

        results = json.loads(json_match.group())

        # Verify user_ids match what we requested
        result_ids = {r.get("user_id") for r in results}
        for uid in user_ids:
            if uid not in result_ids:
                # Add missing user as NOT_FOUND
                results.append({
                    "user_id": uid,
                    "username": "NOT_FOUND",
                    "display_name": "N/A",
                    "followers_count": 0,
                    "following_count": 0,
                    "bio": "",
                    "verified": False
                })

        return results
    except Exception as e:
        print(f"Error fetching batch: {e}")
        return []


def enrich_users(user_ids: list[str], delay: float = 1.5, use_single: bool = False) -> list[dict]:
    """
    Enrich a list of user IDs with profile details.
    Processes in batches to avoid rate limits.

    Args:
        user_ids: List of Twitter user IDs
        delay: Delay between API calls
        use_single: If True, look up each user individually (slower but more accurate)
    """
    all_results = []

    if use_single:
        # Single user lookup mode - most accurate
        print(f"\n📡 Fetching details for {len(user_ids)} users (one at a time)...")
        for i, uid in enumerate(user_ids, 1):
            print(f"   [{i}/{len(user_ids)}] ID {uid}...", end=" ", flush=True)
            result = fetch_single_user_details(uid)
            if result:
                all_results.append(result)
                print(f"@{result.get('username', 'ERROR')}")
            else:
                all_results.append({
                    "user_id": uid,
                    "username": "ERROR",
                    "display_name": "N/A",
                    "followers_count": 0,
                    "following_count": 0,
                    "bio": "",
                    "verified": False
                })
                print("ERROR")
            if i < len(user_ids):
                time.sleep(delay)
    else:
        # Batch mode - faster but may have accuracy issues
        batch_size = 5  # Smaller batches for better accuracy
        total_batches = (len(user_ids) + batch_size - 1) // batch_size

        print(f"\n📡 Fetching details for {len(user_ids)} users ({total_batches} batches of {batch_size})...")

        for i in range(0, len(user_ids), batch_size):
            batch = user_ids[i:i + batch_size]
            batch_num = i // batch_size + 1

            print(f"   Batch {batch_num}/{total_batches}...", end=" ", flush=True)

            results = fetch_user_details_batch(batch)
            all_results.extend(results)

            print(f"got {len(results)} users")

            # Rate limit delay between batches
            if i + batch_size < len(user_ids):
                time.sleep(delay)

    return all_results


def save_enriched_data(
    users: list[dict],
    output_dir: Path,
    list_type: str
) -> tuple[Path, Path]:
    """Save enriched user data as CSV and JSON."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    # Sort by followers count (descending)
    users_sorted = sorted(users, key=lambda x: x.get("followers_count", 0), reverse=True)

    # Save as CSV
    csv_path = output_dir / f"{list_type}-enriched-{timestamp}.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("user_id,username,display_name,followers_count,following_count,verified,bio\n")
        for user in users_sorted:
            bio = (user.get("bio") or "").replace('"', '""').replace('\n', ' ')
            f.write(f'{user.get("user_id", "")},'
                    f'{user.get("username", "")},'
                    f'"{user.get("display_name", "")}",'
                    f'{user.get("followers_count", 0)},'
                    f'{user.get("following_count", 0)},'
                    f'{user.get("verified", False)},'
                    f'"{bio}"\n')

    # Save as JSON
    json_path = output_dir / f"{list_type}-enriched-{timestamp}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(users_sorted, f, indent=2, ensure_ascii=False)

    return csv_path, json_path


def print_summary_table(users: list[dict], list_type: str, limit: int = 20):
    """Print a summary table of top users by followers."""
    users_sorted = sorted(users, key=lambda x: x.get("followers_count", 0), reverse=True)

    if RICH_AVAILABLE:
        table = Table(title=f"📊 Top {limit} {list_type.title()} by Followers")
        table.add_column("#", style="dim", width=4)
        table.add_column("Username", style="cyan")
        table.add_column("Display Name", style="green")
        table.add_column("Followers", justify="right", style="yellow")
        table.add_column("Following", justify="right")
        table.add_column("✓", justify="center")

        for i, user in enumerate(users_sorted[:limit], 1):
            verified = "✓" if user.get("verified") else ""
            table.add_row(
                str(i),
                f"@{user.get('username', 'N/A')}",
                user.get("display_name", "")[:25],
                f"{user.get('followers_count', 0):,}",
                f"{user.get('following_count', 0):,}",
                verified
            )

        console.print(table)
    else:
        print(f"\n📊 Top {limit} {list_type.title()} by Followers")
        print("-" * 80)
        print(f"{'#':<4} {'Username':<20} {'Display Name':<25} {'Followers':>12} {'Following':>10}")
        print("-" * 80)
        for i, user in enumerate(users_sorted[:limit], 1):
            print(f"{i:<4} @{user.get('username', 'N/A'):<19} "
                  f"{user.get('display_name', '')[:24]:<25} "
                  f"{user.get('followers_count', 0):>12,} "
                  f"{user.get('following_count', 0):>10,}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Enrich Twitter archive data with user details")
    parser.add_argument("archive_path", help="Path to Twitter archive 'data' directory")
    parser.add_argument("--type", choices=["mutual", "following", "followers", "not_following_back"],
                        default="mutual", help="Which list to enrich (default: mutual)")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of users to process (0 = all)")
    parser.add_argument("--accurate", action="store_true", help="Use single-user lookup mode (slower but more accurate)")
    args = parser.parse_args()

    # Initialize
    init_env()

    if not get_api_key():
        print("❌ XAI_API_KEY or GROK_API_KEY required for enrichment")
        sys.exit(1)

    data_dir = Path(args.archive_path)
    if not data_dir.exists():
        print(f"❌ Directory not found: {data_dir}")
        sys.exit(1)

    if RICH_AVAILABLE:
        console.print(Panel.fit("🐦 Twitter Archive Enricher", style="bold blue"))
    else:
        print("=" * 50)
        print("🐦 Twitter Archive Enricher")
        print("=" * 50)

    # Parse archive files
    print("\n📂 Parsing archive files...")

    following_ids = set()
    follower_ids = set()

    following_path = data_dir / "following.js"
    if following_path.exists():
        data = parse_twitter_js(following_path)
        following_ids = get_account_ids(data, "following")
        print(f"   ✅ following.js: {len(following_ids)} accounts")

    follower_path = data_dir / "follower.js"
    if follower_path.exists():
        data = parse_twitter_js(follower_path)
        follower_ids = get_account_ids(data, "follower")
        print(f"   ✅ follower.js: {len(follower_ids)} accounts")

    # Determine which IDs to enrich
    if args.type == "mutual":
        target_ids = following_ids & follower_ids
        print(f"\n🎯 Mutual follows: {len(target_ids)}")
    elif args.type == "following":
        target_ids = following_ids
        print(f"\n🎯 Following: {len(target_ids)}")
    elif args.type == "followers":
        target_ids = follower_ids
        print(f"\n🎯 Followers: {len(target_ids)}")
    elif args.type == "not_following_back":
        target_ids = following_ids - follower_ids
        print(f"\n🎯 Not following back: {len(target_ids)}")

    if not target_ids:
        print("❌ No users found for this category")
        sys.exit(1)

    # Apply limit if specified
    target_list = list(target_ids)
    if args.limit > 0:
        target_list = target_list[:args.limit]
        print(f"   (Limited to {args.limit} users)")

    # Enrich with Grok
    enriched_users = enrich_users(target_list, use_single=args.accurate)

    if not enriched_users:
        print("❌ Failed to fetch user details")
        sys.exit(1)

    # Print summary
    print_summary_table(enriched_users, args.type)

    # Save results
    print("\n💾 Saving results...")
    output_dir = get_reports_dir("twitter-archive")
    csv_path, json_path = save_enriched_data(enriched_users, output_dir, args.type)
    print(f"   ✅ CSV: {csv_path}")
    print(f"   ✅ JSON: {json_path}")

    # Stats
    total_followers = sum(u.get("followers_count", 0) for u in enriched_users)
    avg_followers = total_followers // len(enriched_users) if enriched_users else 0
    verified_count = sum(1 for u in enriched_users if u.get("verified"))

    print(f"\n📈 Stats:")
    print(f"   Total users: {len(enriched_users)}")
    print(f"   Total followers (combined): {total_followers:,}")
    print(f"   Average followers: {avg_followers:,}")
    print(f"   Verified accounts: {verified_count}")

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
