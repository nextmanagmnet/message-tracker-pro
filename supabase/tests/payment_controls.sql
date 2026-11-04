-- Payment controls, in one transaction that always rolls back (nothing is left behind).
-- Daily transfer cap, daily payment cap, owner approval above the threshold, no double credit, no self-approval.
BEGIN;

DO $$
DECLARE
  uo uuid := gen_random_uuid();  -- agency owner
  us uuid := gen_random_uuid();  -- staff with the funding permission
  ag uuid; cl uuid; r record; bal numeric; n int; lim record; pid uuid; pid2 uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at, aud, role, raw_user_meta_data) VALUES
    (uo, 'pc-owner@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"PC-TEST-AGENCY"}'),
    (us, 'pc-staff@example.test', now(), 'authenticated', 'authenticated', '{"account_type":"agency","company_name":"PC-TEST-STAFF"}');
  SELECT agency_id INTO ag FROM public.agency_members WHERE user_id = uo;
  DELETE FROM public.agency_members WHERE user_id = us;
  INSERT INTO public.agency_members (user_id, agency_id, role, permissions) VALUES (us, ag, 'admin', ARRAY['funding']);
  INSERT INTO public.clients (agency_id, name) VALUES (ag, 'PC-CLIENT') RETURNING id INTO cl;

  -- defaults apply until an owner saves limits
  SELECT * INTO lim FROM public.agency_limits_of(ag);
  IF lim.max_daily_transfer <> 5000 OR lim.payment_approval_over <> 500 OR lim.payment_daily_cap <> 10000 THEN
    RAISE EXCEPTION 'wrong default limits';
  END IF;

  -- ===== daily transfer cap =====
  INSERT INTO public.agency_limits (agency_id, max_daily_transfer, payment_approval_over, payment_daily_cap)
    VALUES (ag, 100, 500, 5000);
  PERFORM public.begin_fund_transfer(ag, cl, 'PC-ADV-1', 'One', 'BC', 'BC', 60, uo);
  UPDATE public.fund_transfers SET status = 'sent' WHERE advertiser_id = 'PC-ADV-1';
  BEGIN
    PERFORM public.begin_fund_transfer(ag, cl, 'PC-ADV-2', 'Two', 'BC', 'BC', 60, uo);
    RAISE EXCEPTION 'daily transfer cap not enforced';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'daily_limit' THEN RAISE; END IF; END;
  PERFORM public.begin_fund_transfer(ag, cl, 'PC-ADV-2', 'Two', 'BC', 'BC', 40, uo);   -- exactly the rest of the day

  -- ===== payments =====
  -- staff, at or under the threshold: credited at once
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 100, 'USD', 'BANK-1', 'key-1', NULL, us, false);
  IF r.out_status <> 'approved' OR r.out_balance <> 100 THEN RAISE EXCEPTION 'small staff payment should credit: % %', r.out_status, r.out_balance; END IF;
  -- the same payment again (retry / same bank reference): no second credit
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 100, 'USD', 'BANK-1', 'key-2', NULL, us, false);
  IF NOT r.out_duplicate OR r.out_balance <> 100 THEN RAISE EXCEPTION 'payment credited twice'; END IF;
  -- staff, over the threshold: waits for the owner, wallet unchanged
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 600, 'USD', 'BANK-2', 'key-3', NULL, us, false);
  IF r.out_status <> 'pending' OR r.out_balance <> 100 THEN RAISE EXCEPTION 'large staff payment should wait: % %', r.out_status, r.out_balance; END IF;
  pid := r.out_id;
  -- the owner, over the threshold: credited at once
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 600, 'USD', 'BANK-3', 'key-4', NULL, uo, true);
  IF r.out_status <> 'approved' OR r.out_balance <> 700 THEN RAISE EXCEPTION 'owner payment should credit: % %', r.out_status, r.out_balance; END IF;

  -- daily payment cap counts pending and approved (100 + 600 + 600 = 1300 already over 1000 would have failed, so reset first)
  UPDATE public.agency_limits SET payment_daily_cap = 1350 WHERE agency_id = ag;
  BEGIN
    PERFORM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 100, 'USD', 'BANK-4', 'key-5', NULL, uo, true);
    RAISE EXCEPTION 'daily payment cap not enforced';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'payment_cap' THEN RAISE; END IF; END;

  -- ===== owner decisions =====
  BEGIN PERFORM public.decide_wallet_payment(pid, true, us); RAISE EXCEPTION 'staff approved their own payment';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'self_approval' THEN RAISE; END IF; END;
  IF public.decide_wallet_payment(pid, true, uo) <> 'approved' THEN RAISE EXCEPTION 'owner approval failed'; END IF;
  SELECT balance INTO bal FROM public.wallets WHERE client_id = cl;
  IF bal <> 1300 THEN RAISE EXCEPTION 'approved payment did not credit: %', bal; END IF;
  BEGIN PERFORM public.decide_wallet_payment(pid, true, uo); RAISE EXCEPTION 'decided twice';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_pending' THEN RAISE; END IF; END;

  -- a rejected payment credits nothing and frees its bank reference
  UPDATE public.agency_limits SET payment_daily_cap = 5000 WHERE agency_id = ag;
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 700, 'USD', 'BANK-5', 'key-6', NULL, us, false);
  pid2 := r.out_id;
  IF public.decide_wallet_payment(pid2, false, uo) <> 'rejected' THEN RAISE EXCEPTION 'rejection failed'; END IF;
  SELECT balance INTO bal FROM public.wallets WHERE client_id = cl;
  IF bal <> 1300 THEN RAISE EXCEPTION 'rejected payment changed the balance: %', bal; END IF;
  SELECT * INTO r FROM public.record_wallet_payment(ag, cl, 'PC-CLIENT', 50, 'USD', 'BANK-5', 'key-7', NULL, us, false);
  IF r.out_status <> 'approved' OR r.out_duplicate THEN RAISE EXCEPTION 'a rejected reference stayed blocked'; END IF;

  -- the ledger always adds up
  SELECT balance INTO bal FROM public.wallets WHERE client_id = cl;
  IF bal <> (SELECT sum(amount) FROM public.wallet_entries WHERE client_id = cl) THEN RAISE EXCEPTION 'ledger does not add up'; END IF;

  -- ===== browsers can change none of this =====
  IF has_table_privilege('authenticated', 'public.wallet_payments', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.agency_limits', 'INSERT,UPDATE,DELETE')
     OR has_function_privilege('authenticated', 'public.record_wallet_payment(uuid,uuid,text,numeric,text,text,text,text,uuid,boolean)', 'execute')
     OR has_function_privilege('authenticated', 'public.decide_wallet_payment(uuid,boolean,uuid)', 'execute') THEN
    RAISE EXCEPTION 'a browser role can change payment controls';
  END IF;
END $$;

SELECT 'payment controls: all checks passed' AS result;
ROLLBACK;
