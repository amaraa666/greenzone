import "server-only";
import { getSupabase, SETUP_MESSAGE } from "@/lib/supabase";

const PATH = "desk/notify.json";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StoredNotify = { email?: unknown };

export function isNotifyEmail(value: string) {
  return EMAIL_PATTERN.test(value);
}

export async function readNotifyEmail(): Promise<{ email: string | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { email: null, error: SETUP_MESSAGE };

  const file = await supabase.storage.from("report-images").download(PATH);
  if (file.error) {
    if (/not found|404/i.test(file.error.message)) return { email: null, error: null };
    return { email: null, error: file.error.message };
  }

  try {
    const parsed = JSON.parse(await file.data.text()) as StoredNotify;
    if (typeof parsed.email !== "string") return { email: null, error: null };
    const email = parsed.email.trim().toLowerCase();
    if (!isNotifyEmail(email)) return { email: null, error: null };
    return { email, error: null };
  } catch {
    return { email: null, error: null };
  }
}

export async function writeNotifyEmail(email: string | null): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: SETUP_MESSAGE };

  const body = Buffer.from(JSON.stringify({ email }));
  const saved = await supabase.storage.from("report-images").upload(PATH, body, {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (saved.error) return { error: saved.error.message };
  return { error: null };
}
