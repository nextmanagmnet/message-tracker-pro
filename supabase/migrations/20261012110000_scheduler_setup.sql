-- Folded in from the retired drizzle migrations (0000_scheduler_setup,
-- 0001_drop_legacy_tenant_fks). Production already has all of this; every
-- statement is idempotent so re-running it is a no-op.
--
-- Timestamp sits just before 20261012120000_schedule_background_jobs (first
-- user of cron/net/scheduler_config) and after 20251222135857 (agency_members,
-- agency_role, user_in_agency used by get_agency_members). It must also run
-- before 20261029100000_wob_foundation, whose DROP TABLE tenants fails while
-- the tenant_id FKs below still exist.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Shared secret for pg_cron -> edge function calls. Service role only.
CREATE TABLE IF NOT EXISTS public.scheduler_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cron_token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.scheduler_config TO service_role;
ALTER TABLE public.scheduler_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.scheduler_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY,
  new_verified BOOLEAN NOT NULL DEFAULT true,
  daily_summary BOOLEAN NOT NULL DEFAULT true,
  campaign_alerts BOOLEAN NOT NULL DEFAULT false,
  number_status BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notification_preferences'
      AND policyname = 'Users manage own notification prefs'
  ) THEN
    CREATE POLICY "Users manage own notification prefs" ON public.notification_preferences
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Create-only: 20261102100100_client_users later replaces this body (excludes
-- 'client' members), so a plain CREATE OR REPLACE here would revert production.
DO $outer$
BEGIN
  IF to_regprocedure('public.get_agency_members(uuid)') IS NULL THEN
    CREATE FUNCTION public.get_agency_members(_agency_id uuid)
    RETURNS TABLE(member_id uuid, user_id uuid, role agency_role, email text, full_name text, created_at timestamptz)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT am.id, am.user_id, am.role, p.email, p.full_name, am.created_at
      FROM public.agency_members am
      LEFT JOIN public.profiles p ON p.id = am.user_id
      WHERE am.agency_id = _agency_id
        AND public.user_in_agency(auth.uid(), _agency_id)
      ORDER BY am.created_at
    $$;
  END IF;
END $outer$;
GRANT EXECUTE ON FUNCTION public.get_agency_members(uuid) TO authenticated;

-- Legacy tenant model: tenant_id now holds agency_id, so the FKs to tenants go.
ALTER TABLE public.whatsapp_numbers DROP CONSTRAINT IF EXISTS whatsapp_numbers_tenant_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_tenant_id_fkey;
ALTER TABLE public.tiktok_accounts DROP CONSTRAINT IF EXISTS tiktok_accounts_tenant_id_fkey;
ALTER TABLE public.tiktok_campaigns DROP CONSTRAINT IF EXISTS tiktok_campaigns_tenant_id_fkey;
COMMENT ON COLUMN public.whatsapp_numbers.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.leads.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.tiktok_accounts.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
COMMENT ON COLUMN public.tiktok_campaigns.tenant_id IS 'DEPRECATED: legacy; holds agency_id. Use client_id.';
