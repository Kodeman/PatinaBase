# Final integration review — PRODUCT + SHIP-READINESS, round 1

**clean = false** — 4 major, 0 blocker. Every major is either a two-studio defect
measured on the default seed (S-1, S-2), a deploy-ordering hazard the checklist closes
(S-3), or an evidence problem about the gates themselves (S-4).

Branch `hour-tracking/integration` @ `944e12a5c`; `origin/main` is an ancestor.
Reviewer context is separate from every implementer. Stack: the isolated `patina-hours`
stack (`127.0.0.1:54421` / `:54422`); portal on **:3100**; 3000/3002 never touched.
Ship checklist: `artifacts/hour-tracking-2026-09-11/build/ship-checklist.md`.

---

## §0 · Gates run in my lens — commands and verbatim outcomes

| Gate | Command | Result |
|---|---|---|
| designer-portal types (the real gate) | `pnpm --dir …/apps/designer-portal type-check` | **PASS**, exit 0, no output |
| designer-portal unit | `pnpm --dir …/apps/designer-portal test` | **PASS** — `Test Suites: 581 passed, 581 total / Tests: 7441 passed, 7441 total / Snapshots: 1 passed`, 28.8 s |
| designer-portal lint (the one working config) | `pnpm --dir …/apps/designer-portal lint` | **PASS**, exit 0 — `✖ 201 problems (0 errors, 201 warnings)`; the warnings are the pre-existing "unused eslint-disable directive" family |
| client-portal types | `pnpm --dir …/apps/client-portal type-check` | **PASS**, exit 0 |
| client-portal unit (coverage floor enforced) | `pnpm --dir …/apps/client-portal test` | **PASS** — `151 passed, 151 total / 2475 passed` |
| admin-portal build (repo's strictest gate) | `pnpm --dir …/apps/admin-portal build` | **PASS**, exit 0, full route table printed |
| `@patina/supabase` | `test` / `type-check` | **PASS** — `102 passed (102) / 1259 passed | 12 skipped`; `tsc --noEmit` clean |
| SQL · billing | `scripts/run-sql-tests.sh -H 127.0.0.1 -p 54422 -d supabase/tests/billing` | **9 / 9 green, 0 unexpected** — *but only after the repair in S-4; the first run was 8/9 with `time_rate_resolution_test.sql` RED at case (al1)* |
| SQL · rls | same `-d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md` | **31 / 31 effective** (29 green + 2 documented) |
| SQL · field | same `-d supabase/tests/field -k …` | **7 / 7 effective** (6 green + 1 documented) |
| SQL · commercial | same `-d supabase/tests/commercial -k …` | **16 / 16 effective** (10 green + 6 documented) |
| Edge functions | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts` | **`ok | 18 passed | 0 failed`** |
| Portal e2e | `PLAYWRIGHT_DESIGNER_PORT=3100 … playwright test --config playwright.hours.config.ts e2e/document/hours.spec.ts` against `next dev --webpack -p 3100`, `DATA_MODE=live` | **7 passed (1.7 m)** — **including** `the sheet doorway opens the Hours book`, the case W3-R5-m5 carried as red |
| iOS | `apps/mobile/Capture/scripts/capture-gate.sh all` on `.codex/worktrees/agent-ios` @ `944e12a5c` (already == `hour-tracking/integration`; no fast-forward needed) | **PASS** — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`, exit 0. **Compile-green + sim-verified only**; never device-verified |
| Generated types | `SUPABASE_DB_URL=… pnpm --dir … db:generate` then `git diff --exit-code` | **IN SYNC** |
| ACL seed (§0.20) | `python3 ./scripts/generate-legacy-grants.py` from the worktree | **IN SYNC** — 2648 statements, clean diff |

Deploy-chain preconditions, all measured: `git diff --stat origin/main...hour-tracking/integration -- infra/ 'apps/*/wrangler.jsonc' '*.env*' package.json turbo.json` is **empty**; the only new `process.env` reads in the diff are `PLAYWRIGHT_*` in a test config; the only new `Deno.env` reads are `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`, the last already read by the live `client-invite`; no `supabase/functions/_shared/*` edit, so no fan-out redeploy. `supabase migration list --linked`: Strata head **00591** + `20260910152111`; the peer's `00592–00594` and `00621+` are **not** on Strata, and **`--include-all` IS required** — because the already-applied timestamp file sorts after every `NNNNN_` name, a plain `db push` refuses.

---

## §1 · The walk

Signed in against the isolated stack with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`
at 1440 and 390, as **owner** (`designer@patina.dev` — owner of two design studios,
"Leah Hartwell" and "Local Dev Studio") and as a **plain member** I created and then
deleted (`member` of Local Dev Studio only). Flags `studio-workspaces`,
`agreement-parts`, `agreement-library`, `design-build`, `call-sheet` forced on through
`NEXT_PUBLIC_FLAG_OVERRIDES` so the gated doors could be read at all.

**What answered correctly.**

* **⌘K / bare `t`, nothing in hand** — at 1440 **and** 390 the Log time dialog opens
  with the full capture door: *"An hour with nothing in hand — a call, a drive, a
  sourcing run."*, a Document picker carrying **"Studio time — no document"** (HT-15's
  internal door), MINUTES, a **DATE** field defaulted to today, the five activity chips
  incl. *"activity not set"* (HT-24), a **NON-BILLABLE** pill (HT-11), NEVER MIND and
  **LOG IT at 64 × 44**. The billable pill measures 113 × 44. No role chip — correct:
  HT-41 shows it only when the member holds more than one roster role.
* **Hours at 390** — `documentElement.scrollWidth = 390`; no sideways scroll. `Add` is
  289 × 44. Totals sit above the rows that produced them (§0.23 / HT-30): `UTILIZATION
  / 2h 00m / LOGGED THIS WEEK / 100% BILLABLE`, then the pending-authority band, then
  the rows.
* **The lens** — owner sees `MINE` (30 × 50) and `THE STUDIO` (75 × 50); `a member` and
  `this document` appear only when their subject exists. The **plain member sees no
  lens at all** (HT-8), reads **only her own rows** (HT-10-a), gets no `Export → CSV`,
  and is offered no repair door. Her rows print `TYPED · STUDIO RATE · $120/HR · $60`
  and, for the unpriced one, **`TYPED · RATE PENDING`** (HT-26 — never a blank).
* **HT-35** — on first document open the sentence renders verbatim: *"While a document
  is open, Patina keeps the time for you. You can turn that off on your profile — the
  clock is then yours to start."* + **UNDERSTOOD**. The opt-out is on Account →
  Profile as *"The clock … Keep the time automatically while a document is open"*.
* **HT-25 auto-roster** — a member with no seat logged on Cedar Lane Study and was
  seated `support_designer`; the classifier then priced her at that role.
* **HT-3 → the resolver, end to end** — with a `studio_member_rates` row of 12000 in
  the project's pricing studio, authored by the owner, a fresh hour resolved
  `rate_source='studio_member'`, `resolved_rate_cents=12000`, `amount_cents=6000`,
  `billing_state='pending_authorization'`. The ledger view's `studio_id` correctly
  derives from `projects.studio_id`.
* **HT-22's repair works** — an owner `UPDATE … SET duration_minutes` on a `none / $0`
  row re-ran the classifier and re-rated it to `studio_member / 12000 / 19000`.
* **HT-29** — the Desk's hours line is act-bearing or absent: `hours to bill →` /
  `a timer is still running from {day} →`, never a bare total. A failed money read
  degrades to the neutral `hours →` door rather than reading as "nothing to bill".
* **HT-21** — the client's pay sheet renders `date · duration · rate/hr` per row and
  **no name**; the CSV (`time-export.ts`) carries a fixed 14-column contract with
  `notes` deliberately absent (HT-36) and is reachable only from the admin-gated studio
  scope.

---

## §2 · Findings

### MAJOR

#### S-1 · An owner of two studios is told her studio logged nothing, while its hours sit one click above. (n7-05, carried ×4 — now measured with money on screen.)
*Confidence: high — rendered, not reasoned. Severity: major (a wrong answer on a shipped money surface).*

`use-viewer-studio.ts:52-64` sorts the owner/admin `design_studio` candidates by name
then id and returns **`candidates[0]`**; nothing switches it. On the repo's own default
seed `designer@patina.dev` owns **two** — `Leah Hartwell` and `Local Dev Studio` —
and "Leah" sorts before "Local".

Measured, in one session, at 1440:

* I logged 120 min on **Cedar Lane Study**, whose `projects.studio_id` is **Local Dev
  Studio**. `time_entry_ledger.studio_id` correctly reads Local Dev Studio.
* `mine` scope: `TODAY · 2H 00M · WEEK · 2H 00M`, the row printed beneath it.
* One click to `the studio`: **`THE STUDIO · LEAH HARTWELL · THIS WEEK` / `0 min` /
  "Nothing logged in this window."**

There is no door to the second studio. Everything keyed on that pick follows — the
studio rollup, the member scope, and the studio the stamp door offers to name (which
the server then refuses `42501` on a document the *other* studio employs the designer
of).

This is not an exotic shape: `00295` provisions a one-person workspace at every
designer grant, so a hire seated `admin` in her employer's studio has exactly two
candidates — the shape HT-3-b's own ruled text and W1-R8-01 are written about.
Prod exposure on Strata is **unmeasured** (no read-only credential to hand).

*Fix, smallest form:* when `candidates.length > 1`, make the studio name in
`ScopeRollup`'s caption a Scored-Ink word that cycles the candidates; or return the
count so the sheet can say *"(1 of 2 studios)"* instead of picking in silence.

---

#### S-2 · The rate card, the internal-time door and the stamp door each pick a studio a *different* way — one of them with no ordering at all.
*Confidence: high on the mechanism (read end to end); medium on how often the unordered read flips. Severity: major (money: the rate she types can price nothing).*

Three picks, three rules, in one program:

| Surface | Rule | File |
|---|---|---|
| Hours lens · rollup · stamp door | owner/admin `design_studio`, **sorted by name then id**, `[0]` | `use-viewer-studio.ts:52-64` |
| **HT-3's Studio rates card** + `useStudioMemberRates` | `orgs?.find(o => o.type === 'design_studio') ?? orgs?.[0]` — **no `.order()` anywhere**, PostgREST row order | `account-studio-page.tsx:212-215` |
| **HT-15's internal hour** (writes `studio_id` onto the row, permanently) | non-guest `design_studio`, sorted by name then id, `[0]` | `use-viewer-studio.ts` `useInternalTimeStudio` |

`use-viewer-studio.ts`'s own header comment is written *about this exact bug* —
"`useOrganizations` selects `organization_members` with no `.order()`, so PostgREST row
order is unspecified … So the candidates are ordered here". It was closed on one
surface. The surface HT-3 actually rules about still has it.

Measured: on the seed the Studio-rates section lists **only "Leah Hartwell · owner"**.
The member who logs the priced hours is a member of **Local Dev Studio**, which the page
never offers — so the owner has **no door at all** to price the person working on the
project her money comes from, and the rate she *can* type is written against a studio
that prices nothing. Both `Studio rates →` (`pending-time-authorization-band.tsx:72`)
and `Set the studio rate →` (`hours-ledger.tsx:2170`) point at `/desk?account=studio`,
i.e. at whichever studio that unordered read returned. I read the same studio on three
consecutive loads, so I did **not** measure a flip — the non-determinism is a code read,
the wrong-studio outcome is measured.

*Fix:* have `AccountStudioPage` consume `useViewerStudio()` (or at minimum the same
sort), so the three surfaces name one studio; then S-1's switch fixes all three at once.

---

#### S-3 · Ship the client portal BEFORE the designer portal, or a homeowner can be shown raw JSON.
*Confidence: high (read both branches). Severity: major, fully closed by the checklist.*

HT-21's time line carries its dated sub-table as a JSON payload in
`metadata.attribution` (`invoice-composer.ts:44`,
`TIME_ATTRIBUTION_KIND = "patina_time_subtable"`). The **pre-ship** client portal
renders `{line.attribution}` verbatim — so an invoice composed by a freshly-shipped
designer portal, opened at `/pay/<token>` before the client portal ships, prints
`{"kind":"patina_time_subtable","rows":[…]}` to the homeowner. `InvoicePaper` lives in
`@patina/patina-design-system` (`src`-resolved), so both portals must be rebuilt
regardless; only the order is at issue. Checklist §1③ reverses the usual portal order
and says why.

*Related note (minor):* the same parser now exists in **three** independent copies —
`invoice-composer.ts` (writer), `apps/client-portal/.../invoice-sheet.tsx`, and
`packages/patina-design-system/.../InvoicePaper.tsx` — with the discriminant constant
re-declared in each. Nothing pins them together.

---

#### S-4 · The integration stack was serving W7's two central function bodies as W4/W2's. One gate was RED because of it, and every gate run on that stack after the W7 merge should be re-read.
*Confidence: high — measured, diagnosed, repaired, re-measured. Severity: major (evidence), **not** a branch defect and **not** a prod hazard.*

My first `run-sql-tests.sh -d supabase/tests/billing` came back **8/9**, with
`time_rate_resolution_test.sql` failing:

```
FAIL al1 (HT-4): a card bound to lead_designer prices the lead REGARDLESS of its
label — "Principal designer" is exactly the label that cannot normalize-match;
got NULL / none / lead_designer
```

Cause, measured: the live `classify_project_time_entry_authority` contained **zero**
occurrences of `roster_role` — it was **00613's** body (W4's internal short-circuit),
not **00618's**. `resolve_time_rate_cents` was likewise **00615's** body, 517 characters
short of 00618's. `supabase_migrations.schema_migrations` nonetheless listed
00618/00619/00620 as applied. The signature is an incremental `migration up` run around
a merge: W7's `00618` applied first, then W4/W2's lower-numbered `00613` / `00615`
landed afterwards and overwrote it.

I repaired both by re-applying only the two `CREATE OR REPLACE FUNCTION` statements
extracted from `00618`. Billing then ran **9/9 green**, and a systematic body-by-body
comparison of all 26 functions the new migrations define found no other genuine
divergence.

**The branch is correct** — `00618`'s classifier is grafted from head `00613` (its own
banner says so; the body carries both W4's internal leg and W7's `roster_role` binding),
and `supabase db push --include-all` applies in **version order**, so on Strata `00618`
lands last. Two consequences for the ship:

1. Push **all** pending migrations in **one** `db push --include-all`; never piecemeal
   and never out of ascending order. The checklist carries the two post-push probes
   (`pg_get_functiondef … like '%roster_role%'` on both functions).
2. **Any gate claim measured on this stack between the W7 merge and 2026-09-13 ~22:35
   is unreliable in both directions.** The green numbers above were all produced after
   the repair.

---

### MINOR

* **S-5 · A rate written today does not price an hour logged before it, and nothing on
  the surface says so.** *(Measured. Ruled behaviour — P-4 plus `effective_from` — but a
  day-one surprise.)* An hour at `2026-09-13 23:33Z` with the studio rate dated
  `2026-09-14` resolved `none / 0 / pending_authorization`; the same member's hour after
  the boundary resolved `studio_member / 12000 / 6000`. An hour logged *before* the rate
  row existed also stays at `none` for ever, because the classifier runs on INSERT and
  P-4 forbids backfill. The repair exists and works (HT-22: an owner edit of any
  classifier-watched column re-rates — measured), but the ledger's `Set the studio rate
  →` door does not mention it. Belongs in what Leah is told, and in Kody's walk.
* **S-6 · `run-sql-tests.sh -d <subdir>` silently loses the allowlist.** Its `--known`
  default is `<dir>/KNOWN_FAILURES.md`, and **no** subdirectory has one — the file lives
  at `supabase/tests/KNOWN_FAILURES.md`. My first `-d supabase/tests/rls` run reported
  **2 unexpected failures** (`design_requests_test.sql`, `studio_titles_test.sql`) that
  are both documented there; with `-k supabase/tests/KNOWN_FAILURES.md` the same run is
  31/31. This is the same class as W6-R3-11 and it cuts both ways: any wave that gated on
  a per-directory run without `-k` measured its baseline wrong.
* **S-7 · `useStudioUnbilledTime()` on the Desk carries no studio filter**, so for a
  viewer who is owner of one studio and a member of another, the Desk's single
  act-bearing line (`hours to bill →`) can offer the composer over rows RLS lets her read
  from both. Same family as n7-02; recorded because the Desk line is new this wave.
* **S-8 · Three copies of the time-sub-table parser** — see S-3's related note.

### NOTE — ruling owed

* **S-9 · Should an emptied rate card block a send?** (= W7-R6-03, restated as the
  ruling it asks for.) A card taken to zero rows passes `assessAgreementReadiness` in
  silence, and every hour on the resulting project prices `none / pending_authorization`.
  The state is pre-existing (`materialize_standard_parts` seeds `'[]'`), but W7's new
  per-row `Remove` is a second, quieter door to it, and a green test intends the
  last-row removal. Ruling owed: is an empty rate card a deliberate *"this agreement has
  no hourly rates"* (today's behaviour) or a blocker?
* **S-10 · Three sub-rulings are still OWED and ship as built** — **HT-25-a** (the
  auto-roster seat re-seats after the owner removes it, cross-role, silently),
  **HT-6-a** (`00596` writes down one live Strata row to $0), **HT-6-b** (a repaired
  `pending_authorization` row is non-promotable for ever). Recorded so the ship report
  names them rather than the rulings sheet alone.

---

## §3 · Disposition of every carried item I was asked to settle

### W6 (`W6-review-r3.md`)

| id | Disposition | Reason |
|---|---|---|
| **W6-R3-01** note field 20px / no AX label | **ACCEPT AS RESIDUAL** (minor) | It is an **input**, not an act; §A's 44px floor is written about acts, and every control r1 raised was a button. It reproduces the repo's existing `RouteFieldShell { TextField }` shape. Recommend `.frame(minHeight: 44)` + `.accessibilityLabel("Note")` at the next Field touch — two lines, and Capture is going to TestFlight anyway. |
| **W6-R3-02** save error swallowed, then dismissed | **ACCEPT AS RESIDUAL** (minor) | The failure is rare (`try?` on a local SwiftData save) and the outbox is the durability path. But the caption promises durability, so it is a real honesty gap. The sibling `V4VisitReviewScreen.logTheHours` already models the fix (re-read after save, hold the sheet). Not a ship blocker. |
| **W6-R3-06** `rate_source` NULL renders "Billable" | **ACCEPT AS RESIDUAL** (minor — narrower than reported) | Verified the mitigation the finding does not name: `worthLabel` returns **"Awaiting authorization"** for `billing_state = 'pending_authorization'` *before* falling to "Billable", so only a legacy row that is **authorized AND billable AND `rate_source` NULL AND rate-less** misreads. HT-6-a measured that population on Strata: **4 rows, all on a test project**. Recorded as an honest two-surface divergence — the desk prints **"rate not recorded"** for the same row (`authority-hours.ts:173`, the `unrecorded` branch) while the phone prints "Billable". One-line fix (`row.rateSource == nil || == "none"`) recommended, not required. |
| **W6-R3-07** stepping duration files a future span | **ACCEPT AS RESIDUAL** (note) | Same mechanism as **W7-R5-07**: `project_time_entries` carries nine CHECKs and **none** on `started_at`, so nothing server-side refuses a future span. Both belong in one ship-report line. Not a money defect — the desk ledger shows the row. |
| **W6-R3-10** V4 stepper/billable gated on `projectID`, never measured at 390 | **ACCEPT AS RESIDUAL** (note) | A coverage gap, not a defect: the same `stepButton` (44 × 44) and `Toggle("Billable").frame(minHeight: 44)` shapes were measured on H1 at 45 × 45 and 350 × 53.3. `capture-gate.sh all` is green. Closing it needs a fixture visit with a `projectID` in the shots matrix — a follow-up, not a ship gate. |

### W7 (`W7-review-r6.md`, `-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W7-R6-03** an emptied rate card passes readiness | **ACCEPT AS RESIDUAL + RULING OWED** → **S-9** | Pre-existing state, deliberate door already exists (`removePart`), green test intends the last-row removal. The *reachability* is new; the state is not. |
| **W7-R6-05 / W7-R5-03** sub-44px Remove acts (18px, 30px) | **ACCEPT AS RESIDUAL** (minor) | Six open §A deviations, all inherited shapes; two of the six are acts this wave newly makes reachable. Recommend one §A pass covering **both** Removes together (the composer's 30px and the studio page's 40 × 18) so a fix does not stop at one, as it did for W7-R5-01. |
| **W7-R5-02** no re-index after Remove | **ACCEPT AS RESIDUAL** (minor) | `sortOrder` is a display key; HT-4 binds pricing on `roster_role`, not position, so a duplicate `sortOrder` cannot mis-price an hour. Cosmetic ordering only. |
| **W7-R5-04** trim drops the tail, not the unbindable row | **ACCEPT AS RESIDUAL** (minor) | Worst case, combined with W7-R5-02/-R5-08, is that a **bound** row is dropped and an **unbound** one kept — which `UNBOUND_ROLE_BLOCKER` then surfaces and which blocks the send. Visible, not silent, and not money. Whoever repairs W7-R4-04's dirty-comparison must keep the five-row card reading dirty (W7-R5-08's standing constraint). |
| **W7-R6-04** studio half of HT-4 behind `agreement-parts` | **MUST VERIFY BEFORE SHIP — I could not.** | The PostHog MCP server **disconnected mid-session**, so I have **no** live reading of `agreement-parts`. Confirmed by grep that `account-studio-page.tsx:198` reads it and `:1134` gates the whole Agreement-defaults card. **And I found a larger one the finding does not name:** the entire `AccountStudioPage` — and with it HT-3's **Studio rates** section, the only per-member rate door in the product — sits behind **`studio-workspaces`** (`account-sheet.tsx:105`, `:272`). Both flags must be confirmed at 100% before the ship, or HT-3 and HT-4's studio doors do not exist for a studio the rollout has not reached, and every unsigned services hour prices `none / $0`. P-5 still holds — this program adds no flag. |
| **W7-R5-07** noon-UTC can file `started_at` in the future | **ACCEPT AS RESIDUAL** (note) | Re-probed: nine CHECKs on `project_time_entries`, none on `started_at`. A consequence of HT-13-a, not a defect introduced beside it. One ship-report line, shared with W6-R3-07. |

