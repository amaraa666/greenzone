"use server";

import { revalidatePath } from "next/cache";
import { readReportDeadline, writeReportDeadline } from "@/lib/deadline";
import { mailVerifiedReport } from "@/lib/mail";
import { isNotifyEmail, writeNotifyEmail } from "@/lib/notify";
import { imageUrlsFromStored } from "@/lib/images";
import { locationKey } from "@/lib/location";
import { pointsFor, UNSET_SEVERITY } from "@/lib/points";
import { scanMilestoneBytes } from "@/lib/scan-milestone";
import {
  clearAdminSession,
  createAdminSession,
  hasAdminPassword,
  isAdmin,
  passwordMatches,
} from "@/lib/admin-session";
import {
  explainDbError,
  fetchOpenReport,
  fetchStudent,
  isCategory,
  reportInsert,
  toReportCard,
} from "@/lib/queries";
import { getSupabase, SETUP_MESSAGE } from "@/lib/supabase";
import { SEVERITIES, type ReportCard, type Severity, type StudentProfile } from "@/lib/types";

export type ActionFailure = { ok: false; error: string };

export type SubmitResult =
  | { ok: true; kind: "created"; report: ReportCard }
  | { ok: true; kind: "duplicate"; report: ReportCard }
  | ActionFailure;

function refreshBoard() {
  revalidatePath("/");
  revalidatePath("/report");
  revalidatePath("/admin");
}

async function reportingOpen() {
  const { deadline, error } = await readReportDeadline();
  if (error) return error;
  if (deadline && Date.parse(deadline) <= Date.now()) return "The reporting window is closed.";
  return null;
}

export async function saveReportDeadline(raw: string | null): Promise<{ ok: true } | ActionFailure> {
  if (!(await isAdmin())) return { ok: false, error: "Sign in at the admin desk first." };

  let deadline: string | null = null;
  if (raw) {
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return { ok: false, error: "Choose a valid end time." };
    if (time <= Date.now() + 30_000) return { ok: false, error: "Choose a time that is still ahead." };
    deadline = new Date(time).toISOString();
  }

  const saved = await writeReportDeadline(deadline);
  if (saved.error) return { ok: false, error: saved.error };
  refreshBoard();
  return { ok: true };
}

export async function saveNotifyEmail(raw: string): Promise<{ ok: true } | ActionFailure> {
  if (!(await isAdmin())) return { ok: false, error: "Sign in at the admin desk first." };

  const email = raw.trim().toLowerCase();
  if (email && !isNotifyEmail(email)) return { ok: false, error: "Enter a valid email address." };

  const saved = await writeNotifyEmail(email || null);
  if (saved.error) return { ok: false, error: saved.error };
  refreshBoard();
  return { ok: true };
}

export async function resendVerifiedMail(): Promise<{ ok: true; note: string } | ActionFailure> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };

  const rows = await supabase
    .from("issue_reports")
    .select("id, location, status")
    .in("status", ["Verified", "Fixed"])
    .order("created_at", { ascending: true });
  if (rows.error) return { ok: false, error: explainDbError(rows.error.message) };

  const reports = rows.data ?? [];
  if (reports.length === 0) return { ok: true, note: "No verified reports to send." };

  let sent = 0;
  const failures: string[] = [];
  for (const report of reports) {
    const note = await mailVerifiedReport(report.id);
    if (note.startsWith("Mailed ")) {
      sent += 1;
      continue;
    }
    failures.push(note);
    if (note.startsWith("Verified. Add") || note.startsWith("Verified. The mail")) break;
  }

  if (sent === 0) return { ok: false, error: failures[0] ?? "Mail could not be sent." };
  if (failures.length === 0) {
    return { ok: true, note: `Mailed ${sent} verified ${sent === 1 ? "report" : "reports"}.` };
  }
  return { ok: true, note: `Mailed ${sent}. ${failures.length} could not be sent. ${failures[0]}` };
}

function isSeverity(value: string): value is Severity {
  return SEVERITIES.some((severity) => severity === value);
}

function extensionFor(type: string) {
  if (type === "image/jpeg") return "jpg";
  const raw = type.split("/")[1]?.toLowerCase() ?? "jpg";
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned || "jpg";
}

