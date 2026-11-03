-- The funding agency can't read another agency's clients, so the request keeps the requesting client's name.
ALTER TABLE public.topup_requests ADD COLUMN IF NOT EXISTS client_name text;
