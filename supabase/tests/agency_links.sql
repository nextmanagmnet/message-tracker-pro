-- Agency link privacy and lifecycle, in one transaction that always rolls back (nothing is left behind).
-- An agency may see numbers about a linked client, never their chats or leads. Fails loudly on the first broken rule.
BEGIN;

CREATE TEMP TABLE ids(k text, v uuid);
GRANT ALL ON ids TO PUBLIC;

DO $$
DECLARE
  ua uuid := gen_random_uuid();  -- agency owner
  ub uuid := gen_random_uuid();  -- the invited user (individual workspace)
  uo uuid := gen_random_uuid();  -- an outsider with their own agency
  ag uuid; cb uuid; v_link uuid; n int; r record;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) VALUES
    (ua, 'link-agency@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"LINK-TEST-AGENCY"}'),
    (ub, 'link-user@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"individual","company_name":"LINK-TEST-USER"}'),
    (uo, 'link-other@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"LINK-TEST-OTHER"}');
  SELECT agency_id INTO ag FROM public.agency_members WHERE user_id = ua;
  SELECT c.id INTO cb FROM public.clients c JOIN public.agency_members m ON m.agency_id = c.agency_id WHERE m.user_id = ub;
  IF ag IS NULL OR cb IS NULL THEN RAISE EXCEPTION 'test setup failed'; END IF;
  INSERT INTO ids VALUES ('ua', ua), ('ub', ub), ('uo', uo), ('ag', ag), ('cb', cb);

  -- the agency's Business Center holds the ad account; the user has campaigns and chats with message text
  INSERT INTO public.bc_accounts (agency_id, bc_id, advertiser_id, advertiser_name) VALUES (ag, 'BC-1', 'LINK-TEST-ADV', 'Link Test Shop');
  INSERT INTO public.ad_account_invites (agency_id, advertiser_id, advertiser_name, token_hash)
    VALUES (ag, 'LINK-TEST-ADV', 'Link Test Shop', 'hash-ok'), (ag, 'LINK-TEST-OLD', 'Old', 'hash-old');
  UPDATE public.ad_account_invites SET expires_at = now() - interval '1 day' WHERE token_hash = 'hash-old';
  INSERT INTO public.tiktok_campaigns (client_id, tenant_id, campaign_id, campaign_name, spend, clicks, impressions)
    SELECT cb, agency_id, 'CAMP-1', 'Campaign One', 12.5, 40, 1000 FROM public.clients WHERE id = cb;
  INSERT INTO public.leads (client_id, tenant_id, sender_phone_hash, first_message, stage, order_value, order_currency, campaign_id)
    SELECT cb, agency_id, 'PHONEHASH-SECRET', 'MY SECRET MESSAGE TEXT', 'client', 60, 'USD', 'CAMP-1' FROM public.clients WHERE id = cb;
  INSERT INTO public.leads (client_id, tenant_id, sender_phone_hash, first_message, stage, campaign_id)
    SELECT cb, agency_id, 'PHONEHASH-2', 'another private message', 'qualified', 'CAMP-1' FROM public.clients WHERE id = cb;

  -- an expired or unknown invite is refused; the account must really be in the agency's Business Center
  BEGIN PERFORM public.accept_agency_invite('hash-old', cb, ub, 'AGENCY-TOKEN'); RAISE EXCEPTION 'expired invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invite_invalid' THEN RAISE; END IF; END;
  BEGIN PERFORM public.accept_agency_invite('nope', cb, ub, 'AGENCY-TOKEN'); RAISE EXCEPTION 'unknown invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invite_invalid' THEN RAISE; END IF; END;
  -- an agency can't "link" its own workspace's client
  INSERT INTO public.ad_account_invites (agency_id, advertiser_id, advertiser_name, token_hash) VALUES (ag, 'LINK-TEST-ADV2', 'x', 'hash-own');
  INSERT INTO public.bc_accounts (agency_id, bc_id, advertiser_id, advertiser_name) VALUES (ag, 'BC-1', 'LINK-TEST-ADV2', 'x');
  INSERT INTO public.clients (agency_id, name) VALUES (ag, 'LINK-OWN-CLIENT');
  BEGIN PERFORM public.accept_agency_invite('hash-own', (SELECT id FROM public.clients WHERE name = 'LINK-OWN-CLIENT'), ua, 'T'); RAISE EXCEPTION 'own client linked';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'own_agency' THEN RAISE; END IF; END;

  -- accept: the link exists, the agency's login is copied to the user's ad account row, the invite is used up
  v_link := public.accept_agency_invite('hash-ok', cb, ub, 'AGENCY-TOKEN');
  IF NOT EXISTS (SELECT 1 FROM public.tiktok_accounts WHERE client_id = cb AND advertiser_id = 'LINK-TEST-ADV' AND managed_by_agency_id = ag AND access_token = 'AGENCY-TOKEN') THEN
    RAISE EXCEPTION 'managed ad account row missing';
  END IF;
  BEGIN PERFORM public.accept_agency_invite('hash-ok', cb, ub, 'AGENCY-TOKEN'); RAISE EXCEPTION 'invite used twice';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invite_invalid' THEN RAISE; END IF; END;
