# Lane D — round 3 fixes (hour-tracking, W4, branch `hour-tracking/edge`)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-edge`
Branch: `hour-tracking/edge`, `4d72d8590` → **`683311a0c`** (pushed)
Skill loaded: `patina-edge-functions`

Scope: this round applies **D-R3-01 only** (the finding named for this fix pass), plus the
found-clean confirmations below. D-R3-02 through D-R3-06 are new findings from the same review
that were not in scope for this pass and remain open for round 4 (listed under "Not done").

Gate re-run: `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/`
→ **16 passed, 0 failed**, unchanged from round 2 (no code in `time-nudges/` touched this round).
`deno test --allow-all --config supabase/functions/deno.json supabase/functions/digest-dispatcher/`
→ **2 passed, 0 failed** (1 pre-existing + 1 new). `deno check --config supabase/functions/deno.json
supabase/functions/digest-dispatcher/index.ts` → same 5 pre-existing generic-typing errors
(`SupabaseClient<any,...>` vs the untyped `never` schema — confirmed pre-existing by type-checking
`git show HEAD~1:.../index.ts` standalone, same 5 errors, before this round's edit); none introduced
by this diff. No `deno.lock` left at repo root.

**Caution logged against myself:** after committing, I ran `npx prettier --write` on the touched
files to silence the pre-push hook's advisory formatting warning, and it reformatted large
unrelated spans of `digest-dispatcher/index.ts` (function signatures, ternaries, object literals) —
the same undisclosed-reformat shape D-R2-05 had to revert last round. Caught it before pushing:
`git checkout -- <the three files>` restored the working tree to the already-committed, unreformatted
state (the commit itself was made before the prettier run, so nothing landed). The pushed commit is
exactly the functional diff below; the repo's pre-existing formatting drift in `digest-dispatcher`
(present since before this round) is untouched.

## Findings applied

**D-R3-01 (major/high) — fixed exactly as named.** `time-nudges` writes one quiet
`notification_log` row per nudge (`channel:"in_app"`, `status:"delivered"`) for both
`time_entry_running_long` and `time_weekly_unlogged_reminder`. `digest-dispatcher`'s per-user
collection query (`index.ts`, `dispatchDigests`) has no `channel` filter — only a status-eligibility
filter and `DIGEST_EXCLUDED_TYPES` — so both types were digest-eligible and, absent a `TYPE_LABELS`
entry, would render as "time entry running long (1)" inside a `weekly_inspiration` email sent to any
designer at default preferences (`digest_frequency:'weekly'`, `channels_email:true`). HT-34 forbids
exactly this ("no push, no email, no badge").

Added `"time_entry_running_long"` and `"time_weekly_unlogged_reminder"` to `DIGEST_EXCLUDED_TYPES`.
Relocated the constant from a private `const` inside `digest-dispatcher/index.ts` to an exported
`const` in `digest-dispatcher/status.ts` (which already holds `DIGEST_ELIGIBLE_NOTIFICATION_STATUSES`
and is imported by `index.ts` as `./status.ts`) — `index.ts` calls `Deno.serve(...)` at module scope,
so a test importing `index.ts` directly would boot an HTTP listener as a side effect (the same reason
`time-nudges`' own test suite imports only `logic.ts`). `status.ts` has no such side effect, so it's
the same fix's natural, side-effect-free home for a unit test.

**Test added, per the ask — proves collection-level exclusion, not just Set membership:**
`status.test.ts`, `"hour-tracking nudge rows never enter the digest collection (HT-34 / D-R3-01)"`.
It (a) asserts `'delivered'` is itself digest-eligible by status — establishing that `DIGEST_EXCLUDED_TYPES`
is the *only* thing that can keep these rows out, matching the finding's own diagnosis; (b) asserts
both type strings are in the Set; and (c) reproduces `dispatchDigests`'s own
`rows.filter((r) => !DIGEST_EXCLUDED_TYPES.has(r.type))` line against a three-row mixed batch (two
nudge rows + one ordinary `new_lead_designer` row, all `status:'delivered'`), asserting the collected
result keeps only the third row's id. (c) is the part that actually proves exclusion from the
*collection*, not merely from the Set.

**Ship-chain consequence, per the finding's own note — recorded here, not yet acted on (deploy is
gated on an explicit ship request):** `digest-dispatcher` changed and must be added to W4's deploy
chain — `supabase functions deploy digest-dispatcher` alongside `supabase functions deploy time-nudges`.
This is not a `_shared/*` edit (no file under `supabase/functions/_shared/` changed), so the fan-out
is exactly these two functions, not every importer of anything shared. `digest-dispatcher` also has no
`config.toml` entry to change (`verify_jwt` unaffected — this function is cron-invoked with a
service-role bearer, same as before).

## Minor findings with a deck-side (documentation-only) action

**D-R3-07 (informational/high) — noted, no code action; this is a merge-order fact for whoever
sequences the merge, not a lane-D fix.** `00614_time_nudges_cron.sql` currently sorts immediately
after `00601` on every ref that has it (only `hour-tracking/edge` and its remote), and depends on
nothing from lane A's still-unmerged `00610`–`00613`. Harmless as authored; flagging here so the
merge order into `hour-tracking/integration` is a deliberate choice (00614 after 00610–00613) rather
than whatever order branches happen to land in.

**D-R3-08 (informational/high) — noted, no code action; the fix is the integration owner's type
regen (D-R1-04), already tracked there.** §5's Done-when (`grep -rn
"weekly_hours_reminder_opt_in" apps packages` returns nothing outside `database.types.ts`) is
vacuously green today because the column is absent from the generated types file entirely — not
because portal code correctly omits it. Recording this so the Done-when is read as **unmet**, not
passed, until `database.types.ts` is regenerated against a stack carrying `00614`.

## Files changed this round

- `supabase/functions/digest-dispatcher/status.ts` — added `DIGEST_EXCLUDED_TYPES` (relocated from
  `index.ts`, now including the two hour-tracking nudge types) (D-R3-01).
- `supabase/functions/digest-dispatcher/index.ts` — imports `DIGEST_EXCLUDED_TYPES` from
  `./status.ts` instead of defining it locally; no behavioral change to any other line (D-R3-01).
- `supabase/functions/digest-dispatcher/status.test.ts` — new test proving both hour-tracking nudge
  types are excluded from the digest collection, not just from the Set (D-R3-01).

No file under `supabase/functions/time-nudges/` changed this round.

## Not done (owed elsewhere or to round 4, stated rather than silently skipped)

- **D-R3-02** (medium/high) — `opened_at` unset means the iOS badge predicate (`badgeRowIsRead`,
  `apns-send/core.ts`) reads the nudge row as unread even though the web bell (via `metadata.read_at`)
  reads it as read; HT-34's "no badge" therefore holds on one surface and not the other. Out of scope
  for this pass; carried to round 4.
- **D-R2-03 / D-R3-02, together** — the orchestrator ruling on whether the Record row should read as
  read or unread on *both* surfaces is still owed; not a lane-D code decision.
- **D-R3-03** (medium/high, mechanism) — the read-only Vault-shape probe on Strata
  (`SELECT left(decrypted_secret,10), length(decrypted_secret) FROM vault.decrypted_secrets WHERE
  name='app.settings.service_role_key'`) that decides whether the `running_timer` gate widens back to
  both arms or the `job_runs` insert needs a non-credential guard. Needs Strata access this
  worktree/session doesn't have.
- **D-R3-04** (low/high) — the test named `"only the service role may run either sweep"` in
  `time-nudges/index.test.ts:426` is now false (only `weekly_unlogged` is gated, per D-R2-01); needs
  a rename plus extracting `requiresServiceRole(rule)` into `logic.ts` so gate placement is asserted
  by a running test. Not touched — this round's scope was `digest-dispatcher`, not `time-nudges`.
- **D-R3-05** (low/medium) — the dark arm's 403 leaves no trace (no `console.warn`, no `job_runs`
  row). Not touched this round.
- **D-R3-06** (low/high) — nudge rows also inflate the admin comms dashboard's "sent" count / depress
  its open rate; shares D-R3-02's fix (`opened_at`). Not touched this round.
- **D-R1-04 / D-R3-08** — regenerate `database.types.ts`; integration owner's, per round 1 and 2.
- **D-R1-06** — script the skip-worktree dance before the first W4 merge; not lane D's.
- **D-R1-12** — strike `00614` from plan-v2 §0.20/§11's fixed GRANT lists; a plan-document edit.
- **D-R2-04** — the `?sheet=hours` W2 dependency, for the ship note and W2's Done-when.
- **D-R2-08** — `pnpm --filter @patina/designer-portal type-check` clean run; needs the integration
  branch's built workspace dists.
- **D-R3-07** — merge order vs. lane A's `00610`–`00613`; a merge-sequencing decision, not a fix.
