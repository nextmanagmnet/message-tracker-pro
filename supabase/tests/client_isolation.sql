-- Client isolation (RLS) test. Simulates an invited client user against the linked database.
-- Everything runs in one transaction that always ROLLBACKs: the temporary clients, invite and
-- auth user it creates never persist. Run: npm run test:db
-- Pass: finishes with NOTICE "client isolation: N checks passed". Fail: raises an EXCEPTION
-- listing only the failed checks (non-zero exit).
BEGIN;
-- expected NULL = informational row, not a check.
CREATE TEMP TABLE r(test text, expected text, result text);
GRANT ALL ON r TO PUBLIC;
CREATE TEMP TABLE ids(k text, v uuid);
GRANT ALL ON ids TO PUBLIC;

-- Two clients in one agency (both created here), plus the rest of the platform as "other".
INSERT INTO ids SELECT 'agency', id FROM public.agencies WHERE account_type = 'agency' ORDER BY created_at LIMIT 1;
INSERT INTO public.clients (agency_id, name) VALUES ((SELECT v FROM ids WHERE k = 'agency'), 'RLS-TEST-C1');
INSERT INTO public.clients (agency_id, name) VALUES ((SELECT v FROM ids WHERE k = 'agency'), 'RLS-TEST-C2');
INSERT INTO ids SELECT 'c1', id FROM public.clients WHERE name = 'RLS-TEST-C1';
INSERT INTO ids SELECT 'c2', id FROM public.clients WHERE name = 'RLS-TEST-C2';
INSERT INTO ids VALUES ('user', gen_random_uuid());

INSERT INTO public.client_invites (agency_id, client_id, email)
VALUES ((SELECT v FROM ids WHERE k = 'agency'), (SELECT v FROM ids WHERE k = 'c1'), 'rls-test@example.test');
INSERT INTO auth.users (id, email, email_confirmed_at, aud, role)
VALUES ((SELECT v FROM ids WHERE k = 'user'), 'rls-test@example.test', now(), 'authenticated', 'authenticated');

INSERT INTO r SELECT 'invited signup got its own agency', '0', count(*)::text FROM public.agency_members WHERE user_id = (SELECT v FROM ids WHERE k = 'user');

-- Staff baseline, measured as the platform owner would see it (service level here).
INSERT INTO r SELECT 'total clients in db', NULL, count(*)::text FROM public.clients;
INSERT INTO r SELECT 'total leads in db', NULL, count(*)::text FROM public.leads;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'user'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO r SELECT 'accept_client_invite returns c1', 'true', (public.accept_client_invite() = (SELECT v FROM ids WHERE k = 'c1'))::text;
INSERT INTO r SELECT 'accept again returns null', 'null', coalesce(public.accept_client_invite()::text, 'null');

INSERT INTO r SELECT 'clients visible', '1', count(*)::text FROM public.clients;
INSERT INTO r SELECT 'sees c2', 'false', EXISTS (SELECT 1 FROM public.clients WHERE name = 'RLS-TEST-C2')::text;
INSERT INTO r SELECT 'agencies visible', '1', count(*)::text FROM public.agencies;
INSERT INTO r SELECT 'agency_members visible', '1', count(*)::text FROM public.agency_members;
INSERT INTO r SELECT 'leads of other clients', '0', count(*)::text FROM public.leads WHERE client_id <> (SELECT v FROM ids WHERE k = 'c1');
INSERT INTO r SELECT 'bc_connections', '0', count(*)::text FROM public.bc_connections;
INSERT INTO r SELECT 'fund_transfers', '0', count(*)::text FROM public.fund_transfers;
INSERT INTO r SELECT 'client_invites', '0', count(*)::text FROM public.client_invites;
INSERT INTO r SELECT 'notifications', '0', count(*)::text FROM public.notifications;
INSERT INTO r SELECT 'agency member list for client', '0', count(*)::text FROM public.get_agency_members((SELECT v FROM ids WHERE k = 'agency'));
INSERT INTO r SELECT 'can access c1', 'true', public.user_can_access_client((SELECT v FROM ids WHERE k = 'user'), (SELECT v FROM ids WHERE k = 'c1'))::text;
INSERT INTO r SELECT 'can access c2', 'false', public.user_can_access_client((SELECT v FROM ids WHERE k = 'user'), (SELECT v FROM ids WHERE k = 'c2'))::text;

