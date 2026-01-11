/**
 * Web Skills
 *
 * Skills for fetching web content and making HTTP requests.
 */

import { z } from "zod";
import { Skill, SkillResult } from "../types.js";

/**
 * Fetch URL content
 */
export const fetchUrlSkill: Skill = {
  name: "fetch_url",
  description: "Fetch content from a URL. Returns the text content or error.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to fetch"),
    method: z.enum(["GET", "POST"]).optional().describe("HTTP method, defaults to GET"),
    headers: z.record(z.string()).optional().describe("Optional headers"),
    body: z.string().optional().describe("Optional request body for POST"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { url, method = "GET", headers = {}, body } = input as {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": "Panopticon-Agent/1.0",
          ...headers,
        },
        body: method === "POST" ? body : undefined,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      let data: unknown;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        // Truncate very long responses
        data = text.length > 50000 ? text.slice(0, 50000) + "\n...[truncated]" : text;
      }

      return {
        success: true,
        data: {
          status: response.status,
          contentType,
          data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Fetch error: ${error}`,
      };
    }
  },
};

/**
 * Make API request with JSON
 */
export const apiRequestSkill: Skill = {
  name: "api_request",
  description: "Make an API request with JSON body. Returns JSON response.",
  inputSchema: z.object({
    url: z.string().url().describe("The API endpoint URL"),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).describe("HTTP method"),
    headers: z.record(z.string()).optional().describe("Optional headers"),
    body: z.record(z.unknown()).optional().describe("JSON body for the request"),
  }),
  execute: async (input): Promise<SkillResult> => {
    const { url, method, headers = {}, body } = input as {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    };

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Panopticon-Agent/1.0",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: unknown;
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: response.ok,
        data: {
          status: response.status,
          statusText: response.statusText,
          data,
        },
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `API request error: ${error}`,
      };
    }
  },
};

export const webSkills = [fetchUrlSkill, apiRequestSkill];
