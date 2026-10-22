"use server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { processWebhookEvents, WEBHOOK_FIELDS, WEBHOOK_KIND } from "@/lib/globemerce";
import { syncSpreadsheet, type SyncStats } from "@/lib/sheet-sync";
import { MONTH_TABS } from "@/lib/sheet";

export async function syncNow(_: unknown, form: FormData): Promise<{ ok?: SyncStats[]; error?: string }> {
  const user = await requireUser(["admin"]);
  const tabs = form.getAll("tab").map(String).filter((t) => MONTH_TABS.includes(t));
  try {
    const ok = await syncSpreadsheet(tabs, user.id);
    revalidatePath("/", "layout");
    return { ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveWebhookMapping(form: FormData) {
  await requireUser(["admin"]);
  const mapping = Object.fromEntries(WEBHOOK_FIELDS.map((f) => [f.key, String(form.get(f.key) ?? "")]).filter(([, v]) => v));
  await db.insert(schema.importMappings)
    .values({ kind: WEBHOOK_KIND, name: "default", mapping })
    .onConflictDoUpdate({ target: [schema.importMappings.kind, schema.importMappings.name], set: { mapping, updatedAt: new Date() } });
  await processWebhookEvents();
  revalidatePath("/integrations");
}

export async function reprocessWebhooks() {
  await requireUser(["admin"]);
  await processWebhookEvents();
  revalidatePath("/integrations");
}
