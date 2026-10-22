import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ReconRow } from "./reconcile";

export type Range = { from: string; to: string };

const n = (v: unknown) => Number(v ?? 0);

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

export async function dashboardData({ from, to }: Range) {
  const [totals] = await rows<Record<string, unknown>>(sql`
    select count(*) filter (where omzet > 0) as orders,
           coalesce(sum(omzet), 0) as omzet,
           coalesce(sum(omzet) filter (where category = 'O'), 0) as omzet_o,
           coalesce(sum(omzet) filter (where category = 'F'), 0) as omzet_f,
           coalesce(sum(omzet) filter (where category = 'R'), 0) as omzet_r,
           count(*) filter (where category = 'O' and omzet > 0) as orders_o,
           count(*) filter (where category = 'F' and omzet > 0) as orders_f,
           count(*) filter (where category = 'R' and omzet > 0) as orders_r,
           count(*) filter (where payment_method = 'COD') as cod_orders,
           count(*) filter (where ship_status in ('gagal','retur')) as failed,
           count(*) filter (where awb is not null) as shipped,
           count(*) filter (where ship_status = 'terkirim') as delivered
    from orders where order_date between ${from} and ${to}`);

  const daily = await rows<Record<string, unknown>>(sql`
    select to_char(order_date, 'YYYY-MM-DD') as date,
           coalesce(sum(omzet) filter (where category = 'O'), 0) as o,
           coalesce(sum(omzet) filter (where category = 'F'), 0) as f,
           coalesce(sum(omzet) filter (where category = 'R'), 0) as r,
           coalesce(sum(omzet) filter (where category is null), 0) as other,
           count(*) filter (where omzet > 0) as orders
    from orders where order_date between ${from} and ${to}
    group by order_date order by order_date`);

  const spendDaily = await rows<{ date: string; spend: unknown }>(sql`
    select to_char(date, 'YYYY-MM-DD') as date, sum(spend) as spend
    from ad_spend_daily where date between ${from} and ${to} group by date`);
  const spendMap = new Map(spendDaily.map((s) => [s.date, n(s.spend)]));

  const perCs = await rows<Record<string, unknown>>(sql`
    select coalesce(cs_code, '?') as cs,
           count(*) filter (where omzet > 0) as orders,
           coalesce(sum(omzet), 0) as omzet,
           count(*) filter (where category = 'O' and omzet > 0) as o,
           count(*) filter (where category = 'F' and omzet > 0) as f,
           count(*) filter (where category = 'R' and omzet > 0) as r,
           count(*) filter (where ship_status in ('gagal','retur')) as failed,
           count(*) filter (where awb is not null) as shipped
    from orders where order_date between ${from} and ${to}
    group by 1 having count(*) filter (where omzet > 0) > 0 order by omzet desc`);

  const perProduct = await rows<Record<string, unknown>>(sql`
    select i.product_code as product, sum(i.qty) as qty, count(distinct o.id) as orders
    from order_items i join orders o on o.id = i.order_id
    where o.order_date between ${from} and ${to}
    group by 1 order by qty desc`);

  const shipStatus = await rows<{ status: string; count: unknown }>(sql`
    select ship_status as status, count(*) as count from orders
    where order_date between ${from} and ${to} group by 1`);

  const [cod] = await rows<Record<string, unknown>>(sql`
    select coalesce(sum(o.omzet) filter (where s.awb is null and o.ship_status = 'terkirim'), 0) as unpaid,
           count(*) filter (where s.awb is null and o.ship_status = 'terkirim') as unpaid_count,
           coalesce(sum(s.cod), 0) as settled
    from orders o
    left join (select awb, sum(cod_amount) as cod from cod_settlements group by awb) s on s.awb = o.awb
    where o.payment_method = 'COD' and o.order_date between ${from} and ${to}`);

  const spend = [...spendMap.values()].reduce((a, b) => a + b, 0);
  const t = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, n(v)])) as Record<string, number>;
  const acqOmzet = t.omzet_o + t.omzet_f;
  const acqOrders = t.orders_o + t.orders_f;

  return {
    totals: t,
    spend,
    merAcq: spend ? acqOmzet / spend : null,
    merTotal: spend ? t.omzet / spend : null,
    cac: spend && acqOrders ? spend / acqOrders : null,
    aov: t.orders ? t.omzet / t.orders : 0,
    failRate: t.shipped ? t.failed / t.shipped : null,
    daily: daily.map((d) => ({
      date: String(d.date),
      O: n(d.o), F: n(d.f), R: n(d.r), lain: n(d.other),
      orders: n(d.orders),
      spend: spendMap.get(String(d.date)) ?? 0,
    })),
    perCs: perCs.map((c) => ({
      cs: String(c.cs), orders: n(c.orders), omzet: n(c.omzet), O: n(c.o), F: n(c.f), R: n(c.r),
      failRate: n(c.shipped) ? n(c.failed) / n(c.shipped) : null,
    })),
    perProduct: perProduct.map((p) => ({ product: String(p.product), qty: n(p.qty), orders: n(p.orders) })),
    shipStatus: Object.fromEntries(shipStatus.map((s) => [s.status, n(s.count)])) as Record<string, number>,
    cod: { unpaid: n(cod.unpaid), unpaidCount: n(cod.unpaid_count), settled: n(cod.settled) },
  };
}

export async function reconRows({ from, to }: Range): Promise<ReconRow[]> {
  const r = await rows<Record<string, unknown>>(sql`
    select o.id, to_char(o.order_date, 'YYYY-MM-DD') as order_date, o.awb, o.customer_name, o.cs_code,
           o.omzet, o.ship_status, o.shipping_cost,
           s.cod, s.ship, s.fees, s.net, s.last_date
    from orders o
    left join (
      select awb, sum(cod_amount) as cod, sum(shipping_fee) as ship, sum(cod_fee + other_fee) as fees,
             sum(net_amount) as net, to_char(max(settlement_date), 'YYYY-MM-DD') as last_date
      from cod_settlements group by awb
    ) s on s.awb = o.awb
    where o.payment_method = 'COD' and o.order_date between ${from} and ${to}
    order by o.order_date desc, o.id desc`);
  return r.map((x) => ({
    orderId: n(x.id),
    orderDate: String(x.order_date),
    awb: (x.awb as string) ?? null,
    customerName: (x.customer_name as string) ?? null,
    csCode: (x.cs_code as string) ?? null,
    omzet: n(x.omzet),
    shipStatus: String(x.ship_status),
    shippingCost: x.shipping_cost == null ? null : n(x.shipping_cost),
    settledCod: x.cod == null ? null : n(x.cod),
    settledShipping: x.ship == null ? null : n(x.ship),
    settledFees: x.fees == null ? null : n(x.fees),
    settledNet: x.net == null ? null : n(x.net),
    settlementDate: (x.last_date as string) ?? null,
  }));
}

/** Pencairan yang resinya tidak ditemukan di order mana pun. */
export async function orphanSettlements() {
  return rows<{ awb: string; cod_amount: unknown; net_amount: unknown; settlement_date: string | null }>(sql`
    select s.awb, s.cod_amount, s.net_amount, to_char(s.settlement_date, 'YYYY-MM-DD') as settlement_date
    from cod_settlements s left join orders o on o.awb = s.awb
    where o.id is null order by s.settlement_date desc nulls last limit 200`);
}
