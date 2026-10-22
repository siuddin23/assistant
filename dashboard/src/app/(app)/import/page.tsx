import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/format";
import { Empty, PageHeader, Section } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requireUser(["admin"]);
  const [presets, batches] = await Promise.all([
    db.select({ kind: schema.importMappings.kind, name: schema.importMappings.name, mapping: schema.importMappings.mapping }).from(schema.importMappings),
    db.select().from(schema.importBatches).orderBy(desc(schema.importBatches.id)).limit(30),
  ]);
  return (
    <>
      <PageHeader title="Impor file" subtitle="Export dari Globemerce dan Everpro (.xlsx / .csv)" />
      <ImportWizard presets={presets} />
      <div className="mt-6">
        <Section title="Riwayat impor & sinkron">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Sumber</th><th>File</th><th className="num">Baris</th><th className="num">Baru</th><th className="num">Update</th><th className="num">Dilewati</th><th>Catatan</th></tr></thead>
              <tbody>{batches.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{b.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{b.kind}</td><td>{b.source}</td><td className="max-w-48 truncate">{b.filename}</td>
                  <td className="num">{num(b.totalRows)}</td><td className="num">{num(b.inserted)}</td><td className="num">{num(b.updated)}</td><td className="num">{num(b.skipped)}</td>
                  <td className="text-xs text-muted">{b.errors.length ? `${b.errors.length} catatan` : ""}</td>
                </tr>
              ))}</tbody>
            </table>
            {!batches.length && <Empty>Belum ada impor.</Empty>}
          </div>
        </Section>
      </div>
    </>
  );
}
