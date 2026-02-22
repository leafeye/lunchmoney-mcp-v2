import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, handleError } from "../client.js";
import { refreshCache } from "../cache.js";
import { formatCategories, formatCategory, formatDeleteResult } from "../format.js";
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

  // --- manage_category ---
  server.tool(
    "manage_category",
    `Create, update, or delete a Lunch Money category.

action="create": Provide name (required). Optionally set description, is_income, exclude_from_budget, exclude_from_totals, is_group, group_id.
action="update": Provide id and any fields to change (name, description, is_income, exclude_from_budget, exclude_from_totals, archived, group_id).
action="delete": Provide id. Use force=true to delete even if the category has dependent transactions/rules.`,
    {
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.number().optional().describe("Category ID (required for update/delete)"),
      name: z.string().optional().describe("Category name (required for create)"),
      description: z.string().nullable().optional().describe("Category description"),
      is_income: z.boolean().optional().describe("Mark as income category"),
      exclude_from_budget: z.boolean().optional().describe("Exclude from budget"),
      exclude_from_totals: z.boolean().optional().describe("Exclude from totals"),
      is_group: z.boolean().optional().describe("Create as category group (create only)"),
      group_id: z.number().nullable().optional().describe("Parent group ID"),
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
          if (params.is_income !== undefined) body.is_income = params.is_income;
          if (params.exclude_from_budget !== undefined) body.exclude_from_budget = params.exclude_from_budget;
          if (params.exclude_from_totals !== undefined) body.exclude_from_totals = params.exclude_from_totals;
          if (params.is_group !== undefined) body.is_group = params.is_group;
          if (params.group_id !== undefined) body.group_id = params.group_id;

          const { data, error, response } = await api.POST("/categories", {
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("categories");
          return {
            content: [
              { type: "text", text: `Category created.\n\n${formatCategory(data as Category)}` },
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
          if (params.is_income !== undefined) body.is_income = params.is_income;
          if (params.exclude_from_budget !== undefined) body.exclude_from_budget = params.exclude_from_budget;
          if (params.exclude_from_totals !== undefined) body.exclude_from_totals = params.exclude_from_totals;
          if (params.archived !== undefined) body.archived = params.archived;
          if (params.group_id !== undefined) body.group_id = params.group_id;

          const { data, error, response } = await api.PUT("/categories/{id}", {
            params: { path: { id: params.id } },
            body: body as never,
          });
          if (error) handleError(response.status, error);
          await refreshCache("categories");
          return {
            content: [
              { type: "text", text: `Category updated.\n\n${formatCategory(data as Category)}` },
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
          const { error, response } = await api.DELETE("/categories/{id}", {
            params: {
              path: { id: params.id },
              query: params.force ? { force: true } : undefined,
            },
          });
          if (response.status === 422) {
            const deps = (error as { dependents?: Record<string, number> })?.dependents;
            return {
              content: [{ type: "text", text: formatDeleteResult("Category", params.id, deps) }],
              isError: true,
            };
          }
          if (error) handleError(response.status, error);
          await refreshCache("categories");
          return {
            content: [{ type: "text", text: formatDeleteResult("Category", params.id) }],
          };
        }
      }
    }
  );
}
