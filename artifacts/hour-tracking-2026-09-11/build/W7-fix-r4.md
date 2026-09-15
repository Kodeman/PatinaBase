# W7 — fix round 4

**Branch** `hour-tracking/portal`, `d516a5658` → **`1626d6430`**, six Conventional-Commit commits, pushed (`hour-tracking/portal` == `origin/hour-tracking/portal`). Worktree clean; `supabase/config.toml` never staged; no `git add -A`.

Twelve findings were named in the brief. **All twelve are fixed.** Sixteen findings the brief did not name are dispositioned below as deferred to the orchestrator, with the reason.

---

## Commits

| SHA | What |
|---|---|
| `63d30ec41` | HT-13-a — the day she named is the day the ledger reports |
| `a7a0c8e92` | W7-R4-01 / -13 / -14 — the rate card's fifth row, the label collision, the dead export |
| `99c3e9a99` | W7-R4-15 — the second door onto the rate projection (00618, edited in place) |
| `4b7130ff2` | W7-R4-09 / -10 / -11 — the sentence, the resume, the read in front of the clock |
| `61f76198b` | W7-R4-07 / -12 — the internal hour's caches and its word |
| `1626d6430` | W7-R4-08 — the ⌘K studio door, measured |

---

## Disposition — the twelve the brief named

### W7-R4-01 · MAJOR — **FIXED** (`a7a0c8e92`)

Two acts, as the brief scoped it.

1. **`RateCardEditor` gains a per-row `Remove`**, in `ListEditor`'s grammar (`part-editor.tsx:351`) — same ghost `Button`, same `size="sm"`, same `disabled={readOnly}`, added as a third `auto` column on the row grid. It carries `aria-label={`Remove role ${index + 1}`}` because the rows are otherwise indistinguishable to a screen reader (the selects already label themselves `Role N`); `ListEditor`'s own Remove has no label and was left alone. This is the act that makes `UNBOUND_ROLE_BLOCKER` escapable on a card already composed.
2. **The studio-defaults card is trimmed to four** in `rateCardForSave` — the one mapper both the save and the dirty check go through, so a stored card of five rows reads **dirty on arrival** and the Save that performs the trim is offered rather than greyed out beside the fifth row. That is deliberate: a silent trim behind a disabled Save would be a row vanishing with nothing said.

Six new cases in `part-editor-role-picker.test.tsx` (remove-the-fifth on a five-row card, Remove on every row, the last row, read-only) and one in `agreement-defaults-card.test.tsx` (saves four, drops the fifth, and reads dirty).

**Not repaired, and out of scope:** an already-written five-row card in a **prod** `studio_agreement_defaults` row still seeds five rows onto agreements composed before the studio next opens and saves that card. I did not measure Strata's row shapes (prod untouched by this lane). The composer's Remove answers it per agreement.

### W7-R4-05 · MAJOR (ruling-gated) — **FIXED under HT-13-a** (`63d30ec41`)

`startedAtFromDateValue` returns `Date.UTC(y, m-1, d, 12, 0, 0)`. It is the single helper **both** date-only doors in this portal go through — grepped: `hours-ledger.tsx:555` (the add row) and `log-time-sheet.tsx:210` (the ⌘K verb), plus the two `backdated` computations that read it. The Field sheet is iOS and carries no W7 change; it will need the same rule when W6's sheet is next touched, and that is called out below.

- **SQL case:** `supabase/tests/billing/time_entry_ledger_test.sql` case **(f)** — fixture `b6` at `2026-03-08T12:00:00Z`; `f1` asserts the ledger's `day` is `2026-03-08`; `f2`/`f3` assert the same instant reads `2026-03-08` as a local calendar day at `Pacific/Midway` (UTC−11) and `Pacific/Noumea` (UTC+11), which is the ruling's own premise made falsifiable.
- **Jest case:** new `apps/designer-portal/src/components/document/__tests__/time-capture-date.test.ts` — noon UTC from both ends of the day, including the exact `2026-09-02T00:30Z` instant the old local-clock shape moved a day on; the ±11 band; a leap day and a year boundary; and the `now` fallback for a non-day value.
- **Rulings row:** `rulings.md`, **HT-13-a**, inserted after HT-13, dated 2026-09-13, naming the shipped helper and both pins.
- The stale "KNOWN, UNRULED (W7-R3-02)" comment block at `time-capture.tsx:286` is replaced with the ruling and with the reason the local clock must not be restored.

