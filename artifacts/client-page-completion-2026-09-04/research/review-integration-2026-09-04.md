# Adversarial cross-lane review — `client-page/integration` @ `debd71b63`

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cp-int`, 40 commits over
`origin/main` (`388c82628`). 73 files, +15,311/−31. Read-only pass; local Supabase stack
untouched.

**What was actually run here** (fresh, in the worktree):

| Gate | Result |
|---|---|
| `pnpm --dir apps/client-portal type-check` | PASS |
| `pnpm --dir apps/designer-portal type-check` | PASS |
| `pnpm --dir packages/supabase type-check` | PASS |
| `pnpm --dir packages/supabase test` (vitest) | PASS — 989 passed, 12 skipped, 84 files |
| `pnpm --dir apps/client-portal test` (jest) | 2 suites fail / 1 test fails — **both pre-existing on main** (`src/lib/data/orders.ts` does not exist on `origin/main`; `portal-access.test.ts` untouched by this branch). 129/131 suites, 1363/1364 tests pass. |
| `pnpm --dir apps/designer-portal test` (jest) | **FAIL — 6 suites, 61 tests. Caused by this branch.** See finding 1. |
| `pnpm --dir apps/designer-portal lint` | 2 errors, both in files this branch does not touch (`piece-room-save-gate.test.tsx`, `use-commercial-documents.test.ts`) → pre-existing |
| `git show --cc` on all 14 merge commits | **empty on every one** — no merge resolved anything by hand (finding 31) |

---

## BLOCKERS

### 1. The designer-portal jest gate is RED because of this branch — 6 suites, 61 tests
**Severity: blocker · Confidence: certain (reproduced twice)**

Every one of the 61 failures is the same line:

```
TypeError: (0 , _supabase.useProjectNotes) is not a function
  at ClientNoteComposer (src/components/document/client-note-composer.tsx:202:67)
