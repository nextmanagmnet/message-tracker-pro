-- Which of the login's Business Centers an agency uses for funding.
-- NULL = all of them (every connection made before this change, and logins with a single Business Center);
-- an empty array = the login has several and the agency has not chosen yet (funding stays locked until it does).
ALTER TABLE public.bc_connections ADD COLUMN IF NOT EXISTS selected_bc_ids TEXT[];

-- Agency admins read it through RLS, like the other non-secret columns of this table.
GRANT SELECT (selected_bc_ids) ON public.bc_connections TO authenticated;
