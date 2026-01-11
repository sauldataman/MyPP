/**
 * Data Analysis Skills
 *
 * Skills for data manipulation and analysis.
 */

import { z } from "zod";
import { Skill, SkillResult, SkillContext } from "../types.js";

/**
 * Parse JSON data
 */
export const parseJsonSkill: Skill = {
  name: "parse_json",
  description: "Parse a JSON string into structured data",
  inputSchema: z.object({
    json: z.string().describe("JSON string to parse"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { json } = input as { json: string };
    try {
      const data = JSON.parse(json);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: `Invalid JSON: ${error}` };
    }
  },
};

/**
 * Extract data from text using pattern
 */
export const extractDataSkill: Skill = {
  name: "extract_data",
  description: "Extract data from text using a regex pattern",
  inputSchema: z.object({
    text: z.string().describe("Text to extract from"),
    pattern: z.string().describe("Regex pattern with capture groups"),
    flags: z.string().optional().describe("Regex flags (g, i, m)"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { text, pattern, flags = "g" } = input as {
      text: string;
      pattern: string;
      flags?: string;
    };

    try {
      const regex = new RegExp(pattern, flags);
      const matches: string[][] = [];
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push(Array.from(match));
        if (!flags.includes("g")) break;
      }

      return {
        success: true,
        data: {
          matchCount: matches.length,
          matches,
        },
      };
    } catch (error) {
      return { success: false, error: `Regex error: ${error}` };
    }
  },
};

/**
 * Store data in agent state
 */
export const storeDataSkill: Skill = {
  name: "store_data",
  description: "Store data in the current session state for later use",
  inputSchema: z.object({
    key: z.string().describe("Storage key"),
    value: z.unknown().describe("Value to store"),
  }),
  execute: async (input, context: SkillContext): Promise<SkillResult> => {
    const { key, value } = input as { key: string; value: unknown };
    context.state.set(key, value);
    return {
      success: true,
      data: { stored: key },
    };
  },
};

/**
 * Retrieve data from agent state
 */
export const retrieveDataSkill: Skill = {
  name: "retrieve_data",
  description: "Retrieve data from the current session state",
  inputSchema: z.object({
    key: z.string().describe("Storage key to retrieve"),
  }),
  execute: async (input, context: SkillContext): Promise<SkillResult> => {
    const { key } = input as { key: string };
    const value = context.state.get(key);

    if (value === undefined) {
      return { success: false, error: `Key not found: ${key}` };
    }

    return { success: true, data: value };
  },
};

/**
 * Transform array data
 */
export const transformArraySkill: Skill = {
  name: "transform_array",
  description: "Transform an array of objects - filter, map, sort, or slice",
  inputSchema: z.object({
    data: z.array(z.record(z.unknown())).describe("Array of objects to transform"),
    filter: z
      .object({
        field: z.string(),
        operator: z.enum(["eq", "ne", "gt", "lt", "gte", "lte", "contains"]),
        value: z.unknown(),
      })
      .optional()
      .describe("Filter condition"),
    select: z.array(z.string()).optional().describe("Fields to select"),
    sortBy: z.string().optional().describe("Field to sort by"),
    sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort order"),
    limit: z.number().optional().describe("Maximum items to return"),
    offset: z.number().optional().describe("Items to skip"),
  }),
  execute: async (input): Promise<SkillResult> => {
    let { data, filter, select, sortBy, sortOrder = "asc", limit, offset = 0 } = input as {
      data: Record<string, unknown>[];
      filter?: { field: string; operator: string; value: unknown };
      select?: string[];
      sortBy?: string;
      sortOrder?: string;
      limit?: number;
      offset?: number;
    };

    try {
      // Filter
      if (filter) {
        data = data.filter((item) => {
          const fieldValue = item[filter.field];
          const filterValue = filter.value;

          switch (filter.operator) {
            case "eq":
              return fieldValue === filterValue;
            case "ne":
              return fieldValue !== filterValue;
            case "gt":
              return (fieldValue as number) > (filterValue as number);
            case "lt":
              return (fieldValue as number) < (filterValue as number);
            case "gte":
              return (fieldValue as number) >= (filterValue as number);
            case "lte":
              return (fieldValue as number) <= (filterValue as number);
            case "contains":
              return String(fieldValue).includes(String(filterValue));
            default:
              return true;
          }
        });
      }

      // Sort
      if (sortBy) {
        data = [...data].sort((a, b) => {
          const aVal = a[sortBy] as string | number;
          const bVal = b[sortBy] as string | number;
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortOrder === "desc" ? -cmp : cmp;
        });
      }

      // Pagination
      data = data.slice(offset, limit ? offset + limit : undefined);

      // Select fields
      if (select && select.length > 0) {
        data = data.map((item) => {
          const result: Record<string, unknown> = {};
          for (const field of select) {
            result[field] = item[field];
          }
          return result;
        });
      }

      return {
        success: true,
        data: {
          count: data.length,
          items: data,
        },
      };
    } catch (error) {
      return { success: false, error: `Transform error: ${error}` };
    }
  },
};

/**
 * Aggregate array data
 */
export const aggregateDataSkill: Skill = {
  name: "aggregate_data",
  description: "Aggregate numeric data - sum, average, min, max, count",
  inputSchema: z.object({
    data: z.array(z.record(z.unknown())).describe("Array of objects"),
    operations: z.array(
      z.object({
        field: z.string().describe("Field to aggregate"),
        type: z.enum(["sum", "avg", "min", "max", "count"]).describe("Aggregation type"),
        alias: z.string().optional().describe("Result field name"),
      })
    ),
    groupBy: z.string().optional().describe("Field to group by"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { data, operations, groupBy } = input as {
      data: Record<string, unknown>[];
      operations: Array<{ field: string; type: string; alias?: string }>;
      groupBy?: string;
    };

    try {
      const aggregate = (items: Record<string, unknown>[]) => {
        const result: Record<string, unknown> = {};

        for (const op of operations) {
          const values = items
            .map((item) => item[op.field])
            .filter((v): v is number => typeof v === "number");

          const key = op.alias || `${op.type}_${op.field}`;

          switch (op.type) {
            case "sum":
              result[key] = values.reduce((a, b) => a + b, 0);
              break;
            case "avg":
              result[key] = values.length > 0
                ? values.reduce((a, b) => a + b, 0) / values.length
                : 0;
              break;
            case "min":
              result[key] = values.length > 0 ? Math.min(...values) : null;
              break;
            case "max":
              result[key] = values.length > 0 ? Math.max(...values) : null;
              break;
            case "count":
              result[key] = items.length;
              break;
          }
        }

        return result;
      };

      if (groupBy) {
        const groups: Record<string, Record<string, unknown>[]> = {};
        for (const item of data) {
          const key = String(item[groupBy] ?? "null");
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        }

        const results = Object.entries(groups).map(([key, items]) => ({
          [groupBy]: key,
          ...aggregate(items),
        }));

        return { success: true, data: results };
      }

      return { success: true, data: aggregate(data) };
    } catch (error) {
      return { success: false, error: `Aggregation error: ${error}` };
    }
  },
};

export const dataSkills = [
  parseJsonSkill,
  extractDataSkill,
  storeDataSkill,
  retrieveDataSkill,
  transformArraySkill,
  aggregateDataSkill,
];
