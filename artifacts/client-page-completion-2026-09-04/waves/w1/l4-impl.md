# L4 — Correspondence (implementation report)

Branch `client-page-2/l4` · worktree `.codex/worktrees/agent-cpc-l4` · base `26b15145e` (origin/main).

Absorbs `/messages` and `/inbox` into the Threshold: a reply under the note, the letters and
the notices filed in Previously, the mute act on the mat, and message moments feeding the
since-yesterday ticks.

## What was built

**1. The project's thread, found the way `/messages` found it.**
`pickProjectThread` takes the threads `useThreads({ projectId })` returns — that hook has already
dropped the ones the reader left or archived — and picks the thread filed under this project,
preferring `kind === 'project'` over a direct message carrying the same `project_id`, and the most
recently spoken-in where there is more than one. Null when the house has no thread.

**2. "Write back" under the note.** `TheNote` gained a `reply` slot; `WriteBack` fills it. A
tertiary act unfolds a labelled field (`aria-expanded`/`aria-controls`), a secondary "Send it"
posts through `useSendMessage` and fires `clientEvents.messageSend(threadId)` exactly as
`/messages` did, and the field collapses to a mono receipt "Sent &lt;day month&gt;". A refused send
prints one alert line in `var(--color-error)` (door-gate's precedent) and keeps the client's words
in the field. With no thread it renders nothing at all.

**3. The letters in Previously.** `Previously` gained a `correspondence` slot; `Letters` fills it.
Thread messages render newest-first as dated letters: the studio's hand keeps the note's display
face (it is a quotation, so first person is correct), the client's own is plain body type, and
`data-letter-from` carries the distinction. Deleted, system and empty messages are dropped — a
record does not hold a place for "(message deleted)".

**4. The inbox as receipts.** `useInboxNotifications` rows render under "What the house sent" in
Previously's own line grammar (date · label · dotted leader · **Sent**), titled by `/inbox`'s own
`previewOf`/`formatType` resolution, copied. They are marked read by the reading mark: the same
`useEffect` that fires `mark_project_read` now also fires `useMarkNoticesRead()`.

**5. Mute/unmute on the mat.** `Mat` gained a `correspondence` slot; `MuteLetters` fills it with a
tertiary act over `useMuteThread` — "Stop telling me about letters" / "Tell me about letters again".
Nothing renders when the house has no thread.

**6. `changed`, additively.** `ThresholdInput` gained one optional field `messageSentAts`; a letter
newer than the reading mark adds both `note` and `previously` to `changed`. Empty on a first
reading, like every other tick.

**7. The settle gate.** `correspondence.isPending` joins `threshold.tsx`'s `loading` expression.
`changed.size` is printed on the doorstep, so letters arriving a beat after the page settles would
bump a number the client had already read — the one thing this surface may not do.

## Files

New:
- `apps/client-portal/src/lib/threshold/correspondence.ts` — pure mappers: `pickProjectThread`,
  `toLetters`, `letterMoments`, `toNotices`.
- `apps/client-portal/src/hooks/use-project-correspondence.ts` — `useProjectCorrespondence`,
  `useWriteBack`, `useMuteLetters`, `useMarkNoticesRead`.
- `apps/client-portal/src/components/threshold/correspondence.tsx` — `WriteBack`, `Letters`,
  `MuteLetters`.
- `apps/client-portal/src/lib/threshold/__tests__/correspondence.test.ts` (17 tests, incl. the
  four `deriveThreshold` changed-rule cases — kept out of `derive.test.ts` to avoid a merge
  conflict with the other lanes).
- `apps/client-portal/src/components/threshold/__tests__/correspondence.test.tsx` (11 tests,
  incl. a "the mounts" block asserting the three slots — also kept out of `the-note.test.tsx`,
  `previously.test.tsx` and `mat.test.tsx` for the same reason).
- `apps/client-portal/src/hooks/__tests__/use-project-correspondence.test.tsx` (7 tests).

Edited (shared files, minimal):
- `threshold.tsx` — two imports, one hook call + one mark call, `messageSentAts` on the derive
  input, one term in `loading`, and three slot props (`reply`, `correspondence` ×2).
- `mat.tsx` — one optional `correspondence?: ReactNode` prop, rendered between "Your details" and
  "Leave the house".
- `the-note.tsx` — one optional `reply?: ReactNode` prop, rendered between the enclosures and
  "Earlier letters".
- `previously.tsx` — one optional `correspondence?: ReactNode` prop; the early return now also
  stands for correspondence alone (a house with a letter but no closed instrument still has back
  matter).
- `derive.ts` — one optional input field and one four-line changed rule.
- `__tests__/threshold.test.tsx` — a `jest.mock` for the new hook module plus its `beforeEach`
  defaults. Required: that suite mocks `@patina/supabase` with an explicit factory, so an
  unmocked new hook would read `undefined` there.

## Hooks used (all pre-existing; none added to `@patina/supabase`)

`useThreads`, `useThreadMessages`, `useThreadRealtime`, `useSendMessage`, `useMuteThread`,
`useInboxNotifications` — all from `@patina/supabase`. `useAuth` for the reader's id.
`POST /api/inbox/mark-read` (`{ ids: 'all' }`) for the notices, the route `/inbox` itself posted to.

## Copy sources

- `previewOf` / `formatType` → `src/app/inbox/page.tsx:20-36` (notice titles).
- `clientEvents.messageSend` → `src/app/messages/page.tsx:186` (send telemetry).
- Mute semantics → `src/components/messages/ThreadSettingsMenu.tsx:70-76` (act reworded for the
  mat; the mutation payload is identical).
- Error ink and `role="alert"` → `src/components/threshold/door-gate.tsx:496-507`.
- Line grammar for the notices → `src/components/threshold/previously.tsx` (date · leader · state).

## Deviation from the plan, stated

The plan names `useMarkAllClientNotificationsRead` for the notices. That hook
(`packages/supabase/src/hooks/use-client-notifications.ts:140`) writes a **localStorage** read-map
keyed `decision-<id>` / `proposal-<id>` for the derived `useClientNotifications` feed — a different
id space from `notification_log`, which is what `useInboxNotifications` reads. Calling it with
notification_log ids would be a silent no-op and the notices would never be marked read. The act
therefore goes through `/api/inbox/mark-read`, which is exactly what `/inbox`'s own "Mark all read"
posted, on the same mount as `mark_project_read`. Inventory §2 lists that route as one that
"dies with `/inbox` … unless the Threshold grows an inbox" — it now has a caller.

## Gate output (verbatim)

```
$ pnpm --dir apps/client-portal type-check

> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal
> tsc --noEmit


$ pnpm --dir apps/client-portal test -- threshold making
PASS @patina/client-portal src/components/threshold/__tests__/threshold.test.tsx

Test Suites: 32 passed, 32 total
Tests:       596 passed, 596 total
Snapshots:   0 total
Time:        7.108 s, estimated 10 s
Ran all test suites matching /threshold|making/i.

$ pnpm --dir apps/client-portal test -- correspondence
PASS @patina/client-portal src/components/threshold/__tests__/correspondence.test.tsx

Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        3.509 s
Ran all test suites matching /correspondence/i.
```

`npx eslint` (run from `apps/client-portal`) over the twelve files this lane touches: **0 errors,
0 warnings** (no output). Linting the whole `src/components/threshold src/lib/threshold src/hooks`
trees reports 10 errors / 5 warnings, all in files this lane does not touch
(`use-qr-auth.ts`, `use-touch-gestures.ts`, and other pre-existing `react-hooks` findings).

Full `pnpm --dir apps/client-portal test`: **133 of 135 suites, 1432 of 1433 tests pass.** The two
failures are pre-existing on `origin/main` and unrelated to this lane —
`src/lib/data/__tests__/orders.test.ts` cannot resolve `../orders` (that source file does not exist
in the tree), and `src/lib/__tests__/portal-access.test.ts` fails one
`foreignPortalFromDomain('manufacturer')` assertion.

## Not verified

- **No browser or e2e pass.** Nothing here has been rendered against a real database, a real comms
  thread, or a real `notification_log` row. Jest and `tsc` only.
- **No `@patina/supabase` change**, so no vitest / admin-build gate was owed or run.
- **The reply lives inside `TheNote`, as the plan specifies** — so a house with a comms thread but
  no *standing* `project_note` shows its letters in Previously with no way to write back. Creating
  a thread where none exists is also out of lane (no client-side hook mints one). Both are
  consequences of the lane as written, not defects found; the integration lane should decide
  whether the reply also belongs beside the letters.
- **`markNoticesRead()` marks every unread `notification_log` row for the reader**, not only this
  project's — the same breadth `/inbox`'s single "Mark all read" control had. On a multi-project
  client (L8) arriving at one house therefore clears the notices of all of them.
- **Realtime is subscribed but not exercised.** `useThreadRealtime(threadId)` is wired; the test
  asserts only that it is called with the thread id.
- Coverage was not measured per-file; the full suite was run without `--coverage`.

---

# Fix round — L4 Correspondence

Review read in full: `artifacts/client-page-completion-2026-09-04/waves/w1/l4-review.md`
(1 blocker, 11 majors, 8 minors, 5 nits). Every blocker and major is fixed; 8 of 8 minors and
5 of 5 nits are fixed. Nothing was rejected outright — the two findings whose fix is partly a
disclosure (8, 12) are noted below with exactly what is code and what is reported.

## Fixed, by finding number

**1 · blocker — empty "Previously" over a house with none.** Gated at the CALL SITE, not inside
`Previously`: `threshold.tsx` now computes `hasRecord` / `replyHeadsTheRecord` and passes the
`correspondence` slot only when one of them holds, so the truthy-element trap cannot fire.
`previously.tsx`'s `!correspondence` guard stays and is now honest.
(`threshold.tsx:652-690`, `previously.tsx:52`.)

**2 · major — the mute label never flipped.** `useMuteLetters` now awaits
`queryClient.invalidateQueries({ queryKey: ['comms', 'threads'] })` after the mutation, because the
mat reads `muted` off the THREAD LIST while `useMuteThread` invalidates only the thread detail.
Fixed in the portal hook, not in `@patina/supabase` — shared-file edits stay minimal.
(`use-project-correspondence.ts:130-142`.)

**3 · major — floating mute promise, silent refusal.** `MuteLetters` holds `refused` state,
calls `void mute.toggle(...).catch(...)`, `console.error`s the reason, and prints the same one-line
`role="alert"` in `var(--color-error)` that `WriteBack` prints. The hook still rejects, so the
refusal is the component's to state, not the hook's to swallow.
(`correspondence.tsx:318-352`.)

**4 · major — the changed rule counted things that are not letters.** `letterMoments(messages,
readerId)` now shares `toLetters`' `isLetter` predicate (no deleted, no system, no empty body) and
drops the reader's own hand. Her own reply no longer ticks the doorstep, and a system message no
longer points at a change she cannot find. (`correspondence.ts:75-118`.)

**5 · major — every house's notices under one house.** `toNotices(notifications, projectId)` files
by `metadata.project_id`, falling back to the `/projects/<id>` segment of the deep link, and drops
a row that names neither. Verified against the emitters: `invoice-reminders`,
`comms-notification-dispatch` and their peers already put `project_id` in the job data that becomes
`notification_log.metadata`. (`correspondence.ts:169-201`.)

**6 · major — account-wide `{ids:'all'}` on every arrival.** `useMarkNoticesRead()` now takes
`string[]` and posts nothing when the list is empty; the page passes
`correspondence.unreadNoticeIds` — this house's unread notices only. `NoticeReceipt` carries
`unread` off `metadata.read_at`, the same field `/inbox`'s `unreadIds` read.
(`use-project-correspondence.ts:152-174`, `correspondence.ts:41`.)

**7 · major — `useMarkThreadRead` never called.** New `useMarkLettersRead()` wraps it; the page
fires it with the thread id. Without this, `comms_thread_participants.last_read_at` never advanced
and every other surface went on counting letters read here. (`use-project-correspondence.ts:145-150`.)

**6 + 7 together — where they fire.** Not on the `mark_project_read` mount effect: at mount the
post has not arrived, so the ids are not known yet. They ride a SECOND ref-guarded effect that
waits for `correspondence.isPending` to clear, then marks once per project.
(`threshold.tsx:288-310`.)

**8 · major — attachments silently lost.** `CorrespondenceLetter.enclosures` is mapped with
`/messages`' exact naming (`filename ?? storage_path.split('/').pop() ?? 'Attachment'`, id
`<msgId>-att-<i>`) and each letter prints them as enclosure lines in the note's own enclosure
grammar. **Sending attachments is explicitly out of lane** and is not implemented: it needs the
media-service upload path behind `MessageAttachmentUploader`, which is a surface of its own; the
retirement plan should treat "attach on send" as an unabsorbed act of `/messages`.
(`correspondence.ts:79-85`, `correspondence.tsx:133-150`.)

