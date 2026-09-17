# L4 — Correspondence · verification re-review

Reviewer: fresh context, did not write the lane and did not write the first review.
Branch `client-page-2/l4` at `87badbaa027aa44c05b2f6803768cb88eab13997`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4` (read-only; no edits, no git writes).
Fix round read: `git diff d74f068ca 87badbaa0` — 12 files, +1138/−114, of which one is the impl note.
Prior review: `l4-review.md` (1 blocker, 11 majors, 8 minors, 5 nits). Fix round documented at the
end of `l4-impl.md` ("Fix round — L4 Correspondence").

All line citations below are at `87badbaa0`, paths relative to the repo root.

## Gate output (run by this review, verbatim)

```
$ pnpm --dir .../agent-cpc-l4/apps/client-portal type-check

> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal
> tsc --noEmit

(no output — clean)
```

```
$ pnpm --dir .../agent-cpc-l4/apps/client-portal test -- threshold making

Test Suites: 32 passed, 32 total
Tests:       619 passed, 619 total
Snapshots:   0 total
Time:        5.2 s, estimated 7 s
Ran all test suites matching /threshold|making/i.
```

```
$ pnpm --dir .../agent-cpc-l4/apps/client-portal test -- correspondence

PASS src/lib/threshold/__tests__/correspondence.test.ts
PASS src/hooks/__tests__/use-project-correspondence.test.tsx
PASS src/components/threshold/__tests__/correspondence.test.tsx

