# W2 review — round 3 QA (local production build, as Leah)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), designer@patina.dev's
studio ("Local Dev Studio", `b0000000-0000-0000-0000-000000000001`), Okonkwo
residence project (`d0e00000-0000-0000-0000-00000000000a`). No prod touched.

## 0. Procedure actually run

1. `lsof -ti :3000` empty before starting; confirmed empty again after stopping
   the server at the end (killed PID 90185, re-checked empty).
2. Local Supabase already running (`supabase status -o env`, worktree cwd —
   `--workdir` flag hit an unrelated CLI bug reading the main repo's
   `supabase/.env.local`; running from inside the worktree's own directory
   worked). Local dev keys captured to a scratchpad env file, never printed.
   Worktree has no `.env.local` (confirmed) — every value below was passed
   inline, per the task's ENV FOR LOCAL PROD BUILDS recipe.
3. `pnpm --dir <worktree> --filter @patina/designer-portal build` — succeeded,
   full route table printed, `/people` and `/doc/[id]` present.
4. `pnpm --dir <worktree> --filter @patina/designer-portal exec next start -p
   3000` in the background. Ready in 207ms. **Note:** the CLI printed `"next
   start" does not work with "output: standalone" configuration. Use "node
   .next/standalone/server.js" instead.` — the server still answered every
   request correctly during the whole run (verified `/people` 307-redirects
   to sign-in unauthenticated, and the full authenticated walk below worked
   end‑to‑end), so this is a build-config nit, not a run-blocking finding
   (QA‑R3‑9, minor).
5. Playwright: config lives at `apps/designer-portal/playwright.config.ts`
   (not under `e2e/`), `testDir: './e2e'`. Its own `webServer` block launches
   `pnpm dev`, but `reuseExistingServer: !process.env.CI` and `CI` was unset,
   so with the port already answering it reused the running `next start`
   server rather than spawning a second one — confirmed by the run log
   (`assets_hash` unchanged, no `pnpm dev` process spawned). Real invocation:
   ```
   cd apps/designer-portal && npx playwright test --config playwright.config.ts \
     --project=chromium e2e/people
   ```
   Result: **10 passed, 9 failed** (60s+ real run). Full breakdown in §2.
6. Manual signed-in walk: password auth as `designer@patina.dev` (the
   project's own Playwright auth fixture and 10/19 passing specs already use
   this path reliably; the magic-link-via-Mailpit route was judged unnecessary
   risk for a same-outcome sign-in and not attempted). Walked the six Leah
   tasks at 1440 and 390, screenshots and full-page text dumps under
   `build/qa-w2-r3/`. Compared against `shots/people-room-1440-state-*.png`
   and SPEC §5's acceptance strings.
7. Console: captured via Playwright's own `page.on('console'/'pageerror')`
   during the manual walk (`console-messages.json`, `page-errors.json`).
8. Server stopped, port confirmed free (§0.1).

**Deviation from the brief, declared:** step 4's sign-in used password auth,
not the magic link in Inbucket/Mailpit. Same account, same session, same
RLS — the substitution changes nothing the rest of the walk depends on. Local
mail (port 54324) is actually **Mailpit**, not Inbucket (the CLI itself warns
`config section [inbucket] is deprecated`); noted in case a future round
wants the magic-link path specifically.

---

## 1. Task table

