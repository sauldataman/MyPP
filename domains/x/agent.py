"""
X (Twitter) Agent - Content management powered by Grok.

Uses Grok API (xAI) for:
- Analyzing mentions and engagement
- Generating reply drafts
- Identifying trending topics in your niche
- Scheduling content suggestions

Uses X API for:
- Fetching mentions, DMs, notifications
- Posting content
- Analytics data
"""

import json
import os
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
import urllib.request
import urllib.error

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.base_agent import BaseAgent
from core.handoff import HandoffTypes


@dataclass
class Tweet:
    """Represents a tweet."""
    id: str
    text: str
    author: str
    author_id: str
    created_at: str
    metrics: Dict = None
    reply_to: str = None

    def to_dict(self):
        return asdict(self)


class GrokClient:
    """
    Client for Grok API (xAI).

    Grok is particularly suited for X content because:
    1. Real-time knowledge of X trends
    2. Understanding of X culture and context
    3. Native integration potential
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('XAI_API_KEY') or os.environ.get('GROK_API_KEY')
        self.base_url = "https://api.x.ai/v1"
        self.model = "grok-2-latest"  # or grok-2-mini for faster/cheaper

    def _request(self, endpoint: str, payload: dict) -> dict:
        """Make API request to Grok."""
        if not self.api_key:
            return {"error": "No API key configured. Set XAI_API_KEY environment variable."}

        url = f"{self.base_url}/{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers=headers, method='POST')

        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8') if e.fp else str(e)
            return {"error": f"HTTP {e.code}: {error_body}"}
        except Exception as e:
            return {"error": str(e)}

    def chat(self, messages: List[Dict], temperature: float = 0.7) -> str:
        """
        Chat completion with Grok.

        Args:
            messages: List of {"role": "user/assistant/system", "content": "..."}
            temperature: 0-2, higher = more creative

        Returns:
            Response text or error message
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature
        }

        result = self._request("chat/completions", payload)

        if "error" in result:
            return f"[Grok Error: {result['error']}]"

        try:
            return result["choices"][0]["message"]["content"]
        except (KeyError, IndexError):
            return f"[Unexpected response: {result}]"

    def analyze_mentions(self, mentions: List[Tweet], context: str = "") -> Dict:
        """
        Analyze mentions and suggest responses.

        Returns:
            {
                "summary": "...",
                "priority_replies": [...],
                "sentiment": "positive/negative/mixed",
                "action_items": [...]
            }
        """
        if not mentions:
            return {"summary": "No mentions to analyze", "priority_replies": [], "action_items": []}

        mentions_text = "\n".join([
            f"- @{m.author}: \"{m.text}\" (engagement: {m.metrics})"
            for m in mentions[:20]  # Limit to 20 for context
        ])

        system_prompt = """You are an expert social media manager analyzing X (Twitter) mentions.
Analyze these mentions and provide:
1. A brief summary of the overall sentiment and themes
2. Which mentions need priority replies (high engagement, questions, opportunities)
3. Suggested reply drafts for priority mentions
4. Any action items (follow-ups, content ideas sparked, etc.)

Respond in JSON format."""

        user_prompt = f"""Context about the account: {context}

Recent mentions:
{mentions_text}

Analyze and respond in JSON with keys: summary, priority_replies (list of {{mention_author, mention_text, suggested_reply, priority_reason}}), sentiment, action_items"""

        response = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ])

        # Try to parse JSON from response
        try:
            # Find JSON in response
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

        return {"summary": response, "priority_replies": [], "action_items": []}

    def generate_thread(self, topic: str, style: str = "", length: int = 5) -> List[str]:
        """
        Generate a tweet thread on a topic.

        Args:
            topic: What to write about
            style: Writing style guidelines
            length: Number of tweets in thread

        Returns:
            List of tweet texts
        """
        system_prompt = f"""You are a skilled X (Twitter) content creator.
Generate a compelling thread that:
- Hooks readers with the first tweet
- Provides value in each tweet
- Keeps each tweet under 280 characters
- Ends with a call to action or takeaway
{f'Style: {style}' if style else ''}"""

        user_prompt = f"Write a {length}-tweet thread about: {topic}\n\nFormat: Return only the tweets, numbered 1/ 2/ 3/ etc."

        response = self.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ], temperature=0.8)

        # Parse tweets from response
        tweets = []
        for line in response.split('\n'):
            line = line.strip()
            # Match patterns like "1/" "1." "1)" or just numbered lines
            if re.match(r'^[\d]+[/\.\)]\s*', line):
                tweet_text = re.sub(r'^[\d]+[/\.\)]\s*', '', line).strip()
                if tweet_text and len(tweet_text) <= 280:
                    tweets.append(tweet_text)

        return tweets if tweets else [response[:280]]

    def suggest_reply(self, tweet: Tweet, tone: str = "friendly and helpful") -> str:
        """Generate a reply suggestion for a specific tweet."""
        prompt = f"""Generate a reply to this tweet. Keep it {tone}, under 280 chars.

Tweet from @{tweet.author}:
"{tweet.text}"

Reply:"""

        response = self.chat([{"role": "user", "content": prompt}], temperature=0.7)

        # Clean up response
        reply = response.strip().strip('"\'')
        return reply[:280] if reply else ""


