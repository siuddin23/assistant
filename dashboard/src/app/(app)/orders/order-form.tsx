"use client";
import { useState, useTransition } from "react";
import type { Order } from "@/db/schema";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";
import { saveOrder, type FormState } from "./actions";

type Props = {
  order?: Order;
  items?: Record<string, number>;
  products: { code: string; name: string }[];
  csAgents: { code: string; name: string }[];
  defaultCs?: string | null;
  today: string;
  readOnly?: boolean;
};

export function OrderForm({ order, items = {}, products, csAgents, defaultCs, today, readOnly }: Props) {
  // Submit manual (bukan <form action>) supaya isian tidak di-reset saat validasi gagal.
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const o = order;
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => setState((await saveOrder({}, fd)) ?? {}));
  };
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {o && <input type="hidden" name="id" value={o.id} />}
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tanggal order"><input className="input" type="date" name="orderDate" required defaultValue={o?.orderDate ?? today} /></Field>
          <Field label="CS">
            <select className="input" name="csCode" defaultValue={o?.csCode ?? defaultCs ?? ""}>
              <option value="">—</option>
              {csAgents.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
              {o?.csCode && !csAgents.some((c) => c.code === o.csCode) && <option value={o.csCode}>{o.csCode}</option>}
            </select>
          </Field>
          <Field label="Kategori">
            <select className="input" name="category" required defaultValue={o?.category ?? "O"}>
              <option value="O">O · Order baru</option><option value="F">F · Follow up</option><option value="R">R · Repeat order</option>
            </select>
          </Field>
          <Field label="Pembayaran">
            <select className="input" name="paymentMethod" required defaultValue={o?.paymentMethod ?? "TF"}>
              <option value="TF">Transfer</option><option value="COD">COD</option><option value="QR">QRIS</option><option value="CC">Kartu kredit</option>
            </select>
          </Field>
        </div>

        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Nama customer"><input className="input" name="customerName" required defaultValue={o?.customerName ?? ""} /></Field>
          <Field label="No. HP / WA"><input className="input" name="customerPhone" inputMode="tel" defaultValue={o?.customerPhone ?? ""} /></Field>
          <Field label="Kota"><input className="input" name="city" defaultValue={o?.city ?? ""} /></Field>
          <Field label="Alamat lengkap"><textarea className="input" name="address" rows={2} defaultValue={o?.address ?? ""} /></Field>
        </div>

        <div className="card space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Paket / tipe"><input className="input" name="productType" placeholder="mis. DVN, 2 S, ULT" defaultValue={o?.productType ?? ""} /></Field>
            <Field label="Omzet (Rp)"><input className="input" name="omzet" required inputMode="numeric" defaultValue={o?.omzet ?? ""} /></Field>
          </div>
          {products.length > 0 && (
            <div>
              <div className="label">Jumlah per produk</div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {products.map((p) => (
                  <label key={p.code} className="text-xs">
                    <span className="mb-1 block text-muted">{p.name}</span>
                    <input className="input" type="number" min={0} name={`item_${p.code}`} defaultValue={items[p.code] ?? ""} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ekspedisi"><input className="input" name="courier" list="couriers" defaultValue={o?.courier ?? ""} /></Field>
          <datalist id="couriers">{["Lion Parcel", "J&T Express", "JNE", "SiCepat", "Ninja Xpress", "Grab", "Go Send", "AnterAja", "ID Express", "SAP"].map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Ongkir (Rp)"><input className="input" name="shippingCost" inputMode="numeric" defaultValue={o?.shippingCost ?? ""} /></Field>
          <Field label="No. resi"><input className="input" name="awb" defaultValue={o?.awb ?? ""} /></Field>
          <Field label="Status pengiriman">
            <select className="input" name="shipStatus" defaultValue={o?.shipStatus ?? "belum_kirim"}>
              {Object.entries(SHIP_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Catatan"><textarea className="input" name="notes" rows={2} defaultValue={o?.notes ?? ""} /></Field>
          </div>
        </div>
      </fieldset>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {!readOnly && <button className="btn-primary" disabled={pending}>{pending ? "Menyimpan…" : "Simpan order"}</button>}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}
