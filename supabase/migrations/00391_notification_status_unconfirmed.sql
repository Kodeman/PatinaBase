-- ═════════════════════════════════════════════════════════════════════════
-- 00391 — terminal unconfirmed notification delivery
--
-- PostgreSQL enum additions must commit before the new value is used. This
-- migration is deliberately isolated; 00388 stores dispatch state as text and
-- casts it into notification_status only when an RPC runs after migrations.
-- ═════════════════════════════════════════════════════════════════════════

ALTER TYPE public.notification_status
  ADD VALUE IF NOT EXISTS 'unconfirmed';
