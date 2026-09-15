# W1W2-portal — adversarial review, round 1

**clean = false** (8 major, 0 blocker, 12 minor, 5 note)

Reviewer: separate context from the implementer. Branch `hour-tracking/portal`
(`29b72c644`, `2c83cb4d3`) against `origin/hour-tracking/integration`
(`a9841c8de`), worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.
Read: plan-v2 §0 / §2 / §3, `rulings.md` rows HT-3, HT-8, HT-9, HT-10/10-a, HT-11,
HT-25, HT-26, HT-27, HT-29, HT-30, HT-35, HT-36, HT-37, HT-38, HT-40, HT-41,
`W1W2-portal-impl.md`, the full diff of all 15 touched files, plus the shipped SQL
the UI leans on (`00598`, `00599`, `00604`, `00606`, `00607`, `00615`).

---

## 1 · Gates — run by this reviewer, verbatim

```
$ pnpm --dir .../agent-portal --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
(no output — PASS)

$ pnpm --dir .../agent-portal --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
(no output — PASS)

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test -- \
    src/components/document/__tests__/hours-ledger-scope.test.tsx \
    src/lib/document/__tests__/authority-hours.test.ts \
    src/components/document/__tests__/desk-contents.test.tsx \
    src/components/document/account/__tests__/account-studio-page.test.tsx
Test Suites: 4 passed, 4 total
Tests:       38 passed, 38 total                                  PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal test
Test Suites: 574 passed, 574 total
Tests:       7270 passed, 7270 total
Snapshots:   1 passed, 1 total                                    PASS

$ pnpm --dir .../agent-portal --filter @patina/designer-portal lint
✖ 203 problems (0 errors, 203 warnings)                           PASS (0 errors)
  — but 2 of the 203 are NEW and are in this diff (finding n4)

$ pnpm --dir .../agent-portal --filter @patina/admin-portal build
✓ Compiled successfully
✓ Generating static pages (137/137)                               PASS
```

The DB was **not** reset (this stage does not own it). No `supabase/tests/**`
were run — not in this lane's gate list and lane A owns them.

### Commit hygiene — clean

`git show --stat` on both commits: 12 + 6 files, all under
`apps/designer-portal/src`, `packages/supabase/src`. **No** `supabase/config.toml`,
**no** `.env.local`, **no** stray artifact/doc paths. `git ls-files -v | grep ^S`
confirms `supabase/config.toml` is still skip-worktree'd and unstaged. Working
tree clean. `apps/designer-portal/.env.local` exists, is matched by
`.gitignore:15`, and points at `http://127.0.0.1:54421` with
`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` — the isolated stack, not Strata.
Commit subjects are `feat(time): …` — Conventional Commits, hook-safe.

### Mock-fallback check — cannot mask

`grep withMockData` over `hours-ledger.tsx`, `desk-contents.tsx` and
`use-time-tracking.ts`: **no hits**. Every new read is a bare `useQuery` /
`@patina/supabase` hook that rethrows, and `ScopeRollup` / `ScopeEntries` each
render a `role="alert"` line off `isError`. A broken query shows as an error, not
as plausible numbers. (`MemberProjectTotal` is the exception — finding n1.)

### Ruling spot-checks that PASSED

- **No flag** (P-5): no `useFeatureFlag`, no `ComingSoon`, no
  `NEXT_PUBLIC_FLAG_OVERRIDES` in the diff.
- **R69 / no per-second motion**: `grep setInterval|requestAnimationFrame|animate-`
  over the diff — zero hits. No shadow (`grep shadow` — zero). No hex literal
  (`grep -E '#[0-9a-fA-F]{3,6}'` over added lines — zero).
- **No dashboard / tab / badge / red-green**: the lens is the `scope-lens.tsx`
  two-word Scored-Ink idiom, copied faithfully (`da-score-hover` / `da-score-on`,
  `role="group"`, `aria-current`, `min-h-11`). The billing chip is unchanged —
  1px border, no fill, pearl/sage only (HT-40 kept).
