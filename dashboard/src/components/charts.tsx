"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Urutan warna tetap per entitas (divalidasi untuk buta warna): O biru, F oranye, R hijau-aqua.
export const CAT_COLORS = { O: "#2a78d6", F: "#eb6834", R: "#1baf7a", lain: "#9aa3af" } as const;
const LABELS = { O: "Order baru (O)", F: "Follow up (F)", R: "Repeat (R)", lain: "Tanpa kategori" } as const;

const short = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}M` : v >= 1e6 ? `${Math.round(v / 1e6)}jt` : v >= 1e3 ? `${Math.round(v / 1e3)}rb` : String(v));
const rp = (v: number) => `Rp${new Intl.NumberFormat("id-ID").format(v)}`;

type Day = { date: string; O: number; F: number; R: number; lain: number; orders: number; spend: number };

export function DailyOmzetChart({ data }: { data: Day[] }) {
  const keys = (["O", "F", "R", "lain"] as const).filter((k) => data.some((d) => d[k] > 0));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="#eceef1" />
          <XAxis dataKey="date" tickFormatter={(d: string) => String(Number(d.slice(8)))} tick={{ fontSize: 11, fill: "#677285" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: "#677285" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as Day;
              const total = d.O + d.F + d.R + d.lain;
              return (
                <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1 font-medium">{String(label)}</div>
                  {keys.map((k) => (
                    <div key={k} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5"><i className="inline-block size-2 rounded-sm" style={{ background: CAT_COLORS[k] }} />{LABELS[k]}</span>
                      <span className="tabular-nums">{rp(d[k])}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-medium"><span>Total ({d.orders} order)</span><span className="tabular-nums">{rp(total)}</span></div>
                  {d.spend > 0 && <div className="flex justify-between gap-4 text-muted"><span>Spend iklan</span><span className="tabular-nums">{rp(d.spend)}</span></div>}
                </div>
              );
            }}
          />
          <Legend itemSorter={(item) => ["O", "F", "R", "lain"].indexOf(String(item.dataKey))} formatter={(v: string) => <span className="text-xs text-ink">{LABELS[v as keyof typeof LABELS]}</span>} iconType="square" iconSize={10} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="omzet" fill={CAT_COLORS[k]} stroke="#ffffff" strokeWidth={1}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
