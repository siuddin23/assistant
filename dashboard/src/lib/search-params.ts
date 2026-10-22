import { todayWib } from "./format";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v || undefined;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function rangeFrom(sp: Record<string, string | string[] | undefined>, defaultDays?: number) {
  const today = todayWib();
  const def = defaultDays != null
    ? new Date(Date.parse(today) - defaultDays * 86400000).toISOString().slice(0, 10)
    : `${today.slice(0, 7)}-01`;
  const from = str(sp.from);
  const to = str(sp.to);
  return { from: from && ISO.test(from) ? from : def, to: to && ISO.test(to) ? to : today };
}
