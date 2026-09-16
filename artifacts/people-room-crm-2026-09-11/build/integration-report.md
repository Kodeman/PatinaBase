# W6 — Integration Report (People Room CRM)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Report HEAD: `30e06ab9ff567567570ac54c9f987bd473ae0db7`
(`fix(people-crm): W6 QA round 2 — a synthetic sub gets its own number, so it stops merging into the seed's Frank Bauer`)

This report consolidates `w6-rebase.md`, `w6-qa.md` (rounds 1–3), `w6-gate-fixes.md`,
`w6-fix-log-r1.md`, `w6-fix-log-r2.md`, `inventory.md` and `w5-ship-report.md`. No
new testing was performed to produce it; every claim below cites the source
report it came from. No prod was touched to write this report.

---

## 1. Rebase result and final HEAD

**Complete.** `origin/main` tip `c879118ec` (`docs(time): ship report — hour
tracking in production 2026-09-15`) is an ancestor of HEAD
(`git merge-base --is-ancestor origin/main HEAD` → true). `git log --oneline
origin/main..HEAD | wc -l` → **166** (160 replayed commits + 6 post-rebase W6
commits: the rebase close-out, a pre-push-hook maxBuffer fix, the fresh-W6
sync/reconciliation confirmation, and the three QA fix rounds F1–F4 / F4-new).

The rebase paused once, at commit 70/160, on a genuine product collision (not
a mechanical conflict): `person-profile.tsx` — this program's unified-card
rewrite deletes the ~800-line role-branched renderer that origin/main's
already-shipped hour-tracking program (**HT-8**, prod 2026-09-15) used as the
only UI entry point into the Hours sheet. Escalated rather than guessed;
Kody ruled it **R-CC** by interview (`rulings.md` §3): the Hours door survives
as a card act on the unified card, gated on `role === 'team'` (later corrected
— see §4 below), a linked `profile_id`, and `viewerIsOwnerOrAdmin`, calling
`openHoursForMember` exactly as HT-8 shipped, sitting once in the card head.
Two more conflicts on the resumed run — commit 71/160 (a pure prettier
collision on the same file) and commits 146/155 (two independent
`describe`-block/mock unions in the test file) — were mechanical and resolved
as unions with nothing dropped from either side. `Capture.xcodeproj` +
schemes were regenerated from source (`generate_project.rb`) rather than
hand-merged. Full narrative: `w6-rebase.md` §§1–3.

## 2. Migration numbers and `--include-all`

Shipped in order, both ranges disjoint, no renumbering needed:

- **This program**: `00592`–`00594` (W1a) then `00621`–`00638` (W1 continuation
  through W4).
- **Hour-tracking** (already on `origin/main` **and already applied to Strata
  prod**, per project memory: "Strata 00595–00620"): `00595`–`00620`.
- Plus the pre-existing timestamp migration `20260910152111_create_contact_messages.sql`
  (not part of the `NNNNN` sequence).

`ls supabase/migrations | grep -oE '^[0-9]{5}' | sort | uniq -d` → **empty**, no
collisions on the branch (re-verified at report time, not just at rebase time).

**`--include-all` IS required** when this branch's migrations reach Strata:
`00592`–`00594` are numerically *behind* Strata's already-applied head
(`00595`–`00620` shipped 2026-09-15), so a plain `supabase db push` would refuse
to push them out of order. `00621`–`00638` need no special flag on their own,
but the flag is required regardless because of `00592`–`00594`. (`w6-rebase.md`
§6, reconfirmed in the fresh-run §"Migration numbers".)

## 3. Ledger ids

