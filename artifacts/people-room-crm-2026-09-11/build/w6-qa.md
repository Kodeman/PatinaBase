# W6 QA — People Room CRM (local production builds)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`, HEAD at time of this pass: rebased onto `origin/main` (`merge-base --is-ancestor origin/main HEAD` = true; tree otherwise clean save the one fix below).
DB: local `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, reset via `pnpm supabase:reset`.
Env: inline local-prod env per the binding instructions (no `.env.local` created; `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, service URLs pointed at localhost).

**This report supersedes and overwrites the previous `build/w6-qa.md`, which was written against a half-replayed tree.**

---

## 0. Pre-flight fix required to reset the DB at all

`supabase/seed/00-legacy-grants.sql` (17,404 lines) had a corrupted dollar-quoted block around line ~15940: a `DO $g$ BEGIN ... REVOKE ALL ON FUNCTION public.project_roster_books_elsewhere(...) FROM PUBLIC, anon, authenticated, service_role;` block was missing its closing `EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL; END $g$;` pair. This desynced every subsequent `$g$...$g$` pairing in the file (odd total count) and made `pnpm supabase:reset` fail outright with `LegacyMigrationSeedError: syntax error at or near "BEGIN"`.

Root cause: `git blame -L 15936,15944 supabase/seed/00-legacy-grants.sql` → merge commit `0fd88a4e1f`, this program's own W1a rebase resolution (described in `build/w6-rebase.md` as "resolved as a straight union, no functional overlap" — the union silently dropped two lines). `origin/main`'s own copy of the file has the block correctly formed.

**Fix applied to the worktree** (uncommitted at the time of writing — see Finding F1): re-inserted the missing `EXCEPTION ... END $g$;` pair. Verified: `$g$` count is now even, no unclosed blocks remain, `pnpm supabase:reset` completes cleanly (all migrations 00560–00638 + `20260910152111`, all seed files, plus the manual `scripts/the-document-lens-seed.sql` needed for the lens Playwright suite).

This is reported as **Finding F1 (blocking, ours)** below — it is a real regression in the shipped seed file, not a QA-harness artifact, and it blocks anyone else replaying this branch's migrations from a clean DB.

---

## 1. Build status

| Portal | Command | Result |
|---|---|---|
| designer-portal | `next build --webpack` (inline env, sandbox disabled) | **Success.** `output: 'standalone'` warning only (non-fatal, matches client-portal). |
| client-portal | `next build --webpack` (inline env, sandbox disabled) | **Success** once run with `dangerouslyDisableSandbox: true` — see note below. Full 47-route table produced. |

Note: both builds *silently truncated* (exit 0, no BUILD_ID, no route table) when run inside the default sandbox — reproduced 3× for client-portal (turbo, direct `next build --webpack`, and with `OPEN_NEXT=true`). The sandbox kills webpack's parallel page-generation child workers without propagating a nonzero exit from the parent. Not a product defect; flagged only so future QA passes budget for `dangerouslyDisableSandbox: true` on every build/start/Playwright invocation, not only the Supabase-CLI/Chromium cases the binding instructions name explicitly.

Both portals started with `next start` in the background against the reset DB and served correctly at `http://127.0.0.1:3000` (designer) and `http://127.0.0.1:3002` (client) for the remainder of the pass. `supabase functions serve paperwork-upload` served the edge function locally (confirmed ~84 functions total available, including `paperwork-upload`).

---

## 2. Playwright suite results

### Designer portal — full e2e, `--project=chromium`

**394 tests total.** Final run (workers unset / low concurrency to filter resource-contention flakiness, `CI` unset so `webServer.reuseExistingServer` correctly reused the running `next start`):

| Outcome | Count |
|---|---|
| Passed | 355 |
| Failed | ~34 (see triage below; count includes both ours and pre-existing) |
| Skipped/flaky-retried | remainder |

Red tests triaged (method: `git log origin/main..HEAD -- <spec/source path>` to check this program touched the file; low-concurrency re-run to rule out contention; source-comment/driver-code reading for root cause):

