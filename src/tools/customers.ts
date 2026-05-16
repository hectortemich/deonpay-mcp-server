/**
 * Customers — read-only summary indexed by email.
 *
 * The DeonPay platform doesn't have a hard customers table — a customer
 * "exists" if they have at least one non-validation transaction. The API
 * consolidates data from transactions, customer_subscriptions and
 * saved_cards, so the list endpoint is the right starting point for
 * questions like "who's spending the most" or "show me my regulars".
 *
 * Path emails MUST be URL-encoded: cliente@x.com -> cliente%40x.com. We
 * do that for the LLM via encodeURIComponent.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { EnvironmentSchema, LimitSchema, PageSchema } from "../schemas/common.js";
import { compact, encodePathSegment, safeHandler } from "./_helpers.js";

export function registerCustomerTools(server: McpServer, client: DeonpayClient): void {
  // -------------------------------------------------------------------------
  // deonpay_list_customers
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_customers",
    {
      title: "List customers",
      description:
        "List the merchant's customers (people who have completed at least one non-validation transaction). Use this for questions like 'who are my top customers', 'how many recurring buyers do I have', 'find customers with email containing X'. Sort by 'recent' (last transaction, default), 'revenue' (most spent), or 'transactions' (most active). Each row includes email, name, phone, first_seen_at, last_seen_at, total_transactions, total_spent in centavos, active_subscriptions and saved_cards_count.",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        search: z.string().optional().describe("Free-text search across email, name, phone."),
        sort: z
          .enum(["recent", "revenue", "transactions"])
          .optional()
          .describe("Sort order. Default 'recent'."),
        environment: EnvironmentSchema.optional(),
      },
    },
    safeHandler(async (args) => {
      return client.get("/customers", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_customer
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_customer",
    {
      title: "Get customer details by email",
      description:
        "Fetch a customer's full profile by email. Returns basic info, saved_cards (safe metadata only — never the vault token), active_subscriptions (status active/trialing/past_due/paused), and the last 20 transactions (excluding $10 MXN card-validation charges). Use this when the user asks 'show me everything about cliente@x.com' or 'what cards does this customer have on file'. The email is URL-encoded automatically — pass the plain email.",
      inputSchema: {
        email: z.string().email().describe("Customer email (plain — encoding is handled internally)."),
        environment: EnvironmentSchema.optional(),
      },
    },
    safeHandler(async ({ email, environment }) => {
      const path = `/customers/${encodePathSegment(email)}`;
      return client.get(path, compact({ environment }));
    }),
  );
}
