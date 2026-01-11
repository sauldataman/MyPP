# MyPP - My Personal Panopticon

Implementation of [Molly Cantillon's Personal Panopticon](https://docs.google.com/document/d/19-ajYTp2hwOW9WcirY9OIoSvMdfyivup8LMI92PkS20/edit) concept.

> "A panopticon still, but the tower belongs to you."

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DEPLOYMENT                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐         │
│  │   VERCEL    │        │   RAILWAY   │        │    LOCAL    │         │
│  │  (Frontend) │◀──────▶│  (Backend)  │        │    (Dev)    │         │
│  │             │        │             │        │             │         │
│  │  Next.js    │        │  Node.js    │        │  Docker     │         │
│  │  Dashboard  │        │  Express    │        │  Compose    │         │
│  └─────────────┘        └──────┬──────┘        └──────┬──────┘         │
│                                │                      │                 │
│                                ▼                      ▼                 │
│                       ┌────────────────────────────────────┐           │
│                       │           ASYNC JOBS               │           │
│                       │  ┌─────────┐    ┌─────────┐       │           │
│                       │  │ BullMQ  │    │  Cron   │       │           │
│                       │  │ (Redis) │    │Scheduler│       │           │
│                       │  └─────────┘    └─────────┘       │           │
│                       └────────────────────────────────────┘           │
│                                │                                        │
│                                ▼                                        │
│                       ┌────────────────────────────────────┐           │
│                       │           LLM ROUTER               │           │
│                       │  ┌───────┬───────┬───────┬──────┐ │           │
│                       │  │Gemini │ Grok  │Claude │Ollama│ │           │
│                       │  └───────┴───────┴───────┴──────┘ │           │
│                       └────────────────────────────────────┘           │
│                                │                                        │
│                                ▼                                        │
│                       ┌────────────────────────────────────┐           │
│                       │          PostgreSQL                │           │
│                       │     (unified local + prod)         │           │
│                       └────────────────────────────────────┘           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL (Prisma ORM) |
| Job Queue | BullMQ + Redis |
| Scheduler | node-cron |
| LLM | Gemini, Grok, Claude, Ollama |

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start local services (PostgreSQL + Redis)

```bash
docker-compose up -d
```

### 3. Setup database

```bash
cd packages/server
cp ../../.env.example .env
# Edit .env with your API keys

pnpm db:push    # Create tables
```

### 4. Run development servers

```bash
# Terminal 1: Backend
pnpm dev:server

# Terminal 2: Frontend
pnpm dev:web
```

Open http://localhost:3000 for the dashboard.

## Project Structure

```
MyPP/
├── packages/
│   └── server/              # Node.js backend
│       ├── src/
│       │   ├── agents/      # Agent implementations
│       │   ├── lib/         # Core libraries
│       │   │   ├── llm-router.ts   # Multi-provider LLM
│       │   │   ├── queue.ts        # BullMQ jobs
│       │   │   └── scheduler.ts    # Cron jobs
│       │   └── routes/      # API endpoints
│       └── prisma/          # Database schema
│
├── frontend/                # Next.js dashboard
│   └── app/
│       └── page.tsx         # Main dashboard
│
├── docker-compose.yml       # Local PostgreSQL + Redis
└── .env.example             # Environment template
```

## Creating an Agent

```typescript
// packages/server/src/agents/my-agent.ts
import { BaseAgent, AgentResult, AgentContext } from "./base-agent.js";

export class MyAgent extends BaseAgent {
  name = "my-agent";
  description = "Does something useful";

  async run(context: AgentContext): Promise<AgentResult> {
    // 1. Call LLM
    const analysis = await this.callLLM("Analyze this...", {
      task: "analysis",
      provider: "gemini", // or "grok", "claude", "ollama"
    });

    // 2. Send handoff to another agent
    await this.sendHandoff("content", "material", { data: analysis });

    // 3. Return result
    return {
      status: "success",
      brief: "Summary for daily brief",
      tokensUsed: this.tokensUsed,
      costUsd: this.costUsd,
    };
  }
}
```

## Deployment

### Railway (Backend)

```bash
railway login
railway init
railway add  # PostgreSQL
railway add  # Redis
railway variables set GEMINI_API_KEY=xxx
railway up
```

### Vercel (Frontend)

```bash
cd frontend
vercel
# Set NEXT_PUBLIC_API_URL=https://your-app.railway.app
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | System status |
| `/agents` | GET | List agents |
| `/agents/:name/run` | POST | Run agent |
| `/jobs/stats` | GET | Queue statistics |
| `/llm/providers` | GET | Available LLM providers |

## Philosophy

From Molly's article:

> "There is a case for productive illegibility... Goodhart says optimize for a metric and you game your way to hollow victory."

Key safeguards:
1. **Human in the loop** - Critical decisions require confirmation
2. **Metis protection** - Keep the ability to override and delete modules
3. **Escape the loop** - The meta-level that can question the system itself

## License

MIT
