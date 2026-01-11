/**
 * Skills Registry
 *
 * Central registry for all available skills.
 * Skills can be registered and retrieved by name.
 */

import { Skill, SkillContext, SkillResult, skillToTool, ToolDefinition } from "./types.js";

class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  /**
   * Register a skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      console.warn(`Skill ${skill.name} already registered, overwriting`);
    }
    this.skills.set(skill.name, skill);
    console.log(`📚 Skill registered: ${skill.name}`);
  }

  /**
   * Register multiple skills
   */
  registerAll(skills: Skill[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills by names
   */
  getByNames(names: string[]): Skill[] {
    return names
      .map((name) => this.skills.get(name))
      .filter((s): s is Skill => s !== undefined);
  }

  /**
   * Convert skills to Claude tools
   */
  toTools(skillNames?: string[]): ToolDefinition[] {
    const skills = skillNames ? this.getByNames(skillNames) : this.getAll();
    return skills.map(skillToTool);
  }

  /**
   * Execute a skill by name
   */
  async execute(
    name: string,
    input: unknown,
    context: SkillContext
  ): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${name}`,
      };
    }

    try {
      // Validate input
      const validatedInput = skill.inputSchema.parse(input);
      return await skill.execute(validatedInput, context);
    } catch (error) {
      return {
        success: false,
        error: `Skill execution error: ${error}`,
      };
    }
  }

  /**
   * List all registered skill names
   */
  list(): string[] {
    return Array.from(this.skills.keys());
  }
}

// Singleton instance
export const skillRegistry = new SkillRegistry();
