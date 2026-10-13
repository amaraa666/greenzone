import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "gz_admin";

function adminPassword() {
  return process.env["ADMIN_PASSWORD"] ?? "";
}

function sign(payload: string) {
  return createHmac("sha256", adminPassword()).update(payload).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdmin() {
  const password = adminPassword();
  if (!password) return false;

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;

  const [payload, signature] = raw.split(".");
  if (payload !== "ok" || !signature) return false;
  return safeEqual(signature, sign(payload));
}

export async function createAdminSession() {
  const jar = await cookies();
  jar.set(COOKIE, `ok.${sign("ok")}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function passwordMatches(input: string) {
  const password = adminPassword();
  if (!password) return false;
  return safeEqual(input, password);
}

export function hasAdminPassword() {
  return adminPassword().length > 0;
}
