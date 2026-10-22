"use server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { applyImport, type ImportPayload, type ImportResult } from "@/lib/import-apply";
import { IMPORT_KINDS, missingRequired } from "@/lib/import-fields";

export async function runImport(p: ImportPayload, saveAs?: string): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  const user = await requireUser(["admin"]);
  if (!IMPORT_KINDS[p.kind]) return { ok: false, error: "Jenis impor tidak dikenal" };
  const missing = missingRequired(p.kind, p.mapping);
  if (missing.length) return { ok: false, error: `Kolom wajib belum dipetakan: ${missing.join(", ")}` };
  if (p.rows.length > 20000) return { ok: false, error: "Maksimal 20.000 baris per impor. Pecah file menjadi beberapa bagian." };
  try {
    if (saveAs) {
      await db.insert(schema.importMappings)
        .values({ kind: p.kind, name: saveAs, mapping: p.mapping })
        .onConflictDoUpdate({ target: [schema.importMappings.kind, schema.importMappings.name], set: { mapping: p.mapping, updatedAt: new Date() } });
    }
    const result = await applyImport(p, user.id);
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