**One consequence the orchestrator should see, and I did not paper over it.** `classify_project_time_entry_authority` filters authority rates on `effective_at <= started_at`. An hour logged **for today** through a date-only door now carries 12:00 UTC, so a rate whose `effective_at` is later than noon UTC on that same day no longer prices it (it lands `pending_authorization` instead). The window is narrow — the agreement must have been countersigned today, after 12:00 UTC, and the hour must be typed for today rather than run on the clock (the auto-timer uses server `now()` and is unaffected) — but it is a real difference from the previous behaviour, it arrives from the ruling rather than from a defect, and I did not widen the ruling to dodge it. Raised, not fixed.

### W7-R4-09 · MINOR — **FIXED** (`4b7130ff2`)

Both error paths, in the shape the brief named ("never re-disclose on error, never treat error as *not disclosed*").

- **The read.** `useTimeAutostartPreference` now returns `disclosureRead` (`query.isSuccess`), and `AutostartBand`'s `undisclosed` gate reads `stampKnown` instead of `settled`. A failed read no longer looks like a member who has never been told, so the sentence is not spent and the profile is not stamped from a read that learned nothing. `isSettled` is deliberately **kept** for the fallback band, which is gated on `optedOut` — that one fails closed to `false`, so an unreadable member is simply left on the shipped auto-start.
- **The write.** `useMarkTimeAutostartDisclosed` gains `retry: 2`. A dropped round trip is the failure this actually meets; a refusal is not retried into success and nothing pretends otherwise.

Two new provider cases: the sentence is withheld on a failed read (and `markDisclosed` is never called, and the analytics event never fires), and the clock still opens for the member that read could not speak for.

### W7-R4-10 · MINOR — **FIXED** (`4b7130ff2`)

`resume()` asks `autostartDeclined()` before `automaticBillableIntent`, exactly as `hold()` does, and `autostartDeclined` joins its dependency array. Pinned by a case that walks the whole reachable path — decline → `startManually` → `pause` → `resume` — and asserts no timer opens **and** that the one-tap fallback band is back on the page, plus a negative control that a member who never declined still resumes on `timer_auto`.

### W7-R4-11 · MINOR — **FIXED** (`4b7130ff2`)

Two changes, both named in the brief:

- **Outside the serialised enqueue.** `hold` and `resume` each start `autostartDeclined()` *before* `enqueue(...)` and `await` the held promise inside, so the round trip overlaps the queue drain instead of standing in front of D11's pick-up-is-start. Safe to hold across the boundary because `autostartDeclined` catches and fails closed to `false` — it never rejects.
- **Cached, not retried.** `retry: false` on the `fetchQuery`; the existing five-minute `staleTime` already makes it one read per session, every hold after that a cache hit. The portal's default 3 retries at 1-2-4s bought nothing on a preference that fails closed.

### W7-R4-15 · MINOR — **FIXED in 00618, in place** (`99c3e9a99`)

`_project_agreement_terms`'s projection loop now asks the two questions `upsert_agreement_parts` asks — the four-value sentence and one-rate-per-role — worded the same way, raising `check_violation` with the role's own name rather than letting a 23514 arrive from the column CHECK. 00618 is unapplied on prod and held by this branch alone, so editing in place is the right remediation. The section banner was corrected from "ONE delta" to name both.

`supabase db reset` clean. `pnpm db:generate` → `git diff --exit-code database.types.ts` **clean** (§0.19); `generate-legacy-grants.py` → seed diff **clean**, 2648 statements (§0.20). The change adds no GRANT/REVOKE and no public-schema shape, so both were expected to be clean and are.

### W7-R4-07 · MINOR — **FIXED** (`61f76198b`)

`invalidateStudioTime(queryClient)` is the half of `invalidateProjectTime` that belongs to every hour whatever document it names: `timeKeys.all` (W2's `ledger` / `studioRollup` / `projectHoursTotal` / `runningTimer`), `timeKeys.studioUnbilled()` (the Desk's cross-project line), and a new `timeKeys.weekEntries()` mirroring the Hours sheet's own `['document-hours-week']` prefix — where the `— internal —` group lives. `invalidateProjectTime` calls it, and the project-less branch of `useCreateTimeEntry` / `useUpdateTimeEntry` / `useDeleteTimeEntry` calls it directly. Four cases in `packages/supabase/src/hooks/__tests__/use-time-tracking.test.ts`, including a control that a project hour still refreshes its own four keys as well.

### W7-R4-12 · MINOR — **FIXED** (`61f76198b`)

