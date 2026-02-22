import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatRecurring } from "../format.js";
import type { components } from "../types.js";

type Recurring = components["schemas"]["recurringObject"];

export function registerRecurringTools(server: McpServer): void {
  server.tool(
    "get_recurring",
    `Get recurring items (subscriptions, bills, income). Shows expected amounts, frequency, and match status for the given period. Without dates, uses the current month.`,
    {
      start_date: z.string().optional().describe("Start of period (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End of period (YYYY-MM-DD)"),
    },
    async (params) => {
      const { data, error, response } = await api.GET("/recurring_items", {
        params: {
          query: {
            start_date: params.start_date,
            end_date: params.end_date,
          },
        },
      });
      if (error) handleError(response.status, error);

      const items = ((data as { recurring_items?: Recurring[] })
        ?.recurring_items ?? []) as Recurring[];

      return {
        content: [{ type: "text", text: formatRecurring(items) }],
      };
    }
  );
}