```

Failing suites, all under `apps/designer-portal/src/app/(document)/doc/[id]/`:
`page.test.tsx`, `worktable.test.tsx`, `worktable-delivery.test.tsx`,
`worktable-speccing.test.tsx`, `worktable-finalize.test.tsx`, `paper-order.test.tsx`.

This is the textbook cross-lane seam. Lane 6 mounted `<ClientNoteComposer>`
unconditionally at `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2681`;
Lane 1 put `useProjectNotes` in `@patina/supabase`. Each of those six test files carries
its **own inline** `jest.mock('@patina/supabase', () => ({ … }))` factory
(`page.test.tsx:122`, `worktable.test.tsx:29`, `paper-order.test.tsx:30`,
`worktable-delivery.test.tsx:38`, `worktable-speccing.test.tsx:98`,
`worktable-finalize.test.tsx:42`) and none lists the four new exports. Lane 6's own
reviewer ran only `client-note-composer.test.tsx`, which mocks its own module graph, so
nothing in the per-lane pass could see this.

The composer calls **every** hook above its `if (flag.isLoading || !flag.value …) return null`
guard (deliberately, for hook-order stability), so the flag being off does not save the
tests — or production. Fixing the mocks needs at minimum `useProjectNotes`, `useProposals`,
`useSendProjectNote`, `useRetireProjectNote` in all six factories (`useProjectInvoices` is
already there in `page.test.tsx:135`; the others may cascade once the first is satisfied).

**Better fix, which also closes finding 6:** split the composer into a two-component pair —
an outer `ClientNoteComposer` that reads `useFeatureFlag('threshold')` and returns `null`
when the flag is loading or off, and an inner component holding every data hook. Hook order
stays legal, no query fires when the flag is off, and the six mocks need only the hooks the
page already uses.

### 2. The RPC repair is NOT behind the `threshold` flag and changes two already-shipped surfaces
**Severity: blocker (needs an explicit ruling before 00565 is applied) · Confidence: high**

00565 §1d rewrites `public.get_client_project_selections`. Nothing about that read is
flag-gated. The moment the migration lands on Strata, two live surfaces change, and turning
`threshold` back off does not undo either — only reverting the migration does.

**(a) The Making v1 (`single-pane`, already live).**
`apps/client-portal/src/components/making/the-making.tsx:589-591` gates its selection region
on `selectionsQuery.data?.origin === 'commercial'`. The 00441 head emits **no `origin` key at
all** (I read its body: `supabase/migrations/00441_…:82-103`), so
`adaptClientSelections` has been defaulting to `'legacy'` and that whole region has been dark
since 00433. 00565 restores `origin` → for every single-pane client on a commercial project,
instrument line items and **client prices** appear on The Making for the first time. This may
well be desired, but it is a prod behaviour change riding a flag it is not gated by.

**(b) The iOS Patina client app — and this one is a regression, not a reveal.**
`apps/mobile/Patina/Patina/Core/Network/ProjectsAPIClient.swift:248-253` (`listFFEItems`)
calls this RPC and returns `bundle.selections` straight into the app. Two changes hit it:

- `RemoteFFEItem.client_line_total_cents` (`ProjectsAPIClient.swift:118`, keyed
  `clientLineTotalCents`) has been decoding `nil` since 00439 dropped the key. It now
  decodes the signed snapshot figure. Prices appear in the shipped iOS app with no client
  release and no flag.
- The row set **narrows**. The head returns any `design_disposition = 'selected'` line with
  no commercial gating; 00565 requires either `source_authorization_item_id` → an EXECUTED
  authorization, or `trade_scope_document_id` → an EXECUTED trade scope. **A client on a
  legacy project (no commercial documents) — or on a commercial project whose lines are
  selected but not yet authorized — gets an EMPTY furnishings list on iOS where she sees
  lines today.** The branch knows this: it re-contracted
  `supabase/tests/ffe/domain_and_placement_test.sql` from "curated client reader must remain
  available" (non-empty) to "legacy origin, empty selections". Nobody appears to have carried
  that consequence to iOS.

Decodes stay safe (every `RemoteFFEItem` field but `id` is optional, so dropping
`jsonb_strip_nulls` and adding keys cannot break the Swift decoder) — the problem is
semantic, not structural.

**Before applying:** count Strata projects that are legacy-origin or have selected-but-
unauthorized lines with a client on iOS. If that set is non-empty, this needs a decision, not
a deploy.

---

## MAJOR

### 3. `NEXT_PUBLIC_FLAG_OVERRIDES: 'threshold:true'` is process-wide for the whole client-portal e2e run
**Severity: major · Confidence: high**

`apps/client-portal/playwright.config.ts:52` pins the override on `webServer.env`, which is
one dev server shared by every spec in `apps/client-portal/tests/`. `NEXT_PUBLIC_*` is
inlined at server start, so the flag is on for `smoke.spec.ts`, `plan-set.spec.ts`,
`projects-load.spec.ts`, `gate-ceremony.spec.ts`, `wp3-screenshots.spec.ts` — everything.

The concrete bite: `apps/client-portal/tests/plan-set.spec.ts:110-118` signs in as
`client@patina.dev` and navigates to `/documents` (`plan-set.spec.ts:118`). `/documents` is in
`ROUTE_COLLAPSE` (`apps/client-portal/src/components/threshold/route-collapse.ts:32` →
`mat-papers`), so whenever that client is down to one project
(`threshold-route-collapse.tsx:48`), `ThresholdRouteCollapse` does
`router.replace('/projects/<id>#mat-papers')` (`threshold-route-collapse.tsx:68`) and every
assertion after `page.goto('/documents')` fails. `plan-set` mints its own project, which
usually keeps the count above one — but see finding 4: threshold.spec actively parks projects
while other files are running. Whether `plan-set` passes is now a race.

Nested routes are safe (`collapsedHref` at `route-collapse.ts:37-43` is exact-match only), so
`/decisions/<id>` in `gate-ceremony.spec.ts:59` / `wp3-screenshots.spec.ts:55` is unaffected.

**Fix:** scope the override to this spec — `test.use({ extraHTTPHeaders … })` won't do it for
an inlined build-time var, so either give threshold.spec its own Playwright *project* with
its own `webServer` on a different port, or set the override per-page via a cookie/query the
flag hook can read, or run threshold.spec as a separate config. Leaving it global means the
client-portal e2e suite no longer tests the shipped chrome for anyone.

### 4. `threshold.spec.ts` mutates shared DB state in `beforeAll` while other spec files run in parallel
**Severity: major · Confidence: high**

`fullyParallel: true` and `workers: undefined` locally (`playwright.config.ts:20,23`).
`test.describe.configure({ mode: 'serial' })` inside threshold.spec serializes only *within*
that file — other spec **files** get their own workers and run concurrently.

`threshold.spec.ts:120-140` then, for the duration of the run:
- reads every project with `client_id = CLIENT_ID` other than `PROJECT_ID`,
- sets `studio_id = LOCAL_DEV_STUDIO_ID` on them via a **service-role** client,
- and calls `set_document_client(..., null)` on each, i.e. **detaches them from the client**.

Any concurrent spec that expects `client@patina.dev` to have three houses — or that minted a
project for her before `beforeAll` ran — sees a different database mid-test. And per the
file's own comment, `studio_id` is **never restored**: "It is left naming Local Dev Studio".
So the suite is not idempotent; a second run without `supabase db reset` starts from a
different shape, and `studio_id` is an RLS-relevant column that the designer portal's studio
scoping also reads.

**Fix:** `test.describe.configure({ mode: 'serial' })` does not help — use a Playwright
project dependency or `--workers=1` for the file that mutates shared fixtures, or (better)
seed a fourth, dedicated solo-project client in `the-client-page.sql` and stop borrowing
`client@patina.dev`'s houses altogether.

### 5. Two SQL tests still assert a `status` key that neither the head nor 00565 emits — and 00565 gets them within one word of green
**Severity: major · Confidence: high on the key mismatch; medium that renaming alone turns them green**

The branch re-contracted `ffe/domain_and_placement_test.sql` and `ffe/release_security_test.sql`.
It did **not** touch three other files that call the RPC. Two of them assert `'status'`:

- `supabase/tests/commercial/authorized_schedule_test.sql:1563` — `v_sofa_row->>'status' = 'ordered'`
- `supabase/tests/commercial/trade_scope_test.sql:2188` — `v_furn ? 'status'`

00441 renamed that key to `logisticsStatus` (`00441_…:96`), and 00565 keeps `logisticsStatus`.
So these blocks are already red on `origin/main` — they also assert `imageUrl`, `docCode`,
`instrument`, `clientUnitPriceCents`, `allowance`, all of which the head dropped. **00565
restores every one of those except the key name.** A two-line rename (`'status'` →
`'logisticsStatus'`) in those two files plausibly moves them from red to green, and shipping
00565 without it leaves a suite that "was already broken" for a reason that no longer applies.

The third caller, `workflow/commercial_privacy_contract_test.sql` (C12/C13), I traced through
its fixture and it still holds: the "Commercial authorized sofa" is bound
(`source_authorization_item_id` set at :233) under an executed doc (:190) whose proposal is
`commercial_state = 'executed'` (:167) → C13's `count = 1` survives; the "Commercial unbound
chair" that the widened disposition filter would now admit is dropped by the authorization
join instead. C12's project has no executed doc → still 0. The comment at
`commercial_privacy_contract_test.sql:130` ("only returns disposition='selected' rows") is now
stale prose.

### 6. Flag-off regression: two new queries fire on EVERY designer's project document page
**Severity: major · Confidence: high**

`ClientNoteComposer` is mounted unconditionally for every project document
(`page.tsx:2681`, guarded only on `engagement_kind === 'project'`), and every hook runs above
the flag guard:

| Hook | Flag-off behaviour |
|---|---|
| `useProjectNotes(projectId)` | **fires** — new `project_notes` SELECT per doc page, and it sets `refetchOnWindowFocus: true` + `refetchOnReconnect: true` (`use-project-notes.ts:53-56`), so it re-fires on every tab focus |
| `useProposals({ projectId })` | **fires** — `useProposals` has no `enabled` override (the composer's own comment at :208-210 admits this). Key `['proposals', {projectId}]` is not used anywhere else on the doc page (only `people/views/person-profile.tsx` uses `useProposals`, with a different filter), so this is a net-new query with `projects` + `profiles` embeds |
| `useProjectInvoices(projectId)` | dedupes — `page.tsx:525` already holds the same key |
| `useProjectInstruments` / `useTradeScopes` | correctly gated (`enabled = notesReady`) |

So today's flag-off doc page is *not* byte-for-byte unchanged: two extra round trips per
open, one of them refetching on focus. The fix in finding 1 (outer flag gate / inner hooks)
removes both.

### 7. The house can retract its own figures: `useClientPlan` is not in the settle gate
**Severity: major · Confidence: high**

`threshold.tsx:404-411` computes `loading` from six queries — approvals, proposals,
selections, invoices, notes, rooms. `planQuery` (`useClientPlan`), `identityQuery`,
`teamQuery`, `partiesQuery` and the `useQueries` held-draw bundles are **not** in it.

`planQuery` is load-bearing for numbers the page asserts:
- `roomTargetCents()` (`threshold.tsx:129-136`) prefers the published plan's figure and falls
  back to `room.budget_cents`. Before `planQuery` resolves, `planTargets` is empty → every
  room falls back. When it resolves, targets change.
- Those targets feed `RoomBandModel.varianceLine` via `roomVarianceLine` and
  `HouseLedgerModel.plannedCents`.

So a client can read "about eleven hundred past its target" and then watch it become
"about four hundred under its target", or read "The house stands at $X agreed of $Y planned"
and watch $Y move. That is precisely the failure the file's own header forbids in capitals
("NEVER REVERSE… a client who reads them and then watches $9,125 and two open marks arrive
has been told something untrue"). The rule was widened from rooms to five sources and
stopped one short.

**Fix:** add `planQuery.isPending` to `loading`. `identityQuery`/`teamQuery`/`partiesQuery`
are additive-only (silence → content) and can stay out.

---

## MINOR

8. **`reuseExistingServer: true` silently voids the whole env pinning.** `playwright.config.ts:39`.
   If a dev server is already on :3002 — "the usual local case", per the pre-existing comment —
   the `NEXT_PUBLIC_SUPABASE_URL` pin, the anon key pin and `threshold:true` all do nothing,
   and threshold.spec tests today's surface (or fails opaquely). The comment says "kill
   anything on :3002 before running e2e", which is a footgun documented rather than removed.
   *Confidence: high.*

9. **A studio member can set `sent_at` and `state` freely at INSERT time.** 00565 §1b closes
   the after-the-fact path carefully (column-level `GRANT UPDATE (body, enclosures, state,
   answered_at, retired_at)`, `supabase/migrations/00565_the_client_page.sql:306-307`, with the
   back-dating rationale at `00565:290-304`), but the INSERT grant is table-wide
   (`00565:305`) and `project_notes_studio_insert`'s `WITH CHECK` (`00565:269-277`) constrains
   only `project_id` and `author_id`. A member may insert a note with `sent_at` in the future
   (invisible to the client, whose policy is `sent_at <= now()`, `00565:285-287`) or in the
   past, or with `state = 'answered'` and `answered_at` NULL — the shape CHECKs at
   `00565:233-242` permit it. Same-studio-only, so the blast radius is internal.
   *Confidence: high.*

10. **Held/agreed figures pop in after the page has settled.** `heldDrawCentsByProposalId`
    starts `{}` (truthy) at `threshold.tsx:377-381`, fed by the `useQueries` at
    `threshold.tsx:370-374`, so `derive.ts:466-469`'s `ledger.heldCents` is `0` while those
    bundles are in flight; `HouseLedger`'s `figure()` (`house-ledger.tsx:32-34`, applied at
    `:44-49`) hides a 0 row, so nothing is *retracted* — but the "Held on finished work ·
    $3,850" row and the "The house stands at…" line (`house-ledger.tsx:42`, rendered at
    `:57-66`) appear after the house has already spoken. Additive, so not as bad as 7, but it
    breaks the same discipline. *Confidence: high.*

11. **Multi-project client + flag on is an untested combination.** `ProjectSurfaceSwitch`
    branches on the flag alone (`project-surface-switch.tsx:62-73`); `ThresholdChromeGate`
    (`threshold-chrome-gate.tsx:30`) and `ThresholdRouteCollapse`
    (`threshold-route-collapse.tsx:48`) also require `projectCount === 1`. So a client with two
    houses gets the global header (`app-chrome.tsx:82-89`) *stacked above* the chrome-less
    Threshold with its own `Doorplate` (`threshold.tsx:648-656`) naming the project. No unit
    test and no e2e covers it — `threshold.spec.ts:120-140` parks projects specifically to
    avoid it. *Confidence: high.*

12. **One moved paper ticks every gate.** `derive.ts:327` / `:331` and `derive.ts:364` / `:365`
    put the bare `'door'` / `'wall'` in `changed`, but `door-gate.tsx:281` and
    `wall-gate.tsx:185` stamp `data-threshold-unit="door"` / `"wall"` on **every** gate
    regardless of position, while `threshold.tsx`'s `gateAnchor()` (`threshold.tsx:448-451`)
    correctly gives only the first one the bare element `id` (`door-gate.tsx:280`,
    `wall-gate.tsx:184`). So `SinceYesterday` (`since-yesterday.tsx:90-94`) lights the brass
    tick beside all doors when any one moved. *Confidence: high.*

13. **The Owed row dims in the since-reading even when the invoice is what moved.** Ledger rows
    carry `data-dimmable` (`house-ledger.tsx:71`) inside `data-threshold-unit="ledger"`
    (`house-ledger.tsx:53`), and `changed` never contains `'ledger'` — it contains
    `'letterbox'` (`derive.ts:444`). `since-yesterday.tsx:96-104` spares a dimmable only when
    its enclosing unit id is in `changed`. *Confidence: high.*

14. **A delivered roomless piece never leaves The Road.** `derive.ts:420` —
    `if (selection.roomId !== null && stageIndex >= DELIVERED_STOP) return []`. A furnishing
    with no room stays on the road at every stage, forever. Possibly deliberate (it has nowhere
    to land) but nothing says so. *Confidence: high on the behaviour, low on whether it's a bug.*

15. **Nothing dedupes a row that qualifies on both branches, and `trade_scope_terms` is joined
    unguarded.** 00565 §1d concatenates the two `jsonb_agg`s — furnishings at
    `supabase/migrations/00565_the_client_page.sql:478-541`, trade at `00565:554-598`, joined by
    the `||` at `00565:554`. A `project_ffe_items` row carrying both
    `source_authorization_item_id` (`00565:536`) and `trade_scope_document_id` (`00565:584`)
    would appear twice with the same `id`, which would break `selectionById`
    (`threshold.tsx:349`) and `piecesByRoom` totals (`derive.ts:383-390` — double-counted
    money). Separately, `JOIN public.trade_scope_terms AS terms ON terms.proposal_id =
    proposal.id` (`00565:589`) multiplies the trade branch if a proposal ever carries more than
    one terms row. Both are "shouldn't happen" — neither is enforced here. *Confidence: medium
    (depends on invariants I did not verify in the schema).*

16. **The doorstep approval walks the client back out of the chrome-less house.**
    `DoorstepApproval`'s `ScoredAction` goes to `/decisions/${approval.decisionId}`
    (`apps/client-portal/src/components/threshold/threshold.tsx:207`), which is not a bare
    project route, so `ThresholdChromeGate` (`threshold-chrome-gate.tsx:16,30`) puts the global
    header back. *Confidence: high.*

17. **Dead contract in `standing.ts`.** `ThresholdStandingInput.nothingOwed`
    (`apps/client-portal/src/lib/threshold/standing.ts:46`) is documented and computed at
    `threshold.tsx:422` but never read in `thresholdStanding`'s body (`standing.ts:70-92` — the
    only mention is the comment at `:78`); `credenzaLine` (`standing.ts:48`, read at
    `standing.ts:89`) is declared and never passed by any caller. *Confidence: certain.*

18. **The Mat prints studio-internal role vocabulary to the homeowner.** `ROLE_WORD`
    (`threshold.tsx:90-96`) maps `bookkeeper` → "bookkeeper" and `previous_lead` → "previous
    lead" and renders them in the people list. Whether the client should learn that her studio
    has a bookkeeper, or that a designer previously led her project and no longer does, is a
    product call nobody appears to have made. *Confidence: high on the behaviour.*

19. **`SinceYesterday` does two whole-subtree `querySelectorAll` sweeps on every render**
    (`since-yesterday.tsx:85-104`), deliberately, because `changed` and `children` are fresh
    each render. Documented as load-bearing; still a per-render DOM walk over a long page.
    *Confidence: certain.*

20. **The `project_notes` CHECK depends on a user-defined function.**
    `CONSTRAINT project_notes_enclosures_check CHECK (public.project_note_enclosures_ok(enclosures))`
    — constraint at `supabase/migrations/00565_the_client_page.sql:237-238`, function defined at
    `00565:197-214`. A later `CREATE OR REPLACE` of that function silently weakens the
    constraint without touching the table, and existing rows are not revalidated. Also
    complicates dump/restore ordering. *Confidence: high.*

21. **A designer previewing a client project advances her own reading mark.**
    `mark_project_read`'s predicate admits studio members
    (`supabase/migrations/00565_the_client_page.sql:390`, guard at `00565:405-412`), and
    `apps/client-portal/src/components/threshold/threshold.tsx:271-279` fires it once per
    mount. Harmless (marks are owner-scoped via `project_reading_marks_owner_select`,
    `00565:347-351`), but a studio member browsing the client surface writes rows.
    *Confidence: high.*

22. **`supabase/tests/rls/project_notes_test.sql` depends on `seed/the-client-page.sql`.**
    Its header (`project_notes_test.sql:17-22`) names the standing note, retired note and
    reading mark by fixed UUID, and the body reads them directly (e.g.
    `project_notes_test.sql:100`, `:233`). It cannot run against a database seeded without that
    file, and nothing in `scripts/run-sql-tests.sh` declares the dependency.
    *Confidence: high.*

23. **Applying 00565 outside `db push` leaves no ledger row.** Per
    `docs/superpowers/plans/2026-09-04-the-client-page.md:36-37`, 00565 is applied selectively
    because 00555/00557/00562/00563/00564 are deliberately pending on Strata. That means
    `supabase_migrations.schema_migrations` needs a hand-inserted row, or the next `db push`
    replays 00565 — the file is idempotent enough to survive that (`CREATE TABLE IF NOT EXISTS`
    at `00565:221`, `CREATE OR REPLACE` throughout, `DROP POLICY IF EXISTS` at `00565:264`ff,
    guarded publication add at `00565:317-338`), but the same `db push` would also push the
    pending files. *Confidence: high.*

    On the selective-apply path itself, 00565 is **clean**: no `\` psql meta-commands (grepped
    over the whole file); no statement that can't run inside a transaction
    (`ALTER PUBLICATION … ADD TABLE` at `00565:324` and plain `CREATE INDEX` at `00565:245`,
    `:249`, `:254`, `:621` are all transactional; no `CREATE INDEX CONCURRENTLY`, no
    `ALTER TYPE … ADD VALUE`); the one extension call is schema-qualified
    (`extensions.gen_random_uuid()`, `00565:222`) per the 00282 rule; every SECURITY DEFINER
    pins `search_path` (`00565:144`, `:171`, `:394`, `:444`). `app_private` gets `USAGE` to
    `authenticated` only (`00565:133-134`), which is correct — `service_role` bypasses RLS and
    never evaluates those policies.

24. **`#8A5F19` is a hard-coded hex.** `apps/client-portal/src/components/threshold/threshold.tsx:86`
    sets `--threshold-accent` inline; `since-yesterday.tsx:49` repeats the literal as a CSS
    fallback, and it recurs at `plan-key.tsx:87`, `plan-key.tsx:180`, `mat.tsx:44` and
    `story-pole.tsx:27` — seven hard-coded copies in all. Not a design-system token,
    and it will not move if the palette does. *Confidence: certain.*

