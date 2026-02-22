import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatTags } from "../format.js";
import type { components } from "../types.js";

type Tag = components["schemas"]["tagObject"];

export function registerTagTools(server: McpServer): void {
  server.tool(
    "list_tags",
    "List all Lunch Money tags. Tags can be assigned to transactions for additional organization beyond categories.",
    {},
    async () => {
      const { data, error, response } = await api.GET("/tags");
      if (error) handleError(response.status, error);

      const tags = ((data as { tags?: Tag[] })?.tags ?? []) as Tag[];

      return {
        content: [{ type: "text", text: formatTags(tags) }],
      };
    }
  );
}
