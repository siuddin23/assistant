// Dijalankan otomatis saat deploy di Vercel (script "vercel-build") dan manual lewat `npm run db:migrate`.
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.warn("DATABASE_URL belum diisi — migrasi dilewati. Hubungkan database lalu deploy ulang.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

// Data awal: kode CS & produk yang dipakai di spreadsheet.
await sql`insert into cs_agents (code, name) values ('FTRH','FTRH'),('RS','RS'),('YNY','YNY'),('AL','AL'),('KN','KN'),('SF','SF') on conflict do nothing`;
await sql`insert into products (code, name) values ('DVN','DVN'),('SGLOW','SGLOW'),('NOVIA','Novia'),('EROJAN','Erojan'),('COFFIY','Coffiy'),('BLZ','BLZ'),('EVN','EVN') on conflict do nothing`;

// Admin pertama dari env. Hanya dibuat bila email itu belum ada — password yang sudah diganti di aplikasi tidak ditimpa.
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const hash = await bcrypt.hash(password, 10);
  const r = await sql`insert into users (email, name, password_hash, role)
                      values (${email}, ${process.env.ADMIN_NAME ?? "Admin"}, ${hash}, 'admin')
                      on conflict (email) do nothing returning id`;
  console.log(r.length ? `Admin ${email} dibuat` : `Admin ${email} sudah ada`);
}
console.log("Migrasi selesai");
await sql.end();