25. **`var(--color-error)` on gate error copy** (`door-gate.tsx:504`, `wall-gate.tsx:285`).
    It resolves to `#C77B6E` (`globals.css:39`) — muted terracotta, not a signal red — and there
    are already 8 usages in the client portal, so this is precedent, not a new rule break. Raised
    only because the brief asked for red/green. Otherwise the house-rule scan is **clean**: no
    `box-shadow`/`shadow-*`, no badge or count pill, no tab bar, no hamburger, no bare "AI"
    anywhere in the diff (the only "AI" hits are a test asserting its absence and two comments
    citing VISION §6). Palette inventory across the whole diff is `--text-*`, `--border-*`,
    `--color-charcoal/mocha/clay`, `--doc-*`, `--bg-*`, `--phase-*` and the one brass hex.

---

## NITS

26. The migration's column-level-UPDATE rationale over-claims. `00565:297-300` says "author_id =
    auth.uid() because who wrote a note is the only thing the client's 'who wrote this' line
    rests on" — but the client UI never reads `author_id`: `threshold.tsx:597-604` passes
    `authorName={studioName}` (`threshold.tsx:601`, sourced from `useStudioIdentity` at
    `threshold.tsx:250`) into `the-note.tsx`. The grant is still right; the reason given for it isn't the reason it holds.
    *Confidence: certain.*

