import "server-only";

import { CATEGORIES, type Category } from "@/lib/constants";
import { SEVERITIES, type Severity } from "@/lib/types";

const MAX_SCAN_BYTES = 4 * 1024 * 1024;

export type ScanResult =
  | { ok: true; category: Category; severity: Severity; note: string }
  | { ok: false; error: string };

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isCategory(value: string): value is Category {
  return CATEGORIES.some((category) => category === value);
}

function isSeverity(value: string): value is Severity {
  return SEVERITIES.some((severity) => severity === value);
}

export async function scanMilestoneBytes(bytes: Buffer, mime: string): Promise<ScanResult> {
  const apiKey = readEnv("AI_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "Photo scanning is not configured yet. Choose the milestone yourself." };
  }

  if (bytes.byteLength === 0 || !mime.startsWith("image/")) {
    return { ok: false, error: "This report has no photo to scan." };
  }
  if (bytes.byteLength > MAX_SCAN_BYTES) {
    return { ok: false, error: "That photo is too large to scan. Choose the milestone yourself." };
  }

  const normalized = mime === "image/jpg" ? "image/jpeg" : mime.split(";")[0]?.trim() || "image/jpeg";
  const base64 = bytes.toString("base64");
  const baseUrl = (readEnv("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = readEnv("AI_MODEL") || "gpt-4o-mini";

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You inspect one campus repair photo and choose the points milestone.",
              `category must be one of: ${CATEGORIES.join(", ")}.`,
              "severity must be Low, Medium, or High.",
              "Low: scuff, loose sign, minor wear.",
              "Medium: broken fixture, leak, or something that needs a repair visit.",
              "High: safety risk, exposed wiring, flooding, or a space that cannot be used.",
              'Reply with JSON only: {"category":"...","severity":"Low|Medium|High","note":"one short sentence"}.',
            ].join(" "),
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Scan this photo and select the milestone." },
              { type: "image_url", image_url: { url: `data:${normalized};base64,${base64}` } },
            ],
          },
        ],
      }),
    });
  } catch {
    return { ok: false, error: "The photo could not be scanned. Choose the milestone yourself." };
  }

  if (!response.ok) {
    return { ok: false, error: "The photo could not be scanned. Choose the milestone yourself." };
  }

  const payload: unknown = await response.json();
  const choice =
    payload &&
    typeof payload === "object" &&
    "choices" in payload &&
    Array.isArray(payload.choices)
      ? payload.choices[0]
      : null;
  const message =
    choice && typeof choice === "object" && "message" in choice ? choice.message : null;
  const content =
    message && typeof message === "object" && "content" in message && typeof message.content === "string"
      ? message.content
      : null;

  if (typeof content !== "string") {
    return { ok: false, error: "The scan did not return a milestone. Choose one yourself." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "The scan did not return a milestone. Choose one yourself." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "The scan did not return a milestone. Choose one yourself." };
  }

  const category = "category" in parsed && typeof parsed.category === "string" ? parsed.category : "";
  const severity = "severity" in parsed && typeof parsed.severity === "string" ? parsed.severity : "";
  const note = "note" in parsed && typeof parsed.note === "string" ? parsed.note.trim() : "";

  if (!isCategory(category) || !isSeverity(severity)) {
    return { ok: false, error: "The scan did not return a milestone. Choose one yourself." };
  }

  return {
    ok: true,
    category,
    severity,
    note: note.slice(0, 180) || `${category} · ${severity}`,
  };
}