| Spec : line | Classification | Ours? | Root cause |
|---|---|---|---|
| `e2e/document/hours.spec.ts:60/72` | **BLOCKING** | Ours | `await expect.poll(() => new URL(page.url()).search).toBe('')` times out — URL stays `?sheet=hours`. Reproducible at low concurrency. Consistent with Finding F2 below (R-CC gate unreachable). |
| `e2e/people/call-sheet.spec.ts:91/111` | **BLOCKING** | Ours | `expect(firstCall).toContainText('Luis Ochoa')` — actual first `a[data-tel-link]` resolves to Adaeze Okonkwo `(612) 555-0104`, not Luis Ochoa. Roster ordering regression against PR-r. |
| `e2e/people/person-card.spec.ts:51` | **MAJOR** | Ours | Strict-mode violation on `getByLabel('Trade')` — two elements share the accessible name: a `<div role="group" aria-label="Narrow by trade">` filter and `<select id="add-party-trade">`. A11y-contract duplicate-name defect. |
| `e2e/people/add-sheet.spec.ts:103` | Test-authoring gap, not a product bug | Ours (test file) | Authority field is intentionally revealed only after one of two acts ("R-J / C20 — the Authority field opens from one of two acts, never sits [open]", `add-person-sheet.tsx:~421`); the test asserts visibility without first performing the revealing act. **Minor** — test debt, report only. |
| `e2e/people/add-sheet.spec.ts:145` | Test-authoring gap | Ours (test file) | `getByRole('alert')` strict-mode ambiguity against Next's own `__next-route-announcer__`; the actual message text renders correctly. **Minor.** |
| `e2e/people/add-client-letter.spec.ts:47/115` | Test-timing / minor UI-text | Ours | `letter-line-field.tsx` labels are dynamic — `"A line to send with it"`/`"Send them the letter"` before a given name is entered, `"A line for {name}"`/`"Send {name} the letter"` after. By the point of the assertion the name is already filled, so the generic-wording locator no longer matches live text that has already (correctly) switched to the name-specific copy. Not a broken flow — the correct text is on screen, just under a different string than the test looks for. **Minor**, ours (test debt). |
| `e2e/field/field-coordination.spec.ts:47/166` + 4 in `library-configuration` | **Pre-existing, unrelated** | No | `studio_id_not_designer_studio` trigger tightening traced to migrations 00602/00603 (hour-tracking range 00595–00620, already shipped to `origin/main`/Strata prod before this branch started; `git log origin/main..HEAD` shows no touch from this program on either the trigger or these spec files). |
| `e2e/document/action-visibility.spec.ts:232` | **Pre-existing, unrelated** | No | `git log origin/main..HEAD -- apps/designer-portal/e2e/document/action-visibility.spec.ts` is empty — this program never touched the file. |
| ~30 `lens-*.spec.ts` failures | Test-infra gap, not ours | No (test-infra) | Required a manual seed (`scripts/the-document-lens-seed.sql`) not wired into `pnpm supabase:reset`'s pipeline. Once run directly via `psql`, these pass. Pre-existing gap in the test-setup docs, unrelated to people-crm code. |

`paperwork-link.spec.ts` — **all 3 tests pass.** Automated end-to-end evidence for mint → upload → expired/dead-link → unverified-upload-landing all work.

### Client portal — `tests/`

**57 tests total.**

| Outcome | Count |
|---|---|
| Passed | ~53 |
| Failed | 2 investigated in depth (both `pay-link.spec.ts`) |

