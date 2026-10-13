"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resendVerifiedMail, saveNotifyEmail } from "@/lib/actions";

export function NotifyMail({ email, gmailReady }: { email: string | null; gmailReady: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(email ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setValue(email ?? "");
  }, [email]);

  async function save(next: string) {
    setPending(true);
    setError(null);
    setNote(null);
    const result = await saveNotifyEmail(next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function resend() {
    setPending(true);
    setError(null);
    setNote(null);
    const result = await resendVerifiedMail();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote(result.note);
  }

  return (
    <section className="rounded-3xl border border-line bg-paper p-4">
      <h2 className="font-display text-2xl tracking-tight">Mail</h2>
      <p className="mt-1 text-sm text-moss">
        When a report is verified, this address receives the location and the photos. Resend sends every verified and repaired report again.
      </p>
      {gmailReady ? (
        <p className="mt-2 text-sm text-moss">Mail sends from the Gmail account on the server.</p>
      ) : (
        <p className="mt-2 text-sm text-clay">
          Add GMAIL_USER and GMAIL_APP_PASSWORD before mail can leave this desk. Use a Gmail app password.
        </p>
      )}
      <label className="mt-4 block text-sm font-medium">
        Send verified reports to
        <input
          type="email"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="facilities@school.edu"
          autoComplete="email"
          className="mt-1 w-full rounded-2xl border border-line bg-sand px-4 py-3 outline-none"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      {note ? <p className="mt-3 rounded-2xl bg-lime px-4 py-3 text-sm font-medium text-ink">{note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || value.trim().toLowerCase() === (email ?? "")}
          onClick={() => void save(value)}
          className="rounded-full bg-canopy-deep px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save address"}
        </button>
        <button
          type="button"
          disabled={pending || !email || !gmailReady}
          onClick={() => void resend()}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {pending ? "Sending…" : "Resend verified"}
        </button>
        <button
          type="button"
          disabled={pending || !email}
          onClick={() => void save("")}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Stop mail
        </button>
      </div>
    </section>
  );
}
