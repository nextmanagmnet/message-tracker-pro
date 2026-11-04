import { authorizeClient, serviceClient } from "../_shared/auth.ts";
import { advertiserBalance } from "../_shared/bcAccounts.ts";
import { json } from "../_shared/cron.ts";
import { TikTokApiError, tiktokApi } from "../_shared/tiktokApi.ts";
import type { TikTokContext } from "./types.ts";

interface AdvertiserInfo {
  advertiser_id: string;
  name?: string;
  balance?: number | string;
  currency?: string;
  status?: string;
  role?: string;
}

// Ad account balances for the client's connected TikTok accounts, read live from TikTok. Any member of the
// client may call it (client users see their own balance); it changes nothing.
export async function balance({ req, parsedBody }: TikTokContext): Promise<Response> {
  const clientId = parsedBody?.clientId;
  if (typeof clientId !== "string" || !clientId) return json({ error: "Client ID is required" }, 400);
  const auth = await authorizeClient(req, clientId);
  if (auth instanceof Response) return auth;

  const db = serviceClient();
  const { data: accounts } = await db
    .from("tiktok_accounts")
    .select("advertiser_id, advertiser_name, access_token, managed_by_agency_id")
    .eq("client_id", clientId);

  const results = await Promise.all(
    (accounts ?? []).map(async (a) => {
      const base = { advertiserId: a.advertiser_id, name: a.advertiser_name };
      try {
        const data = await tiktokApi<{ list?: AdvertiserInfo[] }>("advertiser/info/", a.access_token, {
          params: { advertiser_ids: JSON.stringify([a.advertiser_id]) },
        });
        const info = data.list?.[0];
        let amount = Number(info?.balance);
        let currency = info?.currency ?? null;
        // An account an agency manages is paid from the agency's Business Center, where its credit is held.
        let underBc = info?.role === "ROLE_CHILD_ADVERTISER";
        if (a.managed_by_agency_id) {
          underBc = true;
          const { data: bc } = await db
            .from("bc_accounts")
            .select("bc_id")
            .eq("agency_id", a.managed_by_agency_id)
            .eq("advertiser_id", a.advertiser_id)
            .maybeSingle();
          const credit = bc
            ? await advertiserBalance(bc.bc_id, a.access_token, a.advertiser_id).catch(() => null)
            : null;
          if (credit?.balance != null) {
            amount = credit.balance;
            currency = credit.currency ?? currency;
          }
        }
        return {
          ...base,
          name: info?.name ?? a.advertiser_name,
          amount: Number.isFinite(amount) ? amount : null,
          currency,
          status: info?.status ?? null,
          // ROLE_CHILD_ADVERTISER = the account sits under a Business Center, which pays for it.
          underBusinessCenter: underBc,
          error: null,
        };
      } catch (e) {
        const reconnect = e instanceof TikTokApiError && e.code === 40001;
        return {
          ...base,
          amount: null,
          currency: null,
          status: null,
          underBusinessCenter: false,
          error: reconnect ? "reconnect" : "unavailable",
        };
      }
    }),
  );
  return json({ accounts: results });
}
