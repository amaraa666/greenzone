import { CONFIRM_POINTS, SEVERITY_POINTS } from "@/lib/points";

const rows = [
  { label: "Low", points: SEVERITY_POINTS.Low, note: "Эвдрэлийн зэрэг бага" },
  { label: "Medium", points: SEVERITY_POINTS.Medium, note: "Эвпрэлийн зэрэг дунд" },
  { label: "High", points: SEVERITY_POINTS.High, note: "Эвдрэлийн зэрэг их" },
  { label: "Confirm", points: CONFIRM_POINTS, note: "Давхардсан мэдээлэл" },
];

export function PointsLegend() {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-2xl border border-line bg-paper px-3 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-moss">{row.label}</dt>
          <dd className="font-display text-3xl leading-none text-ink">{row.points}</dd>
          <dd className="mt-1 text-xs text-moss">{row.note}</dd>
        </div>
      ))}
    </dl>
  );
}