Test Suites: 3 passed, 3 total
Tests:       59 passed, 59 total
```

No sandbox failures; nothing needed a sandbox-disabled retry. The lane's quoted numbers (619, 59)
reproduce exactly. Working tree is clean apart from the sandbox's own `.env*` read denials, which
are environmental and touch nothing in the lane.

## Blocker and majors — verified one by one against the diff

| # | Claim | Verified | Where |
|---|---|---|---|
| 1 | blocker · empty "Previously" | **FIXED** | `threshold.tsx:673-686` gates at the call site (`hasRecord \|\| replyHeadsTheRecord ? <Letters …/> : undefined`), with `hasRecord` at `:657`; `previously.tsx:52`'s `!correspondence` guard is now reachable. Page-level test `threshold.test.tsx` › "the post" › "keeps Previously silent when there is neither back matter nor post" asserts `#previously` is absent. |
| 2 | major · mute label never flips | **FIXED** | `use-project-correspondence.ts:137-143` awaits `invalidateQueries({queryKey:['comms','threads']})` after `mutateAsync`. Confirmed that is the right prefix: `commsKeys.threads()` = `['comms','threads',params]` (`use-comms.ts:122-123`) and `useMuteThread` alone invalidates only `commsKeys.thread(id)` (`use-comms.ts:438-440`). Invalidation refetches active observers regardless of `staleTime`, so the word turns. |
| 3 | major · floating mute promise, silent refusal | **FIXED** | `correspondence.tsx:349-355` — `void mute.toggle(...).catch(...)`, `console.error`, `refused` state; the alert line at `:369-373` uses the same `role="alert"` + `var(--color-error)` as `WriteBack` (`REFUSAL_CLASS`, `:29`). |
| 4 | major · changed rule counted non-letters and her own hand | **FIXED** | `correspondence.ts:117-124` — `letterMoments` filters `isLetter(message) && message.sender_id !== readerId`, sharing the single `isLetter` predicate at `:77-79` with `toLetters` (`:93`). |
| 5 | major · every house's notices under one house | **FIXED, with a new gap** | `correspondence.ts:196-201` filters on `noticeProjectId()` (`:189-194`: `metadata.project_id`, else the `/projects/<id>` segment of the deep link, else drop). The filter is correct; what it drops is new finding **N1** below. |
| 6 | major · account-wide `{ids:'all'}` on every arrival | **FIXED** | `useMarkNoticesRead()` now takes `string[]` and no-ops on an empty list (`use-project-correspondence.ts:167-188`); the page passes `correspondence.unreadNoticeIds` (`threshold.tsx:303`), built from `notice.unread` (`use-project-correspondence.ts:85-88`), itself `!metadata.read_at` (`correspondence.ts:207`) — the same field `/inbox` read (`inbox/page.tsx:54-56`). The route's array branch re-scopes to `user_id` server-side (`api/inbox/mark-read/route.ts:64-77`), so the narrowed call is safe. |
| 7 | major · `useMarkThreadRead` never called | **FIXED** | `useMarkLettersRead()` at `use-project-correspondence.ts:155-158`; fired at `threshold.tsx:302` with the thread id. `useMarkThreadRead` calls `rpc_mark_thread_read` and invalidates unread + thread + thread-list (`use-comms.ts:381-398`), so `last_read_at` now advances. |
| 6+7 | timing | **SOUND** | The two marks ride a second ref-guarded effect that waits for `postPending` to clear (`threshold.tsx:296-310`), not the mount effect (`:283-290`) — necessary, because at mount the ids are not known. The `markedPost` ref makes it once-per-project; the `onSettled` invalidation of `['inbox']` (`use-project-correspondence.ts:177-179`) cannot re-trigger it. |
| 8 | major · attachments lost | **FIXED (read side)** | `correspondence.ts:81-86` maps `filename ?? storage_path.split('/').pop() ?? 'Attachment'`; rendered as enclosure lines at `correspondence.tsx:135-150`, mounted per letter at `:297`. Verified the data is actually there: `useThreadMessages` selects `'*, sender:…'` (`use-comms.ts:277-279`) and `CommsMessage.attachments` is a real column (`use-comms.ts:76`), so this is not a no-op fix. Send-side attachments remain unimplemented and are disclosed in the impl note — accepted as out of lane. |
| 9 | major · no way to write back without a standing note | **FIXED** | `threshold.tsx:655-656` computes `replyHeadsTheRecord`; the single `writeBack` element goes to the note (`:665`) or to the head of `Letters` (`:679`), never both. `Letters` renders `reply` first (`correspondence.tsx:263`). Asserted at `threshold.test.tsx` › "heads the record with the reply when no note is standing". |
| 10 | major · doorstep count one higher than the marks | **FIXED** | `derive.ts:551` — `if (standing) changed.add('note');`, `standing` being the same binding used at `:501,510`. |
| 11 | major · notices popped after settle | **FIXED** | `use-project-correspondence.ts:105-108` — `noticesQuery.isPending` is in the settle expression. |
| 12 | major · notice deep links dropped | **FIXED as far as this page can** | `noticeAnchor()` (`correspondence.ts:172-180`) maps a retired route's first known path segment onto a region of this page (`ANCHOR_BY_SEGMENT`, `:160-170`); the receipt carries it as an in-page anchor (`correspondence.tsx:198-205`, and inside the fold at `:225-233`). Verified the four targets exist: `#letterbox` (`letterbox.tsx:95`), `#doorstep` (`doorstep.tsx:68`), `#mat` (`mat.tsx:72`), `#previously` (`previously.tsx:56`). Absolute `http(s)` links resolve to `null` and are dropped — which is exactly the message-notification rows, whose emitter writes absolute URLs (`comms-notification-dispatch/index.ts:196-201`); the impl note discloses this as the retirement plan's to rewrite. |

**Minors and nits.** All eight minors and all five nits are also in place and were spot-checked:
13 → `useInboxNotificationsRealtime()` at `use-project-correspondence.ts:72`; 14 → `hasEarlierLetters`
/ `readEarlierLetters` (`:90-102`) and the "Further back" act (`correspondence.tsx:304-318`);
15 → "Hold the letter notices" / "Send the letter notices again" (`correspondence.tsx:367`);
16 → `oneLine`/`isTruncated` exported from `previously.tsx:31,37` and used at `correspondence.tsx:158,168`;
17 → new hook cases for `useMuteLetters`, `useMarkLettersRead`, `toNotices` through the hook
(`use-project-correspondence.test.tsx:198,226,260`); 18 → moved to the page, where the decision
actually lives (`threshold.test.tsx` "the post" block); 19 → `originalFetch` stashed and restored
(`use-project-correspondence.test.tsx:273-277`); 20 → `console.error('write-back refused', reason)`
(`correspondence.tsx:62`); 21 → the three `useMemo`s hoisted (`use-project-correspondence.ts:74-88`);
22 → `useId()` (`correspondence.tsx:45-46`); 23 → the comment now credits `useThreads({projectId})`
with the filing (`correspondence.ts:53-62`); 24 → the mute act on its own line under the details
column (`mat.tsx:130-132`); 25 → `NoticeReceipt.detail` off `preview ?? message ?? body`
(`correspondence.ts:138-147`), printed in the fold (`correspondence.tsx:217-224`).

