#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertToken } from "./client.js";
import { initCache } from "./cache.js";
import { registerUserTools } from "./tools/user.js";
import { registerTransactionTools } from "./tools/transactions.js";
import { registerCategoryTools } from "./tools/categories.js";
import { registerTagTools } from "./tools/tags.js";
import { registerAccountTools } from "./tools/accounts.js";
import { registerSummaryTools } from "./tools/summary.js";
import { registerRecurringTools } from "./tools/recurring.js";

async function main(): Promise<void> {
  assertToken();

  const server = new McpServer({
    name: "lunchmoney-mcp-v2",
    version: "0.1.0",
  });

  // Register all tools
  registerUserTools(server);
  registerTransactionTools(server);
  registerCategoryTools(server);
  registerTagTools(server);
  registerAccountTools(server);
  registerSummaryTools(server);
  registerRecurringTools(server);

  // Initialize cache (categories, tags, accounts)
  try {
    await initCache();
  } catch (err) {
    console.error("Failed to initialize cache:", err);
    console.error("Continuing without cache — some features may show IDs instead of names.");
  }

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("lunchmoney-mcp-v2 server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
