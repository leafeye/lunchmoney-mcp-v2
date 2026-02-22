import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatAccounts } from "../format.js";
import type { components } from "../types.js";

type ManualAccount = components["schemas"]["manualAccountObject"];
type PlaidAccount = components["schemas"]["plaidAccountObject"];

export function registerAccountTools(server: McpServer): void {
  server.tool(
    "get_accounts",
    "Get all Lunch Money accounts — both manual accounts and synced (Plaid) accounts. Shows balances, types, and status.",
    {},
    async () => {
      const [manualRes, plaidRes] = await Promise.all([
        api.GET("/manual_accounts"),
        api.GET("/plaid_accounts"),
      ]);

      if (manualRes.error) handleError(manualRes.response.status, manualRes.error);
      if (plaidRes.error) handleError(plaidRes.response.status, plaidRes.error);

      const manual = ((manualRes.data as { manual_accounts?: ManualAccount[] })
        ?.manual_accounts ?? []) as ManualAccount[];
      const plaid = ((plaidRes.data as { plaid_accounts?: PlaidAccount[] })
        ?.plaid_accounts ?? []) as PlaidAccount[];

      return {
        content: [{ type: "text", text: formatAccounts(manual, plaid) }],
      };
    }
  );
}
