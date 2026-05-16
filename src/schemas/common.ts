/**
 * Reusable Zod fragments. Centralized so paginated tools share identical
 * descriptions — the LLM sees a consistent shape across the whole API.
 */

import { z } from "zod";

export const PageSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("Page number (1-based). Defaults to 1.");

export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Page size. Maximum 100, default 20.");

export const PaginationSchema = z.object({
  page: PageSchema.optional(),
  limit: LimitSchema.optional(),
});

export const EnvironmentSchema = z
  .enum(["sandbox", "production"])
  .describe(
    "Override the environment to query. The DeonPay API only honors this if it matches the environment baked into the API token; otherwise it is silently ignored. Useful when the same dashboard exposes both envs.",
  );

export const IsoDateStringSchema = z
  .string()
  .describe("ISO 8601 date or datetime string, e.g. 2026-05-15 or 2026-05-15T10:00:00Z.");

export const UuidSchema = z.string().describe("Resource UUID.");

/** Custom field definition that can be attached to a payment link or checkout session. */
export const CustomFieldSchema = z.object({
  name: z.string().describe("Internal field key (no spaces)."),
  label: z.string().describe("Label shown to the customer."),
  type: z
    .enum(["text", "textarea", "email", "phone", "number"])
    .describe("Input control type."),
  required: z.boolean().optional().describe("Whether the field must be filled to pay."),
});

/** Visual customization for payment pages and checkout sessions. */
export const CustomizationSchema = z
  .object({
    buttonText: z.string().optional(),
    primaryColor: z.string().optional().describe("Hex color, e.g. #116ef0"),
    backgroundColor: z.string().optional(),
    showLogo: z.boolean().optional(),
  })
  .partial()
  .describe(
    "Visual overrides for the hosted page. Only the keys you set are merged into the merchant defaults.",
  );

/** A line item that references a product from the catalog OR is defined inline. */
export const LineItemSchema = z
  .object({
    product_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "UUID of an existing product. When set, name/unit_amount are pulled from the catalog and any inline values are ignored.",
      ),
    name: z
      .string()
      .optional()
      .describe("Item name (required for inline items, ignored when product_id is set)."),
    description: z.string().optional(),
    quantity: z.number().int().min(1).describe("How many units of this line item."),
    unit_amount: z
      .number()
      .int()
      .optional()
      .describe(
        "Unit price in CENTAVOS (1 MXN = 100). Required for inline items, ignored when product_id is set.",
      ),
    image_url: z.string().url().optional(),
  })
  .describe(
    "Either { product_id, quantity } for a catalog item OR { name, quantity, unit_amount } for an inline item.",
  );

export type LineItem = z.infer<typeof LineItemSchema>;
export type CustomField = z.infer<typeof CustomFieldSchema>;
export type Customization = z.infer<typeof CustomizationSchema>;
