"""
Base Agent class for Personal Panopticon.

Each agent:
- Operates in isolation with its own state
- Can spawn short-lived subagents
- Exchanges context through explicit handoffs
- Reads and writes to the filesystem
- Logs all thought traces for recursive self-improvement
"""

import json
import os
import subprocess
import time
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, asdict

from .handoff import Handoff, HandoffQueue


@dataclass
class AgentState:
    """Persistent state for an agent."""
    last_run: Optional[str] = None
    run_count: int = 0
    last_error: Optional[str] = None
    custom_state: dict = None

    def __post_init__(self):
        if self.custom_state is None:
            self.custom_state = {}


class BaseAgent(ABC):
    """
    Base class for all domain agents.

    Molly's architecture:
    - 8 parallel instances: ~/nox, ~/metrics, ~/email, ~/growth, ~/trades, ~/health, ~/writing, ~/personal
    - Each operates in isolation
    - Spawns short-lived subagents
    - Exchanges context through explicit handoffs
    - All thought traces logged and artifacted for recursive self-improvement
    """

    def __init__(self, domain_name: str, base_path: str = None):
        self.domain_name = domain_name
        self.base_path = Path(base_path or os.environ.get('PANOPTICON_HOME', os.path.expanduser('~/panopticon')))
        self.domain_path = self.base_path / 'domains' / domain_name
        self.handoff_queue = HandoffQueue(self.base_path / 'handoffs')

        # Ensure directories exist
        self.domain_path.mkdir(parents=True, exist_ok=True)
        (self.domain_path / 'inbox').mkdir(exist_ok=True)
        (self.domain_path / 'outbox').mkdir(exist_ok=True)
        (self.domain_path / 'traces').mkdir(exist_ok=True)

        # Load or initialize state
        self.state = self._load_state()

    def _load_state(self) -> AgentState:
        """Load agent state from disk."""
        state_file = self.domain_path / 'state.json'
        if state_file.exists():
            with open(state_file, 'r') as f:
                data = json.load(f)
                return AgentState(**data)
        return AgentState()

    def _save_state(self):
        """Persist agent state to disk."""
        state_file = self.domain_path / 'state.json'
        with open(state_file, 'w') as f:
            json.dump(asdict(self.state), f, indent=2, default=str)

    def log_trace(self, thought: str, category: str = 'general'):
        """
        Log a thought trace for recursive self-improvement.

        This is crucial - Molly emphasizes:
        "All thought traces logged and artifacted for recursive self-improvement"
        """
        trace_file = self.domain_path / 'traces' / f"{datetime.now().strftime('%Y-%m-%d')}.jsonl"
        trace_entry = {
            'timestamp': datetime.now().isoformat(),
            'domain': self.domain_name,
            'category': category,
            'thought': thought
        }
        with open(trace_file, 'a') as f:
            f.write(json.dumps(trace_entry) + '\n')

    def send_handoff(self, to_domain: str, payload: dict, handoff_type: str = 'data'):
        """
        Send a handoff to another domain.

        Handoffs are the ONLY way agents communicate.
        This ensures isolation while allowing coordination.
        """
        handoff = Handoff(
            from_domain=self.domain_name,
            to_domain=to_domain,
            handoff_type=handoff_type,
            payload=payload
        )
        self.handoff_queue.send(handoff)
        self.log_trace(f"Sent handoff to {to_domain}: {handoff_type}", 'handoff')

    def receive_handoffs(self) -> list[Handoff]:
        """Receive all pending handoffs for this domain."""
        handoffs = self.handoff_queue.receive(self.domain_name)
        for h in handoffs:
            self.log_trace(f"Received handoff from {h.from_domain}: {h.handoff_type}", 'handoff')
        return handoffs

    def spawn_subagent(self, task: str, context: dict = None) -> dict:
        """
        Spawn a short-lived subagent for a specific task.

        Uses Claude Code in headless mode to execute the task.
        Returns the result when complete.
        """
        self.log_trace(f"Spawning subagent for: {task}", 'subagent')

        # Prepare context file
        context_file = self.domain_path / 'subagent_context.json'
        with open(context_file, 'w') as f:
            json.dump({
                'task': task,
                'context': context or {},
                'domain': self.domain_name,
                'timestamp': datetime.now().isoformat()
            }, f)

        # In a real implementation, this would call Claude Code
        # For now, return a placeholder
        # TODO: Integrate with actual Claude Code CLI
        return {
            'status': 'completed',
            'task': task,
            'result': None,
            'note': 'Implement Claude Code integration'
        }

    def call_claude(self, prompt: str, system: str = None) -> str:
        """
        Call Claude API directly for quick tasks.

        For longer tasks, use spawn_subagent instead.
        """
        # TODO: Implement actual API call
        # This is a placeholder - you'll need to add your API key
        self.log_trace(f"Claude call: {prompt[:100]}...", 'llm')
        return "TODO: Implement Claude API integration"

    @abstractmethod
    def run(self) -> dict:
        """
        Main execution loop for the agent.

        Returns a dict with:
        - status: 'success' | 'error' | 'pending'
        - result: any relevant output
        - brief: optional summary for daily brief
        """
        pass

    def execute(self) -> dict:
        """
        Execute the agent with proper state management.

        This is the entry point called by the orchestrator.
        """
        start_time = datetime.now()
        self.log_trace(f"Starting execution", 'lifecycle')

        try:
            # Process incoming handoffs first
            handoffs = self.receive_handoffs()
            if handoffs:
                self.log_trace(f"Processing {len(handoffs)} handoffs", 'lifecycle')

            # Run the main agent logic
            result = self.run()

            # Update state
            self.state.last_run = start_time.isoformat()
            self.state.run_count += 1
            self.state.last_error = None
            self._save_state()

            self.log_trace(f"Execution complete: {result.get('status')}", 'lifecycle')
            return result

        except Exception as e:
            self.state.last_error = str(e)
            self._save_state()
            self.log_trace(f"Execution failed: {e}", 'error')
            return {'status': 'error', 'error': str(e)}
