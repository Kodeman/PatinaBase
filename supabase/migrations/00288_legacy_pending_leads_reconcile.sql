-- ═══════════════════════════════════════════════════════════════════════════
-- 00288 — Reconcile legacy leads (match_reasons shape + 'pending' status)
--
-- Two legacy hazards from the retired client-portal iOS route
-- (/api/rooms/[id]/designer-lead), which wrote leads directly:
--
--   1. match_reasons as a JSON OBJECT. The Brief renders match_reasons as a
--      string[]; an object throws it off. Column default is '[]'::jsonb, so
--      well-behaved rows are arrays. Normalize any non-array, non-null value to
--      an empty array — the safest Brief-consumable shape (a legacy object can't
--      be coerced to string[], and the match metadata it held is non-critical).
--      NULLs are left untouched (jsonb_typeof(NULL) is NULL → not matched).
--
--   2. status = 'pending' — not in the lead lifecycle enum ('new','viewed',
--      'contacted','accepted','declined','expired'), so those rows are invisible
--      on the Desk. Conductor ruling #5: recent 'pending' (< 60 days) → 'new'
--      (enters the pool); older 'pending' → 'expired' (don't flood the pool with
--      dead requests).
--
-- Pure data migration — no schema, no grants. Idempotent: after the first run no
-- 'pending' rows remain and every match_reasons is an array (or NULL), so reruns
-- are no-ops.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Normalize object/scalar match_reasons → empty array.
UPDATE public.leads
   SET match_reasons = '[]'::jsonb,
       updated_at    = now()
 WHERE match_reasons IS NOT NULL
   AND jsonb_typeof(match_reasons) <> 'array';

-- 2a. Recent legacy 'pending' → 'new' (claimable in the pool).
UPDATE public.leads
   SET status     = 'new',
       updated_at = now()
 WHERE status = 'pending'
   AND created_at > now() - interval '60 days';

-- 2b. Stale legacy 'pending' → 'expired'.
UPDATE public.leads
   SET status     = 'expired',
       updated_at = now()
 WHERE status = 'pending'
   AND created_at <= now() - interval '60 days';
