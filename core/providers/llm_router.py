"""
LLM Router - Unified interface for multiple LLM providers.

Supports:
- Grok (xAI) - Best for X/Twitter context
- Claude (Anthropic) - Best for complex reasoning
- OpenAI (GPT-4) - Widely compatible
- Ollama (Local) - Privacy-preserving, free

Features:
- Automatic fallback chain
- Task-based routing
- Cost tracking
- Rate limit handling
"""

import json
import os
import time
import urllib.request
import urllib.error
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Generator
from enum import Enum


class TaskType(Enum):
    """Task types for intelligent routing."""
    ANALYSIS = "analysis"       # Analyzing data, sentiment
    GENERATION = "generation"   # Creating content
    EMBEDDING = "embedding"     # Vector embeddings
    QUICK = "quick"            # Fast, simple tasks
    CODING = "coding"          # Code generation/review


@dataclass
class LLMResponse:
    """Standardized response from any LLM."""
    content: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0
    raw_response: dict = None


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    name: str = "base"
    models: List[str] = []

    @abstractmethod
    def chat(self, messages: List[Dict], model: str = None,
             temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:
        """Send chat completion request."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is available (has API key, etc)."""
        pass

    def stream(self, messages: List[Dict], model: str = None,
               temperature: float = 0.7) -> Generator[str, None, None]:
        """Stream response (optional, defaults to non-streaming)."""
        response = self.chat(messages, model, temperature)
        yield response.content


class GrokProvider(LLMProvider):
    """Grok (xAI) provider."""

    name = "grok"
    models = ["grok-2-latest", "grok-2-mini"]

    # Pricing per 1M tokens (as of 2024)
    pricing = {
        "grok-2-latest": {"input": 2.0, "output": 10.0},
        "grok-2-mini": {"input": 0.2, "output": 1.0}
    }

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('XAI_API_KEY')
        self.base_url = "https://api.x.ai/v1"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def chat(self, messages: List[Dict], model: str = None,
             temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:

        model = model or "grok-2-latest"
        start_time = time.time()

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=data, headers=headers, method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode('utf-8'))

            latency = int((time.time() - start_time) * 1000)
            usage = result.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            # Calculate cost
            pricing = self.pricing.get(model, {"input": 2.0, "output": 10.0})
            cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

            return LLMResponse(
                content=result["choices"][0]["message"]["content"],
                provider=self.name,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency,
                cost_usd=cost,
                raw_response=result
            )

        except Exception as e:
            return LLMResponse(
                content=f"[Grok Error: {e}]",
                provider=self.name,
                model=model,
                latency_ms=int((time.time() - start_time) * 1000)
            )


class ClaudeProvider(LLMProvider):
    """Claude (Anthropic) provider."""

    name = "claude"
    models = ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"]

    pricing = {
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "claude-3-5-haiku-20241022": {"input": 0.25, "output": 1.25},
        "claude-opus-4-20250514": {"input": 15.0, "output": 75.0}
    }

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        self.base_url = "https://api.anthropic.com/v1"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def chat(self, messages: List[Dict], model: str = None,
             temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:

        model = model or "claude-sonnet-4-20250514"
        start_time = time.time()

        # Convert messages format (handle system message)
        system = None
        api_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                api_messages.append(msg)

        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": api_messages,
            "temperature": temperature
        }
        if system:
            payload["system"] = system

        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01"
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            f"{self.base_url}/messages",
            data=data, headers=headers, method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode('utf-8'))

            latency = int((time.time() - start_time) * 1000)
            usage = result.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)

            pricing = self.pricing.get(model, {"input": 3.0, "output": 15.0})
            cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

            return LLMResponse(
                content=result["content"][0]["text"],
                provider=self.name,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency,
                cost_usd=cost,
                raw_response=result
            )

        except Exception as e:
            return LLMResponse(
                content=f"[Claude Error: {e}]",
                provider=self.name,
                model=model,
                latency_ms=int((time.time() - start_time) * 1000)
            )


