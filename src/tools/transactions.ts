import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { refreshCache } from "../cache.js";
import {
  formatTransactions,
  formatTransaction,
  formatBulkUpdateResult,
} from "../format.js";

export function registerTransactionTools(server: McpServer): void {
  // --- list_transactions ---
  server.tool(
    "list_transactions",
    `List or look up Lunch Money transactions. Without an id, returns filtered transactions (defaults to last 30 days if no dates given). With an id, returns that single transaction.

Filters: start_date/end_date (YYYY-MM-DD), category_id, tag_id, status (reviewed/unreviewed), account_id. Use limit/offset for pagination.

Returns hydrated output with category names, tag names, and account names instead of raw IDs.`,
    {
      id: z.number().optional().describe("Look up a single transaction by ID"),
      start_date: z.string().optional().describe("Start of date range (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End of date range (YYYY-MM-DD)"),
      category_id: z.number().optional().describe("Filter by category ID (0 = uncategorized)"),
      tag_id: z.number().optional().describe("Filter by tag ID"),
      status: z.enum(["reviewed", "unreviewed"]).optional().describe("Filter by review status"),
      manual_account_id: z.number().optional().describe("Filter by manual account ID"),
      plaid_account_id: z.number().optional().describe("Filter by synced account ID"),
      limit: z.number().min(1).max(500).optional().describe("Max results (default 50)"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    async (params) => {
      // Single transaction lookup
      if (params.id !== undefined) {
        const { data, error, response } = await api.GET("/transactions/{id}", {
          params: { path: { id: params.id } },
        });
        if (error) handleError(response.status, error);
        return {
          content: [{ type: "text", text: formatTransaction(data!) }],
        };
      }

      // Default to last 30 days when no dates provided
      let startDate = params.start_date;
      let endDate = params.end_date;
      if (!startDate && !endDate) {
        const now = new Date();
        endDate = now.toISOString().slice(0, 10);
        const past = new Date(now);
        past.setDate(past.getDate() - 30);
        startDate = past.toISOString().slice(0, 10);
      }

      // List transactions
      const { data, error, response } = await api.GET("/transactions", {
        params: {
          query: {
            start_date: startDate,
            end_date: endDate,
            category_id: params.category_id,
            tag_id: params.tag_id,
            status: params.status,
            manual_account_id: params.manual_account_id,
            plaid_account_id: params.plaid_account_id,
            limit: params.limit ?? 50,
            offset: params.offset,
          },
        },
      });
      if (error) handleError(response.status, error);

      return {
        content: [
          {
            type: "text",
            text: formatTransactions(
              data!.transactions,
              data!.has_more
            ),
          },
        ],
      };
    }
  );

  // --- manage_transaction ---
  server.tool(
    "manage_transaction",
    `Create, update, or delete a single Lunch Money transaction.

action="create": Provide date (YYYY-MM-DD), amount (positive=debit, negative=credit), and optionally payee, category_id, notes, account_id, tag_ids, currency.
action="update": Provide id and any fields to change (payee, amount, date, category_id, notes, tag_ids, status).
action="delete": Provide only the id of the transaction to delete.`,
    {
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.number().optional().describe("Transaction ID (required for update/delete)"),
      date: z.string().optional().describe("Transaction date YYYY-MM-DD (required for create)"),
      amount: z.union([z.number(), z.string()]).optional().describe("Amount without currency symbol. Positive=debit, negative=credit"),
      payee: z.string().optional().describe("Payee name"),
      category_id: z.number().nullable().optional().describe("Category ID (null to clear)"),
      notes: z.string().nullable().optional().describe("Transaction notes"),
      currency: z.string().optional().describe("Three-letter currency code (defaults to primary)"),
      manual_account_id: z.number().nullable().optional().describe("Manual account ID"),
      tag_ids: z.array(z.number()).optional().describe("Tag IDs to set"),
      status: z.enum(["reviewed", "unreviewed"]).optional().describe("Review status"),
    },
    async (params) => {
      switch (params.action) {
        case "create": {
          if (!params.date || params.amount === undefined) {
            return {
              content: [{ type: "text", text: "Error: date and amount are required for create." }],
              isError: true,
            };
          }
          const { data, error, response } = await api.POST("/transactions", {
            body: {
              transactions: [
                {
                  date: params.date,
                  amount: params.amount,
                  payee: params.payee,
                  category_id: params.category_id ?? undefined,
                  notes: params.notes ?? undefined,
                  currency: params.currency as never,
                  manual_account_id: params.manual_account_id ?? undefined,
                  tag_ids: params.tag_ids,
                  status: params.status,
                },
              ],
            },
          });
          if (error) handleError(response.status, error);
          const result = data!;
          const created = result.transactions[0];
          return {
            content: [
              {
                type: "text",
                text: `Transaction created successfully.\n\n${formatTransaction(created)}`,
              },
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
          if (params.date !== undefined) body.date = params.date;
          if (params.amount !== undefined) body.amount = params.amount;
          if (params.payee !== undefined) body.payee = params.payee;
          if (params.category_id !== undefined) body.category_id = params.category_id;
          if (params.notes !== undefined) body.notes = params.notes;
          if (params.currency !== undefined) body.currency = params.currency;
          if (params.tag_ids !== undefined) body.tag_ids = params.tag_ids;
          if (params.status !== undefined) body.status = params.status;

          const { data, error, response } = await api.PUT("/transactions/{id}", {
            params: { path: { id: params.id } },
            body: body as never,
          });
          if (error) handleError(response.status, error);
          return {
            content: [
              {
                type: "text",
                text: `Transaction updated successfully.\n\n${formatTransaction(data!)}`,
              },
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
          const { error, response } = await api.DELETE("/transactions/{id}", {
            params: { path: { id: params.id } },
          });
          if (error) handleError(response.status, error);
          return {
            content: [
              { type: "text", text: `Transaction ${params.id} deleted successfully.` },
            ],
          };
        }
      }
    }
  );

  // --- bulk_update_transactions ---
  server.tool(
    "bulk_update_transactions",
    `Update multiple transactions at once (max 500). Each item needs an id plus the fields to change.

Common uses: batch-categorize transactions, bulk mark as reviewed, assign tags to multiple transactions.
Fields per transaction: category_id, payee, notes, tag_ids, status, date, amount, currency.`,
    {
      transactions: z
        .array(
          z.object({
            id: z.number().describe("Transaction ID"),
            category_id: z.number().nullable().optional().describe("Category ID (null to clear)"),
            payee: z.string().optional().describe("Payee name"),
            notes: z.string().nullable().optional().describe("Notes (empty string to clear)"),
            tag_ids: z.array(z.number()).optional().describe("Tag IDs (overwrites existing)"),
            status: z.enum(["reviewed", "unreviewed"]).optional().describe("Review status"),
            date: z.string().optional().describe("Date YYYY-MM-DD"),
            amount: z.union([z.number(), z.string()]).optional().describe("Amount"),
            currency: z.string().optional().describe("Currency code"),
          })
        )
        .min(1)
        .max(500)
        .describe("Array of transactions to update, each with id + fields"),
    },
    async (params) => {
      const body = params.transactions.map((t) => {
        const obj: Record<string, unknown> = { id: t.id };
        if (t.category_id !== undefined) obj.category_id = t.category_id;
        if (t.payee !== undefined) obj.payee = t.payee;
        if (t.notes !== undefined) obj.notes = t.notes;
        if (t.tag_ids !== undefined) obj.tag_ids = t.tag_ids;
        if (t.status !== undefined) obj.status = t.status;
        if (t.date !== undefined) obj.date = t.date;
        if (t.amount !== undefined) obj.amount = t.amount;
        if (t.currency !== undefined) obj.currency = t.currency;
        return obj;
      });

      const { data, error, response } = await api.PUT("/transactions", {
        body: { transactions: body } as never,
      });
      if (error) handleError(response.status, error);

      return {
        content: [
          { type: "text", text: formatBulkUpdateResult(data!.transactions) },
        ],
      };
    }
  );

  // --- split_transaction ---
  server.tool(
    "split_transaction",
    `Split or unsplit a Lunch Money transaction.

action="split": Provide id of the transaction to split, plus a splits array. Each split has amount (required) and optionally payee, date, category_id, notes. The split amounts MUST add up to the parent transaction amount.
action="unsplit": Provide id of the split parent to restore it to normal.`,
    {
      action: z.enum(["split", "unsplit"]).describe("split or unsplit"),
      id: z.number().describe("Transaction ID (parent ID for unsplit)"),
      splits: z
        .array(
          z.object({
            amount: z.union([z.number(), z.string()]).describe("Split amount (must sum to parent total)"),
            payee: z.string().optional().describe("Payee (inherits from parent if omitted)"),
            date: z.string().optional().describe("Date YYYY-MM-DD (inherits from parent if omitted)"),
            category_id: z.number().optional().describe("Category ID (inherits from parent if omitted)"),
            notes: z.string().optional().describe("Notes (inherits from parent if omitted)"),
          })
        )
        .optional()
        .describe("Split details (required for action=split)"),
    },
    async (params) => {
      switch (params.action) {
        case "split": {
          if (!params.splits || params.splits.length < 2) {
            return {
              content: [{ type: "text", text: "Error: at least 2 splits are required." }],
              isError: true,
            };
          }
          const { data, error, response } = await api.POST(
            "/transactions/split/{id}",
            {
              params: { path: { id: params.id } },
              body: {
                child_transactions: params.splits.map((s) => ({
                  amount: s.amount,
                  payee: s.payee,
                  date: s.date,
                  category_id: s.category_id,
                  notes: s.notes,
                })),
              },
            }
          );
          if (error) handleError(response.status, error);
          const parent = data!;
          const children = (parent as Record<string, unknown>).children as Array<Record<string, unknown>> | undefined;
          const childCount = children?.length ?? params.splits.length;
          return {
            content: [
              {
                type: "text",
                text: `Transaction split into ${childCount} parts.\n\n${formatTransaction(parent)}`,
              },
            ],
          };
        }

        case "unsplit": {
          const { error, response } = await api.DELETE(
            "/transactions/split/{id}",
            {
              params: { path: { id: params.id } },
            }
          );
          if (error) handleError(response.status, error);
          return {
            content: [
              { type: "text", text: `Transaction ${params.id} unsplit successfully. Original transaction restored.` },
            ],
          };
        }
      }
    }
  );

  // --- group_transactions ---
  server.tool(
    "group_transactions",
    `Group or ungroup Lunch Money transactions.

action="group": Combine multiple transactions into one grouped transaction. Provide ids (array of transaction IDs), date (YYYY-MM-DD), and payee (required). Optionally set category_id, notes, tag_ids. The grouped transaction amount equals the sum of the original amounts.
action="ungroup": Provide id of the group parent to restore original transactions.`,
    {
      action: z.enum(["group", "ungroup"]).describe("group or ungroup"),
      id: z.number().optional().describe("Group parent ID (required for ungroup)"),
      ids: z.array(z.number()).optional().describe("Transaction IDs to group (required for group)"),
      date: z.string().optional().describe("Date for grouped transaction YYYY-MM-DD (required for group)"),
      payee: z.string().optional().describe("Payee for grouped transaction (required for group)"),
      category_id: z.number().nullable().optional().describe("Category ID for grouped transaction"),
      notes: z.string().nullable().optional().describe("Notes for grouped transaction"),
      tag_ids: z.array(z.number()).optional().describe("Tag IDs for grouped transaction"),
    },
    async (params) => {
      switch (params.action) {
        case "group": {
          if (!params.ids || params.ids.length < 2 || !params.date || !params.payee) {
            return {
              content: [{ type: "text", text: "Error: ids (min 2), date, and payee are required for group." }],
              isError: true,
            };
          }
          const body: Record<string, unknown> = {
            ids: params.ids,
            date: params.date,
            payee: params.payee,
          };
          if (params.category_id !== undefined) body.category_id = params.category_id;
          if (params.notes !== undefined) body.notes = params.notes;
          if (params.tag_ids !== undefined) body.tag_ids = params.tag_ids;

          const { data, error, response } = await api.POST(
            "/transactions/group",
            { body: body as never }
          );
          if (error) handleError(response.status, error);
          return {
            content: [
              {
                type: "text",
                text: `${params.ids.length} transactions grouped.\n\n${formatTransaction(data!)}`,
              },
            ],
          };
        }

        case "ungroup": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id is required for ungroup." }],
              isError: true,
            };
          }
          const { error, response } = await api.DELETE(
            "/transactions/group/{id}",
            {
              params: { path: { id: params.id } },
            }
          );
          if (error) handleError(response.status, error);
          return {
            content: [
              { type: "text", text: `Transaction group ${params.id} removed. Original transactions restored.` },
            ],
          };
        }
      }
    }
  );
}
