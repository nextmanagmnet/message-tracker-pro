import type { Tables } from "@/integrations/supabase/types";
import { invokeFn } from "@/components/leads/shared";

// Shapes returned by the tiktok-ads edge function.
export type Identity = { id: string; type: string; bcId: string | null; name: string | null };
export type LibraryVideo = { id: string; name: string | null; cover: string | null };
export type Region = { id: string; name: string; code: string; level: string };
export type Gender = "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE";

export type Options = {
  identities: Identity[];
  videos: LibraryVideo[];
  numbers: { id: string; phone_number: string }[];
  pixel: { pixelCode: string } | null;
  pixelError: string | null;
  balance: { amount: number; currency: string } | null;
  country: string | null;
  ctas: string[];
  maxBudget: number;
  reconnect: { identities: boolean; library: boolean; upload: boolean; ads: boolean };
};

export type Suggestion = {
  texts: string[];
  message: string;
  countryCode: string | null;
  ageMin: number;
  ageMax: number;
  gender: Gender;
};

export type AdReview = {
  adId: string;
  name: string | null;
  status: string | null;
  approved: boolean | null;
  reasons: string[];
};

export type Launch = Tables<"ad_launches">;
export type AdMedia = Tables<"ad_media">;

// What the wizard shows from the client's own tables. Read through the server so an agency running ads for a
// linked user never needs access to that user's data.
export type Workspace = {
  launches: Launch[];
  media: AdMedia[];
  products: { id: string; name: string; videos: string[] }[];
};
export const loadWorkspace = (clientId: string) => invokeFn<Workspace>("tiktok-ads", { action: "workspace", clientId });

export const MIN_BUDGET = 20;
export const MAX_TEXT = 100;

// The launch's params as the server stores them (a subset the UI shows).
export function launchParams(l: Launch): { name: string; dailyBudget: number | null; operation: string | null } {
  const p = (l.params && typeof l.params === "object" && !Array.isArray(l.params) ? l.params : {}) as Record<
    string,
    unknown
  >;
  return {
    name: typeof p.name === "string" ? p.name : "—",
    dailyBudget: typeof p.dailyBudget === "number" ? p.dailyBudget : null,
    operation: typeof p.operation === "string" ? p.operation : null,
  };
}

// TikTok status enums (AD_STATUS_NOT_PASS, CAMPAIGN_STATUS_DISABLE…) as short readable text.
export const readableStatus = (s: string | null) =>
  s
    ? s
        .replace(/^(AD|ADGROUP|CAMPAIGN)_STATUS_/, "")
        .replace(/_/g, " ")
        .toLowerCase()
    : "—";
