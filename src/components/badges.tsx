import type { ReportStatus, Severity } from "@/lib/types";

const severityClass: Record<Severity, string> = {
  Low: "bg-mist text-canopy-deep",
  Medium: "bg-lime text-ink",
  High: "bg-clay text-paper",
};

const statusClass: Record<ReportStatus, string> = {
  Pending: "bg-[#f4e4c4] text-amber",
  Verified: "bg-mist text-canopy-deep",
  Fixed: "bg-ink text-paper",
  Rejected: "bg-[#f8e4dc] text-clay",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass[severity]}`}>
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}>
      {status}
    </span>
  );
}