**9 · major — no way to write back without a standing note.** `Letters` gains a `reply` slot at its
head and the page decides where the reply lives: under the note when one stands, at the head of the
record when none does. Exactly one `WriteBack` is ever mounted.
(`threshold.tsx:652-690`, `correspondence.tsx:231-249`.)

**10 · major — doorstep count one higher than the marks on the page.** `derive.ts` adds `'note'`
for a new letter only when a note is standing; `'previously'` always. (`derive.ts:546-553`.)

**11 · major — the notices popped a beat after the page settled.** `noticesQuery.isPending` folded
into the hook's settle gate. (`use-project-correspondence.ts:104-107`.)

**12 · major — notice deep links dropped.** `noticeAnchor()` maps a retired route's link onto the
region of THIS page that answers for it — `invoices`/`orders` → `#letterbox`,
`decisions`/`proposals`/`reviews` → `#doorstep`, `documents`/`scans` → `#mat`,
`messages`/`inbox` → `#previously` — and the receipt carries it as an in-page anchor (acts never
leave the page). **Reported, not fixed:** an absolute `http(s)` link and a link to a route with no
home on the Threshold resolve to `null` and are dropped rather than faked; those emitters have to
be rewritten by the retirement plan. (`correspondence.ts:147-201`, `correspondence.tsx:181-232`.)

