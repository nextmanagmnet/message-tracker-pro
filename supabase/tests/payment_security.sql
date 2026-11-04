-- Payment security rules, in one transaction that always rolls back (nothing is left behind).
-- Fails loudly (RAISE EXCEPTION) on the first rule that doesn't hold; a pass ends with a one-row summary.
BEGIN;

CREATE TEMP TABLE ids(k text, v uuid);
GRANT ALL ON ids TO PUBLIC;

DO $$
DECLARE
  uo uuid := gen_random_uuid();  -- owner of the user's workspace (an individual account)
  uv uuid := gen_random_uuid();  -- read-only viewer in that workspace
  ua uuid := gen_random_uuid();  -- agency owner
  ag uuid; ws uuid; cl uuid; n int; r record; t1 uuid; t2 uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) VALUES
    (uo, 'paysec-user@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"PAYSEC-USER"}'),
    (uv, 'paysec-view@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"PAYSEC-V"}'),
    (ua, 'paysec-agency@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"PAYSEC-AGENCY"}');
  SELECT agency_id INTO ws FROM public.agency_members WHERE user_id = uo;
  INSERT INTO public.clients (agency_id, name) VALUES (ws, 'PAYSEC-CLIENT') RETURNING id INTO cl;
  SELECT agency_id INTO ag FROM public.agency_members WHERE user_id = ua;
  DELETE FROM public.agency_members WHERE user_id = uv;
  INSERT INTO public.agency_members (user_id, agency_id, role) VALUES (uv, ws, 'viewer');
  IF ws IS NULL OR cl IS NULL OR ag IS NULL THEN RAISE EXCEPTION 'test setup failed'; END IF;
  INSERT INTO ids VALUES ('uo', uo), ('uv', uv), ('ua', ua), ('ws', ws), ('cl', cl), ('ag', ag);
  INSERT INTO public.agency_client_links (agency_id, agency_name, client_id, advertiser_id, advertiser_name)
    VALUES (ag, 'PAYSEC-AGENCY', cl, 'PAYSEC-ADV', 'Pay Sec Shop');

  -- 1. the anonymous role has no table privileges at all
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  IF n <> 0 THEN RAISE EXCEPTION 'anon still has privileges on % public tables', n; END IF;
  -- ...but the one thing the public click link needs still works
  IF NOT has_function_privilege('anon', 'public.record_ad_click(text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'anon lost the click-tracking function';
  END IF;

  -- 2. invite hashes are not readable from a browser; money functions are not callable from one
  IF has_table_privilege('authenticated', 'public.ad_account_invites', 'SELECT') THEN
    RAISE EXCEPTION 'browsers can read invite hashes';
  END IF;
  IF has_function_privilege('authenticated', 'public.begin_fund_transfer(uuid,uuid,text,text,text,text,numeric,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.begin_fund_transfer(uuid,uuid,text,text,text,text,numeric,uuid)', 'execute') THEN
    RAISE EXCEPTION 'browser roles can start a transfer';
  END IF;

  -- 3. a transfer cannot be started twice for the same account while the first is unresolved
  SELECT * INTO r FROM public.begin_fund_transfer(ag, cl, 'PAYSEC-ADV', 'Pay Sec Shop', 'BC-1', 'Test BC', 25, ua);
  t1 := r.out_id;
  IF t1 IS NULL OR r.out_request_id IS NULL THEN RAISE EXCEPTION 'first transfer was not recorded'; END IF;
  BEGIN
    PERFORM public.begin_fund_transfer(ag, cl, 'PAYSEC-ADV', 'Pay Sec Shop', 'BC-1', 'Test BC', 25, ua);
    RAISE EXCEPTION 'second simultaneous transfer was allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'unresolved' THEN RAISE; END IF; END;
  -- another account is independent
  SELECT * INTO r FROM public.begin_fund_transfer(ag, cl, 'PAYSEC-ADV-2', 'Other', 'BC-1', 'Test BC', 10, ua);
  IF r.out_id IS NULL THEN RAISE EXCEPTION 'a different account was blocked'; END IF;
  -- once the first is resolved (sent), the same account can be funded again
  UPDATE public.fund_transfers SET status = 'sent' WHERE id = t1;
  SELECT * INTO r FROM public.begin_fund_transfer(ag, cl, 'PAYSEC-ADV', 'Pay Sec Shop', 'BC-1', 'Test BC', 5, ua);
  IF r.out_id IS NULL THEN RAISE EXCEPTION 'a resolved account stayed blocked'; END IF;
END $$;

-- 4. as the read-only viewer: cannot switch campaign management, and cannot probe other people's permissions
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'uv'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE cl uuid := (SELECT v FROM ids WHERE k = 'cl'); ws uuid := (SELECT v FROM ids WHERE k = 'ws'); uo uuid := (SELECT v FROM ids WHERE k = 'uo');
BEGIN
  BEGIN PERFORM public.set_link_run_ads(cl, false); RAISE EXCEPTION 'a viewer switched campaign management';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'access_denied' THEN RAISE; END IF; END;
  IF public.has_agency_permission(uo, ws, 'clients') THEN RAISE EXCEPTION 'a browser can probe another user''s permissions'; END IF;
  IF public.has_agency_permission((SELECT v FROM ids WHERE k = 'uv'), ws, 'clients') THEN RAISE EXCEPTION 'a viewer holds a permission'; END IF;
END $$;
RESET ROLE;

-- 5. as the workspace owner: can switch it, and sees their own permissions
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'uo'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE cl uuid := (SELECT v FROM ids WHERE k = 'cl'); ws uuid := (SELECT v FROM ids WHERE k = 'ws'); uo uuid := (SELECT v FROM ids WHERE k = 'uo');
BEGIN
  IF NOT public.has_agency_permission(uo, ws, 'clients') THEN RAISE EXCEPTION 'the owner lost their own permission'; END IF;
  PERFORM public.set_link_run_ads(cl, false);
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT can_run_ads FROM public.agency_client_links WHERE advertiser_id = 'PAYSEC-ADV') THEN
    RAISE EXCEPTION 'the owner could not switch campaign management off';
  END IF;
END $$;

SELECT 'payment security: all checks passed' AS result;
ROLLBACK;
