import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { formatUser } from "../format.js";

export function registerUserTools(server: McpServer): void {
  server.tool(
    "get_user",
    "Get the current Lunch Money user's account info: name, email, budget name, and primary currency.",
    {},
    async () => {
      const { data, error, response } = await api.GET("/me");
      if (error) handleError(response.status, error);

      return {
        content: [{ type: "text", text: formatUser(data as Record<string, unknown>) }],
      };
    }
  );
}
