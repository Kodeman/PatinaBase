# W7 — fix round 1

**Branch** `hour-tracking/portal` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`
**Commit** `da4133772` — *"fix(time): the studio's own rate card binds too, and an unbound rate holds the send (W7-R1-01)"*. Pushed.
**Local stack** `patina-hours` — API `http://127.0.0.1:54421`, Postgres `127.0.0.1:54422`. This stage owns the reset (lane B).
**Findings applied:** W7-R1-01 (the only finding). Applied in full — not the "cheapest partial fix". `supabase/config.toml` was never staged.

---

## W7-R1-01 — the two-role default rate card no longer strands

The finding is right on every fact, and the fix is the one it names, all four parts:

| # | What the finding asked for | Where it landed |
|---|---|---|
| 1 | the `ROSTER_RATE_ROLES` picker on the studio Agreement-defaults rate card, incl. the `roleName:''` add-row | `account-studio-page.tsx` — the free-text `<input>` is a `<Select>`; `+ Add a role` seeds the next free role and is spent at four |
| 2 | carry `rosterRole` through `studio_agreement_defaults.rate_card` | `@patina/types` `RateCardRow`, the hook's row type, one shared `rateCardForSave` mapper (save + dirty check read the same one) |
| 3 | carry it through `materialize_standard_parts`' projection | `00618`, new section (6): the head's body verbatim by line range, two deltas |
| 4 | a readiness blocker for a rate row with no binding | `readiness.ts` `UNBOUND_ROLE_BLOCKER` |

### (3) is two deltas, not one — the second was invisible from the finding's vantage

The finding names the studio-default arm (`COALESCE(v_defaults.rate_card,'[]')`). Grafting only that would have left a second, quieter leak in the same function: the **proposal's own** rates project into the part as `roleName / hourlyRateCents / sortOrder / effectiveAt` and **not** `rosterRole`. So a card bound in the Contract Room, re-opened (discard → re-materialize, which is what opening the room does), came back **unbound**; the designer picks again, and `upsert_agreement_parts` is DELETE-then-INSERT, so the binding is lost on a round trip through the room it was made in. Both legs are grafted, and case **40a** below is the one that measures it.

The studio-default arm is projected **key by key** rather than passed through whole: it admits only the four roster roles, so a defaults card carrying `rosterRole:'client'` (or any stray value) reaches the part as the **unchosen state** instead of as a card `upsert_agreement_parts` refuses to save. Non-object entries and numeric garbage are tolerated the way jsonb has to be.

