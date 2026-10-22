"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canEdit, requireUser } from "@/lib/auth";
import { normalizeAwb, normalizePhone, parseIdr } from "@/lib/parse";

const OrderForm = z.object({
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal wajib diisi"),
  csCode: z.string().trim().toUpperCase().optional(),
  customerName: z.string().trim().min(1, "Nama customer wajib diisi"),
  customerPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  productType: z.string().trim().toUpperCase().optional(),
  paymentMethod: z.enum(["TF", "COD", "QR", "CC"]),
  category: z.enum(["O", "F", "R"]),
  omzet: z.string().transform(parseIdr).refine((v) => v > 0, "Omzet harus lebih dari 0"),
  courier: z.string().trim().optional(),
  shippingCost: z.string().optional().transform((v) => (v ? parseIdr(v) : null)),
  awb: z.string().optional(),
  shipStatus: z.enum(schema.shipStatusEnum.enumValues),
  notes: z.string().trim().optional(),
});

export type FormState = { error?: string };

const empty = (v?: string | null) => (v ? v : null);

export async function saveOrder(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canEdit(user)) return { error: "Anda tidak punya akses mengubah order" };
  const parsed = OrderForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const id = Number(form.get("id") || 0);

  const items = [...form.entries()]
    .filter(([k, val]) => k.startsWith("item_") && Number(val) > 0)
    .map(([k, val]) => ({ productCode: k.slice(5), qty: Math.round(Number(val)) }));

  const values = {
    orderDate: v.orderDate,
    csCode: empty(v.csCode) ?? user.csCode,
    customerName: v.customerName,
    customerPhone: normalizePhone(v.customerPhone),
    address: empty(v.address),
    city: empty(v.city),
    productType: empty(v.productType),
    paymentMethod: v.paymentMethod,
    category: v.category,
    omzet: v.omzet,
    courier: empty(v.courier),
    shippingCost: v.shippingCost,
    awb: normalizeAwb(v.awb),
    shipStatus: v.shipStatus,
    notes: empty(v.notes),
  };

  let orderId = id;
  await db.transaction(async (tx) => {
    if (id) {
      const [cur] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id));
      if (!cur) throw new Error("Order tidak ditemukan");
      const statusChanged = cur.shipStatus !== v.shipStatus;
      await tx.update(schema.orders).set({
        ...values,
        editedInApp: true,
        updatedAt: new Date(),
        ...(statusChanged ? { shipStatusAt: new Date(), shipStatusRaw: "diubah manual" } : {}),
      }).where(eq(schema.orders.id, id));
    } else {
      const [created] = await tx.insert(schema.orders).values({
        ...values, source: "manual", createdBy: user.id, editedInApp: true, sourceRef: null,
      }).returning({ id: schema.orders.id });
      orderId = created.id;
    }
    await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    if (items.length) await tx.insert(schema.orderItems).values(items.map((i) => ({ ...i, orderId })));
  });

  revalidatePath("/orders");
  redirect(`/orders/${orderId}?saved=1`);
}

export async function deleteOrder(form: FormData) {
  const user = await requireUser(["admin"]);
  void user;
  await db.delete(schema.orders).where(eq(schema.orders.id, Number(form.get("id"))));
  revalidatePath("/orders");
  redirect("/orders");
}
