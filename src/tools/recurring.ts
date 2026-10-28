import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { ensureCache } from "../cache.js";
import { monthBounds } from "../dates.js";
import { formatRecurring } from "../format.js";
import type { components } from "../types.js";

type Recurring = components["schemas"]["recurringObject"];

export function registerRecurringTools(server: McpServer): void {
  server.tool(
    "get_recurring",
    `Get recurring items (subscriptions, bills, income). Shows expected amounts, frequency, and match status for the given period. Without dates, uses the current month. With only one date, uses the month containing it.`,
    {
      start_date: z.string().optional().describe("Start of period (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End of period (YYYY-MM-DD)"),
    },
    async (params) => {
      await ensureCache();
      // The API requires both dates or neither; complete a one-sided range
      // to the month containing the given date.
      let { start_date, end_date } = params;
      if (start_date && !end_date) end_date = monthBounds(start_date).end;
      if (end_date && !start_date) start_date = monthBounds(end_date).start;

      const { data, error, response } = await api.GET("/recurring_items", {
        params: { query: { start_date, end_date } },
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