27. The `00-legacy-grants.sql` regeneration also picked up 00564's `approve_client_signoff`
    grants (`supabase/seed/00-legacy-grants.sql:12851-12861`) — a pre-existing gap this branch
    happens to close in its seed diff. Harmless, just not part of the stated scope.
    *Confidence: certain.*

28. `the-client-page.sql` was added to `[remotes.staging.db.seed] sql_paths`
    (`supabase/config.toml:88`) as well as the local `[db.seed]` list (`supabase/config.toml:60`),
    so the staging branch project gets a commercial client fixture on its next seed. Intentional
    per the config comment at `config.toml:57-59` ("same rule"), worth knowing.
    *Confidence: certain.*

29. `apps/client-portal/tests/threshold.spec.ts:201` `await expect(body).not.toContainText('$9,050')`
    and `threshold.spec.ts:211` `not.toContainText('$6,200')` are whole-body negatives.
    Currently correct and load-bearing (they're what proves the frozen snapshot named at
    `threshold.spec.ts:36` and `:199` beat the live working row), but they will fail on any unrelated page
    text that happens to contain those strings. *Confidence: certain.*

30. The plan and spec (`docs/superpowers/plans/2026-09-04-the-client-page.md`, 180 lines, and
    `docs/superpowers/specs/2026-09-04-the-client-page-design.md`, 247 lines) ship on the
    branch. Fine — noting it because they're the only non-code, non-test files in the diff.
    *Confidence: certain.*

