# MyPP - My Personal Panopticon

Implementation of [Molly Cantillon's Personal Panopticon](https://docs.google.com/document/d/19-ajYTp2hwOW9WcirY9OIoSvMdfyivup8LMI92PkS20/edit) concept.

> "A panopticon still, but the tower belongs to you."

## Core Philosophy

States built legibility infrastructure to govern. Corporations built it to sell. Neither gave you the keys to the tower. This project reverses that asymmetry.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR                              │
│   - Runs agents in parallel (8 instances)                        │
│   - Manages scheduling (cron-like)                               │
│   - Aggregates daily briefs                                      │
│   - Sends notifications                                          │
│   - caffeinate -i (keeps system awake)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │CONSUMPTION│───────▶│ CONTENT  │        │ FINANCES │
    │  Agent   │handoff │  Agent   │        │  Agent   │
    │          │        │          │        │          │
    │ YouTube  │        │ Queue    │        │ Portfolio│
    │ Bilibili │        │ Priority │        │ Congress │
    │ Douban   │        │ Outlines │        │ Polymarket│
    │ RSS      │        │ Drafts   │        │ Sentiment│
    └──────────┘        └──────────┘        └──────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  HANDOFF QUEUE   │
                    │ (Filesystem-based)│
                    │                  │
                    │ pending/         │
                    │   {domain}/      │
                    │     *.json       │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   DAILY BRIEF    │
                    │   ~/briefs/      │
                    │   YYYY-MM-DD.md  │
                    └──────────────────┘
```

## Key Concepts

### 1. Domain Isolation
Each agent operates independently with its own:
- State (`state.json`)
- Configuration (`config.json`)
- Data storage (`data/`)
- Thought traces (`traces/`)

### 2. Explicit Handoffs
Agents communicate **only** through handoffs:
```python
self.send_handoff(
    to_domain='content',
    handoff_type='potential_material',
    payload={'title': '...', 'relevance_score': 0.87}
)
```

### 3. Thought Traces
All decisions are logged for recursive self-improvement:
```python
self.log_trace("Evaluating material: XYZ", 'evaluation')
```

### 4. Daily Briefs
Every morning, a unified brief aggregates insights from all agents.

## Quick Start

```bash
# Run all agents
python run.py

# Run specific agent
python run.py -d content

# Check system status
python run.py --status

# Run as daemon with scheduling
python run.py --daemon
```

## Directory Structure

```
MyPP/
├── core/
│   ├── base_agent.py      # Agent base class
│   ├── handoff.py         # Handoff protocol
│   └── orchestrator.py    # Central orchestrator
│
├── domains/
│   ├── consumption/       # Content consumption monitoring
│   │   ├── agent.py
│   │   ├── config.json
│   │   └── data/
│   │
│   ├── content/           # Writing queue management
│   │   ├── agent.py
│   │   ├── queue.json
│   │   └── suggestions/
│   │
│   ├── finances/          # Investment tracking
│   │   ├── agent.py
│   │   ├── config.json
│   │   └── briefs/        # ~/trades equivalent
│   │
│   ├── health/            # (TODO) WHOOP/sleep/exercise
│   ├── email/             # (TODO) Inbox zero
│   ├── personal/          # (TODO) Life admin
│   └── writing/           # (TODO) Long-form projects
│
├── handoffs/
│   ├── pending/           # Unprocessed handoffs
│   └── processed/         # Archived handoffs
│
├── briefs/                # Daily briefs
│   └── YYYY-MM-DD.md
│
├── artifacts/
│   └── decisions/         # Decision traces
│
└── run.py                 # Main entry point
```

## Creating a New Agent

```python
# domains/myagent/agent.py

from core.base_agent import BaseAgent

class MyagentAgent(BaseAgent):
    def __init__(self, domain_name: str = 'myagent', base_path: str = None):
        super().__init__(domain_name, base_path)
        # Your initialization

    def run(self) -> dict:
        # Your main logic

        # Log your thinking
        self.log_trace("Analyzing data...", 'analysis')

        # Send handoffs to other agents
        self.send_handoff('content', 'material', {'data': '...'})

        return {
            'status': 'success',
            'result': {...},
            'brief': 'Summary for daily brief'
        }
```

## Roadmap

- [x] Core architecture (base agent, handoffs, orchestrator)
- [x] Consumption agent (YouTube, Bilibili, Douban, RSS)
- [x] Content agent (writing queue, prioritization)
- [x] Finances agent (portfolio, congress trades, sentiment)
- [ ] Health agent (WHOOP integration, sleep tracking)
- [ ] Email agent (inbox zero automation)
- [ ] Claude API integration for analysis
- [ ] Desktop automation (mouse/keyboard injection)
- [ ] Notification system (SMS, Telegram, etc.)
- [ ] Web dashboard

## Philosophy Notes

From Molly's article:

> "There is a case for productive illegibility. For forgetting, for serendipity, for negative capability... Goodhart says optimize for a metric and you game your way to hollow victory."

Key safeguards:
1. **Human in the loop** - Critical decisions require confirmation
2. **Metis protection** - Keep the ability to override and delete modules
3. **Escape the loop** - The meta-level outside the system that can question the system itself

## License

MIT
