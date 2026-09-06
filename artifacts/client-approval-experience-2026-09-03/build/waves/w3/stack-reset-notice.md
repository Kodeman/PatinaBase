Wave 3 reset ownership — nobody on this wave resets the shared local Supabase stack during the
build. Unlike Wave 1/Wave 2, the **backend lane validates on a scratch database, not the shared
stack**, and **only the integration steward resets the shared stack**, and only after the
orchestrator's handshake.

- 2026-09-05 — **steward pass** (this session): confirmed the shared local Supabase stack is
  running (`supabase status` from `/Users/kody/Code/patina-merged` returned the standard local
  API/DB/Studio URLs, no error) and did **not** reset or seed it. A peer program
  (`studio-invoices/*`, worktrees `agent-si-*`) is actively minting migrations against this same
  repo/stack — its `00571_studio_invoices.sql` is committed on `studio-invoices/w1-db` and
  siblings, and its own worktrees hold uncommitted-elsewhere lane state. Wave 3 must not disturb
  that program's stack state.
- No lane in this wave — backend included — is authorized to run `supabase db reset` /
  `supabase:reset` / any migration-apply against the shared local stack during the build phase.
  The backend lane's brief directs it to stand up its own scratch database for SQL-gate
  validation instead.
- The integration steward resets the shared stack once, for the Wave-3 integration gate pass,
  after the orchestrator confirms the peer program (`studio-invoices`) is clear to be replayed
  over, exactly as the Wave 2 integration steward did at close. Until that handshake, treat the
  shared stack as belonging to the peer program.
- No `.env` file exists in any Wave 3 worktree. Local Supabase keys for any web-lane walk against
  the shared stack come from `supabase status -o env` run fresh from
  `/Users/kody/Code/patina-merged` — see `env.md`.

- 2026-09-05 — **integration steward** (`approvals/w3-integration`, worktree
  `agent-cae-w3-integration`, HEAD after the three lane merges): the orchestrator's integration
  brief directs step 5 to append here and then run `supabase db reset` — that is the handshake
  this notice was waiting on. The shared local stack is about to be **reset and replayed from
  the integration branch's `supabase/migrations`**, which carries main's ledger through 00569
  plus Wave 3's `00572_she_sets_the_pace.sql` and `00573_approval_record_typed_name.sql`.
  ⚠ **The peer program's `00571_studio_invoices.sql` is NOT on this branch** — it lives only on
  the unmerged `studio-invoices/*` branches — so after this reset the shared stack no longer
  carries the studio-invoices schema. A `studio-invoices` lane that needs it must re-reset from
  its own worktree (`supabase db reset` from `agent-si-*`), which is that program's normal
  "last reset wins" recovery on a shared local stack.
  Confirmed local before resetting: `supabase status` → `API_URL http://127.0.0.1:54321`,
  `DB_URL postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod endpoint touched.

- 2026-09-05 — **integration steward, correction after merging main.** The warning immediately
  above is now void, and no peer program loses anything by this reset. `origin/main` advanced
  while Wave 3 built: the `studio-invoices` program merged to main (`75b0c2840`), carrying
  `00571_studio_invoices.sql` with it. The integration branch merged that main
  (`9c38a2645`), so the branch's `supabase/migrations` now holds main's ledger through 00571
  **plus** Wave 3's 00572 and 00573 — nothing is dropped by replaying from here. No renumbering
  was needed: 00572/00573 sit above main's highest (00571).
  Two conflicts, both resolved minimally: `supabase/seed/00-legacy-grants.sql` (both sides
  appended their own migration's grant block — kept both, 00571's ahead of 00572's, and closed
  the `DO $g$` block the conflict had truncated; `DO`/`END` counts balance at 2196 each) and
  `apps/client-portal/src/components/threshold/house-ledger.tsx` (`owedWords` — kept main's
  studio-invoice arms, applied P-24's `countInWords` speller to all three, and moved the four
  figure-spelled expectations in `house-ledger.test.tsx` / `threshold.test.tsx` onto words).
  The shared local stack is reset from this merged tree. `supabase status` local before the
  reset: `API_URL http://127.0.0.1:54321`, `DB_URL postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
  No prod endpoint touched.
