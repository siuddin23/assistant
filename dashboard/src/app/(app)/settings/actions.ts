"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { parseIdr } from "@/lib/parse";

export async function addUser(_: unknown, form: FormData): Promise<{ error?: string; ok?: string }> {
  await requireUser(["admin"]);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role")) as "admin" | "cs" | "viewer";
  if (!email || !name) return { error: "Nama dan email wajib diisi" };
  if (password.length < 8) return { error: "Password minimal 8 karakter" };
  if (!schema.roleEnum.enumValues.includes(role)) return { error: "Role tidak valid" };
  const csCode = String(form.get("csCode") ?? "").trim().toUpperCase() || null;
  try {
    await db.insert(schema.users).values({ email, name, role, csCode, passwordHash: await bcrypt.hash(password, 10) });
  } catch {
    return { error: "Email sudah terdaftar" };
  }
  revalidatePath("/settings");
  return { ok: `User ${email} dibuat` };
}

export async function updateUser(form: FormData) {
  const me = await requireUser(["admin"]);
  const id = Number(form.get("id"));
  const role = String(form.get("role")) as "admin" | "cs" | "viewer";
  const active = form.get("active") === "on";
  if (id === me.id && (!active || role !== "admin")) return; // jangan kunci diri sendiri
  const password = String(form.get("password") ?? "");
  await db.update(schema.users).set({
    role: schema.roleEnum.enumValues.includes(role) ? role : undefined,
    csCode: String(form.get("csCode") ?? "").trim().toUpperCase() || null,
    active,
    ...(password.length >= 8 ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
  }).where(eq(schema.users.id, id));
  revalidatePath("/settings");
}

export async function saveCs(form: FormData) {
  await requireUser(["admin"]);
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim() || code;
  if (!code) return;
  const active = form.get("active") !== "off";
  await db.insert(schema.csAgents).values({ code, name, active }).onConflictDoUpdate({ target: schema.csAgents.code, set: { name, active } });
  revalidatePath("/settings");
}

export async function saveProduct(form: FormData) {
  await requireUser(["admin"]);
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim() || code;
  if (!code) return;
  const price = parseIdr(form.get("price")) || null;
  const active = form.get("active") !== "off";
  await db.insert(schema.products).values({ code, name, price, active }).onConflictDoUpdate({ target: schema.products.code, set: { name, price, active } });
  revalidatePath("/settings");
}
