"""
Database abstraction layer for Personal Panopticon.

Supports:
- SQLite (local development)
- PostgreSQL (Railway production)
- In-memory (testing)

Handles:
- Agent state persistence
- Handoff queue
- Briefs storage
- Traces/logs
"""

import json
import os
import sqlite3
from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


@dataclass
class AgentRun:
    """Record of an agent execution."""
    id: Optional[int] = None
    domain: str = ""
    started_at: str = ""
    completed_at: str = ""
    status: str = ""  # success, error, timeout
    result: str = ""  # JSON
    brief: str = ""
    error: str = ""
    tokens_used: int = 0
    cost_usd: float = 0.0


@dataclass
class HandoffRecord:
    """Database record for a handoff."""
    id: Optional[int] = None
    from_domain: str = ""
    to_domain: str = ""
    handoff_type: str = ""
    payload: str = ""  # JSON
    created_at: str = ""
    processed_at: str = ""
    status: str = "pending"  # pending, processed, failed


@dataclass
class BriefRecord:
    """Daily brief record."""
    id: Optional[int] = None
    date: str = ""
    content: str = ""
    domains_included: str = ""  # JSON list
    created_at: str = ""


class Database(ABC):
    """Abstract database interface."""

    @abstractmethod
    def init_schema(self):
        """Initialize database schema."""
        pass

    # Agent runs
    @abstractmethod
    def save_run(self, run: AgentRun) -> int:
        pass

    @abstractmethod
    def get_runs(self, domain: str = None, limit: int = 100) -> List[AgentRun]:
        pass

    # Handoffs
    @abstractmethod
    def save_handoff(self, handoff: HandoffRecord) -> int:
        pass

    @abstractmethod
    def get_pending_handoffs(self, domain: str) -> List[HandoffRecord]:
        pass

    @abstractmethod
    def mark_handoff_processed(self, handoff_id: int):
        pass

    # Briefs
    @abstractmethod
    def save_brief(self, brief: BriefRecord) -> int:
        pass

    @abstractmethod
    def get_brief(self, date: str) -> Optional[BriefRecord]:
        pass

    # State (key-value for agent state)
    @abstractmethod
    def set_state(self, domain: str, key: str, value: Any):
        pass

    @abstractmethod
    def get_state(self, domain: str, key: str) -> Any:
        pass


