import "server-only";
import { connection } from "next/server";
import { readReportDeadline } from "@/lib/deadline";
import { readNotifyEmail } from "@/lib/notify";
import { fetchLeaderboard, fetchRecentReports, fetchReports, fetchTicketSummaries } from "@/lib/queries";

export async function getLeaderboard() {
  await connection();
  return fetchLeaderboard();
}

export async function getRecentReports() {
  await connection();
  return fetchRecentReports();
}

export async function getReports() {
  await connection();
  return fetchReports();
}

export async function getTicketSummaries() {
  await connection();
  return fetchTicketSummaries();
}

export async function getReportDeadline() {
  await connection();
  return readReportDeadline();
}

export async function getNotifyEmail() {
  await connection();
  return readNotifyEmail();
}
