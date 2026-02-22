import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { refreshCache } from "../cache.js";
import { formatAccounts, formatAccount } from "../format.js";
import type { components } from "../types.js";

type ManualAccount = components["schemas"]["manualAccountObject"];
type PlaidAccount = components["schemas"]["plaidAccountObject"];

const accountTypeEnum = z.enum([
  "cash",
  "credit",
  "cryptocurrency",
  "employee compensation",
  "investment",
  "loan",
  "other liability",
  "other asset",
  "real estate",
  "vehicle",
]);

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

  // --- manage_account ---
  server.tool(
    "manage_account",
    `Create, update, or delete a manual Lunch Money account. Synced (Plaid) accounts are read-only.

action="create": Provide name, type (cash/credit/cryptocurrency/employee compensation/investment/loan/other liability/other asset/real estate/vehicle), and balance (required). Optionally set institution_name, currency, subtype.
action="update": Provide id and any fields to change (name, balance, institution_name, display_name, status, subtype).
action="delete": Provide id. WARNING: this permanently deletes the account. Transactions are NOT deleted by default.`,
    {
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.number().optional().describe("Account ID (required for update/delete)"),
      name: z.string().optional().describe("Account name (required for create)"),
      type: accountTypeEnum.optional().describe("Account type (required for create)"),
      balance: z.union([z.number(), z.string()]).optional().describe("Current balance (required for create)"),
      institution_name: z.string().nullable().optional().describe("Bank/institution name"),
      display_name: z.string().nullable().optional().describe("Display name (must be unique)"),
      currency: z.string().optional().describe("Three-letter currency code"),
      subtype: z.string().optional().describe("Account subtype (e.g. checking, savings, retirement)"),
      status: z.enum(["active", "closed"]).optional().describe("Account status"),
    },
    async (params) => {
      switch (params.action) {
        case "create": {
          if (!params.name || !params.type || params.balance === undefined) {
            return {
              content: [{ type: "text", text: "Error: name, type, and balance are required for create." }],
              isError: true,
            };
          }
          const body: Record<string, unknown> = {
            name: params.name,
            type: params.type,
            balance: params.balance,
            status: params.status ?? "active",
            exclude_from_transactions: false,
          };
          if (params.institution_name !== undefined) body.institution_name = params.institution_name;
          if (params.display_name !== undefined) body.display_name = params.display_name;
          if (params.currency !== undefined) body.currency = params.currency;
          if (params.subtype !== undefined) body.subtype = params.subtype;

          const { data, error, response } = await api.POST("/manual_accounts", {
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("manualAccounts");
          return {
            content: [
              { type: "text", text: `Account created.\n\n${formatAccount(data as ManualAccount)}` },
            ],
          };
        }

        case "update": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for update." }],
              isError: true,
            };
          }
          const body: Record<string, unknown> = {};
          if (params.name !== undefined) body.name = params.name;
          if (params.balance !== undefined) body.balance = params.balance;
          if (params.institution_name !== undefined) body.institution_name = params.institution_name;
          if (params.display_name !== undefined) body.display_name = params.display_name;
          if (params.currency !== undefined) body.currency = params.currency;
          if (params.subtype !== undefined) body.subtype = params.subtype;
          if (params.status !== undefined) body.status = params.status;

          const { data, error, response } = await api.PUT("/manual_accounts/{id}", {
            params: { path: { id: params.id } },
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("manualAccounts");
          return {
            content: [
              { type: "text", text: `Account updated.\n\n${formatAccount(data as ManualAccount)}` },
            ],
          };
        }

        case "delete": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for delete." }],
              isError: true,
            };
          }
          const { error, response } = await api.DELETE("/manual_accounts/{id}", {
            params: { path: { id: params.id } },
          });
          if (error) handleError(response.status, error);
          await refreshCache("manualAccounts");
          return {
            content: [
              { type: "text", text: `Account ${params.id} deleted successfully. Transactions were preserved.` },
            ],
          };
        }
      }
    }
  );
}
