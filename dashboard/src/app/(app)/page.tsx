import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { dashboardData } from "@/lib/queries";
import { num, pct, ratio, rupiah, rupiahShort, tanggal } from "@/lib/format";
import { rangeFrom, type SP } from "@/lib/search-params";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";
import { Empty, Kpi, PageHeader, Section } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";
import { CAT_COLORS, DailyOmzetChart } from "@/components/charts";
import type { ShipStatus } from "@/db/schema";

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const range = rangeFrom(await searchParams);
  const d = await dashboardData(range);
  const t = d.totals;
  const acqOrders = t.orders_o + t.orders_f;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${tanggal(range.from)} – ${tanggal(range.to)}`}
        actions={<Suspense><RangeFilter {...range} /></Suspense>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Omzet" value={rupiahShort(t.omzet)} hint={`${num(t.orders)} order · AOV ${rupiahShort(d.aov)}${t.cancelled ? ` · ${num(t.cancelled)} batal` : ""}`} />
        <Kpi label="Omzet customer baru (O+F)" value={rupiahShort(t.omzet_o + t.omzet_f)} hint={`${num(acqOrders)} order`} />
        <Kpi label="Repeat order (R)" value={rupiahShort(t.omzet_r)} hint={`${pct(t.omzet ? t.omzet_r / t.omzet : null)} dari omzet`} />
        <Kpi label="Gagal kirim + retur" value={pct(d.failRate)} hint={`${num(t.failed)} dari ${num(t.shipped)} paket`} tone={d.failRate != null && d.failRate > 0.08 ? "bad" : undefined} />
        <Kpi label="Spend iklan" value={d.spend ? rupiahShort(d.spend) : "-"} hint={d.spend ? "dari data Meta Ads" : "belum ada data spend"} />
        <Kpi label="MER akuisisi" value={ratio(d.merAcq)} hint={`MER total ${ratio(d.merTotal)}`} />
        <Kpi label="Biaya per customer baru" value={d.cac ? rupiahShort(d.cac) : "-"} hint="spend ÷ order O+F" />
        <Kpi label="COD terkirim, belum cair" value={rupiahShort(d.cod.unpaid)} hint={`${num(d.cod.unpaidCount)} paket`} tone={d.cod.unpaidCount > 0 ? "bad" : undefined} />
        <Kpi label="Margin kotor (omzet − HPP)" value={pct(d.grossMargin)} hint={d.grossMargin != null ? `HPP tersedia di ${pct(d.costCoverage, 0)} order` : "impor order Globemerce untuk HPP"} />
        <Kpi label="Estimasi laba kotor" value={d.estGross != null ? rupiahShort(d.estGross) : "-"} hint="omzet × margin kotor" />
        <Kpi label="Estimasi laba setelah iklan" value={d.estAfterAds != null ? rupiahShort(d.estAfterAds) : "-"} hint="belum termasuk ongkir, gaji, dll." tone={d.estAfterAds != null && d.estAfterAds < 0 ? "bad" : undefined} />
        <Kpi label="MER break-even (kasar)" value={ratio(d.breakEvenMer)} hint="1 ÷ margin kotor; target MER akuisisi minimal" />
      </div>

      <div className="mt-4">
        <Section title="Omzet harian per kategori">
          <div className="p-4">{d.daily.length ? <DailyOmzetChart data={d.daily} /> : <Empty>Belum ada order di rentang ini.</Empty>}</div>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Section title="Performa CS">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr><th>CS</th><th className="num">Order</th><th className="num">Omzet</th><th className="num">Porsi</th>
                    <th className="num">O</th><th className="num">F</th><th className="num">R</th><th className="num">Gagal/retur</th></tr>
                </thead>
                <tbody>
                  {d.perCs.map((c) => (
                    <tr key={c.cs}>
                      <td className="font-medium"><Link className="hover:underline" href={`/orders?cs=${c.cs}&from=${range.from}&to=${range.to}`}>{c.cs}</Link></td>
                      <td className="num">{num(c.orders)}</td>
                      <td className="num">{rupiah(c.omzet)}</td>
                      <td className="num">{pct(t.omzet ? c.omzet / t.omzet : null, 0)}</td>
                      <td className="num">{num(c.O)}</td><td className="num">{num(c.F)}</td><td className="num">{num(c.R)}</td>
                      <td className="num">{pct(c.failRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.perCs.length && <Empty>Belum ada data.</Empty>}
            </div>
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Status pengiriman">
            <ul className="divide-y divide-line text-sm">
              {(Object.keys(SHIP_STATUS_LABEL) as ShipStatus[]).map((s) => (
                <li key={s} className="flex justify-between px-4 py-2">
                  <Link className="hover:underline" href={`/shipping?status=${s}&from=${range.from}&to=${range.to}`}>{SHIP_STATUS_LABEL[s]}</Link>
                  <span className="tabular-nums">{num(d.shipStatus[s] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Produk terjual (qty)">
            <ul className="divide-y divide-line text-sm">
              {d.perProduct.map((p) => (
                <li key={p.product} className="flex justify-between px-4 py-2"><span>{p.product}</span><span className="tabular-nums">{num(p.qty)}</span></li>
              ))}
            </ul>
            {!d.perProduct.length && <Empty>Belum ada data produk.</Empty>}
          </Section>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">
        <i className="mr-1 inline-block size-2 rounded-sm" style={{ background: CAT_COLORS.O }} />O = order baru ·
        <i className="mx-1 inline-block size-2 rounded-sm" style={{ background: CAT_COLORS.F }} />F = follow up ·
        <i className="mx-1 inline-block size-2 rounded-sm" style={{ background: CAT_COLORS.R }} />R = repeat order.
        MER akuisisi = omzet O+F ÷ spend iklan.
      </p>
    </>
  );
}