export async function lookupStudent(
  studentCode: string,
): Promise<{ ok: true; student: StudentProfile } | ActionFailure> {
  const { student, error } = await fetchStudent(studentCode);
  if (error || !student) return { ok: false, error: error ?? "Student not found" };
  return { ok: true, student };
}

export async function checkLocation(
  location: string,
): Promise<{ ok: true; report: ReportCard | null } | ActionFailure> {
  const { report, error } = await fetchOpenReport(location);
  if (error) return { ok: false, error };
  return { ok: true, report };
}

export async function submitReport(formData: FormData): Promise<SubmitResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };
  const closed = await reportingOpen();
  if (closed) return { ok: false, error: closed };

  const teamId = String(formData.get("teamId") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim().replace(/\s+/g, " ");
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const images = formData.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);

  if (!locationKey(location)) {
    return { ok: false, error: "Add the room or place you are reporting" };
  }
  if (!isCategory(category)) {
    return { ok: false, error: "Choose a category" };
  }
  if (description.length < 8) {
    return { ok: false, error: "Describe the problem in at least a few words" };
  }
  if (description.length > 1000) {
    return { ok: false, error: "Keep the description under 1000 characters" };
  }
  if (!teamId) return { ok: false, error: "Choose your team" };
  if (images.length < 1) return { ok: false, error: "Add at least one photo of the issue" };
  if (images.length > 3) return { ok: false, error: "Add no more than 3 photos" };
  for (const image of images) {
    if (!image.type.startsWith("image/")) return { ok: false, error: "Each photo needs to be an image" };
    if (image.size > 5 * 1024 * 1024) return { ok: false, error: "Each photo must be under 5 MB" };
  }

  const team = await supabase.from("teams").select("id, team_name").eq("id", teamId).maybeSingle();
  if (team.error) return { ok: false, error: explainDbError(team.error.message) };
  if (!team.data) return { ok: false, error: "That team is not registered" };

  const members = await supabase
    .from("students")
    .select("student_code")
    .eq("team_id", teamId)
    .order("student_code", { ascending: true })
    .limit(1);
  if (members.error) return { ok: false, error: explainDbError(members.error.message) };
  const reporterCode = members.data?.[0]?.student_code;
  if (!reporterCode) return { ok: false, error: "Register at least one student on this team before filing a report" };

  const existing = await fetchOpenReport(location);
  if (existing.error) return { ok: false, error: existing.error };
  if (existing.report) return { ok: true, kind: "duplicate", report: existing.report };

  const uploadedPaths: string[] = [];
  const imageUrls: string[] = [];
  for (const image of images) {
    const path = `${locationKey(location)}/${crypto.randomUUID()}.${extensionFor(image.type)}`;
    const bytes = Buffer.from(await image.arrayBuffer());
    const uploaded = await supabase.storage.from("report-images").upload(path, bytes, {
      contentType: image.type,
      upsert: false,
    });
    if (uploaded.error) {
      if (uploadedPaths.length > 0) await supabase.storage.from("report-images").remove(uploadedPaths);
      return { ok: false, error: `Photo upload failed. ${uploaded.error.message}` };
    }
    uploadedPaths.push(path);
    imageUrls.push(supabase.storage.from("report-images").getPublicUrl(path).data.publicUrl);
  }

  const inserted = await supabase
    .from("issue_reports")
    .insert(reportInsert({
      teamId: team.data.id,
      studentCode: reporterCode,
      location,
      category,
      severity: UNSET_SEVERITY,
      imageUrls,
      description,
    }))
    .select(`
      id,
      team_id,
      reported_by_student_code,
      location,
      category,
      severity,
      points_awarded,
      image_url,
      description,
      status,
      created_at,
      teams ( team_name ),
      students ( full_name ),
      report_confirmations ( id )
    `)
    .single();

  if (inserted.error) {
    await supabase.storage.from("report-images").remove(uploadedPaths);
    if (inserted.error.code === "23505") {
      const raced = await fetchOpenReport(location);
      if (raced.report) return { ok: true, kind: "duplicate", report: raced.report };
    }
    return { ok: false, error: explainDbError(inserted.error.message) };
  }

  const report = toReportCard(inserted.data);
  if (!report) return { ok: false, error: "Report was saved but could not be read back" };

  refreshBoard();
  return { ok: true, kind: "created", report };
}

