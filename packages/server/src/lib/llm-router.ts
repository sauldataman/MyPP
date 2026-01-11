/**
 * LLM Router - Unified interface for multiple LLM providers
 *
 * Supports:
 * - Gemini (Google) - Fast, good for general tasks
 * - Grok (xAI) - Best for X/Twitter context
 * - Claude (Anthropic) - Best for complex reasoning
 * - Ollama (Local) - Privacy-preserving, free
 */

import { z } from "zod";

// Types
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
}

export type TaskType =
  | "analysis"
  | "generation"
  | "quick"
  | "coding"
  | "embedding";

export type ProviderName = "gemini" | "grok" | "claude" | "ollama";

// Provider interface
interface LLMProvider {
  name: ProviderName;
  isAvailable(): boolean;
  chat(
    messages: LLMMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse>;
}

// Pricing per 1M tokens (approximate)
const PRICING: Record<string, { input: number; output: number }> = {
  // Gemini
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  // Grok
  "grok-2-latest": { input: 2.0, output: 10.0 },
  "grok-2-mini": { input: 0.2, output: 1.0 },
  // Claude
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.25, output: 1.25 },
  // Ollama (local = free)
  "llama3.2": { input: 0, output: 0 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model] || { input: 0, output: 0 };
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  );
}

// ============================================================================
// Gemini Provider
// ============================================================================
class GeminiProvider implements LLMProvider {
  name: ProviderName = "gemini";
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private defaultModel = "gemini-2.0-flash";

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(
    messages: LLMMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    // Convert messages to Gemini format
    const systemInstruction = messages.find((m) => m.role === "system");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const content =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "[No response]";
      const usage = data.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;

      return {
        content,
        provider: this.name,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd: calculateCost(model, inputTokens, outputTokens),
      };
    } catch (error) {
      return {
        content: `[Gemini Error: ${error}]`,
        provider: this.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }
}

// ============================================================================
// Grok Provider
// ============================================================================
class GrokProvider implements LLMProvider {
  name: ProviderName = "grok";
  private apiKey: string;
  private baseUrl = "https://api.x.ai/v1";
  private defaultModel = "grok-2-latest";

  constructor() {
    this.apiKey = process.env.XAI_API_KEY || "";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(
    messages: LLMMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Grok API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const content = data.choices?.[0]?.message?.content || "[No response]";
      const usage = data.usage || {};
      const inputTokens = usage.prompt_tokens || 0;
      const outputTokens = usage.completion_tokens || 0;

      return {
        content,
        provider: this.name,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd: calculateCost(model, inputTokens, outputTokens),
      };
    } catch (error) {
      return {
        content: `[Grok Error: ${error}]`,
        provider: this.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }
}

// ============================================================================
// Claude Provider
// ============================================================================
class ClaudeProvider implements LLMProvider {
  name: ProviderName = "claude";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";
  private defaultModel = "claude-sonnet-4-20250514";

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async chat(
    messages: LLMMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    // Extract system message
    const systemMsg = messages.find((m) => m.role === "system");
    const apiMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const body: Record<string, unknown> = {
        model,
        max_tokens: options.maxTokens ?? 4096,
        messages: apiMessages,
        temperature: options.temperature ?? 0.7,
      };

      if (systemMsg) {
        body.system = systemMsg.content;
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const content = data.content?.[0]?.text || "[No response]";
      const usage = data.usage || {};
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;

      return {
        content,
        provider: this.name,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd: calculateCost(model, inputTokens, outputTokens),
      };
    } catch (error) {
      return {
        content: `[Claude Error: ${error}]`,
        provider: this.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }
}

// ============================================================================
// Ollama Provider (Local)
// ============================================================================
class OllamaProvider implements LLMProvider {
  name: ProviderName = "ollama";
  private host: string;
  private defaultModel: string;

  constructor() {
    this.host = process.env.OLLAMA_HOST || "http://localhost:11434";
    this.defaultModel = process.env.OLLAMA_MODEL || "llama3.2";
  }

  isAvailable(): boolean {
    // We'll assume it's available if not in production
    // In production, you'd check if the host is reachable
    return process.env.NODE_ENV !== "production" || !!process.env.OLLAMA_HOST;
  }

  async chat(
    messages: LLMMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<LLMResponse> {
    const model = options.model || this.defaultModel;
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 4096,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        content: data.message?.content || "[No response]",
        provider: this.name,
        model,
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        latencyMs,
        costUsd: 0, // Local = free
      };
    } catch (error) {
      return {
        content: `[Ollama Error: ${error}]`,
        provider: this.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        costUsd: 0,
      };
    }
  }
}

// ============================================================================
// LLM Router
// ============================================================================
export class LLMRouter {
  private providers: Map<ProviderName, LLMProvider>;
  private defaultOrder: ProviderName[] = ["gemini", "grok", "claude", "ollama"];

  // Task-based routing
  private taskRouting: Record<TaskType, ProviderName[]> = {
    analysis: ["grok", "gemini", "claude", "ollama"],
    generation: ["claude", "gemini", "grok", "ollama"],
    quick: ["gemini", "ollama", "grok", "claude"],
    coding: ["claude", "gemini", "ollama", "grok"],
    embedding: ["ollama", "gemini", "claude"],
  };

  // Usage stats
  private stats = {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    byProvider: {} as Record<string, { calls: number; tokens: number; cost: number }>,
  };

  constructor() {
    this.providers = new Map([
      ["gemini", new GeminiProvider()],
      ["grok", new GrokProvider()],
      ["claude", new ClaudeProvider()],
      ["ollama", new OllamaProvider()],
    ]);
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.entries())
      .filter(([_, p]) => p.isAvailable())
      .map(([name]) => name);
  }

  async chat(
    prompt: string,
    options: {
      system?: string;
      task?: TaskType;
      provider?: ProviderName;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<LLMResponse> {
    const messages: LLMMessage[] = [];
    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: prompt });

    return this.chatMessages(messages, options);
  }

  async chatMessages(
    messages: LLMMessage[],
    options: {
      task?: TaskType;
      provider?: ProviderName;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<LLMResponse> {
    // Determine provider order
    let order: ProviderName[];
    if (options.provider) {
      order = [options.provider];
    } else if (options.task) {
      order = this.taskRouting[options.task];
    } else {
      order = this.defaultOrder;
    }

    // Try providers in order
    let lastError: LLMResponse | null = null;
    for (const providerName of order) {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.isAvailable()) continue;

      const response = await provider.chat(messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });

      // Check for error
      if (response.content.startsWith("[") && response.content.includes("Error")) {
        lastError = response;
        continue;
      }

      // Success - update stats
      this.updateStats(response);
      return response;
    }

    // All providers failed
    if (lastError) return lastError;

    return {
      content: "[Error: No LLM providers available]",
      provider: "none",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      costUsd: 0,
    };
  }

  private updateStats(response: LLMResponse): void {
    this.stats.totalCalls++;
    this.stats.totalTokens += response.inputTokens + response.outputTokens;
    this.stats.totalCost += response.costUsd;

    const p = response.provider;
    if (!this.stats.byProvider[p]) {
      this.stats.byProvider[p] = { calls: 0, tokens: 0, cost: 0 };
    }
    this.stats.byProvider[p].calls++;
    this.stats.byProvider[p].tokens += response.inputTokens + response.outputTokens;
    this.stats.byProvider[p].cost += response.costUsd;
  }

  getStats() {
    return { ...this.stats };
  }
}

// Singleton instance
let router: LLMRouter | null = null;

export function getLLMRouter(): LLMRouter {
  if (!router) {
    router = new LLMRouter();
  }
  return router;
}
