-- Exercises the wallet rules inside one transaction that always rolls back (nothing is left behind).
-- Fails loudly (RAISE EXCEPTION) on the first rule that doesn't hold; a pass ends with a one-row summary.
BEGIN;

DO $$
DECLARE
  c uuid := (SELECT id FROM public.clients ORDER BY created_at LIMIT 1);
  a uuid := (SELECT id FROM public.agencies ORDER BY created_at LIMIT 1);
  r uuid; r2 uuid; bal numeric; dup boolean; n int;
BEGIN
  DELETE FROM public.topup_requests WHERE advertiser_id LIKE 'WALLET-TEST-%';
  -- the funding agency charges 2% + 1.00, minimum 10
  INSERT INTO public.agency_wallet_settings (agency_id, commission_percent, flat_fee, min_topup)
  VALUES (a, 2, 1, 10) ON CONFLICT (agency_id) DO UPDATE SET commission_percent = 2, flat_fee = 1, min_topup = 10;

  -- credits: a bank transfer reference is applied once, however many times it is reported
  SELECT out_balance, out_duplicate INTO bal, dup FROM public.wallet_apply(c, 200, 'topup', 'manual', 'T-1', 'test', NULL, NULL);
  IF bal <> 200 OR dup THEN RAISE EXCEPTION 'credit failed: % %', bal, dup; END IF;
  SELECT out_balance, out_duplicate INTO bal, dup FROM public.wallet_apply(c, 200, 'topup', 'manual', 'T-1', 'again', NULL, NULL);
  IF bal <> 200 OR NOT dup THEN RAISE EXCEPTION 'duplicate payment credited twice: % %', bal, dup; END IF;

  -- a request of 100 costs 100 + 2% + 1.00 = 103.00
  r := public.create_topup_request(c, a, 'WALLET-TEST-1', 'Test', NULL, 100, 'USD', 'x', 'Test client');
  SELECT balance INTO bal FROM public.wallets WHERE client_id = c;
  IF bal <> 97 THEN RAISE EXCEPTION 'request should leave 97, got %', bal; END IF;
  IF (SELECT fee FROM public.topup_requests WHERE id = r) <> 3 THEN RAISE EXCEPTION 'fee should be 3'; END IF;

  -- one open request per ad account
  BEGIN
    PERFORM public.create_topup_request(c, a, 'WALLET-TEST-1', 'Test', NULL, 10, 'USD', NULL, 'Test client');
    RAISE EXCEPTION 'second open request was allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT balance INTO bal FROM public.wallets WHERE client_id = c;
  IF bal <> 97 THEN RAISE EXCEPTION 'failed request must not charge the wallet, got %', bal; END IF;

  -- not enough money, wrong currency, below the minimum: refused and nothing changes
  BEGIN PERFORM public.create_topup_request(c, a, 'WALLET-TEST-2', 'T', NULL, 500, 'USD', NULL, 'T'); RAISE EXCEPTION 'overdraft allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'insufficient_funds' THEN RAISE; END IF; END;
  BEGIN PERFORM public.create_topup_request(c, a, 'WALLET-TEST-2', 'T', NULL, 20, 'EUR', NULL, 'T'); RAISE EXCEPTION 'currency mix allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'currency_mismatch' THEN RAISE; END IF; END;
  BEGIN PERFORM public.create_topup_request(c, a, 'WALLET-TEST-2', 'T', NULL, 5, 'USD', NULL, 'T'); RAISE EXCEPTION 'below minimum allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'below_minimum' THEN RAISE; END IF; END;

  -- declining refunds the full 103.00 once; a second settle is refused
  PERFORM public.settle_topup_request(r, 'declined', NULL);
  SELECT balance INTO bal FROM public.wallets WHERE client_id = c;
  IF bal <> 200 THEN RAISE EXCEPTION 'decline should refund to 200, got %', bal; END IF;
  BEGIN PERFORM public.settle_topup_request(r, 'cancelled', NULL); RAISE EXCEPTION 'double refund allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_pending' THEN RAISE; END IF; END;

  -- a request being approved can't be cancelled or declined (the money may already be moving)
  r2 := public.create_topup_request(c, a, 'WALLET-TEST-3', 'Test', NULL, 50, 'USD', NULL, 'Test client');
  UPDATE public.topup_requests SET status = 'approving' WHERE id = r2;
  BEGIN PERFORM public.settle_topup_request(r2, 'cancelled', NULL); RAISE EXCEPTION 'cancelled while approving';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'not_pending' THEN RAISE; END IF; END;
  BEGIN PERFORM public.create_topup_request(c, a, 'WALLET-TEST-3', 'Test', NULL, 10, 'USD', NULL, 'Test client'); RAISE EXCEPTION 'second request while approving';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- the ledger always adds up to the balance, and can't be edited
  SELECT balance INTO bal FROM public.wallets WHERE client_id = c;
  IF bal <> (SELECT sum(amount) FROM public.wallet_entries WHERE client_id = c) THEN RAISE EXCEPTION 'ledger does not add up'; END IF;
  BEGIN UPDATE public.wallet_entries SET amount = 1 WHERE client_id = c; RAISE EXCEPTION 'ledger edited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'wallet_entries is append-only' THEN RAISE; END IF; END;
  BEGIN DELETE FROM public.wallet_entries WHERE client_id = c; RAISE EXCEPTION 'ledger deleted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'wallet_entries is append-only' THEN RAISE; END IF; END;

  -- browsers can't touch money functions
  IF has_function_privilege('authenticated', 'public.wallet_apply(uuid,numeric,text,text,text,text,uuid,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.create_topup_request(uuid,uuid,text,text,uuid,numeric,text,text,text)', 'execute')
     OR has_table_privilege('authenticated', 'public.wallets', 'update')
     OR has_table_privilege('authenticated', 'public.wallet_entries', 'insert') THEN
    RAISE EXCEPTION 'browser roles can change money';
  END IF;
END $$;

SELECT 'wallet rules: all checks passed' AS result;
ROLLBACK;