- **HT-36 at the type level**: `studio_hours_rollup`'s signature (00607:59-69)
  has no `notes`; `time_entry_ledger` has none either; `ScopeEntryNote`
  (`hours-ledger.tsx:1219`) is the only reader of `notes` and it reads the
  **table**, per entry, behind an act. Verified, not assumed.
- **HT-10-a**: `MemberProjectTotal` calls `project_hours_total` for a non-admin
  project scope and never the rollup — pinned by the new spec's case 6.
- **HT-9**: the project scope's read passes `userId: null`
  (`hours-ledger.tsx:636`), pinned by the new spec's case 2.
- **HT-3 — the rate card writes `created_by` = the caller and refuses
  non-admins**: `useSetStudioMemberRate` stamps `created_by: userData.user.id`
  (`use-studio-member-rates.ts:109`); the section is gated on the page's own
  `canManage = myRole === 'owner' || myRole === 'admin'`
  (`account-studio-page.tsx:299`); `studio_member_rates_admin_insert`'s
  `WITH CHECK` is the real gate. Correct.
- **HT-26 "never a blank"**: `timeRateProvenance` is total — four arms, each with
  a label, `null` unreachable. Both row renderers print `provenance.label`
  unconditionally. Verified by reading, and pinned by 4 new cases in
  `authority-hours.test.ts`.
- **The "rate pending" doorway is admin-only**: `ratePending && viewerIsOwnerOrAdmin`
  (`hours-ledger.tsx:1444`), and `PendingTimeAuthorizationBand`'s new door is
  gated on `showStudioRateDoor={viewerIsOwnerOrAdmin}` (`:578`).
- **Emitter names match the plan exactly**: `time_entry_logged`,
  `time_rate_unresolved`, `time_scope_viewed`, `time_entry_adjusted`,
  `time_entry_deleted` — all five plan-named names, spelled right, with
  `time_entry_logged`'s eight props identical to plan §2's list.
- **Keyboard / focus**: every new act is a real `<button>` or `<a>`; the two
  rate-card doors are links; no `div onClick` anywhere in the diff.

---

## 2 · Findings

### MAJOR

**M1 — the project lens reads the pricing studio off the viewer's own week
entries, so in the scope HT-9 exists for it is almost always wrong.**
*Confidence: high.*
`apps/designer-portal/src/components/document/hours-ledger.tsx:419-423` and
`:590-600`.
`lensPricingStudioId` is derived from `(entries ?? []).find(e => e.project_id === lensProjectId)?.project?.studio_id`
— and `entries` is the **viewer's own** rows for the shown week
(`:166` `.eq('user_id', userData.user.id)`). The project scope's whole purpose
(HT-9) is an owner looking at a document she may not have logged on, in a week she
may not have logged in. When she hasn't, `lensPricingStudioId` is `null` and
`PricingStudioLine` prints *"no studio yet — hours here read 'rate pending'"* for
a project that does name a studio, **and** offers the "Name your studio" stamp
door, which `stamp_project_pricing_studio` then refuses with
*"this project already names a studio"* (`00606:733`). A false fact and a dead
door, on the sheet's most load-bearing new line.
*Fix:* read the project's own column, not the viewer's entries — add a small
`useQuery(['document-hours-project-studio', lensProjectId])` selecting
`projects.studio_id` (or take `studio_id` from `useTimeEntryLedger`'s first row
for that project), and gate the stamp door on that value.

**M2 — "all documents ×" in the project scope leaves a scope with no document,
and the studio's hours are then printed under the caption "this document".**
*Confidence: high.*
`hours-ledger.tsx:459-466` (the × sets only `setLensProjectId(null)`) +
`:604-620`.
After the click `scope` is still `'project'` while `lensProjectId` is `null`, so:
`lensWords` no longer contains `'project'` → **no lens word carries
`aria-current`**; `ScopeRollup` renders with `scope='project'` → caption
`SCOPE_CAPTION.project` = "this document" — but `projectId={scope === 'project' ? lensProjectId : null}`
is `null`, so `studio_hours_rollup` returns the **whole studio's** buckets. The
studio's money is labelled as one house's.
*Fix:* in the × handler also drop out of the scope —
`setLensProjectId(null); setScope(s => (s === 'project' ? 'mine' : s));`.

