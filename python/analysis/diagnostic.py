#!/usr/bin/env python3
"""
Quick diagnostic for Twitter archive - no Grok needed.
Just checks the raw data to verify parsing is correct.
"""

import json
import re
import sys
from pathlib import Path


def parse_twitter_js(filepath: Path) -> list[dict]:
    content = filepath.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\[[\s\S]*\])", content)
    if not match:
        raise ValueError(f"Could not parse {filepath.name}")
    return json.loads(match.group(1))


def get_ids(data: list[dict], key: str) -> set[str]:
    return {item.get(key, {}).get("accountId") for item in data if item.get(key, {}).get("accountId")}


def main():
    if len(sys.argv) < 2:
        print("Usage: python diagnostic.py /path/to/twitter-archive/data")
        sys.exit(1)

    data_dir = Path(sys.argv[1])

    print("=" * 60)
    print("🔍 Twitter Archive Diagnostic")
    print("=" * 60)

    # Parse files
    following_ids = set()
    follower_ids = set()

    following_path = data_dir / "following.js"
    if following_path.exists():
        data = parse_twitter_js(following_path)
        following_ids = get_ids(data, "following")
        print(f"\n📤 Following (people YOU follow): {len(following_ids)}")
        print(f"   Sample IDs: {list(following_ids)[:5]}")

    follower_path = data_dir / "follower.js"
    if follower_path.exists():
        data = parse_twitter_js(follower_path)
        follower_ids = get_ids(data, "follower")
        print(f"\n📥 Followers (people who follow YOU): {len(follower_ids)}")
        print(f"   Sample IDs: {list(follower_ids)[:5]}")

    # Calculate sets
    mutual = following_ids & follower_ids
    not_following_back = following_ids - follower_ids
    you_dont_follow = follower_ids - following_ids

    print(f"\n🤝 Mutual follows: {len(mutual)}")
    print(f"   Sample mutual IDs: {list(mutual)[:5]}")

    print(f"\n❌ Not following back (you follow, they don't): {len(not_following_back)}")
    print(f"\n👀 You don't follow back (they follow, you don't): {len(you_dont_follow)}")

    # Check for Elon Musk (ID: 44196397)
    elon_id = "44196397"
    print(f"\n🔎 Elon Musk check (ID: {elon_id}):")
    print(f"   In your following? {elon_id in following_ids}")
    print(f"   In your followers? {elon_id in follower_ids}")
    print(f"   In mutual? {elon_id in mutual}")

    # Save mutual IDs to file for manual checking
    output_file = data_dir.parent / "mutual_ids_raw.txt"
    with open(output_file, "w") as f:
        for mid in sorted(mutual):
            f.write(f"https://twitter.com/intent/user?user_id={mid}\n")
    print(f"\n💾 Mutual IDs saved to: {output_file}")
    print("   (You can open these links to manually verify)")


if __name__ == "__main__":
    main()
