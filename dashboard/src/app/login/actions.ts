"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/lib/session";

export async function login(_: unknown, form: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Tetap jalankan bcrypt walau user tidak ada, supaya waktu respons tidak membocorkan email terdaftar.
  const ok = await bcrypt.compare(password, u?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!u || !ok || !u.active) return { error: "Email atau password salah", email };
  const token = await signSession({ id: u.id, name: u.name, email: u.email, role: u.role, csCode: u.csCode });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
