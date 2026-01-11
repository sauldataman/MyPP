#!/usr/bin/env python3
"""
Personal Panopticon - Main Entry Point

Usage:
    python run.py                    # Run all agents in parallel
    python run.py --domain content   # Run specific agent
    python run.py --status           # Show system status
    python run.py --daemon           # Run as daemon with scheduling

From Molly's design:
"I run a swarm of eight instances in parallel... caffeinate -i keeps the
system awake on runs, in airports, while I sleep. On completion, it texts me."
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Optional: schedule for daemon mode
try:
    import schedule
    HAS_SCHEDULE = True
except ImportError:
    HAS_SCHEDULE = False

# Add project root to path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.orchestrator import Orchestrator
from core.handoff import HandoffQueue


def run_all(parallel: bool = True):
    """Run all agents once."""
    print(f"\n{'='*60}")
    print(f"🔭 Personal Panopticon - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    orchestrator = Orchestrator(str(PROJECT_ROOT))
    results = orchestrator.run_all(parallel=parallel)

    print(f"\n{'='*60}")
    print("Results:")
    for domain, result in results.items():
        status = "✅" if result.get('status') == 'success' else "❌"
        print(f"  {status} {domain}: {result.get('status')}")
    print(f"{'='*60}\n")

    return results


def run_domain(domain: str):
    """Run a specific domain agent."""
    print(f"\n🔭 Running {domain} agent...\n")

    orchestrator = Orchestrator(str(PROJECT_ROOT))
    result = orchestrator.run_agent(domain)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def show_status():
    """Show system status."""
    print(f"\n{'='*60}")
    print("🔭 Personal Panopticon Status")
    print(f"{'='*60}\n")

    orchestrator = Orchestrator(str(PROJECT_ROOT))

    # Discovered agents
    agents = orchestrator.discover_agents()
    print(f"📦 Discovered Agents ({len(agents)}):")
    for agent in agents:
        agent_path = PROJECT_ROOT / 'domains' / agent / 'state.json'
        if agent_path.exists():
            with open(agent_path, 'r') as f:
                state = json.load(f)
            last_run = state.get('last_run', 'Never')
            run_count = state.get('run_count', 0)
            print(f"   • {agent}: {run_count} runs, last: {last_run}")
        else:
            print(f"   • {agent}: Not yet initialized")

    # Handoff stats
    print(f"\n📬 Handoff Queue:")
    stats = orchestrator.handoff_queue.get_stats()
    if stats['pending']:
        for domain, count in stats['pending'].items():
            print(f"   • {domain}: {count} pending")
    else:
        print("   • No pending handoffs")
    print(f"   • Processed today: {stats['processed_today']}")

    # Recent briefs
    print(f"\n📋 Recent Briefs:")
    briefs_path = PROJECT_ROOT / 'briefs'
    if briefs_path.exists():
        briefs = sorted(briefs_path.glob('*.md'), reverse=True)[:5]
        for brief in briefs:
            print(f"   • {brief.name}")
    else:
        print("   • No briefs yet")

    print(f"\n{'='*60}\n")


def daemon_mode():
    """
    Run as a daemon with scheduled execution.

    Default schedule:
    - Every 30 min: consumption agent (data collection)
    - Every hour: content agent (queue management)
    - Daily 6am: finances agent (pre-market brief)
    - Daily 10pm: full run (end of day summary)
    """
    if not HAS_SCHEDULE:
        print("Error: 'schedule' package required for daemon mode.")
        print("Install with: pip install schedule")
        sys.exit(1)

    print("🔭 Starting Personal Panopticon Daemon...")
    print("   Press Ctrl+C to stop\n")

    orchestrator = Orchestrator(str(PROJECT_ROOT))

    def run_single(domain):
        print(f"[{datetime.now().strftime('%H:%M')}] Running {domain}...")
        try:
            orchestrator.run_agent(domain)
        except Exception as e:
            print(f"   Error: {e}")

    def run_full():
        print(f"[{datetime.now().strftime('%H:%M')}] Running full sweep...")
        try:
            orchestrator.run_all()
        except Exception as e:
            print(f"   Error: {e}")

    # Schedule jobs
    schedule.every(30).minutes.do(run_single, 'consumption')
    schedule.every().hour.do(run_single, 'content')
    schedule.every().day.at("06:00").do(run_single, 'finances')
    schedule.every().day.at("22:00").do(run_full)

    # Also run immediately
    run_full()

    # Keep running
    while True:
        schedule.run_pending()
        time.sleep(60)


def main():
    parser = argparse.ArgumentParser(
        description='Personal Panopticon - Your cognitive infrastructure',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python run.py                    # Run all agents
    python run.py -d content         # Run content agent only
    python run.py --status           # Show system status
    python run.py --daemon           # Run as daemon
        """
    )

    parser.add_argument('-d', '--domain', help='Run specific domain agent')
    parser.add_argument('-s', '--status', action='store_true', help='Show system status')
    parser.add_argument('--daemon', action='store_true', help='Run as daemon with scheduling')
    parser.add_argument('--sequential', action='store_true', help='Run agents sequentially')

    args = parser.parse_args()

    if args.status:
        show_status()
    elif args.daemon:
        daemon_mode()
    elif args.domain:
        run_domain(args.domain)
    else:
        run_all(parallel=not args.sequential)


if __name__ == '__main__':
    main()