**13 · minor — asymmetric realtime.** `useInboxNotificationsRealtime()` mounted beside
`useThreadRealtime`. (`use-project-correspondence.ts:71`.)

**14 · minor — the record stopped in silence at 50 letters.** The hook exposes `hasEarlierLetters`
/ `readEarlierLetters` / `isReadingEarlierLetters` over `fetchNextPage`, and the record prints a
"Further back" act when there is more. (Named "Further back", not "Earlier letters" — the note
already owns that phrase for earlier notes, and two acts of one name on one page is a lie.)

**15 · minor — first-person voice from the client.** "Hold the letter notices" /
"Send the letter notices again". (`correspondence.tsx:344`.)

**16 · minor — the notice line broke Previously's affordance rule.** `oneLine` / `isTruncated` are
now exported from `previously.tsx` (additive) and the notice label runs through them, so the two
lists rule the same way and a long subject cannot wrap past the dotted leader.

**17 · minor — hook-suite coverage gaps.** Added: `useMuteLetters` payload + the thread-list
invalidation + its refusal propagating; `useMarkLettersRead`; `toNotices` exercised THROUGH the
hook (project scoping, unread ids); the pagination act; the notices settle gate.

**18 · minor — false-positive silence test.** Corrected in substance rather than in form. The
reviewer's suggested assertion (`correspondence={<Letters letters={[]} notices={[]} />}` renders
nothing) is not achievable — a parent cannot see that a child rendered `null`. The empty case is
now asserted where it is actually decided, at the page: `threshold.test.tsx` › "the post" ›
"keeps Previously silent when there is neither back matter nor post". The component test keeps
"handed nothing, it says nothing" with a comment pointing at the page-level test.

