import { isAdmin } from "@/lib/admin-session";
import { fetchReports } from "@/lib/queries";
import { buildReportWorkbook } from "@/lib/report-workbook";

export async function GET() {
  if (!(await isAdmin())) {
    return new Response("Sign in at the admin desk first.", { status: 401 });
  }

  const { reports, error } = await fetchReports(500);
  if (error) return new Response(error, { status: 500 });

  const file = await buildReportWorkbook(reports);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="green-zone-reports-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
