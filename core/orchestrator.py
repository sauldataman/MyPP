"""
Orchestrator for the Personal Panopticon.

Manages the swarm of agents:
- Runs agents in parallel
- Handles scheduling (cron-like)
- Aggregates results for daily brief
- Sends notifications
- Keeps system awake during runs (caffeinate)

From Molly's design:
"caffeinate -i keeps the system awake on runs, in airports, while I sleep.
On completion, it texts me; I reply to the checkpoint and continue."
"""

import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Type
import importlib.util

from .base_agent import BaseAgent
from .handoff import HandoffQueue


class Orchestrator:
    """
    Central orchestrator for all domain agents.

    Responsibilities:
    1. Discover and load agents from domains/
    2. Run agents in parallel
    3. Collect results and generate daily brief
    4. Handle notifications
    5. Manage system state (caffeinate, etc.)
    """

    def __init__(self, base_path: str = None):
        self.base_path = Path(base_path or os.environ.get('PANOPTICON_HOME', os.path.expanduser('~/panopticon')))
        self.domains_path = self.base_path / 'domains'
        self.briefs_path = self.base_path / 'briefs'
        self.logs_path = self.base_path / 'logs'
        self.handoff_queue = HandoffQueue(self.base_path / 'handoffs')

        # Ensure directories
        self.briefs_path.mkdir(parents=True, exist_ok=True)
        self.logs_path.mkdir(parents=True, exist_ok=True)

        # Loaded agents
        self.agents: Dict[str, BaseAgent] = {}

        # Caffeinate process handle
        self._caffeinate_proc = None

    def discover_agents(self) -> List[str]:
        """
        Discover all available agents in domains/.

        Each domain should have an agent.py with a class that inherits from BaseAgent.
        """
        discovered = []

        for domain_dir in self.domains_path.iterdir():
            if domain_dir.is_dir():
                agent_file = domain_dir / 'agent.py'
                if agent_file.exists():
                    discovered.append(domain_dir.name)

        return discovered

    def load_agent(self, domain_name: str) -> Optional[BaseAgent]:
        """Load an agent from a domain directory."""
        agent_file = self.domains_path / domain_name / 'agent.py'

        if not agent_file.exists():
            print(f"No agent.py found for domain: {domain_name}")
            return None

        # Dynamic import
        spec = importlib.util.spec_from_file_location(f"domains.{domain_name}.agent", agent_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules[f"domains.{domain_name}.agent"] = module
        spec.loader.exec_module(module)

        # Find the agent class (should be named {Domain}Agent)
        agent_class_name = f"{domain_name.title()}Agent"
        if hasattr(module, agent_class_name):
            agent_class = getattr(module, agent_class_name)
            agent = agent_class(domain_name, str(self.base_path))
            self.agents[domain_name] = agent
            return agent

        # Fallback: look for any BaseAgent subclass
        for name, obj in vars(module).items():
            if isinstance(obj, type) and issubclass(obj, BaseAgent) and obj is not BaseAgent:
                agent = obj(domain_name, str(self.base_path))
                self.agents[domain_name] = agent
                return agent

        print(f"No valid agent class found in {agent_file}")
        return None

    def load_all_agents(self) -> Dict[str, BaseAgent]:
        """Load all discovered agents."""
        for domain_name in self.discover_agents():
            self.load_agent(domain_name)
        return self.agents

    def start_caffeinate(self):
        """
        Keep system awake during runs.

        From Molly: "caffeinate -i keeps the system awake on runs"
        """
        if sys.platform == 'darwin':  # macOS
            self._caffeinate_proc = subprocess.Popen(['caffeinate', '-i'])
            print("☕ Caffeinate started - system will stay awake")

    def stop_caffeinate(self):
        """Stop caffeinate when done."""
        if self._caffeinate_proc:
            self._caffeinate_proc.terminate()
            self._caffeinate_proc = None
            print("☕ Caffeinate stopped")

    def run_agent(self, domain_name: str) -> dict:
        """Run a single agent and return its result."""
        if domain_name not in self.agents:
            if not self.load_agent(domain_name):
                return {'status': 'error', 'error': f'Agent not found: {domain_name}'}

        agent = self.agents[domain_name]
        return agent.execute()

    def run_all(self, parallel: bool = True, max_workers: int = 8) -> Dict[str, dict]:
        """
        Run all agents.

        From Molly: "I run a swarm of eight instances in parallel"
        """
        self.start_caffeinate()
        results = {}

        try:
            self.load_all_agents()

            if parallel and len(self.agents) > 1:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = {
                        executor.submit(agent.execute): name
                        for name, agent in self.agents.items()
                    }
                    for future in as_completed(futures):
                        domain_name = futures[future]
                        try:
                            results[domain_name] = future.result()
                        except Exception as e:
                            results[domain_name] = {'status': 'error', 'error': str(e)}
            else:
                for name, agent in self.agents.items():
                    results[name] = agent.execute()

        finally:
            self.stop_caffeinate()

        # Generate daily brief
        self.generate_brief(results)

        return results

    def generate_brief(self, results: Dict[str, dict]) -> Path:
        """
        Generate daily brief from all agent results.

        From Molly: "Every morning, a brief gets added in ~/trades"
        We generalize this to a unified brief with sections per domain.
        """
        today = datetime.now().strftime('%Y-%m-%d')
        brief_file = self.briefs_path / f"{today}.md"

        lines = [
            f"# Daily Brief - {today}",
            f"\nGenerated at {datetime.now().strftime('%H:%M:%S')}",
            f"\n## Summary\n"
        ]

        # Count successes/failures
        success = sum(1 for r in results.values() if r.get('status') == 'success')
        failed = sum(1 for r in results.values() if r.get('status') == 'error')
        lines.append(f"- **Agents run**: {len(results)} ({success} success, {failed} failed)")

        # Handoff stats
        handoff_stats = self.handoff_queue.get_stats()
        if handoff_stats['pending']:
            lines.append(f"- **Pending handoffs**: {handoff_stats['pending']}")
        lines.append(f"- **Handoffs processed today**: {handoff_stats['processed_today']}")

        # Per-domain sections
        lines.append("\n## Domain Reports\n")
        for domain, result in sorted(results.items()):
            status_emoji = "✅" if result.get('status') == 'success' else "❌"
            lines.append(f"### {status_emoji} {domain.title()}\n")

            if result.get('brief'):
                lines.append(result['brief'])
            elif result.get('error'):
                lines.append(f"**Error**: {result['error']}")
            elif result.get('result'):
                lines.append(f"```\n{json.dumps(result['result'], indent=2)}\n```")
            else:
                lines.append("_No output_")

            lines.append("")

        # Write brief
        with open(brief_file, 'w') as f:
            f.write('\n'.join(lines))

        print(f"📋 Brief generated: {brief_file}")
        return brief_file

    def notify(self, message: str, urgent: bool = False):
        """
        Send notification.

        From Molly: "On completion, it texts me"

        Implement your preferred notification method:
        - SMS (Twilio)
        - Telegram
        - Email
        - macOS notification
        """
        # macOS notification (fallback)
        if sys.platform == 'darwin':
            title = "🚨 Panopticon Alert" if urgent else "📊 Panopticon"
            subprocess.run([
                'osascript', '-e',
                f'display notification "{message}" with title "{title}"'
            ])

        # TODO: Add your preferred notification method
        # - Twilio SMS
        # - Telegram bot
        # - Email
        print(f"{'🚨' if urgent else '📊'} Notification: {message}")


def main():
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Personal Panopticon Orchestrator')
    parser.add_argument('command', choices=['run', 'status', 'brief'],
                        help='Command to execute')
    parser.add_argument('--domain', '-d', help='Specific domain to run')
    parser.add_argument('--sequential', '-s', action='store_true',
                        help='Run agents sequentially instead of parallel')

    args = parser.parse_args()

    orchestrator = Orchestrator()

    if args.command == 'run':
        if args.domain:
            result = orchestrator.run_agent(args.domain)
            print(json.dumps(result, indent=2))
        else:
            results = orchestrator.run_all(parallel=not args.sequential)
            print(f"\n✅ Completed. Check briefs/ for daily summary.")

    elif args.command == 'status':
        agents = orchestrator.discover_agents()
        print(f"Discovered agents: {agents}")
        stats = orchestrator.handoff_queue.get_stats()
        print(f"Handoff stats: {stats}")

    elif args.command == 'brief':
        # Just generate brief from last run
        results = {name: {'status': 'skipped'} for name in orchestrator.discover_agents()}
        orchestrator.generate_brief(results)


if __name__ == '__main__':
    main()
