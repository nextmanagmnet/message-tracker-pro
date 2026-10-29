-- WOB: Meta ad accounts/campaigns and the lead funnel stages
-- (new -> real -> qualified -> client, or not_lead).

-- ---------------------------------------------------------------------------
-- 1. Meta ad accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tenant_id UUID,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  dataset_id TEXT,
  dataset_name TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, ad_account_id)
);

ALTER TABLE public.meta_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view Meta accounts for their clients" ON public.meta_accounts;
CREATE POLICY "Users can view Meta accounts for their clients"
ON public.meta_accounts FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

-- Token stays server-side: column grants exclude access_token.
REVOKE ALL ON public.meta_accounts FROM anon, authenticated;
GRANT SELECT (id, tenant_id, client_id, ad_account_id, ad_account_name,
              dataset_id, dataset_name, token_expires_at, created_at, updated_at)
  ON public.meta_accounts TO authenticated;
GRANT ALL ON public.meta_accounts TO service_role;

DROP TRIGGER IF EXISTS update_meta_accounts_updated_at ON public.meta_accounts;
CREATE TRIGGER update_meta_accounts_updated_at
BEFORE UPDATE ON public.meta_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS wob_limits_meta_accounts ON public.meta_accounts;
CREATE TRIGGER wob_limits_meta_accounts
BEFORE INSERT OR UPDATE OF client_id ON public.meta_accounts
FOR EACH ROW EXECUTE FUNCTION public.wob_enforce_individual_limits();

-- ---------------------------------------------------------------------------
-- 2. Meta campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_account_id UUID REFERENCES public.meta_accounts(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  spend NUMERIC NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS meta_campaigns_meta_account_idx ON public.meta_campaigns (meta_account_id);

ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view Meta campaigns for their clients" ON public.meta_campaigns;
CREATE POLICY "Users can view Meta campaigns for their clients"
ON public.meta_campaigns FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

GRANT SELECT ON public.meta_campaigns TO authenticated;
GRANT ALL ON public.meta_campaigns TO service_role;

DROP TRIGGER IF EXISTS update_meta_campaigns_updated_at ON public.meta_campaigns;
CREATE TRIGGER update_meta_campaigns_updated_at
BEFORE UPDATE ON public.meta_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. TikTok campaign click/impression counts for the funnel view
-- ---------------------------------------------------------------------------
ALTER TABLE public.tiktok_campaigns
  ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. Lead funnel stage
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_stage' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.lead_stage AS ENUM ('new', 'real', 'qualified', 'client', 'not_lead');
  END IF;
END $$;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage public.lead_stage NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS stage_suggestion public.lead_stage,
  ADD COLUMN IF NOT EXISTS stage_confidence REAL,
  ADD COLUMN IF NOT EXISTS stage_evidence TEXT,
  ADD COLUMN IF NOT EXISTS order_value NUMERIC,
  ADD COLUMN IF NOT EXISTS order_currency TEXT,
  ADD COLUMN IF NOT EXISTS ad_platform TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_ad_platform_check') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_ad_platform_check CHECK (ad_platform IN ('tiktok', 'meta'));
  END IF;
END $$;

-- Backfill: trash -> not_lead, real -> real, everything else stays new.
UPDATE public.leads
SET stage = CASE
              WHEN status = 'trash' THEN 'not_lead'::public.lead_stage
              WHEN is_real THEN 'real'::public.lead_stage
              ELSE 'new'::public.lead_stage
            END,
    stage_updated_at = now()
WHERE stage = 'new';

CREATE INDEX IF NOT EXISTS leads_client_stage_idx ON public.leads (client_id, stage);
CREATE INDEX IF NOT EXISTS leads_client_campaign_idx ON public.leads (client_id, ad_platform, campaign_id);
