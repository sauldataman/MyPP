"""
Grok API client for X.AI.
"""

import json
from typing import Any

import httpx

from .config import get_env

GROK_API_BASE = "https://api.x.ai/v1"


def get_api_key() -> str:
    """Get Grok API key from environment."""
    return get_env("XAI_API_KEY") or get_env("GROK_API_KEY")


def chat_completion(
    messages: list[dict[str, str]],
    model: str = "grok-3-latest",
    temperature: float = 0.7,
    max_tokens: int = 4000,
    system_prompt: str | None = None,
) -> str:
    """
    Send a chat completion request to Grok API.

    Args:
        messages: List of message dicts with 'role' and 'content'
        model: Model to use (default: grok-3-latest)
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        system_prompt: Optional system prompt to prepend

    Returns:
        The assistant's response content
    """
    api_key = get_api_key()
    if not api_key:
        raise ValueError("GROK_API_KEY or XAI_API_KEY environment variable is required")

    # Prepend system message if provided
    all_messages = []
    if system_prompt:
        all_messages.append({"role": "system", "content": system_prompt})
    all_messages.extend(messages)

    response = httpx.post(
        f"{GROK_API_BASE}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": model,
            "messages": all_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=120.0,
    )

    response.raise_for_status()
    data = response.json()

    return data["choices"][0]["message"]["content"]


def fetch_user_tweets(
    username: str,
    hours_lookback: int = 24,
    max_posts: int = 50,
) -> list[dict[str, Any]]:
    """
    Fetch recent tweets from a user using Grok's real-time capabilities.

    Args:
        username: Twitter username (without @)
        hours_lookback: How many hours back to look
        max_posts: Maximum number of posts to fetch

    Returns:
        List of tweet dicts with text and metrics
    """
    prompt = f"""Get the most recent tweets from @{username} from the past {hours_lookback} hours.
Return up to {max_posts} tweets.
For each tweet, provide:
- The full tweet text
- Approximate engagement metrics if visible (likes, retweets, replies)

Format the response as a JSON array:
[
  {{
    "text": "tweet content here",
    "likes": 123,
    "retweets": 45,
    "replies": 12
  }}
]

Only return the JSON array, no other text."""

    try:
        response = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            system_prompt="You are a helpful assistant with real-time access to X/Twitter data. Return data in the exact JSON format requested.",
            temperature=0.1,
        )

        # Extract JSON from response
        import re
        json_match = re.search(r"\[[\s\S]*\]", response)
        if not json_match:
            return []

        tweets = json.loads(json_match.group())
        return [
            {
                "username": username,
                "text": t.get("text", ""),
                "likes": t.get("likes"),
                "retweets": t.get("retweets"),
                "replies": t.get("replies"),
            }
            for t in tweets
        ]
    except Exception as e:
        print(f"Error fetching tweets for @{username}: {e}")
        return []
