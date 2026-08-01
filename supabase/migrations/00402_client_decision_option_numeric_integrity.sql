-- 00402_client_decision_option_numeric_integrity.sql
--
-- Decision-option price and quantity flow directly into project_ffe_items.
-- Keep every newly written option representable as a non-negative INTEGER
-- line total while leaving cost and lead-time deltas intentionally signed.
--
-- NOT VALID preserves pre-existing legacy rows. PostgreSQL still enforces
-- each constraint for every INSERT and UPDATE after this migration. A clean
-- environment validates immediately; an environment with historical invalid
-- rows can deploy safely and validate after those rows are reconciled.

ALTER TABLE public.client_decision_options
  ADD CONSTRAINT client_decision_options_quantity_positive
  CHECK (quantity IS NOT NULL AND quantity >= 1) NOT VALID;

ALTER TABLE public.client_decision_options
  ADD CONSTRAINT client_decision_options_sort_order_nonnegative
  CHECK (sort_order IS NOT NULL AND sort_order >= 0) NOT VALID;

ALTER TABLE public.client_decision_options
  ADD CONSTRAINT client_decision_options_price_nonnegative
  CHECK (price IS NULL OR price >= 0) NOT VALID;

ALTER TABLE public.client_decision_options
  ADD CONSTRAINT client_decision_options_line_total_fits_integer
  CHECK (
    price IS NULL
    OR price::bigint * quantity::bigint <= 2147483647::bigint
  ) NOT VALID;

DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decision_options
    WHERE quantity IS NULL OR quantity < 1
  ) THEN
    ALTER TABLE public.client_decision_options
      VALIDATE CONSTRAINT client_decision_options_quantity_positive;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decision_options
    WHERE sort_order IS NULL OR sort_order < 0
  ) THEN
    ALTER TABLE public.client_decision_options
      VALIDATE CONSTRAINT client_decision_options_sort_order_nonnegative;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decision_options
    WHERE price < 0
  ) THEN
    ALTER TABLE public.client_decision_options
      VALIDATE CONSTRAINT client_decision_options_price_nonnegative;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decision_options
    WHERE price IS NOT NULL
      AND quantity IS NOT NULL
      AND price::bigint * quantity::bigint > 2147483647::bigint
  ) THEN
    ALTER TABLE public.client_decision_options
      VALIDATE CONSTRAINT client_decision_options_line_total_fits_integer;
  END IF;
END
$validation$;

COMMENT ON CONSTRAINT client_decision_options_quantity_positive
  ON public.client_decision_options IS
  'Every newly written decision option has at least one unit.';

COMMENT ON CONSTRAINT client_decision_options_sort_order_nonnegative
  ON public.client_decision_options IS
  'Every newly written decision option has a non-negative display position.';

COMMENT ON CONSTRAINT client_decision_options_price_nonnegative
  ON public.client_decision_options IS
  'Decision-option client unit prices are nullable or non-negative cents.';

COMMENT ON CONSTRAINT client_decision_options_line_total_fits_integer
  ON public.client_decision_options IS
  'Decision-option price times quantity must fit project_ffe_items.line_total_cents.';
