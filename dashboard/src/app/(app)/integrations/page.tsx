import { headers } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { num, rupiah, tanggal } from "@/lib/format";
import { getWebhookMapping, listPaths, WEBHOOK_FIELDS } from "@/lib/globemerce";
import { MONTH_TABS } from "@/lib/sheet";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { reprocessWebhooks, saveWebhookMapping } from "./actions";
import { SyncForm } from "./sync-form";

export const maxDuration = 300; // sinkron sheet bisa butuh waktu

export default async function IntegrationsPage() {
  await requireUser(["admin"]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [events, mapping, [lastSync], spend] = await Promise.all([
    db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.source, "globemerce")).orderBy(desc(schema.webhookEvents.id)).limit(20),
    getWebhookMapping(),
    db.select().from(schema.importBatches).where(eq(schema.importBatches.kind, "sheet")).orderBy(desc(schema.importBatches.id)).limit(1),
    db.select({ last: sql<string>`to_char(max(${schema.adSpendDaily.date}), 'YYYY-MM-DD')`, total: sql<number>`coalesce(sum(${schema.adSpendDaily.spend}),0)`.mapWith(Number), days: sql<number>`count(distinct ${schema.adSpendDaily.date})`.mapWith(Number) }).from(schema.adSpendDaily),
  ]);
  const now = new Date(Date.now() + 7 * 3600 * 1000).getUTCMonth();
  const defaults = [MONTH_TABS[(now + 11) % 12], MONTH_TABS[now]];
  const sample = events[0]?.payload;
  const paths = sample ? listPaths(sample) : [];
  const token = process.env.GLOBEMERCE_WEBHOOK_TOKEN;
  const counts = events.reduce<Record<string, number>>((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title="Integrasi" subtitle="Spreadsheet, Globemerce, Everpro, dan Meta Ads" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Spreadsheet DATABASE HARYS">
          <p className="px-4 pt-3 text-sm text-muted">
            Menyalin order dari tab bulanan ke database. Aman dijalankan berulang: baris yang sama diperbarui, tidak diduplikasi. Order yang sudah diedit di dashboard tidak ditimpa.
            {lastSync && <> Sinkron terakhir: <b>{lastSync.source.replace("spreadsheet:", "")}</b>, {lastSync.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}.</>}
          </p>
          <SyncForm tabs={MONTH_TABS} defaults={defaults} configured={!!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!process.env.SPREADSHEET_ID} />
        </Section>

        <Section title="Everpro">
          <div className="space-y-2 p-4 text-sm text-muted">
            <p>Everpro belum menyediakan API publik, jadi datanya masuk lewat <a className="text-accent underline" href="/import">Impor file</a>:</p>
            <ul className="list-disc pl-5">
              <li><b>Status pengiriman</b>: export laporan pengiriman/resi untuk memperbarui status paket.</li>
              <li><b>Pencairan COD &amp; ongkir</b>: export laporan pencairan untuk halaman Rekonsiliasi.</li>
            </ul>
            <p>Kalau nanti Everpro memberi akses API, impor ini bisa diganti dengan sinkron otomatis.</p>
          </div>
        </Section>

        <Section title="Spend Meta Ads">
          <div className="space-y-2 p-4 text-sm text-muted">
            <p>Dipakai untuk MER akuisisi dan biaya per customer baru di Dashboard. Data dikirim otomatis oleh job laporan harian (folder <code>src/assistant</code>) ke <code>{origin}/api/ingest/ad-spend</code>.</p>
            <p>{spend[0]?.days ? <>Tersimpan {num(spend[0].days)} hari, total {rupiah(spend[0].total)}, terakhir {tanggal(spend[0].last)}.</> : <Badge tone="amber">Belum ada data spend</Badge>}</p>
          </div>
        </Section>

        <Section title="Webhook Globemerce">
          <div className="space-y-3 p-4 text-sm">
            <div>
              <div className="label">URL webhook (masukkan di pengaturan webhook Globemerce)</div>
              {token
                ? <code className="block break-all rounded-lg bg-bg px-3 py-2 text-xs">{origin}/api/webhooks/globemerce?token={token}</code>
                : <p className="text-danger">Isi GLOBEMERCE_WEBHOOK_TOKEN di environment dulu.</p>}
            </div>
            <p className="text-muted">20 event terakhir: {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ") || "belum ada"}</p>
            <form action={reprocessWebhooks}><button className="btn-ghost">Proses ulang event yang belum masuk</button></form>
          </div>
        </Section>
      </div>

      <div className="mt-4">
        <Section title="Pemetaan field webhook Globemerce">
          {!sample ? (
            <Empty>Belum ada event masuk. Setelah Globemerce mengirim order pertama, payload-nya muncul di sini untuk dipetakan.</Empty>
          ) : (
            <form action={saveWebhookMapping} className="space-y-4 p-4">
              <p className="text-sm text-muted">Pilih bagian payload yang berisi setiap data order. Contoh nilai diambil dari event terakhir (#{events[0].id}).</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {WEBHOOK_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="label">{f.label}{"required" in f && f.required && <span className="text-danger"> *</span>}</span>
                    <select className="input" name={f.key} defaultValue={mapping?.[f.key] ?? ""}>
                      <option value="">— tidak dipakai —</option>
                      {paths.map((p) => <option key={p.path} value={p.path}>{p.path} = {p.sample}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button className="btn-primary">Simpan pemetaan &amp; proses event</button>
            </form>
          )}
        </Section>
      </div>

      {events.length > 0 && (
        <div className="mt-4">
          <Section title="Event terakhir">
            <ul className="divide-y divide-line text-sm">
              {events.map((e) => (
                <li key={e.id} className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">#{e.id} · {e.receivedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}</span>
                    <Badge tone={e.status === "diproses" ? "green" : e.status === "error" ? "red" : "amber"}>{e.status}</Badge>
                    {e.orderId && <a className="text-xs text-accent underline" href={`/orders/${e.orderId}`}>order #{e.orderId}</a>}
                    {e.error && <span className="text-xs text-danger">{e.error}</span>}
                  </div>
                  <details><summary className="cursor-pointer text-xs text-muted">payload</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-bg p-2 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
