import Link from "next/link";
import { Suspense } from "react";
import { and, asc, between, count, eq, isNotNull, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { daysBetween, num, rupiah, tanggal, todayWib } from "@/lib/format";
import { rangeFrom, str, type SP } from "@/lib/search-params";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";
import { Empty, PageHeader, ShipBadge } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";
import type { ShipStatus } from "@/db/schema";

const STUCK_DAYS = 5;

export default async function ShippingPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const range = rangeFrom(sp, 30);
  const o = schema.orders;
  const today = todayWib();
  const view = str(sp.status) ?? "tertahan";

  const base = between(o.orderDate, range.from, range.to);
  const stuckCutoff = new Date(Date.parse(today) - STUCK_DAYS * 86400000).toISOString().slice(0, 10);
  let where: SQL | undefined;
  if (view === "tertahan") where = and(base, eq(o.shipStatus, "dalam_perjalanan"), lte(o.orderDate, stuckCutoff));
  else if (view === "tanpa_resi") where = and(base, eq(o.shipStatus, "belum_kirim"));
  else if ((schema.shipStatusEnum.enumValues as readonly string[]).includes(view)) where = and(base, eq(o.shipStatus, view as ShipStatus));
  else where = and(base, isNotNull(o.awb));

  const [counts, [stuck], list] = await Promise.all([
    db.select({ status: o.shipStatus, n: count() }).from(o).where(base).groupBy(o.shipStatus),
    db.select({ n: count() }).from(o).where(and(base, eq(o.shipStatus, "dalam_perjalanan"), lte(o.orderDate, stuckCutoff))),
    db.select().from(o).where(where).orderBy(asc(o.orderDate)).limit(300),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n])) as Record<string, number>;
  const tabs: [string, string, number][] = [
    ["tertahan", `Tertahan > ${STUCK_DAYS} hari`, stuck.n],
    ["tanpa_resi", "Belum dikirim", c.belum_kirim ?? 0],
    ...(["dalam_perjalanan", "gagal", "retur", "terkirim"] as ShipStatus[]).map((s) => [s, SHIP_STATUS_LABEL[s], c[s] ?? 0] as [string, string, number]),
  ];
  const href = (s: string) => `/shipping?status=${s}&from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader title="Pengiriman" subtitle="Pantau resi yang tertahan, gagal, dan retur" actions={<Suspense><RangeFilter {...range} /></Suspense>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, label, n]) => (
          <Link key={k} href={href(k)} className={`btn-ghost ${view === k ? "!border-accent text-accent" : ""}`}>
            {label} <span className="rounded bg-bg px-1.5 text-xs tabular-nums">{num(n)}</span>
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Tgl order</th><th className="num">Umur</th><th>Customer</th><th>CS</th><th>Ekspedisi / resi</th><th>Status</th><th>Update terakhir</th><th className="num">Omzet</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const age = daysBetween(r.orderDate, today);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{tanggal(r.orderDate)}</td>
                  <td className={`num ${r.shipStatus === "dalam_perjalanan" && age > STUCK_DAYS ? "font-medium text-danger" : ""}`}>{age} hr</td>
                  <td><Link className="hover:underline" href={`/orders/${r.id}`}>{r.customerName}</Link><div className="text-xs text-muted">{r.city}</div></td>
                  <td>{r.csCode}</td>
                  <td>{r.courier}<div className="font-mono text-xs text-muted">{r.awb ?? "—"}</div></td>
                  <td><ShipBadge status={r.shipStatus} /></td>
                  <td className="text-xs text-muted">{r.shipStatusRaw}<div>{r.shipStatusAt ? r.shipStatusAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) : ""}</div></td>
                  <td className="num">{rupiah(r.omzet)} <span className="text-xs text-muted">{r.paymentMethod}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <Empty>Tidak ada paket di kategori ini.</Empty>}
      </div>
      <p className="mt-3 text-xs text-muted">Status diperbarui dari sinkron spreadsheet dan impor laporan pengiriman Everpro (menu Impor file).</p>
    </>
  );
}
