import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";

/** User yang sedang login, dicek ulang ke DB supaya user nonaktif langsung terkunci. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.id));
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, csCode: u.csCode };
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/?forbidden=1");
  return user;
}

export const canEdit = (u: SessionUser) => u.role === "admin" || u.role === "cs";