### W1/W2 portal (`W1W2-portal-review-r7.md`)

| id | Disposition | Reason |
|---|---|---|
| **n7-02** studio money under the word "mine" | **ACCEPT AS RESIDUAL** (minor) | The figure was studio-wide before the wave too, under the same caption and with no lens at all; the wave made an existing ambiguity legible. The one-expression caption fix (`unbilled · all time · the studio`) is cheap and worth taking with S-7. |
| **n7-05** a two-studio viewer reads only the alphabetical first | **ESCALATED — MUST FIX OR RULE BEFORE SHIP** → **S-1**, **S-2** | Carried ×4 as a code read. I measured it on the default seed with hours on screen: the studio scope says "Nothing logged in this window" about a studio holding 2 h, and the HT-3 rate card lists the wrong studio's members, leaving no door to price the person doing the priced work. That is a wrong money answer and a missing ruled surface, not a rough edge. |
| **n7-06** same-day upsert re-authors `created_by` | **ACCEPT AS RESIDUAL** (minor, raised in significance) | Recording the interaction the finding names but does not weigh: under **HT-3-e(2)** a same-day correction **by the member herself** flips a studio-authored (pricing) row into a **self-authored (inert)** one — so one same-day blur-save can silently take her own hour to `'none'`. The shipped portal path always sends `created_by: userId`, so the flip is reachable from the UI. Recommend splitting insert/update so `created_by` rides only the insert. |

