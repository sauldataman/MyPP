/**
 * Filesystem Skills
 *
 * Skills for reading and writing files.
 * Output directory is configurable and sandboxed.
 */

import { z } from "zod";
import { Skill, SkillResult } from "../types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Output directory - sandboxed for safety
const OUTPUT_DIR = process.env.OUTPUT_DIR || join(__dirname, "../../../../output");

/**
 * Ensure output directory exists
 */
function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Validate filename (prevent directory traversal)
 */
function validateFilename(filename: string): boolean {
  // No path separators or parent directory references
  return !filename.includes("/") && !filename.includes("\\") && !filename.includes("..");
}

/**
 * Get safe file path within output directory
 */
function getSafeFilePath(filename: string, subdir?: string): string | null {
  if (!validateFilename(filename)) {
    return null;
  }

  ensureOutputDir();

  if (subdir) {
    if (!validateFilename(subdir)) return null;
    const subdirPath = join(OUTPUT_DIR, subdir);
    if (!existsSync(subdirPath)) {
      mkdirSync(subdirPath, { recursive: true });
    }
    return join(subdirPath, filename);
  }

  return join(OUTPUT_DIR, filename);
}

/**
 * Write content to a file
 */
export const writeFileSkill: Skill = {
  name: "write_file",
  description:
    "Write content to a file in the output directory. Supports markdown, text, and JSON.",
  inputSchema: z.object({
    filename: z.string().describe("Filename (e.g., 'report.md', 'data.json')"),
    content: z.string().describe("Content to write"),
    subdir: z.string().optional().describe("Optional subdirectory within output"),
    append: z.boolean().optional().describe("Append to existing file instead of overwriting"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { filename, content, subdir, append = false } = input as {
      filename: string;
      content: string;
      subdir?: string;
      append?: boolean;
    };

    const filePath = getSafeFilePath(filename, subdir);
    if (!filePath) {
      return { success: false, error: "Invalid filename or path" };
    }

    try {
      if (append && existsSync(filePath)) {
        const existing = readFileSync(filePath, "utf-8");
        writeFileSync(filePath, existing + "\n" + content, "utf-8");
      } else {
        writeFileSync(filePath, content, "utf-8");
      }

      return {
        success: true,
        data: {
          path: filePath,
          filename,
          size: content.length,
          action: append ? "appended" : "written",
        },
      };
    } catch (error) {
      return { success: false, error: `Write failed: ${error}` };
    }
  },
};

/**
 * Read content from a file
 */
export const readFileSkill: Skill = {
  name: "read_file",
  description: "Read content from a file in the output directory.",
  inputSchema: z.object({
    filename: z.string().describe("Filename to read"),
    subdir: z.string().optional().describe("Subdirectory within output"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { filename, subdir } = input as {
      filename: string;
      subdir?: string;
    };

    const filePath = getSafeFilePath(filename, subdir);
    if (!filePath) {
      return { success: false, error: "Invalid filename or path" };
    }

    if (!existsSync(filePath)) {
      return { success: false, error: `File not found: ${filename}` };
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      return {
        success: true,
        data: {
          path: filePath,
          filename,
          content,
          size: content.length,
        },
      };
    } catch (error) {
      return { success: false, error: `Read failed: ${error}` };
    }
  },
};

/**
 * List files in output directory
 */
export const listFilesSkill: Skill = {
  name: "list_files",
  description: "List files in the output directory or a subdirectory.",
  inputSchema: z.object({
    subdir: z.string().optional().describe("Subdirectory to list"),
    pattern: z.string().optional().describe("Filter by extension (e.g., '.md', '.json')"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { subdir, pattern } = input as {
      subdir?: string;
      pattern?: string;
    };

    ensureOutputDir();

    let targetDir = OUTPUT_DIR;
    if (subdir) {
      if (!validateFilename(subdir)) {
        return { success: false, error: "Invalid subdirectory" };
      }
      targetDir = join(OUTPUT_DIR, subdir);
    }

    if (!existsSync(targetDir)) {
      return { success: true, data: { files: [], count: 0 } };
    }

    try {
      let files = readdirSync(targetDir);

      if (pattern) {
        files = files.filter((f) => extname(f) === pattern);
      }

      const fileDetails = files.map((f) => {
        const stats = existsSync(join(targetDir, f));
        return {
          name: f,
          extension: extname(f),
        };
      });

      return {
        success: true,
        data: {
          directory: targetDir,
          files: fileDetails,
          count: files.length,
        },
      };
    } catch (error) {
      return { success: false, error: `List failed: ${error}` };
    }
  },
};

/**
 * Write a markdown report
 */
export const writeReportSkill: Skill = {
  name: "write_report",
  description:
    "Write a structured markdown report. Automatically adds metadata and formatting.",
  inputSchema: z.object({
    title: z.string().describe("Report title"),
    content: z.string().describe("Report content (markdown)"),
    filename: z.string().optional().describe("Custom filename (auto-generated if not provided)"),
    subdir: z.string().optional().describe("Subdirectory (default: 'reports')"),
    metadata: z
      .object({
        author: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source: z.string().optional(),
      })
      .optional(),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { title, content, filename, subdir = "reports", metadata = {} } = input as {
      title: string;
      content: string;
      filename?: string;
      subdir?: string;
      metadata?: { author?: string; tags?: string[]; source?: string };
    };

    // Generate filename if not provided
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
    const finalFilename = filename || `${timestamp}-${safeTitle}.md`;

    // Build report content
    const reportContent = `# ${title}

> Generated: ${new Date().toISOString()}
${metadata.author ? `> Author: ${metadata.author}` : ""}
${metadata.source ? `> Source: ${metadata.source}` : ""}
${metadata.tags?.length ? `> Tags: ${metadata.tags.join(", ")}` : ""}

---

${content}
`;

    const filePath = getSafeFilePath(finalFilename, subdir);
    if (!filePath) {
      return { success: false, error: "Invalid filename or path" };
    }

    try {
      writeFileSync(filePath, reportContent, "utf-8");

      return {
        success: true,
        data: {
          path: filePath,
          filename: finalFilename,
          title,
          size: reportContent.length,
        },
      };
    } catch (error) {
      return { success: false, error: `Write report failed: ${error}` };
    }
  },
};

export const filesystemSkills = [writeFileSkill, readFileSkill, listFilesSkill, writeReportSkill];
