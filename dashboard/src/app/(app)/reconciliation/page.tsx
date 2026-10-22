import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { num, rupiah, tanggal } from "@/lib/format";
import { orphanSettlements, reconRows } from "@/lib/queries";
import { classify, RECON_LABEL, summarize, type ReconStatus } from "@/lib/reconcile";
import { rangeFrom, str, type SP } from "@/lib/search-params";
import { Badge, Empty, Kpi, PageHeader, Section, ShipBadge } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";
import type { ShipStatus } from "@/db/schema";

const TONE: Record<ReconStatus, "green" | "red" | "amber" | "blue" | "gray"> = {
  sesuai: "green", selisih: "red", belum_cair: "amber", dalam_proses: "blue", retur: "gray", tanpa_resi: "gray",
};

export default async function ReconciliationPage({ searchParams }: { searchParams: SP }) {
  await requireUser(["admin", "viewer"]);
  const sp = await searchParams;
  const range = rangeFrom(sp);
  const filter = str(sp.status) as ReconStatus | undefined;
  const [rows, orphans] = await Promise.all([reconRows(range), orphanSettlements()]);
  const s = summarize(rows);
  const shown = rows.map((r) => ({ ...r, ...classify(r) })).filter((r) => !filter || r.status === filter);
  const href = (st?: string) => `/reconciliation?from=${range.from}&to=${range.to}${st ? `&status=${st}` : ""}`;

  return (
    <>
      <PageHeader title="Rekonsiliasi COD & ongkir" subtitle={`Order COD ${tanggal(range.from)} – ${tanggal(range.to)}`} actions={<Suspense><RangeFilter {...range} /></Suspense>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Nilai COD seharusnya" value={rupiah(s.expected)} hint={`${num(rows.length - s.by.retur.count)} paket (tanpa retur)`} />
        <Kpi label="COD sudah cair (bruto)" value={rupiah(s.settledCod)} hint={`net diterima ${rupiah(s.settledNet)}`} />
        <Kpi label="Terkirim tapi belum cair" value={rupiah(s.by.belum_cair.omzet)} hint={`${num(s.by.belum_cair.count)} paket`} tone={s.by.belum_cair.count ? "bad" : undefined} />
        <Kpi label="Total selisih COD" value={rupiah(s.codDiff)} hint={`${num(s.by.selisih.count)} paket selisih · selisih ongkir ${rupiah(s.shippingDiff)}`} tone={s.by.selisih.count ? "bad" : undefined} />
      </div>

      <div className="my-4 flex flex-wrap gap-2">
        <Link href={href()} className={`btn-ghost ${!filter ? "!border-accent text-accent" : ""}`}>Semua <span className="text-xs">{num(rows.length)}</span></Link>
        {(Object.keys(RECON_LABEL) as ReconStatus[]).map((k) => (
          <Link key={k} href={href(k)} className={`btn-ghost ${filter === k ? "!border-accent text-accent" : ""}`}>{RECON_LABEL[k]} <span className="text-xs">{num(s.by[k].count)}</span></Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Tgl order</th><th>Customer</th><th>Resi</th><th>Kirim</th><th className="num">Omzet</th><th className="num">COD cair</th><th className="num">Selisih</th><th className="num">Ongkir (sheet → Everpro)</th><th className="num">Net cair</th><th>Status</th></tr></thead>
          <tbody>
            {shown.slice(0, 500).map((r) => (
              <tr key={r.orderId}>
                <td className="whitespace-nowrap">{tanggal(r.orderDate)}</td>
                <td><Link className="hover:underline" href={`/orders/${r.orderId}`}>{r.customerName}</Link><div className="text-xs text-muted">{r.csCode}</div></td>
                <td className="font-mono text-xs">{r.awb ?? "—"}</td>
                <td><ShipBadge status={r.shipStatus as ShipStatus} /></td>
                <td className="num">{rupiah(r.omzet)}</td>
                <td className="num">{rupiah(r.settledCod)}<div className="text-xs text-muted">{r.settlementDate ? tanggal(r.settlementDate) : ""}</div></td>
                <td className={`num ${r.codDiff ? "font-medium text-danger" : ""}`}>{r.codDiff ? rupiah(r.codDiff) : "-"}</td>
                <td className={`num ${r.shippingDiff ? "text-warn" : ""}`}>{rupiah(r.shippingCost)} → {rupiah(r.settledShipping)}</td>
                <td className="num">{rupiah(r.settledNet)}</td>
                <td><Badge tone={TONE[r.status]}>{RECON_LABEL[r.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <Empty>Tidak ada order COD di filter ini.</Empty>}
      </div>

      {orphans.length > 0 && (
        <div className="mt-4">
          <Section title={`Pencairan tanpa order yang cocok (${orphans.length})`}>
            <p className="px-4 pt-3 text-xs text-muted">Resi ini ada di laporan pencairan Everpro tetapi tidak ditemukan di order mana pun. Cek apakah resinya belum diisi di order.</p>
            <table className="tbl">
              <thead><tr><th>Resi</th><th>Tanggal cair</th><th className="num">COD</th><th className="num">Net</th></tr></thead>
              <tbody>{orphans.map((x) => (
                <tr key={x.awb}><td className="font-mono text-xs"><Link className="hover:underline" href={`/orders?q=${x.awb}&from=2020-01-01`}>{x.awb}</Link></td><td>{tanggal(x.settlement_date)}</td><td className="num">{rupiah(Number(x.cod_amount))}</td><td className="num">{rupiah(Number(x.net_amount))}</td></tr>
              ))}</tbody>
            </table>
          </Section>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Data pencairan diambil dari impor laporan Everpro (Impor file → Pencairan COD &amp; ongkir). Selisih di bawah Rp1.000 dianggap pembulatan.</p>
    </>
  );
}