END $$;

-- ===== As the agency owner: numbers yes, messages no =====
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'ua'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE ag uuid := (SELECT v FROM ids WHERE k = 'ag'); cb uuid := (SELECT v FROM ids WHERE k = 'cb'); r record; n int;
BEGIN
  SELECT * INTO r FROM public.agency_client_metrics(ag);
  IF NOT FOUND THEN RAISE EXCEPTION 'agency sees no linked client'; END IF;
  IF r.spend <> 12.5 OR r.chats <> 2 OR r.qualified <> 2 OR r.orders <> 1 OR r.revenue <> 60 THEN
    RAISE EXCEPTION 'wrong metrics: spend %, chats %, qualified %, orders %, revenue %', r.spend, r.chats, r.qualified, r.orders, r.revenue;
  END IF;
  SELECT count(*) INTO n FROM public.agency_client_campaigns(ag, cb);
  IF n <> 1 THEN RAISE EXCEPTION 'campaign list should have 1 row, got %', n; END IF;

  -- the agency cannot read the user's data directly
  SELECT count(*) INTO n FROM public.leads WHERE client_id = cb;               IF n <> 0 THEN RAISE EXCEPTION 'agency reads the user''s leads'; END IF;
  SELECT count(*) INTO n FROM public.messages WHERE client_id = cb;            IF n <> 0 THEN RAISE EXCEPTION 'agency reads the user''s messages'; END IF;
  SELECT count(*) INTO n FROM public.conversations WHERE client_id = cb;       IF n <> 0 THEN RAISE EXCEPTION 'agency reads the user''s conversations'; END IF;
  SELECT count(*) INTO n FROM public.clients WHERE id = cb;                    IF n <> 0 THEN RAISE EXCEPTION 'agency reads the user''s client row'; END IF;
  SELECT count(*) INTO n FROM public.tiktok_campaigns WHERE client_id = cb;    IF n <> 0 THEN RAISE EXCEPTION 'agency reads campaign rows directly'; END IF;

  -- and neither function can carry message text or phone data
  IF EXISTS (SELECT 1 FROM information_schema.routines r2 JOIN information_schema.parameters p ON p.specific_name = r2.specific_name
             WHERE r2.routine_schema = 'public' AND r2.routine_name IN ('agency_client_metrics', 'agency_client_campaigns')
               AND p.parameter_mode = 'OUT' AND (p.parameter_name ILIKE '%message%' OR p.parameter_name ILIKE '%phone%' OR p.parameter_name ILIKE '%text%')) THEN
    RAISE EXCEPTION 'a metrics function exposes message or phone columns';
  END IF;

  -- the access token copy stays hidden from browsers
  BEGIN PERFORM access_token FROM public.tiktok_accounts LIMIT 1; RAISE EXCEPTION 'agency can read tokens';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- the agency sees its invites; no browser can write links or invites
  SELECT count(*) INTO n FROM public.ad_account_invites WHERE agency_id = ag; IF n < 2 THEN RAISE EXCEPTION 'agency cannot see its invites'; END IF;
  BEGIN INSERT INTO public.agency_client_links (agency_id, agency_name, client_id, advertiser_id) VALUES (ag, 'x', cb, 'X'); RAISE EXCEPTION 'browser wrote a link';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- ===== As an outsider (another agency): sees nothing of this link =====
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'uo'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ag uuid := (SELECT v FROM ids WHERE k = 'ag'); cb uuid := (SELECT v FROM ids WHERE k = 'cb'); n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_client_metrics(ag);        IF n <> 0 THEN RAISE EXCEPTION 'outsider sees metrics'; END IF;
  SELECT count(*) INTO n FROM public.agency_client_campaigns(ag, cb);  IF n <> 0 THEN RAISE EXCEPTION 'outsider sees campaigns'; END IF;
  SELECT count(*) INTO n FROM public.agency_client_links;              IF n <> 0 THEN RAISE EXCEPTION 'outsider sees links'; END IF;
  SELECT count(*) INTO n FROM public.ad_account_invites;               IF n <> 0 THEN RAISE EXCEPTION 'outsider sees invites'; END IF;
