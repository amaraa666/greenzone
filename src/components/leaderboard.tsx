import Link from "next/link";
import { StatusBadge, SeverityBadge } from "@/components/badges";
import { formatWhen } from "@/lib/format";
import type { ReportCard, TeamStanding } from "@/lib/types";

export function Leaderboard({
  teams,
  counts,
  error,
}: {
  teams: TeamStanding[];
  counts: Record<string, { sent: number; fixed: number }>;
  error: string | null;
}) {
  const topScore = teams[0]?.totalPoints ?? 0;
  const leaders = topScore > 0 ? teams.filter((team) => team.totalPoints === topScore) : [];

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-paper">
      <div className="flex items-end justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Leaderboard</h2>
          <p className="text-sm text-moss">Points, reports sent, and how many are fixed.</p>
        </div>
      </div>
      <div className="border-b border-line bg-canopy-deep px-5 py-4 text-paper">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-lime">Шагнал</p>
        <p className="mt-1 font-display text-2xl tracking-tight">Эрдэм кафе гаас үнэгүй хоол идэх эрх</p>
        <p className="mt-1 text-sm leading-6 text-paper/85">
          Уралдааны эцэст хамгийн их оноотой багын 3 гишүүдэд энэхүү шагналыг авна.
        </p>
      </div>
      {error ? (
        <p className="px-5 py-6 text-sm text-clay">{error}</p>
      ) : teams.length === 0 ? (
        <p className="px-5 py-6 text-sm text-moss">No teams yet.</p>
      ) : (
        <ol>
          {teams.map((team, index) => (
            <li
              key={team.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-5 py-4 last:border-b-0"
            >
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${
                  index === 0 ? "bg-lime text-ink" : "bg-mist text-canopy-deep"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{team.teamName}</p>
                <p className="truncate text-sm text-moss">
                  {team.members.map((member) => member.fullName).join(" · ") || "No students yet"}
                </p>
              </div>
              <div className="text-right">
                <p>
                  <span className="font-display text-3xl leading-none">{team.totalPoints}</span>
                  <span className="ml-1 text-xs font-medium uppercase tracking-wide text-moss">pts</span>
                </p>
                <p className="mt-1 text-xs text-moss">{counts[team.id]?.sent ?? 0} sent</p>
                <p className="text-xs font-medium text-canopy-deep">{counts[team.id]?.fixed ?? 0} fixed</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RecentReports({ reports, error }: { reports: ReportCard[]; error: string | null }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-paper">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-display text-2xl tracking-tight">Latest tickets</h2>
        <p className="text-sm text-moss">The latest 5, newest first.</p>
      </div>
      {error ? (
        <p className="px-5 py-6 text-sm text-clay">{error}</p>
      ) : reports.length === 0 ? (
        <p className="px-5 py-6 text-sm text-moss">No reports yet. The first ticket sets the pace.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.id} className="border-b border-line px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={report.status} />
                {report.status === "Verified" || report.status === "Fixed" ? (
                  <SeverityBadge severity={report.severity} />
                ) : null}
                <span className="text-xs text-moss">{formatWhen(report.createdAt)}</span>
              </div>
              <p className="mt-2 font-medium">{report.location}</p>
              <p className="text-sm text-moss">
                {report.category} · {report.teamName}
                {report.confirmations > 0 ? ` · ${report.confirmations} confirmed` : ""}
              </p>
              <Link
                href={`/report?location=${encodeURIComponent(report.location)}`}
                className="mt-2 inline-block text-sm font-medium text-canopy-deep underline-offset-2 hover:underline"
              >
                Open this location
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
