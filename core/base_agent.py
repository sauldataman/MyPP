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

    def spawn_subagent(self, task: str, context: dict = None,
                        use_claude_code: bool = False) -> dict:
        """
        Spawn a short-lived subagent for a specific task.

        Two modes:
        1. use_claude_code=True: Spawn a Claude Code process (full autonomy)
        2. use_claude_code=False: Use API call (simpler, faster)

        From Molly: "spawns short-lived subagents"
        """
        self.log_trace(f"Spawning subagent for: {task}", 'subagent')

        # Prepare context
        subagent_context = {
            'task': task,
            'context': context or {},
            'domain': self.domain_name,
            'timestamp': datetime.now().isoformat()
        }

        # Save context for reference
        context_file = self.domain_path / 'subagent_context.json'
        with open(context_file, 'w') as f:
            json.dump(subagent_context, f, indent=2)

        if use_claude_code:
            # Spawn Claude Code as subprocess
            return self._spawn_claude_code_subagent(task, context)
        else:
            # Use API call
            result = self.call_llm(
                prompt=f"Task: {task}\n\nContext: {json.dumps(context or {}, indent=2)}",
                system="You are a specialized subagent. Complete the task and return a structured result."
            )
            return {
                'status': 'completed',
                'task': task,
                'result': result
            }

    def _spawn_claude_code_subagent(self, task: str, context: dict = None) -> dict:
        """
        Spawn Claude Code as a subprocess for autonomous task execution.

        This is for complex tasks that need file access, tool use, etc.
        """
        # Create a prompt file for Claude Code
        prompt_file = self.domain_path / '.subagent_prompt.md'
        with open(prompt_file, 'w') as f:
            f.write(f"""# Subagent Task

You are a subagent spawned by the {self.domain_name} agent.

## Task
{task}

## Context
```json
{json.dumps(context or {}, indent=2)}
```

## Instructions
1. Complete the task
2. Write your result to {self.domain_path}/subagent_result.json
3. Exit when done

Do NOT ask for confirmation. Execute immediately.
""")

        try:
            # Run Claude Code with the prompt
            result = subprocess.run(
                ['claude', '-p', str(prompt_file), '--dangerously-skip-permissions'],
                cwd=str(self.domain_path),
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            # Try to read result file
            result_file = self.domain_path / 'subagent_result.json'
            if result_file.exists():
                with open(result_file, 'r') as f:
                    return json.load(f)

            return {
                'status': 'completed',
                'task': task,
                'stdout': result.stdout,
                'stderr': result.stderr
            }

        except subprocess.TimeoutExpired:
            return {'status': 'timeout', 'task': task}
        except FileNotFoundError:
            # Claude Code not installed
            return {
                'status': 'error',
                'task': task,
                'error': 'Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
            }
        except Exception as e:
            return {'status': 'error', 'task': task, 'error': str(e)}

    def call_llm(self, prompt: str, system: str = None,
                  provider: str = 'auto') -> str:
        """
        Call LLM API for quick tasks.

        Providers:
        - 'auto': Try Grok first, then Claude
        - 'grok': Use Grok (xAI)
        - 'claude': Use Claude (Anthropic)

        For longer autonomous tasks, use spawn_subagent instead.
        """
        self.log_trace(f"LLM call ({provider}): {prompt[:100]}...", 'llm')

        # Try Grok first if available
        if provider in ('auto', 'grok'):
            grok_key = os.environ.get('XAI_API_KEY') or os.environ.get('GROK_API_KEY')
            if grok_key:
                result = self._call_grok(prompt, system, grok_key)
                if not result.startswith('[Grok Error'):
                    return result
                elif provider == 'grok':
                    return result

        # Fall back to Claude
        if provider in ('auto', 'claude'):
            claude_key = os.environ.get('ANTHROPIC_API_KEY')
            if claude_key:
                return self._call_claude(prompt, system, claude_key)

        return "[Error: No LLM API key configured. Set XAI_API_KEY or ANTHROPIC_API_KEY]"

    def _call_grok(self, prompt: str, system: str, api_key: str) -> str:
        """Call Grok (xAI) API."""
        import urllib.request
        import urllib.error

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": "grok-2-latest",
            "messages": messages,
            "temperature": 0.7
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            "https://api.x.ai/v1/chat/completions",
            data=data, headers=headers, method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
                return result["choices"][0]["message"]["content"]
        except Exception as e:
            return f"[Grok Error: {e}]"

    def _call_claude(self, prompt: str, system: str, api_key: str) -> str:
        """Call Claude (Anthropic) API."""
        import urllib.request
        import urllib.error

        payload = {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}]
        }
        if system:
            payload["system"] = system

        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01"
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=data, headers=headers, method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode('utf-8'))
                return result["content"][0]["text"]
        except Exception as e:
            return f"[Claude Error: {e}]"

    # Alias for backwards compatibility
    def call_claude(self, prompt: str, system: str = None) -> str:
        """Alias for call_llm with claude provider."""
        return self.call_llm(prompt, system, provider='claude')

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
