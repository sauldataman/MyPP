/**
 * Prompt Loader
 *
 * Loads prompts from markdown files for customization.
 * Prompts are stored in the prompts/ directory.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Prompts directory - can be overridden via env
const PROMPTS_DIR = process.env.PROMPTS_DIR || join(__dirname, "../../../../prompts");

export interface PromptTemplate {
  name: string;
  description: string;
  template: string;
  variables: string[];
}

/**
 * Ensure prompts directory exists
 */
function ensurePromptsDir(): void {
  if (!existsSync(PROMPTS_DIR)) {
    mkdirSync(PROMPTS_DIR, { recursive: true });
  }
}

/**
 * Load a prompt from markdown file
 *
 * File format:
 * ---
 * name: prompt-name
 * description: What this prompt does
 * variables: [var1, var2]
 * ---
 * The actual prompt template with {{var1}} placeholders
 */
export function loadPrompt(name: string): PromptTemplate | null {
  ensurePromptsDir();

  const filePath = join(PROMPTS_DIR, `${name}.md`);

  if (!existsSync(filePath)) {
    console.warn(`Prompt file not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return parsePromptFile(name, content);
  } catch (error) {
    console.error(`Error loading prompt ${name}:`, error);
    return null;
  }
}

/**
 * Parse a prompt markdown file
 */
function parsePromptFile(name: string, content: string): PromptTemplate {
  // Check for frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter, treat entire content as template
    return {
      name,
      description: "",
      template: content.trim(),
      variables: extractVariables(content),
    };
  }

  const [, frontmatter, template] = frontmatterMatch;

  // Parse frontmatter (simple YAML-like parsing)
  const meta: Record<string, string | string[]> = {};
  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Handle array notation [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        meta[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim());
      } else {
        meta[key] = value;
      }
    }
  }

  return {
    name: (meta.name as string) || name,
    description: (meta.description as string) || "",
    template: template.trim(),
    variables: (meta.variables as string[]) || extractVariables(template),
  };
}

/**
 * Extract variables from template ({{variable}} pattern)
 */
function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const variables = new Set<string>();
  for (const match of matches) {
    variables.add(match[1]);
  }
  return Array.from(variables);
}

/**
 * Render a prompt template with variables
 */
export function renderPrompt(
  template: PromptTemplate,
  variables: Record<string, string>
): string {
  let result = template.template;

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  return result;
}

/**
 * Load and render a prompt in one step
 */
export function getPrompt(
  name: string,
  variables: Record<string, string> = {}
): string | null {
  const template = loadPrompt(name);
  if (!template) return null;
  return renderPrompt(template, variables);
}

/**
 * Save a prompt to file (for generating default prompts)
 */
export function savePrompt(template: PromptTemplate): void {
  ensurePromptsDir();

  const filePath = join(PROMPTS_DIR, `${template.name}.md`);

  const content = `---
name: ${template.name}
description: ${template.description}
variables: [${template.variables.join(", ")}]
---
${template.template}
`;

  writeFileSync(filePath, content, "utf-8");
  console.log(`📝 Saved prompt: ${filePath}`);
}

/**
 * Get prompts directory path
 */
export function getPromptsDir(): string {
  ensurePromptsDir();
  return PROMPTS_DIR;
}
