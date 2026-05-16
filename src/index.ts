/**
 * Entry point. Boots the MCP server over stdio.
 *
 * Why stdio? It's the only transport supported by every major MCP host today
 * (Claude Desktop, Cursor, Continue). HTTP/SSE will land in a later release.
 *
 * Logging rule: NEVER write to stdout — that channel is reserved for the
 * MCP JSON-RPC protocol. Use stderr for everything else.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();

  // Connect first so the host can negotiate capabilities before we yield.
  await server.connect(transport);

  if (config.debug) {
    process.stderr.write(
      `[deonpay-mcp] connected (baseUrl=${config.baseUrl}, timeout=${config.timeoutMs}ms)\n`,
    );
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[deonpay-mcp] fatal: ${message}\n`);
  process.exit(1);
});