**M3 — the person-profile "Hours" act is ungated, so a plain member can enter the
member scope and is then stranded in a sheet with no aggregate and no way back.**
*Confidence: high.*
`apps/designer-portal/src/components/document/people/views/person-profile.tsx:823-830`
(`{profileId && <ActionButton actionKey="open-person-hours" …/>}` — no role
check) against `hours-ledger.tsx:520` (the lens is `viewerIsOwnerOrAdmin &&`),
`:604-620` (ScopeRollup needs `viewerIsOwnerOrAdmin && viewerStudio`;
`MemberProjectTotal` needs `scope === 'project'`), and `:551` / `:704` / `:725`
(front matter, zero-state and the per-day `EntryRow` list are all
`scope === 'mine' &&`).
For a plain member the member scope therefore renders: no lens, no rollup, no
project total, no own rows, no zero-state — a header, the pending band, and "The
entries" (which RLS answers empty after `00606`/HT-10-a). And because the lens is
hidden she cannot return to `'mine'` without closing and reopening the sheet.
HT-8 makes the scope lens the admin's instrument; its one door has to carry the
same gate.
*Fix:* gate the `ActionButton` on the viewer's owner/admin role (read it the way
`hours-ledger` does, from `useOrganizations()`), **and** as a belt, always include
a `'mine'` word in `lensWords` whenever `scope !== 'mine'` so no scope is a dead
end even when the lens is otherwise absent.

**M4 — the project scope's rollup is keyed on the VIEWER's active studio, not the
document's pricing studio, so the total can read zero above rows that exist.**
*Confidence: medium-high.*
`hours-ledger.tsx:605-617` passes `studioId={viewerStudio.id}`;
`studio_hours_rollup` hard-filters `WHERE ledger.studio_id = p_studio_id`
(`00607:93`), and `time_entry_ledger.studio_id` is `projects.studio_id`
(00615's one-column `project_pricing_studio_id`). Where the document is priced by
a studio other than `orgs.find(type === 'design_studio')` — the viewer admins two
studios, or her "active" studio is not the employer that prices this house — the
rollup returns **zero** rows and the sheet prints *"Nothing logged in this
window"* **above** a list of entries that `ScopeEntries` does read (it passes
`studioId: null`, `:637`, so only RLS narrows it, and `time_entries_owner_admin_read`
keys on the *project's* pricing studio, not the viewer's active one). Total and
rows contradict each other. The same is true, for a different reason, of a
document whose `studio_id` is still NULL: the rollup cannot match NULL, so the
total is always zero there.
*Fix:* resolve the document's pricing studio (see M1) and pass **that** as
`studioId` in the project scope. Where it is NULL, suppress the rollup and print
the unstamped-studio sentence instead of a zero.

**M5 — opening Hours from inside a document now hides the viewer's own editable
entries; for a plain member they are unreachable.**
*Confidence: high.*
`hours-ledger.tsx:137-143` initialises `scope` to `'project'` whenever
`initialContext?.projectId` is present — and two shipped doors already pass it:
`components/document/account-band.tsx:412` and
`components/document/commercial/money-region.tsx:263`
(`openLedger('hours', { projectId })`). In `'project'` scope the per-day
`EntryRow` list (`:725-756`), the utilization front matter (`:551`) and the
zero-state (`:704`) are all suppressed, so the inline activity/duration edit and
the R77 delete-with-confirm on her **own** hours for that document are gone. An
owner can click "mine" to get them back; a plain member has no lens (M3), so the
in-document door costs her the edit path R77 shipped.
*Fix:* default to `'mine'` with `lensProjectId` set (the pre-change behaviour) for
a viewer with no lens, and keep `'project'` as the admin landing; or render the
own-entry list in the project scope as well.

