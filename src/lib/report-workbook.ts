import "server-only";
import ExcelJS from "exceljs";
import { formatWhen } from "@/lib/format";
import { parsePlace } from "@/lib/location";
import type { ReportCard } from "@/lib/types";

const PHOTO_COLUMNS = [11, 12, 13];
const MAX_IMAGE_BYTES = 3_000_000;

function allowedImageUrl(value: string) {
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

function imageExtension(type: string, url: string): "jpeg" | "png" | "gif" | null {
  const kind = type.toLowerCase();
  if (kind.includes("png")) return "png";
  if (kind.includes("gif")) return "gif";
  if (kind.includes("jpeg") || kind.includes("jpg")) return "jpeg";
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "png";
  if (path.endsWith(".gif")) return "gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "jpeg";
  return null;
}

async function loadImage(url: string) {
  if (!allowedImageUrl(url)) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  const extension = imageExtension(type, url);
  if (!extension) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { extension, bytes };
}

export async function buildReportWorkbook(reports: ReportCard[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Green Zone";
  const sheet = workbook.addWorksheet("Reports");

  sheet.columns = [
    { header: "Status", key: "status", width: 14 },
    { header: "Apartment", key: "apartment", width: 22 },
    { header: "Room", key: "room", width: 16 },
    { header: "Location", key: "location", width: 32 },
    { header: "Category", key: "category", width: 16 },
    { header: "Severity", key: "severity", width: 12 },
    { header: "Team", key: "team", width: 24 },
    { header: "Description", key: "description", width: 48 },
    { header: "Points", key: "points", width: 10 },
    { header: "Filed", key: "filed", width: 22 },
    { header: "Photo 1", key: "photo1", width: 24 },
    { header: "Photo 2", key: "photo2", width: 24 },
    { header: "Photo 3", key: "photo3", width: 24 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "J1" };

  for (const [index, report] of reports.entries()) {
    const place = parsePlace(report.location);
    const rowNumber = index + 2;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = report.status;
    row.getCell(2).value = place.apartment;
    row.getCell(3).value = place.room || report.location;
    row.getCell(4).value = report.location;
    row.getCell(5).value = report.category;
    const decided = report.status === "Verified" || report.status === "Fixed";
    row.getCell(6).value = decided ? report.severity : "Not set";
    row.getCell(7).value = report.teamName;
    row.getCell(8).value = report.description;
    row.getCell(8).alignment = { wrapText: true, vertical: "top" };
    row.getCell(9).value = decided ? report.pointsAwarded : "";
    row.getCell(10).value = formatWhen(report.createdAt);
    row.height = report.imageUrls.length > 0 ? 96 : 20;

    const photos = await Promise.all(report.imageUrls.slice(0, 3).map((url) => loadImage(url)));
    report.imageUrls.slice(0, 3).forEach((url, photoIndex) => {
      const column = PHOTO_COLUMNS[photoIndex];
      if (!column) return;
      const cell = row.getCell(column);
      cell.value = { text: `Photo ${photoIndex + 1}`, hyperlink: url };
      cell.font = { color: { argb: "FF1F7A4D" }, underline: true };
      const image = photos[photoIndex];
      if (!image) return;
      const imageId = workbook.addImage({
        base64: image.bytes.toString("base64"),
        extension: image.extension,
      });
      sheet.addImage(imageId, {
        tl: { col: column - 1 + 0.1, row: rowNumber - 1 + 0.15 },
        ext: { width: 148, height: 108 },
        editAs: "oneCell",
      });
    });
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
