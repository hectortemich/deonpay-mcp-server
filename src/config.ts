/**
 * Runtime configuration for the DeonPay MCP server.
 *
 * Reads environment variables once at startup, validates them, and exposes a
 * frozen Config object. Fails fast with a clear message when required values
 * are missing — this avoids surfacing cryptic errors deep in tool calls.
 */

const PACKAGE_VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://deonpay.mx";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface Config {
  /** Bearer token used for every request to the DeonPay public API. */
  apiToken: string;
  /** Base URL of the DeonPay deployment (no trailing slash). */
  baseUrl: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /** When true, debug logs are written to stderr. */
  debug: boolean;
  /** User-Agent header sent with every API request. */
  userAgent: string;
  /** Package version (used for User-Agent and server identification). */
  version: string;
}

/**
 * Build the runtime config from process.env. Throws Error if required vars are
 * missing — let the entry point handle exit codes so tests can call this freely.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiToken = (env.DEONPAY_API_TOKEN ?? "").trim();
  if (!apiToken) {
    throw new Error(
      "DEONPAY_API_TOKEN is required. Generate one at https://deonpay.mx/dashboard/settings/mcp-connections " +
        "and pass it via the environment (e.g. claude_desktop_config.json -> mcpServers.deonpay.env).",
    );
  }
  if (!apiToken.startsWith("dp_")) {
    throw new Error(
      `DEONPAY_API_TOKEN has an unexpected format. Expected a token starting with "dp_", ` +
        `got "${apiToken.slice(0, 6)}...". Re-issue it from the DeonPay dashboard.`,
    );
  }

  const rawBaseUrl = (env.DEONPAY_BASE_URL ?? DEFAULT_BASE_URL).trim();
  let baseUrl: string;
  try {
    const parsed = new URL(rawBaseUrl);
    baseUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
  } catch {
    throw new Error(
      `DEONPAY_BASE_URL is not a valid URL: "${rawBaseUrl}". ` +
        `Expected something like https://deonpay.mx`,
    );
  }

  const timeoutMs = parsePositiveInt(env.DEONPAY_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  const debug = env.DEONPAY_DEBUG === "1" || env.DEONPAY_DEBUG === "true";

  return Object.freeze({
    apiToken,
    baseUrl,
    timeoutMs,
    debug,
    userAgent: `deonpay-mcp/${PACKAGE_VERSION} (+https://github.com/deonpay/deonpay-mcp-server)`,
    version: PACKAGE_VERSION,
  });
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
