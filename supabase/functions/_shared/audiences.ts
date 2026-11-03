// TikTok Customer File audiences built from a client's real buyers / qualified leads.
// Pure helpers plus the one multipart call tiktokApi() can't make. Relative imports only (Vitest runs this).
import { TIKTOK_API, TikTokApiError } from "./tiktokApi.ts";

export type AudienceSource = "buyers" | "qualified";
export type LookalikeSize = "NARROW" | "BALANCED" | "BROAD";

export const SOURCE_STAGES: Record<AudienceSource, string[]> = {
  buyers: ["client"],
  qualified: ["qualified", "client"],
};
export const LOOKALIKE_SIZES: LookalikeSize[] = ["NARROW", "BALANCED", "BROAD"];

// TikTok won't deliver to, or build a lookalike from, a seed under 1,000 matched people (verified live:
// "Seed audience size needs to be at lease 1000"). Smaller audiences are still created and keep growing.
export const MIN_AUDIENCE_SIZE = 1000;

export const isSource = (v: unknown): v is AudienceSource => v === "buyers" || v === "qualified";
export const isLookalikeSize = (v: unknown): v is LookalikeSize => LOOKALIKE_SIZES.includes(v as LookalikeSize);

// "9665xxxxxxxx[:device]@s.whatsapp.net" -> "+9665xxxxxxxx" (E.164). Anything not 8–15 digits is not a phone.
export function e164FromJid(jid: string | null | undefined): string | null {
  const digits = String(jid ?? "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// TikTok's PHONE_SHA256: lowercase hex SHA-256 of the E.164 number with "+", same as conversions.ts.
// One hash per line, de-duplicated and sorted so the same members always give the same file.
export async function membersFile(jids: (string | null | undefined)[]): Promise<{ csv: string; count: number }> {
  const phones = [...new Set(jids.map(e164FromJid).filter((p): p is string => p !== null))];
  const hashes = (await Promise.all(phones.map(sha256Hex))).sort();
  return { csv: hashes.join("\n"), count: hashes.length };
}

// Codes TikTok returns for a missing/expired token or a scope the stored token was never granted.
const RECONNECT_CODES = new Set([40001, 40100, 40101, 40102, 40104, 40105]);
export function needsReconnect(code: number, message: string): boolean {
  return RECONNECT_CODES.has(code) || /permission|scope|access token|unauthori/i.test(message);
}

// POST dmp/custom_audience/file/upload/ (multipart). fileMd5 is TikTok's file_signature. Returns file_path.
export async function uploadAudienceFile(
  token: string,
  advertiserId: string,
  csv: string,
  fileMd5: string,
): Promise<string> {
  const path = "dmp/custom_audience/file/upload/";
  const form = new FormData();
  form.set("advertiser_id", advertiserId);
  form.set("calculate_type", "PHONE_SHA256");
  form.set("file_signature", fileMd5);
  form.set("file", new Blob([csv], { type: "text/csv" }), "members.csv");
  const res = await fetch(`${TIKTOK_API}/${path}`, {
    method: "POST",
    headers: { "Access-Token": token },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({ code: -1, message: `Unreadable response (${res.status})` }))) as {
    code?: number;
    message?: string;
    data?: { file_path?: string };
  };
  if (json.code !== 0 || !json.data?.file_path)
    throw new TikTokApiError(path, json.code ?? -1, json.message ?? "Upload failed");
  return json.data.file_path;
}
