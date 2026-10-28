import type { components } from "./types.js";
import { categoryName, tagNames, accountName } from "./cache.js";

type Transaction = components["schemas"]["transactionObject"];
type Category = components["schemas"]["categoryObject"];
type ManualAccount = components["schemas"]["manualAccountObject"];
type PlaidAccount = components["schemas"]["plaidAccountObject"];
type Tag = components["schemas"]["tagObject"];
type Recurring = components["schemas"]["recurringObject"];
type User = components["schemas"]["userObject"];
type Summary =
  | components["schemas"]["alignedSummaryResponseObject"]
  | components["schemas"]["nonAlignedSummaryResponseObject"];

// --- Transactions ---

export function formatTransaction(t: Transaction): string {
  const tags = t.tag_ids.length > 0 ? ` [${tagNames(t.tag_ids).join(", ")}]` : "";
  // Transaction groups are not associated with any account.
  const account = t.is_group_parent
    ? "(group)"
    : accountName(t.manual_account_id, t.plaid_account_id);
  const category = categoryName(t.category_id);
  const notes = t.notes ? `  Notes: ${t.notes}` : "";
  const status = t.status === "unreviewed" ? " (unreviewed)" : "";

  return [
    `${t.date}  ${formatAmount(t.amount, t.currency)}  ${t.payee}`,
    `  Category: ${category} | Account: ${account}${status}${tags}`,
    `  ID: ${t.id}`,
    notes,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTransactions(
  transactions: Transaction[],
  hasMore: boolean
): string {
  if (transactions.length === 0) {
    return "No transactions found for this period. Try adjusting the date range or filters.";
  }

  const lines = transactions.map(formatTransaction);
  const summary = `Showing ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
  const more = hasMore ? " (more available — increase limit or use offset)" : "";

  return `${summary}${more}\n\n${lines.join("\n\n")}`;
}

// --- Categories ---

export function formatCategories(
  categories: Category[],
  mode: "nested" | "flat"
): string {
  if (categories.length === 0) {
    return "No categories found.";
  }

  if (mode === "nested") {
    return categories
      .map((cat) => {
        const flags = formatCategoryFlags(cat);
        const header = `${cat.name}${flags} (ID: ${cat.id})`;
        if (cat.is_group && cat.children?.length) {
          const children = cat.children
            .map((c) => `  - ${c.name} (ID: ${c.id})`)
            .join("\n");
          return `${header}\n${children}`;
        }
        return header;
      })
      .join("\n");
  }

  // flat
  return categories
    .map((cat) => {
      const flags = formatCategoryFlags(cat);
      const group = cat.group_id ? ` [group: ${categoryName(cat.group_id)}]` : "";
      return `${cat.name}${flags}${group} (ID: ${cat.id})`;
    })
    .join("\n");
}

function formatCategoryFlags(cat: Category): string {
  const flags: string[] = [];
  if (cat.is_income) flags.push("income");
  if (cat.exclude_from_budget) flags.push("excl. budget");
  if (cat.exclude_from_totals) flags.push("excl. totals");
  if (cat.archived) flags.push("archived");
  return flags.length > 0 ? ` (${flags.join(", ")})` : "";
}

// --- Accounts ---

export function formatAccounts(
  manual: ManualAccount[],
  plaid: PlaidAccount[]
): string {
  const lines: string[] = [];

  if (manual.length > 0) {
    lines.push("## Manual Accounts\n");
    for (const a of manual) {
      const display = a.display_name ?? a.name;
      const inst = a.institution_name ? ` @ ${a.institution_name}` : "";
      const closed = a.status === "closed" ? " (closed)" : "";
      lines.push(
        `${display}${inst}${closed}\n  Balance: ${formatAmount(a.balance, a.currency)} | Type: ${a.type} | ID: ${a.id}`
      );
    }
  }

  if (plaid.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("## Synced Accounts\n");
    for (const a of plaid) {
      const display = a.display_name ?? a.name;
      const statusFlag = a.status !== "active" ? ` (${a.status})` : "";
      lines.push(
        `${display} @ ${a.institution_name}${statusFlag}\n  Balance: ${formatAmount(a.balance, a.currency)} | Type: ${a.type}/${a.subtype} | ID: ${a.id}`
      );
    }
  }

  if (lines.length === 0) {
    return "No accounts found.";
  }

  return lines.join("\n");
}

// --- Tags ---

export function formatTags(tags: Tag[]): string {
  if (tags.length === 0) {
    return "No tags found. Create tags in Lunch Money to organize transactions.";
  }

  return tags
    .map((t) => {
      const desc = t.description ? ` — ${t.description}` : "";
      const archived = t.archived ? " (archived)" : "";
      return `${t.name}${desc}${archived} (ID: ${t.id})`;
    })
    .join("\n");
}

// --- Summary ---

export function formatSummary(
  data: Summary,
  startDate: string,
  endDate: string,
  currency: string
): string {
  const money = (amount: number) => formatAmount(amount, currency);
  const lines: string[] = [`Budget Summary: ${startDate} to ${endDate}\n`];

  // Totals. Inflow is reported as negative amounts (credits), so show its
  // magnitude as income.
  const totals = data.totals;
  if (totals) {
    const income = Math.abs(
      (totals.inflow?.other_activity ?? 0) +
        (totals.inflow?.recurring_activity ?? 0)
    );
    const spending =
      (totals.outflow?.other_activity ?? 0) +
      (totals.outflow?.recurring_activity ?? 0);

    lines.push(`Income: ${money(income)}`);
    lines.push(`Spending: ${money(spending)}`);
    lines.push(`Net: ${money(income - spending)}`);

    if (totals.outflow?.uncategorized) {
      lines.push(`Uncategorized spending: ${money(totals.outflow.uncategorized)}`);
    }
    lines.push("");
  }

  // Per-category breakdown
  const activity = (t: { other_activity: number; recurring_activity: number }) =>
    t.other_activity + t.recurring_activity;
  const categories = [...data.categories].sort(
    (a, b) => activity(b.totals) - activity(a.totals)
  );

  if (categories.length > 0) {
    lines.push("Category Breakdown:");
    for (const cat of categories) {
      const total = activity(cat.totals);
      if (total === 0) continue;
      const name = categoryName(cat.category_id);
      const budget =
        "budgeted" in cat.totals && cat.totals.budgeted != null
          ? ` (budget: ${money(cat.totals.budgeted)}, avail: ${money(cat.totals.available ?? 0)})`
          : "";
      lines.push(`  ${name}: ${money(total)}${budget}`);
    }
  }

  return lines.join("\n");
}

// --- Recurring ---

export function formatRecurring(items: Recurring[]): string {
  if (items.length === 0) {
    return "No recurring items found for this period.";
  }

  return items
    .map((r) => {
      const c = r.transaction_criteria;
      const payee = r.overrides.payee ?? c.payee ?? "Unknown";
      const category = r.overrides.category_id
        ? categoryName(r.overrides.category_id)
        : "Uncategorized";
      const account = accountName(c.manual_account_id, c.plaid_account_id);
      const freq = `every ${c.quantity > 1 ? `${c.quantity} ` : ""}${c.granularity}${c.quantity > 1 ? "s" : ""}`;
      const desc = r.description ? ` — ${r.description}` : "";

      const matchInfo = r.matches
        ? ` | Found: ${r.matches.found_transactions?.length ?? 0}, Missing: ${r.matches.missing_transaction_dates?.length ?? 0}`
        : "";

      return `${payee}${desc}\n  ${formatAmount(c.amount, c.currency)} ${freq} | ${category} | ${account}${matchInfo}\n  ID: ${r.id}`;
    })
    .join("\n\n");
}

// --- User ---

export function formatUser(user: User): string {
  return [
    `Name: ${user.name}`,
    `Email: ${user.email}`,
    `Budget: ${user.budget_name}`,
    `Currency: ${user.primary_currency.toUpperCase()}`,
    `ID: ${user.id}`,
  ].join("\n");
}

// --- Single entity formatters (for CRUD responses) ---

export function formatCategory(cat: Category): string {
  const flags = formatCategoryFlags(cat);
  const group = cat.group_id ? ` [group: ${categoryName(cat.group_id)}]` : "";
  const desc = cat.description ? `\n  Description: ${cat.description}` : "";
  return `${cat.name}${flags}${group} (ID: ${cat.id})${desc}`;
}

export function formatTag(tag: Tag): string {
  const desc = tag.description ? ` — ${tag.description}` : "";
  const archived = tag.archived ? " (archived)" : "";
  return `${tag.name}${desc}${archived} (ID: ${tag.id})`;
}

export function formatAccount(account: ManualAccount): string {
  const display = account.display_name ?? account.name;
  const inst = account.institution_name ? ` @ ${account.institution_name}` : "";
  const closed = account.status === "closed" ? " (closed)" : "";
  return `${display}${inst}${closed}\n  Balance: ${formatAmount(account.balance, account.currency)} | Type: ${account.type} | ID: ${account.id}`;
}

export function formatBulkUpdateResult(transactions: Transaction[]): string {
  const count = transactions.length;
  const preview = transactions.slice(0, 3).map(formatTransaction).join("\n\n");
  const more = count > 3 ? `\n\n... and ${count - 3} more` : "";
  return `${count} transaction${count === 1 ? "" : "s"} updated.\n\n${preview}${more}`;
}

export function formatDeleteResult(
  type: string,
  id: number,
  deps?: Record<string, number>
): string {
  if (deps) {
    const depLines = Object.entries(deps)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    return `Cannot delete ${type} ${id} — has dependencies:\n${depLines}\n\nUse force=true to delete anyway.`;
  }
  return `${type} ${id} deleted successfully.`;
}

// --- Helpers ---

function formatAmount(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const sym = currencySymbol(currency);
  const abs = Math.abs(num).toFixed(2);
  return num < 0 ? `-${sym}${abs}` : `${sym}${abs}`;
}

function currencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    usd: "$",
    eur: "€",
    gbp: "£",
    jpy: "¥",
    cad: "CA$",
    aud: "A$",
    chf: "CHF ",
  };
  return symbols[code.toLowerCase()] ?? `${code.toUpperCase()} `;
}
