-- Meta via Pixel ID + pasted tokens (no Facebook login / App Review).
-- One meta_accounts row per client:
--   dataset_id + capi_token  -> send conversions to the client's pixel (Conversions API)
--   ad_account_id + ads_token -> OPTIONAL read-only token for campaign names/spend
-- Tokens never reach the browser: column grants below exclude them.

-- Carry over anything connected through the old login flow, drop placeholders.
DELETE FROM public.meta_accounts WHERE ad_account_id = 'pending';

ALTER TABLE public.meta_accounts
  ADD COLUMN IF NOT EXISTS capi_token TEXT,
  ADD COLUMN IF NOT EXISTS ads_token TEXT;

UPDATE public.meta_accounts
SET ads_token = COALESCE(ads_token, access_token),
    ad_account_id = regexp_replace(ad_account_id, '^act_', '')
WHERE access_token IS NOT NULL;

ALTER TABLE public.meta_accounts ALTER COLUMN ad_account_id DROP NOT NULL;

-- One row per client (keep the newest if the old flow left several).
DELETE FROM public.meta_accounts a USING public.meta_accounts b
WHERE a.client_id = b.client_id AND (a.created_at, a.id) < (b.created_at, b.id);

ALTER TABLE public.meta_accounts DROP CONSTRAINT IF EXISTS meta_accounts_client_id_ad_account_id_key;
ALTER TABLE public.meta_accounts DROP CONSTRAINT IF EXISTS meta_accounts_client_id_key;
ALTER TABLE public.meta_accounts ADD CONSTRAINT meta_accounts_client_id_key UNIQUE (client_id);

ALTER TABLE public.meta_accounts DROP COLUMN IF EXISTS access_token;

-- The Individual plan already allows a single client, and UNIQUE(client_id) now caps
-- Meta at one connection per client, so the per-agency Meta limit trigger is redundant.
DROP TRIGGER IF EXISTS wob_limits_meta_accounts ON public.meta_accounts;

REVOKE ALL ON public.meta_accounts FROM anon, authenticated;
GRANT SELECT (id, tenant_id, client_id, ad_account_id, ad_account_name,
              dataset_id, dataset_name, token_expires_at, created_at, updated_at)
  ON public.meta_accounts TO authenticated;
GRANT ALL ON public.meta_accounts TO service_role;

-- fbclid found in the first WhatsApp message (website-click ads) -> fbc for matching.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fbclid TEXT;
