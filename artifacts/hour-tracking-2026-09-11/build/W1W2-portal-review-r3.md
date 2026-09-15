# W1W2-portal — adversarial review, round 3

**clean = false** (0 blocker · 5 major · 19 minor · 15 note)

Reviewer: separate context from the implementer and from rounds 1 and 2.
Branch `hour-tracking/portal` @ `4ed047205` against `origin/hour-tracking/integration`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review:

```
4ed047205 fix(time): a figure waits for its answer, and the repair refreshed what it repaired
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full: plan-v2 §0, §2 (W1 portal files), §3 (W2 portal files); `W1W2-portal-impl.md`;
`W1W2-portal-review-r2.md`; `W1W2-portal-fix-r2.md`; the complete current text of
`hours-ledger.tsx` (1573 lines), `studio-rate-rows.tsx`, `authority-hours.ts`,
`open-hours-scope.ts`, `document-events.ts`, `desk-contents.tsx`,
`hours-ledger-scope.test.tsx`, `studio-rate-rows.test.tsx`, `hours.spec.ts`,
`playwright.hours.config.ts`, `use-studio-member-rates.ts`, plus the diff of every other
touched file; and the shipped SQL the UI leans on (`00604`, `00606`, `00607`, `00615`) to
ground the claims below.

## Round-2 disposition — measured, not taken on report

| Round-2 finding | `W1W2-portal-fix-r2.md` says | Measured now |
|---|---|---|
| **R2-01** stamp did not refresh its own fact | FIXED | **Genuinely fixed.** `use-time-tracking.ts:929-934` adds `['document-hours-project-studio', projectId]` and `['document-hours-pending-authorization']`. Pinned twice (the hook's own 3-case vitest spec + the consumer case *"flips the priced-by line when the stamp resolves"*, which drives the real invalidation through a real `QueryClient`). |
| **R2-02** three money readouts printed a figure before the read answered | FIXED | **Genuinely fixed.** `ScopeRollup` (`:1014-1032`, `:1065`), `ScopeEntries` (`:1208-1214`), `MemberProjectTotal` (`:1140-1160`). On error `ScopeRollup` renders **no total at all**. Pinned by four new cases whose mocks now carry a real `ready\|pending\|error` settle state — which is why they could not have passed before. `Reading…` reuses the sheet's existing word; no spinner, no motion. |
| **R2-03** HT-35 absent | NOT FIXED — descoped | **Still absent, still a major.** See M-01. |
| **R2-04** e2e never executed | FIXED — run, green | **Accepted on the implementer's evidence, not re-run** (see §4). The derived config and the spec are sound on reading; two real environment defects were found and survived honestly (the inert `<dialog>`, the hardcoded port/stack). |
| **R2-05** onboarding article + Sanity push | BLOCKED | **Still absent, still a major.** See M-02. |
| **n1, n2, n4, n5, n6, n8, n9, n10, n11, n12, R2-06…R2-13** (18 minors) | not addressed | **All eighteen re-measured against the current file and still stand.** Each is re-listed below marked `CARRIED ×2` so this report is self-contained. |

Three findings change grade this round, with the reason stated: **n9's truncation half → major**
(M-04), **R2-07 → major** (M-05). One new major arises (M-03). Four new minors/notes arise.

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0                                                                   PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output)                                                              PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx
Test Suites: 6 passed, 6 total
Tests:       65 passed, 65 total                                         PASS

$ pnpm --dir .../agent-portal --filter @patina/supabase test -- \
    src/hooks/__tests__/use-time-tracking.test.ts \
    src/hooks/__tests__/use-studio-member-rates.test.ts
 ✓ src/hooks/__tests__/use-time-tracking.test.ts       (3 tests)
 ✓ src/hooks/__tests__/use-studio-member-rates.test.ts (7 tests)
 Test Files  2 passed (2)   Tests  10 passed (10)                        PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test      (full sweep)
Test Suites: 575 passed, 575 total
Tests:       7286 passed, 7286 total
Snapshots:   1 passed, 1 total                                           PASS
  — round 2's SIGSEGV on draw-schedule-editor.test.tsx did NOT reproduce;
    the sweep is green end to end this round (round-2 note t9 closes as noise).

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 203 problems (0 errors, 203 warnings)
EXIT=0                                                                   PASS (0 errors)
  — the only two warnings on any file in this diff are still
    desk-contents.tsx:87 and :93, "Unused eslint-disable directive"       (n4, CARRIED ×2)

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build
✓ Compiled successfully in 18.0s
✓ Generating static pages using 13 workers (137/137) in 394ms            PASS
```

Every gate in the brief's list is green. The DB was **not** reset (this stage does not own
it); no `supabase/tests/**` were run; the e2e suite was **not** re-run (§4).

### Commit hygiene — clean

`git diff --name-only origin/hour-tracking/integration..hour-tracking/portal` → **25 paths**:
21 under `apps/designer-portal` (including `e2e/document/hours.spec.ts` and
`playwright.hours.config.ts`), 2 under `packages/supabase/src/hooks`, 2 docs
(`portal-vs-desk-feature-gap-matrix-v2.md`, `founding-onboarding/copy-deck.md`).
`git diff --name-only … -- supabase/` is **empty** — no migration, so no
`generate-legacy-grants.py` and no `database.types.ts` regeneration is owed.
`git ls-files -v | grep '^S'` → `S supabase/config.toml` (still skip-worktree'd, never
staged). No `.env.local`, no `artifacts/`, no `next-env.d.ts` (dirty in the worktree,
correctly left unstaged), no stray path. Subjects: `feat(time):` ×2, `fix(time):` ×2 —
Conventional Commits, hook-safe, no `merge(…)`.

### Mock-fallback check — cannot mask a broken query

