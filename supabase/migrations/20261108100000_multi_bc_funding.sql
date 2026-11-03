-- Multi-Business-Center funding. bc_connections stays one row per agency (it holds the TikTok login
-- token, which covers every BC the login administers); the BCs themselves are read live from TikTok.
-- Each top-up now records which BC the money came from.
ALTER TABLE public.fund_transfers ADD COLUMN IF NOT EXISTS bc_id TEXT;
ALTER TABLE public.fund_transfers ADD COLUMN IF NOT EXISTS bc_name TEXT;

-- Transfers made before this change all came from the agency's single saved BC.
UPDATE public.fund_transfers t
SET bc_id = c.bc_id, bc_name = c.bc_name
FROM public.bc_connections c
WHERE c.agency_id = t.agency_id AND t.bc_id IS NULL AND c.bc_id IS NOT NULL;

-- fund_transfers already grants table-wide SELECT to authenticated (agency admins via RLS),
-- so the new columns are readable without further grants.

-- Which Business Center administers (and so can fund) each ad account, kept fresh by tiktok-bc `balances`.
-- Lets a top-up request find the funding agency for an ad account. Written only by the service role.
CREATE TABLE IF NOT EXISTS public.bc_accounts (
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  bc_id TEXT NOT NULL,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, advertiser_id)
);
CREATE INDEX IF NOT EXISTS bc_accounts_advertiser_idx ON public.bc_accounts (advertiser_id);
ALTER TABLE public.bc_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins view BC accounts" ON public.bc_accounts;
CREATE POLICY "Agency admins view BC accounts" ON public.bc_accounts FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));

REVOKE ALL ON public.bc_accounts FROM anon, authenticated;
GRANT SELECT ON public.bc_accounts TO authenticated;
GRANT ALL ON public.bc_accounts TO service_role;
