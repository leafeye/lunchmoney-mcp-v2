# lunchmoney-mcp-v2

MCP server for the [Lunch Money](https://lunchmoney.app) API v2. First MCP server built on the v2 API.

## Features

- **8 tools**: `get_user`, `list_transactions`, `manage_transaction`, `list_categories`, `list_tags`, `get_accounts`, `get_summary`, `get_recurring`
- **Hydrated responses**: category, tag, and account names instead of raw IDs
- **Smart caching**: categories, tags, and accounts cached at startup for fast lookups
- **Type-safe**: generated from the official OpenAPI spec via `openapi-typescript`

## Setup

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

| Tool | Description |
|---|---|
| `get_user` | Account info (name, email, currency) |
| `list_transactions` | List/search transactions with filters, or look up by ID |
| `manage_transaction` | Create, update, or delete a transaction |
| `list_categories` | All categories (nested or flat view) |
| `list_tags` | All tags |
| `get_accounts` | Manual + synced accounts with balances |
| `get_summary` | Budget summary with income/spending/per-category breakdown |
| `get_recurring` | Recurring items (subscriptions, bills, income) |

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

## License

MIT