`grep -E '^\+.*withMockData|mock-data'` over the diff → **zero hits**. I also chased the
indirect routes round 2 did not: `grep -rln withMockData packages/supabase/src` → **none**
(the helper is designer-portal-local), and `apps/designer-portal/src/hooks/use-commercial-documents.ts`
— the one app-local hook the sheet consumes (`useProjectBillingAuthority`) — contains no
`withMockData` either. So every read on this surface rethrows, and
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE` cannot substitute plausible numbers for a denied
query anywhere in the sheet. Round 2's caveat that "the sheet's own zero-rendering defeats
half of what that check buys" is **now closed** by the R2-02 fix.

### Ruling spot-checks that PASSED (each verified against the file, not assumed)

- **P-5, no flag.** `grep -E '^\+.*(useFeatureFlag|ComingSoon|isFeatureEnabled)'` → zero.
- **R69, no per-second motion.** `grep -E '^\+.*(setInterval|requestAnimationFrame|animate-|transition-all|animation:)'` → zero. `Reading…` is a static word, not a spinner.
- **D4, zero shadows; no new hex literal.** `grep -E '^\+.*shadow'` → zero; `grep -E '^\+.*#[0-9a-fA-F]{3,6}\b'` → zero.
- **No dashboard, no tab bar, no badge, no red/green.** The lens is `scope-lens.tsx`'s two-word Scored-Ink idiom generalised to four — `role="group" aria-label="Hours scope"`, `aria-current`, `da-score-on`/`da-score-hover`, `min-h-11` (`hours-ledger.tsx:560-588`). No route, no page, no `/hours`, no tabs. Error text is `--color-terracotta-ink` (a state pigment), not a red/green pair.
- **HT-40.** Both billing-state chips are 1px-bordered text pills, no fill, pearl/sage only (`:1285-1297`, `:1477-1489`) — "the chip stays as built", exactly as plan §3 asks.
- **HT-36, at the type level.** `studio_hours_rollup`'s `RETURNS TABLE` carries no `notes`; `TimeEntryLedgerRow` (`use-time-tracking.ts:711-740`) carries none. `ScopeEntryNote` (`hours-ledger.tsx:1316-1339`) is the only reader of `notes`, it reads **the table**, one entry at a time, behind an explicit act, and the spec asserts no free text is on the sheet before that act.
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance` is total: four arms, each carrying a non-empty `label`, `null` unreachable (`authority-hours.ts:125-152`). Both row renderers print `provenance.label` unconditionally (`:1269-1271`, `:1427-1429`). Four cases in `authority-hours.test.ts` pin it.
- **The "rate pending" doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin` (`:1538`); `PendingTimeAuthorizationBand`'s `Studio rates →` door is `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:618`); `PricingStudioLine`'s stamp is `!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId` (`:925`).
- **HT-8 — the lens is unreachable for a plain member; admins get aggregates.** `viewerIsOwnerOrAdmin &&` gates the lens (`:560`); `ScopeRollup` needs `viewerIsOwnerOrAdmin && viewerStudio` (`:660`); the person-profile door carries the same gate (`person-profile.tsx:805-817`, `:836-842`) and is pinned absent for a member by a new `person-profile.test.tsx` case; a non-admin is forced back to `'mine'` by the `:461-465` effect. The `admin` branch is code-correct but **untested** (t5).
- **HT-9.** The project scope's fact-view read passes `userId: null` (`:712`) — the `.eq('user_id', …)` AND is gone. Pinned (`projectRead` asserted `{projectId, userId: null}`).
- **HT-10-a.** `MemberProjectTotal` → `useProjectHoursTotal` → the DEFINER `project_hours_total`, rendered for `lensProjectId && orgs && !viewerIsOwnerOrAdmin` (`:649`). Pinned twice.
- **HT-30.** In every scope the grand total precedes its buckets, and the buckets precede the entries. Pinned by ordering.
- **HT-41 — role chip only for multi-role members.** The role segment is absent from **both** row renderers and pinned absent. Plan §4 (W3) owns the multi-role chip; plan §2's W1 row does not ask for it. Correct scoping; `timeRateRoleLabel` survives for W3 (t6).
- **HT-3 — the rate card writes `created_by` = the caller and refuses non-admins.** `useSetStudioMemberRate` stamps `created_by: userId` from `auth.getUser()` (`use-studio-member-rates.ts:96-109`) — what `studio_member_rates_admin_insert`'s `WITH CHECK (… AND created_by = auth.uid())` requires. The section is behind the page's own `canManage = myRole === 'owner' || 'admin'` (`account-studio-page.tsx:299`, used at `:1597`), with RLS as the real gate.
- **HT-3-e(2).** `selfAuthoredInert={m.user_id === user?.id && myRole !== 'owner'}` (`:1636-1639`). The copy branches on the row's actual `created_by` and treats `created_by IS NULL` as a deleted author (which `00615` still prices) rather than self-authorship. Correct against `00615`.
- **Data access.** `grep -E '^\+.*[^a-zA-Z]fetch\('` over the diff → **zero**. No ad-hoc `fetch` to orders/media/projects; no `@patina/api-routes` need on this surface. Aggregates and rows come from `@patina/supabase` hooks.
- **Emitter names match the plan exactly.** `document-events.ts` defines `time_entry_logged` (eight props, identical to §2's list), `time_timer_started`, `time_timer_stopped`, `time_entry_adjusted`, `time_entry_deleted`, `time_scope_viewed`, `time_rate_unresolved`, `time_export_taken` — each spelled as plan-v2 spells it (§2:267-268 · §3:417 · §4:550 · §6:725). `time_autostart_disclosed` / `_opted_out` are recorded in the doc comment as owed and deliberately undefined. No inline `posthog.capture` anywhere in the diff.
- **Keyboard / focus.** Every new act is a real `<button>` or `<a>`; `grep` finds no `div onClick` in the diff. `DocumentAction`'s base carries `min-h-[44px] min-w-[44px]`; the lens carries `min-h-11`. Every field has a label or `aria-label` (`Hourly rate for …` is both an `sr-only` span and an `aria-label`). Two exceptions remain: n10 (group-by picker) and n11 (no `aria-expanded`), plus new minor **R3-02** (the stamp refusal is not announced).
- **`desk-doorway.tsx`'s alias works end to end.** `'sheet'` is in `DOORWAY_KEYS` (`:85`) **and** read at `:136-137` (`params.get('book') ?? params.get('sheet')`), and the strip-down loop keeps only `KEPT_KEYS`, so `/desk?sheet=hours` opens Hours and the address returns to `/desk`.
- **Lane A's W1 plan items the portal depends on are present.** `CreateTimeEntryInput.rateRole` (`use-time-tracking.ts:353`), the insert builder sending **no** rate (`:367-383`, with the constraint stated in a comment and pinned in `use-time-tracking-authority.test.tsx`), `rate_source`/`rate_role` on the entry type (`:123-125`), `use-studio-member-rates.ts` with the plan's exact query keys and invalidation set (`:47-50`, `:117-122`).

---

## 2 · Findings

### MAJOR

**M-01 — HT-35 is absent in both halves, and the two emitters it owes are undefined.
CARRIED ×2 from R2-03 / M8(a)(b); explicitly descoped, ruling owed.**
*Severity: major (a ruled input of W2 with its own Done-when). Confidence: high —
absence measured against `git diff --name-only`, and the two candidate files re-read.*

Not in the diff: `apps/designer-portal/src/hooks/document-time-provider.tsx` (the one-time
auto-start disclosure band, R83 inline-band pattern) and
`apps/designer-portal/src/components/document/account/account-profile-page.tsx` (the
per-member opt-out, default on, falling back to one-tap manual start). Both are named rows
of plan §3's portal table. `document-events.ts:177-186` now records the descope explicitly
— it names the three columns that do not exist (`user_settings`, `profiles`,
`profiles.help_state` = the help-system's own cache), says plan §3 reserves HT-35 no
migration number and that this program's range is spent, and says it returns as **one**
stage. That is the right place for it and the right wording.

Plan §3's Done-when *"the disclosure band appears once for a fresh member and never again;
the opt-out leaves a one-tap manual start"* remains **unverifiable**. This is openly
descoped, not done.

*Exact fix (orchestrator, not this lane):* rule where the per-member, cross-device,
default-on auto-start preference lives (a new `profiles` column, a new `user_settings` row
shape, or a new table) and release one migration number; then band + opt-out + the two
emitters land as one stage.

**M-02 — the onboarding article edit and its Sanity push are absent; the Done-when that
rests on them cannot be met from this branch. CARRIED ×2 from R2-05 / M8(d); blocked.**
*Severity: major (a plan §3 item missing). Confidence: high — re-measured in both checkouts.*

`artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
(the two studio-scope sentences the sheet now makes true) plus the Sanity push. The file is
**untracked** — present only in the main checkout's working tree, gitignored nowhere — so
it does not exist in this worktree and cannot land as a commit on this branch; copying it
in would import another program's untracked artifact tree, the exact landmine the
git-hygiene rule names. The Sanity push is an external mutation with no session
authorization. Plan §3's Done-when *"the Sanity help article matches what the sheet does"*
is consequently unverified.