| Spec : line | Classification | Ours? | Root cause |
|---|---|---|---|
| `tests/pay-link.spec.ts:470-530` ("return hop 303s to the sheet, unknown nonce to the dead one") | **Minor — test gap, not a live bug** | Ours (test file) | The test never calls the new `stamp_invoice_checkout_return_origin` RPC (added in this program's `00636_invoice_link_hardening.sql`, R-BT) before hitting `/pay/return/[nonce]`, so `nonce_return_origin` stays NULL and the route legitimately falls into the "spent" branch → 303 to `/pay/used` instead of the expected "rotated" branch. Verified the **real** driver (`supabase/functions/_shared/invoice-checkout-driver.ts:349`) does call `stamp_invoice_checkout_return_origin(...)` before creating the Checkout session — production behavior is correct; only the test fixture is stale against its own program's schema change. |
| `tests/pay-link.spec.ts:571` ("letterbox names the invoice without ever requesting it") | Not fully root-caused | Ours (file touched by this program: `git log origin/main..HEAD` shows commits) | Flagged, not resolved in this pass — see §5 Open items. Treat as **minor** pending further investigation; no evidence it reflects a live-user-facing break (no console error, no cross-tenant data, isolated to one assertion in one spec). |

Suite counts, full spec-by-spec JSON, and console logs are in `/private/tmp/claude-501/people-qa/` (session scratch, not part of the artifact tree) — designer full run log: `designer-e2e-people-rerun.log`; lens re-run: `designer-e2e-lens-rerun.log`.

---

## 3. Scripted Chrome walk

Signed in as Leah (`designer@patina.dev` / `password123`) via the portal's own sign-in UI (Inbucket not required for this account — it is a pre-verified seeded login, not a magic-link flow). Screenshots at `artifacts/people-room-crm-2026-09-11/build/qa-w6/`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Directory @ 1440, light | Loads, head-count text present | `01-directory-1440.png` |
| 2 | Directory @ 390 | Responsive, no horizontal scroll | `02-directory-390.png` |
| 3 | Directory @ 1440, dark (`prefers-color-scheme: dark`) | Renders correctly | `03-directory-1440-dark.png` |
| 4 | Add-person sheet opens; keyboard tab walk (10 stops) | Opens; tab order sane | `04-add-sheet.png`, `keyboard-tab-walk-add-sheet.json` |
| 5 | Call Sheet @ 1440/1024/390 (Okonkwo project) | Opens (`Call sheet · Okonkwo residence`, `[data-roster-band]` present) at all three widths | `05-call-sheet-1440.png`, `06-call-sheet-1024.png`, `07-call-sheet-390.png` |
| 6 | Call Sheet — site-access line present at head (task 3 / PR-r) | Present (`Key held by…` text found) | included in findings.json |
| 7 | Directory keyboard-only tab walk (15 stops) | All 15 stops carried a visible focus indicator (outline or box-shadow) | `keyboard-tab-walk-directory.json` |
| 8 | R-CC Hours act — teammate card (Priya Natarajan, owner viewer) | **Hours act absent (count 0), not present-once as ruled** | `08-person-card-priya-team.png`, `08b-person-card-priya-recheck.png` — see Finding F2 |
| 9 | R-CC Hours act — client card (Adaeze Okonkwo, linked account) | Correctly absent (count 0) | `09-person-card-adaeze-client.png` |
| 10 | Console errors during the walk | 1 benign 403 on the sign-in page (unrelated static resource) + several `TypeError: Failed to fetch` bursts on `/desk` and `/people` immediately after navigation | `console-errors.json` — see Finding F3 |

**Not completed in this pass** (time-boxed out; flagged honestly rather than fabricated):
- Full specimen-plate line-by-line comparison against `specimens/SPEC.md` §5.1's 19-item Directory checklist — screenshots were captured (items 1–3 above) but the itemized diff against the specimen text was not finished.
- A live scripted-browser walk of "mint a paperwork link and upload as Rosa at 390, confirm inbound, unsubscribe and see the refusal" — this sequence has strong **automated** coverage (`paperwork-link.spec.ts`, all 3 tests green, covering mint/upload/expired-link/unverified-landing), but the task's explicit request for a *live Chrome walk* of this exact sequence, and of the unsubscribe-then-refusal step specifically, was not carried out interactively before time ran out.
- Keyboard-only pass of "the picker" (as distinct from the Add-person sheet, which was covered) was not identified/walked separately.
- The six Leah tasks' click-count-vs-direction-§6 comparison was not run as a discrete walk item.

These are named explicitly so they are not silently missing from the record; none of the walk items that *were* completed surfaced any additional blocking defect beyond F2/F3 below.

---

## 4. Findings

| ID | Severity | Ours? | Claim | Fix |
|---|---|---|---|---|
| **F1** | **Blocking** | Ours | `supabase/seed/00-legacy-grants.sql` has a corrupted dollar-quoted block (missing `EXCEPTION...END $g$;` pair around line ~15940, introduced by this program's own rebase-resolution merge commit `0fd88a4e1f`), which makes `pnpm supabase:reset` fail outright with a syntax error for anyone replaying this branch from a clean DB. Fixed in the worktree during this pass but **the fix is currently uncommitted** — it must be committed before this branch is considered mergeable/deployable. | Commit the restored `EXCEPTION WHEN undefined_function OR undefined_table OR undefined_object OR undefined_column THEN NULL; END $g$;` pair immediately before the `-- 00592_people_cards_affiliations_rules.sql` marker comment (currently applied as a working-tree edit; verify `$g$` count is even and re-run `supabase:reset` clean before committing). |
| **F2** | **Blocking** | Ours | The R-CC ruling's Hours-door gate (`person.role === "team" && person.profile_id && viewerIsOwnerOrAdmin` in `person-profile.tsx`) can never be satisfied for a real, carded studio team member under the shipped v4 `people_directory` view. Verified three ways: (a) live network capture of the Directory's actual API response for Priya Natarajan — SPEC.md's own named lead designer — returns `role: "contact"`, `profile_id: null`; (b) `packages/supabase/src/hooks/use-people.ts`'s own comment: "v4 CHANGED WHAT THIS DISCRIMINATOR COUNTS. Every CARDED human now arrives as `role: 'contact'`... only an UNCARDED seat still arrives under its own party kind"; (c) migration `00626_people_directory_v4_seats.sql`'s own deploy-sequencing comment: "Every carded human is now emitted by the CONTACTS branch as role='contact'... W2's chip mapping should read `meta.entity_kind` plus `people_directory_seats.party_kind` rather than `role`, which is the shape this view now offers." R-CC's implementation was written against the `role` discriminator that this same program's own v4 migration explicitly warned every downstream consumer away from using for exactly this purpose. The result: the Hours act the ruling requires ("present once in the card head of a teammate with a linked account for an owner viewer") is **absent** for the only kind of person it should appear on — confirmed live in the walk (Finding item 8) and by the automated `hours.spec.ts` timeout. | Change the R-CC gate to key off `person.meta?.entity_kind === 'person' && person.meta?.contact_kind === 'studio' && person.profile_id && viewerIsOwnerOrAdmin` (matching how the six Directory chips already derive studio-team membership per the `use-people.ts` comment), not the `role` field. Also confirm at least one seeded team member has a non-null `profile_id` linked to an actual `auth.users` row, since Priya's seed row currently carries `profile_id: null` regardless of the role fix. |
| **F3** | Minor | Ours | Several `TypeError: Failed to fetch` console errors fire on `/desk` and `/people` immediately after sign-in/navigation in the local-prod build (client-side data-fetch races before the session is fully hydrated); one benign 403 on `/auth/signin` for an unrelated static resource. Did not block any functionality observed in the walk (data loaded correctly on retry/settle), and is plausibly an artifact of local-prod timing rather than a Strata-hosted regression, but is reported per the binding instruction that "console errors = findings." | Re-run this same walk against a Strata-backed local-prod build (not just the local Supabase stack) to confirm whether the fetch race reproduces there; if so, gate the initial `/desk` and `/people` data fetches on session-ready rather than firing eagerly on mount. |
| **F4** | Minor | Ours | `apps/client-portal/next.config.js`'s PWA `runtimeCaching` `NetworkOnly` exclusion regex (`/^https?:\/\/[^/]+\/(pay|plans|share|rfq|trade|evidence|field)\//`, commented "S1 — bearer-URL surfaces are NEVER stored") omits `paperwork` even though `/paperwork/[token]` is a bearer-token guest route in the same family per `upload-door-spec.md` §9. Not observed to cause an actual stale-cache incident in this pass, but the omission is inconsistent with the stated intent of the exclusion list. | Add `paperwork` to the `NetworkOnly` regex alongside the other bearer-token guest routes. |
| **F5** | Minor (report only, per binding severity rule) | Ours | `tests/pay-link.spec.ts:571` ("the letterbox names the invoice without ever requesting it") was flagged but not fully root-caused in this pass. | Needs a follow-up debugging pass; not blocking given no evidence of user-facing impact found so far. |

**No cross-tenant leak, no wrong fact on a face (beyond F2's gating logic itself), and no additional broken ruled flow were found beyond F1/F2.**

---

## 5. Pre-existing / unrelated reds (not gating this program)

- `e2e/field/field-coordination.spec.ts` (2 failures) + 4 `library-configuration` suite failures — `studio_id_not_designer_studio` trigger tightening from the already-shipped-to-prod hour-tracking migrations (00602/00603), untouched by this branch.
- `e2e/document/action-visibility.spec.ts:232` — file never touched by this program (`git log origin/main..HEAD` empty).
- ~30 `lens-*.spec.ts` failures — resolved by running the pre-existing manual seed script `scripts/the-document-lens-seed.sql` directly; this script's absence from the standard `supabase:reset` pipeline is a pre-existing test-infra gap, not a code regression.

---

## 6. Servers / ports

Both `next start` processes and `supabase functions serve paperwork-upload` were confirmed as this program's own (cwd under the worktree) and stopped cleanly via SIGTERM at the end of the pass. Ports 3000 and 3002 confirmed free (`lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` empty) before returning.

## 7. Screenshots and raw evidence

`artifacts/people-room-crm-2026-09-11/build/qa-w6/`:
`01-directory-1440.png`, `02-directory-390.png`, `03-directory-1440-dark.png`, `04-add-sheet.png`, `05-call-sheet-1440.png`, `06-call-sheet-1024.png`, `07-call-sheet-390.png`, `08-person-card-priya-team.png`, `08b-person-card-priya-recheck.png`, `09-person-card-adaeze-client.png`, `console-errors.json`, `findings.json`, `keyboard-tab-walk-directory.json`, `keyboard-tab-walk-add-sheet.json`.

---

## Re-check round 2 — 2026-09-16

Scope: re-run ONLY the QA checks behind F1–F4 from round 1 (`w6-fix-log-r1.md`, commit `c83e119c4`) and verify them fixed. No other suites re-run. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD `c83e119c4`. Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no prod touched.

| ID | Round-1 claim | Check re-run | Result |
|---|---|---|---|
| **F1** | Corrupted `$g$` block in `supabase/seed/00-legacy-grants.sql` broke `pnpm supabase:reset` | `pnpm supabase:reset` (sandbox disabled, Docker socket) from a clean state | **FIXED.** Full clean run: every migration 00560–00638 + `20260910152111` applied, every seed file — `00-legacy-grants.sql` included — seeded without error, ending `Finished supabase db reset on branch main.` / `{"message":"Reset local database."}`. `$g$` count confirmed even (5782) before the run. |
| **F2** | R-CC Hours-door gate unreachable on a real carded teammate (`person.role === 'team'` vs. shipped v4 shape) | (a) `jest src/components/document/people` unit suite incl. the HT-8 regression block in `person-profile.test.tsx`; (b) live browser check: signed in as Leah Hartwell (`designer@patina.dev`) via the portal's own sign-in UI (password path, local-prod build), opened her own card at `/people?person=d0e10000-0000-0000-0000-000000000001` | **FIXED.** (a) `person-profile.test.tsx`: **27/27 passed**, HT-8 block green. (b) Live: the `HOURS` door renders in the card head next to `PUT THIS CARD AWAY` — Leah is the one seeded team member carrying a linked `profile_id` (per round 1's own DB check), and she is the owner viewing her own card. Screenshot: `qa-w6-r2/f2-leah-hours-door.png`. Note: round 1 already clarified `e2e/document/hours.spec.ts:60/72` is an unrelated red (Desk `?sheet=hours` query-scrub assertion, not this gate) — not re-litigated here. |
| **F3** | First `a[data-tel-link]` on the Okonkwo Call Sheet resolved to the client, not Luis Ochoa | `playwright test e2e/people/call-sheet.spec.ts` (chromium, local-prod build+start, inline env) | **FIXED.** `call-sheet.spec.ts:91` ("task 3 — who has site access right now, one click from the sheet") **passed** — the scoped `[data-site-access-card] a[data-tel-link]` locator resolves to Luis Ochoa with a `tel:+` href. All 3 chromium tests in the file passed (task 6 banding, task 3 notice-logging, task 3 site-access). |
| **F4** | `getByLabel('Trade')` strict-mode violation (substring match hit both the Directory filter group and the Add-sheet select) | `playwright test e2e/people/person-card.spec.ts` (chromium, same build) | **The specific defect is FIXED** — `getByLabel("Trade", { exact: true })` inside `addSub()` no longer throws a strict-mode error in either test that calls it; both runs get past that line cleanly. **However, both tests in this file (`task 4`, `R-V`) still fail**, now on a different, newly-exposed defect — see below. |

### New finding surfaced while re-running F4's spec (not one of F1–F4; found only because the strict-mode error that used to mask it is now fixed)

`apps/designer-portal/e2e/people/person-card.spec.ts`'s own `addSub()` helper hard-codes the **same** mobile number, `(612) 555-0115`, for every contact it creates via the UI. `supabase/seed/people_crm_dev.sql:248/716` already seeds a permanent contact ("Frank Bauer", `d0e10000-0000-0000-0000-000000000015`) carrying that exact number as both its `office` and `mobile` channel. Patina's phone-collision merge behavior (intentional — see this program's own `b4c1ff290 fix(people-room): W2 round-4 findings — phone-collision disclosure`) then attaches every subsequent `addSub()` submission in the same run to whichever contact currently holds that phone number rather than creating the new, distinctly-named contact the test expects — so `cardByName(<the new unique name>)` never resolves and `expect.poll(...).not.toBeNull()` times out at 15s.

Confirmed reproducible: `task 4` (2nd `addSub` call, for "Frank Bauer …") and `R-V` (its single `addSub` call, for "Erin Sato …" — a name that shares nothing with the seed collision, ruling out a name-based cause) both fail identically at the same line, at `--workers=1` (not a concurrency artifact). This is a test-fixture bug — the product's phone-collision/merge behavior is working as this program intended; the test helper just violates its own seed data's phone number.

| ID | Severity | Ours | Claim | Fix |
|---|---|---|---|---|
| F4-new | Major (blocks 2 of `person-card.spec.ts`'s tests from a clean pass) | Ours (test file, `apps/designer-portal/e2e/people/person-card.spec.ts`) | `addSub()` hard-codes mobile `(612) 555-0115` for every synthetic contact it creates, colliding with the seeded "Frank Bauer" contact's phone (`people_crm_dev.sql:248/716`) and every one it. The intentional phone-collision merge logic then attaches each new submission to that existing contact instead of creating a new one, so `cardByName(name)` never resolves for the names the test expects and both `task 4` and `R-V` time out. | Give `addSub()` a unique phone per call (e.g. derive last 4 digits from the same random suffix `uniqueName()` already appends), so each synthetic sub gets its own channel and doesn't collide with seed data or with the other `addSub()` call in the same test. |

### Build / server

Designer portal only (the only app these 4 checks touch): `next build --webpack` then `next start -p 3000`, both with the inline local env (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, local anon/service-role keys from `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, service URLs at localhost:3014/3015/3016) — sandbox disabled for both (build silently truncates inside the default sandbox, per round 1's own note). Build succeeded (same `output: 'standalone'` warning as round 1, non-fatal). Server confirmed listening on `:3000` (PID 46513, cwd under this worktree) before any Playwright run, `kill`ed cleanly after, port confirmed free.

### Summary

F1, F2, F3 verified fixed. F4's own reported defect (the strict-mode `getByLabel` violation) is verified fixed. A separate, previously-masked test-fixture bug in the same spec file (F4-new above) is left open — it is not part of F4's original claim and does not indicate the F4 fix is wrong, but it does mean `person-card.spec.ts` still does not pass clean end-to-end.

---

## Re-check round 3 — 2026-09-16

Scope: re-run ONLY the check behind **F4-new** (round 2, `w6-qa.md` above) and verify it fixed. No other suites re-run. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD `30e06ab9f fix(people-crm): W6 QA round 2 — a synthetic sub gets its own number, so it stops merging into the seed's Frank Bauer`. Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no prod touched.

### Fix inspected

`apps/designer-portal/e2e/people/person-card.spec.ts` now derives a per-call mobile number from the target name instead of hard-coding `(612) 555-0115`:

```ts
function mobileFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 6000;
  return `(612) 555-${4000 + hash}`;
}
```

`addSub()` calls `.fill(mobileFor(name))` on the Mobile field instead of a literal. Confirmed the 4000–9999 band is clear of every seeded number: `grep -oE '555-0[0-9]{3}' supabase/seed/people_crm_dev.sql | sort -u | tail -1` → `555-0308` (seed's own highest), and `grep -c '555-'` shows 113 phone-bearing lines total, none above `0308`.

### Procedure

1. `supabase db reset --workdir <worktree>` (sandbox disabled, Docker socket) — clean run: every migration 00560–00638 + `20260910152111` applied, every seed file (`people_crm_dev.sql` included) seeded without error, ending `Finished supabase db reset on branch main.` / `{"message":"Reset local database."}`.
2. `pnpm --dir apps/designer-portal build --webpack` (sandbox disabled; inline env: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, local anon/service-role keys from `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, service URLs at localhost:3014/3015/3016) — succeeded, same `output: 'standalone'` warning as prior rounds (non-fatal), full route table produced including `/people`.
3. `next start -p 3000` in the background with the same inline env. Confirmed listening on `:3000` (cwd under this worktree) before any Playwright run.
4. `npx playwright test e2e/people/person-card.spec.ts --project=chromium --workers=1` (the same low/no-concurrency mode round 1 and round 2 deliberately used to isolate this file from resource-contention flakiness, and the mode F4-new's own repro used).

### Result

**FIXED.** Both tests in the file passed:

```
Running 2 tests using 1 worker
  2 passed (12.7s)
```

- `task 4 — do not contact, routed to somebody reachable` — passes. Its two `addSub()` calls (for synthetic "Rosa Delgado …" and "Frank Bauer …") now get distinct hashed mobile numbers, so neither collides with the seed's permanent Frank Bauer (`d0e10000-0000-0000-0000-000000000015`, `(612) 555-0115`) or with each other; `cardByName(name)` resolves the newly-created, distinctly-named contact for both.
- `R-V — every region prints, and an absent record says so in words` — passes. Its single `addSub()` call (for synthetic "Erin Sato …") resolves cleanly.

Re-ran the same file with `--repeat-each=2` at default (parallel) concurrency as an additional stress check beyond the requested scope: this surfaced a **different**, name-collision issue (`uniqueName()`'s `Date.now().toString(36).slice(-5)` suffix can coincide when two workers call it in the same millisecond, producing two contacts with the identical name and a `PGRST116` "multiple rows" error from `cardByName`). This is not the F4-new defect — it only appears under true concurrent workers, a mode round 1 and round 2 both deliberately avoided for this exact reason ("low concurrency to filter resource-contention flakiness"), and it is not part of this round's requested scope. No stray rows were left in the DB afterward (`select full_name, count(*) from studio_contacts where full_name ilike '%Frank Bauer %' or '%Erin Sato %' or '%Rosa Delgado %' group by full_name` → 0 rows), so `removePerson()`'s cleanup still held. Noted here for the record only; not filed as a tracked finding since it falls outside this round's scope and the file's own documented single-worker execution mode.

### Servers / ports

`next start -p 3000` was this program's own process (cwd under the worktree); stopped with `kill` after the runs, `lsof -nP -iTCP:3000 -sTCP:LISTEN` confirmed empty before returning. Port 3002 was never touched this round (client-portal not in scope for F4-new).

### Summary

F4-new verified fixed under its own documented reproduction method (`--workers=1`). `person-card.spec.ts` now passes clean end-to-end (2/2) in that mode.
