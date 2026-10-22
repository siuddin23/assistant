import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

// Data awal: kode CS & produk yang dipakai di spreadsheet.
await sql`insert into cs_agents (code, name) values ('FTRH','FTRH'),('RS','RS'),('YNY','YNY'),('AL','AL'),('KN','KN'),('SF','SF') on conflict do nothing`;
await sql`insert into products (code, name) values ('DVN','DVN'),('SGLOW','SGLOW'),('NOVIA','Novia'),('EROJAN','Erojan'),('COFFIY','Coffiy'),('BLZ','BLZ'),('EVN','EVN') on conflict do nothing`;
console.log("Migrasi selesai");
await sql.end();
