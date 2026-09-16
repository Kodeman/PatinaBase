# W1W2-portal — adversarial review, round 7

**clean = false** (0 blocker · 1 major · 9 minor · 21 note)

Reviewer: a separate context from the implementer and from rounds 1–6.
Branch `hour-tracking/portal` @ `e17fa6475` against `origin/hour-tracking/integration`
@ `04b579bbd` (unmoved since r6), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

Commits under review (**eight** — r6's seven plus the r6 fix):

```
e17fa6475 fix(time): the week's own figures belong to the week's own scope
c68c16d8e fix(time): the scopes keep only what is theirs — a guard, a chip, a door and an invalidation
3e87ff57f fix(time): three reads the sheet owned inline become three hooks
0b7a43c62 fix(time): the rows under a total are the rows that made it, and the studio says its name
4ed047205 fix(time): a figure waits for its answer, and the repair refreshes what it repaired
ff2065ed6 fix(time): the Hours sheet reads the document, not the holder's own week
2c83cb4d3 feat(time): W2 UI — four scopes in one sheet, and the studio's hours said plainly
29b72c644 feat(time): W1 portal — the studio rate card, and an hour that says what it is worth
```

Read in full this round: plan-v2 §0 (all 25 rules + the HT-10-a amendment), §2 (W1: amendments,
migrations, RPC signature, RLS, **portal files**, PostHog, tests, gates, Done-when), §3 (W2: same);
`W1W2-portal-impl.md`; `W1W2-portal-review-r6.md`; `W1W2-portal-fix-r6.md`; the complete current
text of `hours-ledger.tsx` (1772 lines), `studio-rate-rows.tsx`, `use-viewer-studio.ts`,
`open-hours-scope.ts`, `authority-hours.ts`, `use-studio-member-rates.ts`,
`document-events.ts`'s `time` namespace, `use-time-tracking.ts`'s key factory + the seven
new/changed hooks, `playwright.hours.config.ts`, `e2e/document/hours.spec.ts`,
`hours-ledger-scope.test.tsx` (31 cases); the full three-dot diff of all 28 files;
`docs/design/house-sheet/SPEC.md` §A3/§A4/**§A5** against the live `.t-*` and `.da-act` rules in
`globals.css`.

> **Diff basis.** Three-dot `integration...portal` — **28 files, +3719/−71**, no path under
> `supabase/`, `.env` or `artifacts/`. Two-dot shows `00610`–`00613` etc. as deletions; they are
> not — integration is four commits ahead of the merge base (`a9841c8de`). `git merge-tree` on the
> merge base → **0 conflict markers**, and integration's four commits touch no file this branch
> touches except `packages/supabase/src/database.types.ts` (no textual overlap).

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(no output)                                                       EXIT=0  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output)                                                       EXIT=0  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/components/document/account/__tests__/studio-rate-rows.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx \
    src/components/document/people/__tests__/person-profile.test.tsx \
    src/components/document/__tests__/desk-contents.test.tsx
PASS src/components/document/account/__tests__/studio-rate-rows.test.tsx
PASS src/lib/document/__tests__/authority-hours.test.ts
PASS src/components/document/people/__tests__/person-profile.test.tsx
PASS src/components/document/account/__tests__/account-studio-page.test.tsx
PASS src/components/document/__tests__/hours-ledger-scope.test.tsx
PASS src/components/document/__tests__/desk-contents.test.tsx
Test Suites: 6 passed, 6 total
Tests:       86 passed, 86 total                                  EXIT=0  PASS
  — the plan's named W1 spec (§2 `authority-hours.test.ts`) and W2 spec
    (§3 `hours-ledger-scope.test.tsx`, 31 cases) are both in this set. 85 → 86 since r6.

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 201 problems (0 errors, 201 warnings)                           EXIT=0  PASS (0 errors)
  — unchanged from r6; the diff contributes zero warnings.

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build   (the repo's strictest gate)
✓ Compiled successfully
✓ Generating static pages (137/137)                               EXIT=0  PASS
```

Run beyond the brief's list, for collateral:

```
$ pnpm --dir .../agent-portal --filter @patina/designer-portal test          (FULL sweep)
Test Suites: 575 passed, 575 total
Tests:       7307 passed, 7307 total                              EXIT=0  PASS
  — r6's SIGSEGV in document-time-provider.test.tsx did NOT recur.

$ pnpm --dir .../agent-portal --filter @patina/supabase test                 (vitest)
Test Files  102 passed (102)
Tests  1255 passed | 12 skipped (1267)                            EXIT=0  PASS

POST-MERGE TYPE GATE (integration's database.types.ts swapped in, then restored):
  @patina/supabase type-check          EXIT=0  PASS
  @patina/designer-portal type-check   EXIT=0  PASS
  — this matters because W4's 00610 makes `project_time_entries.project_id` nullable.
    Nothing in the branch breaks on it. Working tree restored (`git checkout --`).
```

The DB was **not** reset and no `supabase/tests/**` ran, per the brief.

### Commit hygiene — clean

Eight commits: `feat(time):` ×2, `fix(time):` ×6 — Conventional Commits, no `merge(…)`.
`git show --stat` per commit: 12 / 6 / 11 / 7 / 16 / 6 / 5 / 2 files, every path under
`apps/designer-portal`, `packages/supabase/src/hooks`, or the two doc files plan §3 names.
`git diff --name-only … | grep -vE '^(apps|packages|docs)/'` → **empty**, so no migration, no
`generate-legacy-grants.py`, no `db:generate` is owed. `git ls-files -v | grep '^S'` →
`S supabase/config.toml`, still skip-worktree'd and never staged. Working tree carries only the
pre-existing dirty `apps/designer-portal/next-env.d.ts`.

### M5-02 — DISCHARGED, and measured, not read

The brief's check, verified twice: by reading every guard, and by a **throwaway spec** built on the
wave's own harness, run and then deleted (`git status` clean afterwards — only `next-env.d.ts`).

| Element | Guard | Line |
|---|---|---|
| `Export week → Accounts` | `scope === 'mine' &&` | `:585` |
| `PendingTimeAuthorizationBand` | `scope === 'mine' &&` | `:681` |
| all-time unbilled balance + **Bill it** | `scope === 'mine' && unbilledMinutes > 0 &&` | `:829` |
| batch-add row + **Add** | `scope === 'mine' &&` | `:946` |
| `Today ·` / `Week ·` figures (M6-01) | `scope === 'mine' &&` | `:557-564` |
| `LedgerFrontMatter` · zero-entries state · `days.map` | `scope === 'mine' &&` | `:656`, `:885`, `:912` |

The spec covers the **member** scope (all four absent, all four back on `mine`) and the **project**
scope (balance + Bill it absent). My throwaway added the third case the suite does not carry — the
**studio** scope — and it passed: no Export week, no pending band, no `unbilled · all time`, no
**Bill it**, no `Minutes`/`Add`, and no `Week ·` on the week line. The paging (`‹ earlier`) is
deliberately ungated and survives, which is correct — it governs the read window in every scope.

**The project scope shows a total only above its own listed rows.** `ScopeRollup` (`:1130-1248`)
prints the grand total, then the group-by words, then the buckets that produced it, all inside one
`<section>`; the fact-view entries sit one act below. An unanswered rollup says `Reading…` and a
refused one prints **no** total at all, so no figure ever stands without its rows. The only other
project-scope figure, `MemberProjectTotal`, is non-admin-only and labels itself
*"this document · all time, for its whole team"* with *"Below, your own week."* underneath.

### Ruling spot-checks that PASSED — each re-measured on this tree

- **P-5, no flag.** `grep -cE '^\+.*(useFeatureFlag|ComingSoon|isFeatureEnabled)'` over the
  three-dot diff → **0**.
- **R69, no per-second motion.** `grep -cE '^\+.*(setInterval|requestAnimationFrame|animate-|transition-all|animation:)'` → **0**.
- **House sheet §A3, no inline font-size utilities.** `grep -cE '^\+.*text-\[[0-9]'` over
  `apps/` → **0**. Every inline size still in `hours-ledger.tsx` is pre-existing, confirmed
  against `git show integration:…` (the new `scope === 'mine' &&` wrappers deliberately did not
  re-indent their bodies, so the diff is honest about this). §A4: `grep -cE '^\+.*(shadow|#[0-9a-f]{6})'` → **0**.
- **No dashboard, tab, badge, red/green.** No route, no page, no `/hours` tree, no tab bar. The
  lens is `scope-lens.tsx`'s Scored-Ink idiom generalised to four words with `aria-current`. The
  one state pigment is `--color-terracotta-ink` on refusals.
- **HT-26 — never a blank where a rate is pending.** `timeRateProvenance`
  (`authority-hours.ts:117-152`) is total: four arms, each with a non-empty label, `null`
  unreachable. Both row renderers print `provenance.label` unconditionally (`:1439`, `:1615`).
  **Measured, not inferred:** a `rate_source: 'none'` week entry renders the words *"rate pending"*
  in the sheet (throwaway case, passed).
- **The repair doorway is admin-only.** `ratePending && viewerIsOwnerOrAdmin` (`:1746`);
  `PricingStudioLine`'s stamp `!pricingStudioId && viewerIsOwnerOrAdmin && viewerStudioId`
  (`:1041`); the band's door `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:685`).
  **Measured:** with `viewerRole = 'member'` on an unpriced row, neither the stamp act nor the
  `Set the studio rate →` link renders; with the owner, the stamp act does.
- **HT-8 — the lens is unreachable for a plain member; admins get aggregates.**
  `viewerIsOwnerOrAdmin &&` gates the lens (`:619`) and `ScopeRollup` (`:739`); the landing belt
  (`:504-515`) forces a non-admin to `'mine'` once standing is known and re-forces it if anything
  moves her. The one door into the member scope — `person-profile.tsx`'s **Hours** act — carries
  the same `useViewerStudio().isOwnerOrAdmin` gate, so no member-scope event can be dispatched by
  a plain member.
- **HT-9 — the project scope asks about the document.** `useTimeEntryLedger({ projectId })` with
  no `userId` leg, and `ScopeRollup` keyed on the document's **pricing** studio. Pinned.
- **HT-36 — notes behind a detail act.** `studio_hours_rollup` and `time_entry_ledger` carry no
  `notes`; `useTimeEntryNote` reads the table, one entry, by an act. Aggregate is the default
  (`showEntries` starts false and is reset on every scope move).
- **HT-10-a.** `MemberProjectTotal` → `useProjectHoursTotal`; a `42501` is printed as standing
  ("you are not on it"), anything else as a failed read; no zero before the answer.
- **HT-40 — the chip's shape unchanged.** 1px border, no fill, no colour coding of the *word*.
- **Emitter names match the plan exactly.** `grep 'track("time_'` →
  `time_entry_logged`, `time_timer_started`, `time_timer_stopped`, `time_entry_adjusted`,
  `time_entry_deleted`, `time_scope_viewed`, `time_rate_unresolved`, `time_export_taken` — each
  as plan-v2 spells it (§2:267-268 · §3:417 · §4:550 · §6:725). `time_autostart_disclosed` /
  `_opted_out` are recorded in the module doc comment as owed to stage 4 and deliberately
  undefined. No inline `posthog.capture` anywhere in the diff.
- **Every new read is a hook.** `git diff … -- apps/ | grep -cE "^\+.*\.from\('"` → **0**;
  `grep -cE "^\+.*\.rpc\("` over `apps/` → **0**. Every new `useQuery` is in
  `packages/supabase/src/hooks/` or a test stub. Round 5's three inline reads are now
  `useProjectPricingStudio` / `useTimeEntryNote` / `useStudioUnbilledTime`.
- **The mock fallback cannot mask a broken query.** `grep -cE '^\+.*withMockData'` → **0**;
  `grep -rl withMockData packages/supabase/src` → none, so none of the new hooks can fall back.
  Every money read rethrows and renders `Reading…` or a refusal rather than a zero. (The residual
  DATA_MODE hazard is at the e2e-config level — n7-01.)
- **In-app doors are `<Link>`s.** `grep -cE '^\+.*<a href'` → **0**. Both `/desk?account=studio`
  doors are `next/link`. No ad-hoc `fetch` to a NestJS service (`grep` → **0**).
- **The rate card writes `created_by` = the caller and refuses non-admins.**
  `use-studio-member-rates.ts:112` sends `created_by: userId` from `auth.getUser()`;
  `studio_member_rates_admin_insert`'s `WITH CHECK` requires it. The section renders only under
  `canManage && user?.id` (`account-studio-page.tsx:1601`, `canManage = myRole === 'owner' ||
  'admin'` at `:299`), and HT-3-e(2)'s self-authored case is called out rather than taken.
- **Plan-item completeness.** Every row of §2's and §3's portal tables is present except the five
  the orchestrator scoped elsewhere (below) and the one deviation at t8. `useStudioTimeReport` is
  deleted (one comment remains at `use-time-tracking.ts:754`); `CreateTimeEntryInput.rateRole`
  exists and the insert builder sends no rate, pinned by
  `apps/designer-portal/src/hooks/__tests__/use-time-tracking-authority.test.tsx:97`.

---

## 2 · Findings

### BLOCKER

None. Every gate in the brief's list passes; no gate is broken and no flat ruling contradiction
survived measurement.

### MAJOR

**M7-01 — three acts this wave introduced are ~16–22px tall, against house sheet §A5's 44px floor.
NEW; missed by rounds 1–6, whose §A5 check looked only at `DocumentAction` and the lens words.**
*Severity: major (a user-visible defect at 390px — one of the three widths this wave claims — and
a direct miss against §A5, which the brief names). Confidence: **high** on the measurement (CSS read
directly, arithmetic below); **medium** on the severity call, for the reason in the caveat.*

`.da-act` is the repo's 44px grammar and it is a class, not a global rule —
`globals.css:751-760` sets `min-width: 44px; min-height: 44px` on `.da-act` only, and
`globals.css:768` names `.da-hit` "the target witness · the parent is the real 44px interactive
box". A plain `<button>` or `<Link>` carrying `t-head` gets neither. Three acts land that way:

| Act | Location | Box |
|---|---|---|
| the `pending_authorization` **doorway** `{billingLabel} →` | `hours-ledger.tsx:1658-1665` | `t-head` (11px × 1.5 = 16.5) + `py-[2px]` (4) + 1px borders = **≈22.5px** |
| `Set the studio rate →` | `hours-ledger.tsx:1751-1757` | inline `<Link>`, `t-head`, no padding = **≈16.5px** |
| `Studio rates →` | `pending-time-authorization-band.tsx:66-73` | inline `<Link>`, `t-head`, no padding = **≈16.5px** |

All three are **new in this wave** and all three are HT-26's own repair path: the doorway button
replaced a static `<span>` chip (`git show integration:hours-ledger.tsx:695` — a span, not a
button), and the two links are the doors W1 added. So the wave converted a non-interactive mark
and two absences into three acts, and gave none of them a target. The repo has already ruled this
class a defect in the same surface family: `globals.css:604` — *"the roster's name link was the
Desk's one sub-44px target"* — and built `.desk-claim-upper`'s overlay to fix exactly it (R143).

Nothing catches it: `e2e/document/hours.spec.ts`'s 44px loop covers the **lens** buttons only, and
`hours-ledger-scope.test.tsx` asserts no box heights.

*Exact fix.* Give each the grammar the lens words already use — `min-h-11 inline-flex items-center`
beside the existing classes — or render them as `DocumentAction` (`variant="tertiary"`), which
carries `min-h-[44px] min-w-[44px]` for free. For the chip-shaped doorway, `min-h-11 inline-flex
items-center` preserves the pill exactly (the lens at `:634` and the group-by words at `:1170` are
the precedent: `da-score-hover min-h-11 inline-flex items-center t-head`). Pin one case in
`hours-ledger-scope.test.tsx` asserting the three carry a 44px class, or extend the e2e's existing
`boundingBox()` loop over them.

*Caveat, stated because it is the honest counter-argument.* Four **pre-existing** acts on the same
two surfaces are equally sub-44px and untouched by this wave: `‹ earlier` / `later ›`,
`all documents ×`, `Export week → Accounts`, and the band's per-project buttons (restyled from
`font-mono text-[11px] uppercase` to `t-head` — same computed size). A reading that holds the new
three at **minor** for consistency with the surrounding surface is defensible; I grade major
because §A5 is named in the brief, the three are new, and the touch cost is real at 390.

### MINOR

**n7-01 — `playwright.hours.config.ts` documents `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` but
does not set it, so the one gate that could catch a silently-denied scope lens can run in `auto`
and render mock numbers. CARRIED ×2 (r6 n6-01), unfixed.**
*Confidence: high — both configs' `webServer.env` read directly this round.*
`playwright.hours.config.ts:96` is `env: { ...baseWebServer?.env, ...stackOverride }`;
`stackOverride` (`:60-71`) carries only the four Supabase keys, and `playwright.config.ts`'s own
`env` block has no DATA_MODE either. The key appears once in the file — inside the doc comment at
`:30`, as something the operator must remember to export. §0.24 is explicit that the mock fallback
serves mock data on **any** thrown error including an RLS denial, which is precisely the failure a
scope-lens e2e exists to catch.
*Fix:* add `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE: 'live'` to `stackOverride` (or directly to the
`webServer.env` object at `:96`), so the gate cannot be run wrong.

**n7-02 — in the `mine` scope the all-time unbilled balance and its **Bill it** act are, for an
owner or admin, the **studio's** money under the lens word "mine". CARRIED ×2 (r6 n6-02), unfixed.**
*Confidence: high on the mechanism; the grading is a reading.*
The read at `:265-279` (`['document-hours-unbilled', lensProjectId]`) carries **no** user filter,
and after `00605`/`00606` an owner reads every unbilled row RLS lets her see. The file's own doc
comment says so (`:11-13` — *"the **studio's** unclaimed hours as money"*). Billing a teammate's
hours is intended (§0.17, HT-22), so the act is right; the caption under a scored `mine` is not.
Held at minor rather than major because the figure was studio-wide on integration too, with the
same caption and no lens at all — the wave made an existing ambiguity legible, it did not create
the number.
*Fix:* caption on standing — `unbilled · all time{viewerIsOwnerOrAdmin ? ' · the studio' : ''}` —
one expression at `:831`, pinned with the spec's existing owner/member harness.

**n7-03 — the studio scope keeps a document's name in the header and that document's authority band
above a studio-wide total. CARRIED ×2 (r6 n6-03); MEASURED this round.**
*Confidence: high — rendered, not reasoned.* My throwaway case logged the live `<h2>` after
clicking `the studio` with `project-1` in hand:
`Hours · this week· Okonkwoall documents ×`.
`lensName` (`:537`) and `ProjectAuthorityBandForProject` (`:696-698`) are keyed on `lensProjectId`
alone, and `lensProjectId` survives a switch to the studio scope (only the `all documents ×`
handler and the member-scope event clear it). So an owner who opened Hours from a document and then
clicked `the studio` reads one document's name in the head, and that document's authority readout,
above a rollup called with `projectId={null}` — the whole studio. Minor rather than major because
`ScopeRollup`'s own caption says *"the studio · {studioName} · this week"*, so the **money** is
correctly labelled; it is the header that lies.
*Fix:* either clear `lensProjectId` when the scope moves to `studio` (as the member-scope event
already does), or gate the `lensName` chip and `ProjectAuthorityBandForProject` on
`scope === 'mine' || scope === 'project'`.

**n7-04 — `.t-head` is applied to values, captions, state sentences and link labels; 23 new uses,
and `.t-meta` — the step §A3 assigns to exactly those things — is used zero times. CARRIED ×4
(r4 n2 → r5 n2 → r6 n2), unfixed.**
*Confidence: high — re-measured this round on the three-dot diff: `t-head` **23**, `t-meta` **0**,
`t-body-sm` **17**; `SPEC.md:137-140` and `globals.css:2014-2017` read directly.*
`.t-head` is 11px/500/.08em **with `text-transform: uppercase`** and §A3 scopes it to *"running
heads only"*; `.t-meta` (12px/400, sentence case) is the step for *"values: dates, counts,
captions, sub-labels"*. Consequences, unchanged since r4:
- `ScopeRollup`'s caption (`:1134`) renders **a person's and a studio's proper name in full caps** —
  *"MARIA OBI · LEAH MBEKI STUDIO · THIS WEEK"*. Same for `PricingStudioLine` (`:1035`),
  `MemberProjectTotal`'s caption (`:1280`) and `ScopeEntryRow`'s meta line (`:1434`, which prints
  a document's name, a date and *"priced by {studio}"*).
- Three whole state sentences render at 11px UPPERCASE: `ScopeRollup`'s error (`:1190`),
  `ScopeEntries`' error (`:1348`) and the pricing-studio error (`:700`). §A3 puts state sentences
  on `.t-body`/`.t-body-sm`, which `StudioRateRows`' own error already uses correctly.
- Two link labels (`Set the studio rate →`, `Studio rates →`) are act labels, not running heads.
Still minor: the file's pre-existing idiom at those places was already `font-mono text-[11px]
uppercase`, so the conversion preserved the *look* while landing the wrong semantic step, and the
brief's own reading of §A is "no inline font-size utilities; acts ≥ 44px", both of which are
separately checked above.
*Fix:* `.t-body-sm` on the three error paragraphs and on `PricingStudioLine`; `.t-meta` on the two
scope captions and on `ScopeEntryRow`'s meta line. Leave `.t-head` on the lens words, the group-by
words and the actual running heads.

**n7-05 — a viewer who owns or administers two design studios can only ever read the alphabetically
first one, with no door to the second. CARRIED ×4, unfixed.**
*Confidence: high — `use-viewer-studio.ts:52-64` sorts the candidates and returns `candidates[0]`;
nothing switches it.*
The r3 fix correctly made the answer deterministic and named; it also made the second studio
unreachable. Everything keyed on it follows: the studio scope's rollup, the member scope's rollup
and entries, and the studio the stamp door offers to name — so on a document whose designer the
*other* studio employs, the door is offered and the server then refuses `42501`.
*Fix:* when `candidates.length > 1`, make the studio name in the caption a Scored-Ink word that
cycles the candidates; or rule one studio per viewer and have `useViewerStudio` return the count so
the sheet can say *"(1 of 2 studios)"* rather than silently picking.

**n7-06 — the same-day upsert rewrites `created_by` on a row another admin authored, and overwrites
that day's rate in place, in a table the module documents as append-only. CARRIED ×4, unfixed.**
*Confidence: high on the mechanism; low on money impact, which r4–r6 and I all failed to construct.*
`use-studio-member-rates.ts:105-124` upserts `onConflict: 'studio_id,user_id,effective_from'` with
`created_by: userId`. A second save the same day takes the UPDATE path, whose policy
(`studio_member_rates_admin_update`) checks only `is_org_admin_or_owner(studio_id)` and does **not**
re-assert `created_by = auth.uid()` — so the row's recorded author silently becomes whoever
corrected it, and the earlier figure for that day is gone from the history the card prints directly
beneath the field. It interacts with HT-3-e(2): a correction by the member herself flips a
studio-authored (pricing) row into a self-authored (inert) one.
*Fix:* drop `created_by` from the UPDATE path (split the two calls, or send it only on insert), or
state the same-day-correction behaviour in the card's help line at `account-studio-page.tsx:1604`.

**n7-07 — three coverage gaps the plan's own assertions name. CARRIED ×4, unfixed — but the
BEHAVIOUR is correct, measured this round, so these are coverage-only.**
*Confidence: high — `grep` over all three spec files, plus a throwaway render of each case.*
(a) **"rate pending" is never asserted to RENDER in the sheet.** `grep -rn "rate pending"` finds it
in `authority-hours.ts` (the label), `authority-hours.test.ts:166` (a unit test of the pure
function), `studio-rate-rows.tsx` and five comments — never as an assertion in
`hours-ledger-scope.test.tsx`. HT-26's user-visible half rests on nothing.
(b) the `EntryRow` repair block's `viewerIsOwnerOrAdmin` gate (`:1746`) — nothing asserts a plain
member is **not** offered it.
(c) `PricingStudioLine`'s stamp-door absence for a non-admin — the spec asserts absence only when a
studio *is* named (`:405`).
I built all three as throwaway cases on the wave's own harness and **all three passed**, so the
gap is in the pins, not in the code. That is exactly the kind of correctness a later wave can break
silently.
*Fix:* land those three cases in `hours-ledger-scope.test.tsx` — a `rate_source: 'none'` week entry
renders the words "rate pending"; with `viewerRole = 'member'` neither repair renders; with
`projectStudioId = null` and `viewerRole = 'member'` the stamp door is absent.

**n7-08 — `ScopeEntries` renders `Reading…` forever if it is ever mounted with all three scope keys
null, because `useTimeEntryLedger`'s `enabled` guard leaves the query pending rather than answering.
CARRIED ×2, unreachable today.**
*Confidence: high on the mechanism; **low** that any path reaches it.*
`use-time-tracking.ts:815` — `enabled: Boolean(studioId || userId || projectId)` — and a disabled
TanStack v5 query reports `isPending: true` for ever, which `ScopeEntries:1359-1365` prints as
*"Reading…"*. I re-traced every path into the entries block (`:786-819`): the block is gated only
on `scope !== null && scope !== 'mine'`, **not** on `viewerIsOwnerOrAdmin` — but the only ways to
leave `'mine'` are the lens (admin-gated) and the member-scope event (whose one dispatcher,
`person-profile.tsx`'s Hours act, is admin-gated), and the landing belt re-forces `'mine'` for a
non-admin on every scope change. So `studio`/`member` always carry a studio key and `project`
always carries `lensProjectId`. It cannot happen today; it is a silent-forever arm one prop change
away, and the `scope !== 'mine'` gate is a weaker guard than the invariant it relies on.
*Fix:* in `ScopeEntries`, treat "no key" as its own arm — `if (!studioId && !memberId && !projectId)
return null;` before the `isPending` check.

**n7-09 — the sheet prints one figure and the invoice bills another on a legacy row. CARRIED ×6;
documented in the matrix, not fixed.**
*Confidence: high.* `hours-ledger.tsx:1616` — `amountCents = e.rated_amount_cents ??
unbilled?.amount_cents ?? 0` — while the composer reads `project_unbilled_time.amount_cents`.
Plan §3 asks BIL-08 be reopened *"as the rate-display drift, not as absence"*, and the matrix entry
now says exactly that, so **the plan item is satisfied**; the underlying two-answer defect closes at
W0's `00596` and its owed ruling **HT-6-a**. Related and pre-existing (integration's code, not this
branch's): the unbilled read at `:265-279` never selects `rated_amount_cents`, so the
`row.rated_amount_cents ??` preference at `:304`/`:315` is inert.

### NOTE

**Deferred by the orchestrator (each listed once, counting against nothing):**

- **t1 — HT-35** (the auto-start disclosure band in `document-time-provider.tsx`, the per-member
  opt-out in `account-profile-page.tsx`, and the `time_autostart_disclosed` / `_opted_out`
  emitters): **deferred to stage 4, lane B, with W7.** `document-events.ts:177-190` records the
  scoping in place, alongside the three non-existent candidate columns. Plan §3's Done-when *"the
  disclosure band appears once for a fresh member and never again"* stays unverifiable until then.
- **t2 — W4's portal follow-commits: deferred to stage 4.** One is visible and now confirmed
  against the merged types: `00610` makes `project_id` nullable and `00613`'s ledger view admits
  project-less internal rows, while `ScopeEntryRow:1442` renders `row.project_name ?? 'Project'` —
  so an internal hour with no document will print the literal word **"Project"**. One string, owed
  to that stage. (The post-merge type gate passes regardless — measured above.)
- **t3 — M5-01 (`…/wave-1/15-hours.md:9,15` + the Sanity push): deferred, owed to Kody after the
  ship.** Re-measured: the file is untracked on every ref and exists only in the main checkout.
  The sharpening still stands — `:15` (*"a designer **or the studio's first hire** can see … where
  the week actually went"*) is now **false**, since HT-8 gives a plain member no lens and `00606`
  gives her her own rows only. Plan §3's Done-when *"the Sanity help article matches what the sheet
  does"* is unverified.
- **t4 — the roster-role chip: deferred to W3/stage 4.** W1's Done-when #5 (*"a two-role member's
  ledger row prints the role they picked"*) is not met at this wave; `timeRateRoleLabel` exists and
  has no production call site; a spec case pins the **negative** half (no chip on a single-role
  member's rows). Plan §4 assigns the multi-role chip to W3. The two plan sections disagree —
  **ruling owed** on which carries it.
- **t5 — the batch-add `billable` control: deferred to W3.** The add row (`:946-1000`) carries no
  `billable` control and `useCreateTimeEntry` writes `billable: input.billable ?? true`. HT-11
  ruled "yes to both"; plan-v2:467 lists HT-11 among W3's ruled inputs. So the brief's "HT-11
  billable explicit at every capture surface" is **not** met at this wave, by scoping.

**Rulings owed:**

- **t6 — HT-29 shipped as "the row always, the act sometimes". CARRIED ×6.** `desk-contents.tsx`
  hangs `HoursInHandAct` beneath an Hours doorway row that still renders unconditionally; plan §3
  reads *"act-bearing or absent"*. Removing the row would make the Hours sheet unreachable from the
  Contents index, and the owner/admin-only unbilled act now depends on that row for the plain
  member. Kody's question.
- **t7 — HT-40's second clause, and the chip's ink changed on a pre-existing element. CARRIED ×4.**
  HT-40 reads *"Keep it as built … **Do not add colour-coding when the studio scope multiplies
  rows**."* r5's fix moved the billed chip's **label** from `--color-sage` to `--color-charcoal` in
  both `ScopeEntryRow:1460` (new) and `EntryRow:1672` (pre-existing) — a WCAG-correct change
  (sage on paper ≈2.1:1) that is nonetheless a change to the thing HT-40 said keep. The sage/pearl
  **border** pair still colour-codes billed against unbilled, and `ScopeEntryRow` carries that pair
  into the multiplied studio rows.
- **t8 — ratification owed: the copy deck documents the alias instead of being rewritten.
  CARRIED ×6.** Plan §3 says rewrite `?sheet=hours` → `?book=hours` at `copy-deck.md:357,379,627`;
  the lane added a Conventions bullet naming both spellings and pointing at the seeded templates
  that carry the live string. `desk-doorway.tsx` accepts both end to end (`DOORWAY_KEYS` **and**
  `params.get('book') ?? params.get('sheet')`), so the Done-when is satisfied. Sound reasoning,
  real evidence, still a deviation from a plan line.
- **t9 — architect choice, re-confirmed: the rate card lives on `account-studio-page.tsx`
  (`/desk?account=studio`), not `/preferences` and not the People Room. CARRIED ×6.** Plan §2 makes
  this choice explicitly against HT-3's parenthetical and asks it be flagged. Implemented as planned.
- **t19 — §0.23 / HT-30 tension, stated so it is a decision and not a drift. NEW as a note.**
  Two totals on this sheet have no rows beneath them: the `mine`-scope `unbilled · all time`
  balance (pre-existing R77, and the code comment at `:820-828` says outright *"it is a money total
  whose rows this sheet never lists"*), and `MemberProjectTotal` (the whole team's all-time figure
  above the viewer's own week — a different set, labelled *"Below, your own week."*). Both are
  mandated or pre-existing (HT-10-a forces the second), and both are honestly captioned, so no
  action is implied — but §0.23 says a total with no rows beneath it "is a dashboard and is
  refused", and someone should be able to point at where that was decided.

**Observations, no action implied:**

- **t10 — `timeRateRoleLabel` is a dead export in production code. CARRIED ×6.**
  `authority-hours.ts:101` and its test, nothing else. Deliberate (W3 needs it); recorded so nobody
  "cleans it up" first.
- **t11 — `timerStarted` / `timerStopped` / `exportTaken` are defined with no call site. CARRIED ×6.**
  Plan-v2 owns all three names in later waves (§4:550, §6:725) and this lane is the file's sole
  writer for the phase. Worth repeating: `Export week → Accounts` is **not** `time_export_taken`'s
  call site — it opens the composer, it hands nothing out as a file — so W5 must add its own.
- **t12 — `lensWords.length > 1` is a dead guard. CARRIED ×5.** `hours-ledger.tsx:619`. `lensWords`
  always contains `'mine'` and `'studio'`, so the test is always true; the lens's visibility rests
  on `viewerIsOwnerOrAdmin` alone.
- **t13 — `rateUnresolvedSeen` never clears. CARRIED ×5.** `document-events.ts:39` — a module-level
  `Set<string>` keyed on `entry_id` with no eviction. That is what the doc comment promises.
- **t14 — the `['studio-member-rate', userId]` entity key has no reader. CARRIED ×5.**
  `use-studio-member-rates.ts:50` defines it and `:122` invalidates it; nothing queries it. Plan
  §2:252 specifies both keys, so this is the plan's shape faithfully implemented.
- **t15 — the sheet is 1772 lines, from 751. CARRIED ×2.** Worth a deliberate split (`hours-scope/`
  — `scope-rollup.tsx`, `scope-entries.tsx`, `pricing-studio-line.tsx`) **before** W3's
  follow-commit lands in it (§11), not after.
- **t16 — `time_entry_adjusted` hardcodes `by_admin: false`.** Correct today: `EntryRow` is the only
  caller and is `scope === 'mine'`-gated. It stops being correct the moment HT-22's admin-adjust
  surface lands. Recorded so that lane does not inherit a lie.
- **t17 — the lens is a `role="group"` of buttons with `aria-current`, not a radiogroup.** Matches
  `scope-lens.tsx`'s existing People Room idiom, carries a group label (`aria-label="Hours scope"`),
  and each word meets 44px. Accessible; noted only because a four-state single-choice control is the
  textbook radiogroup and a screen-reader user hears "button" ×4.
- **t18 — `useStudioUnbilledTime()` fires on every Desk render, for every viewer, and its result is
  then discarded for non-admins. NEW.** `desk-contents.tsx`'s `HoursInHandAct` calls the hook
  unconditionally (rules of hooks) and only afterwards returns `null` on
  `!standingKnown || !isOwnerOrAdmin`. One `project_unbilled_time` select per Desk open for a plain
  member, RLS-scoped and never shown. Harmless; if it ever matters, gate the hook with
  `enabled: isOwnerOrAdmin`.

---

## 3 · Plan-item ledger (W1 + W2 portal tables)

| Plan item | Status |
|---|---|
| §2 · `use-time-tracking.ts` — `rate_source`/`rate_role` on the type, `rateRole?` on `CreateTimeEntryInput`, no rate sent + asserted | **present** (lane A; assertion at `use-time-tracking-authority.test.tsx:97`) |
| §2 · `use-studio-member-rates.ts` create, keys + invalidation set | **present**, keys exactly as specified; n7-06 open |
| §2 · `hooks/index.ts` + package index export | **present** |
| §2 · `account-studio-page.tsx` — "Studio rates" section, blur-save, owner/admin only, dated history | **present**; gate pinned both ways |
| §2 · `studio-rate-rows.tsx` create | **present**; controlled field, both restore arms pinned |
| §2 · `hours-ledger.tsx` — rate + rate-source column, "rate pending", never blank | **present**, measured; n7-07(a) unpinned |
| §2 · `authority-hours.ts` — `timeRateProvenance` never `null`, discriminated, carries source + role | **present**, 4 unit cases |
| §2 · `pending-time-authorization-band.tsx` + the `pending_authorization` read become doorways | **present**; M7-01 on both new doors |
| §2 · PostHog `time_entry_logged` / `time_rate_unresolved` | **present**, real props, both call sites |
| §2 · Done-when "a two-role member's row prints the role they picked" | **not met at this wave** — deferred to W3 (t4) |
| §3 · `hours-ledger.tsx` — four-scope lens, absent for non-admins, no `user_id` AND on the project path, totals above rows, studio money, `— internal —` group, chip unchanged | **present**; n7-02, n7-03, n7-04, t7 open |
| §3 · `use-time-tracking.ts` — `useStudioTimeReport` deleted, `useStudioHoursRollup` + `useTimeEntryLedger` added | **present** (lane A); n7-08 on the `enabled` guard |
| §3 · `person-profile.tsx` — an "Hours" act, the only door to the member scope | **present**, admin-gated, pinned both ways |
| §3 · `desk-contents.tsx` — the Hours line act-bearing or absent | **present**; t6 (ruling) open |
| §3 · `document-time-provider.tsx` — HT-35 disclosure band | **deferred — stage 4** (t1) |
| §3 · `account-profile-page.tsx` — HT-35 opt-out | **deferred — stage 4** (t1) |
| §3 · `desk-doorway.tsx` — `sheet` as an alias of `book` | **present**, end to end |
| §3 · `copy-deck.md:357,379,627` | **deviation** — documented, not rewritten (t8) |
| §3 · `15-hours.md:9,15` + the Sanity push | **deferred — orchestrator-scoped out** (t3) |
| §3 · `portal-vs-desk-feature-gap-matrix-v2.md:189,193` — BIL-04 closed, BIL-08 reopened as drift | **present** (n7-09) |
| §3 · `hours-ledger-scope.test.tsx` (new) | **present**, 31 cases; n7-07 gaps |
| §3 · `e2e/document/hours.spec.ts` (new) | **present**, 128 lines + a derived key-free config; not re-run here; n7-01 |
| §3 · `studio_hours_rollup` return shape has no `notes` | **present** at the type level; the SQL `\d+` assert is lane A's |

---

## 4 · What this review did NOT verify

- **No `supabase db reset`, no SQL test, no `psql` probe.** Per the brief. Lane A's coverage of
  `00598`–`00607` / `00615` / `00620` is taken as given; `00604`'s ledger view, `00606`'s
  `stamp_project_pricing_studio` and `00607`'s rollup were **read** to ground the UI claims, not
  executed. No row-level claim here rests on a SELECT.
- **The e2e suite was not run.** Not in this round's gate list; port 3000 is contended with the peer
  people-room program and this stage was not named its owner. I read `hours.spec.ts` and
  `playwright.hours.config.ts` and judge them sound apart from n7-01. The implementer's earlier
  *5 passed, chromium, :3100 against 127.0.0.1:54421* is accepted on their evidence; its two
  caveats stand (chromium only; the 44px loop covers the **lens** buttons only — which is how
  M7-01 survived six rounds).
- **No browser walk, no screenshots, no live-mode render by this reviewer.** Every runtime claim
  above is a **jsdom** render on the wave's own stubs (my throwaway spec, deleted) or the
  implementer's SELECT walk in `W1W2-portal-impl.md` §3. M7-01's box sizes are computed from the
  CSS, not measured in a browser — the classes and the `.da-act`/`.t-head` rules were read
  directly, so the *absence of a 44px box* is certain; the exact pixel heights are arithmetic.
- **The person-profile → Hours door's runtime path** (`openHoursForMember` dispatching
  `document:open-ledger` and `StudioDrawer` hearing it over the People Room) is proved only at the
  module-contract level by jest — owed to the prod/local walk.
- **`packages/supabase` lint was not run** — per `patina-verification` no resolvable ESLint flat
  config exists outside designer-portal, so its result would mean nothing.
- **client-portal / manufacturer-portal type gates not run.** Nothing in the diff touches them;
  `@patina/supabase type-check` and the admin build (the repo's strictest gate) both pass.
- **The 201 pre-existing lint warnings were not audited** — only the delta was attributed (zero).
- **Prod untouched.** No `db push`, no deploy, no Strata read, no Sanity write.
- **PostHog not consulted** — event names and prop shapes were checked against plan-v2's text and
  the module source; no ingest, dashboard or property schema was verified.
- **`00620`'s legacy studio stamp was not exercised.** Its refusal path is what the UI prints; its
  happy path is unobserved by this reviewer.
- **The merge was not performed.** `git merge-tree` reports 0 conflict markers and the post-merge
  type gates were measured by swapping integration's `database.types.ts` in and restoring it — the
  working tree was verified clean afterwards.
