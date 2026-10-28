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
let loading: Promise<void> | null = null;

async function loadCache(): Promise<void> {
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

/**
 * Loads the cache if it isn't loaded yet. Never throws: on failure, name
 * lookups fall back to IDs and the next call tries again.
 */
export async function ensureCache(): Promise<void> {
  if (cache) return;
  loading ??= loadCache()
    .catch((err) => {
      console.error("Failed to load cache, showing IDs instead of names:", err);
    })
    .finally(() => {
      loading = null;
    });
  await loading;
}

/** Best-effort refresh after a mutation. Never throws. */
export async function refreshCache(
  type: "categories" | "tags" | "manualAccounts" | "plaidAccounts"
): Promise<void> {
  if (!cache) return ensureCache();
  try {
    switch (type) {
      case "categories":
        cache.categories = await fetchCategories();
        break;
      case "tags":
        cache.tags = await fetchTags();
        break;
      case "manualAccounts":
        cache.manualAccounts = await fetchManualAccounts();
        break;
      case "plaidAccounts":
        cache.plaidAccounts = await fetchPlaidAccounts();
        break;
    }
  } catch (err) {
    console.error(`Failed to refresh ${type} cache:`, err);
  }
}

export function categoryName(id: number | null): string {
  if (id === null) return "Uncategorized";
  return cache?.categories.get(id)?.name ?? `Category #${id}`;
}

export function tagNames(ids: number[]): string[] {
  return ids.map((id) => cache?.tags.get(id)?.name ?? `Tag #${id}`);
}

export function accountName(
  manualId: number | null,
  plaidId: number | null
): string {
  if (manualId !== null) {
    const acct = cache?.manualAccounts.get(manualId);
    return acct?.display_name ?? acct?.name ?? `Manual #${manualId}`;
  }
  if (plaidId !== null) {
    const acct = cache?.plaidAccounts.get(plaidId);
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
  for (const tag of data?.tags ?? []) {
    map.set(tag.id, tag);
  }
  return map;
}

async function fetchManualAccounts(): Promise<Map<number, ManualAccount>> {
  const { data, error, response } = await api.GET("/manual_accounts");
  if (error) handleError(response.status, error);
  const map = new Map<number, ManualAccount>();
  for (const acct of data?.manual_accounts ?? []) {
    map.set(acct.id, acct);
  }
  return map;
}

async function fetchPlaidAccounts(): Promise<Map<number, PlaidAccount>> {
  const { data, error, response } = await api.GET("/plaid_accounts");
  if (error) handleError(response.status, error);
  const map = new Map<number, PlaidAccount>();
  for (const acct of data?.plaid_accounts ?? []) {
    map.set(acct.id, acct);
  }
  return map;
}
