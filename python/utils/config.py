"""
Configuration utilities for loading config files and prompts.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Project root (parent of python directory)
PROJECT_ROOT = Path(__file__).parent.parent.parent


def init_env():
    """Load environment variables from .env file."""
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def get_env(key: str, default: str = "") -> str:
    """Get environment variable with optional default."""
    return os.getenv(key, default)


def load_json_config(filename: str) -> dict[str, Any]:
    """Load a JSON config file from the config directory."""
    config_path = PROJECT_ROOT / "config" / filename
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_prompt(filename: str, variables: dict[str, str] | None = None) -> str:
    """
    Load a prompt template from the prompts directory.
    Strips frontmatter and replaces {{variables}}.
    """
    prompt_path = PROJECT_ROOT / "prompts" / filename
    with open(prompt_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Strip frontmatter (content between --- markers at start)
    frontmatter_pattern = r"^---\n[\s\S]*?\n---\n"
    content = re.sub(frontmatter_pattern, "", content).strip()

    # Replace variables if provided
    if variables:
        for key, value in variables.items():
            content = content.replace(f"{{{{{key}}}}}", value)

    return content


def get_data_dir() -> Path:
    """Get the data directory path, creating it if needed."""
    data_dir = PROJECT_ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    return data_dir


def get_reports_dir(subdir: str = "") -> Path:
    """Get the reports directory path, creating it if needed."""
    reports_dir = PROJECT_ROOT / "reports"
    if subdir:
        reports_dir = reports_dir / subdir
    reports_dir.mkdir(parents=True, exist_ok=True)
    return reports_dir
