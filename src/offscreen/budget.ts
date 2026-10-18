// Monthly spending limit. The ledger counts what pi-durable's `pi.usage` reports, per calendar month.
// Currency: the catalog prices are in USD; for now they are treated as EUR 1:1 (no exchange rate), so a limit in
// either currency is compared with the same number.
import type { Ledger } from "./state";

export type UsageLike = {
  models?: Record<string, { cost?: { total?: number } } | undefined>;
  tools?: Record<string, { cost?: { total?: number } } | undefined>;
};

export const monthKey = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Total cost ever recorded in a conversation's usage document. */
export function totalCost(usage: UsageLike | undefined): number {
  if (!usage) return 0;
  let sum = 0;
  for (const bucket of [usage.models, usage.tools]) {
    for (const u of Object.values(bucket ?? {})) sum += u?.cost?.total ?? 0;
  }
  return sum;
}

/** Spend counted so far this month, including cost not yet moved into the ledger. `extra` is for tests. */
export function spendNow(ledger: Ledger | undefined, usageTotal: number, month: string, extra = 0): number {
  const l = ledger ?? { months: {}, lastTotal: 0 };
  const pending = Math.max(0, usageTotal - l.lastTotal);
  return (l.months[month] ?? 0) + pending + extra;
}

/** The ledger change that moves new cost into `month`; undefined when there is nothing new. */
export function ledgerDelta(ledger: Ledger | undefined, usageTotal: number): number {
  const l = ledger ?? { months: {}, lastTotal: 0 };
  const d = usageTotal - l.lastTotal;
  return d > 1e-12 ? d : 0;
}

export const overLimit = (spent: number, limit: number): boolean => limit > 0 && spent >= limit;