Head confirmed sole: `grep -rln "CREATE OR REPLACE FUNCTION[^(]*materialize_standard_parts" supabase/migrations/*.sql` → `00575` only (`:3073`, lineage line added to 00618's banner). §0.4 satisfied — body extracted by `sed -n '3073,3311p'`, never retyped.

### (2) normalisation, the same rule as the proposal rates

New `00618` section **(2a)**: `studio_agreement_defaults.rate_card` entries whose `roleName` normalize-matches get `rosterRole` stamped — **only where the answer is unambiguous inside its own card** (a card naming "Lead designer" beside "lead_designer" is left entirely alone, exactly as section (2) leaves the proposal rates). The `set_studio_agreement_defaults_updated_at` trigger is disabled for the statement: `updated_at`/`updated_by` answer *who last changed this and when*, and a migration is not a studio editing its defaults. P-4 untouched — this table prices nothing, it seeds; no `project_time_entries` row is read or written by the file.

### (4) the blocker, and what it deliberately does NOT do

`"Every rate on the card names the roster role it prices."` — fires on a rate-card part carrying **any** role with no `rosterRole` (a card with no roles at all asks nothing). It holds **send/sign**, not Save: a draft is allowed to be unfinished, and `upsert_agreement_parts` accepts a NULL binding, so blocking Save would trap a studio inside a legacy card. The room asks while the answer can still be given — after countersign the rate rows are the immutable snapshot of a signed contract and the binding can no longer be made.

**Behaviour change, stated plainly:** an existing draft whose card carries labels only now reads *needs attention* and cannot be sent until somebody picks. That is the point of the finding — a label-only card is money that strands the moment it is signed — and the composer's picker is one act away.

### What the fix does not touch

- `project_billing_authority_rates` is still not renormalised (00618's Deviation 1 stands): signed paper is not rewritten, and the legacy label leg prices those rows exactly as it did yesterday.
- No new migration number. `00618` is unmerged, so it was edited in place per the brief. `00619`, `00620` untouched. No schema delta: `packages/supabase/src/database.types.ts` regenerated and **unchanged**.

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/00618_authority_rate_role_binding.sql` | +438: section (2a) the studio-defaults normalisation · section (6) `materialize_standard_parts` grafted from `00575:3073` with two deltas + its REVOKE/GRANT · ten new postconditions (h)/(i) |
| `supabase/seed/00-legacy-grants.sql` | regenerated by the **worktree's own** `python3 ./scripts/generate-legacy-grants.py` (§0.20) — 2648 statements, +12 lines (the seed's REVOKE/GRANT pair) |
| `supabase/tests/commercial/agreement_parts_test.sql` | +125: case **40a** (a bound card survives the round trip through the room) and **40b** (a new agreement starts from the studio's card WITH its binding; an unbound row seeds as the unchosen state; `'client'` does not seed as a role) |
| `packages/types/src/agreement.ts` | `RosterRateRole` + `RateCardRow` — one declaration for the three surfaces that write the binding; `StudioAgreementDefaults.rateCard` is `RateCardRow[]` |
| `packages/supabase/src/hooks/use-studio-agreement-defaults.ts` | the row type carries the binding |
| `apps/designer-portal/.../account/account-studio-page.tsx` | the picker; `rateCardForSave` shared by the save and the dirty check; taken-role/next-free state; one help line |
| `apps/designer-portal/.../agreement/part-kinds.ts` | `ROSTER_RATE_ROLES` typed against the shared `RosterRateRole`, which it re-exports (no second declaration of the four values) |
| `apps/designer-portal/.../agreement/readiness.ts` | `UNBOUND_ROLE_BLOCKER` + the check |
| four test files | `agreement-defaults-card` (fixture bound, picker cases), `readiness.test` (fixture bound, three HT-4 cases), the two composer fixtures (bound, so the rail stops marking the row) |

---

## Gates, verbatim, as run

| Command | Result |
|---|---|
| `npx supabase db reset --workdir …/agent-portal` | **clean** — every 00618 postcondition passed, including the ten new ones |
| `psql … "pg_get_functiondef(materialize_standard_parts) ~ …"` | `t\|t` — both deltas live in the deployed body |
| `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16**, **6 unexpected — the identical documented six**; `agreement_parts_test.sql` green, `PASS 40a` and `PASS 40b` confirmed executing by their own NOTICEs |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green**, 0 unexpected |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's own copy) | 2648 statements, seed committed |
| `pnpm db:generate` → `git diff packages/supabase/src/database.types.ts` | **no diff** — additive function change only |
| `pnpm --filter @patina/types type-check` / `build` | clean |
| `pnpm --filter @patina/supabase type-check` · `test` | clean · **102 files / 1255 tests pass** |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **580 suites / 7407 tests, all pass** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (all pre-existing) |
| `pnpm --filter @patina/admin-portal build` | compiled successfully (§0.24 type-integrity gate) |
| `pnpm --filter @patina/client-portal type-check` | clean |

Pre-commit reported Prettier drift on five files. **Pre-existing**: `prettier --check` on `HEAD~1`'s `packages/types/src/agreement.ts` warns too. Not reformatted — a whole-file reformat would bury the change.

---

## The changed control at 390 and 1440 — measured, with its caveat named

**What could not be done.** The live signed-in walk this lane ran in round 1 was not reachable this session: the dev server on 3100 serves SSR HTML but **never finishes compiling the client chunks** (`Watchpack Error: EMFILE: too many open files` — another program holds the machine's file descriptors). Measured, not guessed: `document.querySelector('.document-route-shell')` is present, the route's page chunk is absent from `<script src>` (only `main-app`/`webpack`/`polyfills`), and a React-rendered node carries **no** `__reactFiber$`/`__reactProps$` keys — React never hydrated, so no event listener exists to open the Account sheet (`document:open-account`, `?`, `t` all no-op; `body.innerText` 712 → 712). Ports 3000/3002 were never touched; the server was killed and every probe script deleted.

**What was done instead.** A harness page served **by that same dev server**, so it loads the app's own compiled `/_next/static/css/app/layout.css` (373 KB), reproducing the real container chain — `.doc-sheet-layer` → `.doc-sheet-panel max-w-[640px] px-6 sm:px-9` → `mx-auto max-w-xl` → `max-w-md` → the row's `grid-cols-[minmax(0,1fr)_120px_auto] gap-2` — with the picker's exact `<Select>` markup. It measures the layout, which is what the rule is about; it does not prove the React behaviour, which the 95 jsdom cases do.

| Control | 1440 | 390 |
|---|---|---|
| sheet panel | x=400 w=640 | x=18 w=354 (right edge 372 of 390) |
| Default role 1 · the picker | x=442 **w=326 h=43**, right 768 | x=46 **w=111 h=43**, right 157 |
| Default role 2 · the picker | x=442 w=326 h=43 | x=46 w=111 h=43 |
| its rate field beside it | x=777 w=120 | x=166 w=120, right 286 |
| Remove | 906 → 946 | 295 → **335** (inside the panel's 372) |
| `+ Add a role` | x=442 w=60 | x=46 w=60 |
| the help line | w=504, 2 lines | w=289, 3 lines |
| page overflow-x · panel overflow-x | **0 · 0** | **0 · 0** |

**Nothing is off-screen at either width, and nothing scrolls sideways.** Two things said plainly rather than buried:

1. **43px, not 44** — the design system's own `<Select>`, the identical height the round-1 picker measured in the composer. Same standing question, unchanged: a shared form control, not this wave's to raise.
2. **111px at 390** is narrow, and a long option label ("Support designer") clips. It is the **same 1fr column the free-text input occupied**, so the width is not a regression — but it is a legible-at-390 question worth a ruling if the studio card is ever widened.

---

## Owed / worth a line in the ship report

1. The round-1 owed item — *"a ruling on whether the studio defaults card gets the same picker"* — is **answered by building it**, per the brief. If Kody rules the other way, the revert is the picker plus the readiness blocker; the migration's carry is harmless either way.
2. **A live signed-in 390/1440 walk of this card is still owed** whenever the machine can compile the client bundle — the harness measures CSS geometry, not the picker's behaviour in the real sheet.
3. Existing drafts carrying label-only rate cards now read *needs attention* and cannot be sent until somebody picks. Intended, and worth one sentence to Leah rather than a surprise.
4. `supabase/tests/commercial/design_services_authority_test.sql` remains one of the six documented pre-existing failures; the seed coverage went into `agreement_parts_test.sql`, which is green.
