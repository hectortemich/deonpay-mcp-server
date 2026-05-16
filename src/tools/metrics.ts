/**
 * Merchant Metrics — curated dashboard subset for external integrations.
 *
 * This is the highest-leverage tool for "how is my business doing?" type
 * prompts. The endpoint is intentionally a SUBSET of the dashboard's full
 * metrics to avoid leaking sensitive aggregates (e.g. top customers, card
 * mix) over an API token.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { EnvironmentSchema } from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

export function registerMetricsTools(server: McpServer, client: DeonpayClient): void {
  server.registerTool(
    "deonpay_get_merchant_metrics",
    {
      title: "Get merchant metrics",
      description:
        "Fetch a curated set of business metrics for the merchant. Use this as the FIRST tool for high-level questions: 'how much have I sold this month', 'what is my MRR', 'how is my conversion rate trending', 'how many active subscribers do I have'. Returns: revenue (gross/net/refunded in centavos), transactions (total/successful/failed/conversion_rate as %/average_ticket in centavos), subscriptions snapshot (active_subscribers, trialing_subscribers, past_due, mrr in centavos, churn_rate as %), and revenue_mix (recurring vs one_time, in centavos). IMPORTANT: subscriptions.active/trialing/past_due AND mrr are SNAPSHOTS — they ignore `period`. mrr is always a 30-day run-rate. revenue, transactions, churn_rate and revenue_mix DO honor `period`.",
      inputSchema: {
        period: z
          .enum(["today", "7d", "30d", "90d", "ytd", "all"])
          .optional()
          .describe("Time window. Default '30d'. 'all' goes back to epoch."),
        environment: EnvironmentSchema.optional(),
      },
    },
    safeHandler(async (args) => {
      return client.get("/merchant/metrics", compact(args));
    }),
  );
}
