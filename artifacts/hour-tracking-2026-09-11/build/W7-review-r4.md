# W7 — adversarial review, round 4

**Not clean.** One **new major** (a rate card of more than four roles can never be made sendable, and the room offers no way out), one **major carried and ruling-gated** (W7-R3-02, the evening hour that carries two dates), and twenty carried minors/notes. Every gate the brief names was **run in this context and is green** against the documented baselines, and the one thing three rounds could not close — **the two HT-35 bands at 390 and 1440 — is now measured, and it passes.**

**Branch** `hour-tracking/portal` @ `d516a5658`, seven commits ahead of `origin/hour-tracking/integration` @ `fd28a9542`. Worktree clean at the end of this review (a dev-server rewrite of `next-env.d.ts` was reverted; ports 3100/8791 released, 3000/3002 never touched).

---

## Round-3 fixes — each independently verified

| Finding | Verified |
|---|---|
| **W7-R3-01** (latched disclosure survived the opt-out and swallowed the fallback) | **CLOSED.** `document-time-provider.tsx`: `showDisclosure` now carries `!optedOut`, and the un-latch effect fires on `optedOut` as well as `!held`. Re-read end to end; the regression case is in the suite and the full designer suite is green at 7413 (was 7401 at impl, 7412 at round 2 + 1). |
| **W7-R3-02** (an evening hour carries two dates) | **NOT closed, correctly.** `time-capture.tsx:286` carries the named comment; the ship-report line and the HT-13-a row are drafted in `W7-fix-r3.md`. I re-measured the mechanism: `time_entry_ledger.day` is `(started_at AT TIME ZONE 'UTC')::date`; `startedAtFromDateValue` keeps local time-of-day. Still divergent. **Carried as a major, ruling-gated — the orchestrator owes the HT-13-a row and the ship line.** |

---

