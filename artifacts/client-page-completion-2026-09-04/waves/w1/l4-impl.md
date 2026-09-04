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
