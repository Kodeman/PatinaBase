# W1 — fix round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Commit **`090f4fd03`** `fix(time): W1 review round 6 — no pricing tiebreak the seating caller can write`, pushed to `origin/hour-tracking/server` (`d687c80d4..090f4fd03`).
DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` still skip-worktree'd (`git ls-files -v` → `S`) and in no commit of the range.

Two files in the commit, both W1 paths, nothing else:

```
supabase/migrations/00599_resolve_time_rate_cents.sql   |  98 ++++++++++-
supabase/tests/billing/time_rate_resolution_test.sql    | 196 ++++++++++++++++++++-
```

---

## W1-R6-01 · BLOCKER · **FIXED**

**Accepted as measured.** The two caller-writable tiebreaks are deleted from the studio ladder.

| what | where |
|---|---|
| `membership.joined_at NULLS LAST,` and `membership.created_at,` removed from the `ORDER BY` | `supabase/migrations/00599_resolve_time_rate_cents.sql:437-440` — the ladder now ends `(membership.role = 'owner') DESC, studio.created_at, studio.id` |
| in-body rationale (why `organizations.created_at` is the last resort: `organizations` carries no INSERT policy for `authenticated`, so it is server-set) | `00599:388-413` (ending in the HT-3-a pointer at `:411-413`) |
| banner section **REVIEW ROUND 6**, naming the attack, its two negative controls, and the pin | `00599:230-278` |
| postcondition: the function body must carry **no** `membership.joined_at` and **no** `membership.created_at` term, with the reason in the raise | `00599:753-771` |
| test case **(x)** — the `member` seat in a **SECOND ACCOUNT's** workspace, every write through RLS as the actor named | `supabase/tests/billing/time_rate_resolution_test.sql:1932-2090` (section header `:1932`, case comment `:1943`, asserts `:2061-2087`) |
| header summary for round 6 + the W1-R6-02 "recorded, not closed" note | `time_rate_resolution_test.sql:121-144` |

Case (x)'s shape: a two-year-old employing studio with its own owner prices her arm's-length at 15000; a second designer account's auto-provisioned workspace (00295) seats her as a plain `member` with `joined_at` backdated three years, through RLS as that account, and then writes her 99900 there under its own `created_by`. Preconditions assert the puppet workspace exists and is multi-member (x0, x0h), that she is a plain `member` of it (x0f), that the puppet's rate row is genuinely arm's-length (x0g), that the project's `studio_id` is NULL (x0c), and — because the fix's last resort is `organizations.created_at` — that **the employing studio is older than the puppet** (x0e), so the case cannot be resting on a uuid tiebreak.

**Negative control, run this session before the fix was applied to the stack** (the live body still carried `membership.joined_at`, verified by `pg_get_functiondef`): the updated test file aborted exactly where it should —

```
psql:…/time_rate_resolution_test.sql:2091: ERROR:  FAIL x1 (W1-R6-01, HT-1 + HT-3): a rate set in a
SECOND ACCOUNT's workspace, where she sits as a plain member with a backdated seat, priced her own
hour at $1,998.00 — no tiebreak below the owner key may be a column the seating caller writes
```

cases (a)–(w) all printing `passed` ahead of it. After `supabase db reset` with the fixed migration: `case (x) passed.` and `All time_rate_resolution assertions passed.`, 24 cases (a)–(x). Post-reset probe of the live body: `grep -c 'membership\.joined_at|membership\.created_at'` → **0**.

## W1-R6-02 · MAJOR · **RULING RECORDED — option (a), code unchanged**

The finding left the choice to the orchestrator and said clean is reachable either way. Option **(a)** is taken, because (b) re-breaks cases (s), (p) and (w) and bills $0 on every hour a studio has not priced — a money change that belongs to a ruling, not a fix round.

- **`artifacts/hour-tracking-2026-09-11/rulings.md`** — new row **HT-3-a** in the *Sub-rulings and owed rulings* table (line 72), parent HT-3 / HT-1, raised by "W1 review round 6 (W1-R6-02)", status **OWED — not ruled. Shipped as (a)**. Question: which studio may price an hour on a project whose `studio_id` is NULL. It states the mechanism (the bare rate-existence key is satisfied by a workspace the subject owns, because `studio_member_rates_admin_insert` asks only for `is_org_admin_or_owner` and 00295 makes her its owner), that no ordering of the keys removes it, that HT-26 rules `'none'` a display state while the $0 is a lane-B/W2 composer problem, and names (b) as the one-WHERE-clause alternative with the asserts that move with it. This file is **untracked** (the whole `artifacts/` tree is) so it is not in the commit.
- **Pinned in the test**, the HT-6-a/HT-6-b pattern: case (s)'s comment block (`time_rate_resolution_test.sql:1473-1482`) and its `s2` failure message (`:1498-1502`) now name HT-3-a and say that a failure there means it was ruled the other way and the assert moves with it.
- **Named in the migration**, so a future graft cannot read the ladder as a principle: `00599:256-278` (banner) and `00599:409-413` (in-body).

Nothing else in the round-6 review (minors W1-R6-03…W1-R6-06, notes W1-R6-07…W1-R6-12) was in this brief's scope; none was touched.

---

## Gates

| command | result |
|---|---|
| `npx supabase db reset --workdir <worktree>` | **clean** — ledger head `20260910152111` over `00601, 00600, 00599, 00598, 00597…`; every postcondition replayed, including the two new round-6 ones |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 green / 6**, 0 unexpected-fail |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | 10 green, **6 unexpected-fail** — the brief's invocation, exactly W1-R6-08 (absolute `-d` path, so no `KNOWN_FAILURES.md` line matches) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16/16**, 0 unexpected — the six documented pre-existing `_countersign_design_services_agreement_impl` aborts |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H … -p 54422` | **1/1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H … -p 54422` | **1/1 green** — 24 cases (a)–(x), every one printing `passed` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates -H … -p 54422` | **1/1 green** |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical (this diff adds no GRANT/REVOKE; 00599's existing pair is unchanged) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) — no signature or schema change |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **exit 0** (the two `ErrorBoundary` "Attempted import error" warnings are pre-existing; this diff is SQL only) |
| `git status --porcelain` (worktree) | **empty** after the commit; `git ls-files -v supabase/config.toml` → `S`; `git log --name-only … -- supabase/config.toml` over the range → empty |
| `git show --stat HEAD` | the two W1 paths above and nothing else; conventional subject `fix(time): …` |

## Not done / not verified

- **Nothing on Strata.** No `db push`, no prod probe.
- **The round-6 minors and notes** (W1-R6-03 dates on the open row, W1-R6-04 the `authenticated` GRANT, W1-R6-05 ASSERT 2 reading the ladder's winner, W1-R6-06 the single-card `rate_role`, and the six notes) — outside this brief; unchanged.
- **HT-3-a is recorded, not ruled.** Kody owes the ruling; if it lands as (b), the edit is one `AND membership.role NOT IN ('owner','admin')` in `00599`'s candidate query plus a fall-through to `'none'`, and cases (s), (p), (w) move with it.
- **The W1-R6-01 fix under a puppet minted in the same transaction as the employing studio** — `studio.created_at` then ties and the last resort is `studio.id`. Case (x)'s x0e precondition refuses that fixture rather than measuring it; the real answer is HT-3-a, as the review said.
- **Lane B's portal surfaces** — still absent (phase 2, per the orchestrator's scope ruling); no render or PostHog check was possible.
