#!/usr/bin/env python3
"""
Twitter Archive Analyzer

Parses and analyzes following.js and follower.js from Twitter data export.

Usage:
    python -m analysis.twitter_archive /path/to/twitter-archive/data

The script expects the archive's data/ directory containing:
    - following.js
    - follower.js
"""

import json
import re
import sys
from pathlib import Path
from collections import Counter
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    print("Note: Install 'rich' for better output: pip install rich")


def parse_twitter_js(filepath: Path) -> list[dict]:
    """
    Parse Twitter archive JS file format.

    Twitter exports data as JS files with format:
    window.YTD.following.part0 = [ ... ]
    """
    content = filepath.read_text(encoding="utf-8")

    # Remove the JS variable assignment, keep only the JSON array
    # Pattern: window.YTD.something.part0 = [...]
    match = re.search(r"=\s*(\[[\s\S]*\])", content)
    if not match:
        raise ValueError(f"Could not parse {filepath.name} - unexpected format")

    json_str = match.group(1)
    return json.loads(json_str)


def extract_following(data: list[dict]) -> list[dict]:
    """Extract following data from parsed JS."""
    results = []
    for item in data:
        following = item.get("following", {})
        results.append({
            "account_id": following.get("accountId"),
            "user_link": following.get("userLink"),
        })
    return results


def extract_followers(data: list[dict]) -> list[dict]:
    """Extract follower data from parsed JS."""
    results = []
    for item in data:
        follower = item.get("follower", {})
        results.append({
            "account_id": follower.get("accountId"),
            "user_link": follower.get("userLink"),
        })
    return results


def analyze_relationships(following: list[dict], followers: list[dict]) -> dict:
    """Analyze the relationship between following and followers."""
    following_ids = set(f["account_id"] for f in following if f["account_id"])
    follower_ids = set(f["account_id"] for f in followers if f["account_id"])

    # Mutual follows (they follow you AND you follow them)
    mutual = following_ids & follower_ids

    # You follow them but they don't follow you back
    not_following_back = following_ids - follower_ids

    # They follow you but you don't follow them back
    you_dont_follow_back = follower_ids - following_ids

    return {
        "total_following": len(following_ids),
        "total_followers": len(follower_ids),
        "mutual_follows": len(mutual),
        "not_following_back": len(not_following_back),
        "you_dont_follow_back": len(you_dont_follow_back),
        "follow_ratio": len(follower_ids) / len(following_ids) if following_ids else 0,
        "mutual_ids": mutual,
        "not_following_back_ids": not_following_back,
        "you_dont_follow_back_ids": you_dont_follow_back,
    }


def save_analysis_report(
    analysis: dict,
    following: list[dict],
    followers: list[dict],
    output_dir: Path
):
    """Save detailed analysis to files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    # Save summary report
    summary_path = output_dir / f"analysis-summary-{timestamp}.md"
    summary_content = f"""# Twitter Archive Analysis Report

**Generated:** {datetime.now().isoformat()}

## Overview

| Metric | Count |
|--------|-------|
| Following | {analysis['total_following']} |
| Followers | {analysis['total_followers']} |
| Mutual Follows | {analysis['mutual_follows']} |
| Not Following Back | {analysis['not_following_back']} |
| You Don't Follow Back | {analysis['you_dont_follow_back']} |
| Follow Ratio | {analysis['follow_ratio']:.2f} |

## Analysis

### Mutual Follows ({analysis['mutual_follows']})
People you follow who also follow you back. These are your strongest connections.

### Not Following Back ({analysis['not_following_back']})
People you follow who don't follow you back. Consider reviewing this list.

### You Don't Follow Back ({analysis['you_dont_follow_back']})
People who follow you but you don't follow back.

---

See the CSV files for detailed lists.
"""
    summary_path.write_text(summary_content, encoding="utf-8")
    print(f"✅ Summary saved to: {summary_path}")

    # Save not following back list as CSV
    nfb_path = output_dir / f"not-following-back-{timestamp}.csv"
    with open(nfb_path, "w", encoding="utf-8") as f:
        f.write("account_id,user_link\n")
        for fid in analysis["not_following_back_ids"]:
            # Find the user link
            user = next((u for u in following if u["account_id"] == fid), {})
            link = user.get("user_link", "")
            f.write(f"{fid},{link}\n")
    print(f"✅ Not following back list saved to: {nfb_path}")

    # Save all following as JSON for further analysis
    following_path = output_dir / f"following-{timestamp}.json"
    with open(following_path, "w", encoding="utf-8") as f:
        json.dump(following, f, indent=2)
    print(f"✅ Following data saved to: {following_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m analysis.twitter_archive /path/to/twitter-archive/data")
        print("\nThe path should be the 'data' directory inside your extracted Twitter archive.")
        sys.exit(1)

    data_dir = Path(sys.argv[1])

    if not data_dir.exists():
        print(f"❌ Directory not found: {data_dir}")
        sys.exit(1)

    following_path = data_dir / "following.js"
    follower_path = data_dir / "follower.js"

    if RICH_AVAILABLE:
        console = Console()
        console.print(Panel.fit("🐦 Twitter Archive Analyzer", style="bold blue"))
        console.print()
    else:
        print("=" * 50)
        print("🐦 Twitter Archive Analyzer")
        print("=" * 50)
        print()

    # Parse files
    print("📂 Parsing archive files...")

    following = []
    followers = []

    if following_path.exists():
        raw_following = parse_twitter_js(following_path)
        following = extract_following(raw_following)
        print(f"   ✅ following.js: {len(following)} accounts")
    else:
        print(f"   ⚠️  following.js not found")

    if follower_path.exists():
        raw_followers = parse_twitter_js(follower_path)
        followers = extract_followers(raw_followers)
        print(f"   ✅ follower.js: {len(followers)} accounts")
    else:
        print(f"   ⚠️  follower.js not found")

    print()

    if not following and not followers:
        print("❌ No data found to analyze")
        sys.exit(1)

    # Analyze
    print("🔍 Analyzing relationships...")
    analysis = analyze_relationships(following, followers)
    print()

    # Display results
    if RICH_AVAILABLE:
        table = Table(title="📊 Analysis Results")
        table.add_column("Metric", style="cyan")
        table.add_column("Count", style="green", justify="right")

        table.add_row("Following", str(analysis["total_following"]))
        table.add_row("Followers", str(analysis["total_followers"]))
        table.add_row("Mutual Follows", str(analysis["mutual_follows"]))
        table.add_row("Not Following Back", str(analysis["not_following_back"]))
        table.add_row("You Don't Follow Back", str(analysis["you_dont_follow_back"]))
        table.add_row("Follow Ratio", f"{analysis['follow_ratio']:.2f}")

        console.print(table)
    else:
        print("📊 Analysis Results")
        print("-" * 30)
        print(f"Following:            {analysis['total_following']}")
        print(f"Followers:            {analysis['total_followers']}")
        print(f"Mutual Follows:       {analysis['mutual_follows']}")
        print(f"Not Following Back:   {analysis['not_following_back']}")
        print(f"You Don't Follow Back:{analysis['you_dont_follow_back']}")
        print(f"Follow Ratio:         {analysis['follow_ratio']:.2f}")

    print()

    # Save reports
    print("💾 Saving reports...")
    output_dir = Path(__file__).parent.parent.parent / "reports" / "twitter-archive"
    save_analysis_report(analysis, following, followers, output_dir)

    print()
    print("✅ Analysis complete!")


if __name__ == "__main__":
    main()