class XClient:
    """
    Client for X (Twitter) API.

    Note: Requires X API credentials.
    For now, implements mock data for testing.
    Real implementation would use tweepy or direct API calls.
    """

    def __init__(self, bearer_token: str = None):
        self.bearer_token = bearer_token or os.environ.get('X_BEARER_TOKEN')
        self.base_url = "https://api.twitter.com/2"

    def _mock_mentions(self) -> List[Tweet]:
        """Mock mentions for testing when API not configured."""
        return [
            Tweet(
                id="1",
                text="@you This is amazing! How did you build this?",
                author="curious_dev",
                author_id="123",
                created_at=datetime.now().isoformat(),
                metrics={"likes": 5, "retweets": 2, "replies": 1}
            ),
            Tweet(
                id="2",
                text="@you Thanks for sharing, this helped me a lot!",
                author="grateful_user",
                author_id="456",
                created_at=datetime.now().isoformat(),
                metrics={"likes": 12, "retweets": 0, "replies": 0}
            ),
            Tweet(
                id="3",
                text="@you I disagree with your take on AI agents...",
                author="debate_lover",
                author_id="789",
                created_at=datetime.now().isoformat(),
                metrics={"likes": 3, "retweets": 1, "replies": 5}
            ),
        ]

    def get_mentions(self, since_hours: int = 24) -> List[Tweet]:
        """
        Fetch recent mentions.

        TODO: Implement actual X API call
        """
        if not self.bearer_token:
            # Return mock data for testing
            return self._mock_mentions()

        # Real implementation would be:
        # endpoint = f"{self.base_url}/users/{user_id}/mentions"
        # ...
        return self._mock_mentions()

    def get_notifications(self) -> Dict:
        """Fetch notification summary."""
        # TODO: Implement
        return {"new_followers": 0, "likes": 0, "retweets": 0, "replies": 0}

    def post_tweet(self, text: str, reply_to: str = None) -> Dict:
        """
        Post a tweet.

        TODO: Implement actual posting
        """
        if not self.bearer_token:
            return {"status": "mock", "message": "Would post: " + text[:50]}

        # Real implementation
        return {"status": "error", "message": "Not implemented"}

    def get_analytics(self, tweet_ids: List[str]) -> Dict:
        """Get engagement analytics for tweets."""
        # TODO: Implement
        return {}


