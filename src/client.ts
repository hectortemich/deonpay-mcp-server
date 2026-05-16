/**
 * Thin HTTP client around the DeonPay public API v1.
 *
 * Why a class and not a module? Each MCP server instance carries one client
 * with its own token / baseUrl / timeout — easier to test and easier to swap
 * for a mock in unit tests later.
 *
 * Error handling rationale:
 * - We map common HTTP statuses (401/403/404/429/5xx) to messages that tell
 *   the LLM (or a human reading the transcript) exactly what went wrong AND
 *   what to do about it. The LLM relays these to the user.
 * - We never throw raw `Error` objects with stack traces of internal noise —
 *   instead we throw `DeonpayApiError` with a `.code` for programmatic
 *   handling and a `.message` that's safe to surface verbatim.
 */

import type { Config } from "./config.js";

export type DeonpayErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation_error"
  | "server_error"
  | "network_error"
  | "timeout"
  | "invalid_response";

export class DeonpayApiError extends Error {
  public readonly code: DeonpayErrorCode;
  public readonly status: number | undefined;
  public readonly details: unknown;

  constructor(code: DeonpayErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "DeonpayApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * The DeonPay API accepts arbitrary JSON-serializable values. We type the
 * body as `unknown` (rather than a strict recursive Json type) so callers
 * can pass `Record<string, unknown>` shapes without a cast at every site.
 * JSON.stringify handles serialization and rejects bad inputs at runtime.
 */
export type JsonBody = unknown;

export interface QueryParams {
  [key: string]: string | number | boolean | undefined | null;
}

export class DeonpayClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly debug: boolean;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl;
    this.token = config.apiToken;
    this.timeoutMs = config.timeoutMs;
    this.userAgent = config.userAgent;
    this.debug = config.debug;
  }

  /** GET /api/v1/<path>. `path` should start with "/". */
  async get<T = unknown>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  /** POST /api/v1/<path> with a JSON body. */
  async post<T = unknown>(path: string, body?: JsonBody): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  /** PATCH /api/v1/<path> with a JSON body. The DeonPay API uses PATCH (not PUT) for updates. */
  async patch<T = unknown>(path: string, body?: JsonBody): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  /** DELETE /api/v1/<path>. */
  async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    opts: { query?: QueryParams; body?: JsonBody } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      // Both headers are sent because Vercel Deployment Protection (and some
      // other reverse proxies) consume Authorization. X-API-Key is the
      // documented fallback. The DeonPay API checks Authorization first.
      Authorization: `Bearer ${this.token}`,
      "X-API-Key": this.token,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };

    let bodyString: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyString = JSON.stringify(opts.body);
    }

    if (this.debug) {
      this.log(`-> ${method} ${url}${bodyString ? ` body=${truncate(bodyString)}` : ""}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: bodyString,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new DeonpayApiError(
          "timeout",
          `Request to DeonPay timed out after ${this.timeoutMs}ms (${method} ${path}).`,
        );
      }
      const cause = err instanceof Error ? err.message : String(err);
      throw new DeonpayApiError(
        "network_error",
        `Could not reach DeonPay at ${this.baseUrl}. Check DEONPAY_BASE_URL and your network. (${cause})`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        // Not JSON — keep `parsed` undefined and use raw text in error messages.
      }
    }

    if (this.debug) {
      this.log(`<- ${response.status} ${method} ${path} ${truncate(text)}`);
    }

    if (!response.ok) {
      throw mapHttpError(response.status, parsed, text, method, path);
    }

    if (parsed === undefined) {
      // 204 No Content or empty body — return empty object cast to T.
      return {} as T;
    }
    return parsed as T;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    if (!path.startsWith("/")) {
      throw new Error(`DeonpayClient path must start with "/", got: ${path}`);
    }
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private log(line: string): void {
    // stdio MCP transport reserves stdout for protocol messages; debug must go to stderr.
    process.stderr.write(`[deonpay-mcp] ${line}\n`);
  }
}

function mapHttpError(
  status: number,
  parsed: unknown,
  rawText: string,
  method: string,
  path: string,
): DeonpayApiError {
  const apiMessage = extractApiMessage(parsed);
  const apiCode = extractApiCode(parsed);
  const suffix = apiMessage ? ` Details: ${apiMessage}` : "";

  switch (status) {
    case 401:
      return new DeonpayApiError(
        "unauthorized",
        `DeonPay rejected the API token (401). Verify DEONPAY_API_TOKEN is correct, active and matches the environment of your data.${suffix}`,
        status,
        parsed,
      );
    case 403: {
      const permHint = apiMessage?.match(/permis[oa]\s+([\w.]+)/i)?.[1];
      const reqPerm = permHint ? ` Required permission: ${permHint}.` : "";
      return new DeonpayApiError(
        "forbidden",
        `DeonPay denied access (403). The token does not grant permission for ${method} /api/v1${path}.${reqPerm}${suffix}`,
        status,
        parsed,
      );
    }
    case 404:
      return new DeonpayApiError(
        "not_found",
        `DeonPay returned 404 for ${method} /api/v1${path}.${suffix || " The resource does not exist or is not visible to this token."}`,
        status,
        parsed,
      );
    case 409:
      return new DeonpayApiError(
        "validation_error",
        `DeonPay returned 409 (conflict) for ${method} /api/v1${path}.${suffix}`,
        status,
        parsed,
      );
    case 422:
    case 400:
      return new DeonpayApiError(
        "validation_error",
        `DeonPay rejected the request (${status}, code: ${apiCode ?? "validation_error"}).${suffix}`,
        status,
        parsed,
      );
    case 429:
      return new DeonpayApiError(
        "rate_limited",
        `DeonPay rate limit exceeded (429). Retry in a few seconds.${suffix}`,
        status,
        parsed,
      );
    default:
      if (status >= 500) {
        return new DeonpayApiError(
          "server_error",
          `DeonPay returned a server error (${status}). Try again shortly.${suffix}`,
          status,
          parsed,
        );
      }
      return new DeonpayApiError(
        "invalid_response",
        `Unexpected HTTP ${status} from DeonPay (${method} /api/v1${path}).${suffix || ` Body: ${truncate(rawText)}`}`,
        status,
        parsed,
      );
  }
}

function extractApiMessage(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const errProp = (parsed as Record<string, unknown>).error;
  if (typeof errProp === "string") return errProp;
  if (errProp && typeof errProp === "object") {
    const msg = (errProp as Record<string, unknown>).message;
    if (typeof msg === "string") return msg;
  }
  return undefined;
}

function extractApiCode(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const errProp = (parsed as Record<string, unknown>).error;
  if (errProp && typeof errProp === "object") {
    const code = (errProp as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}...(${s.length - max} more chars)` : s;
}
