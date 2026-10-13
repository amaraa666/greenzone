import { Suspense } from "react";
import Link from "next/link";
import { ReportForm } from "@/components/report-form";
import { TeamRegistration } from "@/components/team-registration";
import { TimeLimitBanner } from "@/components/time-limit";
import { readReportDeadline } from "@/lib/deadline";
import { fetchLeaderboard, fetchOpenReport } from "@/lib/queries";

export const metadata = {
  title: "File a report",
};

export default function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string | string[]; view?: string | string[] }>;
}) {
  return (
    <main className="mx-auto w-full min-w-0 max-w-lg px-4 py-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-paper" />}>
        <ReportGate searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReportGate({
  searchParams,
}: {
  searchParams: Promise<{ location?: string | string[]; view?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = params.location;
  const viewRaw = params.view;
  const location = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  const view = (Array.isArray(viewRaw) ? viewRaw[0] : viewRaw) === "register" ? "register" : "report";
  const [open, standings, deadline] = await Promise.all([
    location && view === "report" ? fetchOpenReport(location) : Promise.resolve({ report: null, error: null }),
    fetchLeaderboard(),
    readReportDeadline(),
  ]);
  const initiallyClosed = deadline.deadline ? Date.parse(deadline.deadline) <= Date.now() : false;
  const reportHref = sectionHref("report", location);

  return (
    <div className="space-y-4">
      <DeskSections view={view} location={location} />
      {view === "report" && deadline.deadline ? <TimeLimitBanner deadline={deadline.deadline} /> : null}
      {view === "register" ? (
        <TeamRegistration
          teams={standings.teams}
          showRoster={false}
          remember
          id="register"
          reportHref={reportHref}
        />
      ) : (
        <ReportForm
          teams={standings.teams.map((team) => ({ id: team.id, teamName: team.teamName }))}
          initialLocation={location}
          initialOpenReport={open.report}
          loadError={open.error ?? standings.error}
          deadline={deadline.deadline}
          initiallyClosed={initiallyClosed}
        />
      )}
      {standings.error && view === "register" ? <p className="text-sm text-clay">{standings.error}</p> : null}
    </div>
  );
}

function sectionHref(view: "report" | "register", location: string) {
  const params = new URLSearchParams();
  if (view === "register") params.set("view", "register");
  if (location) params.set("location", location);
  const query = params.toString();
  return query ? `/report?${query}` : "/report";
}

function DeskSections({ view, location }: { view: "report" | "register"; location: string }) {
  const items = [
    ["register", "Багаа бүртгүүлэх", sectionHref("register", location)],
    ["report", "Мэдээллэх хэсэг", sectionHref("report", location)],
  ] as const;

  return (
    <div className="grid grid-cols-2 rounded-full border border-line bg-paper p-1 text-sm font-semibold">
      {items.map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          aria-current={view === id ? "page" : undefined}
          className={
            view === id
              ? "rounded-full bg-canopy-deep px-4 py-2 text-center text-paper"
              : "rounded-full px-4 py-2 text-center text-moss"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
