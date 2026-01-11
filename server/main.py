"""
FastAPI server for Personal Panopticon.

Provides REST API for:
- Running agents manually or on schedule
- Viewing briefs and status
- Managing configuration
- Real-time updates via WebSocket

Deploy to Railway with:
    railway up
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import get_config, Config
from core.database.db import get_database, Database
from core.providers.llm_router import get_router, LLMRouter, TaskType
from core.orchestrator import Orchestrator


# ============================================================================
# Lifespan and app setup
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    config = get_config()
    print(f"🔭 Starting Panopticon Server ({config.env})")
    print(f"   Database: {config.database.backend}")
    print(f"   LLM Providers: {get_router().get_available_providers()}")

    yield

    # Shutdown
    print("🔭 Shutting down...")


app = FastAPI(
    title="Personal Panopticon API",
    description="Your cognitive infrastructure, exposed as an API",
    version="0.1.0",
    lifespan=lifespan
)

# CORS for frontend
config = get_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.server.cors_origins + ["*"],  # TODO: tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Dependencies
# ============================================================================

def get_db() -> Database:
    """Dependency for database."""
    return get_database()


def get_llm() -> LLMRouter:
    """Dependency for LLM router."""
    return get_router()


def verify_api_key(x_api_key: str = Header(None)) -> bool:
    """Optional API key authentication."""
    config = get_config()
    if not config.server.api_key:
        return True  # No key configured = open
    if x_api_key != config.server.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


# ============================================================================
# Models
# ============================================================================

class RunAgentRequest(BaseModel):
    domain: str
    force: bool = False


class RunAllRequest(BaseModel):
    parallel: bool = True


class ChatRequest(BaseModel):
    prompt: str
    system: Optional[str] = None
    task: Optional[str] = None  # analysis, generation, quick, coding
    provider: Optional[str] = None  # grok, claude, ollama


class ChatResponse(BaseModel):
    content: str
    provider: str
    model: str
    tokens: int
    cost_usd: float
    latency_ms: int


class StatusResponse(BaseModel):
    env: str
    agents: List[str]
    llm_providers: List[str]
    database: str
    uptime: str


class BriefResponse(BaseModel):
    date: str
    content: str
    domains: List[str]


# ============================================================================
# Routes
# ============================================================================

@app.get("/")
async def root():
    """Health check."""
    return {"status": "ok", "service": "panopticon", "time": datetime.now().isoformat()}


@app.get("/status", response_model=StatusResponse)
async def get_status(db: Database = Depends(get_db), llm: LLMRouter = Depends(get_llm)):
    """Get system status."""
    config = get_config()
    orchestrator = Orchestrator()

    return StatusResponse(
        env=config.env,
        agents=orchestrator.discover_agents(),
        llm_providers=llm.get_available_providers(),
        database=config.database.backend,
        uptime="running"  # TODO: track actual uptime
    )


@app.get("/config")
async def get_config_endpoint(auth: bool = Depends(verify_api_key)):
    """Get current configuration (sanitized)."""
    return get_config().to_dict()


# ============================================================================
# Agent endpoints
# ============================================================================

@app.get("/agents")
async def list_agents():
    """List all available agents."""
    orchestrator = Orchestrator()
    agents = orchestrator.discover_agents()

    result = []
    for name in agents:
        state = orchestrator.agents.get(name)
        result.append({
            "name": name,
            "last_run": state.state.last_run if state else None,
            "run_count": state.state.run_count if state else 0
        })

    return {"agents": result}


@app.post("/agents/run")
async def run_agent(
    request: RunAgentRequest,
    background_tasks: BackgroundTasks,
    auth: bool = Depends(verify_api_key)
):
    """Run a specific agent."""
    orchestrator = Orchestrator()

    if request.domain not in orchestrator.discover_agents():
        raise HTTPException(status_code=404, detail=f"Agent not found: {request.domain}")

    # Run in background
    background_tasks.add_task(orchestrator.run_agent, request.domain)

    return {"status": "started", "domain": request.domain}


@app.post("/agents/run-all")
async def run_all_agents(
    request: RunAllRequest,
    background_tasks: BackgroundTasks,
    auth: bool = Depends(verify_api_key)
):
    """Run all agents."""
    orchestrator = Orchestrator()

    background_tasks.add_task(orchestrator.run_all, request.parallel)

    return {"status": "started", "agents": orchestrator.discover_agents()}


@app.get("/agents/{domain}/status")
async def get_agent_status(domain: str, db: Database = Depends(get_db)):
    """Get status of a specific agent."""
    runs = db.get_runs(domain, limit=10)

    return {
        "domain": domain,
        "recent_runs": [
            {
                "id": r.id,
                "started_at": r.started_at,
                "status": r.status,
                "tokens_used": r.tokens_used,
                "cost_usd": r.cost_usd
            }
            for r in runs
        ]
    }


# ============================================================================
# Brief endpoints
# ============================================================================

@app.get("/briefs")
async def list_briefs(limit: int = 7, db: Database = Depends(get_db)):
    """List recent briefs."""
    # TODO: Add method to get multiple briefs
    today = datetime.now().strftime('%Y-%m-%d')
    brief = db.get_brief(today)

    if brief:
        return {"briefs": [{"date": brief.date, "preview": brief.content[:200]}]}
    return {"briefs": []}


@app.get("/briefs/{date}")
async def get_brief(date: str, db: Database = Depends(get_db)):
    """Get a specific brief."""
    brief = db.get_brief(date)

    if not brief:
        raise HTTPException(status_code=404, detail=f"Brief not found for {date}")

    return BriefResponse(
        date=brief.date,
        content=brief.content,
        domains=[]  # TODO: parse domains_included
    )


@app.get("/briefs/today")
async def get_today_brief(db: Database = Depends(get_db)):
    """Get today's brief."""
    today = datetime.now().strftime('%Y-%m-%d')
    return await get_brief(today, db)


# ============================================================================
# LLM endpoints
# ============================================================================

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, llm: LLMRouter = Depends(get_llm)):
    """Direct chat with LLM (for testing/ad-hoc queries)."""
    task = None
    if request.task:
        task = TaskType(request.task)

    response = llm.chat(
        prompt=request.prompt,
        system=request.system,
        task=task,
        provider=request.provider
    )

    return ChatResponse(
        content=response.content,
        provider=response.provider,
        model=response.model,
        tokens=response.input_tokens + response.output_tokens,
        cost_usd=response.cost_usd,
        latency_ms=response.latency_ms
    )


@app.get("/llm/stats")
async def get_llm_stats(llm: LLMRouter = Depends(get_llm)):
    """Get LLM usage statistics."""
    return llm.get_stats()


@app.get("/llm/providers")
async def list_llm_providers(llm: LLMRouter = Depends(get_llm)):
    """List available LLM providers."""
    return {"providers": llm.get_available_providers()}


# ============================================================================
# Handoff endpoints
# ============================================================================

@app.get("/handoffs")
async def list_handoffs(domain: Optional[str] = None, db: Database = Depends(get_db)):
    """List pending handoffs."""
    if domain:
        handoffs = db.get_pending_handoffs(domain)
    else:
        # Get all pending handoffs (across all domains)
        handoffs = []
        orchestrator = Orchestrator()
        for agent_domain in orchestrator.discover_agents():
            handoffs.extend(db.get_pending_handoffs(agent_domain))

    return {
        "handoffs": [
            {
                "id": h.id,
                "from": h.from_domain,
                "to": h.to_domain,
                "type": h.handoff_type,
                "created_at": h.created_at
            }
            for h in handoffs
        ]
    }


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("DEBUG", "false").lower() == "true"
    )
