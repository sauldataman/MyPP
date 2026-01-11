"""
Configuration management for Personal Panopticon.

Supports multiple environments:
- local: Development with SQLite + Ollama
- railway: Production with PostgreSQL + Cloud LLMs
- hybrid: Local execution with cloud LLM fallback
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Literal
import json


@dataclass
class LLMConfig:
    """LLM provider configuration."""
    # Provider priority order (will try in order)
    providers: list[str] = field(default_factory=lambda: ['grok', 'claude', 'ollama'])

    # API Keys (from env)
    grok_api_key: str = ""
    claude_api_key: str = ""
    openai_api_key: str = ""

    # Local model settings
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # Model preferences per task type
    model_routing: dict = field(default_factory=lambda: {
        'analysis': 'grok',      # Best for X/Twitter analysis
        'generation': 'claude',   # Best for content generation
        'embedding': 'ollama',    # Local for privacy
        'quick': 'ollama'         # Fast local for simple tasks
    })


@dataclass
class DatabaseConfig:
    """Database configuration."""
    # 'sqlite' for local, 'postgresql' for production
    backend: Literal['sqlite', 'postgresql', 'redis'] = 'sqlite'

    # SQLite settings
    sqlite_path: str = "./data/panopticon.db"

    # PostgreSQL settings (Railway provides DATABASE_URL)
    postgres_url: str = ""

    # Redis settings (for caching/queues)
    redis_url: str = ""


@dataclass
class ServerConfig:
    """Server configuration."""
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4
    debug: bool = False

    # CORS settings for frontend
    cors_origins: list[str] = field(default_factory=lambda: [
        "http://localhost:3000",
        "https://*.vercel.app"
    ])

    # Auth
    api_key: str = ""  # For protecting endpoints
    jwt_secret: str = ""


@dataclass
class Config:
    """Main configuration."""
    env: Literal['local', 'railway', 'hybrid'] = 'local'

    # Sub-configs
    llm: LLMConfig = field(default_factory=LLMConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    server: ServerConfig = field(default_factory=ServerConfig)

    # Paths
    base_path: str = ""
    data_path: str = ""
    logs_path: str = ""

    @classmethod
    def from_env(cls) -> 'Config':
        """Load configuration from environment variables."""
        env = os.environ.get('PANOPTICON_ENV', 'local')

        config = cls(env=env)

        # LLM Config
        config.llm.grok_api_key = os.environ.get('XAI_API_KEY', '')
        config.llm.claude_api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        config.llm.openai_api_key = os.environ.get('OPENAI_API_KEY', '')
        config.llm.ollama_host = os.environ.get('OLLAMA_HOST', 'http://localhost:11434')
        config.llm.ollama_model = os.environ.get('OLLAMA_MODEL', 'llama3.2')

        # Database Config
        postgres_url = os.environ.get('DATABASE_URL', '')
        redis_url = os.environ.get('REDIS_URL', '')

        if postgres_url:
            config.database.backend = 'postgresql'
            config.database.postgres_url = postgres_url
        if redis_url:
            config.database.redis_url = redis_url

        # Server Config
        config.server.port = int(os.environ.get('PORT', 8000))
        config.server.debug = os.environ.get('DEBUG', 'false').lower() == 'true'
        config.server.api_key = os.environ.get('API_KEY', '')
        config.server.jwt_secret = os.environ.get('JWT_SECRET', 'change-me-in-production')

        # CORS
        cors = os.environ.get('CORS_ORIGINS', '')
        if cors:
            config.server.cors_origins = cors.split(',')

        # Paths
        config.base_path = os.environ.get('PANOPTICON_HOME', str(Path.cwd()))
        config.data_path = os.environ.get('DATA_PATH', str(Path(config.base_path) / 'data'))
        config.logs_path = os.environ.get('LOGS_PATH', str(Path(config.base_path) / 'logs'))

        return config

    def to_dict(self) -> dict:
        """Convert to dictionary (for JSON serialization)."""
        return {
            'env': self.env,
            'llm': {
                'providers': self.llm.providers,
                'ollama_host': self.llm.ollama_host,
                'ollama_model': self.llm.ollama_model,
                'model_routing': self.llm.model_routing,
                # Don't expose API keys
                'has_grok': bool(self.llm.grok_api_key),
                'has_claude': bool(self.llm.claude_api_key),
                'has_openai': bool(self.llm.openai_api_key),
            },
            'database': {
                'backend': self.database.backend,
            },
            'server': {
                'port': self.server.port,
                'debug': self.server.debug,
            }
        }


# Singleton config instance
_config: Optional[Config] = None


def get_config() -> Config:
    """Get the global config instance."""
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config


def reload_config() -> Config:
    """Reload config from environment."""
    global _config
    _config = Config.from_env()
    return _config