`SOURCE_LABEL` covers all nine of 00595's values. `command_bar` and `internal` both read **"typed"** — both are hand-typed hours, and what distinguishes them is already said on the row ("no document · non-billable"), not twice. `field_visit` → "from a visit", `field_manual` → "from the field", `widget` → "widget", `intent` → "shortcut" (reserved, no writer yet; named anyway so a later door cannot print an enum). Five parameterised cases assert the word appears on the ROW and the raw enum does not — read off the row's own `<li>`, because the `— internal —` group rule legitimately carries that word as a heading.

### W7-R4-13 · MINOR — **FIXED** (`a7a0c8e92`)

Both pickers now disable an option whose canonical **label** is already carried by another row, alongside the existing rosterRole test. A legacy row may still bind to the role its own label names (that is the conversion path, not a collision). One case per picker.

### W7-R4-14 · MINOR — **FIXED** (`a7a0c8e92`)

`rosterRoleLabel` deleted. Re-grepped `apps` and `packages` after the deletion: no reference. The label-collision fix reads `ROSTER_RATE_ROLES` directly, so there was no honest second use to give it.

### W7-R4-08 · MINOR — **FIXED** (`1626d6430`)

`mockStudios` is now assigned, reset in `beforeEach`, and five cases drive the internal door: the option is offered to a member of a design studio and to nobody else; the write carries `projectId null` / `studioId` / `source: 'internal'` / `billable: false` / `rateRole: null` and the noon-UTC `startedAt`, and the analytics event reports `source: 'internal'`; the pill is disabled with its reason printed; no roster-seat sentence and no role chip on an hour with no rate card; and the act enables without waiting on an authority read it will never make.

**One infidelity found and repaired while writing it:** the suite mocked `useMyRateRoles` as `() => ({ data: mockMyRateRoles })`, ignoring its argument, while the real hook carries `enabled: Boolean(projectId)`. The role chip therefore rendered on the internal door under the mock and could not under the product. The mock now honours the argument. My own new case caught it, which is the only reason it is in this report rather than in a later round's.

---

## Gates — run in this context, verbatim, on the isolated stack (`patina-hours`, 127.0.0.1:54422)

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **clean.** "Finished supabase db reset", all migrations + 28 seeds applied |
| `run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green**, 0 unexpected — case (f) included |
| `run-sql-tests.sh -d …/supabase/tests/commercial -H …` | **9 green / 16, 7 unexpected — all seven documented.** Run at **01:41 UTC**, inside `direct_order_attribution_test.sql`'s documented 00:00–02:00 window (`KNOWN_FAILURES.md:114`), so the seventh is W7-R4-03's clock-dependent one, not a regression. `agreement_fee_schedules_test.sql` and `agreement_parts_test.sql` **green** — the 00618 edit did not break the rail it validates |
| `run-sql-tests.sh -d …/supabase/tests/rls -H …` | **29 green / 31, 2 unexpected — the documented pair** (`design_requests_test`, `studio_titles_test`) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- <W7 · HT-35 · time-derivation specs>` | **9 suites / 239 tests, all pass** (`document-time-provider`, `time-capture-date`, `command-bar-log-time`, `hours-ledger-add-row`, `hours-ledger-scope`, `part-editor-role-picker`, `part-editor`, `readiness`, `agreement-defaults-card`) |
| `pnpm --filter @patina/designer-portal lint` | **0 errors**, 201 warnings — identical count to rounds 2–4, all pre-existing "unused eslint-disable" |
| `pnpm --filter @patina/admin-portal build` | **✓ Compiled successfully in 19.9s** (§0.24 type-integrity gate) |

Additional, not in the brief's list but run: `pnpm --filter @patina/designer-portal test` (full) — **581 suites / 7440 tests**; `pnpm --filter @patina/supabase test` — **102 files / 1259 tests**; `pnpm --filter @patina/client-portal type-check` — clean; `pnpm db:generate` + `generate-legacy-grants.py` — both diffs clean.

