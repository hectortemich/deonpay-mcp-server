/**
 * Products — catalog CRUD (no DELETE in v0.1).
 *
 * The DeonPay API uses PATCH for product updates (the public docs say PUT but
 * the implementation is PATCH — verified against
 * src/app/api/v1/products/[id]/route.ts in the main repo).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { DeonpayClient } from "../client.js";
import { LimitSchema, PageSchema } from "../schemas/common.js";
import { compact, safeHandler } from "./_helpers.js";

export function registerProductTools(server: McpServer, client: DeonpayClient): void {
  // -------------------------------------------------------------------------
  // deonpay_list_products
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_list_products",
    {
      title: "List products",
      description:
        "List products in the merchant catalog. Use this when the user asks 'what products do I have', 'find product X', or wants to inspect inventory. Supports search across name/sku/description, filtering by is_active, and basic sorting (sort_by + sort_order). Each item includes id, name, unit_amount in centavos, currency, sku, is_active, stock_tracking and stock_quantity.",
      inputSchema: {
        page: PageSchema.optional(),
        limit: LimitSchema.optional(),
        search: z.string().optional().describe("Free-text search across name, sku and description."),
        is_active: z.boolean().optional().describe("Filter by active state."),
        sort_by: z
          .enum(["created_at", "name", "unit_amount"])
          .optional()
          .describe("Field to sort by (default created_at)."),
        sort_order: z.enum(["asc", "desc"]).optional().describe("Default desc."),
      },
    },
    safeHandler(async (args) => {
      return client.get("/products", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_get_product
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_get_product",
    {
      title: "Get product details",
      description:
        "Fetch a single product by UUID OR by SKU (if you pass a non-UUID string the API resolves it as a SKU). Returns name, description, unit_amount in centavos, currency, image_url, sku, is_active, stock_tracking, stock_quantity and metadata.",
      inputSchema: {
        id: z.string().min(1).describe("Product UUID or SKU."),
      },
    },
    safeHandler(async ({ id }) => {
      return client.get(`/products/${encodeURIComponent(id)}`);
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_create_product
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_create_product",
    {
      title: "Create a product",
      description:
        "Create a new product in the catalog. Use this when the user says 'add a product called X for $Y' or wants to register inventory items they'll later attach to payment links / checkout sessions. unit_amount is in CENTAVOS and must be at least 1000 ($10.00 MXN minimum on creation). SKU must be unique within the merchant. To track stock, set stock_tracking=true AND provide stock_quantity (>= 0).",
      inputSchema: {
        name: z.string().min(1).max(255).describe("Product name."),
        unit_amount: z
          .number()
          .int()
          .min(1000)
          .describe("Unit price in CENTAVOS (minimum 1000 = $10.00 MXN on creation)."),
        description: z.string().max(1000).optional(),
        currency: z.string().length(3).optional().describe("ISO currency code (default 'MXN')."),
        image_url: z.string().url().optional(),
        sku: z.string().max(100).optional().describe("Unique SKU within the merchant catalog."),
        is_active: z.boolean().optional().describe("Whether the product is sellable (default true)."),
        stock_tracking: z.boolean().optional().describe("Enable inventory tracking."),
        stock_quantity: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Initial stock count (required when stock_tracking is true)."),
        metadata: z.record(z.unknown()).optional(),
      },
    },
    safeHandler(async (args) => {
      return client.post("/products", compact(args));
    }),
  );

  // -------------------------------------------------------------------------
  // deonpay_update_product
  // -------------------------------------------------------------------------
  server.registerTool(
    "deonpay_update_product",
    {
      title: "Update a product",
      description:
        "Update an existing product (resolved by UUID or SKU). Only fields you send are changed. Use this for price adjustments, renaming, toggling is_active, updating stock_quantity, or swapping the image_url. Note: under the hood the API uses HTTP PATCH (not PUT).",
      inputSchema: {
        id: z.string().min(1).describe("Product UUID or SKU."),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional(),
        unit_amount: z.number().int().min(100).optional().describe("New unit price in centavos."),
        currency: z.string().length(3).optional(),
        image_url: z.string().url().optional(),
        sku: z.string().max(100).optional(),
        is_active: z.boolean().optional(),
        stock_tracking: z.boolean().optional(),
        stock_quantity: z.number().int().min(0).optional(),
        metadata: z.record(z.unknown()).optional(),
      },
    },
    safeHandler(async ({ id, ...rest }) => {
      return client.patch(`/products/${encodeURIComponent(id)}`, compact(rest));
    }),
  );
}
