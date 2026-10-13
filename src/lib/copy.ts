import type { ReportStatus, Severity } from "@/lib/types";

export const SITE_NAME = "Ногоон бүс";

const STATUS_LABEL: Record<ReportStatus, string> = {
  Pending: "Хүлээгдэж буй",
  Verified: "Баталгаажсан",
  Fixed: "Зассан",
  Rejected: "Татгалзсан",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  Low: "Бага",
  Medium: "Дунд",
  High: "Өндөр",
};

export function statusLabel(status: ReportStatus | "All") {
  if (status === "All") return "Бүгд";
  return STATUS_LABEL[status];
}

export function severityLabel(severity: Severity | "All") {
  if (severity === "All") return "Бүгд";
  return SEVERITY_LABEL[severity];
}

export function categoryLabel(category: string) {
  return category;
}
