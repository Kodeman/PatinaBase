# Local Supabase stack ownership — agreement-w1

Date: 2026-09-06

**This program (agreement-w1 — "The Agreement, Composed", Wave 1) now owns the
shared local Supabase stack for the duration of this build.**

- The stack was found already running at migration head `00574` (confirmed via
  `select version from supabase_migrations.schema_migrations order by version
  desc limit 3` → `00574, 00573, 00572`). It was **not reset** by this steward.
- All three Wave 1 lanes (`agreement/w1-backend`, `agreement/w1-designer`,
  `agreement/w1-client`) validate their new migration (`00575_agreement_parts.sql`
  and any Wave-1-only follow-ons) against **their own scratch database**
  (`patina_w1`), never against the shared `postgres` database on 54322. See
  `env.md` in this directory for the scratch-DB recipe.
- No lane may run `supabase db reset` or `supabase stop`/`start` against the
  shared stack during this build. The shared stack stays exactly as found
  (head `00574`) until the integration steward resets it to bring Wave 1's
  migration in for real.
- **The integration steward owns the next reset.** When Wave 1 lanes are ready
  to integrate, the integration steward resets the shared local stack (picking
  up `00575_agreement_parts.sql` for real, replaying seeds), not any individual
  lane.

---

## Integration steward reset — 2026-09-06

**The integration steward is taking the stack now.** Wave 1's three lanes are
merged onto `agreement/w1-integration` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-integration`
(merge commits `488391a8c` backend → `e98964d20` designer → `679f08773` client).

- Stack state immediately before this reset: running, head `00574`
  (`select version from supabase_migrations.schema_migrations order by version
  desc limit 3` → `00574, 00573, 00572`), `supabase_edge_runtime_supabase` and
  `supabase_pooler_supabase` stopped — exactly as `env.md` recorded it.
- `supabase db reset` is being run from the **integration worktree** so the
  replay picks up `00575_agreement_parts.sql` and the regenerated
  `supabase/seed/00-legacy-grants.sql`. Expected head after the reset: `00575`.
- **No other agent may reset, seed, stop, or start the shared stack from this
  point on.** Scratch-DB validation (`patina_w1*`) is finished; every remaining
  Wave 1 gate runs against the shared `postgres` database.
- The stack is left running at head `00575` for the designer/client walk — see
  `walk-env.md` in this directory for the boot recipe.

---

This notice exists per the parallel-work discipline in
`.claude/skills/patina-parallel-work` and the shared-stack lesson in project
memory (`feedback_shared_local_supabase_stack_last_reset_wins.md`): concurrent
resets/seeds against one shared Postgres instance corrupt each other's runs.
