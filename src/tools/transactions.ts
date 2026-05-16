/**
 * Transactions — list and detail (read-only).
 *
 * Refunds (POST /transactions/:id) are intentionally NOT exposed in v0.1:
 * they are irreversible and the LLM should not be able to issue them
 * without a more explicit confirmation pattern (planned for a future "write"
 * mode behind an env flag).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { IsoDateStringSchema, LimitSchema, PageSchema } from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

const TransactionStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "chargeback",
]);

export function registerTransactionTools(server: McpServer, client: DeonpayClient): void {
  // -------------------------------------------------------------------------
  // deonpay_list_transactions
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_transactions",
    {
      title: "List transactions",
      description:
        "List transactions for the merchant with rich filtering. Use this for queries like 'how many sales today', 'show failed transactions this week', 'find payments from cliente@x.com', or 'transactions over $1000 MXN with Visa cards'. Filters include status, source_type (link/checkout), customer_email (partial match), merchant_reference (exact), card_brand (visa/mastercard/amex), date_from/to (ISO), and amount_min/max (centavos). Returns paginated results with customer, card, amount, payment_link summary and timestamps. Amounts in centavos.",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        status: TransactionStatusSchema.optional(),
        source_type: z
          .enum(["link", "checkout", "subscription_auto", "subscription_manual"])
          .optional()
          .describe("Origin of the transaction."),
        payment_link_id: z.string().uuid().optional(),
        checkout_session_id: z.string().uuid().optional(),
        customer_email: z.string().optional().describe("Partial match on customer email."),
        merchant_reference: z.string().optional().describe("Exact merchant_reference filter."),
        card_brand: z.enum(["visa", "mastercard", "amex"]).optional(),
        date_from: IsoDateStringSchema.optional(),
        date_to: IsoDateStringSchema.optional(),
        amount_min: z.number().int().min(0).optional().describe("Minimum amount in centavos."),
        amount_max: z.number().int().min(0).optional().describe("Maximum amount in centavos."),
      },
    },
    safeHandler(async (args) => {
      return client.get("/transactions", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_transaction
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_transaction",
    {
      title: "Get transaction details",
      description:
        "Fetch the full detail of a single transaction by UUID. Returns everything in the list view PLUS the NetPay timeline (each step in the charge / 3DS flow with duration_ms and error info), netpay charge_id / transaction_token, full metadata, refund details (when applicable), and IP/user-agent of the payer. Use this when debugging a failure, building a refund decision, or when the user asks 'what happened with transaction X'.",
      inputSchema: {
        id: z.string().uuid().describe("Transaction UUID."),
      },
    },
    safeHandler(async ({ id }) => {
      return client.get(`/transactions/${encodeURIComponent(id)}`);
    }),
  );
}
