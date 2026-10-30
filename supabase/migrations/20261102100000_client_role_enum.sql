-- Step 1 of client logins: the new role value must be committed before anything can reference it.
ALTER TYPE public.agency_role ADD VALUE IF NOT EXISTS 'client';