**Fix-round claim that does not fully hold.** The impl note says of finding 5: "Verified against the
emitters: `invoice-reminders`, `comms-notification-dispatch` and their peers already put `project_id`
in the job data". True for `invoice-send` (`index.ts:332-343`), `invoice-reminders`
(`index.ts:406-417` and the designer row at `:188-200`), `proposal-send` (`index.ts:381-388`) and
`comms-notification-dispatch` (`index.ts:301-303`, carried into `notification_log.metadata` by
`notification-dispatch`). Not true of the two named in N1.

## New defects the fix round introduced

**N1 · major · high · `apps/client-portal/src/lib/threshold/correspondence.ts:189-201`**
The project filter drops client-facing notices whose emitter stamps neither `metadata.project_id`
nor a `/projects/<id>` deep link, and two live emitters are in that class:
`supabase/functions/proposal-nudge/index.ts:150-162` inserts an `in_app` row with
`user_id: proposal.client_id` and metadata `{proposal_id, subject, message, deep_link:'/proposals/<id>'}`,
and `supabase/functions/_shared/decision-notify.ts:312-327` (`decisionNotificationMetadata`) writes
`{decisionId, kind}` on the email rows the inbox feed also surfaces. Both rendered on `/inbox`
(`useInboxNotifications` filters only by `user_id` and channel); on the Threshold they now render
nowhere at all. Worse after retirement: because `unreadNoticeIds` is drawn from the *filtered* list
(`use-project-correspondence.ts:85-88`), those rows are never marked read either, so they sit
unread forever in `useUnreadInboxCount` with no surface that can clear them. Note that
`notify_client_attention` itself (migration `00534`, `:147-157`) only ever writes
`deep_link = '/proposals/<id>' | '/invoices/<id>' | '/decisions/<id>'` — the project id survives
solely because its three callers happen to pass it in `p_metadata`. *Fix: fall back to resolving the
row's `entity_id` / `proposal_id` / `invoice_id` / `decision_id` against this project's own ids
before dropping, or stamp `project_id` at the two emitters and say so in the retirement plan.*

