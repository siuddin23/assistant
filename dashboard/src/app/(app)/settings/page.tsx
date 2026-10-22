import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Section } from "@/components/ui";
import { saveCs, saveProduct, updateUser } from "./actions";
import { AddUserForm } from "./add-user-form";

const ROLE_HELP = "Admin: semua menu. CS: input/edit order, pengiriman, retur. Viewer: lihat saja (termasuk rekonsiliasi).";

export default async function SettingsPage() {
  const me = await requireUser(["admin"]);
  const [users, cs, products] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.csAgents).orderBy(asc(schema.csAgents.code)),
    db.select().from(schema.products).orderBy(asc(schema.products.code)),
  ]);
  return (
    <>
      <PageHeader title="Pengaturan" subtitle={ROLE_HELP} />
      <div className="space-y-4">
        <Section title="User">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Kode CS</th><th>Aktif</th><th>Password baru</th><th></th></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td><td>{u.email}</td>
                  <td colSpan={5}>
                    <form action={updateUser} className="grid grid-cols-5 items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select className="input" name="role" defaultValue={u.role} disabled={u.id === me.id}><option value="admin">Admin</option><option value="cs">CS</option><option value="viewer">Viewer</option></select>
                      {u.id === me.id && <input type="hidden" name="role" value="admin" />}
                      <input className="input" name="csCode" defaultValue={u.csCode ?? ""} />
                      <input type="checkbox" name="active" defaultChecked={u.active} disabled={u.id === me.id} />
                      {u.id === me.id && <input type="hidden" name="active" value="on" />}
                      <input className="input" name="password" type="password" placeholder="kosongkan jika tetap" minLength={8} />
                      <button className="btn-ghost justify-center">Simpan</button>
                    </form>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <AddUserForm />
        </Section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Tim CS">
            <ul className="divide-y divide-line">
              {[...cs, { code: "", name: "", active: true }].map((c) => (
                <li key={c.code || "new"} className="px-4 py-2">
                  <form action={saveCs} className="grid grid-cols-4 gap-2">
                    <input className="input" name="code" defaultValue={c.code} placeholder="Kode" readOnly={!!c.code} required />
                    <input className="input col-span-2" name="name" defaultValue={c.name} placeholder="Nama" />
                    <div className="flex gap-2">
                      {c.code && <select className="input" name="active" defaultValue={c.active ? "on" : "off"}><option value="on">Aktif</option><option value="off">Nonaktif</option></select>}
                      <button className="btn-ghost">{c.code ? "Simpan" : "Tambah"}</button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Produk">
            <ul className="divide-y divide-line">
              {[...products, { code: "", name: "", price: null, active: true }].map((p) => (
                <li key={p.code || "new"} className="px-4 py-2">
                  <form action={saveProduct} className="grid grid-cols-5 gap-2">
                    <input className="input" name="code" defaultValue={p.code} placeholder="Kode" readOnly={!!p.code} required />
                    <input className="input col-span-2" name="name" defaultValue={p.name} placeholder="Nama produk" />
                    <input className="input" name="price" defaultValue={p.price ?? ""} placeholder="Harga" inputMode="numeric" />
                    <div className="flex gap-2">
                      {p.code && <select className="input" name="active" defaultValue={p.active ? "on" : "off"}><option value="on">Aktif</option><option value="off">Off</option></select>}
                      <button className="btn-ghost">{p.code ? "Simpan" : "Tambah"}</button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
