/**
 * Built-in Skills Index
 *
 * Exports all built-in skills and provides initialization.
 */

import { webSkills } from "./web.js";
import { dataSkills } from "./data.js";
import { databaseSkills } from "./database.js";
import { xGrokSkills } from "./x-grok.js";
import { xApiSkills } from "./x-api.js";
import { filesystemSkills } from "./filesystem.js";
import { skillRegistry } from "../registry.js";

// All built-in skills
export const builtinSkills = [
  ...webSkills,
  ...dataSkills,
  ...databaseSkills,
  ...xGrokSkills,
  ...xApiSkills,
  ...filesystemSkills,
];

// Skill categories for easy access
export const skillCategories = {
  web: webSkills,
  data: dataSkills,
  database: databaseSkills,
  xGrok: xGrokSkills,      // Grok-based (analyze any user)
  xApi: xApiSkills,        // X API (manage own account)
  filesystem: filesystemSkills,
};

// Register all built-in skills
export function registerBuiltinSkills(): void {
  console.log("📚 Registering built-in skills...");
  skillRegistry.registerAll(builtinSkills);
  console.log(`📚 ${builtinSkills.length} skills registered`);
}

// Re-export individual skills
export * from "./web.js";
export * from "./data.js";
export * from "./database.js";
export * from "./x-grok.js";
export * from "./x-api.js";
export * from "./filesystem.js";
