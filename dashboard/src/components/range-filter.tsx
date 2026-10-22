"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filter rentang tanggal lewat query string (?from=&to=), plus pintasan cepat. */
export function RangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const go = (f: string, t: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("from", f);
    p.set("to", t);
    p.delete("page");
    router.push(`${path}?${p.toString()}`);
  };
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const shift = (days: number) => new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthEnd = shift(Number(today.slice(8, 10)));
  const presets: [string, string, string][] = [
    ["Hari ini", today, today],
    ["Kemarin", shift(1), shift(1)],
    ["7 hari", shift(6), today],
    ["Bulan ini", monthStart, today],
    ["Bulan lalu", `${prevMonthEnd.slice(0, 7)}-01`, prevMonthEnd],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(([label, f, t]) => (
        <button key={label} onClick={() => go(f, t)}
          className={`btn-ghost !px-2.5 !py-1.5 text-xs ${f === from && t === to ? "!border-accent text-accent" : ""}`}>{label}</button>
      ))}
      <input type="date" className="input !w-auto !py-1.5 text-xs" value={from} onChange={(e) => e.target.value && go(e.target.value, to)} aria-label="Dari tanggal" />
      <span className="text-xs text-muted">s/d</span>
      <input type="date" className="input !w-auto !py-1.5 text-xs" value={to} onChange={(e) => e.target.value && go(from, e.target.value)} aria-label="Sampai tanggal" />
    </div>
  );
}
