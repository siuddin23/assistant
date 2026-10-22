import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

// prepare:false supaya kompatibel dengan connection pooler (Supabase / PgBouncer).
const sql = globalForDb.sql ?? postgres((process.env.DATABASE_URL ?? process.env.POSTGRES_URL)!, { prepare: false, max: 5, onnotice: () => {} });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
