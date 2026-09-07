ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS referral_headline TEXT,
  ADD COLUMN IF NOT EXISTS attribution_source TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS quality_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_repeat_lead BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS click_to_message_seconds INTEGER;

CREATE INDEX IF NOT EXISTS leads_ctwa_clid_idx ON public.leads (ctwa_clid);
CREATE INDEX IF NOT EXISTS leads_phone_hash_idx ON public.leads (sender_phone_hash);
CREATE INDEX IF NOT EXISTS leads_client_created_idx ON public.leads (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.integration_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_jobs TO authenticated;
GRANT ALL ON public.integration_jobs TO service_role;

ALTER TABLE public.integration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view jobs for their agency"
ON public.integration_jobs FOR SELECT TO authenticated
USING (
  (agency_id IS NOT NULL AND public.user_in_agency(auth.uid(), agency_id))
  OR (client_id IS NOT NULL AND public.user_can_access_client(auth.uid(), client_id))
);

CREATE TRIGGER update_integration_jobs_updated_at
BEFORE UPDATE ON public.integration_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS integration_jobs_name_started_idx ON public.integration_jobs (job_name, started_at DESC);