-- Payment security hardening. Everything here only removes access or adds a safeguard.

-- 1. Anonymous callers (anyone holding the public API key) have no business with tables. Older tables kept the
--    platform's default "anon can do everything" grants and relied on row-level security alone. The only anonymous
--    entry the app needs is the click-tracking function (record_ad_click), whose execute grant is untouched.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 2. Invite hashes are only ever read by server functions; browsers get nothing from this table.
REVOKE SELECT ON public.ad_account_invites FROM authenticated;

-- 3. A browser can only ask about its own permissions (it used to be able to probe any user id).
CREATE OR REPLACE FUNCTION public.has_agency_permission(_user_id UUID, _agency_id UUID, _perm TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = _user_id AND m.agency_id = _agency_id
      AND (m.role = 'owner'
           OR (m.role = 'admin' AND (m.permissions IS NULL OR _perm = ANY (m.permissions))))
  )
  AND (auth.role() IS DISTINCT FROM 'authenticated' OR _user_id = (SELECT auth.uid()))
$$;

-- 4. Only the user's own owner, admin or client login can switch campaign management for their agency
--    (not a read-only viewer of that workspace).
CREATE OR REPLACE FUNCTION public.set_link_run_ads(p_client uuid, p_allow boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_agency uuid;
BEGIN
  SELECT c.agency_id INTO v_agency FROM public.clients c WHERE c.id = p_client;
  IF v_agency IS NULL OR NOT (
       public.is_client_user_of((SELECT auth.uid()), p_client)
       OR public.has_agency_permission((SELECT auth.uid()), v_agency, 'clients')
     ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  UPDATE public.agency_client_links SET can_run_ads = p_allow WHERE client_id = p_client AND status = 'active';
END $$;

-- 5. Sending money: "is a transfer for this account still unresolved?" and "record this one" are ONE step.
--    Before, two simultaneous clicks (or two staff) could both pass the check and both send. The lock serialises
--    them, so the second sees the first's pending row and is refused.
CREATE OR REPLACE FUNCTION public.begin_fund_transfer(
  p_agency uuid, p_client uuid, p_advertiser text, p_name text, p_bc_id text, p_bc_name text,
  p_amount numeric, p_by uuid
) RETURNS TABLE (out_id uuid, out_request_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_agency::text || ':' || p_advertiser, 0));
  IF EXISTS (
    SELECT 1 FROM public.fund_transfers t
    WHERE t.agency_id = p_agency AND t.advertiser_id = p_advertiser
      AND t.status IN ('pending', 'unknown') AND t.created_at >= now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'unresolved';
  END IF;
  RETURN QUERY
    INSERT INTO public.fund_transfers
      (agency_id, client_id, advertiser_id, advertiser_name, bc_id, bc_name, amount, type, status, created_by)
    VALUES (p_agency, p_client, p_advertiser, p_name, p_bc_id, p_bc_name, p_amount, 'RECHARGE', 'pending', p_by)
    RETURNING public.fund_transfers.id, public.fund_transfers.request_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.begin_fund_transfer(uuid, uuid, text, text, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_fund_transfer(uuid, uuid, text, text, text, text, numeric, uuid) TO service_role;