*Exact fix (orchestrator):* track that file or name its real home, then the two sentences
are a five-minute stage; authorize the Sanity write separately. Note `:15` ("a designer
**or the studio's first hire** can see … where the week actually went") is the half
HT-8/HT-10 made *false* — a plain member gets no lens and her own rows only — so that
sentence needs rewriting, not just confirming.

**M-03 — in the member scope the total and the rows beneath it cover different row sets:
the rollup is studio-filtered, the entries are not. NEW.**
*Severity: major (a user-visible money defect of exactly the class §0.23 / HT-30 guards,
and the class round 1's M4 fix closed for the project scope only). Confidence: high —
both call sites and `00607`'s own filter read directly.*

`apps/designer-portal/src/components/document/hours-ledger.tsx:682-693` (the rollup) against
`:709-716` (the entries).

- `ScopeRollup` in the member scope receives `studioId={viewerStudio.id}` (`:684`), and
  `00607:93` hard-filters `WHERE ledger.studio_id = p_studio_id`.
- `ScopeEntries` receives `studioId={scope === 'studio' ? (viewerStudio?.id ?? null) : null}`
  (`:710`) — so in the **member** scope it passes `studioId: null` and
  `useTimeEntryLedger` applies **no** studio predicate at all
  (`use-time-tracking.ts:772` — `if (studioId) query = query.eq('studio_id', studioId)`).

So "The entries" under a member's total lists every row RLS lets the caller read for that
`user_id` in the window, while the total above counts only the rows priced by
`viewerStudio`. Two concrete divergences, the first of which is the common case this whole
program is about:

1. **Rows with no pricing studio are listed but not counted.** `00607:143-148` states
   outright that `time_entry_ledger.studio_id` is `project_pricing_studio_id(te.project_id)`,
   *"which is NULL for a …"* project that names none — so every legacy "rate pending" row
   appears in the entries list and is excluded from the total above it. A member with one
   such hour shows, e.g., `90 min` as her week with `90 min + 60 min` of rows beneath.
2. **A second studio's rows are listed but not counted**, for a viewer who is owner/admin of
   more than one `design_studio` (see M-05 — the seeded e2e actor is exactly that).

The project and studio scopes are **not** affected (project: both sides key on the
document's pricing studio after round 1's M4 fix; studio: both key on `viewerStudio.id`).
The member scope is the one that was missed.

*Exact fix:* carry the same studio into the entries read —
`studioId={scope === 'studio' || scope === 'member' ? (viewerStudio?.id ?? null) : null}`
— so the rows beneath a member's total are the rows that produced it; and pin it with a
`hours-ledger-scope.test.tsx` case asserting `ledgerCalls.at(-1)` in the member scope
carries `{ studioId: 'studio-1', userId: 'maria' }` (today it carries `studioId: null`,
which the existing member-scope case does not look at).

**M-04 — house sheet §A4 forbids truncation outright, and the rewritten sheet adds five
`truncate` classes to the lines that carry a person's and a document's name. UPGRADED from
round-2 n9 (graded minor twice); CARRIED ×2 otherwise.**
*Severity: major (an explicit, unambiguous spec prohibition, in new markup, on the surface
this program is rewriting, at the width the plan demands it be walked). Confidence: high —
`docs/design/house-sheet/SPEC.md:169` and the five sites read directly.*

`docs/design/house-sheet/SPEC.md:169` — *"| Truncation | none. `text-overflow: ellipsis`
must not appear. Wrap. |"* (and `:860` repeats **No truncation.** for the row pattern these
lines copy). Against new `truncate` at `hours-ledger.tsx:1076` (rollup bucket label),
`:1101` (internal bucket label), `:1261` (`row.member_name` — the leftmost fact of a scope
entry), `:1264` (the document · day · rate · money meta line) and
`account-studio-page.tsx:1620` (`{name} · {role}` in the Studio rates row).

Why this is no longer conversion debt: `hours-ledger.tsx` changed 868 of its 1573 lines in
this wave — the surface *is* being rewritten, which is the trigger the portal's own
`CLAUDE.md` names ("applied surface by surface as each is touched"); and the consequence is
load-bearing rather than cosmetic, because at 390px — a width plan §3 and the e2e spec both
insist on — the clipped strings are *the member's name* and *the line that carries the rate
and the money*. The e2e spec's green does not catch it: its only width assertion is page
overflow and the lens buttons' 44px.

*Exact fix:* delete `truncate` from those five `className`s (keeping `min-w-0`, which is
what lets a flex child wrap rather than overflow); where a two-line block then grows, let
it. One removal per site, five sites.

The **other half of n9 stays minor** — 21 `text-[11px]` / 6 `text-[12px]` / 3 `text-[12.5px]`
/ 2 `text-[13px]` / 4 `text-[15px]` inline sizes against §A3's *"No inline `font-size`"*
(`SPEC.md:157`), with the two grand totals (`:1018`, `:1144`) rendered as money in the
**body** family at `text-[15px]` rather than on `.t-money` (DM Mono 15px, `tabular-nums` —
defined at `globals.css:2017`, and `SPEC.md:149-153` says *every* ledger figure is
`.t-money`). That half matches the file's pre-existing idiom and fixing it properly means
restyling the whole sheet; see n9 below.

**M-05 — the studio the Hours sheet answers for is guessed from an unordered membership
list, and the studio scope never says which studio it is. UPGRADED from round-2 R2-07
(graded minor); CARRIED ×2 otherwise.**
*Severity: major (a user-visible money defect: a figure captioned only "the studio" whose
subject can differ between page loads). Confidence: high on the code and the absence of an
`ORDER BY`; high on the precondition, because the implementer's own e2e actor meets it.*

`hours-ledger.tsx:180-186` and, duplicated, `person-profile.tsx:806-817`:

```ts
const viewerStudio = orgs?.find((org) => org.type === 'design_studio') ?? orgs?.[0] ?? null;
```

`useOrganizations` (`packages/supabase/src/hooks/use-organizations.ts:150-183`) selects
`organization_members … .eq('user_id', user.id).eq('status','active')` with **no `.order()`
at all** — PostgREST row order is therefore unspecified, so for a viewer with two
`design_studio` memberships *which* studio `find` returns is not stable across loads.

What rides on that guess: the lens gate (`viewerIsOwnerOrAdmin`), the **studio** scope's
rollup key, the **member** scope's rollup key, and the studio the stamp door offers to name
on a legacy document (`viewerStudioId`). Three measurable consequences:

1. A viewer who is a plain `member` of whichever studio comes first but `owner`/`admin` of a
   second loses the lens entirely and is forced to `'mine'`.
2. The studio scope prints `the studio · this week` over a total for one of her studios,
   with **no studio name anywhere in the readout** — so unlike every pre-existing consumer
   of this same idiom (`account-studio-page.tsx:179-180`, which names the studio on the
   page), she cannot tell whose week she is reading, and it can change on refresh. This is
   the part that makes the inherited idiom unsafe on *this* surface.
3. The `orgs[0]` fallback is worse: a viewer with no `design_studio` at all but ownership of
   some other org type is treated as an Hours admin and keyed on a studio that prices
   nothing.

**The green e2e run does not clear this.** `W1W2-portal-fix-r2.md:165-167` records that
`designer@patina.dev` is *"**owner** of two `design_studio` orgs (Leah Hartwell, Local Dev
Studio)"* — so the 5-passed run read a non-deterministically chosen studio. It passed
because the spec asserts no figure.

