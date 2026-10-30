-- TikTok Business Center funding: each agency connects its own Business Center and tops up
-- its clients' ad accounts from the platform. WOB never holds the money; it only calls TikTok's
-- /bc/transfer/ with the agency's own authorization and keeps the audit trail.
CREATE TABLE IF NOT EXISTS public.bc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL UNIQUE REFERENCES public.agencies(id) ON DELETE CASCADE, -- one Business Center per agency for now
  bc_id TEXT,
  bc_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  max_transfer NUMERIC(14,2) NOT NULL DEFAULT 1000 CHECK (max_transfer > 0), -- cap per single top-up
  connected_by UUID,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bc_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins view BC connection" ON public.bc_connections;
CREATE POLICY "Agency admins view BC connection" ON public.bc_connections FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));

-- Tokens never reach the browser: column grants, service role does the rest.
REVOKE ALL ON public.bc_connections FROM anon, authenticated;
GRANT SELECT (id, agency_id, bc_id, bc_name, max_transfer, connected_at) ON public.bc_connections TO authenticated;
GRANT ALL ON public.bc_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.fund_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  advertiser_id TEXT NOT NULL,
  advertiser_name TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL DEFAULT 'RECHARGE' CHECK (type IN ('RECHARGE', 'REFUND')),
  request_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- sent to TikTok so a repeat can't double-fund
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'unknown')),
  response JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fund_transfers_agency_idx ON public.fund_transfers (agency_id, created_at DESC);
ALTER TABLE public.fund_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency admins view transfers" ON public.fund_transfers;
CREATE POLICY "Agency admins view transfers" ON public.fund_transfers FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));

REVOKE ALL ON public.fund_transfers FROM anon, authenticated;
GRANT SELECT ON public.fund_transfers TO authenticated;
GRANT ALL ON public.fund_transfers TO service_role;
