"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { saveReportDeadline } from "@/lib/actions";

const SERVER_CLOCK = 0;
let clientNow = 0;

function subscribe(onStoreChange: () => void) {
  const id = window.setInterval(() => {
    clientNow = Date.now();
    onStoreChange();
  }, 1000);
  return () => window.clearInterval(id);
}

function getClientNow() {
  if (clientNow === 0) clientNow = Date.now();
  return clientNow;
}

export function useNow() {
  return useSyncExternalStore(subscribe, getClientNow, () => SERVER_CLOCK);
}

export function remainingMs(deadline: string | null, now: number) {
  if (!deadline || now === 0) return null;
  const ends = Date.parse(deadline);
  if (!Number.isFinite(ends)) return null;
  return ends - now;
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function TimeLimitBanner({ deadline }: { deadline: string }) {
  const now = useNow();
  const left = remainingMs(deadline, now);
  const ended = left !== null && left <= 0;

  return (
    <section className="flex items-center justify-between gap-4 rounded-3xl bg-canopy-deep px-5 py-4 text-paper">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">Time left</p>
        <p className="mt-1 text-sm text-lime">
          {ended ? "Reporting is closed." : "File a report before this hits zero."}
        </p>
      </div>
      <p className="font-display text-4xl tabular-nums tracking-tight">{left === null ? "—" : formatClock(left)}</p>
    </section>
  );
}

const PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];

function toLocalValue(deadline: string | null) {
  if (!deadline) return "";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TimeLimitEditor({ deadline }: { deadline: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(toLocalValue(deadline));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(toLocalValue(deadline));
  }, [deadline]);

  async function save(next: string | null) {
    setPending(true);
    setError(null);
    const result = await saveReportDeadline(next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValue(next ? toLocalValue(next) : "");
    router.refresh();
  }

  return (
    <section className="rounded-3xl border border-line bg-paper p-4">
      <h2 className="font-display text-2xl tracking-tight">Time limit</h2>
      <p className="mt-1 text-sm text-moss">
        Set an end time and students see a countdown. No limit leaves reporting open.
      </p>
      <div className="mt-4">
        {deadline ? (
          <TimeLimitBanner deadline={deadline} />
        ) : (
          <p className="text-sm text-moss">No limit set. Students can report any time.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void save(null)}
          className={`rounded-full px-3 py-1.5 text-sm disabled:opacity-50 ${
            deadline ? "bg-sand" : "bg-canopy-deep text-paper"
          }`}
        >
          No limit
        </button>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={pending}
            onClick={() => void save(new Date(Date.now() + preset.minutes * 60_000).toISOString())}
            className="rounded-full bg-sand px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium">
        End time
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 w-full rounded-2xl border border-line bg-sand px-4 py-3 outline-none"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !value}
          onClick={() => void save(new Date(value).toISOString())}
          className="rounded-full bg-canopy-deep px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save end time"}
        </button>
      </div>
    </section>
  );
}
