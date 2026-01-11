"""
Handoff protocol for inter-agent communication.

Key principle from Molly's design:
"Each operates in isolation... and exchanges context through explicit handoffs"

Handoffs are:
- Asynchronous: sender doesn't wait for receiver
- Persistent: stored on filesystem until consumed
- Typed: have a clear type that indicates intent
- Traceable: logged for debugging and improvement
"""

import json
import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


@dataclass
class Handoff:
    """
    A message passed between agents.

    Examples:
    - consumption -> content: "potential_material" (new video worth writing about)
    - finances -> personal: "alert" (unusual transaction detected)
    - health -> writing: "context" (low energy, suggest lighter tasks)
    """
    from_domain: str
    to_domain: str
    handoff_type: str
    payload: dict
    id: str = None
    timestamp: str = None
    priority: int = 0  # 0=normal, 1=high, 2=urgent

    def __post_init__(self):
        if self.id is None:
            self.id = str(uuid.uuid4())[:8]
        if self.timestamp is None:
            self.timestamp = datetime.now().isoformat()


# Common handoff types
class HandoffTypes:
    # Data sharing
    DATA = 'data'                    # Raw data to process
    MATERIAL = 'potential_material'  # Content worth using
    CONTEXT = 'context'              # Background info for decisions

    # Alerts and actions
    ALERT = 'alert'                  # Something needs attention
    ACTION_REQUEST = 'action_request'  # Request another agent to do something
    ACTION_RESULT = 'action_result'    # Result of a requested action

    # Coordination
    CHECKPOINT = 'checkpoint'        # Progress update
    BRIEF_CONTRIBUTION = 'brief'     # Contribution to daily brief


class HandoffQueue:
    """
    Filesystem-based queue for handoffs.

    Structure:
    handoffs/
      pending/
        {to_domain}/
          {timestamp}_{id}.json
      processed/
        {YYYY-MM-DD}/
          {timestamp}_{id}.json
    """

    def __init__(self, base_path: Path):
        self.base_path = Path(base_path)
        self.pending_path = self.base_path / 'pending'
        self.processed_path = self.base_path / 'processed'

        self.pending_path.mkdir(parents=True, exist_ok=True)
        self.processed_path.mkdir(parents=True, exist_ok=True)

    def send(self, handoff: Handoff):
        """Send a handoff to another domain."""
        # Create domain inbox if needed
        inbox = self.pending_path / handoff.to_domain
        inbox.mkdir(exist_ok=True)

        # Write handoff file
        filename = f"{handoff.timestamp.replace(':', '-')}_{handoff.id}.json"
        filepath = inbox / filename

        with open(filepath, 'w') as f:
            json.dump(asdict(handoff), f, indent=2)

    def receive(self, domain: str) -> list[Handoff]:
        """
        Receive all pending handoffs for a domain.
        Moves processed handoffs to archive.
        """
        inbox = self.pending_path / domain
        if not inbox.exists():
            return []

        handoffs = []
        today = datetime.now().strftime('%Y-%m-%d')
        archive = self.processed_path / today
        archive.mkdir(exist_ok=True)

        for filepath in sorted(inbox.glob('*.json')):
            with open(filepath, 'r') as f:
                data = json.load(f)
                handoffs.append(Handoff(**data))

            # Move to processed
            filepath.rename(archive / filepath.name)

        # Sort by priority (urgent first) then timestamp
        handoffs.sort(key=lambda h: (-h.priority, h.timestamp))
        return handoffs

    def peek(self, domain: str) -> list[Handoff]:
        """Peek at pending handoffs without consuming them."""
        inbox = self.pending_path / domain
        if not inbox.exists():
            return []

        handoffs = []
        for filepath in sorted(inbox.glob('*.json')):
            with open(filepath, 'r') as f:
                data = json.load(f)
                handoffs.append(Handoff(**data))

        return handoffs

    def get_stats(self) -> dict:
        """Get queue statistics."""
        stats = {'pending': {}, 'processed_today': 0}

        for domain_dir in self.pending_path.iterdir():
            if domain_dir.is_dir():
                count = len(list(domain_dir.glob('*.json')))
                if count > 0:
                    stats['pending'][domain_dir.name] = count

        today = datetime.now().strftime('%Y-%m-%d')
        today_archive = self.processed_path / today
        if today_archive.exists():
            stats['processed_today'] = len(list(today_archive.glob('*.json')))

        return stats
