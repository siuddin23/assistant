import type { ShipStatus } from "@/db/schema";
import { SHIP_STATUS_LABEL } from "@/lib/shipping";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-danger" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const SHIP_TONE: Record<ShipStatus, string> = {
  belum_kirim: "bg-gray-100 text-gray-700",
  dalam_perjalanan: "bg-blue-50 text-blue-700",
  terkirim: "bg-emerald-50 text-emerald-700",
  gagal: "bg-amber-50 text-amber-800",
  retur: "bg-red-50 text-red-700",
  batal: "bg-gray-100 text-gray-500",
};

export function ShipBadge({ status }: { status: ShipStatus }) {
  return <span className={`badge ${SHIP_TONE[status]}`}>{SHIP_STATUS_LABEL[status]}</span>;
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "red" | "amber" | "blue" }) {
  const t = { gray: "bg-gray-100 text-gray-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-800", blue: "bg-blue-50 text-blue-700" }[tone];
  return <span className={`badge ${t}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
