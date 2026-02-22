import { api, handleError } from "./client.js";
import type { components } from "./types.js";

type Category = components["schemas"]["categoryObject"];
type Tag = components["schemas"]["tagObject"];
type ManualAccount = components["schemas"]["manualAccountObject"];
type PlaidAccount = components["schemas"]["plaidAccountObject"];

interface Cache {
  categories: Map<number, Category>;
  tags: Map<number, Tag>;
  manualAccounts: Map<number, ManualAccount>;
  plaidAccounts: Map<number, PlaidAccount>;
}

let cache: Cache | null = null;

export async function initCache(): Promise<void> {
  const [categories, tags, manualAccounts, plaidAccounts] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchManualAccounts(),
    fetchPlaidAccounts(),
  ]);

  cache = { categories, tags, manualAccounts, plaidAccounts };
  console.error(
    `Cache initialized: ${cache.categories.size} categories, ${cache.tags.size} tags, ${cache.manualAccounts.size} manual accounts, ${cache.plaidAccounts.size} plaid accounts`
  );
}

export function getCache(): Cache {
  if (!cache) throw new Error("Cache not initialized. Call initCache() first.");
  return cache;
}

export async function refreshCache(
  type: "categories" | "tags" | "manualAccounts" | "plaidAccounts"
): Promise<void> {
  const c = getCache();
  switch (type) {
    case "categories":
      c.categories = await fetchCategories();
      break;
    case "tags":
      c.tags = await fetchTags();
      break;
    case "manualAccounts":
      c.manualAccounts = await fetchManualAccounts();
      break;
    case "plaidAccounts":
      c.plaidAccounts = await fetchPlaidAccounts();
      break;
  }
}

export function categoryName(id: number | null): string {
  if (id === null) return "Uncategorized";
  return getCache().categories.get(id)?.name ?? `Category #${id}`;
}

export function tagNames(ids: number[]): string[] {
  const c = getCache();
  return ids.map((id) => c.tags.get(id)?.name ?? `Tag #${id}`);
}

export function accountName(
  manualId: number | null,
  plaidId: number | null
): string {
  const c = getCache();
  if (manualId !== null) {
    const acct = c.manualAccounts.get(manualId);
    return acct?.display_name ?? acct?.name ?? `Manual #${manualId}`;
  }
  if (plaidId !== null) {
    const acct = c.plaidAccounts.get(plaidId);
    return acct?.display_name ?? acct?.name ?? `Plaid #${plaidId}`;
  }
  return "Cash";
}

// --- Fetchers ---

async function fetchCategories(): Promise<Map<number, Category>> {
  const { data, error, response } = await api.GET("/categories", {
    params: { query: { format: "flattened" } },
  });
  if (error) handleError(response.status, error);
  const map = new Map<number, Category>();
  for (const cat of data?.categories ?? []) {
    map.set(cat.id, cat);
  }
  return map;
}

async function fetchTags(): Promise<Map<number, Tag>> {
  const { data, error, response } = await api.GET("/tags");
  if (error) handleError(response.status, error);
  const map = new Map<number, Tag>();
  for (const tag of (data as { tags?: Tag[] })?.tags ?? []) {
    map.set(tag.id, tag);
  }
  return map;
}

async function fetchManualAccounts(): Promise<Map<number, ManualAccount>> {
  const { data, error, response } = await api.GET("/manual_accounts");
  if (error) handleError(response.status, error);
  const map = new Map<number, ManualAccount>();
  for (const acct of (data as { manual_accounts?: ManualAccount[] })
    ?.manual_accounts ?? []) {
    map.set(acct.id, acct);
  }
  return map;
}

async function fetchPlaidAccounts(): Promise<Map<number, PlaidAccount>> {
  const { data, error, response } = await api.GET("/plaid_accounts");
  if (error) handleError(response.status, error);
  const map = new Map<number, PlaidAccount>();
  for (const acct of (data as { plaid_accounts?: PlaidAccount[] })
    ?.plaid_accounts ?? []) {
    map.set(acct.id, acct);
  }
  return map;
}