**M6 — the studio rate card offers every admin a field for her own rate that the
resolver silently ignores.**
*Confidence: high.*
`apps/designer-portal/src/components/document/account/account-studio-page.tsx:1603-1630`
lists every active member **including the acting user**.
`useSetStudioMemberRate` stamps `created_by = auth.uid()`, and 00615's HT-3-e(2)
clause (`00615:630-641`) prices a self-authored row **only where that person is
the studio's `owner`**. So an `admin` types her own rate, the row saves, the
history row appears — and her hours keep reading "rate pending" with nothing on
screen to say why. HT-26's letter is kept (the ledger says "rate pending") and its
spirit broken (the one surface that could explain it invites the useless write).
*Fix:* on the acting user's own row, when `myRole !== 'owner'`, replace the field
with a line saying a rate she writes for herself does not price her hours and
someone else in the studio must write it — or omit the field for that one row.

**M7 — `rate_role` prints on every ledger row, not only where the member holds
more than one roster role.**
*Confidence: medium.*
`hours-ledger.tsx:1271` + `:1334` (EntryRow) and `:1157` + `:1174`
(ScopeEntryRow) print `timeRateRoleLabel(rate_role)` whenever the column is set —
and `00601`'s classifier sets it on essentially every row. HT-41 as ruled: *"a
role chip shown only when they hold more than one role"*; plan §4 repeats it for
"the ledger entry rows". A single-role member's every row now carries "lead
designer" as permanent noise.
*Fix:* pass a `hasMultipleRoles` boolean (from the member's live
`project_team_members` roles on that project) into the row and suppress the
segment at one role. If that count is W3's to fetch, suppress the segment now
rather than print it on every row. **If the orchestrator reads HT-41's "shown only
when" as binding on the readout and not only on the picker, this is a ruling
contradiction and should be re-graded blocker.**

**M8 — plan §3 portal items absent from the wave.**
*Confidence: high (absence measured against `git show --stat`).*
Not in the diff at all:
- **HT-35 — both halves**: the one-time auto-start disclosure band in
  `apps/designer-portal/src/hooks/document-time-provider.tsx`, and the
  per-member opt-out (default on, falling back to one-tap manual start) in
  `components/document/account/account-profile-page.tsx`. HT-35 is a *ruled
  input of W2* (plan §3 header) and its Done-when ("the disclosure band appears
  once for a fresh member and never again; the opt-out leaves a one-tap manual
  start") is unverifiable.
- The two emitters it owes, `time_autostart_disclosed` /
  `time_autostart_opted_out`: named in `document-events.ts`'s new doc comment as
  owed, **not defined**.
- `components/document/desk-doorway.tsx`'s `sheet`-as-`book` alias (`:84`,
  `:132`) and `docs/marketing/founding-onboarding/copy-deck.md:357,379,627` —
  so the live founding-cohort CTA still lands on a bare Desk and Done-when
  "`/desk?sheet=hours` opens the Hours book" is still false.
- `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md:9,15`
  + the Sanity push; `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md:189,193`.
- `apps/designer-portal/e2e/document/hours.spec.ts` (plan §3's e2e, and §3's
  gate list names `test:e2e -- e2e/document/hours.spec.ts`). No 1440/1024/390
  pass exists for the lens.

The impl report §5 defers each with a reason (out of brief; `document-time-provider.tsx`
is a §11 shared file; port 3000 held by the peer program). Recorded here so the
wave is not closed on them — they are either a second dispatch or an explicit
descope, not done.

### MINOR

**n1 — `MemberProjectTotal` reports any read failure as "you are not on it".**
*Confidence: high.* `hours-ledger.tsx:1040-1046`. `total.isError` is treated as
the one cause — but a network failure, a 500, a missing RPC or a schema-cache
miss all render *"This document's total is for its team — you are not on it."*
and tell a rostered member something false about her standing.
*Fix:* branch on the error (the DEFINER function raises `insufficient_privilege`
/ `42501`) and print a neutral "this document's total could not be read"
otherwise.