DO $$
DECLARE c1 uuid := (SELECT v FROM ids WHERE k = 'c1'); c2 uuid := (SELECT v FROM ids WHERE k = 'c2');
BEGIN
  BEGIN INSERT INTO public.products (client_id, name) VALUES (c1, 'own product'); INSERT INTO r VALUES ('product on own client', 'allowed', 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('product on own client', 'allowed', 'DENIED: ' || sqlerrm); END;
  BEGIN INSERT INTO public.products (client_id, name) VALUES (c2, 'other product'); INSERT INTO r VALUES ('product on other client', 'denied', 'ALLOWED (BAD)');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('product on other client', 'denied', 'denied'); END;
  BEGIN INSERT INTO public.ai_agent_settings (client_id) VALUES (c1); INSERT INTO r VALUES ('ai settings insert', 'denied', 'ALLOWED (BAD)');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('ai settings insert', 'denied', 'denied'); END;
  BEGIN UPDATE public.clients SET order_marker = 'PAID ORDER' WHERE id = c1; INSERT INTO r VALUES ('update own order_marker', 'rows=1', 'rows=' || (SELECT count(*) FROM public.clients WHERE order_marker = 'PAID ORDER'));
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('update own order_marker', 'rows=1', 'DENIED: ' || sqlerrm); END;
  BEGIN UPDATE public.clients SET name = 'hacked' WHERE id = c1; INSERT INTO r VALUES ('rename own client', 'denied', 'ALLOWED (BAD)');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('rename own client', 'denied', 'denied'); END;
  -- Outcome measured below as the owner role: the client user cannot see c2, so counting here proves nothing.
  BEGIN UPDATE public.clients SET order_marker = 'X' WHERE id = c2;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN INSERT INTO public.tiktok_pixels (client_id, pixel_code) VALUES (c2, 'EVIL'); INSERT INTO r VALUES ('pixel on other client', 'denied', 'ALLOWED (BAD)');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('pixel on other client', 'denied', 'denied'); END;
  BEGIN INSERT INTO public.agency_members (user_id, agency_id, role) VALUES (gen_random_uuid(), (SELECT v FROM ids WHERE k = 'agency'), 'owner'); INSERT INTO r VALUES ('self-promote/add member', 'denied', 'ALLOWED (BAD)');
  EXCEPTION WHEN others THEN INSERT INTO r VALUES ('self-promote/add member', 'denied', 'denied'); END;
END $$;

RESET ROLE;
INSERT INTO r SELECT 'update other client marker (rows changed)', '0', count(*)::text FROM public.clients WHERE id = (SELECT v FROM ids WHERE k = 'c2') AND order_marker = 'X';

DO $$
DECLARE failed text; passed int; info text;
BEGIN
  SELECT string_agg(test || ': want ' || expected || ', got ' || coalesce(result, 'NULL'), E'\n')
    INTO failed FROM r WHERE expected IS NOT NULL AND result IS DISTINCT FROM expected;
  SELECT count(*) INTO passed FROM r WHERE expected IS NOT NULL AND result = expected;
  SELECT string_agg(test || ' = ' || result, ', ') INTO info FROM r WHERE expected IS NULL;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION E'client isolation FAILED (% passed):\n%', passed, failed;
  END IF;
  RAISE NOTICE 'client isolation: % checks passed (%)', passed, info;
END $$;
-- `supabase db query` does not print NOTICEs, only the last result set, so echo the summary too.
SELECT 'client isolation: ' || count(*) || ' checks passed' AS result FROM r WHERE expected IS NOT NULL;
ROLLBACK;
