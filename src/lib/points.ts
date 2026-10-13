import type { Severity } from "@/lib/types";

export const SEVERITY_POINTS: Record<Severity, number> = {
  Low: 10,
  Medium: 25,
  High: 50,
};

export const CONFIRM_POINTS = 5;

/** Placeholder stored on a new ticket. Points are awarded only after an admin picks a milestone. */
export const UNSET_SEVERITY: Severity = "Low";

export const OPEN_STATUSES = ["Pending", "Verified"] as const;

export function pointsFor(severity: Severity) {
  return SEVERITY_POINTS[severity];
}
