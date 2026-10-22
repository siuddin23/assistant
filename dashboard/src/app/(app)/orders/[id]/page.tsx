import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canEdit, requireUser } from "@/lib/auth";
import { rupiah, tanggal, todayWib } from "@/lib/format";
import { lookups } from "@/lib/lookups";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";
import { Badge, PageHeader, Section } from "@/components/ui";
import { OrderForm } from "../order-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteOrder } from "../actions";
import { createReturn } from "../../returns/actions";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  if (!order) notFound();
  const [items, updates, settlements, rets, { products, csAgents }] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)),
    order.awb ? db.select().from(schema.shipmentUpdates).where(eq(schema.shipmentUpdates.awb, order.awb)).orderBy(desc(schema.shipmentUpdates.id)).limit(20) : [],
    order.awb ? db.select().from(schema.codSettlements).where(eq(schema.codSettlements.awb, order.awb)) : [],
    db.select().from(schema.returns).where(eq(schema.returns.orderId, id)),
    lookups(),
  ]);
  const saved = (await searchParams).saved;
  const editable = canEdit(user);

  return (
    <>
      <PageHeader title={order.customerName ?? `Order #${order.id}`}
        subtitle={`#${order.id} · ${tanggal(order.orderDate)} · sumber: ${order.source}${order.editedInApp ? " (diedit di dashboard)" : ""}`}
        actions={<Link className="btn-ghost" href="/orders">‹ Kembali</Link>} />
      {saved && <div className="mb-4 rounded-lg bg-accent-soft px-4 py-2 text-sm text-accent">Order tersimpan.</div>}
      {order.source === "sheet" && !order.editedInApp && editable && (
        <p className="mb-4 text-xs text-muted">Order ini dari spreadsheet. Setelah diedit di sini, sinkron sheet berikutnya tidak akan menimpa datanya (kecuali status pengiriman).</p>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <OrderForm order={order} items={Object.fromEntries(items.map((i) => [i.productCode, i.qty]))}
            products={products} csAgents={csAgents} today={todayWib()} readOnly={!editable} />
        </div>
        <div className="space-y-4">
          <Section title="Riwayat status resi">
            <ul className="divide-y divide-line text-sm">
              {updates.map((u) => (
                <li key={u.id} className="px-4 py-2">
                  <div className="font-medium">{SHIP_STATUS_LABEL[u.status]}</div>
                  <div className="text-xs text-muted">{u.statusRaw} · {u.eventAt ? u.eventAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"} · {u.source}</div>
                </li>
              ))}
              {!updates.length && <li className="px-4 py-3 text-xs text-muted">Belum ada update dari impor Everpro.{order.shipStatusRaw ? ` Status terakhir di sheet: ${order.shipStatusRaw}` : ""}</li>}
            </ul>
          </Section>
          {order.paymentMethod === "COD" && (
            <Section title="Pencairan COD">
              <ul className="divide-y divide-line text-sm">
                {settlements.map((s) => (
                  <li key={s.id} className="px-4 py-2">
                    <div className="flex justify-between"><span>COD</span><span className="tabular-nums">{rupiah(s.codAmount)}</span></div>
                    <div className="flex justify-between text-xs text-muted"><span>Ongkir + biaya</span><span>{rupiah(s.shippingFee + s.codFee + s.otherFee)}</span></div>
                    <div className="flex justify-between text-xs"><span>Cair {tanggal(s.settlementDate)}</span><span className="font-medium">{rupiah(s.netAmount)}</span></div>
                  </li>
                ))}
                {!settlements.length && <li className="px-4 py-3 text-xs text-muted">Belum ada data pencairan.</li>}
              </ul>
            </Section>
          )}
          <Section title="Retur / gagal kirim">
            <ul className="divide-y divide-line text-sm">
              {rets.map((r) => (
                <li key={r.id} className="px-4 py-2"><Link className="hover:underline" href={`/returns?focus=${r.id}`}>{r.kind === "retur" ? "Retur" : "Gagal kirim"}</Link> <Badge>{r.status}</Badge><div className="text-xs text-muted">{r.reason}</div></li>
              ))}
            </ul>
            {editable && !rets.length && (
              <form action={createReturn} className="flex gap-2 p-3">
                <input type="hidden" name="orderId" value={order.id} />
                <select className="input" name="kind" defaultValue={order.shipStatus === "retur" ? "retur" : "gagal_kirim"}>
                  <option value="gagal_kirim">Gagal kirim</option><option value="retur">Retur</option>
                </select>
                <button className="btn-ghost whitespace-nowrap">Catat</button>
              </form>
            )}
          </Section>
          {user.role === "admin" && (
            <form action={deleteOrder}>
              <input type="hidden" name="id" value={order.id} />
              <ConfirmButton className="text-xs text-danger underline" message="Hapus order ini? Data yang dihapus tidak bisa dikembalikan.">Hapus order ini</ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