| Task | Acts | Pass/Fail | Evidence |
|---|---|---|---|
| 1 — Dana Kowalski, text-only rule | Person card → Contact rule region already reads "Text only. The email on file bounces. Set 13 Sep 2026." with a live "EDIT THE RULE" act | **PASS** (existing rule, editable) | `people-room-1440-person-dana.png`; `person-dana-1440.txt` |
| — same task, via the Add sheet (new person + rule) | Add sheet, kind "a sub", phone + rule + trade filled, "Add to the roster" | **FAIL** | `people-add-sheet-the-add-s-3ebe8…` — alert "Could not add them just now. Try again." (QA‑R3‑1) |
| 2 — Adaeze's login + Chidi's $2,500 authority | Call Sheet, Client side band | **PASS for Chidi** (authority fact recorded and visible); **not exercised for Adaeze** in this seed's current state (her reach reads `ON PAPER`, not yet `Account` — the mint act is present and live, just not clicked in this walk) | `people-room-1440-callsheet.png`, `callsheet-1440.txt:191-210` |
| — automated coverage for task 2 | add-sheet.spec.ts task 2 | **FAIL, test-authoring gap** | Authority field is behind a disclosure (`hidden={!authorityOpen}`) opened by "Confirm from the agreement" / "Record the authority" — CR‑12, this round's own fix. The spec fills `getByLabel("Authority")` without clicking the opener first (QA‑R3‑2, minor, test-only) |
| 3 — who has site access, one click | Call Sheet head → "Open the site access card" | **PASS** | `people-room-1440-siteaccess.png` — Who to call first correctly orders Luis Ochoa, Chidi Okonkwo, Sam Rowe (then the seed's emergency lines), way in, key holder, hours, receiving, who was told, all on one screen, one click |
| — automated coverage for task 3 | `call-sheet.spec.ts:111` | **FAIL, test-authoring gap** | `page.locator('a[data-tel-link]').first()` queries the WHOLE page, not the site-access card; the call sheet's own roster rows (never unmounted, per DocSheet's D1) sit earlier in the DOM and are the actual first match. Visually and functionally correct (screenshot evidence); the locator needs scoping to the card (QA‑R3‑3, minor, test-only) |
| 4 — Frank Bauer, do-not-contact routed to Rosa | Person card | **PASS** | `people-room-1440-person-frank.png` — "Do not contact directly. Write Rosa Delgado instead." with her email and `tel:`-linked office phone, on both the held-channel band and the Contact rule region, "EDIT THE RULE" live |
| — automated coverage for task 4 | `person-card.spec.ts` `addSub` helper | **FAIL** | Same root cause as the Task 1 Add-sheet failure — QA‑R3‑1 |
| 5 — bring Dana, Pete, Ingrid, Stonehaven onto Okonkwo | Call Sheet → "From the rolodex" | **FAIL — not built** | `people-room-1440-pick.png` — opens the OLD single-add rolodex picker (search + kind filters, one result at a time), not SPEC §5.7's multi-select travel-list pane. w2c-report.md §4.6 already names this W3 scope; confirmed still absent live (QA‑R3‑4, major, expected/tracked) |
| 6 — everyone on Okonkwo by role, this week | Call Sheet opens already banded | **PASS** | `people-room-1440-callsheet.png` — Studio side / Client side / On the job · this week / On the job · later bands render immediately, vitals line arithmetically correct for the real seed's real-clock "this week" window |
| — automated coverage for task 6 | `call-sheet.spec.ts:48` | **FAIL** | "Build & supply" assertion — not independently isolated in this pass (bundled failure alongside QA‑R3‑1's write failure disrupting shared fixture state); see §2 |

---

## 2. Playwright run detail

```
cd apps/designer-portal && npx playwright test --config playwright.config.ts --project=chromium e2e/people
```

**10 passed / 9 failed.** Failures:

1. `add-sheet.spec.ts:37` task 1 — write fails (QA‑R3‑1)
2. `add-sheet.spec.ts:92` task 2 — authority field disclosure not opened first (QA‑R3‑2)
3. `add-sheet.spec.ts:134` "asks for a trade" — alert text is correct on the face (verified in the error-context dump: `alert [ref=e184]: A sub or an installer needs the trade they work in.`) but the assertion `expect(page.getByRole('alert')).toHaveText(...)` most likely hit Playwright strict-mode ambiguity against a second, empty top-level alert region already in the DOM (`alert [ref=e703]` seen in every dump) (QA‑R3‑5, minor, test-only, medium confidence — not fully isolated)
4. `call-sheet.spec.ts:48` task 6 bands — chromium-pinned, single-actor; likely collateral from QA‑R3‑1/4's failed writes leaving `uniqueName(...)` rows behind mid-suite (not independently re-run in isolation this round)
5. `call-sheet.spec.ts:91` task 3 — DOM-order locator issue, not a real defect (QA‑R3‑3)
6. `person-card.spec.ts:51` task 4 — `addSub` helper hits QA‑R3‑1
7. `person-card.spec.ts:111` R‑V — same `addSub` helper, same root cause
8. `add-client-letter.spec.ts:47` — times out waiting for "Send them the letter" checkbox
9. `add-client-letter.spec.ts:115` — same feature, same timeout

**8 and 9 are environmental, not this build's defect.** `add-client-letter.spec.ts`
tests the pre-existing (unrelated) client-invite-letter feature, gated behind
the PostHog flag `client-invite-letter`. The task's own prescribed
`NEXT_PUBLIC_FLAG_OVERRIDES` value is `the-document-pilot:true` only; the
Playwright config's *own* `webServer.env` block (not used here, since the
server was reused) additionally sets `client-invite-letter:true` — a value
this round's env recipe did not include. `add-person-sheet.tsx`'s `letterOn`
gate never resolves true, so the checkbox never renders. Confirmed by reading
`letterLoading`/`letterOn` gating in `add-person-sheet.tsx:287` and the
render branch at `:998-1050`. Not scoped to the People room CRM build; flagged
for completeness (QA‑R3‑6, informational).

