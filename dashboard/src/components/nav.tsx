"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/db/schema";

const ITEMS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Order" },
  { href: "/shipping", label: "Pengiriman" },
  { href: "/returns", label: "Retur & gagal kirim" },
  { href: "/reconciliation", label: "Rekonsiliasi COD", roles: ["admin", "viewer"] },
  { href: "/import", label: "Impor file", roles: ["admin"] },
  { href: "/integrations", label: "Integrasi", roles: ["admin"] },
  { href: "/settings", label: "Pengaturan", roles: ["admin"] },
];

export function Nav({ role, name, logout }: { role: Role; name: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = ITEMS.filter((i) => !i.roles || i.roles.includes(role));
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 md:hidden">
        <span className="font-semibold">Glowlab</span>
        <button className="btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
      </div>
      <aside className={`${open ? "block" : "hidden"} border-b border-line bg-panel md:sticky md:top-0 md:block md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0`}>
        <div className="hidden px-5 py-5 md:block">
          <div className="font-semibold">Glowlab</div>
          <div className="text-xs text-muted">Dashboard operasional</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 pb-3">
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm ${active(i.href) ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-bg"}`}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line px-5 py-4 text-sm md:absolute md:bottom-0 md:w-full">
          <div className="truncate font-medium">{name}</div>
          <div className="mb-2 text-xs text-muted capitalize">{role}</div>
          <form action={logout}><button className="text-xs text-muted underline">Keluar</button></form>
        </div>
      </aside>
    </>
  );
}