31. **Nothing was resolved by hand in any merge.** I ran `git show --cc --format=""` over all
    14 merge commits (`15dbfc5e6 b3f11f27e 06ce36bbe f2acd3adf 66e64631d 2dfbb5aa0 de4a02c83
    e086702fb bdacdf548 0c93c175b f9afd030e 7ccbe04ba d9ab3b066 9686bcfb2`) — every combined
    diff is empty, i.e. every merge was conflict-free. The designer `page.tsx` mount is a
    2-line addition (import at
    `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:128`, JSX at `page.tsx:2681`)
    that merged cleanly against main's 3,241-line version; `apps/designer-portal` type-checks
    and 504/510 of its suites pass, so the merge itself is sound. The breakage in finding 1 is
    a missing mock, not a bad merge. *Confidence: certain.*

---

## Answers to the specific questions asked

**1 · Flag-off regression.** The *client* portal is effectively clean: `ThresholdRouteCollapse`
(mounted for everyone in `layout.tsx:80`) and `ThresholdChromeGate` both read only
`useFeatureFlag` and render `null` / pass through; `Threshold` is never mounted. The *designer*
portal is **not** clean — finding 6. `single-pane` precedence is correct (`threshold` is read
first and wins; both are independently fail-closed; both settle off the same `onFeatureFlags`
callback). The Making's selection regions lighting up is real and is **not** gated by
`threshold` — finding 2a. Consumers of the RPC outside the client portal: the iOS Patina app
(finding 2b) and five SQL test files (findings 5 and its `commercial_privacy_contract_test`
paragraph). Nothing in the edge functions, the designer portal or the services calls it.