**n2 — the `— internal —` group repeats buckets the main list already shows.**
*Confidence: high (00607's own comment is the evidence).*
`hours-ledger.tsx:1006-1027` renders a second list from
`rows.filter(r => r.internal_minutes > 0)`. 00607:148-155 states outright:
*"billable_minutes/billable_cents and internal_minutes can count the SAME row …
A bucket may therefore read total 60 / billable 60 / internal 60."* So a member
with internal work appears in both lists with overlapping minutes, and a reader
summing them double-counts. The lane correctly did **not** derive the group by
subtraction (the SQL warned against it) — but it also did not make the
presentation non-overlapping.
*Fix:* render the internal group only for buckets that are **entirely** internal
(`total_minutes === internal_minutes`) and drop those from the main list; or
print the internal figure as a parenthetical on the bucket's own row instead of
a second list.

**n3 — a plain member in the project scope gets a total with no rows beneath it.**
*Confidence: medium.* `hours-ledger.tsx:618-620` + `:622-644`.
`MemberProjectTotal` prints the whole project's minutes/billable/money, and the
rows that produced it are not merely one act away — after `00606`/HT-10-a they
are **not readable by her at all**, so "The entries" answers empty. §0.23/HT-30
("a total with no rows beneath it is a dashboard and is refused") and HT-10-a
("members get project totals from `project_hours_total`") point opposite ways
here. HT-10-a is the later and more specific ruling, so this is not scored a
contradiction — but the sheet should say *why* the rows are absent rather than
leaving a bare aggregate under an act that silently returns nothing.
*Fix:* when the viewer is not owner/admin and the scope is `'project'`, replace
"The entries" with a sentence (this document's total is the team's; the entries
here are your own), or show her own rows under the total.

**n4 — two new unused `eslint-disable` directives.** *Confidence: high (measured).*
`apps/designer-portal/src/components/document/desk-contents.tsx:87` and `:93`.
Lint went 201 → 203 warnings, and both new warnings are these two lines:
*"Unused eslint-disable directive (no problems were reported from
'@typescript-eslint/no-explicit-any')"*. *Fix:* delete both comment lines.

**n5 — `time_rate_unresolved` always sends `project_kind: null`.**
*Confidence: high.* `hours-ledger.tsx:1281-1286`. Plan §2 names the alarm's props
as `project_kind`, `rate_source='none'`, `project_id` — `project_kind` is the one
segmentation the plan asks for, and it is hard-coded `null` at the only call
site, so every event is indistinguishable. *Fix:* add the project kind to the
week read's embed (`project:projects(name, studio_id, kind)`) and pass it, or drop
the prop and record why.

**n6 — the rate alarm never fires for scoped rows.** *Confidence: high.*
`rateUnresolved` is emitted only from `EntryRow` (`:1279-1287`), which renders in
`scope === 'mine'` only. `ScopeEntryRow` renders `rate_source='none'` rows (it
computes `provenance.kind === 'pending'` and prints "rate pending") without
emitting. Plan §2: *"fired wherever a row renders or returns with
`rate_source='none'`"* — the studio and member scopes, i.e. exactly where an
admin would notice unpriced hours, are silent. *Fix:* emit from `ScopeEntryRow`
too; the emitter already dedups per entry per session.

**n7 — three emitters defined with no call site, and not in the plan's event list.**
*Confidence: high.* `apps/designer-portal/src/lib/analytics/document-events.ts`
`timerStarted` (`:190`), `timerStopped` (`:196`), `exportTaken` (`:240`) —
`grep documentEvents.time.` finds five call sites, none of them these three. Plan
§2 names two events for W1 and plan §3 names five for W2; these three are
additions to the owned file with no caller. `exportTaken` is the sharpest case:
the `Export week → Accounts` button is 250 lines away in the same work and does
not call it. *Fix:* call `exportTaken` from the export button now (it is one line
and the data is in hand), and either move `timerStarted`/`timerStopped` to the
lane that owns `document-time-provider.tsx` or delete them until that lane
lands — the canonical-names doc comment already records them as the vocabulary.

