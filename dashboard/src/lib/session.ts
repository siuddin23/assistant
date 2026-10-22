/** Token sesi (JWT di cookie httpOnly). Dipakai juga oleh middleware (edge), jadi tanpa akses DB. */
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@/db/schema";

export const SESSION_COOKIE = "glowlab_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type SessionUser = { id: number; name: string; email: string; role: Role; csCode: string | null };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET belum diisi (minimal 32 karakter)");
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { id: payload.id as number, name: payload.name as string, email: payload.email as string, role: payload.role as Role, csCode: (payload.csCode as string) ?? null };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
