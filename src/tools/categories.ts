import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatCategories } from "../format.js";
import type { components } from "../types.js";

type Category = components["schemas"]["categoryObject"];

export function registerCategoryTools(server: McpServer): void {
  server.tool(
    "list_categories",
    `List all Lunch Money categories. Use format="nested" to see category groups with their children, or format="flat" (default) for a flat list.`,
    {
      format: z
        .enum(["nested", "flat"])
        .optional()
        .describe("nested = grouped hierarchy, flat = all categories in a list (default: flat)"),
    },
    async (params) => {
      const apiFormat = params.format === "flat" ? "flattened" : (params.format ?? "flattened");
      const { data, error, response } = await api.GET("/categories", {
        params: { query: { format: apiFormat as "nested" | "flattened" } },
      });
      if (error) handleError(response.status, error);

      const categories = (data?.categories ?? []) as Category[];
      const displayFormat = apiFormat === "nested" ? "nested" : "flat";

      return {
        content: [
          { type: "text", text: formatCategories(categories, displayFormat) },
        ],
      };
    }
  );
}
