-- WOB wallet: users load money once (bank transfer today, any payment gateway later), and ad-account top-up
-- requests spend from it. Every rule that protects money lives here, in the database, so no caller can skip it:
--   * one append-only ledger (wallet_entries); the balance can never go negative;
--   * a credit with a provider reference (gateway payment id / bank reference) is applied once, however often
--     the notice arrives;
--   * creating a top-up request, charging the fee and debiting the wallet is ONE atomic step, and a decline,
--     cancel or failed transfer refunds in one atomic step.
-- Browsers can read their own wallet; everything that changes money runs through the functions below
-- (service role only).

CREATE TABLE IF NOT EXISTS public.wallets (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  -- What the user quotes when paying by bank transfer, so the agency can credit the right wallet.
  reference_code text NOT NULL UNIQUE DEFAULT ('W-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount <> 0), -- positive = money in, negative = money out
  balance_after numeric(14,2) NOT NULL CHECK (balance_after >= 0),
  kind text NOT NULL CHECK (kind IN ('topup', 'request', 'refund', 'adjustment')),
  provider text,      -- 'manual', 'stripe', 'tap', ...
  provider_ref text,  -- the gateway's payment id or the bank reference
  request_id uuid REFERENCES public.topup_requests(id) ON DELETE SET NULL,
  note text CHECK (char_length(note) <= 300),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The same payment can be reported twice (webhook retries); it is credited once.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_entries_provider_ref ON public.wallet_entries (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_entries_client_idx ON public.wallet_entries (client_id, created_at DESC);

-- A ledger is never edited.
CREATE OR REPLACE FUNCTION public.wallet_entries_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_entries is append-only';
END $$;
DROP TRIGGER IF EXISTS wallet_entries_no_change ON public.wallet_entries;
CREATE TRIGGER wallet_entries_no_change BEFORE UPDATE OR DELETE ON public.wallet_entries
FOR EACH ROW EXECUTE FUNCTION public.wallet_entries_immutable();

-- Per funding agency: what it charges on top of a top-up, and how users pay it.
CREATE TABLE IF NOT EXISTS public.agency_wallet_settings (
  agency_id uuid PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_percent BETWEEN 0 AND 50),
  flat_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (flat_fee >= 0),
  min_topup numeric(10,2) NOT NULL DEFAULT 10 CHECK (min_topup > 0),
  payment_instructions text CHECK (char_length(payment_instructions) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Top-up requests now carry the fee and the wallet entries, and can be mid-approval.
ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  ADD COLUMN IF NOT EXISTS wallet_entry_id uuid REFERENCES public.wallet_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_entry_id uuid REFERENCES public.wallet_entries(id) ON DELETE SET NULL;
ALTER TABLE public.topup_requests DROP CONSTRAINT IF EXISTS topup_requests_status_check;
ALTER TABLE public.topup_requests ADD CONSTRAINT topup_requests_status_check
  CHECK (status IN ('pending', 'approving', 'approved', 'declined', 'cancelled', 'failed'));
-- 'approving' = the transfer is being sent: nobody can cancel or decline it now, and no second request can open.
DROP INDEX IF EXISTS public.topup_requests_one_pending;
CREATE UNIQUE INDEX topup_requests_one_pending ON public.topup_requests (advertiser_id)
  WHERE status IN ('pending', 'approving');

-- ---------- Security ----------
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_wallet_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view wallet" ON public.wallets;
CREATE POLICY "Members view wallet" ON public.wallets FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));
DROP POLICY IF EXISTS "Members view wallet entries" ON public.wallet_entries;
CREATE POLICY "Members view wallet entries" ON public.wallet_entries FOR SELECT TO authenticated
USING (public.user_can_access_client((SELECT auth.uid()), client_id));
DROP POLICY IF EXISTS "Agency admins manage wallet settings" ON public.agency_wallet_settings;
CREATE POLICY "Agency admins manage wallet settings" ON public.agency_wallet_settings FOR ALL TO authenticated
USING (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'))
WITH CHECK (public.has_agency_role((SELECT auth.uid()), agency_id, 'owner') OR public.has_agency_role((SELECT auth.uid()), agency_id, 'admin'));

REVOKE ALL ON public.wallets, public.wallet_entries, public.agency_wallet_settings FROM anon, authenticated;
GRANT SELECT ON public.wallets, public.wallet_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agency_wallet_settings TO authenticated;
REVOKE ALL ON public.wallets, public.wallet_entries, public.agency_wallet_settings FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.wallets TO service_role;
GRANT SELECT, INSERT ON public.wallet_entries TO service_role;
GRANT ALL ON public.agency_wallet_settings TO service_role;

-- ---------- The only ways money moves ----------

-- One ledger entry, with the wallet row locked so two writers can't race. Returns the new balance, and whether
-- this provider reference was already applied (then nothing changes).
CREATE OR REPLACE FUNCTION public.wallet_apply(
  p_client uuid, p_amount numeric, p_kind text, p_provider text, p_provider_ref text,
  p_note text, p_by uuid, p_request uuid
) RETURNS TABLE (out_balance numeric, out_duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.wallets; v_new numeric;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN RAISE EXCEPTION 'amount_zero'; END IF;
  INSERT INTO public.wallets (client_id) VALUES (p_client) ON CONFLICT (client_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE client_id = p_client FOR UPDATE;
  IF p_provider_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wallet_entries e WHERE e.provider = p_provider AND e.provider_ref = p_provider_ref
  ) THEN
    RETURN QUERY SELECT w.balance, true;
    RETURN;
  END IF;
  v_new := w.balance + p_amount;
  IF v_new < 0 THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  INSERT INTO public.wallet_entries (client_id, amount, balance_after, kind, provider, provider_ref, request_id, note, created_by)
  VALUES (p_client, p_amount, v_new, p_kind, p_provider, p_provider_ref, p_request, p_note, p_by);
  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE client_id = p_client;
  RETURN QUERY SELECT v_new, false;
END $$;

-- The fee a funding agency charges on top of an amount.
CREATE OR REPLACE FUNCTION public.topup_fee(p_agency uuid, p_amount numeric) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT round(p_amount * s.commission_percent / 100 + s.flat_fee, 2)
                   FROM public.agency_wallet_settings s WHERE s.agency_id = p_agency), 0);
$$;

-- Creates the request, charges the fee and debits the wallet as one step: all of it or none of it.
CREATE OR REPLACE FUNCTION public.create_topup_request(
  p_client uuid, p_agency uuid, p_advertiser text, p_advertiser_name text, p_by uuid,
  p_amount numeric, p_currency text, p_note text, p_client_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE w public.wallets; v_fee numeric; v_total numeric; v_req uuid; v_min numeric;
BEGIN
  SELECT s.min_topup INTO v_min FROM public.agency_wallet_settings s WHERE s.agency_id = p_agency;
  IF p_amount < COALESCE(v_min, 1) THEN RAISE EXCEPTION 'below_minimum'; END IF;
  v_fee := public.topup_fee(p_agency, p_amount);
  v_total := p_amount + v_fee;
  INSERT INTO public.wallets (client_id) VALUES (p_client) ON CONFLICT (client_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE client_id = p_client FOR UPDATE;
  IF w.currency <> p_currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  IF w.balance < v_total THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  INSERT INTO public.topup_requests
    (client_id, client_name, funding_agency_id, advertiser_id, advertiser_name, requested_by, amount, currency, note, fee)
  VALUES (p_client, p_client_name, p_agency, p_advertiser, p_advertiser_name, p_by, p_amount, p_currency, p_note, v_fee)
  RETURNING id INTO v_req;
  PERFORM public.wallet_apply(p_client, -v_total, 'request', NULL, NULL, 'Top-up request', p_by, v_req);
  UPDATE public.topup_requests SET wallet_entry_id = (
    SELECT e.id FROM public.wallet_entries e WHERE e.request_id = v_req AND e.kind = 'request'
    ORDER BY e.created_at DESC LIMIT 1
  ) WHERE id = v_req;
  RETURN v_req;
END $$;

-- Ends a pending request without a transfer (declined / cancelled / failed) and refunds the wallet in the same step.
CREATE OR REPLACE FUNCTION public.settle_topup_request(p_request uuid, p_outcome text, p_by uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.topup_requests;
BEGIN
  IF p_outcome NOT IN ('declined', 'cancelled', 'failed') THEN RAISE EXCEPTION 'bad_outcome'; END IF;
  SELECT * INTO r FROM public.topup_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  UPDATE public.topup_requests SET status = p_outcome, decided_by = p_by, decided_at = now() WHERE id = p_request;
  IF r.wallet_entry_id IS NOT NULL THEN
    PERFORM public.wallet_apply(r.client_id, r.amount + r.fee, 'refund', NULL, NULL, 'Refund: request ' || p_outcome, p_by, p_request);
    UPDATE public.topup_requests SET refund_entry_id = (
      SELECT e.id FROM public.wallet_entries e WHERE e.request_id = p_request AND e.kind = 'refund'
      ORDER BY e.created_at DESC LIMIT 1
    ) WHERE id = p_request;
  END IF;
  RETURN p_outcome;
END $$;

REVOKE EXECUTE ON FUNCTION public.wallet_apply(uuid, numeric, text, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.topup_fee(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_topup_request(uuid, uuid, text, text, uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_topup_request(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, numeric, text, text, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.topup_fee(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_topup_request(uuid, uuid, text, text, uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_topup_request(uuid, text, uuid) TO service_role;