## Gates — run in this context, verbatim, on the isolated stack (`patina-hours`, 127.0.0.1:54422)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean, exit 0.** 00618 and 00619 applied; every postcondition passed |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green**, 0 unexpected |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H …` | **9 green / 16, 7 unexpected — all seven documented.** `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` green **with** their new asserts. See W7-R4-04 below: the seventh (`direct_order_attribution_test.sql`) is the clock-dependent one documented at `supabase/tests/KNOWN_FAILURES.md:114`, and this review ran at **01:09 UTC**, inside its 00:00–02:00 window. The impl's and rounds 1–3's "six" was measured outside it |
| `run-sql-tests.sh -d …/supabase/tests/rls -H …` | **29 green / 31, 2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | **580 suites / 7413 tests, all pass** |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings (identical count to rounds 2–3, all pre-existing "unused eslint-disable") |
| `pnpm --filter @patina/admin-portal build` | **compiled successfully** (§0.24 type-integrity gate) |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/client-portal test` | **151 suites / 2475 tests, all pass** |
| `pnpm db:generate` → `git diff --exit-code database.types.ts` | **regenerated, diff clean** (§0.19) |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's own copy) | **regenerated, seed diff clean** — 2648 statements (§0.20) |
| migration-number collision check across every ref | 00618/00619 held by this branch alone; peer program runs 00621+ |
| commit hygiene | seven Conventional-Commit commits, pushed (`hour-tracking/portal` == `origin/hour-tracking/portal`); `supabase/config.toml` never staged; no `git add -A` residue |

---

## What I could not refute

Each of these I attacked directly, through RLS as the actor on the reset stack, not by reading the impl's claims.

1. **A two-role rate card binds and resolves without free text.** Case (al) runs under `pg_temp.assume_user` (`SET LOCAL ROLE authenticated` + a real `request.jwt.claims`), and its four questions execute (its own NOTICE fires). `al1`: a card bound to `lead_designer` under the label "Principal designer" prices the lead at 26000 **and binds** (`authority_rate_id`, `billing_state='authorized'`). `al2`: the new hire under the label "Associate" prices 11000 / 22000 / `authority` / `authorized` — the stranding defect, closed. `al4`: two bound roles, neither label matching, the member's pick decides the **bound** card. I re-ran the enum/label legs against the live function bodies: tier 1 asks `rate.roster_role = v_role` before the label leg, and the label leg carries `AND rate.roster_role IS NULL`, so a bound card cannot answer twice.
2. **The countersign carry snapshots the role.** `_countersign_design_services_agreement_impl`'s live `prosrc` carries `roster_role` on the `project_billing_authority_rates` INSERT, and `agreement_fee_schedules_test.sql` drives the whole rail — parts door → projection → send → sign → countersign — asserting the binding on the snapshot, the label untouched beside it, and that **every** snapshot row equals the source row it froze (carried, never re-derived). Green.
3. **The default label no longer strands.** `grep -rn "Principal designer" apps/designer-portal/src packages` returns no production default seed — only comments, and test fixtures that deliberately use the old label. Both writers (composer, studio defaults) now write `rosterRole` beside the label, `materialize_standard_parts` carries it through both arms, and `UNBOUND_ROLE_BLOCKER` holds `send` on a card that names none.
4. **An internal entry can never be billable and never reaches an invoice.** Probed as the actor: an internal row stores `project_id NULL · billable false · billing_state nonbillable · rate_source none · rated_amount_cents 0`; `UPDATE … SET billable = true` is refused by `project_time_entries_internal_scope_ck`; `claim_time_entries` returns **0** rows for it; it is **absent** from `project_unbilled_time`; it is present in `time_entry_ledger` for its author. `isInvoiceEligibleTimeEntry` requires `billable === true` and `filterProjectUnbilledEntries` keys on `project_id`, so no client path reaches it either.
5. **The opt-out really stops auto-start, and the preference is the member's own.** Probed as the actor: she can write her own `time_autostart_opt_out` and stamp her own `time_autostart_disclosed_at`; an UPDATE aimed at another member's row affects **0 rows**. `hold()` awaits `autostartDeclined()` before `automaticBillableIntent` and returns, so the first document of a session cannot open a clock she has turned off. Column defaults probed: `time_autostart_opt_out NOT NULL DEFAULT false` (default **on**, as ruled), `time_autostart_disclosed_at` nullable.
6. **The disclosure shows once per member** on the happy path — the stamp is written on render under a `stamped.current` guard, the analytics emitter is session-deduped, and the suite covers "never again once the stamp is on her profile". Two error paths defeat it (W7-R4-09, carried).
7. **Every changed control is reachable at 390 and 1440** — including, now, the two things three rounds left unmeasured (see W7-R4-02).
8. **HT-39 / P-4 / P-5 / §0.12.** `useUpdatePhaseEstimates` present, no migration minted for it, `00620` spent by W2. No flag, no `useFeatureFlag`, no `ComingSoon` anywhere on the branch. The normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only, and a postcondition asserts no `project_billing_authority_rates` snapshot row was written; no `project_time_entries` row is read or re-priced. Nothing on the branch touches `guard_invoiced_time_entry`.

---

## Findings

### W7-R4-01 · MAJOR · confidence HIGH (code read end to end; not driven in a browser) — a rate card carrying more than four roles can never be sent, and the composer offers no way to remove a row

New this round, and created by this wave.

`RateCardEditor` (`part-editor.tsx:423-508`) renders one `<Select>` + one rate `<Input>` per role and **no remove control** — that is pre-existing (`git show origin/hour-tracking/integration:…/part-editor.tsx` confirms it) and was harmless while the role was free text. W7 makes it load-bearing:

- `UNBOUND_ROLE_BLOCKER` (`readiness.ts:325-329`) holds `send` when **any** role on the card has no `rosterRole`;
- the enum has exactly **four** values, and each `<option>` is `disabled` when another row already holds it (`:465-467`);
- `+ Add a role` is spent at four (`nextFree`), which correctly prevents *creating* a fifth.

So a card that **already** carries five or more rows has at least one row that can never be bound, `UNBOUND_ROLE_BLOCKER` never clears, and there is no act in the rate-card editor that removes the offending row. Reachable today: the studio Agreement-defaults card's `+ Add a role` was unbounded before this branch (the cap is new), the card is `NOT NULL DEFAULT '[]'` jsonb with no length constraint, and `materialize_standard_parts` seeds **every** row of it onto a new agreement; an in-flight draft's `proposal_service_rates` can equally carry five rows. `upsert_agreement_parts` saves such a card happily (it refuses a duplicate `rosterRole` and an out-of-range value, not a count), so the wall is at `send`, after the work.

There **is** an escape — `patina.role_rates` is `required: false` in `PATINA_STANDARD_AGREEMENT_PARTS`, so `removePart('patina.role_rates')` deletes the whole rate card and it can be re-added from the library — but it destroys every rate on the card, and no sentence in the room says that is the remedy. The blocker sentence *"Every rate on the card names the roster role it prices."* is true and unactionable for that row.

**Fix, smallest honest shape:** give `RateCardEditor` the same per-row `Remove` its sibling `ListEditor` has (`part-editor.tsx:351`) — it is the one act that makes the blocker escapable. A studio-side guard on the defaults card (trim to four) narrows the inflow but does not repair a card already composed.

---

### W7-R4-02 · NOTE — measurement, and it PASSES: both HT-35 bands at 390 and 1440 (closes W7-R3-19's measurement half)

Three rounds reported this open; `W7-fix-r2.md` and `W7-fix-r3.md` both said plainly that their 390/1440 paragraph was a static audit. It is now measured, the same way `W7-fix-r1.md` measured the studio-defaults picker: a harness page served beside the dev server (`next dev --webpack -p 3100`, the isolated stack) loading the app's own compiled `/_next/static/css/app/layout.css` (375 KB), reproducing the real container chain (`body` → `.document-route-shell.min-h-screen` → the band), with each band's markup copied verbatim from `document-time-provider.tsx`. Measured in headless Chromium at both widths.

| Control | 1440 | 390 |
|---|---|---|
| disclosure band | x=0 w=1440 **h=69** | x=0 w=390 **h=136** |
| its sentence | x=130 w=718 h=21, right 848 | x=18 w=354 h=63, **right 372 of 390** |
| `Understood` | x=1227 w=83 **h=50**, right 1310 | x=18 y=77 w=83 **h=50**, right 101 |
| fallback band | x=0 w=1440 h=69 | x=0 w=390 **h=94** |
| its sentence | x=130 w=248 h=21 | x=18 w=248 h=21, right 266 |
| `Start the clock` | x=1200 w=110 **h=50** | x=18 w=110 **h=50**, right 128 |
| page overflow-x (`documentElement.scrollWidth` vs `innerWidth`) | **1440 / 1440 — 0** | **390 / 390 — 0** |

**Nothing is off-screen at either width, nothing scrolls sideways, and both acts are 50px — above the house sheet's 44px floor.** At 390 the band wraps to two rows and the act drops to its own full-height line, exactly as the static audits predicted. **No major is hiding here.**

Two numbers worth saying out loud rather than burying, because they are the *placement* half of W7-R3-19 and that half is still unruled: at 390 the disclosure band is **136px** and the opted-out member's fallback band is a **permanent 94px strip** above every document page — roughly 11% of a 390×844 screen, standing above the page's own chrome, on every document, for as long as she leaves auto-start off. Carried below as W7-R4-16.

---

### W7-R4-03 · NOTE · confidence HIGH (measured) — the commercial baseline is SEVEN documented failures in this window, not six

The impl and review rounds 1–3 all report "the identical documented six". Measured here at **01:09 UTC**: seven — the six plus `direct_order_attribution_test.sql`, which `supabase/tests/KNOWN_FAILURES.md:114` documents as **clock-dependent, failing only between 00:00 and 02:00 UTC** (a tie fixture dated at `NOW() - 2h/-1h` that groups by day). Not this program's file and not a regression; recorded so the ship report's baseline number is right and so a future run inside that window is not read as a new break. `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` are green with their new asserts either way.

---

### W7-R4-04 · NOTE · confidence HIGH (measured) — the studio Agreement-defaults card reads permanently unsaved; PRE-EXISTING, and now measured

Round 3 listed this as unchased. Measured: `rateCardForSave` builds `{roleName, hourlyRateCents, sortOrder, rosterRole?}` in that order; jsonb normalises object keys by length-then-bytewise, so Postgres returns `{roleName, sortOrder, rosterRole, hourlyRateCents}` (probed: `jsonb_build_object(...)::text` → `{"roleName": …, "sortOrder": …, "rosterRole": …, "hourlyRateCents": …}`), and `use-studio-agreement-defaults.ts:63` passes `row.rate_card` through unmapped. `JSON.stringify` preserves insertion order, so `agreementDefaultsDirty` (`account-studio-page.tsx:647`) is **true whenever the card holds one row**, with no edit — which leaves Save permanently enabled (`:1375`) and the "nothing to save" note (`:1382`) permanently hidden.

**Pre-existing, not a W7 regression**: with three keys the mismatch was already `roleName, hourlyRateCents, sortOrder` against `roleName, sortOrder, hourlyRateCents`. Recorded because it was the last unmeasured item on round 3's list, and because the one-line repair is to compare a canonically-ordered projection of both sides rather than raw `JSON.stringify`.

---

## Carried from round 3 — re-verified as still open

Each was re-read against the branch tip this round; none was addressed by `W7-fix-r3.md`, which scoped itself to R3-01 and R3-02.

| # | Sev | Finding | Evidence re-checked this round |
|---|---|---|---|
| **W7-R4-05** | MAJOR (ruling-gated) | **W7-R3-02** — an evening hour carries two dates: `startedAtFromDateValue` files the day she named at her local time of day; `time_entry_ledger.day` is `(started_at AT TIME ZONE 'UTC')::date`. Her Hours list says Sep 1, the scope lens / CSV / statement say Sep 2, from 19:00 CDT onward | comment landed at `time-capture.tsx:286`; no code repair, correctly. **Owed: the HT-13-a ruling row and the ship-report line, both drafted in `W7-fix-r3.md`** |
| **W7-R4-06** | MINOR | **W7-R3-03** — the $0-bound-rate guard is client-side only; `00618:591-595` refuses only an absent/JSON-null `hourlyRateCents` and `_agreement_assert_cents` accepts `0`. A bound card at $0 wins tier 1, prices `authority`/`$0`/`authorized`, and `guard_invoiced_time_entry` freezes it | unchanged |
| **W7-R4-07** | MINOR | **W7-R3-04** — an internal hour invalidates **no** cache. All three mutations now guard `if (projectId)`, and `invalidateProjectTime` is the only caller of `timeKeys.all`, under which W2's `ledger`/`studioRollup`/`projectHoursTotal` deliberately sit. The Hours add row self-heals (`commit`/`batchAdd` call `void refetch()`), so the live case is **⌘K** — `log-time-sheet.tsx` closes on success with no refetch, leaving a standing studio-scope lens or export stale | re-read `use-time-tracking.ts:487-565`; `commit` at `hours-ledger.tsx:586` does refetch, `log-time-sheet` does not |
| **W7-R4-08** | MINOR | **W7-R3-05** — the ⌘K studio door has **no test**, and a comment claims it does. `command-bar-log-time.test.tsx:48` still declares `let mockStudios = []` and never reassigns it; `:47` still promises *"the internal-door case seats her"*; grep for `internal`/`__internal__`/`Studio time` in that file returns **only those two comments**. Open through three fix rounds | grepped this round |
| **W7-R4-09** | MINOR | **W7-R3-15** — two error paths re-serve the one-time sentence: `isSettled = isSuccess \|\| isError` with an error falling back to `{optedOut:false, disclosedAt:null}` (`use-time-autostart.ts:73-76`), and `markDisclosed.mutate()` has no `onError`, so a failed stamp leaves the column NULL while the band stands and is dismissed | re-read; unchanged |
| **W7-R4-10** | MINOR | **W7-R3-11** — `resume()` (`document-time-provider.tsx:538-565`) starts `source:'timer_auto'` with no `autostartDeclined()` check, unlike `hold`. Reachable via `startManually` → `pause` (the colophon's hold act, `doc-colophon.tsx:127`, and `mobile-sheets.tsx:1231`) → resume | re-read; unchanged |
| **W7-R4-11** | MINOR | **W7-R3-12** — `autostartDeclined()` does `auth.getUser()` + a `profiles` select through `qc.fetchQuery` with no `retry:false`, inside the serialised `enqueue`, in front of D11's pick-up-is-start; the portal's `QueryClient` defaults to 3 retries / 1-2-4s | re-read; unchanged |
| **W7-R4-12** | MINOR | **W7-R3-13** — `SOURCE_LABEL` (`hours-ledger.tsx:101-105`) still carries only `timer_auto`/`timer_manual`/`manual_entry`, and `:1988` falls back to `e.source`. An internal hour reads `internal · no document · non-billable`; a ⌘K hour reads `command_bar`; a Field hour reads `field_manual`. Three raw enum values in the designer's own ledger, one of them on a row this wave introduced | re-read; unchanged |
| **W7-R4-13** | MINOR | **W7-R3-14** — picking a role can collide with a legacy **label**: both pickers disable an option whose `rosterRole` is taken, never one whose canonical label collides, and picking rewrites `roleName` to that label. `upsert_agreement_parts` (`00618:563-567`) then refuses two identically-named roles, about a name she never typed | re-read both pickers |
| **W7-R4-14** | MINOR | **W7-R3-16** — `rosterRoleLabel` (`part-kinds.ts:446`) has no caller anywhere in `apps` or `packages`. Dead export on a new surface | grepped this round: definition only |
| **W7-R4-15** | MINOR (conf. MEDIUM) | **W7-R3-17** — `_project_agreement_terms` (`00618:366-368`) takes `v_rate->>'rosterRole'` straight into the INSERT with none of the four-value sentence or one-rate-per-role check `upsert_agreement_parts` got; `upsert_design_services_draft` still calls it with caller-supplied rates. Unreachable today by grep; bounded by the column CHECK (a 23514, not junk) | unchanged |
| **W7-R4-16** | NOTE — ruling owed | **W7-R3-19 (placement half)** — the opted-out member carries a **permanent 94px strip at 390** above every document page (`held && settled && optedOut && !running` is true on every one). Measurement half closed by W7-R4-02; the standing-strip design question is not | measured this round |
| **W7-R4-17** | MINOR | **W7-R3-07** — `hours-ledger.tsx:1226`'s `— internal —` band is `font-mono text-[11px] uppercase tracking-[0.07em]` while its sibling at `:1597` is `t-head`. §A forbids inline font-size utilities outright. Measured this round: both land at 11px uppercase, but **weight 400 vs 500 and tracking 0.77px vs 0.88px** — near, not alike. One token substitution | measured |
| **W7-R4-18** | MINOR — ruling owed on the first half | **W7-R3-08** — the HT-35 opt-out row. Measured this round inside the real sheet chain: the `<label>` hit area is **21px at 1440** and **42px at 390** (the checkbox itself 18px), against §A's 44px floor for acts. The block also adds three inline font-size utilities (`text-[15px]`, `text-[11.5px]`, `text-[13px]`), matching the file's existing style but not §A. Standing question alongside the impl-disclosed 43px `<Select>` | measured |
| **W7-R4-19** | MINOR — ruling owed | **W7-R3-06** — `useInternalTimeStudio` returns `candidates[0]` after a name-then-id sort; a member in two design studios cannot see, let alone choose, which studio her admin hour was charged to, and the option reads only "Studio time — no document" | re-read |
| **W7-R4-20** | MINOR — ruling owed | **W7-R3-09** — every **already-countersigned** agreement goes on stranding. Deviation 1 (signed paper is not renormalised) is right; its consequence — two `roster_role NULL` snapshot rows labelled "Principal designer"/"Associate", neither normalize-matching, single-card fallback needing exactly one card — is stated nowhere a studio will read | re-read; the resolver/classifier legs confirm it |
| **W7-R4-21** | MINOR — ruling owed | **W7-R3-10** — a member's auto-start preference is readable by her studio-mates. Re-probed as the actor on the reset stack: the studio **owner** reads another member's `time_autostart_opt_out` (1 row, value `t`). Writes are correctly own-row only. HT-35 is silent on privacy | probed this round |
| **W7-R4-22** | NOTE | **W7-R3-18** — `UNBOUND_ROLE_BLOCKER` + `ZERO_RATE_BLOCKER` hold `send` on **every** in-flight legacy draft on the day this ships. Remedy is right and cheap; nothing warns a studio mid-composition. One ship-report line, one line for Leah | unchanged |
| **W7-R4-23** | NOTE — ruling owed | **W7-R3-20** — picking a role overwrites the studio's client-facing wording (`roleName: picked.label` on both pickers), and `part-kinds.ts:426-431` still states *"stored separately so a studio may rename the one without moving the other"* — a capability the UI withdrew | re-read the shipped comment |
| **W7-R4-24** | NOTE | **W7-R3-21** — `00618` carries two sections numbered `(6)`: `classify_project_time_entry_authority` at `:1417` and `materialize_standard_parts` at `:1839` | grepped this round |
| **W7-R4-25** | NOTE | **W7-R3-22** — the studio-defaults card saves with a bound role at $0 (`rateCardForSave` filters on a non-blank `roleName` only); the refusal arrives one surface later in the composer. The new help sentence at `:1230-1233` warns in advance | unchanged |
| **W7-R4-26** | NOTE | **W7-R3-23** — `supabase/tests/commercial/design_services_authority_test.sql` still cannot receive case (al); it is one of the documented pre-existing failures and aborts before its first authority assert. Coverage lives in `billing/time_rate_resolution_test.sql` per W1-R1-15. Correct call, recorded so §8's literal instruction is not later read as unmet work | confirmed FAIL this round |
| **W7-R4-27** | NOTE | **W7-R3-24** — `@patina/types` is dist-resolved (`main: ./dist/index.js`) and `dist/` is gitignored; the new `RosterRateRole`/`RateCardRow` exports type-check here because the lane built it. `infra/deploy-portal.sh` rebuilds dists, so no action — recorded because this is the `proposalTierVisibility` incident class | unchanged |
| **W7-R4-28** | NOTE | Carried from `W7-fix-r1.md`'s own disclosure: the studio-defaults role picker is **111px wide at 390** and clips a long option label ("Support designer"). Same 1fr column the free-text input occupied, so not a regression — a legibility question if that card is ever widened | not re-measured |

---

## Rulings check

| Ruling | Verdict |
|---|---|
| **HT-4** (enum binding, no free text) | **delivered** on every door a rate card is written through — composer, studio defaults, both seeds, the save, both pricing legs, the countersign carry, and a send-blocking readiness sentence for an unbound role. Not delivered for already-countersigned authorities (W7-R4-20). New: not *escapable* for a card of more than four rows (W7-R4-01) |
| **HT-41** (two-role card, the member picks) | **delivered** — case (al4) measures the pick deciding the BOUND card, `authority_rate_id` and all. I probed the unpicked case too: a two-hat member with `rate_role` NULL on a two-role bound card lands `rate_source='none'`, `pending_authorization`. That is W1's ruled shape (case (f)) and the role chip is W3's, not W7's — recorded so it is not mistaken for a binding failure |
| **HT-11** (billable stated at every capture surface, no implicit default) | **respected.** Internal is the one path where the pill states the answer instead of asking, because `00610`'s CHECK makes it the only answer, and the reason is printed beside it on both doors. On a ledger **row** for an internal hour the pill is dropped entirely and the prose says "no document · non-billable" — review, not capture, so the ruling is not engaged |
| **HT-26** (never a blank; "rate pending" is a fact) | **respected**, and correctly suppressed for internal rows (`ratePending = provenance.kind === 'pending' && !internal`) where a pending alarm has no answer |
| **HT-35** | **delivered**: per member, cross-device, on `profiles`, default ON (probed: `NOT NULL DEFAULT false` on the opt-OUT), disclosed once on first document open, opt-out on her own profile, falling back to a one-tap start on the same clock — and the bands are now **measured at 390 and 1440 and pass**. Open: W7-R4-09 (two error paths re-serve it), W7-R4-10 (`resume` ignores it), W7-R4-11 (the read in front of the zero-tap path), W7-R4-16 (standing strip), W7-R4-18 (21px row), W7-R4-21 (readable by studio-mates) |
| **HT-15** (W4's portal half) | **delivered** at both desk doors and in the ledger's `— internal —` group. Open: W7-R4-07 (cache), W7-R4-08 (⌘K untested), W7-R4-19 (multi-studio choice unruled) |
| **HT-39** | correctly untouched — `useUpdatePhaseEstimates` present, no migration minted, `00620` spent by W2 |
| **HT-13** (any date until invoiced; 30-day backdated mark) | intact in code; **its zone is not ruled** — W7-R4-05 |
| **P-5** (no flags) | **holds** — no `useFeatureFlag`, no `ComingSoon`, nothing gated by this wave (`account-studio-page.tsx`'s `studio-workspaces` flag is pre-existing and untouched) |
| **P-4** (no backfill, no hour re-priced) | **holds** — the normalisation touches `proposal_service_rates` and `studio_agreement_defaults` only, unambiguous rows only; a postcondition asserts no snapshot row written; no `project_time_entries` row read or re-priced |
| **§0.12** (invoiced lock untouched) | **holds** — nothing on this branch touches `guard_invoiced_time_entry`. W7-R4-06 interacts with it: the lock freezes a $0 authority-priced hour exactly as it freezes a correct one |
| **§0.19 / §0.20** (types + ACL seed) | **holds** — both regenerate clean from the worktree's own copies, verified by `git diff --exit-code` |
| **§0.23** (totals above rows) / **HT-36** (notes never in a rollup) | untouched by this wave; the day header's total still stands above both the project rows and the `— internal —` rows it covers |
| **Vision §4/§6** | no dashboard, no tab, no badge, no colour state, no per-second motion, no daily nudge. Both HT-35 bands are affordances, not nudges — modulo the standing placement (W7-R4-16) |
| **House sheet §A** | **four deviations, all open**: the 43px `<Select>` (impl-disclosed, a shared control), the 21px/42px checkbox row, the profile block's three inline font sizes (W7-R4-18), and the ledger band's inline font size (W7-R4-17). Both *acts* this wave added — `Understood` and `Start the clock` — measure **50px**, above the floor |

---

## What I did NOT verify

- **No signed-in browser walk.** My 390/1440 evidence is a CSS-accurate harness served by the portal's own dev server, loading the real compiled `layout.css` and the real container chain with the components' verbatim markup. It measures **layout**, which is what the rule is about; it does not exercise React behaviour in the live sheet (the jsdom suites do). The dev server was killed, ports 3100/8791 released, harness deleted, and `next-env.d.ts` restored.
- **No e2e.** `apps/designer-portal/playwright.config.ts` hard-pins `webServer` to port 3000 and `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` — the peer program's port and the shared stack, both forbidden to this lane.
- **Prod not touched.** `00618`/`00619` exist only locally and on the lane branch. `00596`'s standing HT-6-a hazard and `00618`'s `studio_agreement_defaults` normalisation both run at the same prod push; I did not measure Strata's `studio_agreement_defaults` row shapes or its rate-card row counts — which is the reachability question behind **W7-R4-01** and the exposure behind **W7-R4-20**.
- **W7-R4-01 was not driven.** I read the editor end to end, confirmed by `git show` that no remove control existed before either, and confirmed `patina.role_rates` is `required: false` so `removePart` is the escape. I did not compose a five-row card in a browser and try to send it.
- **iOS untouched** (correctly — W7 carries none).
- The nine SQL failures were matched to `supabase/tests/KNOWN_FAILURES.md` **by name** (and, for `direct_order_attribution_test.sql`, by its documented clock window against the measured 01:09 UTC); I did not confirm each of the other eight still fails for its documented reason.
- **W7-R4-06 not exercised through a direct RPC call** — I read the refusal at `00618:591-595` and `_agreement_assert_cents` rather than inserting a $0 bound card and invoicing it.
