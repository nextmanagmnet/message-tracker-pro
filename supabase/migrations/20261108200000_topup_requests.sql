-- A user asks the agency that funds their ad account (through its Business Center) to add money.
-- Browsers can read but never write: requests are created, cancelled and declined by the topup-requests
-- edge function, and approved by tiktok-bc `fund` (which runs the existing transfer safety checks).
CREATE TABLE IF NOT EXISTS public.topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  funding_agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  advertiser_id text NOT NULL,
  advertiser_name text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  note text CHECK (char_length(note) <= 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'failed')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  fund_transfer_id uuid REFERENCES public.fund_transfers(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One open request per ad account, so nobody can flood the agency.
CREATE UNIQUE INDEX IF NOT EXISTS topup_requests_one_pending ON public.topup_requests (advertiser_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS topup_requests_agency_idx ON public.topup_requests (funding_agency_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS topup_requests_client_idx ON public.topup_requests (client_id, created_at DESC);

ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requester views own top-up requests" ON public.topup_requests;
CREATE POLICY "Requester views own top-up requests" ON public.topup_requests FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));

DROP POLICY IF EXISTS "Funding agency views top-up requests" ON public.topup_requests;
CREATE POLICY "Funding agency views top-up requests" ON public.topup_requests FOR SELECT TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), funding_agency_id, 'owner')
    OR public.has_agency_role((SELECT auth.uid()), funding_agency_id, 'admin'));

REVOKE ALL ON public.topup_requests FROM anon, authenticated;
GRANT SELECT ON public.topup_requests TO authenticated;
GRANT ALL ON public.topup_requests TO service_role;
