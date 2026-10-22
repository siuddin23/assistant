import "server-only";
import { and, between, eq, ilike, or, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import { str } from "./search-params";

const o = schema.orders;

/** Filter order dari query string, dipakai oleh daftar order & export. */
export function orderWhere(sp: Record<string, string | string[] | undefined>, range: { from: string; to: string }): SQL | undefined {
  const conds: (SQL | undefined)[] = [between(o.orderDate, range.from, range.to)];
  const q = str(sp.q)?.trim();
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    conds.push(or(ilike(o.customerName, like), ilike(o.awb, like), ilike(o.city, like), digits.length >= 4 ? ilike(o.customerPhone, `%${digits.replace(/^0/, "")}%`) : undefined));
  }
  const cs = str(sp.cs);
  if (cs) conds.push(eq(o.csCode, cs));
  const status = str(sp.status);
  if (status && (schema.shipStatusEnum.enumValues as readonly string[]).includes(status)) conds.push(eq(o.shipStatus, status as never));
  const cat = str(sp.category);
  if (cat === "O" || cat === "F" || cat === "R") conds.push(eq(o.category, cat));
  const pay = str(sp.payment);
  if (pay) conds.push(eq(o.paymentMethod, pay));
  const source = str(sp.source);
  if (source) conds.push(eq(o.source, source));
  return and(...conds);
}
