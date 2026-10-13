import { Suspense } from "react";
import Link from "next/link";
import { Leaderboard, RecentReports } from "@/components/leaderboard";
import { PointsLegend } from "@/components/points-legend";
import { TimeLimitBanner } from "@/components/time-limit";
import { getLeaderboard, getRecentReports, getReportDeadline, getTicketSummaries } from "@/lib/data";
import type { TeamTicket } from "@/lib/types";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:py-16 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-canopy">Campus repair desk</p>
          <h1 className="mt-3 max-w-xl font-display text-4xl leading-[0.95] tracking-tight sm:text-6xl">
            Сургуулийн эргэн тойрон дахь эвдрэлийг мэдээлэх
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-moss">
          3 оюутантай багаа бүрдүүлж эвдрэлийг зургаар мэдээлэх ба эвдрэлийг зэргээр оноо авч хоорондоо оноогоор уралдана.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/report" className="rounded-full bg-canopy-deep px-5 py-3 text-sm font-semibold text-paper">
              File a report
            </Link>
            <Link href="/report?view=register" className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold">
              Register a team
            </Link>
            <Link href="/#board" className="rounded-full border border-line bg-paper px-5 py-3 text-sm font-semibold">
              See the board
            </Link>
          </div>
        </div>
        <PointsLegend />
      </section>

      <Suspense fallback={<BoardFallback />}>
        <Board />
      </Suspense>
    </main>
  );
}

async function Board() {
  const [standings, recent, tickets, deadline] = await Promise.all([
    getLeaderboard(),
    getRecentReports(),
    getTicketSummaries(),
    getReportDeadline(),
  ]);
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
      {deadline.deadline ? <TimeLimitBanner deadline={deadline.deadline} /> : null}
      <section id="board" className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Leaderboard teams={standings.teams} counts={countTickets(tickets.tickets)} error={standings.error ?? tickets.error} />
        <RecentReports reports={recent.reports} error={recent.error} />
      </section>
    </div>
  );
}

function countTickets(tickets: TeamTicket[]) {
  const counts: Record<string, { sent: number; fixed: number }> = {};
  for (const ticket of tickets) {
    const current = counts[ticket.teamId] ?? { sent: 0, fixed: 0 };
    current.sent += 1;
    if (ticket.status === "Fixed") current.fixed += 1;
    counts[ticket.teamId] = current;
  }
  return counts;
}

function BoardFallback() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="h-80 animate-pulse rounded-3xl bg-paper" />
        <div className="h-80 animate-pulse rounded-3xl bg-paper" />
      </section>
    </div>
  );
}
