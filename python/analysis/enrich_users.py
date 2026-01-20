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


def fetch_user_details_batch(user_ids: list[str], batch_size: int = 10) -> list[dict]:
    """
    Fetch user details for a batch of user IDs using Grok.

    Returns list of user details with username, display_name, followers, etc.
    """
    if not user_ids:
        return []

    prompt = f"""Look up these Twitter/X user IDs and return their current profile information:

User IDs: {', '.join(user_ids)}

For each user, provide:
- user_id: the original ID
- username: their @handle (without @)
- display_name: their display name/nickname
- followers_count: number of followers
- following_count: number of people they follow
- bio: their profile bio (truncated to 100 chars if longer)
- verified: true/false if they have a verified badge

Return as a JSON array. If a user is not found or suspended, include them with username "NOT_FOUND".

Example format:
[
  {{
    "user_id": "123",
    "username": "example",
    "display_name": "Example User",
    "followers_count": 1500,
    "following_count": 200,
    "bio": "Building cool stuff",
    "verified": false
  }}
]

Only return the JSON array, no other text."""

    try:
        response = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You are a helpful assistant with real-time access to X/Twitter data. Return accurate, current data in the exact JSON format requested.",
            temperature=0.1,
            max_tokens=4000,
        )

        # Extract JSON
        json_match = re.search(r"\[[\s\S]*\]", response)
        if not json_match:
            print(f"Warning: Could not parse response for batch")
            return []

        return json.loads(json_match.group())
    except Exception as e:
        print(f"Error fetching batch: {e}")
        return []


def enrich_users(user_ids: list[str], delay: float = 1.0) -> list[dict]:
    """
    Enrich a list of user IDs with profile details.
    Processes in batches to avoid rate limits.
    """
    all_results = []
    batch_size = 15  # Process 15 users at a time
    total_batches = (len(user_ids) + batch_size - 1) // batch_size

    print(f"\n📡 Fetching details for {len(user_ids)} users ({total_batches} batches)...")

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
    enriched_users = enrich_users(target_list)

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
