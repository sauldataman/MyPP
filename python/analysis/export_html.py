#!/usr/bin/env python3
"""
Export Twitter Archive data as clickable HTML report.
No API calls needed - just generates links you can manually check.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime


def parse_twitter_js(filepath: Path) -> list[dict]:
    content = filepath.read_text(encoding="utf-8")
    match = re.search(r"=\s*(\[[\s\S]*\])", content)
    if not match:
        raise ValueError(f"Could not parse {filepath.name}")
    return json.loads(match.group(1))


def get_ids(data: list[dict], key: str) -> set[str]:
    return {item.get(key, {}).get("accountId") for item in data if item.get(key, {}).get("accountId")}


def generate_html_report(user_ids: list[str], title: str, output_path: Path):
    """Generate an HTML file with clickable profile links."""

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #f5f5f5; }}
        h1 {{ color: #1da1f2; }}
        .stats {{ background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }}
        .user-list {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }}
        .user-card {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }}
        .user-card:hover {{ box-shadow: 0 2px 8px rgba(0,0,0,0.15); }}
        .user-id {{ color: #666; font-size: 12px; font-family: monospace; }}
        a {{ color: #1da1f2; text-decoration: none; font-weight: 500; }}
        a:hover {{ text-decoration: underline; }}
        .count {{ font-size: 24px; font-weight: bold; color: #1da1f2; }}
    </style>
</head>
<body>
    <h1>🐦 {title}</h1>

    <div class="stats">
        <p><span class="count">{len(user_ids)}</span> users</p>
        <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>Click each link to view the profile on Twitter/X</p>
    </div>

    <div class="user-list">
"""

    for i, uid in enumerate(user_ids, 1):
        url = f"https://twitter.com/intent/user?user_id={uid}"
        html += f"""        <div class="user-card">
            <div>#{i}</div>
            <div><a href="{url}" target="_blank">Open Profile →</a></div>
            <div class="user-id">ID: {uid}</div>
        </div>
"""

    html += """    </div>
</body>
</html>
"""

    output_path.write_text(html, encoding="utf-8")
    return output_path


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Export Twitter archive as HTML report")
    parser.add_argument("archive_path", help="Path to Twitter archive 'data' directory")
    parser.add_argument("--type", choices=["mutual", "following", "followers", "not_following_back"],
                        default="mutual", help="Which list to export")
    parser.add_argument("--output", help="Output HTML file path (optional)")
    args = parser.parse_args()

    data_dir = Path(args.archive_path)

    print("=" * 60)
    print("🐦 Twitter Archive HTML Export")
    print("=" * 60)

    # Parse files
    following_ids = set()
    follower_ids = set()

    following_path = data_dir / "following.js"
    if following_path.exists():
        data = parse_twitter_js(following_path)
        following_ids = get_ids(data, "following")
        print(f"\n📤 Following: {len(following_ids)}")

    follower_path = data_dir / "follower.js"
    if follower_path.exists():
        data = parse_twitter_js(follower_path)
        follower_ids = get_ids(data, "follower")
        print(f"📥 Followers: {len(follower_ids)}")

    # Determine target set
    if args.type == "mutual":
        target_ids = following_ids & follower_ids
        title = "Mutual Follows"
    elif args.type == "following":
        target_ids = following_ids
        title = "Following"
    elif args.type == "followers":
        target_ids = follower_ids
        title = "Followers"
    elif args.type == "not_following_back":
        target_ids = following_ids - follower_ids
        title = "Not Following Back"

    print(f"\n🎯 {title}: {len(target_ids)}")

    # Generate HTML
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = data_dir.parent / f"{args.type}_report.html"

    generate_html_report(list(target_ids), title, output_path)

    print(f"\n✅ HTML report saved to: {output_path}")
    print(f"   Open in browser to view clickable profile links")


if __name__ == "__main__":
    main()