**n8 — `hoursMemberScopePending` can go stale and silently mis-scope a later open.**
*Confidence: medium.* `apps/designer-portal/src/lib/document/open-hours-scope.ts:21-29`
sets a module value; only `HoursLedger`'s mount effect clears it
(`hours-ledger.tsx:147-150`). `studio-drawer.tsx:577` keys the sheet on
`open?.key === 'hours'`, so if the Hours sheet is **already** mounted when
`openHoursForMember` fires, `openBook('hours', null)` does not remount it: the
click does nothing visible *and* the value survives, so the next time the sheet
mounts it silently opens on that stale person.
*Fix:* clear `hoursMemberScopePending` from `openHoursForMember` on a microtask,
or carry the person in the event `detail.context` and let the drawer pass it
through `sheetContext` the way every other pre-addressed sheet does.

**n9 — house-sheet §A drift in new markup.** *Confidence: high.*
`docs/design/house-sheet/SPEC.md` §A4 — *"Truncation: none. `text-overflow:
ellipsis` must not appear. Wrap."* — against new `truncate` classes at
`hours-ledger.tsx:992`, `:1017`, `:1163`, `:1166` and
`account-studio-page.tsx:1617`. §A3 — seven named steps, *"No inline
`font-size`"*, and `.t-money` (DM Mono 15px, tabular-nums) for *"every ledger
figure"* — against new `text-[12.5px]` / `text-[15px]` / `text-[13px]` /
`text-[11px]` and money rendered in the body family at `text-[15px]`
(`ScopeRollup:934-942`, `MemberProjectTotal:1053-1068`) and in `font-mono
text-[11px]` on the bucket rows. All of it matches the file's pre-existing idiom,
so this is conversion debt rather than a new invention — but it is new markup on
a surface this program is rewriting, and the money steps are the ones §F-B
amended the sheet for. *Fix:* at minimum swap `truncate` for wrapping on the new
rows (the two-line member/document block has room) and put the two grand totals
on `.t-money`.

**n10 — the group-by picker misses the 44px target the lens idiom carries.**
*Confidence: high.* `hours-ledger.tsx:956-968` has no `min-h-11`, unlike the lens
at `:537` and its model `people/directory/scope-lens.tsx:51`; house sheet §A5's
`.act` box is `min-height: 44px`. Five 11px uppercase words with a ~17px hit box,
on the sheet the plan explicitly wants walked at 390px.
*Fix:* add `min-h-11` to the group-by buttons.

**n11 — the two disclosure acts announce no state.** *Confidence: high.*
"The entries" (`hours-ledger.tsx:624-632`) and the per-row "Note"
(`:1201-1209`) toggle content with no `aria-expanded` / `aria-controls`. A
screen-reader user hears the label flip text but not that a region opened.
*Fix:* `aria-expanded={showEntries}` / `aria-expanded={showNote}` on the two
`DocumentAction`s.

**n12 — an emptied rate field is discarded in silence.** *Confidence: high.*
`studio-rate-rows.tsx:67-72`: `rateInputToCents('')` returns `null` and `save`
returns with no error and no write — correct per the 00598 CHECK (and there is no
DELETE policy, so the old rate stands) — but the field is left visibly empty
while the rate is still in force, until something re-renders it.
*Fix:* restore `open`'s value into the input on an empty blur, or say in the help
line that clearing a field leaves the last dated rate standing.

### NOTE

**t1 — ruling owed: HT-29's "act-bearing or nothing" shipped as "the row always,
the act sometimes".** `desk-contents.tsx:348` hangs `HoursInHandAct` beneath a
Hours doorway row that still renders unconditionally. Plan §3 reads *"the
`hours: 'time in hand'` card stays **act-bearing or absent**"*. Removing the row
outright would make the Hours sheet unreachable from the Contents index, so the
gap is a ruling question for Kody, not a code choice. The impl report's judgment
call #1 covers the *figure* half (correctly — R95 forbids a count there) but not
the *absent* half.

**t2 — HT-11 is unsatisfied in a file this lane edited, and the `?? true` default
survives.** The ledger's batch-add row (`hours-ledger.tsx:759-808`) is a capture
surface with no `billable` control, and `useCreateTimeEntry` still writes
`billable: input.billable ?? true` (`packages/supabase/src/hooks/use-time-tracking.ts:376`)
— HT-11 ruled "Yes to both" on the explicit control and the deletion of the
default. Plan §4 assigns HT-11 to W3, so this is an ownership note rather than a
defect of this lane; flagging it because the brief named HT-11 as in force and
because the lane did touch both files.

**t3 — new raw-PostgREST reads inside components.** `ScopeEntryNote`
(`hours-ledger.tsx:1219-1231`) and `HoursInHandAct`
(`desk-contents.tsx:80-100`) each call `createBrowserClient()` and query a table
directly rather than through a `@patina/supabase` hook, against the repo
convention. No ad-hoc `fetch` to a NestJS service anywhere (checked), and
`hours-ledger.tsx` already carried five such reads, so this is the file's idiom —
but `desk-contents.tsx` had **no** Supabase read at all before this commit and
now owns one, plus a `QueryClientProvider` requirement its suite had to grow.
*Fix (optional):* move both into `packages/supabase` hooks
(`useTimeEntryNote(entryId)`, `useStudioUnbilledTime()`).

**t4 — `useTimeEntryLedger` has no `enabled` guard.** `use-time-tracking.ts:760-785`
(pre-existing on the integration branch, not this diff): mounted with every
filter null it selects the whole fact view. In this sheet it is only mounted
behind an act and always with at least one filter, so it is latent — worth an
`enabled: Boolean(studioId || userId || projectId)` before another caller finds it.

**t5 — the new spec leaves three of the wave's own claims unpinned.**
`__tests__/hours-ledger-scope.test.tsx` exercises `owner` and `member` only —
the plan's assertion is *"absent for a plain `member`, present for
`owner`/`admin`"*, and `admin` is untested. Nothing pins (a) the rate-pending
doorway being owner/admin-only, (b) "rate pending" actually rendering in the
sheet rather than only in `timeRateProvenance`'s unit spec, or (c) the stamp
door's absence for a non-admin. Also note the spec's HT-30 assertion leans on
`text.indexOf('3h 00m')` matching the grand total first — the bucket row carries
the same string, so it passes on ordering luck as much as on structure.

---

## 3 · What this review did NOT verify

- **No SQL test run, no `supabase db reset`** — this stage does not own the DB.
  Lane A's `supabase/tests/**` coverage of `00598`–`00607`/`00615`/`00620` is
  taken as given; the SQL was read, not executed.
- **No e2e, no browser walk.** `test:e2e` is not in this lane's gate list and
  `e2e/document/hours.spec.ts` does not exist (M8). The lens has not been seen at
  1440 / 1024 / 390 by this reviewer, and the Chrome extension was not connected
  for the implementer either — so the only runtime evidence for this wave is the
  implementer's own SELECT walk in `W1W2-portal-impl.md` §3, which this reviewer
  did not re-run.
- **`packages/supabase` lint / vitest not run** (`patina-verification`: no
  resolvable flat config outside designer-portal; `@patina/supabase`'s `test` is
  vitest and not in this lane's gate list).
- **client-portal and manufacturer-portal type gates not run** — nothing in the
  diff touches them, and `@patina/supabase`'s type-check plus the admin build
  (the repo's strictest gate) both pass.
- **Prod untouched.** No `db push`, no deploy, no Strata read.
- The 201 pre-existing lint warnings were not audited; only the delta (n4) was
  attributed.
