import { Suspense } from "react";
import { AdminDashboard, AdminLogin } from "@/components/admin-dashboard";
import { isAdmin } from "@/lib/admin-session";
import { getLeaderboard, getNotifyEmail, getReportDeadline, getReports } from "@/lib/data";
import { gmailReady } from "@/lib/mail";
import { isSupabaseConfigured } from "@/lib/supabase";

export const metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Suspense fallback={<div className="h-80 animate-pulse rounded-3xl bg-paper" />}>
        <AdminGate />
      </Suspense>
    </main>
  );
}

async function AdminGate() {
  const authed = await isAdmin();
  if (!authed) return <AdminLogin configured={isSupabaseConfigured()} />;

  const [reportsResult, standings, deadline, notify] = await Promise.all([
    getReports(),
    getLeaderboard(),
    getReportDeadline(),
    getNotifyEmail(),
  ]);
  return (
    <AdminDashboard
      reports={reportsResult.reports}
      teams={standings.teams}
      deadline={deadline.deadline}
      notifyEmail={notify.email}
      gmailReady={gmailReady()}
      error={reportsResult.error ?? standings.error ?? deadline.error ?? notify.error}
      canScan={Boolean(process.env["AI_API_KEY"]?.trim())}
    />
  );
}
