/**
 * Built-in Skills Index
 *
 * Exports all built-in skills and provides initialization.
 */

import { webSkills } from "./web.js";
import { dataSkills } from "./data.js";
import { databaseSkills } from "./database.js";
import { skillRegistry } from "../registry.js";

// All built-in skills
export const builtinSkills = [...webSkills, ...dataSkills, ...databaseSkills];

// Skill categories for easy access
export const skillCategories = {
  web: webSkills,
  data: dataSkills,
  database: databaseSkills,
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