Gates otherwise green: the build itself succeeded with the full route table
including `/people` and `/doc/[id]`.

---

## 3. Prior findings (w2-fix-log-r2.md) — re-checked

| Prior finding | Status this round |
|---|---|
| QA‑R2‑1 (wrong-studio org resolution in `people-room.tsx`, `directory-view.tsx`, `company-card.tsx`, `person-profile.tsx`) | **Fixed** in those four files (confirmed: Directory head reads 41 people/21 firms against the correct studio, company/person cards show the right crew). **NOT fixed** in `add-person-sheet.tsx:245` and `roster/rolodex-picker.tsx:157` — the fix log itself flagged these as "not named in the finding... available if the orchestrator wants them swept." This round's QA‑R3‑1 is exactly that unswept instance surfacing as a live write failure, not just a display bug (see §4) |
| QA‑R2‑2 (firm row "0 open jobs") | **Fixed** — Northgate Electric's card and row both read correct job counts |
| QA‑R2‑3/CR‑10 (person card couldn't route) | **Fixed** — Frank Bauer's card fully routes to Rosa Delgado, live |
| QA‑R2‑4/CR‑5 (raw schema tokens) | **Fixed** — no raw tokens found in any captured text dump |
| QA‑R2‑5 (consent checkbox labelled "Project") | **Fixed** (per fix-log; not independently re-tested this round) |
| QA‑R2‑6 (call-sheet race) | **Fixed** — the sheet gates on `[data-roster-band]`; call sheet opened reliably in every manual run |
| QA‑R2‑7 (person/company card disagreed about a COI) | **Fixed** — Dana Kowalski's card and Northgate Electric's card both read `Lapsed` for the same COI |
| QA‑R2‑9 (phantom person from a company-only bid) | Not independently re-tested this round (no company-only bid walked); no regression observed |
| CR‑1..CR‑15 (type-check, access grants, rule editor, company kinds, studio banding, company-card writes, crew-line rule, client_rep label, authority scope/threshold, grant end-date wording, project count) | All observed working live where exercised (access grants list + revoke on Dana's card, company card's full Crew/Paper/Payee/Jobs/History regions, CR‑12's scope+threshold+phrase fields present) |
| CR‑16 (hard-block vs do-not-contact split) | Working as documented — Frank Bauer (do-not-contact) and the held-channel treatment both render correctly |

**No prior finding regressed.** The one new BLOCKING finding (QA‑R3‑1) is a
narrower re-emergence of QA‑R2‑1's root cause in the two call sites the fix
log explicitly said were left unswept.

---

## 4. Findings

### QA‑R3‑1 — Adding a new sub/person with a phone or rule fails: "Could not add them just now"
**Severity: blocking. Confidence: high (reproduced live via Playwright, root-caused via source read + DB inspection).**

`add-person-sheet.tsx:248-251` still resolves the working studio as:
```ts
orgs?.find((o) => o.type === "design_studio")?.id ?? orgs?.[0]?.id ?? null
```
`designer@patina.dev` holds active membership in **two** `design_studio` orgs
(`Leah Hartwell`, `783187b5-…`, and `Local Dev Studio`,
`b0000000-…-0001`) — confirmed via `organization_members`. Every rolodex
card (49 rows) and the Okonkwo project itself belong only to `Local Dev
Studio`. `useOrganizations()` (`packages/supabase/src/hooks/use-organizations.ts`)
issues no `.order()`, so the `.find()` in `add-person-sheet.tsx` is not
guaranteed to land on the studio that actually owns the project or its cards.
This is the exact defect QA‑R2‑1 fixed in `people-room.tsx`,
`directory-view.tsx`, `company-card.tsx` and `views/person-profile.tsx` — the
round‑2 fix log named `add-person-sheet.tsx:245` and
`roster/rolodex-picker.tsx:157` as the two call sites deliberately **not**
swept ("not named in the finding... available if the orchestrator wants them
swept").

**Failure scenario, reproduced:** open the Add sheet → "a sub" → any project
→ a name → a phone number and/or a contact-rule sentence → "Add to the
roster". The seat itself may write (a bare insert with no card requirement
succeeds — verified directly against the DB), but the moment a phone or rule
is typed, the sheet must also call `promoteToStudioContact` with
`organizationId`; when that id resolves to the org that does **not** own the
project/rolodex, the write throws and the catch block (which only unwraps
`e instanceof Error`, not a Postgrest error object) surfaces the generic
"Could not add them just now. Try again." — masking the real cause. Leah
tasks 1 and 4's "add a new person with a rule" paths, and the Add sheet's
authority-grant path (which reads the same `organizationId`), are all exposed.

**Fix:** apply the same `directoryRolodexOrgId(rows)` (or equivalent
deterministic resolution) already built for the other four surfaces in
`add-person-sheet.tsx` and `roster/rolodex-picker.tsx`, closing the gap the
round‑2 fix log left open. Also worth a follow-up: make the catch block in
both `submitParty` and `submitClient` unwrap a Postgrest-shaped error
(`{message, code}`) even when it isn't `instanceof Error`, so a future
failure surfaces its real cause instead of the generic fallback.

### QA‑R3‑4 — Leah task 5 (bring forward, multi-select) is not built
**Severity: major. Confidence: high. Status: expected/tracked, not a regression.**

"From the rolodex" on the Call Sheet opens the existing single-result rolodex
picker (search + kind chips, one pick at a time) — not SPEC §5.7's
`#state-pick` "Bring forward" travel-list pane (multi-select checkboxes, "N
of M from the X selected", "What travels"/"What stays behind", one confirm).
`build/w2c-report.md` §4.6 already names this as W3 scope ("The travel-list
pane is W3's, per the brief"). Confirmed still absent in the live build.
Reporting for the task table's sake; not attributing it to this round's
work, and not counted toward "clean."

### QA‑R3‑2 — add-sheet.spec.ts task 2 doesn't open the authority disclosure first
**Severity: minor (test-only). Confidence: high.**

CR‑12 (this round) put the authority scope/threshold/phrase fields behind a
`hidden={!authorityOpen}` panel, opened by clicking "Confirm from the
agreement" or "Record the authority" — this is the correct SPEC/direction
behavior (direction §6 counts this click as one of Leah's two). The e2e spec
was not updated to click the opener before `getByLabel("Authority").fill(...)`,
so it times out against a real-but-hidden element. Product is correct; the
test needs one added click.

### QA‑R3‑3 — call-sheet.spec.ts task 3's tel-link locator isn't scoped to the site-access card
**Severity: minor (test-only). Confidence: high (screenshot evidence).**

`page.locator('a[data-tel-link]').first()` matches the whole page. DocSheet
deliberately never unmounts the surface beneath an overlay (`doc-sheet.tsx`'s
own module doc: "without ever unmounting the work beneath (D1)"), so the call
sheet's own roster rows — which also carry `data-tel-link` via the shared
`TelLink` component — sit earlier in the DOM than the site-access card's own
"Who to call first" list. The live screenshot
(`people-room-1440-siteaccess.png`) shows the correct order (Luis Ochoa,
Chidi Okonkwo, Sam Rowe, then the seed's additional emergency lines) inside
the card itself. Recommend scoping the test's locator to
`[data-site-access-card] a[data-tel-link]` (or similar) rather than treating
this as a product defect.

One adjacent note, not a finding on its own: confirmed via `doc-sheet.tsx:349-350`
that the background sheet DOES get `aria-hidden`/`inert` when a second sheet
opens on top of it (`isTopModal` gating) — so a keyboard/AT user is not
actually exposed to the stale content; only Playwright's plain DOM-order
locator is.

### QA‑R3‑5 — "asks for a trade before it will write a sub" — likely strict-mode alert ambiguity
**Severity: minor (test-only). Confidence: medium.**

The correct string ("A sub or an installer needs the trade they work in.")
is confirmed present and correctly worded in the failing test's own
error-context dump. The assertion itself
(`expect(page.getByRole('alert')).toHaveText(...)`) most likely resolves to
more than one `alert`-role element (an empty top-level alert region appears
in every captured accessibility snapshot alongside the sheet's own alert),
which would throw a strict-mode violation rather than a content mismatch.
Not independently isolated this round; flagged at medium confidence.

### QA‑R3‑6 — add-client-letter.spec.ts fails for an environment reason, not a product defect
**Severity: informational. Confidence: high.**

See §2. The `client-invite-letter` PostHog flag override wasn't part of this
round's prescribed `NEXT_PUBLIC_FLAG_OVERRIDES` value, so the pre-existing
(non-CRM) letter-on-add feature never activates. Not scoped to the People
room CRM build.

### QA‑R3‑9 — `next start` printed a standalone-output warning
**Severity: minor. Confidence: high.**

`next.config` sets `output: standalone`; `next start` warns it should be
run via `node .next/standalone/server.js` instead. The server answered every
request correctly throughout this entire QA pass regardless (sign-in,
`/people`, `/doc/[id]`, every card/sheet interaction, one full Playwright
suite run) — noting only because a build that ever moves to the standalone
runner should re-verify this exact QA procedure still applies unmodified.

### Console / hydration
No hydration warnings observed. Two errors appeared identically at both
widths, both during the sign-in transition before the session was
established (`TypeError: Failed to fetch` inside a Supabase `_getUser` call,
and a resulting `AppError: Not authenticated` logged by the query client) —
transient pre-auth noise, not reproduced after sign-in completed, not
People-room-specific. `console-messages.json` / `page-errors.json` in this
folder.

---

## 5. Verdict

**Not clean.** One blocking finding (QA‑R3‑1), one major-but-expected/tracked
gap (QA‑R3‑4, already named in w2c-report.md as W3 scope). Everything else
observed live — five of six Leah tasks' actual UI (task 5's pane excepted),
every re-checked round-2 finding, every SPEC §5 acceptance string sampled
across the Directory, both cards, the Call Sheet, and the site access card at
both widths — is correctly built and matches the specimens. QA‑R3‑1 is a
narrow, previously-flagged gap (two call sites the round-2 fix log
explicitly deferred) now confirmed as a real write failure, not merely a
cosmetic one; recommend fixing before this ships, since it blocks the actual
mechanism behind Leah tasks 1 and 4 whenever a NEW person is being added
(as opposed to editing one already on the roster).
