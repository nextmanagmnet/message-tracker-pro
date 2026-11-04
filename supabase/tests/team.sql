-- Team permissions, in one transaction that always rolls back (nothing is left behind).
-- An admin can be limited to some agency-level jobs; only the owner changes who can do what.
BEGIN;

CREATE TEMP TABLE ids(k text, v uuid);
GRANT ALL ON ids TO PUBLIC;

DO $$
DECLARE
  uo uuid := gen_random_uuid();  -- owner
  uf uuid := gen_random_uuid();  -- finance admin (funding only)
  ua uuid := gen_random_uuid();  -- admin with no explicit list (everything, like before)
  uv uuid := gen_random_uuid();  -- viewer
  un uuid := gen_random_uuid();  -- invited new member
  ag uuid; n int;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) VALUES
    (uo, 'team-owner@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"TEAM-TEST-AGENCY"}'),
    (uf, 'team-fin@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"TEAM-TEST-F"}'),
    (ua, 'team-adm@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"TEAM-TEST-A"}'),
    (uv, 'team-view@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"TEAM-TEST-V"}');
  SELECT agency_id INTO ag FROM public.agency_members WHERE user_id = uo;
  -- the other three were given workspaces by the signup trigger; move them into the owner's agency with their roles
  DELETE FROM public.agency_members WHERE user_id IN (uf, ua, uv);
  INSERT INTO public.agency_members (user_id, agency_id, role, permissions) VALUES
    (uf, ag, 'admin', ARRAY['funding']), (ua, ag, 'admin', NULL), (uv, ag, 'viewer', '{}');
  INSERT INTO ids VALUES ('uo', uo), ('uf', uf), ('ua', ua), ('uv', uv), ('ag', ag);

  -- the permission rules
  IF NOT public.has_agency_permission(uo, ag, 'clients') OR NOT public.has_agency_permission(uo, ag, 'funding') THEN
    RAISE EXCEPTION 'owner must hold every permission';
  END IF;
  IF NOT public.has_agency_permission(uf, ag, 'funding') THEN RAISE EXCEPTION 'finance admin lost funding'; END IF;
  IF public.has_agency_permission(uf, ag, 'clients') OR public.has_agency_permission(uf, ag, 'ad_accounts') THEN
    RAISE EXCEPTION 'finance admin has more than funding';
  END IF;
  IF NOT (public.has_agency_permission(ua, ag, 'clients') AND public.has_agency_permission(ua, ag, 'funding')
          AND public.has_agency_permission(ua, ag, 'ad_accounts')) THEN
    RAISE EXCEPTION 'an admin without a list must keep everything';
  END IF;
  IF public.has_agency_permission(uv, ag, 'clients') OR public.has_agency_permission(uv, ag, 'funding') THEN
    RAISE EXCEPTION 'viewer holds a permission';
  END IF;
  IF public.has_agency_permission(gen_random_uuid(), ag, 'funding') THEN RAISE EXCEPTION 'a stranger holds a permission'; END IF;

  IF public.has_agency_permission(uf, ag, 'campaigns') THEN RAISE EXCEPTION 'finance admin can run ads'; END IF;
  IF NOT public.has_agency_permission(ua, ag, 'campaigns') THEN RAISE EXCEPTION 'an admin without a list lost campaigns'; END IF;

  -- unknown permission names are refused by the table
  BEGIN UPDATE public.agency_members SET permissions = ARRAY['everything'] WHERE user_id = uf; RAISE EXCEPTION 'bad permission stored';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a pending team invite stops the signup trigger from creating a second workspace, and acceptance joins the agency
  INSERT INTO public.team_invites (agency_id, email, role, permissions)
    VALUES (ag, 'team-new@example.test', 'admin', ARRAY['ad_accounts']);
  INSERT INTO auth.users (id, email, email_confirmed_at, aud, role) VALUES (un, 'team-new@example.test', now(), 'authenticated', 'authenticated');
  SELECT count(*) INTO n FROM public.agency_members WHERE user_id = un;
  IF n <> 0 THEN RAISE EXCEPTION 'invited member got a workspace of their own'; END IF;
  INSERT INTO ids VALUES ('un', un);
END $$;

-- as the invited member: accepting gives exactly the invited role and permissions, once
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'un'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE un uuid := (SELECT v FROM ids WHERE k = 'un'); ag uuid := (SELECT v FROM ids WHERE k = 'ag'); got uuid; perms text[]; r text;
BEGIN
  got := public.accept_team_invite();
  IF got IS DISTINCT FROM ag THEN RAISE EXCEPTION 'invite did not join the agency'; END IF;
  SELECT role::text, permissions INTO r, perms FROM public.agency_members WHERE user_id = un AND agency_id = ag;
  IF r <> 'admin' OR perms IS DISTINCT FROM ARRAY['ad_accounts'] THEN RAISE EXCEPTION 'wrong access after accepting: % %', r, perms; END IF;
  IF public.accept_team_invite() IS NOT NULL THEN RAISE EXCEPTION 'invite accepted twice'; END IF;
  -- a member can not give themselves more
  BEGIN UPDATE public.agency_members SET permissions = NULL WHERE user_id = un; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT permissions FROM public.agency_members WHERE user_id = un) IS NULL THEN RAISE EXCEPTION 'member raised their own permissions'; END IF;
END $$;
RESET ROLE;

-- as the finance admin: can not create a client of their own (needs "clients"), can still read the agency
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'uf'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ag uuid := (SELECT v FROM ids WHERE k = 'ag');
BEGIN
  BEGIN INSERT INTO public.clients (agency_id, name) VALUES (ag, 'TEAM-TEST-BLOCKED'); RAISE EXCEPTION 'finance admin created a client';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- as the all-permissions admin: can create a client
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT v FROM ids WHERE k = 'ua'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE ag uuid := (SELECT v FROM ids WHERE k = 'ag');
BEGIN
  INSERT INTO public.clients (agency_id, name) VALUES (ag, 'TEAM-TEST-ALLOWED');
END $$;
RESET ROLE;

SELECT 'team permissions: all checks passed' AS result;
ROLLBACK;
