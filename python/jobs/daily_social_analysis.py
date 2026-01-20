#!/usr/bin/env python3
"""
Daily Social Media Analysis Job

Fetches tweets from watchlist accounts and analyzes them using Grok API.
Designed to run as a daily cron job.

Usage:
    python -m jobs.daily_social_analysis
    # or
    ./scripts/daily-social-analysis.sh
"""

import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from rich.console import Console
from rich.panel import Panel

from utils.config import init_env, load_json_config, load_prompt, get_reports_dir
from utils.grok import get_api_key, fetch_user_tweets, chat_completion

console = Console()


def main():
    console.print(Panel.fit("📊 Daily Social Media Analysis", style="bold blue"))
    console.print()

    # Initialize environment
    init_env()

    # Check API key
    if not get_api_key():
        console.print("[red]❌ XAI_API_KEY or GROK_API_KEY environment variable is required[/red]")
        sys.exit(1)

    # Load watchlist
    console.print("[bold]📋 Loading watchlist...[/bold]")
    watchlist = load_json_config("watchlist.json")
    settings = watchlist.get("settings", {})
    accounts = [a for a in watchlist.get("accounts", []) if a.get("enabled", True)]

    if not accounts:
        console.print("[yellow]⚠️  No enabled accounts in watchlist[/yellow]")
        sys.exit(0)

    console.print(f"   Found {len(accounts)} accounts to analyze")
    for account in accounts:
        console.print(f"   • @{account['username']}")
    console.print()

    # Load prompt template
    console.print("[bold]📝 Loading prompt template...[/bold]")
    prompt_template = settings.get("promptTemplate", "daily-social-analysis.md")
    console.print(f"   Using: {prompt_template}")
    console.print()

    # Fetch tweets from each account
    console.print("[bold]📥 Fetching tweets...[/bold]")
    all_tweets = []
    hours_lookback = settings.get("hoursLookback", 24)
    max_posts = settings.get("maxPostsPerUser", 50)

    for account in accounts:
        username = account["username"]
        console.print(f"   @{username}... ", end="")
        tweets = fetch_user_tweets(username, hours_lookback, max_posts)
        console.print(f"{len(tweets)} tweets")
        all_tweets.extend(tweets)

    if not all_tweets:
        console.print("\n[yellow]⚠️  No tweets found in the specified time period[/yellow]")
        sys.exit(0)

    console.print(f"\n[bold]📊 Total tweets collected: {len(all_tweets)}[/bold]")
    console.print()

    # Format tweets for analysis
    formatted_posts = []
    for i, tweet in enumerate(all_tweets, 1):
        metrics = ""
        if tweet.get("likes") is not None:
            metrics = f" [Likes: {tweet.get('likes', 'N/A')}, RTs: {tweet.get('retweets', 'N/A')}, Replies: {tweet.get('replies', 'N/A')}]"
        formatted_posts.append(f"**Post {i} (@{tweet['username']}):**{metrics}\n{tweet['text']}")

    posts_text = "\n\n---\n\n".join(formatted_posts)
    usernames = ", ".join(set(t["username"] for t in all_tweets))
    date = datetime.now().strftime("%Y-%m-%d")

    # Load and fill prompt template
    prompt_content = load_prompt(prompt_template, {
        "posts": posts_text,
        "usernames": usernames,
        "date": date,
    })

    # Analyze with Grok
    console.print("[bold]🔍 Analyzing tweets with Grok...[/bold]")
    analysis = chat_completion(
        messages=[{"role": "user", "content": prompt_content}],
        system_prompt="You are an expert social media analyst and copywriting coach. Provide detailed, actionable insights.",
        temperature=0.7,
        max_tokens=4000,
    )
    console.print("   Analysis complete!")
    console.print()

    # Save report
    console.print("[bold]💾 Saving report...[/bold]")
    output_dir = settings.get("outputDir", "reports/daily-analysis")
    reports_dir = get_reports_dir(output_dir.replace("reports/", ""))

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    filename = f"analysis-{timestamp}.md"
    filepath = reports_dir / filename

    report_content = f"""# Daily Social Media Analysis Report

**Date:** {date}
**Accounts Analyzed:** {', '.join(f'@{a["username"]}' for a in accounts)}
**Generated:** {datetime.now().isoformat()}

---

{analysis}
"""

    filepath.write_text(report_content, encoding="utf-8")
    console.print(f"   Saved to: {filepath}")
    console.print()

    console.print(Panel.fit("✅ Daily analysis complete!", style="bold green"))


if __name__ == "__main__":
    main()