export async function confirmReport(
  reportId: string,
  teamId: string,
): Promise<{ ok: true; points: number; teamName: string } | ActionFailure> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };
  const closed = await reportingOpen();
  if (closed) return { ok: false, error: closed };

  const team = await supabase.from("teams").select("id, team_name").eq("id", teamId).maybeSingle();
  if (team.error) return { ok: false, error: explainDbError(team.error.message) };
  if (!team.data) return { ok: false, error: "Choose your team" };

  const report = await supabase.from("issue_reports").select("id, team_id, status").eq("id", reportId).maybeSingle();
  if (report.error) return { ok: false, error: explainDbError(report.error.message) };
  if (!report.data) return { ok: false, error: "Report not found" };
  if (report.data.team_id === team.data.id) return { ok: false, error: "Your team already filed this report" };
  if (report.data.status !== "Pending" && report.data.status !== "Verified") {
    return { ok: false, error: "This report is no longer open" };
  }

  const members = await supabase
    .from("students")
    .select("student_code")
    .eq("team_id", team.data.id)
    .order("student_code", { ascending: true })
    .limit(1);
  if (members.error) return { ok: false, error: explainDbError(members.error.message) };
  const studentCode = members.data?.[0]?.student_code;
  if (!studentCode) return { ok: false, error: "Register at least one student on this team before confirming" };

  const { data, error } = await supabase.rpc("confirm_report", {
    p_report_id: reportId,
    p_student_code: studentCode,
  });

  if (error) return { ok: false, error: explainDbError(error.message) };

  const payload = data as { ok?: boolean; error?: string; points?: number; team_name?: string } | null;
  if (!payload?.ok) {
    const message = payload?.error === "You already confirmed this report"
      ? "Your team already confirmed this report"
      : payload?.error ?? "Could not confirm this report";
    return { ok: false, error: message };
  }

  refreshBoard();
  return { ok: true, points: payload.points ?? 5, teamName: payload.team_name ?? team.data.team_name };
}

async function requireAdmin(): Promise<ActionFailure | null> {
  if (!(await isAdmin())) return { ok: false, error: "Admin session expired. Sign in again." };
  return null;
}

async function review(
  name: "approve_report" | "reject_report" | "mark_report_fixed",
  reportId: string,
): Promise<{ ok: true } | ActionFailure> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };

  const { data, error } = await supabase.rpc(name, { p_report_id: reportId });
  if (error) return { ok: false, error: explainDbError(error.message) };

  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload?.ok) return { ok: false, error: payload?.error ?? "Could not update the report" };

  refreshBoard();
  return { ok: true };
}

export async function approveReport(reportId: string, severity: string) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isSeverity(severity)) return { ok: false, error: "Choose a milestone before accepting." };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };

  const updated = await supabase
    .from("issue_reports")
    .update({ severity, points_awarded: pointsFor(severity) })
    .eq("id", reportId)
    .eq("status", "Pending")
    .select("id");
  if (updated.error) return { ok: false, error: explainDbError(updated.error.message) };
  if (!updated.data?.length) return { ok: false, error: "Only pending reports can be verified" };

  const reviewed = await review("approve_report", reportId);
  if (!reviewed.ok) return reviewed;

  const mailNote = await mailVerifiedReport(reportId);
  return { ok: true, mailNote };
}

function allowedReportImage(value: string) {
  const base = process.env["SUPABASE_URL"];
  if (!base) return false;
  try {
    const url = new URL(value);
    const allowed = new URL(base);
    return url.protocol === "https:" && url.host === allowed.host;
  } catch {
    return false;
  }
}

