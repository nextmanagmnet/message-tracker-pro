import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSealed, open, seal } from "./secretBox.ts";
import { TOKEN_TABLES, withTokenCrypto } from "./tokenClient.ts";

// The service-role database client every server function uses. Stored TikTok tokens are encrypted when
// TOKEN_ENCRYPTION_KEY is set (see secretBox.ts); without it this is the plain client.
const keys = () => Deno.env.get("TOKEN_ENCRYPTION_KEY");
const codec = { seal: (v: string) => seal(v, keys()), open: (v: string) => open(v, keys()) };

export function adminClient(url: string, serviceKey: string): SupabaseClient {
  return withTokenCrypto(createClient(url, serviceKey), codec);
}

/** A token ready to hand to the database from outside the client (for example as a function argument). */
export const sealToken = (token: string) => seal(token, keys());

/**
 * Encrypts tokens that are still stored in plain text, a few at a time. Runs with the 15-minute sync, so turning the
 * key on converts everything within minutes and a newly connected account is covered by the wrapper anyway.
 */
export async function sealStoredTokens(): Promise<number> {
  if (!keys()) return 0;
  const raw = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let done = 0;
  for (const table of TOKEN_TABLES) {
    const { data } = await raw
      .from(table)
      .select("id, access_token, refresh_token")
      .not("access_token", "like", "enc:v1:%")
      .limit(100);
    for (const row of data ?? []) {
      const patch: Record<string, string> = { access_token: await seal(row.access_token, keys()) };
      if (row.refresh_token && !isSealed(row.refresh_token))
        patch.refresh_token = await seal(row.refresh_token, keys());
      const { error } = await raw.from(table).update(patch).eq("id", row.id);
      if (error) console.error("could not seal a stored token", table, error.message);
      else done++;
    }
  }
  return done;
}
