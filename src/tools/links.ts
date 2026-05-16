/**
 * Payment Links — list / read / create / update.
 *
 * The DeonPay API treats payment links as the primary "share a checkout URL"
 * primitive. Updates use HTTP PATCH (not PUT) and merge customization keys
 * instead of replacing them — make sure the descriptions reflect that so the
 * LLM doesn't try to clear customization by sending an empty object.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import {
  CustomFieldSchema,
  CustomizationSchema,
  IsoDateStringSchema,
  LimitSchema,
  LineItemSchema,
  PageSchema,
} from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

const LinkStatusSchema = z.enum(["active", "paused", "expired", "deleted"]);
const LinkTypeSchema = z.enum(["single", "recurring", "unlimited"]);

export function registerLinkTools(server: McpServer, client: DeonpayClient): void {
  // -------------------------------------------------------------------------
  // deonpay_list_links
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_links",
    {
      title: "List payment links",
      description:
        "List payment links for the authenticated merchant. Use this when the user asks 'show me my payment links', 'what links did I create last week', or wants to find a link by name. Supports filtering by status (active/paused/expired/deleted), type (single/recurring/unlimited), free-text search across name/short_code/reference, and a date range. Returns a paginated list — each item includes id, short_code, name, amount in centavos, status, type, url, and aggregated stats (total_payments, successful_payments, total_revenue). Note: amounts are always in centavos (1 MXN = 100).",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        status: LinkStatusSchema.optional().describe("Filter by link status."),
        type: LinkTypeSchema.optional().describe("Filter by link type."),
        search: z
          .string()
          .optional()
          .describe("Free-text search across link name, short_code, or merchant_reference."),
        date_from: IsoDateStringSchema.optional().describe("Only links created on/after this date."),
        date_to: IsoDateStringSchema.optional().describe("Only links created on/before this date."),
      },
    },
    safeHandler(async (args) => {
      return client.get("/links", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_link
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_link",
    {
      title: "Get payment link details",
      description:
        "Fetch a single payment link by its UUID or short_code. Returns the full link payload including line_items (enriched with product data when product_id is present), customization, custom_fields, expiration, usage limits and aggregated stats. Use this when the user references a link by name/short_code from a previous list, or when they paste a https://deonpay.mx/pay/<short_code> URL.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe("Either the link UUID or its short_code (e.g. 'abc123xy')."),
      },
    },
    safeHandler(async ({ id }) => {
      return client.get(`/links/${encodeURIComponent(id)}`);
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_list_link_transactions
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_link_transactions",
    {
      title: "List transactions for a payment link",
      description:
        "List all transactions associated with a specific payment link. Use this when the user asks 'who paid for this link', 'how much did link X collect', or wants to inspect failed attempts on a single link. Returns paginated transactions with customer info, card brand/last_four, amount in centavos and status. The link can be referenced by UUID or short_code.",
      inputSchema: {
        id: z.string().min(1).describe("Link UUID or short_code."),
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
      },
    },
    safeHandler(async ({ id, page, limit }) => {
      return client.get(`/links/${encodeURIComponent(id)}/transactions`, compact({ page, limit }));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_create_link
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_create_link",
    {
      title: "Create a payment link",
      description:
        "Create a new payment link. Use this when the user says 'create a link for $X for product Y' or 'genera un link de pago para...'. Amounts are in centavos: $500 MXN = 50000. You can pass either a fixed amount OR line_items (the API sums quantity * unit_amount automatically). Type defaults to 'single' (one-shot). Optional fields cover MSI (months without interest), max_uses, expires_at, custom_fields and visual customization. The response includes the public payment URL the user can share.",
      inputSchema: {
        name: z.string().min(1).max(255).describe("Link name (visible to the customer, max 255 chars)."),
        amount: z
          .number()
          .int()
          .min(100)
          .optional()
          .describe(
            "Fixed amount in CENTAVOS (1 MXN = 100). Required UNLESS line_items are provided or the link uses min_amount/max_amount (open amount).",
          ),
        type: LinkTypeSchema.optional().describe("'single' (default), 'recurring' or 'unlimited'."),
        description: z.string().optional(),
        max_uses: z.number().int().min(1).optional().describe("Maximum number of successful payments."),
        expires_at: IsoDateStringSchema.optional().describe("ISO date when the link stops accepting payments."),
        allow_msi: z.boolean().optional().describe("Enable MSI (meses sin intereses)."),
        msi_options: z
          .array(z.number().int())
          .optional()
          .describe("Allowed MSI plans, e.g. [3, 6, 12]."),
        min_amount: z.number().int().min(100).optional().describe("Minimum amount for open-amount links (centavos)."),
        max_amount: z.number().int().min(100).optional().describe("Maximum amount for open-amount links (centavos)."),
        merchant_reference: z.string().optional().describe("Internal reference for the merchant."),
        metadata: z.record(z.unknown()).optional().describe("Free-form key/value metadata (max 50 keys)."),
        customization: CustomizationSchema.optional(),
        custom_fields: z.array(CustomFieldSchema).optional(),
        line_items: z
          .array(LineItemSchema)
          .optional()
          .describe("Catalog or inline items. When provided, the total amount is computed server-side."),
        display_currency: z
          .enum(["USD", "EUR", "GBP", "CAD"])
          .optional()
          .describe("Foreign-currency display. Requires exchange_rate."),
        exchange_rate: z.number().positive().optional().describe("MXN per unit of display_currency."),
      },
    },
    safeHandler(async (args) => {
      return client.post("/links", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_update_link
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_update_link",
    {
      title: "Update a payment link",
      description:
        "Update an existing payment link by UUID or short_code. Only send the fields you want to change — others are preserved. Common uses: pause a link (status='paused'), change its amount, extend the expiration, or rename it. The customization object is MERGED with the existing one (it does not replace it), so you can update a single visual key without losing the rest. Type cannot typically be changed once payments exist.",
      inputSchema: {
        id: z.string().min(1).describe("Link UUID or short_code."),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        amount: z.number().int().min(100).optional().describe("New amount in centavos."),
        status: z.enum(["active", "paused", "expired"]).optional(),
        max_uses: z.number().int().min(1).optional(),
        expires_at: IsoDateStringSchema.optional(),
        allow_msi: z.boolean().optional(),
        msi_options: z.array(z.number().int()).optional(),
        min_amount: z.number().int().min(100).optional(),
        max_amount: z.number().int().min(100).optional(),
        merchant_reference: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
        customization: CustomizationSchema.optional(),
      },
    },
    safeHandler(async ({ id, ...rest }) => {
      return client.patch(`/links/${encodeURIComponent(id)}`, compact(rest));
    }),
  );

}
