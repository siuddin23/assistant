import Link from "next/link";
import { Suspense } from "react";
import { count, desc, sum } from "drizzle-orm";
import { db, schema } from "@/db";
import { canEdit, requireUser } from "@/lib/auth";
import { num, rupiah, tanggal } from "@/lib/format";
import { lookups } from "@/lib/lookups";
import { orderWhere } from "@/lib/order-filters";
import { rangeFrom, str, type SP } from "@/lib/search-params";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";
import { Empty, PageHeader, ShipBadge } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";

const PAGE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = rangeFrom(sp);
  const page = Math.max(1, Number(str(sp.page) ?? 1));
  const where = orderWhere(sp, range);
  const o = schema.orders;

  const [[agg], list, { csAgents }] = await Promise.all([
    db.select({ n: count(), omzet: sum(o.omzet) }).from(o).where(where),
    db.select().from(o).where(where).orderBy(desc(o.orderDate), desc(o.id)).limit(PAGE).offset((page - 1) * PAGE),
    lookups(),
  ]);
  const pages = Math.max(1, Math.ceil(agg.n / PAGE));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Order" subtitle={`${num(agg.n)} order · ${rupiah(Number(agg.omzet ?? 0))}`}
        actions={<>
          <a className="btn-ghost" href={`/api/export/orders${qs({ from: range.from, to: range.to })}`}>Export CSV</a>
          {canEdit(user) && <Link className="btn-primary" href="/orders/new">+ Order baru</Link>}
        </>} />

      <div className="mb-3"><Suspense><RangeFilter {...range} /></Suspense></div>
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="from" value={range.from} />
        <input type="hidden" name="to" value={range.to} />
        <input className="input lg:col-span-2" name="q" placeholder="Cari nama, HP, resi, kota…" defaultValue={str(sp.q)} />
        <select className="input" name="cs" defaultValue={str(sp.cs) ?? ""}>
          <option value="">Semua CS</option>
          {csAgents.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
        <select className="input" name="status" defaultValue={str(sp.status) ?? ""}>
          <option value="">Semua status kirim</option>
          {Object.entries(SHIP_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" name="category" defaultValue={str(sp.category) ?? ""}>
          <option value="">Semua kategori</option><option value="O">O · Order baru</option><option value="F">F · Follow up</option><option value="R">R · Repeat</option>
        </select>
        <div className="flex gap-2">
          <select className="input" name="payment" defaultValue={str(sp.payment) ?? ""}>
            <option value="">Semua bayar</option><option>TF</option><option>COD</option><option>QR</option><option>CC</option>
          </select>
          <button className="btn-primary">Filter</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Tanggal</th><th>Customer</th><th>CS</th><th>Paket</th><th>Kat.</th><th>Bayar</th><th className="num">Omzet</th><th>Resi</th><th>Status</th><th>Sumber</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="hover:bg-bg">
                <td className="whitespace-nowrap">{tanggal(r.orderDate)}</td>
                <td><Link href={`/orders/${r.id}`} className="font-medium hover:underline">{r.customerName ?? "(tanpa nama)"}</Link><div className="text-xs text-muted">{r.city}</div></td>
                <td>{r.csCode}</td>
                <td>{r.productType}</td>
                <td>{r.category}</td>
                <td>{r.paymentMethod}</td>
                <td className="num">{rupiah(r.omzet)}</td>
                <td className="font-mono text-xs">{r.awb}<div className="font-sans text-muted">{r.courier}</div></td>
                <td><ShipBadge status={r.shipStatus} /></td>
                <td className="text-xs text-muted">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty>Tidak ada order yang cocok dengan filter.</Empty>}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          {page > 1 && <Link className="btn-ghost" href={qs({ page: page - 1 })}>‹ Sebelumnya</Link>}
          <span className="text-muted">Halaman {page} / {pages}</span>
          {page < pages && <Link className="btn-ghost" href={qs({ page: page + 1 })}>Berikutnya ›</Link>}
        </div>
      )}
    </>
  );
}
