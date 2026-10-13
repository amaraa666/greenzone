import "server-only";
import nodemailer from "nodemailer";
import { imageUrlsFromStored } from "@/lib/images";
import { readNotifyEmail } from "@/lib/notify";
import { getSupabase } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function gmailAuth() {
  const user = process.env["GMAIL_USER"]?.trim() ?? "";
  const pass = (process.env["GMAIL_APP_PASSWORD"] ?? "").replace(/\s/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

export function gmailReady() {
  return gmailAuth() !== null;
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function teamNameOf(value: unknown) {
  if (Array.isArray(value)) return teamNameOf(value[0]);
  if (value && typeof value === "object" && "team_name" in value && typeof value.team_name === "string") {
    return value.team_name;
  }
  return "Unknown team";
}

async function loadImage(url: string) {
  if (!allowedReportImage(url)) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const type = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0]?.trim() || "image/jpeg";
  if (!type.startsWith("image/")) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return { bytes, type, extension };
}

export async function mailVerifiedReport(reportId: string): Promise<string> {
  const recipient = await readNotifyEmail();
  if (recipient.error) return `Verified. The mail address could not be read. ${recipient.error}`;
  if (!recipient.email) return "Verified. Add a mail address on this page so the next report is emailed.";

  const auth = gmailAuth();
  if (!auth) {
    return "Verified. Add GMAIL_USER and GMAIL_APP_PASSWORD so this desk can send mail.";
  }

  const supabase = getSupabase();
  if (!supabase) return "Verified. Mail could not be sent because the database is not configured.";

  const row = await supabase
    .from("issue_reports")
    .select("location, category, description, severity, image_url, teams(team_name)")
    .eq("id", reportId)
    .maybeSingle();
  if (row.error || !row.data) return "Verified, but the report could not be loaded for mail.";

  const location = row.data.location;
  const category = row.data.category;
  const description = row.data.description;
  const severity = row.data.severity;
  const teamName = teamNameOf(row.data.teams);
  const urls = imageUrlsFromStored(row.data.image_url);
  const images = (await Promise.all(urls.map((url) => loadImage(url)))).flatMap((image, index) =>
    image ? [{ ...image, index, url: urls[index] ?? "" }] : [],
  );

  const photoLines = urls.map((url, index) => `Photo ${index + 1}: ${url}`).join("\n");
  const text = [
    `A report was verified at ${location}.`,
    "",
    `Location: ${location}`,
    `Category: ${category}`,
    `Milestone: ${severity}`,
    `Team: ${teamName}`,
    "",
    description,
    "",
    photoLines || "No photo was attached.",
  ].join("\n");

  const photos = images
    .map(
      (image) =>
        `<p><img src="cid:photo-${image.index}" alt="Photo ${image.index + 1} at ${escapeHtml(location)}" style="max-width:100%;height:auto" /></p>`,
    )
    .join("");
  const links = urls
    .map(
      (url, index) =>
        `<p><a href="${escapeHtml(url)}">Photo ${index + 1}</a></p>`,
    )
    .join("");
  const html = `
    <p>A report was verified.</p>
    <p><strong>Location:</strong> ${escapeHtml(location)}</p>
    <p><strong>Category:</strong> ${escapeHtml(category)}</p>
    <p><strong>Milestone:</strong> ${escapeHtml(severity)}</p>
    <p><strong>Team:</strong> ${escapeHtml(teamName)}</p>
    <p>${escapeHtml(description)}</p>
    ${photos || "<p>No photo was attached.</p>"}
    ${links}
  `;

  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth,
    });
    await transport.sendMail({
      from: auth.user,
      to: recipient.email,
      subject: `Verified repair: ${location}`.slice(0, 180),
      text,
      html,
      attachments: images.map((image) => ({
        filename: `photo-${image.index + 1}.${image.extension}`,
        content: image.bytes,
        contentType: image.type,
        cid: `photo-${image.index}`,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail could not be sent.";
    const safe = message.replaceAll(auth.pass, "").slice(0, 180);
    return `Verified, but the mail to ${recipient.email} failed. ${safe}`;
  }

  return `Mailed ${location} and ${images.length === 1 ? "the photo" : `${images.length} photos`} to ${recipient.email}.`;
}
