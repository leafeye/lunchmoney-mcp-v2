import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { refreshCache } from "../cache.js";
import { formatTags, formatTag, formatDeleteResult } from "../format.js";
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

  // --- manage_tag ---
  server.tool(
    "manage_tag",
    `Create, update, or delete a Lunch Money tag.

action="create": Provide name (required). Optionally set description.
action="update": Provide id and any fields to change (name, description, archived).
action="delete": Provide id. Use force=true to delete even if the tag is used on transactions.`,
    {
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.number().optional().describe("Tag ID (required for update/delete)"),
      name: z.string().optional().describe("Tag name (required for create)"),
      description: z.string().nullable().optional().describe("Tag description"),
      archived: z.boolean().optional().describe("Archive/unarchive (update only)"),
      force: z.boolean().optional().describe("Force delete even with dependencies"),
    },
    async (params) => {
      switch (params.action) {
        case "create": {
          if (!params.name) {
            return {
              content: [{ type: "text", text: "Error: name is required for create." }],
              isError: true,
            };
          }
          const body: Record<string, unknown> = { name: params.name };
          if (params.description !== undefined) body.description = params.description;

          const { data, error, response } = await api.POST("/tags", {
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("tags");
          return {
            content: [
              { type: "text", text: `Tag created.\n\n${formatTag(data as Tag)}` },
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
          if (params.description !== undefined) body.description = params.description;
          if (params.archived !== undefined) body.archived = params.archived;

          const { data, error, response } = await api.PUT("/tags/{id}", {
            params: { path: { id: params.id } },
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("tags");
          return {
            content: [
              { type: "text", text: `Tag updated.\n\n${formatTag(data as Tag)}` },
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
          const { error, response } = await api.DELETE("/tags/{id}", {
            params: {
              path: { id: params.id },
              query: params.force ? { force: true } : undefined,
            },
          });
          if (response.status === 422) {
            const deps = (error as { dependents?: Record<string, number> })?.dependents;
            return {
              content: [{ type: "text", text: formatDeleteResult("Tag", params.id, deps) }],
              isError: true,
            };
          }
          if (error) handleError(response.status, error);
          await refreshCache("tags");
          return {
            content: [{ type: "text", text: formatDeleteResult("Tag", params.id) }],
          };
        }
      }
    }
  );
}
