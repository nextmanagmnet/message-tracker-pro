-- Payment controls: limits only the agency OWNER can change, a daily transfer cap, and owner approval for large
-- manual payments. The goal is that no single login (a stolen password, or a staff member acting alone) can move
-- unlimited money or credit unlimited wallet balance.

-- ---------- Limits (owner-controlled) ----------
CREATE TABLE IF NOT EXISTS public.agency_limits (
  agency_id uuid PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  -- the most that may leave the Business Center in any rolling 24 hours (pending, sent and unresolved transfers)
  max_daily_transfer numeric(14,2) NOT NULL DEFAULT 5000 CHECK (max_daily_transfer > 0),
  -- a manual payment above this, recorded by anyone but the owner, waits for the owner's approval
  payment_approval_over numeric(14,2) NOT NULL DEFAULT 500 CHECK (payment_approval_over >= 0),
  -- the most manual payments (pending or approved) that may be recorded in any rolling 24 hours
  payment_daily_cap numeric(14,2) NOT NULL DEFAULT 10000 CHECK (payment_daily_cap > 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agency_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Funding staff view limits" ON public.agency_limits;
CREATE POLICY "Funding staff view limits" ON public.agency_limits FOR SELECT TO authenticated
USING (public.has_agency_permission((SELECT auth.uid()), agency_id, 'funding'));
REVOKE ALL ON public.agency_limits FROM anon, authenticated;
GRANT SELECT ON public.agency_limits TO authenticated;
GRANT ALL ON public.agency_limits TO service_role;

-- The limits that apply to an agency: its saved row, or the defaults.
CREATE OR REPLACE FUNCTION public.agency_limits_of(p_agency uuid)
RETURNS TABLE (max_daily_transfer numeric, payment_approval_over numeric, payment_daily_cap numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(l.max_daily_transfer, 5000), COALESCE(l.payment_approval_over, 500), COALESCE(l.payment_daily_cap, 10000)
  FROM (SELECT 1) d LEFT JOIN public.agency_limits l ON l.agency_id = p_agency
$$;
REVOKE EXECUTE ON FUNCTION public.agency_limits_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_limits_of(uuid) TO service_role;

-- ---------- Daily transfer cap, inside the atomic "record a transfer" step ----------
CREATE OR REPLACE FUNCTION public.begin_fund_transfer(
  p_agency uuid, p_client uuid, p_advertiser text, p_name text, p_bc_id text, p_bc_name text,
  p_amount numeric, p_by uuid
) RETURNS TABLE (out_id uuid, out_request_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_cap numeric; v_used numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_agency::text || ':' || p_advertiser, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('daily:' || p_agency::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.fund_transfers t
    WHERE t.agency_id = p_agency AND t.advertiser_id = p_advertiser
      AND t.status IN ('pending', 'unknown') AND t.created_at >= now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'unresolved';
  END IF;
  SELECT l.max_daily_transfer INTO v_cap FROM public.agency_limits_of(p_agency) l;
  SELECT COALESCE(sum(t.amount), 0) INTO v_used FROM public.fund_transfers t
   WHERE t.agency_id = p_agency AND t.status IN ('pending', 'sent', 'unknown') AND t.created_at >= now() - interval '24 hours';
  IF v_used + p_amount > v_cap THEN
    RAISE EXCEPTION 'daily_limit' USING DETAIL = v_used::text || '/' || v_cap::text;
  END IF;
  RETURN QUERY
    INSERT INTO public.fund_transfers
      (agency_id, client_id, advertiser_id, advertiser_name, bc_id, bc_name, amount, type, status, created_by)
    VALUES (p_agency, p_client, p_advertiser, p_name, p_bc_id, p_bc_name, p_amount, 'RECHARGE', 'pending', p_by)
    RETURNING public.fund_transfers.id, public.fund_transfers.request_id;
END $$;

-- ---------- Manual payments: a register, with owner approval above the threshold ----------
CREATE TABLE IF NOT EXISTS public.wallet_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_name text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  reference text NOT NULL CHECK (char_length(reference) <= 100), -- the bank reference, or the form's one-time key
  note text CHECK (char_length(note) <= 300),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  recorded_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  entry_id uuid REFERENCES public.wallet_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A bank reference counts once, whoever records it.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_payments_reference_once ON public.wallet_payments (reference) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS wallet_payments_agency_idx ON public.wallet_payments (agency_id, created_at DESC);
ALTER TABLE public.wallet_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Funding staff view payments" ON public.wallet_payments;
CREATE POLICY "Funding staff view payments" ON public.wallet_payments FOR SELECT TO authenticated
USING (public.has_agency_permission((SELECT auth.uid()), agency_id, 'funding'));
REVOKE ALL ON public.wallet_payments FROM anon, authenticated;
GRANT SELECT ON public.wallet_payments TO authenticated;
GRANT ALL ON public.wallet_payments TO service_role;

-- Records a payment. The owner's, or one at/below the threshold, credits the wallet at once; a larger one from
-- anyone else waits as 'pending'. Both count toward the daily cap. Retrying the same payment never credits twice.
CREATE OR REPLACE FUNCTION public.record_wallet_payment(
  p_agency uuid, p_client uuid, p_client_name text, p_amount numeric, p_currency text, p_bank_ref text,
  p_key text, p_note text, p_by uuid, p_is_owner boolean
) RETURNS TABLE (out_id uuid, out_status text, out_balance numeric, out_duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  lim record; v_used numeric; r public.wallet_payments; v_ref text; v_status text; w record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payments:' || p_agency::text, 0));
  v_ref := COALESCE(NULLIF(trim(p_bank_ref), ''), p_key);

  SELECT * INTO r FROM public.wallet_payments wp WHERE wp.reference = v_ref AND wp.status <> 'rejected' LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT r.id, r.status, COALESCE((SELECT x.balance FROM public.wallets x WHERE x.client_id = p_client), 0::numeric), true;
    RETURN;
  END IF;

  SELECT * INTO lim FROM public.agency_limits_of(p_agency);
  SELECT COALESCE(sum(wp.amount), 0) INTO v_used FROM public.wallet_payments wp
   WHERE wp.agency_id = p_agency AND wp.status IN ('pending', 'approved') AND wp.created_at >= now() - interval '24 hours';
  IF v_used + p_amount > lim.payment_daily_cap THEN
    RAISE EXCEPTION 'payment_cap' USING DETAIL = v_used::text || '/' || lim.payment_daily_cap::text;
  END IF;

  v_status := CASE WHEN p_is_owner OR p_amount <= lim.payment_approval_over THEN 'approved' ELSE 'pending' END;
  INSERT INTO public.wallet_payments
    (agency_id, client_id, client_name, amount, currency, reference, note, status, recorded_by, decided_by, decided_at)
  VALUES (p_agency, p_client, p_client_name, p_amount, p_currency, v_ref, p_note, v_status, p_by,
          CASE WHEN v_status = 'approved' THEN p_by END, CASE WHEN v_status = 'approved' THEN now() END)
  RETURNING * INTO r;

  IF v_status = 'approved' THEN
    SELECT * INTO w FROM public.wallet_apply(p_client, p_amount, 'topup', 'manual', v_ref, p_note, p_by, NULL);
    IF w.out_duplicate THEN
      -- that reference was credited before the register existed: nothing changed, so don't list it as a payment
      UPDATE public.wallet_payments SET status = 'rejected', decided_at = now() WHERE id = r.id;
      RETURN QUERY SELECT r.id, 'rejected'::text, w.out_balance, true;
      RETURN;
    END IF;
    UPDATE public.wallet_payments SET entry_id = (
      SELECT e.id FROM public.wallet_entries e WHERE e.provider = 'manual' AND e.provider_ref = v_ref
    ) WHERE id = r.id;
    RETURN QUERY SELECT r.id, v_status, w.out_balance, w.out_duplicate;
  ELSE
    RETURN QUERY SELECT r.id, v_status, COALESCE((SELECT x.balance FROM public.wallets x WHERE x.client_id = p_client), 0::numeric), false;
  END IF;
END $$;

-- The owner's decision on a waiting payment. Nobody approves their own.
CREATE OR REPLACE FUNCTION public.decide_wallet_payment(p_id uuid, p_approve boolean, p_by uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.wallet_payments; w record;
BEGIN
  SELECT * INTO r FROM public.wallet_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF p_by = r.recorded_by THEN RAISE EXCEPTION 'self_approval'; END IF;
  IF NOT p_approve THEN
    UPDATE public.wallet_payments SET status = 'rejected', decided_by = p_by, decided_at = now() WHERE id = p_id;
    RETURN 'rejected';
  END IF;
  SELECT * INTO w FROM public.wallet_apply(r.client_id, r.amount, 'topup', 'manual', r.reference, r.note, p_by, NULL);
  IF w.out_duplicate THEN RAISE EXCEPTION 'duplicate_reference'; END IF;
  UPDATE public.wallet_payments SET status = 'approved', decided_by = p_by, decided_at = now(), entry_id = (
    SELECT e.id FROM public.wallet_entries e WHERE e.provider = 'manual' AND e.provider_ref = r.reference
  ) WHERE id = p_id;
  RETURN 'approved';
END $$;

REVOKE EXECUTE ON FUNCTION public.record_wallet_payment(uuid, uuid, text, numeric, text, text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decide_wallet_payment(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wallet_payment(uuid, uuid, text, numeric, text, text, text, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_wallet_payment(uuid, boolean, uuid) TO service_role;
