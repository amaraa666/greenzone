import "server-only";
import { getSupabase, SETUP_MESSAGE } from "@/lib/supabase";

const PATH = "desk/deadline.json";

type StoredDeadline = { deadline?: unknown };

export async function readReportDeadline(): Promise<{ deadline: string | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { deadline: null, error: SETUP_MESSAGE };

  const file = await supabase.storage.from("report-images").download(PATH);
  if (file.error) {
    if (/not found|404/i.test(file.error.message)) return { deadline: null, error: null };
    return { deadline: null, error: file.error.message };
  }

  try {
    const parsed = JSON.parse(await file.data.text()) as StoredDeadline;
    if (typeof parsed.deadline !== "string") return { deadline: null, error: null };
    const time = Date.parse(parsed.deadline);
    if (!Number.isFinite(time)) return { deadline: null, error: null };
    return { deadline: new Date(time).toISOString(), error: null };
  } catch {
    return { deadline: null, error: null };
  }
}

export async function writeReportDeadline(deadline: string | null): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: SETUP_MESSAGE };

  const body = Buffer.from(JSON.stringify({ deadline }));
  const saved = await supabase.storage.from("report-images").upload(PATH, body, {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (saved.error) return { error: saved.error.message };
  return { error: null };
}
