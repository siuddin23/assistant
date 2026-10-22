// Pemakaian: npm run create-user -- email@contoh.com "Nama" password [admin|cs|viewer] [KODE_CS]
import bcrypt from "bcryptjs";
import postgres from "postgres";

const [email, name, password, role = "admin", csCode = null] = process.argv.slice(2);
if (!email || !name || !password || password.length < 8) {
  console.error('Pakai: npm run create-user -- email "Nama" password(min 8) [admin|cs|viewer] [KODE_CS]');
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const hash = await bcrypt.hash(password, 10);
await sql`insert into users (email, name, password_hash, role, cs_code)
          values (${email.toLowerCase()}, ${name}, ${hash}, ${role}, ${csCode})
          on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role, name = excluded.name, active = true`;
console.log(`User ${email} (${role}) siap`);
await sql.end();
