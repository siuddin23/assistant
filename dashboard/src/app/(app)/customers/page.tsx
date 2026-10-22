import Link from "next/link";
import { and, count, desc, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { daysBetween, num, pct, tanggal, todayWib } from "@/lib/format";
import { str, type SP } from "@/lib/search-params";
import { Empty, Kpi, PageHeader } from "@/components/ui";

const PAGE = 100;
// Segmen follow up: belum order lagi sejak X hari.
const SEGMENTS: { key: string; label: string; min: number; max: number }[] = [
  { key: "30-60", label: "30–60 hari", min: 30, max: 60 },
  { key: "60-90", label: "60–90 hari", min: 60, max: 90 },
  { key: "90-180", label: "90–180 hari", min: 90, max: 180 },
  { key: "180+", label: "> 180 hari", min: 180, max: 100000 },
];

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const c = schema.customers;
  const today = todayWib();
  const daysAgo = (d: number) => new Date(Date.parse(today) - d * 86400000).toISOString().slice(0, 10);

  const conds: (SQL | undefined)[] = [];
  const q = str(sp.q)?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "").replace(/^0/, "");
    conds.push(or(ilike(c.name, `%${q}%`), ilike(c.regency, `%${q}%`), digits.length >= 4 ? ilike(c.phone, `%${digits}%`) : undefined));
  }
  const seg = SEGMENTS.find((s) => s.key === str(sp.segment));
  if (seg) conds.push(lte(c.lastOrderDate, daysAgo(seg.min)), gte(c.lastOrderDate, daysAgo(seg.max)));
  const type = str(sp.type);
  if (type === "baru") conds.push(sql`${c.totalOrder} = 1`);
  if (type === "repeat") conds.push(sql`${c.totalOrder} >= 2`);
  const product = str(sp.product);
  if (product) conds.push(ilike(c.productConsume, `%${product}%`));
  const where = and(...conds);
  const page = Math.max(1, Number(str(sp.page) ?? 1));

  const [[stats], [{ n }], list, segCounts] = await Promise.all([
    db.select({
      total: count(),
      buyers: sql<number>`count(*) filter (where ${c.totalOrder} >= 1)`.mapWith(Number),
      repeat: sql<number>`count(*) filter (where ${c.totalOrder} >= 2)`.mapWith(Number),
      avgOrders: sql<number>`coalesce(avg(${c.totalOrder}) filter (where ${c.totalOrder} >= 1), 0)`.mapWith(Number),
      active30: sql<number>`count(*) filter (where ${c.lastOrderDate} >= ${daysAgo(30)})`.mapWith(Number),
    }).from(c),
    db.select({ n: count() }).from(c).where(where),
    db.select().from(c).where(where).orderBy(desc(c.lastOrderDate), desc(c.totalOrder)).limit(PAGE).offset((page - 1) * PAGE),
    Promise.all(SEGMENTS.map((s) => db.select({ n: count() }).from(c).where(and(lte(c.lastOrderDate, daysAgo(s.min)), gte(c.lastOrderDate, daysAgo(s.max)))).then(([r]) => r.n))),
  ]);
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    for (const [k, v] of Object.entries(extra)) v === undefined ? p.delete(k) : p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(n / PAGE));

  return (
    <>
      <PageHeader title="Customer" subtitle="Dari Customer List Globemerce. Untuk follow up repeat order." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total customer" value={num(stats.total)} hint={`${num(stats.buyers)} pernah order`} />
        <Kpi label="Repeat customer (≥ 2 order)" value={num(stats.repeat)} hint={`${pct(stats.buyers ? stats.repeat / stats.buyers : null)} dari pembeli`} />
        <Kpi label="Rata-rata order / customer" value={num(stats.avgOrders, 2)} />
        <Kpi label="Order dalam 30 hari terakhir" value={num(stats.active30)} hint="customer aktif" />
      </div>

      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Belum order lagi:</span>
        <Link href={qs({ segment: undefined, page: undefined })} className={`btn-ghost ${!seg ? "!border-accent text-accent" : ""}`}>Semua</Link>
        {SEGMENTS.map((s, i) => (
          <Link key={s.key} href={qs({ segment: s.key, page: undefined })} className={`btn-ghost ${seg?.key === s.key ? "!border-accent text-accent" : ""}`}>
            {s.label} <span className="text-xs tabular-nums">{num(segCounts[i])}</span>
          </Link>
        ))}
      </div>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        {seg && <input type="hidden" name="segment" value={seg.key} />}
        <input className="input lg:col-span-2" name="q" placeholder="Cari nama, HP, kota…" defaultValue={q} />
        <select className="input" name="type" defaultValue={type ?? ""}>
          <option value="">Semua customer</option><option value="baru">Baru order 1x</option><option value="repeat">Sudah repeat (≥ 2x)</option>
        </select>
        <input className="input" name="product" placeholder="Produk (mis. DVN)" defaultValue={product} />
        <button className="btn-primary justify-center">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>WhatsApp</th><th>Kota</th><th className="num">Total order</th><th>Order terakhir</th><th className="num">Sejak</th><th>Produk</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="font-medium"><Link className="hover:underline" href={`/orders?q=${r.phone}&from=2020-01-01`}>{r.name ?? "-"}</Link></td>
                <td><a className="text-accent hover:underline" href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer">{r.phone}</a></td>
                <td>{r.regency}<div className="text-xs text-muted">{r.province}</div></td>
                <td className="num">{num(r.totalOrder)}</td>
                <td className="whitespace-nowrap">{tanggal(r.lastOrderDate)}</td>
                <td className="num">{r.lastOrderDate ? `${daysBetween(r.lastOrderDate, today)} hr` : "-"}</td>
                <td className="max-w-64 text-xs text-muted">{r.productConsume}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty>Belum ada data customer. Impor &quot;Customer List&quot; dari Globemerce di menu Impor file.</Empty>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{num(n)} customer</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 && <Link className="btn-ghost" href={qs({ page: page - 1 })}>‹ Sebelumnya</Link>}
            <span className="text-muted">Halaman {page} / {pages}</span>
            {page < pages && <Link className="btn-ghost" href={qs({ page: page + 1 })}>Berikutnya ›</Link>}
          </div>
        )}
      </div>
    </>
  );
}