**N2 · minor · high · `apps/client-portal/src/components/threshold/threshold.tsx:673-686` with `previously.tsx:52,68-71`**
Blocker 1's fix leaves one empty-region state of its own: when `replyHeadsTheRecord` is true and
`hasRecord` is false — a thread exists, no note stands, no printable letter, no notice, no closed
instrument — the slot is still handed down, so the page prints the "Previously" heading over an
empty `<ul>` with nothing under it but the "Write back" act. A section named Previously that holds
nothing previous is the same fault as blocker 1 one state along, and it is reachable on a freshly
opened project thread. The new page-level silence test does not cover it (it sets `threadId: null`).
*Fix: when `!hasRecord`, mount the reply outside `Previously` (its own line under the mat or the
note's place), or give `Previously` a heading-suppressed mode for a correspondence-only body.*

**N3 · minor · medium · `apps/client-portal/src/hooks/use-project-correspondence.ts:59-60,105-108`**
The settle gate folds in three queries but not the session. `readerId` comes from `useAuth()`, whose
`useSession` resolves asynchronously (`use-auth.ts:9`), and nothing holds the mapping back while it
is `null`. In that window `toLetters` files every letter as `'studio'` — wrong hand, wrong typeface,
"the studio" in the dateline — and `letterMoments` counts the client's own letters as changes, which
is precisely the fault finding 4 was fixed to remove. The window is narrow (the comms round trips
normally land after the session does) but it is not closed by construction. *Fix: add the session's
loading state to `isPending`, or hold `letters`/`sentAts` empty until `readerId !== null`.*

**N4 · nit · medium · `apps/client-portal/src/lib/threshold/correspondence.ts:174-179`**
`ANCHOR_BY_SEGMENT[segment]` is an unguarded object-literal lookup over an emitter-controlled path,
so a deep link containing `constructor`, `toString`, `valueOf`, `hasOwnProperty` … returns an
inherited `Object.prototype` member — truthy, typed `string` by TS, and rendered straight into
`href`. Only theoretically reachable, but the guard is one call.
*Fix: `Object.prototype.hasOwnProperty.call(ANCHOR_BY_SEGMENT, segment)`, or a `Map`.*

**N5 · nit · low · `apps/client-portal/src/components/threshold/correspondence.tsx:209-236`**
`<div id={bodyId}>` renders for every receipt, foldable or not, so an unfoldable notice carries an
empty element with a generated id that no `aria-controls` points at. *Fix: move the `<div>` inside
the `foldable` branch.*

**N6 · nit · low · `apps/client-portal/src/lib/threshold/correspondence.ts:160-170`**
An `invoices` deep link resolves to `#letterbox`, but the letterbox draws only the *current*
invoice (`letterbox.tsx:95-160`), so a notice about a settled or superseded invoice lands on a
letterbox that does not hold it. The anchor is honest about the region and not about the
instrument; worth one line in the retirement plan rather than code.

## Checks that came back clean on the fix round

- **Hooks discipline, still.** Every hook in `WriteBack` (`correspondence.tsx:40-46`) and
  `MuteLetters` (`:344-345`) precedes the early return; `Notice`'s `useState`/`useId` are at the top
  of a real component (`:153-154`); the three `useMemo`s are hoisted out of the return
  (`use-project-correspondence.ts:74-88`). The second reading-mark effect's deps are all stable
  (`markLettersRead`/`markNoticesRead` are `useCallback`s over react-query `mutate`), and the ref
  guard cannot be defeated by the `['inbox']` invalidation it causes.
- **Exactly one `WriteBack`.** `threshold.tsx:656` builds one element and routes it; nit 22's
  `useId()` makes a second mount harmless anyway.
- **Shared-file discipline held.** The fix round's shared-file deltas are `previously.tsx` +2
  (two `function` → `export function`), `mat.tsx` net +2 (the slot on its own line), `derive.ts` +1
  (the `standing` guard), `the-note.tsx` untouched. `threshold.tsx` grew by the second effect and
  the slot gating. The merge shape the first review predicted (import block, `loading` expression)
  is unchanged.
- **Security.** The narrowed mark-read is strictly *less* reach than before: the route's array
  branch scopes `.eq('user_id', user.id)` before and during the update
  (`api/inbox/mark-read/route.ts:64-77,98-102`), and the page can now only name ids it already
  received under RLS. `toNotices`' project filter is a client-side narrowing of an already
  reader-scoped query, so it removes exposure and adds none. No new cross-account or cross-project
  read path.
- **Voice and VISION §6.** No badge, tab, header or "AI"; acts are all `ScoredAction`; the two
  refusal lines are `role="alert"` in `var(--color-error)` per `door-gate.tsx`; the mute act now
  reads in page voice.
- **Gates.** `type-check` clean, 619/619 and 59/59 reproduced. The two pre-existing failures named
  in both rounds (`src/lib/data/__tests__/orders.test.ts`, `src/lib/__tests__/portal-access.test.ts`)
  are outside this lane's paths and were not re-run here.

**Verdict: MERGEABLE_WITH_FIXES — 0 blockers, 1 new major (N1). The prior blocker and all eleven
prior majors are fixed in the diff, and all thirteen minors/nits with them. N1 is a content-loss
regression that the integration lane (or the retirement plan) must close before `/inbox` is retired;
N2 and N3 are small and local. Nothing here needs the lane re-run: `type-check` and
`test -- threshold making` both pass at `87badbaa0`.**