class OllamaProvider(LLMProvider):
    """Ollama (local) provider."""

    name = "ollama"
    models = ["llama3.2", "mistral", "codellama", "phi3"]

    def __init__(self, host: str = None, model: str = None):
        self.host = host or os.environ.get('OLLAMA_HOST', 'http://localhost:11434')
        self.default_model = model or os.environ.get('OLLAMA_MODEL', 'llama3.2')

    def is_available(self) -> bool:
        """Check if Ollama is running."""
        try:
            req = urllib.request.Request(f"{self.host}/api/tags")
            with urllib.request.urlopen(req, timeout=2) as response:
                return response.status == 200
        except Exception:
            return False

    def chat(self, messages: List[Dict], model: str = None,
             temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:

        model = model or self.default_model
        start_time = time.time()

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }

        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            f"{self.host}/api/chat",
            data=data,
            headers={"Content-Type": "application/json"},
            method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                result = json.loads(response.read().decode('utf-8'))

            latency = int((time.time() - start_time) * 1000)

            return LLMResponse(
                content=result["message"]["content"],
                provider=self.name,
                model=model,
                input_tokens=result.get("prompt_eval_count", 0),
                output_tokens=result.get("eval_count", 0),
                latency_ms=latency,
                cost_usd=0.0,  # Local = free
                raw_response=result
            )

        except Exception as e:
            return LLMResponse(
                content=f"[Ollama Error: {e}]",
                provider=self.name,
                model=model,
                latency_ms=int((time.time() - start_time) * 1000)
            )


class LLMRouter:
    """
    Intelligent LLM router with fallback and task-based routing.

    Usage:
        router = LLMRouter()

        # Simple call (auto-selects best available)
        response = router.chat("What is the capital of France?")

        # Task-based routing
        response = router.chat("Analyze this tweet", task=TaskType.ANALYSIS)

        # Force specific provider
        response = router.chat("...", provider="ollama")
    """

    def __init__(self, providers: List[str] = None):
        """
        Initialize router with provider priority.

        Args:
            providers: Priority order, e.g. ['grok', 'claude', 'ollama']
        """
        self.provider_order = providers or ['grok', 'claude', 'ollama']

        # Initialize all providers
        self._providers = {
            'grok': GrokProvider(),
            'claude': ClaudeProvider(),
            'ollama': OllamaProvider(),
        }

        # Task-based routing preferences
        self.task_routing = {
            TaskType.ANALYSIS: ['grok', 'claude', 'ollama'],
            TaskType.GENERATION: ['claude', 'grok', 'ollama'],
            TaskType.EMBEDDING: ['ollama', 'claude'],
            TaskType.QUICK: ['ollama', 'grok', 'claude'],
            TaskType.CODING: ['claude', 'ollama', 'grok'],
        }

        # Usage stats
        self.stats = {
            'total_calls': 0,
            'total_tokens': 0,
            'total_cost': 0.0,
            'by_provider': {}
        }

    def get_available_providers(self) -> List[str]:
        """Get list of currently available providers."""
        return [name for name, p in self._providers.items() if p.is_available()]

    def chat(self, prompt: str, system: str = None,
             task: TaskType = None, provider: str = None,
             temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:
        """
        Send a chat request with automatic routing and fallback.

        Args:
            prompt: User message
            system: Optional system prompt
            task: Task type for intelligent routing
            provider: Force specific provider (skip routing)
            temperature: Creativity (0-2)
            max_tokens: Max response length

        Returns:
            LLMResponse with content and metadata
        """
        # Build messages
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        return self.chat_messages(messages, task, provider, temperature, max_tokens)

    def chat_messages(self, messages: List[Dict],
                      task: TaskType = None, provider: str = None,
                      temperature: float = 0.7, max_tokens: int = 4096) -> LLMResponse:
        """
        Send chat with full message list.
        """
        # Determine provider order
        if provider:
            order = [provider]
        elif task:
            order = self.task_routing.get(task, self.provider_order)
        else:
            order = self.provider_order

        # Try providers in order
        last_error = None
        for provider_name in order:
            p = self._providers.get(provider_name)
            if not p or not p.is_available():
                continue

            response = p.chat(messages, temperature=temperature, max_tokens=max_tokens)

            # Check for error
            if response.content.startswith('[') and 'Error' in response.content:
                last_error = response
                continue

            # Success - update stats
            self._update_stats(response)
            return response

        # All providers failed
        if last_error:
            return last_error

        return LLMResponse(
            content="[Error: No LLM providers available]",
            provider="none",
            model="none"
        )

    def _update_stats(self, response: LLMResponse):
        """Update usage statistics."""
        self.stats['total_calls'] += 1
        self.stats['total_tokens'] += response.input_tokens + response.output_tokens
        self.stats['total_cost'] += response.cost_usd

        provider = response.provider
        if provider not in self.stats['by_provider']:
            self.stats['by_provider'][provider] = {
                'calls': 0, 'tokens': 0, 'cost': 0.0
            }
        self.stats['by_provider'][provider]['calls'] += 1
        self.stats['by_provider'][provider]['tokens'] += response.input_tokens + response.output_tokens
        self.stats['by_provider'][provider]['cost'] += response.cost_usd

    def get_stats(self) -> dict:
        """Get usage statistics."""
        return self.stats


# Singleton router instance
_router: Optional[LLMRouter] = None


def get_router() -> LLMRouter:
    """Get global router instance."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
