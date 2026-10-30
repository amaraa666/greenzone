import "server-only";
import { CATEGORIES } from "@/lib/constants";
import { imageUrlsFromStored, storeImageUrls } from "@/lib/images";
import { locationKey } from "@/lib/location";
import { OPEN_STATUSES, pointsFor } from "@/lib/points";
import { getSupabase, SETUP_MESSAGE } from "@/lib/supabase";
import {
  REPORT_STATUSES,
  SEVERITIES,
  type ReportCard,
  type ReportStatus,
  type Severity,
  type StudentProfile,
  type TeamStanding,
  type TeamTicket,
} from "@/lib/types";

const REPORT_SELECT = `
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
`;

type Embedded<T> = T | T[] | null;

type ReportRow = {
  id: string;
  team_id: string;
  reported_by_student_code: string | null;
  location: string;
  category: string;
  severity: string;
  points_awarded: number;
  image_url: string | null;
  description: string;
  status: string;
  created_at: string;
  teams: Embedded<{ team_name: string }>;
  students: Embedded<{ full_name: string }>;
  report_confirmations: { id: string }[] | null;
};

function one<T>(value: Embedded<T>) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isSeverity(value: string): value is Severity {
  return SEVERITIES.some((severity) => severity === value);
}

export function explainDbError(message: string) {
  if (message.includes("schema cache") || message.includes("does not exist")) {
    return `${message}. Run supabase/schema.sql in the Supabase SQL editor, then reload.`;
  }
  return message;
}

function isStatus(value: string): value is ReportStatus {
  return REPORT_STATUSES.some((status) => status === value);
}

export function toReportCard(row: ReportRow): ReportCard | null {
  if (!isSeverity(row.severity) || !isStatus(row.status)) return null;
  const imageUrls = imageUrlsFromStored(row.image_url);
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: one(row.teams)?.team_name ?? "Unknown team",
    reportedByStudentCode: row.reported_by_student_code,
    reporterName: one(row.students)?.full_name ?? "",
    location: row.location,
    category: row.category,
    severity: row.severity,
    pointsAwarded: row.points_awarded,
    imageUrls,
    imageUrl: imageUrls[0] ?? null,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    confirmations: row.report_confirmations?.length ?? 0,
  };
}

export async function fetchLeaderboard(): Promise<{ teams: TeamStanding[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { teams: [], error: SETUP_MESSAGE };

  const { data, error } = await supabase
    .from("teams")
    .select("id, team_name, total_points, students(student_code, full_name)")
    .order("total_points", { ascending: false })
    .order("team_name", { ascending: true });

  if (error) return { teams: [], error: explainDbError(error.message) };

  const teams = (data ?? []).map((team) => {
    const members = [...(team.students ?? [])].sort((a, b) =>
      a.student_code.localeCompare(b.student_code),
    );
    return {
      id: team.id,
      teamName: team.team_name,
      totalPoints: team.total_points,
      members: members.map((member) => ({
        studentCode: member.student_code,
        fullName: member.full_name,
      })),
    };
  });

  return { teams, error: null };
}

export async function fetchRecentReports(): Promise<{ reports: ReportCard[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { reports: [], error: SETUP_MESSAGE };

  const { data, error } = await supabase
    .from("issue_reports")
    .select(REPORT_SELECT)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return { reports: [], error: explainDbError(error.message) };
  return { reports: (data ?? []).flatMap((row) => {
    const card = toReportCard(row as ReportRow);
    return card ? [card] : [];
  }), error: null };
}

export async function fetchTicketSummaries(): Promise<{ tickets: TeamTicket[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { tickets: [], error: SETUP_MESSAGE };

  const { data, error } = await supabase
    .from("issue_reports")
    .select("id, team_id, location, category, severity, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return { tickets: [], error: explainDbError(error.message) };

  const tickets = (data ?? []).flatMap((row) => {
    if (!isSeverity(row.severity) || !isStatus(row.status)) return [];
    return [
      {
        id: row.id,
        teamId: row.team_id,
        location: row.location,
        category: row.category,
        severity: row.severity,
        status: row.status,
        createdAt: row.created_at,
      },
    ];
  });

  return { tickets, error: null };
}

export async function fetchReports(limit?: number): Promise<{ reports: ReportCard[]; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { reports: [], error: SETUP_MESSAGE };

  let query = supabase.from("issue_reports").select(REPORT_SELECT).order("created_at", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;

  if (error) return { reports: [], error: explainDbError(error.message) };
  return {
    reports: (data ?? []).flatMap((row) => {
      const card = toReportCard(row as ReportRow);
      return card ? [card] : [];
    }),
    error: null,
  };
}

export async function fetchOpenReport(location: string): Promise<{ report: ReportCard | null; error: string | null }> {
  const key = locationKey(location);
  if (!key) return { report: null, error: null };

  const supabase = getSupabase();
  if (!supabase) return { report: null, error: SETUP_MESSAGE };

  const { data, error } = await supabase
    .from("issue_reports")
    .select(REPORT_SELECT)
    .eq("location_key", key)
    .in("status", [...OPEN_STATUSES])
    .limit(1);

  if (error) return { report: null, error: explainDbError(error.message) };
  const row = data?.[0] as ReportRow | undefined;
  return { report: row ? toReportCard(row) : null, error: null };
}

export async function fetchStudent(studentCode: string): Promise<{ student: StudentProfile | null; error: string | null }> {
  const code = studentCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) {
    return { student: null, error: "Enter a student code like NQ-01" };
  }

  const supabase = getSupabase();
  if (!supabase) return { student: null, error: SETUP_MESSAGE };

  const { data, error } = await supabase
    .from("students")
    .select("student_code, full_name, team_id, teams(team_name)")
    .eq("student_code", code)
    .maybeSingle();

  if (error) return { student: null, error: explainDbError(error.message) };
  if (!data) return { student: null, error: "That student code is not on a team" };

  const team = one(data.teams as Embedded<{ team_name: string }>);
  return {
    student: {
      studentCode: data.student_code,
      fullName: data.full_name,
      teamId: data.team_id,
      teamName: team?.team_name ?? "Unknown team",
    },
    error: null,
  };
}

export function reportInsert(input: {
  teamId: string;
  studentCode: string;
  location: string;
  category: string;
  severity: Severity;
  imageUrls: string[];
  description: string;
}) {
  return {
    team_id: input.teamId,
    reported_by_student_code: input.studentCode,
    location: input.location,
    location_key: locationKey(input.location),
    category: input.category,
    severity: input.severity,
    points_awarded: pointsFor(input.severity),
    image_url: storeImageUrls(input.imageUrls),
    description: input.description,
    status: "Pending" as const,
  };
}

export function isCategory(value: string) {
  return CATEGORIES.some((category) => category === value);
}
