"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { NotifyMail } from "@/components/notify-mail";
import { TeamRegistration } from "@/components/team-registration";
import { TimeLimitEditor } from "@/components/time-limit";
import { approveReport, loginAdmin, logoutAdmin, markReportFixed, rejectReport, suggestReportMilestone } from "@/lib/actions";
import { formatWhen } from "@/lib/format";
import { parsePlace } from "@/lib/location";
import { SEVERITY_POINTS } from "@/lib/points";
import { SEVERITIES, type ReportCard, type ReportStatus, type Severity, type TeamStanding } from "@/lib/types";

const FILTERS: Array<ReportStatus | "All"> = ["Pending", "Verified", "Fixed", "Rejected", "All"];

export function AdminLogin({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    const result = await loginAdmin(password);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md rounded-3xl border border-line bg-paper p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">Facilities desk</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Admin</h1>
      <p className="mt-2 text-sm leading-6 text-moss">
        Choose a milestone on each pending report, then accept it to award those points. Rejecting a report reverses confirmations already paid.
      </p>
      {!configured ? (
        <p className="mt-4 rounded-2xl bg-[#fdf4f0] px-4 py-3 text-sm text-clay">
          Supabase is not configured yet. You can still set the admin password, but reviews need the database.
        </p>
      ) : null}
      <label className="mt-5 block text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-2xl border border-line bg-sand px-4 py-3 outline-none"
        />
      </label>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-full bg-canopy-deep px-4 py-3 text-sm font-semibold text-paper disabled:opacity-50"
      >
        {pending ? "Checking…" : "Open the desk"}
      </button>
    </form>
  );
}

