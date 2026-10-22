/** Akses nilai di payload JSON lewat path seperti "data.customer.phone" atau "items[0].name". */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((acc, k) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

/** Semua path daun dalam payload — ditampilkan sebagai pilihan saat memetakan. */
export function listPaths(obj: unknown, prefix = "", out: { path: string; sample: string }[] = []) {
  if (out.length > 300) return out;
  if (Array.isArray(obj)) obj.slice(0, 3).forEach((v, i) => listPaths(v, `${prefix}[${i}]`, out));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) listPaths(v, prefix ? `${prefix}.${k}` : k, out);
  else out.push({ path: prefix, sample: String(obj ?? "").slice(0, 60) });
  return out;
}