**19 · minor — leaked `global.fetch`.** Stashed in a const and restored in `afterEach`.

**20 · minor — the refusal reason went nowhere.** The fixed line stays (never print an error string
as content); `console.error` now carries the caught reason to the browser log. Asserted in the test.

**21 · nit — `useMemo` inside the returned object literal.** Hoisted to named consts.

**22 · nit — hardcoded ids in `WriteBack`.** `useId()` for the field wrapper and the textarea.

**23 · nit — misleading doc comment on `pickProjectThread`.** Filter kept as a defence; the comment
now says `useThreads({projectId})` does the filing server-side.

**24 · nit — the mute act read as part of "Your details".** Moved out of the acts row onto its own
line inside the details column (`mat.tsx`, +2 net lines, still a purely additive slot). Asserted.

**25 · nit — two identical notice lines.** `NoticeReceipt.detail` carries `/inbox`'s body-preview
chain (`preview ?? message ?? body`); a notice with a detail (or a subject too long for the line)
folds open to show it.

## Rejections

None. Every finding was accepted. The two partial fixes (8's send-side, 12's unmappable links) are
disclosed above and in "Still not verified" rather than quietly dropped.

## Shared-file discipline, after the fix round

`previously.tsx` +2 net (two `function` → `export function`), `mat.tsx` +2 net (the slot moved to
its own line), `the-note.tsx` unchanged from the first round, `derive.ts` +1 net (the `standing`
guard). `threshold.tsx` grew by the second reading-mark effect and the slot gating. Still all
additive; the merge conflicts the reviewer predicted (import block, `loading` expression) are
unchanged in shape.

