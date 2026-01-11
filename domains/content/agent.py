"""
Content Agent - Manages content creation workflow.

Responsibilities:
1. Receive material suggestions from consumption agent
2. Manage writing queue and priorities
3. Generate draft outlines
4. Track publication status
5. Analyze content performance

This is one of the most important agents in your personal panopticon.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from core.base_agent import BaseAgent
from core.handoff import Handoff, HandoffTypes


class ContentAgent(BaseAgent):
    """
    Agent for content creation management.

    Molly's equivalent: ~/writing + ~/nox (for NOX product)
    """

    def __init__(self, domain_name: str = 'content', base_path: str = None):
        super().__init__(domain_name, base_path)

        # Writing queue
        self.queue_file = self.domain_path / 'queue.json'
        self.queue = self._load_queue()

        # Published content tracking
        self.published_file = self.domain_path / 'published.json'

        # Writing style reference
        self.style_file = self.domain_path / 'style.md'

    def _load_queue(self) -> List[Dict]:
        """Load writing queue."""
        if self.queue_file.exists():
            with open(self.queue_file, 'r') as f:
                return json.load(f)
        return []

    def _save_queue(self):
        """Save writing queue."""
        with open(self.queue_file, 'w') as f:
            json.dump(self.queue, f, indent=2, ensure_ascii=False)

    def add_to_queue(self, item: Dict):
        """Add an item to the writing queue."""
        item['added_at'] = datetime.now().isoformat()
        item['status'] = 'queued'
        self.queue.append(item)
        self._save_queue()
        self.log_trace(f"Added to queue: {item.get('title', 'untitled')}", 'queue')

    def process_material_handoff(self, handoff: Handoff):
        """
        Process incoming material suggestions from consumption agent.

        Decides whether to:
        - Add to writing queue
        - Merge with existing topic
        - Discard as low priority
        """
        payload = handoff.payload
        title = payload.get('title', '')
        relevance = payload.get('relevance_score', 0)

        self.log_trace(f"Evaluating material: {title} (relevance: {relevance})", 'evaluation')

        # Check if similar topic exists in queue
        similar = self._find_similar_topic(title)

        if similar:
            # Merge as supporting material
            similar.setdefault('supporting_materials', []).append({
                'title': title,
                'url': payload.get('url'),
                'source': payload.get('source'),
                'added_at': datetime.now().isoformat()
            })
            self._save_queue()
            self.log_trace(f"Merged as supporting material for: {similar.get('title')}", 'queue')
        else:
            # Add as new topic
            self.add_to_queue({
                'title': payload.get('suggested_angle') or title,
                'source_title': title,
                'source_url': payload.get('url'),
                'source_type': payload.get('source'),
                'relevance_score': relevance,
                'summary': payload.get('summary', '')
            })

    def _find_similar_topic(self, title: str) -> Optional[Dict]:
        """Find a similar topic in the queue."""
        # TODO: Use embeddings for semantic similarity
        # For now, simple keyword matching
        title_lower = title.lower()
        for item in self.queue:
            if item.get('status') != 'queued':
                continue
            item_title = item.get('title', '').lower()
            # Very basic similarity check
            common_words = set(title_lower.split()) & set(item_title.split())
            if len(common_words) >= 2:
                return item
        return None

    def prioritize_queue(self):
        """
        Re-prioritize the writing queue based on:
        - Relevance scores
        - Time sensitivity
        - Supporting materials count
        - Current trends
        """
        self.log_trace("Prioritizing queue", 'queue')

        for item in self.queue:
            if item.get('status') != 'queued':
                continue

            score = item.get('relevance_score', 0.5)

            # Boost for more supporting materials
            materials_count = len(item.get('supporting_materials', []))
            score += materials_count * 0.1

            # Decay for age (older items get lower priority)
            added_at = item.get('added_at')
            if added_at:
                age_days = (datetime.now() - datetime.fromisoformat(added_at)).days
                score -= age_days * 0.02

            item['priority_score'] = max(0, min(1, score))

        # Sort by priority
        self.queue.sort(key=lambda x: x.get('priority_score', 0), reverse=True)
        self._save_queue()

    def generate_outline(self, queue_item: Dict) -> str:
        """
        Generate a writing outline for a queued topic.

        TODO: Integrate with Claude API for actual outline generation.
        """
        self.log_trace(f"Generating outline for: {queue_item.get('title')}", 'generation')

        # Placeholder - implement actual Claude call
        outline = f"""
# {queue_item.get('title')}

## 核心观点
- [待填充]

## 素材来源
- {queue_item.get('source_title')} ({queue_item.get('source_url')})

## 结构
1. 引入
2. 主体论述
3. 案例/证据
4. 结论

## 支撑材料
"""
        for material in queue_item.get('supporting_materials', []):
            outline += f"- {material.get('title')}\n"

        return outline

    def get_daily_suggestions(self) -> List[Dict]:
        """
        Get today's writing suggestions.

        Returns top 3 topics from the queue with outlines.
        """
        self.prioritize_queue()

        queued = [item for item in self.queue if item.get('status') == 'queued']
        top_3 = queued[:3]

        suggestions = []
        for item in top_3:
            suggestions.append({
                'title': item.get('title'),
                'priority_score': item.get('priority_score'),
                'outline': self.generate_outline(item),
                'supporting_materials': len(item.get('supporting_materials', []))
            })

        return suggestions

    def run(self) -> dict:
        """
        Main execution:
        1. Process incoming handoffs
        2. Prioritize queue
        3. Generate daily suggestions
        """
        # Process handoffs
        handoffs = self.receive_handoffs()
        materials_received = 0

        for handoff in handoffs:
            if handoff.handoff_type == HandoffTypes.MATERIAL:
                self.process_material_handoff(handoff)
                materials_received += 1

        # Prioritize and get suggestions
        suggestions = self.get_daily_suggestions()

        # Save suggestions to daily file
        today = datetime.now().strftime('%Y-%m-%d')
        suggestions_file = self.domain_path / 'suggestions' / f"{today}.json"
        suggestions_file.parent.mkdir(exist_ok=True)

        with open(suggestions_file, 'w') as f:
            json.dump(suggestions, f, indent=2, ensure_ascii=False)

        # Generate brief
        brief = f"""
**Writing Queue Status**
- Total queued: {len([i for i in self.queue if i.get('status') == 'queued'])}
- Materials received today: {materials_received}

**Today's Top 3 Suggestions:**
"""
        for i, s in enumerate(suggestions, 1):
            brief += f"\n{i}. **{s['title']}** (score: {s['priority_score']:.2f})"

        return {
            'status': 'success',
            'result': {
                'queue_size': len(self.queue),
                'materials_received': materials_received,
                'suggestions': suggestions
            },
            'brief': brief
        }


# Allow running standalone
if __name__ == '__main__':
    agent = ContentAgent()
    result = agent.execute()
    print(json.dumps(result, indent=2, ensure_ascii=False))
