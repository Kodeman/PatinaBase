-- ═══════════════════════════════════════════════════════════════════════════
-- 00215 — project_tasks dependency web (Track 5)
--
-- "The work" gains an owner and two kinds of dependency so a task can say truth-
-- fully who it's waiting on and why:
--   · owner / owner_party_id  — whose task it is (designer|client|gc|vendor),
--     pointing at a concrete project_parties row (00212) when gc/vendor.
--   · blocked_by_item_id      — a coordination item (client_decisions) that must
--     resolve before this task can start. When that item resolves, the cascade
--     (00218) flips this task blocked→todo. ON DELETE SET NULL — deleting the
--     blocker frees the task, never deletes it.
--   · seq_after_task_id       — trade sequencing: this task comes AFTER another
--     task ("install after demo"). Self-reference is a CHECK error; multi-hop
--     cycles are an app-time validation (R53) — the DB guards self-reference only.
--
-- The status CHECK ('todo'|'done'|'blocked', 00169) is UNCHANGED. Derived
-- effective-blocked state (an open blocker OR an unfinished seq_after) is READ-
-- SIDE (task_blocked_state view, 00219), not stored — so the truth recomputes
-- on read and never drifts.
--
-- Additive only (D7): ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- The status CHECK is NOT touched; legacy tasks default to owner='designer',
-- both dependency columns NULL — i.e. exactly today's behavior.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'designer'
    CHECK (owner IN ('designer', 'client', 'gc', 'vendor')),
  ADD COLUMN IF NOT EXISTS owner_party_id UUID
    REFERENCES public.project_parties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_by_item_id UUID
    REFERENCES public.client_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seq_after_task_id UUID
    REFERENCES public.project_tasks(id) ON DELETE SET NULL;

-- A task can never sequence after itself (the DB-level cycle floor; multi-hop is
-- app-validated, R53). Guarded ADD so a re-run doesn't error on the existing
-- constraint.
DO $$ BEGIN
  ALTER TABLE public.project_tasks
    ADD CONSTRAINT project_tasks_seq_after_not_self
      CHECK (seq_after_task_id IS NULL OR seq_after_task_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.project_tasks.owner IS
  'Track 5: whose task this is (designer|client|gc|vendor). Default designer = '
  'today''s behavior. Pairs with owner_party_id for a concrete gc/vendor.';
COMMENT ON COLUMN public.project_tasks.blocked_by_item_id IS
  'Track 5: a coordination item (client_decisions) that gates this task. When it '
  'resolves, resolve_coordination_item (00218) flips this task blocked→todo. '
  'ON DELETE SET NULL — removing the blocker frees the task.';
COMMENT ON COLUMN public.project_tasks.seq_after_task_id IS
  'Track 5 trade sequencing: this task runs AFTER another task ("install after '
  'demo"). Self-reference is forbidden (CHECK); multi-hop cycles are app- '
  'validated (R53). Effective-blocked is derived read-side (task_blocked_state).';

-- Partial indexes — only the dependency-bearing tasks need fast lookup (the
-- cascade scans blocked_by_item_id; the read model scans seq_after_task_id).
CREATE INDEX IF NOT EXISTS idx_project_tasks_blocked_by_item
  ON public.project_tasks(blocked_by_item_id)
  WHERE blocked_by_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_tasks_seq_after
  ON public.project_tasks(seq_after_task_id)
  WHERE seq_after_task_id IS NOT NULL;
