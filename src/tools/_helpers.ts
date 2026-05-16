/**
 * Shared utilities for tool handlers. Standardizes:
 * - How API responses are serialized for the LLM (pretty JSON in a text block).
 * - How errors propagate to the MCP client (always with isError: true so
 *   Claude knows the call failed and can react / report it back to the user).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { DeonpayApiError } from "../client.js";

/** Wrap any value as a successful tool result with pretty-printed JSON content. */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

/**
 * Wrap an error as a tool result with isError = true. Surfaces the message
 * verbatim — the client.ts mapper has already produced something user-friendly.
 */
export function errorResult(err: unknown): CallToolResult {
  if (err instanceof DeonpayApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `[${err.code}${err.status ? ` ${err.status}` : ""}] ${err.message}`,
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Unexpected error: ${message}`,
      },
    ],
  };
}

/**
 * Wraps a tool handler with a try/catch that converts thrown errors into
 * MCP-shaped error results. Without this, an uncaught throw bubbles up as a
 * JSON-RPC protocol error and the assistant has no useful context.
 */
export function safeHandler<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
): (args: TArgs) => Promise<CallToolResult> {
  return async (args: TArgs) => {
    try {
      const value = await fn(args);
      return jsonResult(value);
    } catch (err) {
      return errorResult(err);
    }
  };
}

/**
 * Encodes the local part / full email for use in path segments. RFC 3986 says
 * `@` is reserved as a sub-delim, so encodeURIComponent is the safe choice.
 */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Strips undefined / null / empty-string entries from a body before sending.
 * The DeonPay API accepts missing fields cleanly but treating "" as a valid
 * value would override server-side defaults — usually not what the LLM means.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