- **`docs/design/the-document/DECISIONS.md`**: **R151** (this program, "People
  room as a construction CRM") and **R152** (hour-tracking, "The studio's own
  clock") both present, each carrying the other's renumbering note, trailing
  marker correctly reads `*Entries add: R152 · last id = R152*`.
- **`docs/vision/VISION-DECISIONS.md`**: **V10** (this program, "Trade-side
  compliance upload door") and **V11** (hour-tracking, "A ledger is not a
  dashboard") both present with reciprocal notes, trailing marker correctly
  reads `… V10 · V11 · last id = V11`.
- **R-CC** (`artifacts/people-room-crm-2026-09-11/rulings.md` §3) — Kody's
  ruling resolving the Hours-door rebase collision, recorded 2026-09-16.
- **R-AY** — still **pending Kody's overrule** (supersedes PR-x's phone-global
  seat-check lean); unresolved, not a W6 blocker, carried from the build sheet.

No new collision since the rebase; both ledgers coexist cleanly (`w6-rebase.md`
§"Fresh W6 run" §3).

## 4. Gates — every one, with result

| Gate | Command | Result | Source |
|---|---|---|---|
| `pnpm supabase:reset` (clean DB replay) | full migration + seed replay | **GREEN** after F1 fix (seed file's corrupted `$g$` block, introduced by this program's own W1a rebase-merge, repaired) — every migration 00560–00638 + `20260910152111` applies, every seed file seeds clean | `w6-qa.md` §0, F1; re-verified round 3 |
| `designer-typecheck` (`tsc --noEmit`) | designer-portal | **GREEN** — clean after (a) rebuilding stale `@patina/types` dist (had a pre-rebase snapshot missing `RateCardRow`) and (b) regenerating `database.types.ts` against the fully-rebased local DB (00595–00620 backfilled locally, 419-line diff, every hunk explained as hour-tracking schema previously absent + one nullable-column change + CLI-formatting noise) | `w6-gate-fixes.md` §§1, 5 |
| `client-typecheck` | client-portal | **GREEN** — same two causes (§1) plus a stale `.next/types` dir removed | `w6-gate-fixes.md` §§1–2 |
| `admin-build` | admin-portal | **GREEN** — same causes | `w6-gate-fixes.md` §§1, 5 |
| `supabase-typecheck` | `packages/supabase` | **GREEN** — same causes | `w6-gate-fixes.md` §5 |
| `designer-jest` (full suite) | `pnpm --dir apps/designer-portal test` | **606/607 suites, 7977/7978 tests passed.** The 1 remaining red (`schedule-region-head.test.tsx`) is **pre-existing on origin/main**, proven byte-identical + reproduced on a baseline worktree at `c879118ec` — a time-bomb fixture (pins install date 2026-09-15, no frozen clock) | `w6-gate-fixes.md` §D, §B |
| `jest src/components/document/people` (R-CC regression cover) | targeted | **person-profile.test.tsx: 25/27→27/27 (31 suites/469 tests region-wide)** — HT-8 describe block green, incl. the two new cases pinning the corrected gate shape | `w6-rebase.md` §1, `w6-fix-log-r1.md` F2 |
| `deno-tests` (`deno test --allow-all --config …`) | edge functions | **1 pre-existing red on origin/main**: `fulfillment-po/core.ts:314` uses a 2022-era `deno.land/std@0.168.0` `encodeBase64` whose signature no longer accepts a generic `Uint8Array` under the current toolchain (deno 2.8.3 / TS 6.0.3) — file byte-identical to origin/main, zero commits from this program touch `fulfillment-po/`, reproduced on the baseline worktree verbatim. **Underneath** (`--no-check`): **1604 passed, 1 unrelated pre-existing failure** (`_tests/stripe-rail.test.ts`, seed hits `studio_id_not_designer_studio` — raised by hour-tracking's own already-shipped migrations 00602/00620, not this program's) | `w6-gate-fixes.md` §§C, C.1 |
| `sql-tests` (pgTAP, migration 9c) | SQL | Failed **only** mid-rebase (test asserted a stale frozen date literal that the branch tip had already corrected dynamically) — a rebase-window artifact, not a source defect; the fix rode in on already-queued commits and the rebase is now complete | `w6-gate-fixes.md` §8 |
| Designer Playwright e2e | `--project=chromium`, full suite | **394 total; 355 passed** on the first full run (pre-fix). See §6 for the targeted re-runs of the specs behind blocking findings | `w6-qa.md` §2 |
| Client Playwright e2e | `tests/` | **57 total; ~53 passed**, 2 investigated (`pay-link.spec.ts`) | `w6-qa.md` §2 |
| `capture-gate.sh all` (Patina Field) | build+test+lint+3 sweeps | **GREEN**, `GATE EXIT: 0` (W5 close-out, unchanged this wave) | `w5-ship-report.md` §1 |

## 5. e2e counts

- **Designer**: 394 tests. Full-suite baseline: 355 passed / ~34 failed
  (contention-filtered re-run at low concurrency). Of the ~34 reds, triage
  classified 6 groups as this program's (2 blocking, 1 major, 3 minor/test-debt)
  and 3 groups (7 individual specs) as pre-existing/unrelated. `paperwork-link.spec.ts`
  — all 3 tests green, full mint→upload→expired→unverified-landing coverage.
- **Client**: 57 tests, ~53 passed, 2 red (`pay-link.spec.ts`), 1 explained as a
  test-fixture gap (doesn't call the new `stamp_invoice_checkout_return_origin`
  RPC before hitting the return route — the real driver does call it, prod
  behavior verified correct), 1 not fully root-caused (F5, minor, no evidence of
  live-user impact).
- **Round 2/3 targeted re-runs** (not a full-suite re-run — scoped to exactly
  the specs behind F1–F4/F4-new, per each round's own stated scope):
  `call-sheet.spec.ts` (3/3 chromium), `person-profile.test.tsx` (27/27 jest),
  `person-card.spec.ts` (2/2, `--workers=1`, the file's own documented mode).
  **The full 394-test designer suite was not re-run end-to-end after the fixes**
  — this is stated plainly rather than inferred; a final full-suite re-run is
  owed before W7 if a single aggregate pass/fail number is wanted.

## 6. QA walk results

Scripted Chrome walk signed in as Leah (`designer@patina.dev`), local-prod
build, screenshots in `build/qa-w6/`:

| # | Check | Result |
|---|---|---|
| 1–3 | Directory @ 1440/390, light/dark | Pass |
| 4 | Add-person sheet + 10-stop keyboard tab walk | Pass, sane order |
| 5–6 | Call Sheet @ 1440/1024/390 (Okonkwo), site-access line present | Pass |
| 7 | Directory 15-stop keyboard-only walk | Pass, visible focus every stop |
| 8 | R-CC Hours act, teammate card (round 1) | **Absent — Finding F2** |
| 8 (round 2 recheck) | Hours act on Leah Hartwell's own card (the one seeded team member with a linked `profile_id`) | **FIXED** — `HOURS` renders next to `PUT THIS CARD AWAY`. `qa-w6-r2/f2-leah-hours-door.png` |
| 9 | R-CC Hours act, client card (Adaeze Okonkwo) | Correctly absent |
| 10 | Console errors during walk | 1 benign 403 (unrelated static resource) + `TypeError: Failed to fetch` bursts on `/desk`/`/people` post-nav — **Finding F3, minor** |

**Not completed** (time-boxed, stated honestly): full specimen-plate diff
against SPEC.md §5.1's 19-item checklist; a live *interactive* Chrome walk of
mint→upload→unsubscribe-refusal (strongly covered by the 3 green automated
`paperwork-link.spec.ts` tests, but not walked live); a keyboard-only pass of
"the picker" as distinct from the Add-person sheet; the six-Leah-tasks
click-count comparison against direction §6. None of the completed items
surfaced any defect beyond F2/F3.

### Findings — status

| ID | Severity | Claim | Status |
|---|---|---|---|
| F1 | Blocking | Corrupted `$g$` block in `00-legacy-grants.sql`, own rebase-merge regression, broke clean `supabase:reset` | **FIXED** (`c83e119c4`), re-verified round 2/3 |
| F2 | Blocking | R-CC gate keyed on `role === 'team'`, unreachable for a real carded teammate under shipped v4 `people_directory` (`role: 'contact'`) | **FIXED** (`c83e119c4`), re-verified live + unit round 2 |
| F3 | Minor | `/desk`/`/people` console `Failed to fetch` bursts post-nav | Open — recommend re-run against Strata-backed local-prod to see if it's a local-timing artifact; not blocking |
| F4 | Major | `getByLabel('Trade')` strict-mode collision (substring match, not an a11y-contract duplicate name) | **FIXED** (`c83e119c4`), re-verified round 2 — but see F4-new |
| F4-new | Major | (surfaced only once F4's mask was removed) `person-card.spec.ts`'s `addSub()` hard-coded one phone number for every synthetic sub, colliding with the seed's own Frank Bauer and with itself; product phone-collision-merge behavior (intentional) then merged every submission onto that one contact | **FIXED** (`30e06ab9f`), re-verified round 3, 2/2 at `--workers=1` |
| F5 | Minor | `pay-link.spec.ts:571` letterbox assertion, not fully root-caused | **FIXED** at `0f29187f3` — a stale fixture, not a product bug: the `<a>` named "open the invoice" it looked for was renamed to the `Pay $X` button by `b287bac26` (2026-09-08, an ancestor of this branch's own base), so the assertion predates this program by a week. Retargeted to the `Pay $X` button (`role: 'button'`, matching `letterbox.test.tsx`'s own literal). See `w6-fix-log-r2.md` "W6 follow-up triage" Item B. |
| F6 | Minor | `pay-link.spec.ts:470` ("the return hop 303s...") — flagged out-of-scope by `w6-fix-log-r2.md` Item B as a full-file due-diligence side finding: the return hop landed on `/pay/used` (the `spent` branch) instead of rotating, because the test never called `stamp_invoice_checkout_return_origin` before the hop | **FIXED in this commit** (`fix(people): pre-deploy minors`) — the test now stamps the return origin the same way the real driver does (`_shared/invoice-checkout-driver.ts`'s `startInvoiceCheckout`, same two arguments) before requesting `/pay/return/<nonce>`; the location assertion was also corrected to expect the ROTATED token 00636/R-BT mints on a successful return, not the original `minted.token`. `tests/pay-link.spec.ts` 7/7 chromium. |
| F7 | Minor | `apps/client-portal/next.config.js`'s PWA `NetworkOnly` bearer-URL exclusion regex omitted `paperwork`, though `/paperwork/[token]` is a bearer-token guest route in the same family (named `F4` in `w6-qa.md` §4 round 1 — **not** this report's own `F4`, the Trade-locator finding; the two tables use independent numbering, see the disambiguation note below) | **FIXED in this commit** — `paperwork` added to the regex alongside `pay\|plans\|share\|rfq\|trade\|evidence\|field`; verified in the built `public/sw.js` after `pnpm build` with the inline local env. |
| — | Minor, ours, reclassified | `e2e/document/hours.spec.ts:60/72` (`?sheet=hours` query-scrub) — round 1's triage first read this as F2 evidence; round-1 fix-log investigation disproved that (it's the Desk doorway's own address cleanup, unrelated to the person card) and left it unre-triaged at the time this report was first written | **Reclassified pre-existing, environment-flaky, NOT ours** by `w6-fix-log-r2.md` "W6 follow-up triage" Item A: the spec and the only product code on its path (`desk-doorway.tsx`) are byte-identical to `c879118ec`/`origin/main`; live instrumentation proved the doorway's effect and `router.replace('/desk')` fire correctly, but the RSC flight fetch behind the URL commit is aborted (`net::ERR_ABORTED`) alongside unrelated same-origin, Supabase and third-party requests in the same headless-Chromium run — a local browser/network-layer symptom, not a reachable app defect. Owed: a re-run against a non-sandboxed browser environment to see whether it reproduces there. |
| — | Minor, ours, open, stress-test only | A `--repeat-each=2` parallel stress run of `person-card.spec.ts` (beyond round 3's requested single-worker scope) surfaced a *different* name-collision: `uniqueName()`'s millisecond-granularity suffix can coincide under true concurrent workers → `PGRST116` "multiple rows". No stray DB rows left behind (`removePerson()` cleanup held). Not filed as a tracked finding — outside scope, file's documented execution mode is `--workers=1` | **Not filed**, noted for the record |

## 7. Pre-existing reds (not gating this program) — with evidence

All proven via `git diff --stat origin/main HEAD -- <path>` (empty ⇒ file
untouched by this program) and/or reproduction on a baseline worktree detached
at `origin/main` `c879118ec`:

1. **`schedule-region-head.test.tsx`** (designer-jest) — time-bomb fixture pins
   install date `2026-09-15`, no frozen clock; today is 2026-09-16, correctly
   renders past tense, test still asserts future tense. `git diff --stat` empty
   for the whole `document/schedule/` dir + `lens-ladder-derivation.ts`.
   Reproduced identically on the baseline worktree, isolated and in the full
   suite. Fix (not made here, not this program's file): freeze the clock.
2. **`fulfillment-po/core.ts:314` TS2345** (deno-tests, gates the whole run) —
   pinned `deno.land/std@0.168.0` `encodeBase64` no longer accepts a generic
   `Uint8Array` under deno 2.8.3/TS 6.0.3. File byte-identical to origin/main;
   zero commits in `origin/main..HEAD` touch `fulfillment-po/`. Reproduced
   verbatim on the baseline worktree.
3. **`_tests/stripe-rail.test.ts`** (deno-tests, underneath the TS2345 with
   `--no-check`) — seed insert hits `studio_id_not_designer_studio`, raised by
   hour-tracking's own `00602`/`00620` (already on origin/main). File
   byte-identical to origin/main.
4. **`e2e/field/field-coordination.spec.ts`** (2 failures) + **4
   `library-configuration` suite failures** — same `studio_id_not_designer_studio`
   trigger tightening (migrations 00602/00603, hour-tracking, already shipped
   to Strata). `git log origin/main..HEAD` empty for the trigger and both spec
   files.
5. **`e2e/document/action-visibility.spec.ts:232`** — `git log origin/main..HEAD
   -- apps/designer-portal/e2e/document/action-visibility.spec.ts` empty.
6. **~30 `lens-*.spec.ts` failures** — test-infra gap, not a code regression:
   `scripts/the-document-lens-seed.sql` is a required manual seed not wired
   into `pnpm supabase:reset`'s pipeline. Passes once run directly via `psql`.

## 8. Deploy inventory (Strata / Cloudflare — not run, enumerated for W7)

### Edge functions changed directly by this program (`git diff --name-only origin/main..HEAD -- supabase/functions`, `index.ts`/`core.ts`, 13 functions)

`create-checkout-session`, `field-daily`, `invoice-link-checkout`,
`invoice-reminders`, `invoice-send`, `paperwork-upload`, `po-send`,
`quote-request-send`, `resend-webhook`, `sms-inbound` (supporting file
`pipeline.ts` changed, function must redeploy even though `index.ts` itself
wasn't touched), `stripe-webhook`, `trade-agreement-send`, `trade-rfq-send`.

`_shared/*` also changed: `invoice-checkout-driver.ts`, `invoice-links.ts`,
`send-email.ts`, `sms.ts` (each has a paired `.test.ts`, not deployed).

### `_shared` importers requiring redeploy (union of two greps + the wave reports)

`grep -rl "_shared/send-email\|_shared/sms\|_shared/branded-email\|_shared/studio-identity"
supabase/functions --include=index.ts` → 29 importers, unioned with importers
of the other two changed `_shared` modules (`invoice-checkout-driver.ts`,
`invoice-links.ts` — both subsets already inside the directly-changed set
above) and with `inventory.md`'s own earlier 26-importer enumeration (that
list predates this HEAD by ~5 commits; superseded by the fresh grep below,
which is a superset — `campaign-dispatch`, `create-checkout-session`,
`invoice-link-checkout`, `po-send`, `sms-dispatch`, `spec-pdf` weren't
send-email importers at inventory.md's time or are captured via a different
`_shared` module).

**Full deploy set — 34 functions, `--no-verify-jwt` marked per `supabase/config.toml`:**

| Function | Reason in set | `verify_jwt` |
|---|---|---|
| apns-send | `_shared` importer | true (default) |
| campaign-dispatch | `_shared` importer | true (default) |
| client-invite | `_shared` importer | true (explicit) |
| commercial-document-notify | `_shared` importer | true (explicit) |
| create-checkout-session | changed directly + `_shared` importer | true (default) |
| designer-invite | `_shared` importer | true (explicit) |
| digest-dispatcher | `_shared` importer | true (default) |
| field-daily | changed directly (`core.ts`) | true (default) |
| fulfillment-notify | `_shared` importer | true (explicit) |
| fulfillment-po | `_shared` importer | **false → `--no-verify-jwt`** |
| invoice-link-checkout | changed directly + `_shared` importer | **false → `--no-verify-jwt`** |
| invoice-reminders | changed directly + `_shared` importer | true (default) |
| invoice-send | changed directly + `_shared` importer | true (default) |
| morning-brief | `_shared` importer | true (explicit) |
| notification-digest | `_shared` importer | true (default) |
| notification-dispatch | `_shared` importer | true (default) |
| paperwork-upload | changed directly | **false → `--no-verify-jwt`** |
| po-send | changed directly + `_shared` importer | true (default) |
| proposal-nudge | `_shared` importer | true (default) |
| proposal-send | `_shared` importer | true (explicit) |
| proposal-sign-confirmation | `_shared` importer | true (default) |
| quote-request-send | changed directly + `_shared` importer | true (default) |
| resend-webhook | changed directly | **false → `--no-verify-jwt`** |
| review-requests | `_shared` importer | true (default) |
| selection-review-send | `_shared` importer | true (explicit) |
| site-request-dispatch | `_shared` importer | true (explicit) |
| sms-dispatch | `_shared` importer | true (default) |
| sms-inbound | changed directly (`pipeline.ts`) | **false → `--no-verify-jwt`** |
| spec-pdf | `_shared` importer | true (default) |
| stripe-webhook | changed directly + `_shared` importer | **false → `--no-verify-jwt`** |
| trade-agreement-send | changed directly + `_shared` importer | true (explicit) |
| trade-rfq-send | changed directly + `_shared` importer | true (explicit) |
| waitlist-notify | `_shared` importer | true (default) |
| workspace-member-invite | `_shared` importer | true (explicit) |

6 of 34 need `--no-verify-jwt`: `fulfillment-po`, `invoice-link-checkout`,
`paperwork-upload`, `resend-webhook`, `sms-inbound`, `stripe-webhook`.

### Migrations

`00592`–`00594`, `00621`–`00638` — `supabase db push --include-all` (§2).

### Cloudflare Workers

- **designer-portal** — required. Owns `apps/designer-portal/**` changes (the
  People room, Call Sheet, Directory, unified person card, R-CC Hours door).
  `./infra/deploy-portal.sh designer-portal`.
- **client-portal** — required. Owns `apps/client-portal/**` changes
  (`/paperwork/[token]`, `/pay/return/[nonce]` hardening, PWA runtime-caching —
  see `w6-qa.md` §4's own `F4` re: the `paperwork` route missing from the
  `NetworkOnly` bearer-URL exclusion regex, **now FIXED** — see this report's F7
  above). `./infra/deploy-portal.sh client-portal`.
- **edge-api** — **not required by this program's own scope.** The
  email-deliverability checklist (`email-deliverability-checklist.md`), the only
  document in this build folder that specifies a deploy chain in this level of
  detail, does not name `edge-api` in its chain (migration → function redeploys
  → `resend-webhook --no-verify-jwt` → designer portal). No wave report in this
  program names an `edge-api` Worker change. Left out per the task's own
  conditional ("only if the deliverability checklist requires it") — it does not.

### iOS

**TestFlight build 5 (marketing version 0.1), uploaded and `VALID`.**
App `cloud.patina.field` (bundle id), ASC app id `6805156812`, build id
`23a23b88-5ac3-484a-bb94-e38f6e6e8ea2`, min iOS 18.0. **Not** assigned to any
tester group (`buildAudienceType` null); export compliance **not declared**
(`usesNonExemptEncryption` null) — both are Kody's steps, not automated by this
program (`w5-ship-report.md` §§5–6). Device-level walk still owed (both
attached iPhones were locked; highest verified claim is sim-verified).

### Sanity

**18 People help docs drafted, dry-run clean (18 written / 0 errored), NOT
pushed.** `--commit` requires `SANITY_AUTH_TOKEN`; the token supplied lacks
`create` rights on the help-system dataset — all 18/18 errored
`Insufficient permissions; permission "create" required"`. Owed: Kody supplies
a token with create rights, then re-run
`studios/help-system/scripts/run-people-help-seed.mjs --commit`
(`build-sheet.md` W4 row; `w4-help-report.md`).

## 9. Summary — is this branch ready for W7?

**Updated 2026-09-16 (patina-merged-73, pre-deploy minors commit).** Status
since this report was first written:

- **F5** (`pay-link.spec.ts:571`) — **FIXED at `0f29187f3`** (`w6-fix-log-r2.md`
  Item B, stale fixture).
- **F6** (`pay-link.spec.ts:470`, the return-hop test's missing
  `stamp_invoice_checkout_return_origin` call, flagged out-of-scope by that
  same pass) — **FIXED in this commit**.
- **F7** (PWA `NetworkOnly` regex missing `paperwork`, `w6-qa.md` §4's own
  `F4`) — **FIXED in this commit**.
- `e2e/document/hours.spec.ts:60/72` — **reclassified pre-existing,
  environment-flaky, not ours** (`w6-fix-log-r2.md` "W6 follow-up triage" Item
  A); no longer an open finding this program owns.
- **One open finding remains**: F3 (console `Failed to fetch` races on
  `/desk`/`/people` in the local-prod build, minor) — still open, recommended
  re-check against a Strata-backed local-prod build or prod itself.
- The full 394-test designer e2e suite has not been re-run end-to-end since
  the F1–F4/F4-new fixes (nor since F6/F7 above) landed — only the specific
  specs behind each finding were re-verified in isolation. **A full re-run is
  planned as a separate pass following this commit.**
- All pre-existing reds (§7) are genuinely origin/main's, proven by diff and
  by baseline reproduction, and do not block this program.
- Sanity push and iOS tester distribution are both external-input-blocked
  (token, Kody's manual ASC steps), not defects in this branch.

No prod mutation of any kind occurred while producing this report or this
update.