END $$;

-- ===== As the linked user: sees who manages them, and the agency can't be asked about other users =====
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'ub'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ag uuid := (SELECT v FROM ids WHERE k = 'ag'); n int;
BEGIN
  SELECT count(*) INTO n FROM public.agency_client_links WHERE agency_name = 'LINK-TEST-AGENCY' AND status = 'active';
  IF n <> 1 THEN RAISE EXCEPTION 'user cannot see who manages their account'; END IF;
  -- control: the user CAN read their own chats, so "the agency sees none" above is a real result
  SELECT count(*) INTO n FROM public.leads WHERE client_id = (SELECT v FROM ids WHERE k = 'cb');
  IF n <> 2 THEN RAISE EXCEPTION 'control failed: the user should see their own 2 leads, got %', n; END IF;
  SELECT count(*) INTO n FROM public.agency_client_metrics(ag);  IF n <> 0 THEN RAISE EXCEPTION 'linked user can read the agency''s metrics'; END IF;
  SELECT count(*) INTO n FROM public.ad_account_invites;         IF n <> 0 THEN RAISE EXCEPTION 'user sees the agency''s invites'; END IF;
END $$;

-- ===== Ending the link (as the service role): access stops at once, the user keeps their data =====
RESET ROLE;
DO $$
DECLARE cb uuid := (SELECT v FROM ids WHERE k = 'cb'); v_link uuid; n int;
BEGIN
  SELECT id INTO v_link FROM public.agency_client_links WHERE client_id = cb AND status = 'active';
  PERFORM public.end_agency_link(v_link, 'user');
  SELECT count(*) INTO n FROM public.tiktok_accounts WHERE client_id = cb AND advertiser_id = 'LINK-TEST-ADV';
  IF n <> 0 THEN RAISE EXCEPTION 'agency login copy survived the unlink'; END IF;
  SELECT count(*) INTO n FROM public.leads WHERE client_id = cb;
  IF n <> 2 THEN RAISE EXCEPTION 'user lost leads on unlink'; END IF;
  SELECT count(*) INTO n FROM public.tiktok_campaigns WHERE client_id = cb;
  IF n <> 1 THEN RAISE EXCEPTION 'user lost campaign history on unlink'; END IF;
  BEGIN PERFORM public.end_agency_link(v_link, 'agency'); RAISE EXCEPTION 'ended twice';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_active' THEN RAISE; END IF; END;
  IF has_function_privilege('authenticated', 'public.accept_agency_invite(text,uuid,uuid,text)', 'execute')
     OR has_function_privilege('anon', 'public.end_agency_link(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'browser roles can accept or end links';
  END IF;
END $$;

SELECT 'agency links: all checks passed' AS result;
ROLLBACK;