*Exact fix:* (a) name the studio in the scope caption (`the studio · Leah Mbeki Studio ·
this week`) so the reading is never ambiguous; (b) require the membership explicitly rather
than falling through —
`orgs?.find(o => o.type === 'design_studio' && (o.membership?.role === 'owner' || o.membership?.role === 'admin'))`,
with no `orgs[0]` leg; (c) extract it once (a `useViewerStudio()` app-local hook) — the
duplicated copy in `person-profile.tsx` will otherwise drift; (d) pin (a) and (b) with two
cases: a viewer who is `member` of studio A and `owner` of studio B gets the lens, and the
caption carries a studio name.

### MINOR

**n1 — `MemberProjectTotal` reports any read failure as "you are not on it". CARRIED ×2.**
*Confidence: high.* `hours-ledger.tsx:1124-1130`. `total.isError` is still the single
branch, so a network failure, a 500, a missing RPC or a schema-cache miss all print *"This
document's total is for its team — you are not on it."* and tell a rostered member
something false about her standing.
*Fix:* branch on the error code — the DEFINER function raises `insufficient_privilege`
(`42501`); anything else prints a neutral "this document's total could not be read".

**n2 — the `— internal —` group re-prints buckets the main list already shows, so a reader
summing the two double-counts. CARRIED ×2.**
*Confidence: high (00607's own comment is the evidence).* `hours-ledger.tsx:1090-1111`
renders a second list from `rows.filter(r => r.internal_minutes > 0)` while the main list at
`:1070-1087` renders **all** rows. `00607:151-155` states outright that
`billable_minutes`/`billable_cents` and `internal_minutes` can count the same row.
*Fix:* render the internal group only for buckets that are entirely internal
(`total_minutes === internal_minutes`) and drop those from the main list; or print the
internal figure as a parenthetical on the bucket's own row.

**n4 — two new unused `eslint-disable` directives. CARRIED ×2 (re-measured in this
reviewer's own lint run).**
*Confidence: high.* `desk-contents.tsx:87` and `:93` are the only two lint warnings in the
entire diff: *"Unused eslint-disable directive (no problems were reported from
'@typescript-eslint/no-explicit-any')"*. Lint is 201 → 203.
*Fix:* delete both comment lines.

**n5 — `time_rate_unresolved` always sends `project_kind: null`. CARRIED ×2.**
*Confidence: high.* `hours-ledger.tsx:1377-1382` (`project_kind: null` at `:1380`). Plan
§2:268 names the alarm's props as `project_kind`, `rate_source='none'`, `project_id`;
`project_kind` is the one segmentation asked for and is hard-coded `null` at the only call
site, so every event is indistinguishable.
*Fix:* add `kind` to the week read's embed (`project:projects(name, studio_id, kind)`,
`:164`) and pass it — or drop the prop and say why in the emitter's doc comment.

