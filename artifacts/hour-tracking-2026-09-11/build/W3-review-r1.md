# W3 — adversarial review, round 1

**clean = false** — 0 blockers, 3 majors, 13 minors, 8 notes.

**Reviewed** `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal log --oneline origin/hour-tracking/integration..hour-tracking/portal`
→ `8c63ff3d4`, `d7d0ce16f`, `014d81ad4`, `0dd74dde8`, `959ead009` (31 files, +3243 / −196), full diff of every touched file read.
**Against** plan-v2 §0 + §4, `rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W3-impl.md`.

---

## 1 · Gates, run by the reviewer, verbatim

| Gate | Result |
|---|---|
| `supabase db reset --workdir …/agent-portal` | **CLEAN** — `Finished supabase db reset on branch main.` `{"target":"local","version":"","message":"Reset local database."}` exit 0 |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **9 / 9 green**, expected-fail 0, unexpected-fail 0. `time_log_rpc_test.sql PASS` |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` | **total 31 · green 29 · unexpected-fail 2** — `design_requests_test.sql` (FAIL 3b), `studio_titles_test.sql` (FAIL f). See N-3: **pre-existing, unrelated, reproduced independently** |
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, exit 0) |
| `pnpm --filter @patina/designer-portal test` | **Test Suites 578 passed / 578 · Tests 7347 passed / 7347 · Snapshots 1 · 26.3s** (includes all six new/extended W3 specs the plan names) |
| `pnpm --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — grep of the warning list shows **no W3-touched file contributes one**. (Impl reported 202; I measure 201. Immaterial.) |
| `pnpm --filter @patina/admin-portal build` | **green** — the strictest gate, exercised after the `packages/supabase` edit |
| `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm --filter @patina/designer-portal test:e2e -- e2e/document/hours.spec.ts --project=chromium --reporter=line` | **7 passed, 14 skipped (1.6m)** — both new W3 cases green in chromium. Run against a hand-started dev server on :3000 from the worktree with `.env.local` → `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` + `DATA_MODE=live` (verified by reading the file), because `playwright.config.ts`'s `webServer.env` hard-codes `:54321`. **Dev server killed; port 3000 free.** |
| `python3 ./scripts/generate-legacy-grants.py` (worktree's own copy) | `baseline + 2643 replayed statements`, `git status` on the seed **empty** → the committed seed is exactly what regeneration produces (§0.20) |
| `pnpm db:generate` + `git diff --quiet packages/supabase/src/database.types.ts` | **exit 0** — types in sync (§0.19) |

**Commit hygiene** (`git show --stat` per commit): five commits, Conventional Commits (`feat(time):` ×4, `test(time):` ×1). **`supabase/config.toml` appears in none of them.** Only `apps/designer-portal/next-env.d.ts` is dirty in the worktree — generated, pre-existing, uncommitted. No `git add -A` evidence. Migration, types, grants seed and SQL test land in ONE commit (`8c63ff3d4`) — correct grouping.

**Numbering**: `00608` only; `00609` deliberately unused, as §0/§4 require. No collision observed on the reachable refs.

---

## 2 · Findings

### MAJOR

---

**W3-R1-M1 — the "Log time" verb is a dead act on the Desk.**
*Severity: major · Confidence: confirmed (read + traced end to end)*
**Location** `apps/designer-portal/src/lib/document/registry.tsx:321-343` (new `log-time` entry in `STUDIO_VERBS`) ×
`apps/designer-portal/src/components/document/desk-contents.tsx:303-314, 383-400`.

**Finding.** The verb was added to `STUDIO_VERBS`, which `command-bar.tsx:867` maps into the ⌘K "Begin" section (correct, and what the plan asks for). But `STUDIO_VERBS` has a **second consumer**: `desk-contents.tsx:383` renders `STUDIO_VERBS.filter(v => v.key !== 'capture-lead').map(...)` as the Desk's own "Begin" column, and dispatches through

```ts
const verbHandlers: Record<string, () => void> = {
  'capture-lead': …, 'open-project': …, 'draft-proposal': …,
  'draw-invoice': …, 'add-maker': …,
};                                    // ← no 'log-time'
const openVerb = (key: string) => () => {
  verbHandlers[key]?.();              // ← optional call: silently nothing
  documentEvents.wayfinding.contentsActed({ key, kind: 'verb' });
};
```

`DeskContents` is rendered unconditionally on `/desk` (`app/(document)/desk/page.tsx:455,461`). So **"Log time · an hour with nothing in hand" now stands on the Desk, in the Studio Contents index, and clicking it does nothing** — it fires a wayfinding event and returns. This is exactly the "⌘K leak" class the command-bar's own comments warn about ("clicking silently no-op'd"), reintroduced on the Desk. Nothing in the tree goes red: jest is green, and `desk-contents.test.tsx` does not assert every verb dispatches.

**Exact fix.** In `apps/designer-portal/src/components/document/desk-contents.tsx`:
```ts
import { openLogTime } from './log-time-sheet';
…
const verbHandlers: Record<string, () => void> = {
  …,
  'log-time': () => openLogTime(),
};
```
(`LogTimeOverlay` is mounted in `(document)/layout.tsx:105`, which wraps `/desk`, so the event has a listener there.) Add a case to `desk-contents.test.tsx` asserting that every key in `STUDIO_VERBS` has a handler — a registry-driven assertion, so the next verb cannot repeat this:
```ts
it('dispatches every registry verb it renders', () => { /* for each STUDIO_VERBS key … */ });
```

---

**W3-R1-M2 — HT-24 is honoured on two of the four W3 capture surfaces; the other two still force `'design'`.**
*Severity: major (reads as a ruling contradiction — orchestrator may escalate) · Confidence: confirmed*
**Location** `apps/designer-portal/src/components/document/hours-ledger.tsx:358` (`useState('design')`) and `:1024-1035` (activity `<select>` with **no** `<option value="">`); `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx:1152` (`useState('design')`) and `:1251-1266` (same select, no empty option).

**Finding.** HT-24 is a **ruled input of W3** (plan §4 header) and reads: *"`activity` is **recorded rather than defaulted** — and is it ever made required? **Recorded, never required.** Print 'activity not set' honestly."* The ⌘K form (`log-time-sheet.tsx:238`) and the log strip (`log-strip.tsx:136`) both do this correctly. The **Hours add row** and the **phone's manual sheet** still initialise `activity` to `'design'` and offer no way to leave it unset — every hour typed on those two surfaces is silently attributed to design work the member never claimed. That is the precise defect HT-24 names, surviving on two surfaces this wave modifies.

`W3-impl.md` §6 declares the ledger add row a deliberate scope line on the grounds that "the plan's HT-24 row names `log-strip.tsx:30` and `:36` specifically". That is true of the plan's *file table*, and it is not a defence: HT-24 is listed as a ruled input for the whole wave, `mobile-sheets.tsx` is not named by that argument at all, and the wave's own thesis is that four surfaces must give one answer to one question (`time-capture.tsx`'s file doc: *"They were four different answers to the same question before"*). Two of the four still answer differently.

**Exact fix.** In both files:
```ts
const [addActivity, setAddActivity] = useState('');      // hours-ledger.tsx:358
const [activity, setActivity] = useState('');            // mobile-sheets.tsx:1152
```
and add, as the first child of each activity `<select>`:
```tsx
<option value="">activity not set</option>
```
`batchAdd` must then send `activity: addActivity || null` (`hours-ledger.tsx:427` currently sends `activity: addActivity`); the mobile path already sends `activity: activity || null`. Extend `hours-ledger-add-row.test.tsx` and `mobile-sheets.test.tsx` with the assertion `command-bar-log-time.test.tsx` already carries ("leaves the activity unset unless it is chosen").

---

**W3-R1-M3 — the ⌘K verb does not default the project to the document in hand.**
*Severity: major (named falsifier in the review brief) · Confidence: confirmed*
**Location** `apps/designer-portal/src/components/document/log-time-sheet.tsx:66` (`useState('')`) and `:99-108` (the open-effect resets minutes, activity, rateRole and date — never `projectId`).

**Finding.** `log-time-sheet.tsx` contains **no reference to `useDocumentTime`, `heldProjectId` or any held document** (grep: 0 hits). With a document open, ⌘K → "Log time" opens a form whose Document field is empty (or, worse, still carries whatever was picked *last time the form was opened*, because the reset effect does not clear it — so it can silently propose a stale, unrelated document). The Hours ledger's own add row **does** seed from context (`hours-ledger.tsx:356`, `initialContext?.projectId`), so the two doors behave differently for the same act.

Two consequences: the "five interactions" claim costs an extra pick whenever a document *is* open, and the stale-`projectId` carry-over is a genuine mis-filing hazard (open the form, pick Okonkwo, cancel; open it a week later and Okonkwo is pre-selected with a fresh minutes field).

**Exact fix.** In `log-time-sheet.tsx`:
```tsx
import { useDocumentTime } from '@/hooks/document-time-provider';
…
const { heldProjectId } = useDocumentTime();
…
useEffect(() => {
  if (!open) return;
  setProjectId(heldProjectId ?? '');   // ← seed, and clear the stale carry-over
  setNote(null); setMinutes(''); setActivity(''); setRateRole(null);
  setDate(isoDateValue(new Date()));
  seededFor.current = null;
  …
}, [open, heldProjectId]);
```
`LogTimeOverlay` is mounted inside `DocumentTimeProvider` (`(document)/layout.tsx:76 → :105`), so the hook resolves. Pin it in `command-bar-log-time.test.tsx` with a held-document case and a "reopening the form does not carry the last document" case.

---

### MINOR

**W3-R1-m1 — the chain-out strip for another tab's row says "that document".**
*minor · confirmed* — `document-time-provider.tsx:387` `projectName: 'that document'`. `log-strip.tsx:104` prints `offer.projectName` as the headline `<strong>`, so a member who had two tabs open gets a strip reading *"that document · 12m in hand"*. The row carries `project_id`; the name is one lookup away.
**Fix:** resolve the name from the `['document-hours-projects']` cache (already populated by `useTimeCaptureProjects`) or from the running-timer query's `project` join, and fall back to `'that document'` only when the lookup misses.

**W3-R1-m2 — the server-side stop applies no R64 abandonment bound and emits no `time_timer_stopped`.**
*minor · confirmed* — `00608` `start_timer`'s incumbent-stop computes `duration_minutes` from raw wall clock (`GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - started_at))/60))`), with none of the client's `closeOut()` protections (R64's `RUNAWAY_IDLE_SECONDS`, the sub-60s `timer_auto` discard, the idle annotation). `offerFromServerStop` then proposes that raw number verbatim. The exposure is narrow — `hold()` runs `closeOut()` on any timer it can see first, so only a row opened in the race window reaches this path — but when it does, an overnight tab writes its full wall-clock hours and the HT-17 instrument never fires for it.
**Fix:** either (a) note the exposure in the migration banner and accept it, or (b) in `offerFromServerStop`, bound `suggestedMinutes` the way `closeOut` does and fire `documentEvents.time.timerStopped({ surface: 'document', duration_minutes, adjusted: true, idle_minutes: null, idle_ratio: null })`. (b) is ~6 lines and keeps HT-17's instrument honest.

**W3-R1-m3 — `start_timer` can dead-end on a raw `unique_violation` with nothing left to report it.**
*minor · high (traced, not reproduced)* — `00608`'s stop `UPDATE … WHERE user_id = v_user AND duration_minutes IS NULL` runs under the caller's RLS, whose UPDATE policy is `((user_id = auth.uid()) AND is_project_team_member(project_id))` (§0.17). If a member's running row sits on a project they have since been removed from, the UPDATE matches **zero** rows (silently), the INSERT trips the partial unique index, attempt 2 does the same, and attempt 2 `RAISE`s a bare `unique_violation`. The comment calls that "a real fight over one person's clock"; it is in fact an unrecoverable stuck clock. And W3 deleted the whole `quiet`/`TimeToast`/23505 apparatus (`use-time-tracking.ts`), so `hold`/`resume` `.catch(() => null)` swallow it: **auto-start stops working with no message anywhere.**
**Fix:** add a third arm — if after two attempts a `duration_minutes IS NULL` row still exists for `v_user` that the caller cannot update, raise a named, actionable error (`RAISE EXCEPTION 'start_timer: a timer is running on a document you can no longer write to (%), ask an owner to close it', v_blocked_project USING ERRCODE='55006'`). A one-case addition to `time_log_rpc_test.sql` pins it.

**W3-R1-m4 — the strip shows "not billable · $150.00".**
*minor · confirmed* — `log-strip.tsx:191-200` passes the **live pill state** as `entry.billable` but the **stored** `rated_amount_cents` to `RateReadout`. `timeRateProvenance` returns `{kind:'nonbillable', label:'not billable'}` when `billable === false` (`authority-hours.ts:152`), and `RateReadout` then still appends `amount > 0 ? fmtUsd(amount) : null` (`time-capture.tsx:196`). Toggling the pill to non-billable therefore renders `not billable · $150.00` until the write lands and the row re-classifies.
**Fix:** in `RateReadout`, suppress the amount when the provenance is `nonbillable`: `provenance.kind === 'nonbillable' ? null : (amount > 0 ? fmtUsd(amount) : null)`.

**W3-R1-m5 — the HT-25 seating sentence lies to a member who holds only a non-priceable seat.**
*minor · confirmed* — `log-time-sheet.tsx:87` `willBeSeated = Boolean(projectId) && myRoles?.length === 0`. `useMyRateRoles` filters the roster to the four roles a rate card can price (`use-time-tracking.ts:1073-1078`), so a member seated as `client` or `previous_lead` returns `[]` and is told *"You are not on this roster — logging here seats you as a support designer"*. They are on the roster; whether 00597's trigger re-seats them is a different question the sentence does not ask.
**Fix:** have the sheet read roster membership rather than priceable roles for this sentence (a second small selector, or widen `useMyRateRoles` to return `{ priceable, seated }`), and word it off `seated`.

**W3-R1-m6 — the Log time dialog has no focus trap and no focus restore.**
*minor · confirmed* — `log-time-sheet.tsx:161-166` declares `role="dialog" aria-modal="true"` and focuses the first field, but Tab walks straight out into the page behind (the backdrop `<button>` is `tabIndex={-1}`, and nothing wraps focus), and on Escape/close focus is not returned to the ⌘K trigger. Every other document overlay in the tree is reached through `DocSheet`/`active-dialog`, which handle this.
**Fix:** mount the sheet through the existing overlay primitive (`components/document/overlays/…`) rather than a bare `createPortal`, or add a minimal trap (`focus-trap` loop on Tab/Shift+Tab across `layer.querySelectorAll(FOCUSABLE)`) plus `previouslyFocused.current?.focus()` in the close path.

**W3-R1-m7 — the new date field uses an inline font-size utility.**
*minor · confirmed* — `hours-ledger.tsx:1017-1021` `className="… py-1.5 text-[11px] …"`. House sheet §A forbids inline font sizes in favour of the type scale. Defensible — it copies its two siblings verbatim and looking different would be worse — but it is a **new** element carrying the violation forward.
**Fix:** either move the whole add row onto the type scale in one pass (`t-body-sm`/`doc-type-control`), or record the exemption in the wave report so the house-sheet sweep knows it is deliberate.

**W3-R1-m8 — the add row is now five columns with no responsive stack.**
*minor · high* — `hours-ledger.tsx:990` `grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]` (was four). At 390 the document select, minutes, date, activity and Add share one row; the date input alone wants ~110px. Not covered by the e2e (the new browser cases run at 1440 only, and the existing 390 case exercises the scope lens, not the add row).
**Fix:** `min-[700px]:grid-cols-[1.2fr_0.7fr_0.9fr_1fr_auto]` with a stacked `grid-cols-2` below, and extend `hours.spec.ts`'s 390 case to open the add row.

**W3-R1-m9 — the mobile sheet keeps its state after a successful add.**
*minor · confirmed* — `mobile-sheets.tsx:1313-1315` clears `minutes` and closes the form only. `pickedProject`, `activity`, `rateRole` and `note` persist, so reopening the sheet proposes the previous document and role with an empty minutes field.
**Fix:** clear all five in the success path (and clear `note` when `formOpen` flips on).

**W3-R1-m10 — `p_studio_id` has no portal caller and the argument-list test forbids one.**
*minor · confirmed · stage-4-adjacent* — `useCreateTimeEntry` sends eleven `p_*` args and omits `p_studio_id` (`use-time-tracking.ts:461-473`), and `use-time-tracking-authority.test.tsx:137-149` pins that eleven-key list exactly. Correct for W3 (W4's portal work is stage 4), but the pin will have to be edited when internal time lands — worth naming so it is not read as a regression then.
**Fix:** none now; add `// W4 will add p_studio_id — update this list with it` beside the assertion.

**W3-R1-m11 — the `{started, stopped}` envelope is pinned only against a mock.**
*minor · medium* — `useStartTimer` reads `(Array.isArray(data) ? data[0] : data)?.started` (`use-time-tracking.ts:586-591`). `start_timer` is `RETURNS TABLE(started project_time_entries, stopped project_time_entries)`, so PostgREST's actual envelope shape (array-of-one, nested composites, and how a NULL `stopped` serialises) is asserted nowhere against a live API — `use-time-tracking-authority.test.tsx` supplies the shape it expects. If it is ever flat, the hook throws the misleading *"The timer did not start. Try again."* after the timer **did** start.
**Fix:** one live probe in `time_log_rpc_test.sql` is not enough (it goes through plpgsql, not PostgREST). Either add a `curl`-level assertion to the wave report, or defend the hook: `const row = Array.isArray(data) ? data[0] : data; const started = row?.started ?? (row?.id ? row : undefined);`

**W3-R1-m12 — a weak negative assertion.**
*minor · confirmed* — `command-bar-log-time.test.tsx:186-192`:
```ts
expect(sent).not.toEqual(expect.objectContaining({
  hourlyRateCents: expect.anything(), ratedAmountCents: expect.anything(), rateSource: expect.anything(),
}));
```
`objectContaining` requires **all three** to match, so the negation passes as soon as **one** is absent. A regression that reintroduced `hourlyRateCents` alone would go green.
**Fix:** three separate assertions, or `expect(Object.keys(sent)).toEqual(expect.not.arrayContaining(['hourlyRateCents','ratedAmountCents','rateSource','billingState']))`.

**W3-R1-m13 — SQL case (b) is sequential, not concurrent.**
*minor · confirmed, honestly documented* — the plan's test row asks for "two **concurrent** `start_timer` calls"; the file calls it twice in one session and says so in its header. The retry loop's second arm (a genuine `unique_violation` from another session) is therefore **never executed** by any test.
**Fix:** either accept and say so in the wave report, or drive the second session from `dblink`/a second `psql` in `run-sql-tests.sh` — the loop is the one piece of `00608` with no coverage.

---

### NOTES

**N-1 — HT-35 (disclosure + opt-out) absent.** Correct: the orchestrator scoped it to stage 4 with lane B / W7. `document-events.ts:209-220` already carries the standing comment. No action.

**N-2 — W4's portal follow-commits absent.** Correct per the orchestrator's scope ruling. `log_time` accepts `p_project_id NULL` + `p_studio_id`, so the door is open for them.

**N-3 — two RLS suites are red, and `supabase/tests/rls/` has no `KNOWN_FAILURES.md`.** I reproduced both independently (`design_requests_test.sql` FAIL 3b; `studio_titles_test.sql` FAIL f). Independently verified as **not W3's**: `grep -c 'project_time_entries\|log_time\|start_timer'` = **0** in both files; last touched by `ad74e34c8`, long before this program; W3's entire DB delta is two new functions and four GRANT/REVOKEs, and the regenerated seed diff is exactly those four. **`supabase/tests/rls/KNOWN_FAILURES.md` does not exist**, so the runner reports them as *unexpected* every time any lane runs the suite. **Ruling owed:** someone should either fix them or create that file — otherwise every remaining wave's RLS gate reads red for reasons unrelated to it.

**N-4 — all three new document pickers filter to `status === 'active'`.** `log-time-sheet.tsx:207`, `mobile-sheets.tsx:1233`, and the pre-existing `hours-ledger.tsx:998`. This is deliberate and *tested* (`command-bar-log-time.test.tsx`: "An archived document is not a place to log an hour"), and it matches the shipped ledger, so it is not a defect. It is worth stating out loud that it brushes HT-13: an hour remembered a month late on a document closed in the meantime has no door. **Ruling owed if Kody disagrees** — the hook's own doc comment says "every project the caller can read", and every consumer narrows it.

**N-5 — `00609` correctly unused.** HT-13 needs no DDL; the backdated mark is derived from `created_at - started_at` in `isBackdatedEntry` and asserted both ways (31/29 days) on the add row, on a written row, and in the ⌘K form.

**N-6 — the bare `t` guard is sound.** Verified by reading both handlers and the mount order: `RegistryShortcuts` (`layout.tsx:96`) registers its `window` listener before `LogTimeShortcut` (`:104`), so on `g` `t` the chord consumer runs first, clears `chordArm.at`, and calls `preventDefault()`; `LogTimeShortcut` then yields on `e.defaultPrevented`. `isEditableTarget` covers `SELECT` as well as `INPUT`/`TEXTAREA`/contenteditable, and `anOverlayIsOpen()` additionally requires focus to be on `<body>`. The e2e case passes in a real browser. Moving the armed flag from a component ref to module scope is the right call and does not change `RegistryShortcuts`' own behaviour.

**N-7 — HT-26, HT-36, HT-11, HT-41, R69, §0.22, §0.12 all check out.**
· HT-26 — `RateReadout` never renders empty: `timeRateProvenance` returns `rate pending` for `rate_source='none'` and `rate not recorded` otherwise (`authority-hours.ts:171-174`). · HT-36 — no surface in this diff reads or writes `notes`; `log_time`'s `p_notes` has no caller. · HT-11 — `billable` is required on `CreateTimeEntryInput` and `StartTimerInput`, the `?? true` at `:320` is deleted, and both RPCs raise on NULL (SQL case (c)). · HT-41 — `RateRoleChip` returns null below two roles, `RateRoleMark` is read-only where the row is already written (correct, given `aab_`'s immutability on `rate_role`). · R69 — no new ticking clock; the strip's mark, the backdated word and the role mark are all static text. · §0.22 — the strip's `Log` with nothing touched still writes (seeded pill, seeded minutes, `activity ''→null`); no new required field on the stop payload. · §0.12 — the invoiced lock is untouched and `time_log_rpc_test.sql` case (d) proves it still refuses to re-date a billed hour.

**N-8 — data access is through hooks.** No raw PostgREST in any component; the two new reads (`useTimeCaptureProjects`, `useMyRateRoles`) live in `packages/supabase`, are exported from `hooks/index.ts`, and reuse the ledger's canonical `['document-hours-projects']` key with an **identical** `select('id, name, status')`, so the shared cache cannot serve a shape either reader does not expect. No `withMockData` wraps any W3 path (grep: 0), so `DATA_MODE=live` was not needed to keep a broken query honest — there is no fallback to mask one. No `<a>` for an in-app route. No flag anywhere in the diff (grep `useFeatureFlag` in touched files: 0).

---

## 3 · Done-when, re-checked by the reviewer

| Plan §4 done-when | Verdict |
|---|---|
| 45-minute call in 5 interactions from ⌘K, `source='command_bar'` | **Partially.** `source='command_bar'` is pinned at the RPC boundary (jest) and stored/read back in SQL case (a). Interaction count is 5 only with nothing in hand; with a document open it is 6 because of **M3**. Not driven end to end in a browser (the e2e stops short of submitting — an honest, declared posture). |
| Yesterday's entry lands on yesterday | ✅ SQL case (d) (400 days), plus both jest add-row/⌘K date assertions. |
| 31 days back renders the quiet mark | ✅ 31-yes / 29-no, on the add row, on a written row, and in the ⌘K form. |
| Mobile sheet with nothing held either logs or says why | ✅ picker + `Nothing in hand` + disabled Add + inline refusal; the old auto-closing effect is gone. **But** the sheet still forces `activity='design'` — **M2**. |
| Log-strip entry carries explicit `billable` and prints its reason | ✅ for `billable`; the reason *sentence* is on the ⌘K form / add row, the strip prints stored provenance — correct, and stated in the impl. Marred by **m4**. |
| Two tabs → one running row, one offer strip | ✅ at the server (SQL case (b), sequential — **m13**) and at the provider (`offerFromServerStop` case). Not driven with two real tabs. |

---

## 4 · What I did not verify

- **Two real browser tabs** racing `start_timer` (the retry loop's second arm) — no test in the repo exercises it (**m13**).
- **The PostgREST wire shape** of `start_timer`'s composite `RETURNS TABLE` — only asserted against a mock (**m11**).
- **Firefox / WebKit** — the playwright run was `--project=chromium`; the other 14 cases skipped.
- **Any mobile viewport for the add row** — the 390 e2e case covers the scope lens, not the new five-column grid (**m8**).
- **Prod** — nothing was pushed, deployed, or run against Strata. All SQL ran against the isolated `patina-hours` stack (`127.0.0.1:54422`); the shared 54321/54322 stack was never touched.
- **`pnpm --filter @patina/supabase test`** — not in the wave's gate list; not run.
- **Lint outside designer-portal** — per `patina-verification`, no other package's ESLint config resolves; not claimed either way.
