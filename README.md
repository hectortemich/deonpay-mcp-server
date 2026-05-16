# @deonpay/mcp-server

[![npm version](https://img.shields.io/npm/v/@deonpay/mcp-server.svg)](https://www.npmjs.com/package/@deonpay/mcp-server)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

> Talk to your DeonPay merchant account from Claude Desktop, Cursor, Continue and any other MCP-compatible AI host.

---

## What is this?

The **Model Context Protocol** (MCP) is an open standard that lets large language models call structured tools on your behalf. This package is the official MCP server for [DeonPay](https://deonpay.mx) — Mexico's modern payments platform — wrapping the DeonPay Public API v1 as a set of typed tools your AI assistant can use to read transactions, create payment links, inspect subscriptions, look up customers and pull business metrics, all without leaving the chat.

It runs locally on your machine, talks to DeonPay over HTTPS using a token you generate from the dashboard, and exposes 20 well-described tools the LLM can pick from.

---

## Quick start

### 1. Generate an MCP token in the DeonPay dashboard

Open [https://deonpay.mx/dashboard/settings/mcp-connections](https://deonpay.mx/dashboard/settings/mcp-connections), pick the permissions the assistant should have (start with read-only) and copy the token. **The token is shown only once — keep it safe.**

### 2. Add the server to your MCP host

For **Claude Desktop**, edit your config file:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add the `deonpay` entry to the `mcpServers` block:

```json
{
  "mcpServers": {
    "deonpay": {
      "command": "npx",
      "args": ["-y", "@deonpay/mcp-server"],
      "env": {
        "DEONPAY_API_TOKEN": "dp_paste_your_token_here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Quit and re-open Claude Desktop. You should see "deonpay" listed under the tools icon in any new conversation.

That's it. Try asking: *"How much did I sell yesterday on DeonPay?"*

---

## Configuration

All configuration is via environment variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEONPAY_API_TOKEN` | yes | — | Your DeonPay API token (`dp_...`). Generate from `Settings -> MCP Connections`. |
| `DEONPAY_BASE_URL` | no | `https://deonpay.mx` | Override for self-hosted or staging deployments. |
| `DEONPAY_TIMEOUT_MS` | no | `30000` | Request timeout in milliseconds. |
| `DEONPAY_DEBUG` | no | `0` | Set to `1` to log every HTTP request/response to stderr. |

### Full Claude Desktop example

```json
{
  "mcpServers": {
    "deonpay": {
      "command": "npx",
      "args": ["-y", "@deonpay/mcp-server"],
      "env": {
        "DEONPAY_API_TOKEN": "dp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "DEONPAY_BASE_URL": "https://deonpay.mx",
        "DEONPAY_DEBUG": "0"
      }
    }
  }
}
```

---

## Available tools

All 20 tools are prefixed with `deonpay_` so your assistant can find them quickly when you mention DeonPay in a prompt.

### Read

| Tool | Wraps | Purpose |
|---|---|---|
| `deonpay_get_merchant_metrics` | `GET /v1/merchant/metrics` | Headline KPIs: revenue, conversion, MRR, churn, revenue mix. |
| `deonpay_list_transactions` | `GET /v1/transactions` | Filter and paginate transactions. |
| `deonpay_get_transaction` | `GET /v1/transactions/{id}` | Full transaction with NetPay timeline. |
| `deonpay_list_links` | `GET /v1/links` | List payment links. |
| `deonpay_get_link` | `GET /v1/links/{id}` | Single link by UUID or short_code. |
| `deonpay_list_link_transactions` | `GET /v1/links/{id}/transactions` | All payments for a link. |
| `deonpay_list_products` | `GET /v1/products` | Catalog listing. |
| `deonpay_get_product` | `GET /v1/products/{id}` | Product by UUID or SKU. |
| `deonpay_list_subscriptions` | `GET /v1/subscriptions` | Subscription PLANS (templates). |
| `deonpay_get_subscription` | `GET /v1/subscriptions/{id}` | Plan with stats and recent charges. |
| `deonpay_list_customer_subscriptions` | `GET /v1/customer-subscriptions` | Per-customer subscription rows. |
| `deonpay_get_customer_subscription` | `GET /v1/customer-subscriptions/{id}` | Subscriber detail with last 20 charges. |
| `deonpay_list_customers` | `GET /v1/customers` | Customer list with revenue stats. |
| `deonpay_get_customer` | `GET /v1/customers/{email}` | Customer profile by email. |

### Write (safe)

| Tool | Wraps | Purpose |
|---|---|---|
| `deonpay_create_link` | `POST /v1/links` | Create a payment link. |
| `deonpay_update_link` | `PATCH /v1/links/{id}` | Update an existing link (merge customization). |
| `deonpay_create_checkout_session` | `POST /v1/checkout/sessions` | Stripe-style ephemeral checkout. |
| `deonpay_create_product` | `POST /v1/products` | Add a product to the catalog. |
| `deonpay_update_product` | `PATCH /v1/products/{id}` | Update product price, stock, status. |
| `deonpay_create_subscription` | `POST /v1/subscriptions` | Create a recurring plan template. |

### Not exposed in v0.1 (by design)

These DeonPay endpoints are intentionally NOT wrapped yet because the failure mode is destructive or irreversible:

- Refunds (`POST /v1/transactions/{id}`)
- Subscription cancellations (`POST /v1/customer-subscriptions/{id}/cancel`)
- Link / product deletes (`DELETE /v1/links/{id}`, `DELETE /v1/products/{id}`)
- Checkout session cancellation (`PATCH /v1/checkout/sessions/{id}`)
- Subscription plan updates (`PATCH /v1/subscriptions/{id}`)

These will land in a future release behind an explicit `DEONPAY_ENABLE_DESTRUCTIVE=1` flag.

---

## Example prompts

Try these in Claude Desktop after installing the server:

- *"Show me my payment links from this week."*
- *"How much did I sell yesterday in MXN?"*
- *"What is my MRR right now?"*
- *"Find the customer who has spent the most in the last 90 days."*
- *"List all subscribers on past_due status and tell me what their plans look like."*
- *"Create a payment link for $500 MXN called 'Consulta nutricional'."*
- *"Add a product called 'Gym Class' at $250 MXN to my catalog."*
- *"Create a monthly subscription plan named 'Premium' for $299 MXN with 7 trial days."*
- *"Why did transaction 550e8400-e29b-41d4-a716-446655440000 fail? Show me the NetPay timeline."*
- *"Pause the link with short_code abc123xy until further notice."*

The assistant will pick the right tool, fill in the parameters and report back.

---

## Amounts and currency

DeonPay handles **all amounts in centavos** (1 MXN = 100). When you write *"create a link for $500"*, the assistant translates it to `amount: 50000`. When the API returns `total_revenue: 1845000`, that's `$18,450.00 MXN`. The tool descriptions remind the LLM of this on every call.

---

## Troubleshooting

### "DEONPAY_API_TOKEN is required"

The server could not find the token in its environment. Check that the `env` block in `claude_desktop_config.json` is at the same level as `command`/`args`, and that you fully restarted Claude Desktop after editing the file.

### "[unauthorized 401] DeonPay rejected the API token"

The token is invalid, revoked, or its environment doesn't match the data you're querying. Re-issue from `Settings -> MCP Connections` and replace the value in your config.

### "[forbidden 403] DeonPay denied access"

The token is valid but it doesn't carry the permission required for that tool. Edit the token in the dashboard and grant the missing permission (the error message names it).

### "No tool named deonpay_..."

The host hasn't loaded the server. Confirm the `mcpServers` block is valid JSON, restart the host, and look at the host's logs (Claude Desktop -> `Help -> Show Logs`) for startup errors.

### "Could not reach DeonPay at https://..."

Network or DNS issue. Verify `DEONPAY_BASE_URL` is reachable from your machine (`curl -I $DEONPAY_BASE_URL`).

### Verbose logging

Set `DEONPAY_DEBUG=1` in the `env` block. Every HTTP request and response is then printed to the host's log file (`stderr`).

---

## Security

- The token is stored in plain text inside `claude_desktop_config.json`. Treat that file like an SSH key — back it up encrypted, never commit it to git.
- Tokens have **granular permissions**. For an LLM that should only read data, create a token with `*.read` permissions only — that mechanically prevents the assistant from creating links or charging cards.
- Tokens are environment-scoped (sandbox vs production). For experimentation, generate a sandbox token first and switch later.
- The server only sends requests to the host you configure in `DEONPAY_BASE_URL`. There is no telemetry and no third-party network call.

---

## Development

```bash
git clone https://github.com/deonpay/deonpay-mcp-server.git
cd deonpay-mcp-server
npm install
npm run build       # tsup -> dist/{index.js,index.cjs,index.d.ts}
npm run typecheck   # tsc --noEmit
npm run lint        # eslint + @typescript-eslint
DEONPAY_API_TOKEN=dp_... node dist/index.js   # run locally over stdio
```

The codebase is organized so each tool category lives in `src/tools/<category>.ts` with a `register*` function. Adding a new tool is a one-file change plus a registration call in `src/tools/index.ts`.

---

## Contributing

PRs welcome. Please:

1. Open an issue first for new tools so we can align on naming and scope.
2. Match the existing tool description style — rich, English, with explicit notes on units (centavos), path encoding, and side effects.
3. Run `npm run lint && npm run typecheck && npm run build` before submitting.

---

## License

MIT - see [LICENSE](./LICENSE).