class XAgent(BaseAgent):
    """
    Agent for X (Twitter) content management.

    Capabilities:
    1. Monitor mentions and notifications
    2. Analyze engagement with Grok
    3. Generate reply suggestions
    4. Create content (threads, tweets)
    5. Track performance
    """

    def __init__(self, domain_name: str = 'x', base_path: str = None):
        super().__init__(domain_name, base_path)

        # Load config
        self.config_file = self.domain_path / 'config.json'
        self.config = self._load_config()

        # Initialize clients
        self.grok = GrokClient(self.config.get('xai_api_key'))
        self.x_client = XClient(self.config.get('x_bearer_token'))

        # Data paths
        self.drafts_path = self.domain_path / 'drafts'
        self.drafts_path.mkdir(exist_ok=True)

        self.analytics_path = self.domain_path / 'analytics'
        self.analytics_path.mkdir(exist_ok=True)

    def _load_config(self) -> dict:
        """Load X agent configuration."""
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                return json.load(f)

        default = {
            "xai_api_key": "",  # Your xAI/Grok API key
            "x_bearer_token": "",  # Your X API bearer token
            "account_context": "Tech/AI content creator sharing insights about AI agents and productivity",
            "reply_tone": "friendly, helpful, and slightly witty",
            "auto_reply": False,  # Set True to auto-post replies (dangerous!)
            "priority_accounts": [],  # Always prioritize replies to these accounts
            "content_themes": ["AI", "productivity", "building in public"],
            "post_schedule": ["09:00", "13:00", "18:00"]  # Optimal posting times
        }

        with open(self.config_file, 'w') as f:
            json.dump(default, f, indent=2)

        return default

    def fetch_mentions(self) -> List[Tweet]:
        """Fetch and log recent mentions."""
        self.log_trace("Fetching mentions from X", 'source')
        mentions = self.x_client.get_mentions(since_hours=24)
        self.log_trace(f"Found {len(mentions)} mentions", 'data')
        return mentions

    def analyze_mentions(self, mentions: List[Tweet]) -> Dict:
        """Use Grok to analyze mentions."""
        self.log_trace("Analyzing mentions with Grok", 'analysis')

        context = self.config.get('account_context', '')
        analysis = self.grok.analyze_mentions(mentions, context)

        self.log_trace(f"Analysis complete: {analysis.get('sentiment', 'unknown')} sentiment", 'analysis')
        return analysis

    def generate_replies(self, priority_mentions: List[Dict]) -> List[Dict]:
        """Generate reply drafts for priority mentions."""
        self.log_trace(f"Generating {len(priority_mentions)} reply drafts", 'generation')

        replies = []
        tone = self.config.get('reply_tone', 'friendly')

        for mention in priority_mentions:
            tweet = Tweet(
                id=mention.get('id', ''),
                text=mention.get('mention_text', ''),
                author=mention.get('mention_author', ''),
                author_id='',
                created_at=datetime.now().isoformat()
            )

            # If Grok already suggested a reply, use that; otherwise generate new
            suggested = mention.get('suggested_reply')
            if not suggested:
                suggested = self.grok.suggest_reply(tweet, tone)

            replies.append({
                'mention': mention,
                'draft_reply': suggested,
                'status': 'pending_review'
            })

        return replies

    def save_drafts(self, replies: List[Dict]) -> Path:
        """Save reply drafts for review."""
        today = datetime.now().strftime('%Y-%m-%d')
        drafts_file = self.drafts_path / f"{today}-replies.json"

        # Load existing drafts
        existing = []
        if drafts_file.exists():
            with open(drafts_file, 'r') as f:
                existing = json.load(f)

        # Append new drafts
        existing.extend(replies)

        with open(drafts_file, 'w') as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        self.log_trace(f"Saved {len(replies)} drafts to {drafts_file}", 'output')
        return drafts_file

    def generate_content_ideas(self) -> List[Dict]:
        """Use Grok to generate content ideas based on themes."""
        themes = self.config.get('content_themes', [])
        if not themes:
            return []

        self.log_trace(f"Generating content ideas for themes: {themes}", 'generation')

        prompt = f"""Generate 3 tweet ideas for a {self.config.get('account_context', 'content creator')}.
Themes to cover: {', '.join(themes)}

For each idea, provide:
1. The hook (first line that grabs attention)
2. The main point
3. Whether it should be a thread or single tweet

Format as JSON array."""

        response = self.grok.chat([{"role": "user", "content": prompt}])

        try:
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

        return [{"raw_ideas": response}]

    def create_thread(self, topic: str) -> List[str]:
        """Create a thread on a topic."""
        self.log_trace(f"Creating thread on: {topic}", 'generation')

        style = self.config.get('account_context', '')
        thread = self.grok.generate_thread(topic, style, length=5)

        # Save thread draft
        today = datetime.now().strftime('%Y-%m-%d-%H%M')
        thread_file = self.drafts_path / f"thread-{today}.json"
        with open(thread_file, 'w') as f:
            json.dump({
                'topic': topic,
                'tweets': thread,
                'created_at': datetime.now().isoformat(),
                'status': 'draft'
            }, f, indent=2, ensure_ascii=False)

        return thread

    def run(self) -> dict:
        """
        Main execution:
        1. Fetch mentions
        2. Analyze with Grok
        3. Generate reply drafts
        4. Generate content ideas
        5. Create brief
        """
        results = {
            'mentions_count': 0,
            'priority_replies': 0,
            'drafts_saved': 0,
            'content_ideas': 0
        }

        # 1. Fetch mentions
        mentions = self.fetch_mentions()
        results['mentions_count'] = len(mentions)

        # 2. Analyze with Grok
        analysis = {}
        if mentions:
            analysis = self.analyze_mentions(mentions)

        # 3. Generate reply drafts for priority mentions
        priority = analysis.get('priority_replies', [])
        results['priority_replies'] = len(priority)

        if priority:
            replies = self.generate_replies(priority)
            drafts_file = self.save_drafts(replies)
            results['drafts_saved'] = len(replies)
            results['drafts_file'] = str(drafts_file)

        # 4. Generate content ideas
        ideas = self.generate_content_ideas()
        results['content_ideas'] = len(ideas)

        # 5. Send handoff if there are urgent items
        if results['priority_replies'] > 0:
            self.send_handoff(
                to_domain='personal',
                handoff_type=HandoffTypes.ALERT,
                payload={
                    'source': 'x',
                    'type': 'priority_mentions',
                    'count': results['priority_replies'],
                    'summary': analysis.get('summary', ''),
                    'drafts_file': results.get('drafts_file', '')
                }
            )

        # 6. Build brief
        brief = f"""**X Activity Summary**
- Mentions: {results['mentions_count']}
- Priority replies needed: {results['priority_replies']}
- Sentiment: {analysis.get('sentiment', 'N/A')}

"""
        if analysis.get('summary'):
            brief += f"**Summary**: {analysis['summary']}\n\n"

        if results['drafts_saved']:
            brief += f"**Drafts saved**: {results['drafts_file']}\n"

        if analysis.get('action_items'):
            brief += "**Action items**:\n" + "\n".join(f"- {item}" for item in analysis['action_items'])

        return {
            'status': 'success',
            'result': results,
            'brief': brief
        }