**n6 — the rate alarm never fires from the scoped rows, i.e. exactly where an admin would
notice unpriced hours. CARRIED ×2.**
*Confidence: high (`grep documentEvents.time.` → 5 call sites, all in the `mine` path:
`:352`, `:381`, `:468`, `:1377`, `:1405`).* `rateUnresolved` is emitted only from `EntryRow`,
which renders under `scope === 'mine'`. `ScopeEntryRow` computes `provenance.kind ===
'pending'` and prints "rate pending" without emitting. Plan §2: *"fired wherever a row
renders or returns with `rate_source='none'`"*.
*Fix:* emit from `ScopeEntryRow` too — the emitter dedups per entry per session
(`document-events.ts:39`, `:239-240`), so the count cannot inflate.

**n8 — `hoursMemberScopePending` can go stale and silently mis-scope a later open. CARRIED ×2.**
*Confidence: medium.* `open-hours-scope.ts:18-29` sets a module value; only `HoursLedger`'s
mount effect clears it (`hours-ledger.tsx:146-149`). `studio-drawer.tsx` keys the sheet on
`setOpenLedger(key)`, so dispatching `document:open-ledger` for a sheet that is **already**
mounted does not remount `HoursLedger` (and `initialContext` is only a `useState`
initialiser) — the click does nothing visible *and* the value survives, so the next mount
silently opens on that stale person. Same outcome if the event is dispatched where
`StudioDrawer` is not listening.
*Fix:* clear `hoursMemberScopePending` inside `openHoursForMember` on a microtask, or carry
the person in the event's `detail.context` and let the drawer pass it through
`sheetContext` the way every other pre-addressed sheet does.

**n9 (inline type steps half) — 36 new inline `font-size` utilities, and the two grand
totals are money in the body family rather than `.t-money`. CARRIED ×2.**
*Confidence: high (counts measured over the diff).* `SPEC.md:157` (*"No inline
`font-size`"*), `:149-153` (*".t-money … every figure aligned to a rule"*) against
`text-[11px]` ×21, `text-[12px]` ×6, `text-[12.5px]` ×3, `text-[13px]` ×2, `text-[15px]` ×4,
with `ScopeRollup:1018` and `MemberProjectTotal:1144` printing money at body `text-[15px]`
and the bucket money at `font-mono text-[11px]`. Matches the file's pre-existing idiom
(conversion debt), unlike the truncation half (M-04).
*Fix (minimum):* put the two grand totals on `.t-money`; leave the rest for a deliberate
house-sheet pass on this surface.

**n10 — the group-by picker misses the 44px target the lens idiom carries. CARRIED ×2.**
*Confidence: high.* `hours-ledger.tsx:1039-1053` — five 11px uppercase words with no
`min-h-11`, unlike the lens at `:577` and its model
`people/directory/scope-lens.tsx:51`; house sheet §A5's `.act` box is `min-height: 44px`.
On a sheet the plan explicitly wants walked at 390px. The e2e spec's 44px loop covers the
**lens** buttons only, so its green cannot catch this.
*Fix:* add `min-h-11` to the five group-by buttons.

**n11 — the two disclosure acts announce no state. CARRIED ×2.**
*Confidence: high.* `grep aria-expanded hours-ledger.tsx` → no hits. "The entries"
(`:699-707`) and the per-row "Note" (`:1298-1306`) toggle content with no `aria-expanded` /
`aria-controls`; a screen-reader user hears the label flip but is not told a region opened.
`DocumentAction` forwards arbitrary `ButtonHTMLAttributes`, so this is one word each.
*Fix:* `aria-expanded={showEntries}` and `aria-expanded={showNote}`.

**n12 — an emptied rate field is discarded in silence and left visibly empty. CARRIED ×2.**
*Confidence: high.* `studio-rate-rows.tsx:76-83`: `rateInputToCents('')` returns `null` and
`save` returns with no error and no write — correct against the `00598` CHECK and the absent
DELETE policy (the old rate stands) — but the uncontrolled `defaultValue` input is left
blank while that rate is still in force, until something remounts it. The dated history
beneath it disagrees with the empty field.
*Fix:* restore `open`'s value into the input on an empty blur, or say in the help line that
clearing a field leaves the last dated rate standing. Neither case is in
`studio-rate-rows.test.tsx` (3 cases, none of them an empty or failed blur).

**R2-06 — a failed read of the document's pricing studio renders nothing and says nothing.
CARRIED ×2 (introduced by the round-1 M1 fix).**
*Confidence: high.* `hours-ledger.tsx:438-442`. `lensPricingStudioId` is `undefined` unless
`lensPricingStudio.isSuccess`, and `isError` still has no arm. So if the `projects.studio_id`
read is denied or fails, the project scope renders **no** `PricingStudioLine` (`:632`
requires `!== undefined`), **no** `ScopeRollup` (`:662` requires it truthy) and **no** "no
studio prices this document" sentence (`:675` requires it `=== null`) — the owner sees the
entries act alone, with no indication anything failed. The tri-state is right; the fourth
state is unhandled. (Note the R2-02 fix made every *other* unanswered money read say so,
which makes this silence the odd one out.)
*Fix:* add `lensPricingStudio.isError` → a neutral "which studio prices this document could
not be read" in place of the line, rollup still suppressed.

**R2-08 — the forced-scope belt leaks a spurious `time_scope_viewed{scope:'project'}` for
every plain member who arrives with a document in hand, and does nothing at all if
`useOrganizations` errors. CARRIED ×2 (introduced by the round-1 M3/M5 fix).**
*Confidence: high for the telemetry leg, medium for the error leg.* `hours-ledger.tsx:136-142`
(`scope` initialises to `'project'` whenever `initialContext.projectId` is present),
`:461-465` (the belt, an effect that only fires once `orgs` resolves), `:467-472` (the
emitter, keyed on `[scope, groupBy]`). For a plain member: first paint emits
`time_scope_viewed {scope:'project', group_by:'member'}`, the belt flips her to `'mine'`, a
second event fires — so the HT-27 instrument records project-scope reads by members who
never saw one. If `useOrganizations` **errors**, `orgs` stays `undefined`, the belt never
runs, and she is left in `'project'` scope with no lens, no rollup, no front matter and no
rows — M3/M5's dead end restored under a failed read, with the "The entries" act (gated only
on `scope !== 'mine'`, `:697`) as the one thing on screen. In the happy path that act's
brief flash is the visible symptom.
*Fix:* hold `scope` as `null` until `orgs` settles and derive the landing once (treating an
errored `useOrganizations` as "no lens", i.e. `'mine'`), and move the `scopeViewed` emit
behind that settle so one open emits one event.