**2 · Security of the whole.** I found **no** cross-project or cross-client read path. Query
keys are `['project-notes', projectId]` / `['project-reading-mark', projectId]`, both scoped to
one project and both backed by RLS that is per-project, not per-key. The realtime channel filters
`project_id=eq.<id>` and its handler only invalidates — it never renders the payload — so even a
leaked change event discloses nothing. `ThresholdRouteCollapse`'s `projectIds` come from
`fetchClientProjects()` server-side in the layout, already user-scoped. The regenerated
`00-legacy-grants.sql` matches the migration exactly, column-level `UPDATE` list included. The
composer's `useProjectInstruments` goes through `list_furnishings_authorizations`, which resolves
through the project binding server-side, and the RLS test file (`project_notes_test.sql`, 698
lines) covers a second studio's member reading zero notes and failing to insert. Signing and
accepting both route through the existing server-gated paths (`/api/proposals/[id]/sign`,
`useAcceptTradeScope`), not new ones. The write-side gaps I did find are findings 9 and 21, both
intra-studio.

**3 · Deploy readiness.** 00565 is safe on the selective-apply path — see finding 23's second
paragraph for the full scan. `database.types.ts` is in sync (it carries `project_notes`,
`project_reading_marks`, `mark_project_read`, and — evidence it was regenerated against a DB with
both applied — 00564's `approve_client_signoff`). SSR is safe: every `window`/`document`/
`matchMedia`/`IntersectionObserver` use is guarded (`plan-key.tsx:54`, `story-pole.tsx:48`) or
lives inside an event handler (`door-gate.tsx:203-216`) or an effect
(`threshold-route-collapse.tsx:77`), and `useSyncExternalStore` is given a real
`getServerSnapshot` (`isPhoneOnServer`, `plan-key.tsx:68-70`) so there is no hydration mismatch.
Both portals type-check. The unresolved deploy questions are findings 2 and 23.

**4 · E2E truth.** The spec does assert what it claims — the frozen $9,400 with an explicit
`not.toContainText('$9,050')` against the live working row, the maker, the held draw sentence, the
letterbox balance and due day, the chapter, the standing note body, one key anchor per seeded
room, and the `/invoices` → `#letterbox` collapse. The problems are the two it creates:
finding 3 (the flag override leaks to every other client-portal spec, and `/documents` in
`plan-set.spec.ts` is a collapsed route) and finding 4 (the `beforeAll` parking mutates shared DB
state across parallel workers and never restores `studio_id`).

**5 · House rules.** Clean — see finding 25 for the full scan and the two things worth a
sentence (`#8A5F19`, `--color-error`). Voice is right: third person on the page, first person
only inside the quoted note; `standing.ts` reuses `making/standing-sentence.ts`'s grammar rather
than restating it; the consent copy is byte-pinned to the shipped sign route with a drift test
that reads the route off disk.

**6 · Hand-resolved merges.** None — finding 31.

---

## Verdict

**SHIP WITH FIXES**

Required before merge:

1. **Finding 1** — the designer-portal jest gate is red on this branch (6 suites, 61 tests). Fix
   by splitting `ClientNoteComposer` into an outer flag gate and an inner hook-holder, which also
   fixes finding 6; or, minimally, add the four new `@patina/supabase` exports to all six inline
   mock factories. Gate: `pnpm --dir apps/designer-portal test` must return to
   `510 passed, 0 failed`.
2. **Finding 2** — get an explicit ruling on the unflagged prod behaviour change before 00565 is
   applied, and check Strata for legacy-origin / selected-but-unauthorized projects with an iOS
   client. If any exist, the iOS furnishings list empties for them.
3. **Finding 3 + 4** — un-globalize the `threshold:true` override and stop threshold.spec from
   parking `client@patina.dev`'s houses under other specs, or the client-portal e2e suite is no
   longer trustworthy for anything else.
4. **Finding 5** — rename `'status'` → `'logisticsStatus'` in `authorized_schedule_test.sql:1563`
   and `trade_scope_test.sql:2188` and re-run `scripts/run-sql-tests.sh`; 00565 restores every
   other key those blocks want.
5. **Finding 7** — add `planQuery.isPending` to `threshold.tsx`'s `loading`, so the page cannot
   revise a room's target or the ledger's planned figure after speaking it.

Everything from 8 down is fine to land as-is or fix at leisure; 9, 11, 12, 13 and 18 are the ones
I would not leave in the backlog long.
