"""
Consumption Agent - Monitors content consumption sources.

Sources:
- YouTube subscriptions & watch later
- Bilibili liked videos
- Podcasts (Xiaoyuzhou, etc.)
- Douban (books, movies)
- RSS feeds

This agent:
1. Collects new content from all sources
2. Analyzes relevance to current writing topics
3. Sends handoffs to content agent with potential material
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.base_agent import BaseAgent
from core.handoff import HandoffTypes


class ConsumptionAgent(BaseAgent):
    """
    Agent for monitoring content consumption.

    Molly's equivalent: Part of the data collection that feeds into ~/nox and ~/writing
    """

    def __init__(self, domain_name: str = 'consumption', base_path: str = None):
        super().__init__(domain_name, base_path)

        # Config for sources
        self.config_file = self.domain_path / 'config.json'
        self.config = self._load_config()

        # Data storage
        self.data_path = self.domain_path / 'data'
        self.data_path.mkdir(exist_ok=True)

    def _load_config(self) -> dict:
        """Load consumption source configuration."""
        if self.config_file.exists():
            with open(self.config_file, 'r') as f:
                return json.load(f)
        return {
            'youtube': {
                'enabled': True,
                'playlists': [],  # Add your playlist IDs
                'check_interval_minutes': 30
            },
            'bilibili': {
                'enabled': True,
                'uid': None,  # Add your Bilibili UID
                'check_interval_minutes': 30
            },
            'douban': {
                'enabled': True,
                'user_id': None,  # Add your Douban user ID
            },
            'rss': {
                'enabled': True,
                'feeds': []  # Add your RSS feed URLs
            }
        }

    def save_config(self):
        """Save configuration."""
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)

    def fetch_youtube(self) -> List[Dict]:
        """
        Fetch new YouTube videos from subscriptions/playlists.

        TODO: Implement actual YouTube API or yt-dlp integration
        """
        self.log_trace("Fetching YouTube updates", 'source')

        # Placeholder - implement your actual logic here
        # You already have YouTube scraper from your project
        return []

    def fetch_bilibili(self) -> List[Dict]:
        """
        Fetch new Bilibili liked videos.

        TODO: Implement actual Bilibili API integration
        """
        self.log_trace("Fetching Bilibili updates", 'source')

        # Placeholder - implement your actual logic here
        return []

    def fetch_douban(self) -> List[Dict]:
        """
        Fetch new Douban marked content (books, movies).

        TODO: Implement actual Douban scraping
        """
        self.log_trace("Fetching Douban updates", 'source')

        # Placeholder
        return []

    def fetch_rss(self) -> List[Dict]:
        """Fetch new RSS items."""
        self.log_trace("Fetching RSS updates", 'source')

        # Placeholder
        return []

    def analyze_relevance(self, items: List[Dict]) -> List[Dict]:
        """
        Analyze which items are relevant to current writing topics.

        Uses AI to score relevance and suggest angles.
        """
        if not items:
            return []

        # TODO: Call Claude to analyze relevance
        # For now, just return items with placeholder scores
        for item in items:
            item['relevance_score'] = 0.5
            item['suggested_angle'] = None

        return [item for item in items if item.get('relevance_score', 0) > 0.3]

    def run(self) -> dict:
        """
        Main execution: collect from all sources, analyze, send handoffs.
        """
        all_items = []

        # Collect from all enabled sources
        if self.config.get('youtube', {}).get('enabled'):
            all_items.extend(self.fetch_youtube())

        if self.config.get('bilibili', {}).get('enabled'):
            all_items.extend(self.fetch_bilibili())

        if self.config.get('douban', {}).get('enabled'):
            all_items.extend(self.fetch_douban())

        if self.config.get('rss', {}).get('enabled'):
            all_items.extend(self.fetch_rss())

        # Log what we found
        self.log_trace(f"Collected {len(all_items)} items from all sources", 'collection')

        # Save raw data
        today = datetime.now().strftime('%Y-%m-%d')
        data_file = self.data_path / f"{today}.json"

        existing = []
        if data_file.exists():
            with open(data_file, 'r') as f:
                existing = json.load(f)

        existing.extend(all_items)
        with open(data_file, 'w') as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)

        # Analyze and send handoffs to content agent
        relevant = self.analyze_relevance(all_items)

        for item in relevant:
            if item.get('relevance_score', 0) > 0.7:
                self.send_handoff(
                    to_domain='content',
                    handoff_type=HandoffTypes.MATERIAL,
                    payload={
                        'source': item.get('source', 'unknown'),
                        'title': item.get('title', ''),
                        'url': item.get('url', ''),
                        'relevance_score': item.get('relevance_score'),
                        'suggested_angle': item.get('suggested_angle'),
                        'summary': item.get('summary', '')
                    }
                )

        return {
            'status': 'success',
            'result': {
                'items_collected': len(all_items),
                'items_relevant': len(relevant),
                'handoffs_sent': len([i for i in relevant if i.get('relevance_score', 0) > 0.7])
            },
            'brief': f"Collected {len(all_items)} items, {len(relevant)} relevant, sent {len([i for i in relevant if i.get('relevance_score', 0) > 0.7])} to content"
        }


# Allow running standalone
if __name__ == '__main__':
    agent = ConsumptionAgent()
    result = agent.execute()
    print(json.dumps(result, indent=2))