## Gate output (verbatim)

```
$ pnpm --dir .../apps/client-portal type-check

> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l4/apps/client-portal
> tsc --noEmit

(no output — clean)
```

```
$ pnpm --dir .../apps/client-portal test -- threshold making

Test Suites: 32 passed, 32 total
Tests:       619 passed, 619 total
Snapshots:   0 total
Time:        8.181 s
Ran all test suites matching /threshold|making/i.
```

```
$ pnpm --dir .../apps/client-portal test -- correspondence

PASS src/components/threshold/__tests__/correspondence.test.tsx
PASS src/hooks/__tests__/use-project-correspondence.test.tsx
PASS src/lib/threshold/__tests__/correspondence.test.ts

Test Suites: 3 passed, 3 total
Tests:       59 passed, 59 total
```

```
$ npx eslint src/components/threshold src/hooks/use-project-correspondence.ts \
    src/hooks/__tests__/use-project-correspondence.test.tsx src/lib/threshold

(no output — 0 errors, 0 warnings)
```

619 tests up from 596 (+23 in `threshold`/`making`); 59 up from 35 in the lane's own suites.
The two pre-existing failures named in the first round (`lib/data/__tests__/orders.test.ts`,
`lib/__tests__/portal-access.test.ts`) are outside this lane's paths and were not touched.

## Still not verified

- No browser or e2e pass; jest and `tsc` only. Nothing has been rendered against a real
  `notification_log` row, so the project-scoping filter (finding 5) is proved by unit test and by
  reading the emitters, not by production data.
- Sending an attachment (finding 8) is not implemented — reading them is.
- Deep links with no Threshold home (finding 12) are dropped, not rewritten; the emitters are the
  retirement plan's to fix.
- Coverage was not measured per-file; suites were run without `--coverage`.
