/**
 * Build the McpServer instance and wire up the DeonPay tool registry.
 *
 * Kept separate from index.ts so tests / alternative transports can
 * construct a server without owning stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DeonpayClient } from "./client.js";
import type { Config } from "./config.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(config: Config): McpServer {
  const server = new McpServer(
    {
      name: "deonpay-mcp-server",
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "DeonPay MCP server. Use these tools to query payments, payment links, " +
        "subscriptions, customers and metrics for the authenticated merchant. " +
        "All amounts are in CENTAVOS (1 MXN = 100). Reads are safe; the writes " +
        "available in this build (create_link, create_checkout_session, " +
        "create_product, create_subscription, update_link, update_product) are " +
        "non-destructive — refunds, cancellations and deletions are not exposed.",
    },
  );

  const client = new DeonpayClient(config);
  registerAllTools(server, client);

  return server;
}
