/**
 * Skills Type Definitions
 *
 * Skills are reusable tools that can be assigned to sub-agents.
 * They follow the Anthropic tool use protocol.
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

// Tool definition for Claude API
export type ToolDefinition = Anthropic.Tool;

// Skill execution context
export interface SkillContext {
  agentName: string;
  parentAgent?: string;
  sessionId: string;
  state: Map<string, unknown>;
}

// Skill execution result
export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Skill definition
export interface Skill {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown, context: SkillContext) => Promise<SkillResult>;
}

// Convert Zod schema to JSON Schema for Claude
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Basic conversion - handles common types
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodValue);
      if (!zodValue.isOptional()) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: schema.options,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  // Default fallback
  return { type: "string" };
}

// Convert Skill to Claude Tool
export function skillToTool(skill: Skill): ToolDefinition {
  return {
    name: skill.name,
    description: skill.description,
    input_schema: zodToJsonSchema(skill.inputSchema) as ToolDefinition["input_schema"],
  };
}