# CLI for standalone testing
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='X Agent - Twitter management with Grok')
    parser.add_argument('command', nargs='?', default='run',
                        choices=['run', 'mentions', 'thread', 'reply'],
                        help='Command to execute')
    parser.add_argument('--topic', '-t', help='Topic for thread generation')
    parser.add_argument('--tweet', help='Tweet text to reply to')

    args = parser.parse_args()

    agent = XAgent()

    if args.command == 'run':
        result = agent.execute()
        print(json.dumps(result, indent=2, ensure_ascii=False))

    elif args.command == 'mentions':
        mentions = agent.fetch_mentions()
        analysis = agent.analyze_mentions(mentions)
        print(json.dumps(analysis, indent=2, ensure_ascii=False))

    elif args.command == 'thread':
        if not args.topic:
            print("Error: --topic required for thread generation")
        else:
            thread = agent.create_thread(args.topic)
            for i, tweet in enumerate(thread, 1):
                print(f"\n{i}/ {tweet}")

    elif args.command == 'reply':
        if not args.tweet:
            print("Error: --tweet required for reply generation")
        else:
            tweet = Tweet(id='0', text=args.tweet, author='user', author_id='0',
                         created_at=datetime.now().isoformat())
            reply = agent.grok.suggest_reply(tweet)
            print(f"\nSuggested reply:\n{reply}")
