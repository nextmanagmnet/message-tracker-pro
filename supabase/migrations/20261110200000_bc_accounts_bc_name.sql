-- The agency's Business Center name next to each account, so several Business Centers are told apart.
ALTER TABLE public.bc_accounts ADD COLUMN IF NOT EXISTS bc_name text;