**One flake, disclosed.** The first full designer-suite run reported `1 failed, 7439 passed` with a `waitFor` real-timer timeout in its trace; the suite name was cut off by the tail I captured. **Five subsequent full runs were 7440/7440**, and the five suites this round touched were run eight more times at 93/93 each. I could not reproduce it and therefore could not identify it — recorded rather than rounded off. The count 7440 (up from the review's 7413) is this round's 27 new tests.

---

## Carried, and NOT addressed — deferred to the orchestrator

Each was in the round-4 review and **not** in this brief's fix list. Every one is unchanged on the branch.

| # | Sev | Why it is still open |
|---|---|---|
| **W7-R4-02** | NOTE | Measurement, and it passed. Nothing to do |
| **W7-R4-03** | NOTE | Baseline arithmetic; re-confirmed above at 01:41 UTC. One line for the ship report |
| **W7-R4-04** | NOTE | The studio-defaults card reads permanently unsaved (jsonb key-order vs `JSON.stringify`). **Pre-existing**, not W7's. Deliberately untouched: the W7-R4-01 trim relies on the card reading dirty on arrival, and a canonical-order comparison would have to be written to keep that true. Deferred with that dependency named |
| **W7-R4-06** | MINOR | The $0-bound-rate guard is client-side only. A server change to `00618:591-595`, not named in the brief; it would also need `_agreement_assert_cents`'s zero-tolerance re-examined for every other caller |
| **W7-R4-16** | NOTE | The standing 94px strip at 390. **Ruling owed** — placement, not a defect |
| **W7-R4-17** | MINOR | The ledger band's inline font size vs its `t-head` sibling. §A deviation; one token substitution, not in the brief |
| **W7-R4-18** | MINOR | The 21px/42px opt-out row and three inline font sizes. **Ruling owed** on the first half |
| **W7-R4-19** | MINOR | `useInternalTimeStudio` returns `candidates[0]`; a two-studio member cannot choose. **Ruling owed** |
| **W7-R4-20** | MINOR | Already-countersigned agreements go on stranding. **Ruling owed**; deviation 1 is correct |
| **W7-R4-21** | MINOR | A member's auto-start preference is readable by her studio-mates. **Ruling owed** — HT-35 is silent on privacy |
| **W7-R4-22** | NOTE | Every in-flight legacy draft is held at `send` on ship day. One ship-report line, one line for Leah |
| **W7-R4-23** | NOTE | Picking a role overwrites the studio's client-facing wording; the comment at `part-kinds.ts:426-431` still promises the capability the UI withdrew. **Ruling owed** |
| **W7-R4-24** | NOTE | 00618 carries two sections numbered `(6)`. Cosmetic; I renumbered nothing in a migration I was editing for one named reason |
| **W7-R4-25** | NOTE | The defaults card saves a bound role at $0; the refusal arrives one surface later. Interacts with W7-R4-06 |
| **W7-R4-26** | NOTE | `design_services_authority_test.sql` cannot receive case (al); coverage lives in `billing/time_rate_resolution_test.sql`. Correct call, recorded |
| **W7-R4-27** | NOTE | `@patina/types` dist resolution; `deploy-portal.sh` rebuilds dists. No action |
| **W7-R4-28** | NOTE | The 111px role picker at 390. Legibility question, not a regression |

**One new item for the ship report**, arising from HT-13-a rather than from a finding: the Field sheet's own date-only door is iOS and carries no W7 change, so it still files a backdated hour at the device's local time of day. HT-13-a names it; this program cannot reach it. It belongs in the iOS lane's next pass.

---

## What I did NOT verify

- **No signed-in browser walk, and no 390/1440 re-measurement.** The two controls this round adds a shape to are the rate-card row (a third `auto` grid column) and the studio-defaults row (unchanged shape). Both were measured by round 4 at both widths in their existing form; I added a ghost `Button size="sm"` to the composer's row and changed no width or breakpoint. **That is a static argument, not a measurement** — the composer's rate-card row at 390 now carries `minmax(0,1fr) 140px auto` where it carried `minmax(0,1fr) 140px`, and I did not put a ruler on it.
- **No e2e.** `playwright.config.ts` hard-pins `webServer` to port 3000 and the shared stack at 54321 — both forbidden to this lane.
- **Prod untouched.** 00618/00619 exist only locally and on the lane branch. I did not read Strata's `studio_agreement_defaults` rate-card row counts, which is the reachability question behind W7-R4-01's trim and the residual named there.
- **The eight other documented SQL failures** were matched to `KNOWN_FAILURES.md` by name and count against the round-4 baseline; I did not re-confirm each still fails for its own documented reason.
- **The one full-suite flake** (above) — not reproduced in five further full runs, and not identified.
- **Prettier drift is pre-existing.** The commit hook warns on every file this round touched; `time-capture.tsx` warns identically at `d516a5658`, the tip round 4 measured as clean, and the neighbouring test files in the same directories share the house single-quote style prettier would rewrite. Nothing was reformatted, and no gate checks it.
