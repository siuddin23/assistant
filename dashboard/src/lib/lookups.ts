import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function lookups() {
  const [products, csAgents] = await Promise.all([
    db.select({ code: schema.products.code, name: schema.products.name }).from(schema.products).where(eq(schema.products.active, true)).orderBy(asc(schema.products.code)),
    db.select({ code: schema.csAgents.code, name: schema.csAgents.name }).from(schema.csAgents).where(eq(schema.csAgents.active, true)).orderBy(asc(schema.csAgents.code)),
  ]);
  return { products, csAgents };
}