export async function suggestReportMilestone(reportId: string) {
  const denied = await requireAdmin();
  if (denied) return { ok: false as const, error: denied.error };

  const supabase = getSupabase();
  if (!supabase) return { ok: false as const, error: SETUP_MESSAGE };

  const row = await supabase.from("issue_reports").select("image_url, status").eq("id", reportId).maybeSingle();
  if (row.error) return { ok: false as const, error: explainDbError(row.error.message) };
  if (!row.data || row.data.status !== "Pending") {
    return { ok: false as const, error: "Only a pending report can be scanned." };
  }

  const url = imageUrlsFromStored(row.data.image_url)[0];
  if (!url || !allowedReportImage(url)) return { ok: false as const, error: "This report has no photo to scan." };

  const response = await fetch(url);
  if (!response.ok) return { ok: false as const, error: "The photo could not be loaded." };
  const mime = response.headers.get("content-type") ?? "image/jpeg";
  return scanMilestoneBytes(Buffer.from(await response.arrayBuffer()), mime);
}

export async function rejectReport(reportId: string) {
  return review("reject_report", reportId);
}

export async function markReportFixed(reportId: string) {
  return review("mark_report_fixed", reportId);
}

const CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;

export async function registerTeam(input: {
  teamName: string;
  members: { code: string; fullName: string }[];
}): Promise<{ ok: true; teamId: string; teamName: string; studentCodes: string[] } | ActionFailure> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: SETUP_MESSAGE };

  const teamName = input.teamName.trim().replace(/\s+/g, " ");
  if (teamName.length < 2 || teamName.length > 60) {
    return { ok: false, error: "Team name needs 2 to 60 characters" };
  }

  const members = input.members
    .map((member) => ({
      code: member.code.trim().toUpperCase(),
      fullName: member.fullName.trim().replace(/\s+/g, " "),
    }))
    .filter((member) => member.code || member.fullName);

  if (members.length !== 3) {
    return { ok: false, error: "A team needs exactly 3 students" };
  }

  for (const member of members) {
    if (!CODE_PATTERN.test(member.code)) {
      return { ok: false, error: "Student codes look like NQ-01: letters, numbers, and hyphens" };
    }
    if (member.fullName.length < 2 || member.fullName.length > 80) {
      return { ok: false, error: `Add a full name for ${member.code}` };
    }
  }

  const codes = members.map((member) => member.code);
  if (new Set(codes).size !== codes.length) {
    return { ok: false, error: "Each student needs a different code" };
  }

  const existingTeam = await supabase.from("teams").select("id").eq("team_name", teamName).maybeSingle();
  if (existingTeam.error) return { ok: false, error: explainDbError(existingTeam.error.message) };
  if (existingTeam.data) return { ok: false, error: "A team with that name is already registered" };

  const existingStudents = await supabase.from("students").select("student_code").in("student_code", codes);
  if (existingStudents.error) return { ok: false, error: explainDbError(existingStudents.error.message) };
  if ((existingStudents.data ?? []).length > 0) {
    const taken = existingStudents.data.map((row) => row.student_code).join(", ");
    return { ok: false, error: `These codes are already on a team: ${taken}` };
  }

  const created = await supabase.from("teams").insert({ team_name: teamName }).select("id").single();
  if (created.error || !created.data) {
    return { ok: false, error: explainDbError(created.error?.message ?? "Could not create the team") };
  }

  const saved = await supabase.from("students").insert(
    members.map((member) => ({
      student_code: member.code,
      full_name: member.fullName,
      team_id: created.data.id,
    })),
  );

  if (saved.error) {
    await supabase.from("teams").delete().eq("id", created.data.id);
    return { ok: false, error: explainDbError(saved.error.message) };
  }

  refreshBoard();
  return { ok: true, teamId: created.data.id, teamName, studentCodes: codes };
}

export async function loginAdmin(password: string): Promise<{ ok: true } | ActionFailure> {
  if (!hasAdminPassword()) {
    return { ok: false, error: "Set ADMIN_PASSWORD in .env.local, then restart the dev server." };
  }
  if (!passwordMatches(password)) {
    return { ok: false, error: "That password does not match." };
  }
  await createAdminSession();
  return { ok: true };
}

export async function logoutAdmin() {
  await clearAdminSession();
  revalidatePath("/admin");
  return { ok: true as const };
}
