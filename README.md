# lunchmoney-mcp-v2

MCP server for the [Lunch Money](https://lunchmoney.app) API v2. First MCP server built on the v2 API.

## Features

- **14 tools** covering read, CRUD, and advanced operations
- **Hydrated responses**: category, tag, and account names instead of raw IDs
- **Smart caching**: categories, tags, and accounts cached at startup, auto-refreshed after mutations
- **Type-safe**: generated from the official OpenAPI spec via `openapi-typescript`

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lunchmoney": {
      "command": "npx",
      "args": ["lunchmoney-mcp-v2"],
      "env": {
        "LUNCHMONEY_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

### Claude Code

Add to `.mcp.json` in your project or `~/.claude/mcp.json` globally:

```json
{
  "mcpServers": {
    "lunchmoney": {
      "command": "npx",
      "args": ["lunchmoney-mcp-v2"],
      "env": {
        "LUNCHMONEY_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Get your API token from [Lunch Money Developer settings](https://my.lunchmoney.app/developers).

## Tools

### Read

| Tool | Description |
|---|---|
| `get_user` | Account info (name, email, currency) |
| `list_transactions` | List/search transactions with filters, or look up by ID |
| `list_categories` | All categories (nested or flat view) |
| `list_tags` | All tags |
| `get_accounts` | Manual + synced accounts with balances |
| `get_summary` | Budget summary with income/spending/per-category breakdown |
| `get_recurring` | Recurring items (subscriptions, bills, income) |

### CRUD

| Tool | Actions | Description |
|---|---|---|
| `manage_transaction` | create, update, delete | Single transaction operations |
| `manage_category` | create, update, delete | Category management (force delete with dependency info) |
| `manage_tag` | create, update, delete | Tag management (force delete with dependency info) |
| `manage_account` | create, update, delete | Manual account management (Plaid accounts are read-only) |

### Advanced

| Tool | Actions | Description |
|---|---|---|
| `bulk_update_transactions` | — | Batch update up to 500 transactions at once |
| `split_transaction` | split, unsplit | Split a transaction into parts or restore the original |
| `group_transactions` | group, ungroup | Combine transactions into a group or restore originals |

## Development

```bash
npm install
npm run build
npm start
```

Regenerate types from the OpenAPI spec:

```bash
npm run generate:types
```

## Architecture

```
src/
  index.ts          Entry point — registers tools, initializes cache
  client.ts         openapi-fetch client + error handling
  cache.ts          In-memory cache for categories, tags, accounts
  format.ts         Text formatters for all response types
  types.ts          Generated from @lunch-money/v2-api-spec
  tools/
    user.ts         get_user
    transactions.ts list_transactions, manage_transaction, bulk_update, split, group
    categories.ts   list_categories, manage_category
    tags.ts         list_tags, manage_tag
    accounts.ts     get_accounts, manage_account
    summary.ts      get_summary
    recurring.ts    get_recurring
```

## License

MIT
