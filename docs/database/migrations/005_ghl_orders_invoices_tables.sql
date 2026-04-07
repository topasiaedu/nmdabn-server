-- ============================================================================
-- GoHighLevel — orders / invoices mirror (SQL-first + raw fallback)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ghl_orders (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  contact_id TEXT,
  status TEXT,
  currency TEXT,
  total_amount NUMERIC,
  subtotal_amount NUMERIC,
  tax_amount NUMERIC,
  discount_amount NUMERIC,
  paid_amount NUMERIC,
  created_at_provider TIMESTAMPTZ,
  updated_at_provider TIMESTAMPTZ,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ghl_orders
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS created_at_provider TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at_provider TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_orders_location ON public.ghl_orders (location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_orders_contact ON public.ghl_orders (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_orders_updated ON public.ghl_orders (updated_at_provider DESC NULLS LAST);

COMMENT ON COLUMN public.ghl_orders.raw_json IS 'Full provider order payload for vendor drift safety.';

CREATE TABLE IF NOT EXISTS public.ghl_order_line_items (
  order_id TEXT NOT NULL REFERENCES public.ghl_orders (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id TEXT,
  sku TEXT,
  name TEXT,
  price NUMERIC,
  quantity NUMERIC,
  line_total NUMERIC,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, position)
);

CREATE INDEX IF NOT EXISTS idx_ghl_order_items_location ON public.ghl_order_line_items (location_id);

CREATE TABLE IF NOT EXISTS public.ghl_invoices (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  contact_id TEXT,
  order_id TEXT,
  invoice_number TEXT,
  status TEXT,
  currency TEXT,
  total_amount NUMERIC,
  subtotal_amount NUMERIC,
  tax_amount NUMERIC,
  discount_amount NUMERIC,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at_provider TIMESTAMPTZ,
  updated_at_provider TIMESTAMPTZ,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ghl_invoices
  ADD COLUMN IF NOT EXISTS location_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_id TEXT,
  ADD COLUMN IF NOT EXISTS order_id TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at_provider TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at_provider TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ghl_invoices_location ON public.ghl_invoices (location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_invoices_contact ON public.ghl_invoices (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_invoices_order ON public.ghl_invoices (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_invoices_updated ON public.ghl_invoices (updated_at_provider DESC NULLS LAST);

COMMENT ON COLUMN public.ghl_invoices.raw_json IS 'Full provider invoice payload for vendor drift safety.';

CREATE TABLE IF NOT EXISTS public.ghl_invoice_line_items (
  invoice_id TEXT NOT NULL REFERENCES public.ghl_invoices (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id TEXT,
  sku TEXT,
  name TEXT,
  price NUMERIC,
  quantity NUMERIC,
  line_total NUMERIC,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (invoice_id, position)
);

CREATE INDEX IF NOT EXISTS idx_ghl_invoice_items_location ON public.ghl_invoice_line_items (location_id);
