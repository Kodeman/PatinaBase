-- ═══════════════════════════════════════════════════════════════════════════
-- 00198 — time-system extension (spec v1.2 §9, ruling R4): additive columns
-- on project_time_entries. NEVER fork the table — duration_minutes stays
-- canonical; the invoice guard trigger (00177), project_unbilled_time view,
-- and the one-running-timer-per-user partial index are all untouched.
--
--   raw_seconds   pre-adjustment elapsed at stop (audit trail; D10 — the
--                 designer adjusts the logged number up or down, the raw
--                 truth is never lost and never shown as an accusation)
--   idle_seconds  annotation ONLY (D10) — never subtracted; the idle
--                 detector that writes it ships with the Slice 6 polish pass
--   source        how the entry was born. The header TimerButton keeps
--                 writing without the column — the default keeps its
--                 entries honest ('timer_manual') with zero old-zone edits.
--                 'timer_auto' = the document spine timer (D11 pick-up).
--   activity      the ONE attribution the designer is asked for (R4):
--                 Design / Sourcing / Client / Site visit / Admin in v1.
--                 phase_key auto-fills from the document's current phase —
--                 the spine knows where the pen is.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.project_time_entries
  add column if not exists raw_seconds  integer,
  add column if not exists idle_seconds integer,
  add column if not exists source       text not null default 'timer_manual'
    check (source in ('timer_auto', 'timer_manual', 'manual_entry')),
  add column if not exists activity     text
    check (activity is null
           or activity in ('design', 'sourcing', 'client', 'site_visit', 'admin'));

comment on column public.project_time_entries.raw_seconds is
  'Pre-adjustment elapsed seconds at timer stop (R4 audit trail). NULL for manual entries.';
comment on column public.project_time_entries.idle_seconds is
  'Idle time detected during the entry — annotation only, never subtracted (D10).';
comment on column public.project_time_entries.source is
  'timer_auto = document spine timer (D11) · timer_manual = header TimerButton · manual_entry = typed in.';
comment on column public.project_time_entries.activity is
  'R4 designer-picked activity (v1 vocabulary). Phase attribution auto-fills separately via phase_key.';
