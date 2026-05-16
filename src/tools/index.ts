/**
 * Tool registry. Each domain module exports a `register*` function that takes
 * the McpServer + DeonpayClient and adds its tools. Keeping registration
 * one-call-per-module makes it trivial to disable a category later (e.g.
 * gate POS tools behind a feature flag).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { DeonpayClient } from "../client.js";
import { registerLinkTools } from "./links.js";
import { registerCheckoutTools } from "./checkout.js";
import { registerTransactionTools } from "./transactions.js";
import { registerProductTools } from "./products.js";
import { registerSubscriptionTools } from "./subscriptions.js";
import { registerCustomerSubscriptionTools } from "./customer-subscriptions.js";
import { registerCustomerTools } from "./customers.js";
import { registerMetricsTools } from "./metrics.js";

export function registerAllTools(server: McpServer, client: DeonpayClient): void {
  registerLinkTools(server, client);
  registerCheckoutTools(server, client);
  registerTransactionTools(server, client);
  registerProductTools(server, client);
  registerSubscriptionTools(server, client);
  registerCustomerSubscriptionTools(server, client);
  registerCustomerTools(server, client);
  registerMetricsTools(server, client);
}
