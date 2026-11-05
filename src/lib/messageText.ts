// What a customer's message looks like to people: WOB's own tracking codes are removed. The ad link hides a click
// reference in invisible characters, and older links put readable codes (ttclid=…, cid=…) in the text. The stored
// message keeps them (attribution reads them); only what is displayed is cleaned.
// Keep the code names in sync with extractClidFromText / extractCampaignCode / extractFbclid in
// supabase/functions/_shared/funnel.ts.

const INVISIBLE = new RegExp("[\u200b-\u200d\u2060\ufeff]", "g");
const CODES = /\b(?:ttclid|ctwa_clid|fbclid)\s*[=:]\s*[\w.-]+|\b(?:cid|clid)\s*=\s*[\w.-]+/gi;

export function cleanMessage(text: string | null | undefined): string {
  return (text ?? "")
    .replace(INVISIBLE, "")
    .replace(CODES, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
