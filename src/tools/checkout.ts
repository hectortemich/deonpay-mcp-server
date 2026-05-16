/**
 * Checkout Sessions — Stripe-style ephemeral payment pages.
 *
 * v0.1 only exposes session creation (the highest-leverage write op for the
 * LLM). Listing/reading/cancelling is intentionally deferred until we have
 * higher-confidence prompts — until then the user can fall back to the
 * web dashboard for inspection.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import {
  CustomFieldSchema,
  CustomizationSchema,
  LineItemSchema,
} from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

export function registerCheckoutTools(server: McpServer, client: DeonpayClient): void {
  server.registerTool(
    "deonpay_create_checkout_session",
    {
      title: "Create a checkout session",
      description:
        "Create an ephemeral checkout session (Stripe-style). Use this when integrating an e-commerce flow: the user wants a one-time payment URL tied to a specific cart and a success_url to land on after payment. The response contains `url` (where to redirect the customer) and `session_id` (used to look up the session later). Amounts are in CENTAVOS. Mode defaults to 'redirect' — use 'embedded' or 'modal' only if the calling app already supports those flows. The session expires by default in 30 minutes (override with expires_in, range 5..1440).",
      inputSchema: {
        line_items: z
          .array(LineItemSchema)
          .min(1)
          .describe(
            "At least one line item. Each item is either a catalog reference {product_id, quantity} or inline {name, quantity, unit_amount}. unit_amount is in centavos.",
          ),
        success_url: z
          .string()
          .url()
          .describe(
            "Where the customer is redirected after a successful payment. Supports {session_id} as a placeholder, e.g. https://my-shop.com/order/done?session_id={session_id}.",
          ),
        cancel_url: z
          .string()
          .url()
          .optional()
          .describe("Where the customer is redirected if they abandon checkout."),
        mode: z
          .enum(["redirect", "embedded", "modal"])
          .optional()
          .describe("Display mode. Defaults to 'redirect'."),
        expires_in: z
          .number()
          .int()
          .min(5)
          .max(1440)
          .optional()
          .describe("Minutes until the session expires (default 30, max 1440)."),
        allow_msi: z.boolean().optional(),
        msi_options: z.array(z.number().int()).optional(),
        customer_email: z.string().email().optional(),
        customer_name: z.string().max(255).optional(),
        customer_phone: z.string().max(15).optional(),
        client_reference_id: z
          .string()
          .max(255)
          .optional()
          .describe("Your internal order/cart id for reconciliation."),
        metadata: z.record(z.unknown()).optional(),
        customization: CustomizationSchema.optional(),
        custom_fields: z.array(CustomFieldSchema).optional(),
        locale: z.enum(["es", "en"]).optional().describe("Checkout UI language."),
        display_currency: z.enum(["USD", "EUR", "GBP", "CAD"]).optional(),
        exchange_rate: z.number().positive().optional(),
        allow_save_card: z
          .boolean()
          .optional()
          .describe("Whether the customer can save their card for future use."),
      },
    },
    safeHandler(async (args) => {
      return client.post("/checkout/sessions", compact(args));
    }),
  );
}
