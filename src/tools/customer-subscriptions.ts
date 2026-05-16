/**
 * Customer Subscriptions — the actual per-customer subscription rows.
 *
 * Read-only in v0.1. Cancellations live at POST .../cancel and are NOT
 * exposed yet because they affect future billing and need explicit
 * confirmation before we hand the gun to the LLM.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { EnvironmentSchema, LimitSchema, PageSchema } from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

const CustomerSubscriptionStatusSchema = z.enum([
  "active",
  "paused",
  "cancelled",
  "past_due",
  "completed",
  "trialing",
]);

export function registerCustomerSubscriptionTools(
  server: McpServer,
  client: DeonpayClient,
): void {
  // -------------------------------------------------------------------------
  // deonpay_list_customer_subscriptions
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_customer_subscriptions",
    {
      title: "List customer subscriptions",
      description:
        "List individual customer subscriptions (the per-customer rows, NOT the plans). Use this to answer 'who is currently subscribed to plan X', 'how many trialing subscribers do I have', or 'find subscribers on past_due'. Filter by subscription_id (the plan), customer_email (exact, case-insensitive), and status (active/paused/cancelled/past_due/completed/trialing). Each item includes the plan denormalized as a `subscription` sub-object, charges_count, total_charged in centavos, current_period_start/end, next_charge_at, and cancel_at_period_end.",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        subscription_id: z.string().uuid().optional().describe("Filter by plan UUID."),
        customer_email: z.string().email().optional().describe("Exact email match (case-insensitive)."),
        status: CustomerSubscriptionStatusSchema.optional(),
        environment: EnvironmentSchema.optional(),
      },
    },
    safeHandler(async (args) => {
      return client.get(
        "/customer-subscriptions",
        compact(args),
      );
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_customer_subscription
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_customer_subscription",
    {
      title: "Get customer subscription details",
      description:
        "Fetch a single customer subscription by UUID. Includes the plan denormalized, the last 20 recurring charges (each with status success/failed/skipped/completed, charge_type auto/manual/renewal_link, attempt_number, error_message and timestamps), and cancellation flags. Use this when investigating a specific subscriber's history or a failed charge ('why did Juan's subscription go past_due?').",
      inputSchema: {
        id: z.string().uuid().describe("Customer subscription UUID."),
      },
    },
    safeHandler(async ({ id }) => {
      return client.get(`/customer-subscriptions/${encodeURIComponent(id)}`);
    }),
  );
}