class SQLiteDatabase(Database):
    """SQLite implementation for local development."""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or os.environ.get(
            'SQLITE_PATH',
            str(Path.cwd() / 'data' / 'panopticon.db')
        )
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.init_schema()

    @contextmanager
    def _connection(self):
        """Get database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def init_schema(self):
        """Create tables if not exist."""
        with self._connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    domain TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    status TEXT,
                    result TEXT,
                    brief TEXT,
                    error TEXT,
                    tokens_used INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0.0
                );

                CREATE TABLE IF NOT EXISTS handoffs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_domain TEXT NOT NULL,
                    to_domain TEXT NOT NULL,
                    handoff_type TEXT NOT NULL,
                    payload TEXT,
                    created_at TEXT NOT NULL,
                    processed_at TEXT,
                    status TEXT DEFAULT 'pending'
                );

                CREATE TABLE IF NOT EXISTS briefs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE NOT NULL,
                    content TEXT,
                    domains_included TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS state (
                    domain TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (domain, key)
                );

                CREATE INDEX IF NOT EXISTS idx_runs_domain ON agent_runs(domain);
                CREATE INDEX IF NOT EXISTS idx_handoffs_to ON handoffs(to_domain, status);
                CREATE INDEX IF NOT EXISTS idx_briefs_date ON briefs(date);
            """)
            conn.commit()

    def save_run(self, run: AgentRun) -> int:
        with self._connection() as conn:
            cursor = conn.execute("""
                INSERT INTO agent_runs
                (domain, started_at, completed_at, status, result, brief, error, tokens_used, cost_usd)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (run.domain, run.started_at, run.completed_at, run.status,
                  run.result, run.brief, run.error, run.tokens_used, run.cost_usd))
            conn.commit()
            return cursor.lastrowid

    def get_runs(self, domain: str = None, limit: int = 100) -> List[AgentRun]:
        with self._connection() as conn:
            if domain:
                cursor = conn.execute(
                    "SELECT * FROM agent_runs WHERE domain = ? ORDER BY id DESC LIMIT ?",
                    (domain, limit)
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?",
                    (limit,)
                )
            return [AgentRun(**dict(row)) for row in cursor.fetchall()]

    def save_handoff(self, handoff: HandoffRecord) -> int:
        with self._connection() as conn:
            cursor = conn.execute("""
                INSERT INTO handoffs
                (from_domain, to_domain, handoff_type, payload, created_at, status)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (handoff.from_domain, handoff.to_domain, handoff.handoff_type,
                  handoff.payload, handoff.created_at, handoff.status))
            conn.commit()
            return cursor.lastrowid

    def get_pending_handoffs(self, domain: str) -> List[HandoffRecord]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM handoffs WHERE to_domain = ? AND status = 'pending' ORDER BY id",
                (domain,)
            )
            return [HandoffRecord(**dict(row)) for row in cursor.fetchall()]

    def mark_handoff_processed(self, handoff_id: int):
        with self._connection() as conn:
            conn.execute(
                "UPDATE handoffs SET status = 'processed', processed_at = ? WHERE id = ?",
                (datetime.now().isoformat(), handoff_id)
            )
            conn.commit()

    def save_brief(self, brief: BriefRecord) -> int:
        with self._connection() as conn:
            cursor = conn.execute("""
                INSERT OR REPLACE INTO briefs (date, content, domains_included, created_at)
                VALUES (?, ?, ?, ?)
            """, (brief.date, brief.content, brief.domains_included, brief.created_at))
            conn.commit()
            return cursor.lastrowid

    def get_brief(self, date: str) -> Optional[BriefRecord]:
        with self._connection() as conn:
            cursor = conn.execute("SELECT * FROM briefs WHERE date = ?", (date,))
            row = cursor.fetchone()
            return BriefRecord(**dict(row)) if row else None

    def set_state(self, domain: str, key: str, value: Any):
        with self._connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO state (domain, key, value, updated_at)
                VALUES (?, ?, ?, ?)
            """, (domain, key, json.dumps(value), datetime.now().isoformat()))
            conn.commit()

    def get_state(self, domain: str, key: str) -> Any:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT value FROM state WHERE domain = ? AND key = ?",
                (domain, key)
            )
            row = cursor.fetchone()
            return json.loads(row['value']) if row else None


class PostgreSQLDatabase(Database):
    """PostgreSQL implementation for production (Railway)."""

    def __init__(self, database_url: str = None):
        self.database_url = database_url or os.environ.get('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL not set")

        # Import psycopg2 only when needed
        try:
            import psycopg2
            import psycopg2.extras
            self.psycopg2 = psycopg2
        except ImportError:
            raise ImportError("psycopg2 required for PostgreSQL. Install with: pip install psycopg2-binary")

        self.init_schema()

    @contextmanager
    def _connection(self):
        conn = self.psycopg2.connect(self.database_url)
        try:
            yield conn
        finally:
            conn.close()

    def init_schema(self):
        """Create tables if not exist."""
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS agent_runs (
                        id SERIAL PRIMARY KEY,
                        domain TEXT NOT NULL,
                        started_at TIMESTAMPTZ NOT NULL,
                        completed_at TIMESTAMPTZ,
                        status TEXT,
                        result JSONB,
                        brief TEXT,
                        error TEXT,
                        tokens_used INTEGER DEFAULT 0,
                        cost_usd DECIMAL(10, 6) DEFAULT 0.0
                    );

                    CREATE TABLE IF NOT EXISTS handoffs (
                        id SERIAL PRIMARY KEY,
                        from_domain TEXT NOT NULL,
                        to_domain TEXT NOT NULL,
                        handoff_type TEXT NOT NULL,
                        payload JSONB,
                        created_at TIMESTAMPTZ NOT NULL,
                        processed_at TIMESTAMPTZ,
                        status TEXT DEFAULT 'pending'
                    );

                    CREATE TABLE IF NOT EXISTS briefs (
                        id SERIAL PRIMARY KEY,
                        date DATE UNIQUE NOT NULL,
                        content TEXT,
                        domains_included JSONB,
                        created_at TIMESTAMPTZ NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS state (
                        domain TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value JSONB,
                        updated_at TIMESTAMPTZ,
                        PRIMARY KEY (domain, key)
                    );

                    CREATE INDEX IF NOT EXISTS idx_runs_domain ON agent_runs(domain);
                    CREATE INDEX IF NOT EXISTS idx_handoffs_to ON handoffs(to_domain, status);
                """)
            conn.commit()

    # Implement other methods similar to SQLite but with PostgreSQL syntax
    # (For brevity, these are simplified - full implementation would follow same pattern)

    def save_run(self, run: AgentRun) -> int:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO agent_runs
                    (domain, started_at, completed_at, status, result, brief, error, tokens_used, cost_usd)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (run.domain, run.started_at, run.completed_at, run.status,
                      run.result, run.brief, run.error, run.tokens_used, run.cost_usd))
                result = cur.fetchone()
                conn.commit()
                return result[0]

    def get_runs(self, domain: str = None, limit: int = 100) -> List[AgentRun]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=self.psycopg2.extras.RealDictCursor) as cur:
                if domain:
                    cur.execute(
                        "SELECT * FROM agent_runs WHERE domain = %s ORDER BY id DESC LIMIT %s",
                        (domain, limit)
                    )
                else:
                    cur.execute(
                        "SELECT * FROM agent_runs ORDER BY id DESC LIMIT %s",
                        (limit,)
                    )
                return [AgentRun(**row) for row in cur.fetchall()]

    def save_handoff(self, handoff: HandoffRecord) -> int:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO handoffs
                    (from_domain, to_domain, handoff_type, payload, created_at, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (handoff.from_domain, handoff.to_domain, handoff.handoff_type,
                      handoff.payload, handoff.created_at, handoff.status))
                result = cur.fetchone()
                conn.commit()
                return result[0]

    def get_pending_handoffs(self, domain: str) -> List[HandoffRecord]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=self.psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM handoffs WHERE to_domain = %s AND status = 'pending' ORDER BY id",
                    (domain,)
                )
                return [HandoffRecord(**row) for row in cur.fetchall()]

    def mark_handoff_processed(self, handoff_id: int):
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE handoffs SET status = 'processed', processed_at = NOW() WHERE id = %s",
                    (handoff_id,)
                )
            conn.commit()

    def save_brief(self, brief: BriefRecord) -> int:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO briefs (date, content, domains_included, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (date) DO UPDATE SET content = EXCLUDED.content
                    RETURNING id
                """, (brief.date, brief.content, brief.domains_included, brief.created_at))
                result = cur.fetchone()
                conn.commit()
                return result[0]

    def get_brief(self, date: str) -> Optional[BriefRecord]:
        with self._connection() as conn:
            with conn.cursor(cursor_factory=self.psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT * FROM briefs WHERE date = %s", (date,))
                row = cur.fetchone()
                return BriefRecord(**row) if row else None

    def set_state(self, domain: str, key: str, value: Any):
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO state (domain, key, value, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (domain, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """, (domain, key, json.dumps(value)))
            conn.commit()

    def get_state(self, domain: str, key: str) -> Any:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT value FROM state WHERE domain = %s AND key = %s",
                    (domain, key)
                )
                row = cur.fetchone()
                return row[0] if row else None


# Factory function
def get_database() -> Database:
    """
    Get database instance based on environment.

    Uses DATABASE_URL if set (PostgreSQL), otherwise SQLite.
    """
    database_url = os.environ.get('DATABASE_URL')

    if database_url:
        return PostgreSQLDatabase(database_url)
    else:
        return SQLiteDatabase()
