-- Fallback order value for Purchase events when an order confirmation has no "Total" in it.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_order_value numeric CHECK (default_order_value > 0 AND default_order_value < 1000000000),
  ADD COLUMN IF NOT EXISTS default_order_currency text CHECK (default_order_currency ~ '^[A-Z]{3}$');
