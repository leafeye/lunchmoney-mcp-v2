import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatSummary } from "../format.js";

export function registerSummaryTools(server: McpServer): void {
  server.tool(
    "get_summary",
    `Get a budget summary for a date range. Shows income, spending, and per-category breakdown with budget vs actual. If the date range aligns with budget periods, budget amounts and availability are included.

Tip: Use the first and last day of a month for a monthly overview (e.g. 2026-02-01 to 2026-02-28).`,
    {
      start_date: z.string().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().describe("End date (YYYY-MM-DD)"),
      include_totals: z
        .boolean()
        .optional()
        .describe("Include totals for income/spending (default: true)"),
    },
    async (params) => {
      const { data, error, response } = await api.GET("/summary", {
        params: {
          query: {
            start_date: params.start_date,
            end_date: params.end_date,
            include_totals: params.include_totals ?? true,
          },
        },
      });
      if (error) handleError(response.status, error);

      return {
        content: [
          {
            type: "text",
            text: formatSummary(
              data as Record<string, unknown>,
              params.start_date,
              params.end_date
            ),
          },
        ],
      };
    }
  );
}