**R2-09 — a failed rate save leaves the typed, unsaved number standing in the field beside
its error. CARRIED ×2.**
*Confidence: high.* `studio-rate-rows.tsx:126-143`. The input is uncontrolled
(`defaultValue`), so after `setRate`'s `onError` fires the field still shows what the owner
typed while the dated history beneath shows the rate actually in force. The two disagree
with nothing saying which is real.
*Fix:* on error, reset the input to `open ? dollars(open.hourly_rate_cents) : ''` (a ref, or
make the field controlled).

**R2-10 — "this document · all time" stands above "mine · this week", so the total never has
the rows that produced it beneath it. CARRIED ×2.**
*Confidence: medium.* `hours-ledger.tsx:649-651` renders `MemberProjectTotal` for any viewer
with `lensProjectId` and no lens; her rows below are the week's own `EntryRow` list, scoped
to her (`:165`). The figure is the document's all-time **team** total; the rows are her own
seven days. §0.23 / HT-30 is satisfied in letter and not in substance — those rows cannot
add up to that total, and where she logged nothing this week the total stands above
"Nothing logged this week."
*Fix:* caption the figure with what it is and what the rows are (e.g. *"this document · all
time, for its whole team — below, your own week"*). A copy change, but a deliberate one.

**R2-11 — the studio member rate is dated in UTC, so an evening save in a US timezone is
stamped tomorrow. CARRIED ×2 (lane A's file, this lane's surface).**
*Confidence: high.* `packages/supabase/src/hooks/use-studio-member-rates.ts:52` —
`todayISODate = () => new Date().toISOString().slice(0,10)` — and `StudioRateRows` never
passes `effectiveFrom`, so every save through the card uses it. After ~17:00 PT the stamp is
tomorrow's date, `00598`'s BEFORE INSERT trigger closes the prior row at
`NEW.effective_from - 1` = today, and tonight's hours resolve against the **old** rate (or
`'none'` where there was no prior row) while the card's history prints a row dated tomorrow.
`StudioRateRows`'s own `fmtDate` parses at local midnight, so the two disagree on screen.
*Fix:* build the date from local parts (the ledger already has `isoDate()` at
`hours-ledger.tsx:90-93`), or let the server default it.

**R2-12 — "a timer is still running from yesterday" says yesterday for any earlier day.
CARRIED ×2.**
*Confidence: high.* `desk-contents.tsx:104-123`: the branch is `timer && !startedToday`, so
a timer opened three days ago reads "from yesterday". On the Desk's one act-bearing line
that is a small lie about the studio's own clock.
*Fix:* render the day (`fmtDay(timer.started_at)`) or say "from an earlier day".