export function AdminDashboard({
  reports,
  teams,
  deadline,
  notifyEmail,
  gmailReady,
  error,
  canScan,
}: {
  reports: ReportCard[];
  teams: TeamStanding[];
  deadline: string | null;
  notifyEmail: string | null;
  gmailReady: boolean;
  error: string | null;
  canScan: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ReportStatus | "All">("Pending");
  const [apartment, setApartment] = useState("All");
  const [room, setRoom] = useState("All");
  const [category, setCategory] = useState("All");
  const [severity, setSeverity] = useState<Severity | "All">("All");
  const [team, setTeam] = useState("All");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(error);
  const [zoom, setZoom] = useState<{ report: ReportCard; index: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [chosen, setChosen] = useState<Record<string, Severity>>({});
  const [scanNote, setScanNote] = useState<Record<string, string>>({});
  const [scanningId, setScanningId] = useState<string | null>(null);

  useEffect(() => {
    if (!zoom) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setZoom(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const places = reports.map((report) => ({ report, ...placeOf(report) }));
  const apartmentOptions = uniqueSorted(places.map((item) => item.apartment));
  const roomOptions = uniqueSorted(
    places.filter((item) => apartment === "All" || item.apartment === apartment).map((item) => item.room),
  );
  const categoryOptions = uniqueSorted(reports.map((report) => report.category));
  const teamOptions = uniqueSorted(reports.map((report) => report.teamName));
  const roomFilter = room !== "All" && roomOptions.includes(room) ? room : "All";
  const needle = query.trim().toLowerCase();

  const narrowed = places.filter((item) => {
    if (apartment !== "All" && item.apartment !== apartment) return false;
    if (roomFilter !== "All" && item.room !== roomFilter) return false;
    if (category !== "All" && item.report.category !== category) return false;
    const milestoneSet = item.report.status === "Verified" || item.report.status === "Fixed";
    if (severity !== "All" && milestoneSet && item.report.severity !== severity) return false;
    if (team !== "All" && item.report.teamName !== team) return false;
    if (!needle) return true;
    const haystack = [
      item.apartment,
      item.room,
      item.report.location,
      item.report.category,
      item.report.teamName,
      item.report.description,
      item.report.severity,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
  const matched = filter === "All" ? narrowed : narrowed.filter((item) => item.report.status === filter);
  const visible = matched.slice(0, 5);
  const filtersActive =
    apartment !== "All" || roomFilter !== "All" || category !== "All" || severity !== "All" || team !== "All" || needle.length > 0;

  async function run(id: string, action: "approve" | "reject" | "fix") {
    const milestone = chosen[id];
    if (action === "approve" && !milestone) {
      setNotice("Choose Low, Medium, or High before accepting.");
      return;
    }
    setBusyId(id);
    setNotice(null);
    const result =
      action === "approve"
        ? await approveReport(id, milestone ?? "")
        : action === "reject"
          ? await rejectReport(id)
          : await markReportFixed(id);
    setBusyId(null);
    if (!result.ok) {
      setNotice(result.error ?? "Could not update the report");
      return;
    }
    setZoom(null);
    const mailNote = "mailNote" in result ? result.mailNote : null;
    if (mailNote) setNotice(mailNote);
    router.refresh();
  }

  async function downloadExcel() {
    setExporting(true);
    setNotice(null);
    const response = await fetch("/admin/export");
    if (!response.ok) {
      setNotice(await response.text());
      setExporting(false);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const named = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
    link.href = url;
    link.download = named || "green-zone-reports.xlsx";
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  async function scan(id: string) {
    setScanningId(id);
    setNotice(null);
    const result = await suggestReportMilestone(id);
    setScanningId(null);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setChosen((current) => ({ ...current, [id]: result.severity }));
    setScanNote((current) => ({ ...current, [id]: result.note }));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">Facilities desk</p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">Admin</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            void logoutAdmin().then(() => router.refresh());
          }}
          className="rounded-full border border-line bg-paper px-4 py-2 text-sm"
        >
          Sign out
        </button>
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        <a href="#teams" className="rounded-full bg-paper px-3 py-1.5">
          Register a team
        </a>
        <a href="#reports" className="rounded-full bg-paper px-3 py-1.5">
          Review photos
        </a>
      </div>

      <div className="mt-6">
        <TimeLimitEditor deadline={deadline} />
      </div>

      <div className="mt-6">
        <NotifyMail email={notifyEmail} gmailReady={gmailReady} />
      </div>

      <div className="mt-6">
        <TeamRegistration teams={teams} />
      </div>

      <div id="reports" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl tracking-tight">Review reports</h2>
            <p className="text-xs text-moss">
              {matched.length > 5 ? `Latest 5 of ${matched.length}.` : `${visible.length} shown.`}
              {filter === "Pending"
                ? " Open a photo, then accept or reject."
                : " Tap a thumbnail to inspect the photo."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setApartment("All");
                setRoom("All");
                setCategory("All");
                setSeverity("All");
                setTeam("All");
                setQuery("");
              }}
              className="rounded-full border border-line bg-paper px-3 py-1 text-xs"
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void downloadExcel()}
            disabled={exporting || reports.length === 0}
            className="rounded-full bg-canopy-deep px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
          >
            {exporting ? "Preparing Excel…" : "Download Excel"}
          </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const count = item === "All" ? narrowed.length : narrowed.filter((entry) => entry.report.status === item).length;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  filter === item ? "bg-canopy-deep text-paper" : "bg-paper text-ink"
                }`}
              >
                {item} · {count}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            label="Apartment"
            value={apartment}
            options={apartmentOptions}
            onChange={(value) => {
              setApartment(value);
              setRoom("All");
            }}
          />
          <FilterSelect label="Room" value={roomFilter} options={roomOptions} onChange={setRoom} />
          <FilterSelect label="Category" value={category} options={categoryOptions} onChange={setCategory} />
          <FilterSelect
            label="Severity"
            value={severity}
            options={[...SEVERITIES]}
            onChange={(value) => setSeverity(value as Severity | "All")}
          />
          <FilterSelect label="Team" value={team} options={teamOptions} onChange={setTeam} />
          <label className="block min-w-0 text-xs font-medium text-moss">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Room, note…"
              className="mt-1 w-full rounded-xl border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none"
            />
          </label>
        </div>
      </div>

      {notice ? <p className="mt-4 rounded-2xl bg-[#fdf4f0] px-4 py-3 text-sm text-clay">{notice}</p> : null}

      {visible.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-line bg-paper px-4 py-6 text-sm text-moss">
          {filtersActive
            ? "No reports match these filters."
            : filter === "All"
              ? "Nothing in the queue right now."
              : `Nothing ${filter.toLowerCase()} right now.`}
        </p>
      ) : (
        <ul className={`mt-3 grid gap-3 ${filter === "Pending" ? "" : "lg:grid-cols-2"}`}>
          {visible.map(({ report, apartment: reportApartment, room: reportRoom }) =>
            report.status === "Pending" ? (
              <li key={report.id} className="overflow-hidden rounded-3xl border border-line bg-paper sm:grid sm:grid-cols-[17rem_1fr] lg:col-span-2">
                {report.imageUrls.length > 0 ? (
                  <div className="bg-[#10261c]">
                    <button type="button" onClick={() => setZoom({ report, index: 0 })} className="block w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={report.imageUrls[0]}
                        alt={`Damage at ${report.location}`}
                        className="h-64 w-full object-contain sm:h-72"
                      />
                    </button>
                    {report.imageUrls.length > 1 ? (
                      <div className="flex gap-2 p-2">
                        {report.imageUrls.map((url, index) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setZoom({ report, index })}
                            className="h-14 w-14 overflow-hidden rounded-lg"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Photo ${index + 1} at ${report.location}`} className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center bg-sand text-sm text-moss">No photo was attached.</div>
                )}
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={report.status} />
                    <span className="text-xs text-moss">{formatWhen(report.createdAt)}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-3xl tracking-tight">{reportRoom}</h3>
                    <p className="text-sm text-moss">
                      {reportApartment} · {report.category} · {report.teamName}
                    </p>
                  </div>
                  <p className="text-sm leading-6">{report.description}</p>
                  <MilestonePicker
                    value={chosen[report.id] ?? null}
                    note={scanNote[report.id] ?? null}
                    scanning={scanningId === report.id}
                    canScan={canScan && report.imageUrls.length > 0}
                    disabled={busyId === report.id}
                    onChange={(severity) => setChosen((current) => ({ ...current, [report.id]: severity }))}
                    onScan={() => scan(report.id)}
                  />
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === report.id || !chosen[report.id]}
                      onClick={() => run(report.id, "approve")}
                      className="rounded-full bg-canopy-deep px-5 py-3 text-sm font-semibold text-paper disabled:opacity-50"
                    >
                      {chosen[report.id] ? `Accept · ${SEVERITY_POINTS[chosen[report.id]]} pts` : "Choose a milestone"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => run(report.id, "reject")}
                      className="rounded-full border border-clay px-5 py-3 text-sm font-semibold text-clay disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </li>
            ) : (
            <li key={report.id} className="flex min-w-0 gap-2.5 rounded-2xl border border-line bg-paper p-2">
              {report.imageUrls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setZoom({ report, index: 0 })}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#10261c]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.imageUrls[0]}
                    alt={`Damage at ${report.location}`}
                    className="h-full w-full object-cover"
                  />
                  {report.imageUrls.length > 1 ? (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-ink/80 px-1 text-[10px] font-semibold text-paper">
                      {report.imageUrls.length}
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-sand text-[10px] text-moss">
                  No photo
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{reportRoom}</p>
                    <p className="truncate text-xs text-moss">
                      {reportApartment} · {report.category} · {report.teamName}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <StatusBadge status={report.status} />
                    {report.status === "Verified" || report.status === "Fixed" ? (
                      <SeverityBadge severity={report.severity} />
                    ) : null}
                  </div>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink">{report.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-moss">{formatWhen(report.createdAt)}</span>
                  {report.status === "Verified" ? (
                    <button
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => run(report.id, "fix")}
                      className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-paper disabled:opacity-50"
                    >
                      Mark repaired
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
            ),
          )}
        </ul>
      )}

      {zoom && zoom.report.imageUrls[zoom.index] ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#07140f] p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo of damage at ${zoom.report.location}`}
        >
          <div className="flex items-start justify-between gap-3 text-paper">
            <div>
              <p className="font-display text-2xl">{zoom.report.location}</p>
              <p className="text-sm text-lime">
                {placeOf(zoom.report).apartment} · {zoom.report.category}
                {zoom.report.status === "Verified" || zoom.report.status === "Fixed" ? ` · ${zoom.report.severity}` : ""}
                {" · "}photo {zoom.index + 1} of {zoom.report.imageUrls.length} · {zoom.report.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setZoom(null)}
              className="shrink-0 rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink"
            >
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom.report.imageUrls[zoom.index]}
            alt={`Full photo ${zoom.index + 1} of damage at ${zoom.report.location}`}
            className="mt-3 min-h-0 w-full flex-1 object-contain"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {zoom.report.imageUrls.length > 1
              ? zoom.report.imageUrls.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setZoom({ report: zoom.report, index })}
                    className={`rounded-full px-3 py-1.5 text-sm ${index === zoom.index ? "bg-lime text-ink" : "bg-paper/15 text-paper"}`}
                  >
                    Photo {index + 1}
                  </button>
                ))
              : null}
            {zoom.report.status === "Pending" ? (
              <div className="mt-3 rounded-2xl bg-paper p-3 text-ink">
                <MilestonePicker
                  value={chosen[zoom.report.id] ?? null}
                  note={scanNote[zoom.report.id] ?? null}
                  scanning={scanningId === zoom.report.id}
                  canScan={canScan && zoom.report.imageUrls.length > 0}
                  disabled={busyId === zoom.report.id}
                  onChange={(severity) => setChosen((current) => ({ ...current, [zoom.report.id]: severity }))}
                  onScan={() => scan(zoom.report.id)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === zoom.report.id || !chosen[zoom.report.id]}
                    onClick={() => run(zoom.report.id, "approve")}
                    className="rounded-full bg-canopy-deep px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
                  >
                    {chosen[zoom.report.id]
                      ? `Accept · ${SEVERITY_POINTS[chosen[zoom.report.id]]} pts`
                      : "Choose a milestone"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === zoom.report.id}
                    onClick={() => run(zoom.report.id, "reject")}
                    className="rounded-full border border-clay px-4 py-2 text-sm font-semibold text-clay disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
            {zoom.report.status === "Verified" ? (
              <button
                type="button"
                disabled={busyId === zoom.report.id}
                onClick={() => run(zoom.report.id, "fix")}
                className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
              >
                Mark repaired
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MilestonePicker({
  value,
  note,
  scanning,
  canScan,
  disabled,
  onChange,
  onScan,
}: {
  value: Severity | null;
  note: string | null;
  scanning: boolean;
  canScan: boolean;
  disabled: boolean;
  onChange: (severity: Severity) => void;
  onScan: () => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Milestone</legend>
      <p className="mt-1 text-xs text-moss">
        {scanning ? "Scanning the photo…" : note ? note : "Points are awarded only from the milestone you select."}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SEVERITIES.map((severity) => (
          <button
            key={severity}
            type="button"
            disabled={disabled}
            onClick={() => onChange(severity)}
            className={`rounded-2xl border px-2 py-2 text-left disabled:opacity-50 ${
              value === severity ? "border-canopy-deep bg-mist" : "border-line bg-sand"
            }`}
          >
            <span className="block text-sm font-semibold">{severity}</span>
            <span className="font-display text-2xl leading-none">{SEVERITY_POINTS[severity]}</span>
          </button>
        ))}
      </div>
      {canScan ? (
        <button
          type="button"
          disabled={disabled || scanning}
          onClick={onScan}
          className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {scanning ? "Scanning…" : "Scan photo for a suggestion"}
        </button>
      ) : null}
    </fieldset>
  );
}

function placeOf(report: ReportCard) {
  const place = parsePlace(report.location);
  return {
    apartment: place.apartment || "Unspecified",
    room: place.room || report.location,
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-moss">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none"
      >
        <option value="All">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
