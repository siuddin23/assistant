"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canEdit, requireUser } from "@/lib/auth";
import { parseIdr } from "@/lib/parse";

export async function createReturn(form: FormData) {
  const user = await requireUser();
  if (!canEdit(user)) return;
  const orderId = Number(form.get("orderId"));
  const kind = form.get("kind") === "retur" ? "retur" : "gagal_kirim";
  const [r] = await db.insert(schema.returns).values({ orderId, kind, reason: String(form.get("reason") ?? "") || null }).returning({ id: schema.returns.id });
  revalidatePath("/returns");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/returns?focus=${r.id}`);
}

export async function updateReturn(form: FormData) {
  const user = await requireUser();
  if (!canEdit(user)) return;
  const id = Number(form.get("id"));
  const status = String(form.get("status")) as (typeof schema.returnStatusEnum.enumValues)[number];
  if (!schema.returnStatusEnum.enumValues.includes(status)) return;
  const kind = form.get("kind") === "retur" ? "retur" : "gagal_kirim";
  await db.update(schema.returns).set({
    status,
    kind,
    reason: String(form.get("reason") ?? "") || null,
    notes: String(form.get("notes") ?? "") || null,
    returnCost: parseIdr(form.get("returnCost")) || null,
    resolvedAt: status === "selesai" ? new Date() : null,
  }).where(eq(schema.returns.id, id));
  revalidatePath("/returns");
}
