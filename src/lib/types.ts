export const SEVERITIES = ["Low", "Medium", "High"] as const;
export const REPORT_STATUSES = ["Pending", "Verified", "Fixed", "Rejected"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type StudentProfile = {
  studentCode: string;
  fullName: string;
  teamId: string;
  teamName: string;
};

export type TeamStanding = {
  id: string;
  teamName: string;
  totalPoints: number;
  members: { studentCode: string; fullName: string }[];
};

export type TeamTicket = {
  id: string;
  teamId: string;
  location: string;
  category: string;
  severity: Severity;
  status: ReportStatus;
  createdAt: string;
};

export type ReportCard = {
  id: string;
  teamId: string;
  teamName: string;
  reportedByStudentCode: string | null;
  reporterName: string;
  location: string;
  category: string;
  severity: Severity;
  pointsAwarded: number;
  imageUrls: string[];
  imageUrl: string | null;
  description: string;
  status: ReportStatus;
  createdAt: string;
  confirmations: number;
};
