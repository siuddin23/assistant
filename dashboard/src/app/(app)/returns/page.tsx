import Link from "next/link";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { canEdit, requireUser } from "@/lib/auth";
import { num, rupiah, tanggal } from "@/lib/format";
import { str, type SP } from "@/lib/search-params";
import { Badge, Empty, PageHeader, Section, ShipBadge } from "@/components/ui";
import { createReturn, updateReturn } from "./actions";

const STATUS_LABEL = { baru: "Baru", proses: "Diproses", kirim_ulang: "Kirim ulang", kembali_ke_gudang: "Kembali ke gudang", selesai: "Selesai" } as const;
const REASONS = ["Customer tidak di tempat", "Alamat tidak lengkap / salah", "Customer menolak", "Nomor tidak bisa dihubungi", "Customer batal", "Paket rusak", "Lainnya"];

export default async function ReturnsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show = str(sp.show) === "selesai" ? "selesai" : "aktif";
  const focus = Number(str(sp.focus) ?? 0);
  const o = schema.orders, r = schema.returns;

  const [pending, list, [stats]] = await Promise.all([
    // Order gagal/retur yang belum punya catatan tindak lanjut.
    db.select({ id: o.id, orderDate: o.orderDate, customerName: o.customerName, csCode: o.csCode, awb: o.awb, courier: o.courier, omzet: o.omzet, shipStatus: o.shipStatus, shipStatusRaw: o.shipStatusRaw, paymentMethod: o.paymentMethod })
      .from(o).leftJoin(r, eq(r.orderId, o.id))
      .where(and(inArray(o.shipStatus, ["gagal", "retur"]), isNull(r.id)))
      .orderBy(desc(o.orderDate)).limit(200),
    db.select({ ret: r, order: { id: o.id, customerName: o.customerName, customerPhone: o.customerPhone, csCode: o.csCode, awb: o.awb, omzet: o.omzet, orderDate: o.orderDate, shipStatus: o.shipStatus, paymentMethod: o.paymentMethod } })
      .from(r).innerJoin(o, eq(o.id, r.orderId))
      .where(show === "selesai" ? eq(r.status, "selesai") : ne(r.status, "selesai"))
      .orderBy(desc(r.createdAt)).limit(300),
    db.select({
      open: sql<number>`count(*) filter (where ${r.status} <> 'selesai')`.mapWith(Number),
      cost: sql<number>`coalesce(sum(${r.returnCost}), 0)`.mapWith(Number),
    }).from(r),
  ]);
  const editable = canEdit(user);

  return (
    <>
      <PageHeader title="Retur & gagal kirim" subtitle={`${num(stats.open)} kasus aktif · biaya retur tercatat ${rupiah(stats.cost)}`}
        actions={<div className="flex gap-1">
          <Link className={`btn-ghost ${show === "aktif" ? "!border-accent text-accent" : ""}`} href="/returns">Aktif</Link>
          <Link className={`btn-ghost ${show === "selesai" ? "!border-accent text-accent" : ""}`} href="/returns?show=selesai">Selesai</Link>
        </div>} />

      {pending.length > 0 && (
        <div className="mb-4">
          <Section title={`Belum ditindaklanjuti (${pending.length})`}>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Tanggal</th><th>Customer</th><th>CS</th><th>Resi</th><th>Status</th><th className="num">Omzet</th><th></th></tr></thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{tanggal(p.orderDate)}</td>
                      <td><Link className="hover:underline" href={`/orders/${p.id}`}>{p.customerName}</Link></td>
                      <td>{p.csCode}</td>
                      <td className="font-mono text-xs">{p.awb}<div className="font-sans text-muted">{p.courier}</div></td>
                      <td><ShipBadge status={p.shipStatus} /><div className="text-xs text-muted">{p.shipStatusRaw}</div></td>
                      <td className="num">{rupiah(p.omzet)} <span className="text-xs text-muted">{p.paymentMethod}</span></td>
                      <td>{editable && (
                        <form action={createReturn}>
                          <input type="hidden" name="orderId" value={p.id} />
                          <input type="hidden" name="kind" value={p.shipStatus === "retur" ? "retur" : "gagal_kirim"} />
                          <button className="btn-ghost !py-1 text-xs">Tindak lanjuti</button>
                        </form>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      <Section title={show === "selesai" ? "Kasus selesai" : "Kasus aktif"}>
        <ul className="divide-y divide-line">
          {list.map(({ ret, order }) => (
            <li key={ret.id} className={`p-4 ${focus === ret.id ? "bg-accent-soft/50" : ""}`} id={`r${ret.id}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Link className="font-medium hover:underline" href={`/orders/${order.id}`}>{order.customerName}</Link>
                <span className="text-muted">· {order.csCode} · {tanggal(order.orderDate)} · {rupiah(order.omzet)} {order.paymentMethod}</span>
                <span className="font-mono text-xs text-muted">{order.awb}</span>
                <ShipBadge status={order.shipStatus} />
                <Badge tone={ret.status === "selesai" ? "green" : ret.status === "baru" ? "red" : "amber"}>{STATUS_LABEL[ret.status]}</Badge>
              </div>
              <form action={updateReturn} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <input type="hidden" name="id" value={ret.id} />
                <fieldset disabled={!editable} className="contents">
                  <select className="input" name="kind" defaultValue={ret.kind}><option value="gagal_kirim">Gagal kirim</option><option value="retur">Retur</option></select>
                  <input className="input lg:col-span-2" name="reason" list="reasons" placeholder="Alasan" defaultValue={ret.reason ?? ""} />
                  <select className="input" name="status" defaultValue={ret.status}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input className="input" name="returnCost" inputMode="numeric" placeholder="Biaya retur (Rp)" defaultValue={ret.returnCost ?? ""} />
                  <button className="btn-ghost justify-center">Simpan</button>
                  <input className="input sm:col-span-2 lg:col-span-6" name="notes" placeholder="Catatan tindak lanjut (mis. sudah dihubungi, alamat dikoreksi)" defaultValue={ret.notes ?? ""} />
                </fieldset>
              </form>
            </li>
          ))}
        </ul>
        {!list.length && <Empty>{show === "selesai" ? "Belum ada kasus selesai." : "Tidak ada kasus aktif."}</Empty>}
      </Section>
      <datalist id="reasons">{REASONS.map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}
