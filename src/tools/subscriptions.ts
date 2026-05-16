/**
 * Subscription PLANS (the recurring template). For individual subscribers
 * see customer-subscriptions.ts.
 *
 * v0.1 exposes list / get / create. Updates are deferred because changing an
 * active plan can ripple through ongoing recurring charges and we want a
 * clearer confirmation path before letting the LLM mutate it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { EnvironmentSchema, LimitSchema, PageSchema } from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

const IntervalSchema = z.enum(["daily", "weekly", "biweekly", "monthly", "yearly"]);
const PlanStatusSchema = z.enum(["active", "paused", "archived"]);

export function registerSubscriptionTools(server: McpServer, client: DeonpayClient): void {
  // -------------------------------------------------------------------------
  // deonpay_list_subscriptions
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_subscriptions",
    {
      title: "List subscription plans",
      description:
        "List subscription PLANS (the recurring templates, not individual subscribers). Use this when the user asks 'what subscription plans do I have', 'show me my recurring products', or 'find the Premium plan'. Each item includes id, name, amount in centavos, currency, interval_type (daily/weekly/biweekly/monthly/yearly), interval_count, trial_days, status (active/paused/archived) plus aggregated stats: active_subscribers and total_revenue. Use deonpay_list_customer_subscriptions to drill into actual subscribers of a plan.",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        status: PlanStatusSchema.optional(),
        search: z.string().optional().describe("Case-insensitive partial match on plan name."),
        environment: EnvironmentSchema.optional(),
      },
    },
    safeHandler(async (args) => {
      return client.get("/subscriptions", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_subscription
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_subscription",
    {
      title: "Get subscription plan details",
      description:
        "Fetch a single subscription plan by UUID, including aggregated stats (active_subscribers, total_subscribers) and the most recent 10 recurring charges across all subscribers. Use this when the user wants a quick health view of a specific plan ('how is the Premium plan doing this month'). For per-subscriber detail use deonpay_list_customer_subscriptions filtered by subscription_id.",
      inputSchema: {
        id: z.string().uuid().describe("Subscription plan UUID."),
      },
    },
    safeHandler(async ({ id }) => {
      return client.get(`/subscriptions/${encodeURIComponent(id)}`);
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_create_subscription
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_create_subscription",
    {
      title: "Create a subscription plan",
      description:
        "Create a new subscription PLAN (template). Use this when the user wants to set up a recurring charge: 'create a $299 monthly plan called Premium'. Required: name, amount (centavos, min 100 = $1 MXN), interval_type. Important: in production the merchant must have an On-Demand NetPay key configured for the active environment, otherwise this returns ondemand_key_missing. trial_days > 0 enables a free trial period (charges a $10 MXN card-validation tx on the first day to verify the card). Optional flags allow_customer_cancel/pause/advance_payments control the customer self-service portal.",
      inputSchema: {
        name: z.string().min(1).max(255).describe("Plan name shown to subscribers."),
        amount: z.number().int().min(100).describe("Amount per cycle in CENTAVOS (min 100 = $1 MXN)."),
        interval_type: IntervalSchema.describe("Billing cadence."),
        description: z.string().max(1000).optional(),
        currency: z.string().length(3).optional().describe("ISO 3-letter code, default MXN."),
        interval_count: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Multiplier of interval_type, e.g. interval_type='monthly' + interval_count=3 -> every 3 months."),
        max_charges: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Hard cap on total charges per subscriber. Null/omitted = unlimited."),
        trial_days: z
          .number()
          .int()
          .min(0)
          .max(365)
          .optional()
          .describe("Free trial length in days. 0 = no trial."),
        product_id: z
          .string()
          .uuid()
          .optional()
          .describe("Optional product to associate (must be active and not stock-tracked)."),
        contract_terms: z.string().max(20000).optional().describe("Terms shown at checkout."),
        allow_customer_cancel: z.boolean().optional().describe("Default true."),
        allow_customer_pause: z.boolean().optional().describe("Default false."),
        allow_advance_payments: z.boolean().optional().describe("Default false."),
        max_advance_payments: z.number().int().min(1).optional(),
        portal_enabled: z.boolean().optional().describe("Default true."),
        metadata: z.record(z.unknown()).optional(),
      },
    },
    safeHandler(async (args) => {
      return client.post("/subscriptions", compact(args));
    }),
  );
}