**R2-13 — the Studio rates section's own gate is unpinned, and an unresolved `useAuth()`
briefly offers the acting admin the inert field. CARRIED ×2.**
*Confidence: medium.* `account-studio-page.tsx:1597` (`canManage &&`) and `:1636-1639`
(`m.user_id === user?.id && myRole !== 'owner'`). `account-studio-page.test.tsx`'s diff is
**three stub lines only** (`useStudioMemberRates` / `useSetStudioMemberRate` factories) —
nothing asserts the section is absent for a plain `member` or present for `owner`/`admin`,
and `studio-rate-rows.test.tsx` tests the component in isolation with `selfAuthoredInert`
passed by hand. Separately, while `useAuth()`'s `user` is undefined, `m.user_id ===
undefined` is false for every row, so the acting admin's own row shows the writable field
until it resolves.
*Fix:* two page-level cases (member → no "Studio rates" heading; admin → heading present and
her own row shows the sentence, not the field), and gate the section's render on `user`
being resolved.

**R3-01 — the member scope's entries are unbounded by studio, which is also a read the
`enabled` guard does not cover. NEW (the latent half of t4, now live).**
*Confidence: medium-high.* `use-time-tracking.ts:758-782` — `useTimeEntryLedger` has no
`enabled` guard, unlike its two siblings (`useStudioHoursRollup`'s
`enabled: Boolean(studioId)` at `:826`, `useProjectHoursTotal`'s at `:860`). Round 2 graded
this latent because the sheet "always mounts it with at least one filter". With M-03 in
hand that is now only true by accident: in the **member** scope the call is
`{studioId: null, userId: <member>, projectId: null}` — one filter, on a view the caller may
read broadly — and in the **studio** scope a viewer with no org would pass all three null
and select the whole fact view for the window.
*Fix:* `enabled: Boolean(studioId || userId || projectId)` on `useTimeEntryLedger` (lane A's
file; one line), independent of M-03's fix.

**R3-02 — the one message that carries the server's refusal is not announced, while every
other error on the sheet is. NEW.**
*Confidence: high.* `hours-ledger.tsx:952` (`PricingStudioLine`'s `note` — a bare `<span>`)
and `:1563-1569` (`EntryRow`'s `rowNote` — a bare `<p>`). Both render
`stamp_project_pricing_studio`'s refusal text verbatim, which is the HT-3-g door's entire
point (`42501`, "a studio prices this project's hours only from inside the tier that EMPLOYS
its designer…"). Neither carries `role="alert"`, while `ScopeRollup`'s error (`:1058`),
`ScopeEntries`' error (`:1198`) and `StudioRateRows`' error (`studio-rate-rows.tsx:148`) all
do. A screen-reader user presses the door and is told nothing.
*Fix:* `role="alert"` on both (the sheet's own top-level `note` at `:767-773` is
pre-existing and wants the same treatment).

**R3-03 — the two "Studio rates" doors are bare `<a href>`, so they full-page-reload the
Desk out from under an open document. NEW.**
*Confidence: medium (the navigation is correct; the cost is a reload).*
`hours-ledger.tsx:1554-1559` ("Set the studio rate →") and
`pending-time-authorization-band.tsx:66-72` ("Studio rates →") use
`<a href="/desk?account=studio">`. In the App Router a bare anchor is a document
navigation, not a client transition, so the whole Desk — and whatever document was in hand
beneath the sheet — is torn down and rebuilt. `desk-doorway.tsx` does handle the param on
arrival, so the destination is right.
*Fix:* `next/link`, or the account sheet's own opener if one exists, so the transition is
client-side.

### NOTE

**t1 — ruling owed: HT-29's "act-bearing or absent" shipped as "the row always, the act
sometimes". CARRIED ×2.** `desk-contents.tsx:351` hangs `HoursInHandAct` beneath an Hours
doorway row that still renders unconditionally. Plan §3 reads *"the `hours: 'time in hand'`
card stays **act-bearing or absent**"*. Removing the row would make the Hours sheet
unreachable from the Contents index, so the gap is Kody's question. The impl report's
judgment call #1 covers the *figure* half correctly (R95 forbids a count there) and not the
*absent* half.

**t2 — HT-11 is unsatisfied in two files this lane edited; plan §4 assigns it to W3.
CARRIED ×2.** The ledger's batch-add row (`hours-ledger.tsx:834-883`) is a capture surface
with no `billable` control, and `useCreateTimeEntry` still writes `billable: input.billable
?? true` (`use-time-tracking.ts:376`). HT-11 ruled "yes to both"; plan-v2:467 lists HT-11
among **W3's** ruled inputs and :529 makes `p_billable = NULL` raise once every surface
carries the control. An ownership note, not a defect of this lane.

**t3 — new raw-PostgREST reads inside components. CARRIED ×2.** `ScopeEntryNote`
(`hours-ledger.tsx:1316-1339`) and `HoursInHandAct` (`desk-contents.tsx:82-100`) each build a
browser client and query a table directly rather than through a `@patina/supabase` hook.
`hours-ledger.tsx` already carried five such reads (it is the file's idiom), but
`desk-contents.tsx` had **none** before this commit and now owns one plus the
`QueryClientProvider` its suite had to grow. Production is fine (the Desk sits under the
`(document)` group, which provides the client).
*Optional fix:* `useTimeEntryNote(entryId)` and `useStudioUnbilledTime()` in
`packages/supabase`.

**t5 — the spec's coverage gaps. CARRIED ×2, one newly sharpened.**
`hours-ledger-scope.test.tsx` now runs **17** cases and covers `owner` and `member`;
**`admin` is still untested**, though plan §3's assertion is *"absent for a plain `member`,
present for `owner`/`admin`"* (`viewerRole` is only ever set to `'owner'` or `'member'`).
Still unpinned: (a) "rate pending" rendering **in the sheet** rather than only in
`timeRateProvenance`'s unit spec, (b) the rate-pending doorway's owner/admin gate, (c) the
stamp door's absence for a non-admin, and (d) — new this round — the member scope's own
`ledgerCalls` shape, which is why M-03 went unseen. The HT-30 case still leans on
`text.indexOf('3h 00m')` matching the grand total before the bucket row that carries the
same string, so it passes on ordering as much as on structure.

**t6 — `timeRateRoleLabel` is a dead export in production code. CARRIED ×2.**
`grep timeRateRoleLabel apps/designer-portal/src` → the definition
(`authority-hours.ts:101-105`) and its test, nothing else. Deliberate (W3 needs it);
recorded so nobody "cleans it up" first.

**t7 — deviation, ratification owed: the copy deck documents the alias instead of being
rewritten. CARRIED ×2; the evidence re-verified this round and it holds.** Plan §3 says
rewrite `?sheet=hours` → `?book=hours` at `copy-deck.md:357,379,627`. The lane instead added
a Conventions bullet naming both spellings and telling the next hand not to "correct" them
without reseeding the templates. I confirmed every cited artifact myself:
`packages/email/src/templates/onboarding-hours.tsx:37` carries
`href="{{app_url}}/desk?sheet=hours"`, and so do the baked HTML bodies in
`supabase/migrations/00293_seed_designer_onboarding_templates.sql:167`,
`00310_reseed_onboarding_templates_branded.sql:299` and
`00404_rebake_onboarding_email_templates_td_padding.sql:333`. The three live `?sheet=hours`
strings remain in the deck at `:365`, `:387`, `:635`. The Done-when ("the copy deck no
longer disagrees with the code") is satisfied by the code now accepting both. Sound
reasoning, real evidence, still a deviation from a plan line — the orchestrator's word is
wanted.

**t8 — architect choice already flagged by the plan, re-confirmed: the rate card lives on
`account-studio-page.tsx` (`/desk?account=studio`), not `/preferences` and not the People
Room. CARRIED ×2.** Plan §2 makes this choice explicitly against HT-3's parenthetical and
asks it be flagged. Implemented as planned.

**t9 — round 2's unrelated SIGSEGV did not reproduce. CLOSED.**
`src/components/document/commercial/trade/draw-schedule-editor.test.tsx` passes inside the
full sweep this round; 575/575 suites, 7286/7286 tests. Environment noise, as round 2
judged.

**t10 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call site.
CARRIED ×2.** `grep documentEvents.time.` → five call sites, none of them these three.
Plan-v2 owns all three names in later waves of this program (`time_timer_started` /
`time_timer_stopped` at §4:550, `time_export_taken` at §6:725) and this lane is the file's
sole writer for the phase, so landing the vocabulary early is the cheaper ordering. Worth
repeating: the `Export week → Accounts` button in this very file is **not** that event's
call site — it opens the composer, it does not hand hours out as a file — so W5 must add
its own.

**t11 — the `lensWords.length > 1` guard is dead. NEW.** `hours-ledger.tsx:560`.
`lensWords` always contains `'mine'` and `'studio'` (`:448-453`), so the length test is
always true and the lens's visibility rests on `viewerIsOwnerOrAdmin` alone. Harmless;
recorded so a later reader does not mistake it for a real two-word floor.

**t12 — `rateUnresolvedSeen` never clears. NEW.** `document-events.ts:39`. A module-level
`Set<string>` keyed on `entry_id`, with no eviction — so the dedup is per module lifetime,
not per session in any bounded sense, and an hour that stays unpriced is reported once and
never again even across sheet opens. That is what the doc comment promises; the unbounded
growth is negligible (one short string per unpriced entry seen).

**t13 — `playwright.hours.config.ts` assumes `base.projects[0]` is chromium. NEW.**
`playwright.hours.config.ts:79` — `projects: [{ name: 'chromium', use: { ...base.projects?.[0]?.use } }]`.
If the base config's project order ever changes, this file silently labels another browser's
`use` block "chromium". The file is otherwise careful and correct: no literal key, a
loopback-only guard, a "keys required with the URL" guard, and defaults identical to the
base. Its reason for existing (the secret-scan trap on `playwright.config.ts`) is the
documented one.
*Optional fix:* `base.projects?.find(p => p.name === 'chromium')`.

**t14 — BIL-08's reopened "rate-display drift" is a real two-answer defect the lane
documented rather than fixed. NEW (as a note — the plan item itself is satisfied).**
Plan §3 asks that BIL-08 be reopened "as the rate-display drift, not as absence", and the
matrix entry now says exactly that. The underlying fact: `EntryRow` computes
`amountCents = e.rated_amount_cents ?? unbilled?.amount_cents ?? 0`
(`hours-ledger.tsx:1369`) while the invoice composer reads
`project_unbilled_time.amount_cents` — so on a legacy row the sheet can print one figure and
the invoice bill another. W0's `00596` ("one rate source") is where that closes, and HT-6-a
is the owed ruling. Recorded here so the drift is not lost in a doc cell.

**t15 — the `['studio-member-rate', userId]` entity key has no reader. NEW.**
`use-studio-member-rates.ts:49` defines it and `:119` invalidates it, but nothing queries
it (`grep studioMemberRateKeys.entity` → the definition and the invalidation). Plan §2:252
specifies both keys, so this is the plan's shape faithfully implemented; noted so a later
hand knows the entity read was never built rather than assuming it exists.

---

## 3 · Plan-item ledger (W1 + W2 portal tables)

| Plan item | Status |
|---|---|
| §2 · `use-time-tracking.ts` — `rate_source`/`rate_role` on the type, `rateRole?` on `CreateTimeEntryInput`, no rate sent + asserted | **present** (lane A) |
| §2 · `use-studio-member-rates.ts` create, keys + invalidation set | **present** (lane A), keys exactly as specified |
| §2 · `hooks/index.ts` + package index export | **present** |
| §2 · `account-studio-page.tsx` — "Studio rates" section, blur-save, owner/admin only, dated history | **present**; gate untested (R2-13) |
| §2 · `studio-rate-rows.tsx` create | **present**; n12 / R2-09 open |
| §2 · `hours-ledger.tsx` — rate + rate-source column, "rate pending", never blank | **present** |
| §2 · `authority-hours.ts` — `timeRateProvenance` never `null`, discriminated, carries source + role | **present**, 4 new unit cases |
| §2 · `pending-time-authorization-band.tsx` + the `pending_authorization` read become a doorway | **present** |
| §2 · PostHog `time_entry_logged` / `time_rate_unresolved` | **present**; n5 (`project_kind` null), n6 (not fired from scoped rows) |
| §3 · `hours-ledger.tsx` — the four-scope lens, absent for non-admins, no `user_id` AND on the project path, totals above rows, studio money, `— internal —` group, chip unchanged | **present**; M-03, n2, R2-06, R2-08, R2-10 open |
| §3 · `use-time-tracking.ts` — `useStudioTimeReport` deleted, `useStudioHoursRollup` + `useTimeEntryLedger` added | **present** (lane A); R3-01 open |
| §3 · `person-profile.tsx` — an "Hours" act, the only door to the member scope | **present**, gated, pinned both ways |
| §3 · `desk-contents.tsx` — the Hours line act-bearing or absent | **present**; t1 (ruling), R2-12 open |
| §3 · `document-time-provider.tsx` — HT-35 disclosure band | **ABSENT** (M-01) |
| §3 · `account-profile-page.tsx` — HT-35 opt-out | **ABSENT** (M-01) |
| §3 · `desk-doorway.tsx` — `sheet` as an alias of `book` | **present**, end to end |
| §3 · `copy-deck.md:357,379,627` | **deviation** — documented, not rewritten (t7) |
| §3 · `15-hours.md:9,15` + the Sanity push | **ABSENT / BLOCKED** (M-02) |
| §3 · `portal-vs-desk-feature-gap-matrix-v2.md:189,193` — BIL-04 closed, BIL-08 reopened as drift | **present** (t14) |
| §3 · `hours-ledger-scope.test.tsx` (new) | **present**, 17 cases; t5 gaps |
| §3 · `e2e/document/hours.spec.ts` (new) | **present**, 128 lines; run green per fix-r2, not re-run here (§4) |

---

## 4 · What this review did NOT verify

- **No `supabase db reset`, no SQL test run.** This stage does not own the DB. Lane A's
  coverage of `00598`–`00607` / `00615` / `00620` is taken as given; the SQL (`00604`'s
  shape, `00606`'s narrowing, `00607`'s `WHERE ledger.studio_id = p_studio_id` at `:93` and
  its own double-count warning at `:151-155`) was **read** to ground the UI claims, not
  executed. No `psql` probe was made, so no row-level claim here rests on a SELECT.
- **The e2e suite was not re-run.** It is not in this round's gate list, port 3000 is
  contended with the peer people-room program, and a run needs this program's own stack
  plus the `npx playwright test --config=…` invocation (the npm script's `--` swallows
  `--config`, as fix-r2 documents). `W1W2-portal-fix-r2.md`'s *5 passed (1.5m), chromium,
  :3100 against 127.0.0.1:54421* is **accepted on the implementer's evidence**, and I read
  the spec and the derived config to judge them sound. Two caveats of that green stand:
  only chromium (firefox/webkit skipped by design), and the 44px loop covers the **lens**
  buttons only — which is why n10 survives and why M-04's clipping survives.
- **No browser walk, no screenshots, no live-mode render by this reviewer.** The only
  runtime evidence for this wave remains the implementer's SELECT walk
  (`W1W2-portal-impl.md` §3) and the e2e run above; neither was re-executed here.
- **`packages/supabase` lint not run**, and per `patina-verification` no resolvable ESLint
  flat config exists outside designer-portal, so its result would mean nothing.
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff touches
  them; `@patina/supabase type-check` and the admin build (the repo's strictest gate) both
  pass. Round 1's note stands that `client-portal`'s type-check is red in this worktree for
  an unrelated dist-resolution reason, and fix-r2 records `client-portal lint` as having 10
  standing errors on `main`-level code — both outside this branch.
- **The 201 pre-existing lint warnings were not audited** — only the two-warning delta was
  attributed (n4).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event *names* were checked against plan-v2's text and the
  module source; no ingest, dashboard or property schema was verified.
- **`00620`'s legacy studio stamp was not exercised.** The impl report records the owner's
  own stamp being refused `42501` on the isolated stack; I did not re-run it, so the repair
  door's happy path is unobserved by this reviewer (its failure path is the one the UI
  prints, and R3-02 is about how).