### W3 (`W3-review-r5.md`)

| id | Disposition | Reason |
|---|---|---|
| **W3-R5-m3** Enter during the authority window does nothing, silently | **ACCEPT AS RESIDUAL** (minor) | `log-time-sheet.tsx:167` returns early while `valid` is false; the greyed `Log it` is the only signal. One line in the existing `note` slot ("checking the agreement…") closes it. ~100 ms locally; the flagship five-interaction flow can outrun it on a slow link. |
| **W3-R5-m5** the e2e serial-mode first case is red | **RESOLVED — not a defect** | Run whole, in dev mode, on the isolated stack: **7 passed (1.7 m)**, `the sheet doorway opens the Hours book` included. It was an artifact of the reviewer's only hydrating server being a **production** build (`next start` warning "`next start` does not work with `output: standalone`"). The pre-merge run the finding asked for has now happened. |

---

## §4 · What I did NOT verify

* **Strata was never written to.** The only prod contact was `supabase migration list --linked` (read-only). No `db push`, no `functions deploy`, no `wrangler deploy`.
* **PostHog flag state is UNKNOWN.** The PostHog MCP server disconnected mid-session, so `agreement-parts` and `studio-workspaces` rollout percentages were not read. Both gate ruled surfaces (see W7-R6-04's row).
* **Prod exposure of the two-studio shape (S-1 / S-2) is unmeasured** — no read-only Strata credential to hand; `supabase/.temp/pooler-url` carries no password. The mechanism and the local measurement are solid; the population is not.
* **iOS is sim-only.** `capture-gate.sh all` green on the Simulator; no physical device, so every camera/LiDAR/upload/airplane-mode-drain claim in W6 remains **not device-verified**. P-6 rules that acceptable; Kody's walk is the closure.
* **Client-portal e2e not run** (chromium-only suite; the client change is covered by the new `invoice-sheet-time-subtable.test.tsx` and `InvoicePaper.test.tsx` jest specs, both inside the 151/151 pass).
* **Lint outside designer-portal was not run and would not be trustworthy** if it had been — designer-portal's flat config is the only one in the repo that resolves.
* **1024 was not walked by hand** — it is covered by the wave's own passing e2e case (`the scope lens reads at 1024`), not by my eyes.
* **The `this document` lens was not driven from a document** — `?sheet=hours` is a `/desk`-only doorway and I did not chase the in-document chord. It is covered by the wave's three passing width cases. **n7-03** (the studio scope keeping a document's name in the header) was therefore not re-measured.
* **The CSV was read as code, not downloaded** — `time-export.ts`'s 14-column contract and the deliberate absence of `notes` were verified by reading; no file was produced in a browser.
* **I mutated the isolated stack** and cleaned up after: created and deleted a plain-member user (`review-member@patina.dev`) and its seat, roles, roster seat and rate row; logged and deleted 4 time entries (`project_time_entries` is back to **0 rows**). I did **not** reset the stack. I **did** leave two repairs in place — `classify_project_time_entry_authority` and `resolve_time_rate_cents` re-applied from `00618` — because that makes the stack match the branch; see **S-4**. Three throwaway Playwright specs and `test-results/` were deleted; `git status` in the worktree is **clean**; port 3100 is free; ports 3000/3002 were never touched.
