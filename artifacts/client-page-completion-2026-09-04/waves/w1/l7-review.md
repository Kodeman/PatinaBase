# L7 — Your details · adversarial review

Reviewer: fresh context, did not write this lane.
Subject: `client-page-2/l7` @ `0b006ab2e294b3cd9de4c3b3a58de4bb0a15f8d2`
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l7` (read-only pass; no edits, no git writes)
Diff: 5 files, +993 / −11 — one new file (`details-sheet.tsx`, 634 lines), one new test (339), three small edits.

## Gates (run by me, verbatim)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l7/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l7/apps/client-portal test -- threshold making
Test Suites: 31 passed, 31 total
Tests:       589 passed, 589 total
Snapshots:   0 total
Time:        5.088 s
Ran all test suites matching /threshold|making/i.
```

Both match the lane report's claims. No sandbox retry was needed.

## Absorb-list roll call (check 1)

| Old route | Act | In place now? |
|---|---|---|
| `/account` | profile edit (name, phone; email read-only) | ✅ `ProfileSection` |
| `/account` | **avatar upload** (`AvatarUploadField`) | ❌ **not absorbed** — finding 1 |
| `/account` | revoke all sessions | ✅ `SessionsSection`, same hook, redirect preserved |
| `/preferences` | channel + type toggles, quiet hours, digest, reminders | ✅ `NotificationsSection` (merged) |
| `/preferences` | **apply one-click token** (`POST /api/preferences/apply-token`) | ❌ **not absorbed** — finding 2 |
| `/settings/notifications` | prefs (duplicate set) | ✅ merged, same table |
| `/settings/notifications` | SMS row | ⚪ dropped — it was `disabled` + "Coming soon"; consistent with "absence is silence" |
| `/settings/notifications` | per-thread overrides (unmute, change pref) | ✅ `ConversationsSection` |
| `/settings/notifications` | thread row → `/messages/<id>` | ⚪ deliberately dropped (inventory calls the link already broken; L4 owns messages) — correct call |
| data export / erase | — | ⚪ correctly omitted; I re-confirmed `/api/user/data-export` and `/api/user/data-erase` have no caller in this worktree |
| sign-out ("Leave the house") | — | ✅ already in `mat.tsx`, untouched |

## Payload fidelity (check 2)

Verified against `src/app/account/page.tsx`, `src/components/account/ProfileForm.tsx`,
`src/app/preferences/page.tsx`, `src/app/settings/notifications/page.tsx`.

Faithful: `useUpdateProfile({ full_name, phone })` with the same `trim() || null` normalisation and the
same `dirty` rule; `useSignOutAllDevices()` → `router.push('/auth/signin')`; every preference key writes
the same `notification_preferences` columns (I checked `useNotificationPreferences` /
`useUpdateNotificationPreferences` against `app/api/user/preferences/route.ts` — same table, same
`user_id = auth user`, same update-else-insert-with-defaults shape, so the two retired pages really were
writing the same row); `useMuteThread({ threadId, muted: false })` and
`useUpdateThreadNotificationPref({ threadId, pref })` byte-identical; the "invoice reminders … always
arrive right away" business rule carried; the digest and quiet-hours descriptions carried verbatim.
The old `/settings/notifications` `&apos;` literal ("pieces you&apos;ve saved") is silently corrected —
good.

Divergences are findings 6, 8, 10, 16, 17 below.

## Security (check 6)

**No finding.** Every hook resolves the caller's own id server-side: `useProfile` /
`useUpdateProfile` filter `profiles.id = auth.getUser().id`; `useNotificationPreferences` /
`useUpdateNotificationPreferences` filter `notification_preferences.user_id`;
`useMyThreadOverrides` filters `comms_thread_participants.profile_id = userId` and only ever renders the
caller's own thread titles and counterpart names. Nothing in the sheet is keyed by `projectId` or by any
id supplied from the page, so there is no path to another project's or another client's data. The one
authorization the old route enforced that the sheet does not repeat —
`/account`'s server-side `redirect('/auth/signin?callbackUrl=/account')` when `fetchClientProfile()`
returns null — is not skipped in effect: the sheet mounts only inside `Threshold`, which is already
behind the portal's auth middleware and the project fetch. (It does, however, degrade badly on a query
error — finding 5.) `/api/preferences/apply-token`'s `createServiceClient()` is pre-existing and
untouched.

## Findings

1. **major · high** — `apps/client-portal/src/components/threshold/details-sheet.tsx` (whole) /
   `mat.tsx:114` · **`/account`'s avatar upload is not absorbed, and `/account` becomes unreachable.**
   Inventory line 81 names `/account`'s acts as "profile edit, **avatar upload**, session revoke"; the
   sheet delivers two of three. Because `mat.tsx` swapped `href={accountHref}` for `onClick`, and the only
   other links (`layout/client-header.tsx:250`, `layout/mobile-nav-drawer.tsx:76`) die with L8's header
   removal, `AvatarUploadField` becomes dead code the client can no longer reach — a silent loss the
   retirement plan's "delete without loss" goal forbids.
   *Fix:* mount `@/components/account/AvatarUploadField` at the top of `ProfileSection` (it already takes
   `userId` / `currentUrl` / `displayName`, all available from `useProfile`).

2. **major · high** — `details-sheet.tsx` (whole) · **the one-click preference token act is not absorbed.**
   `packages/notifications/src/tokens.ts:109` mints `${baseUrl}/preferences?token=…` into outbound email,
   and `app/preferences/page.tsx:100-140` is the only thing that POSTs it to
   `/api/preferences/apply-token`. `/preferences` is on the ABSORB list (inventory line 113; line 144
   says the API route "dies with `/preferences` unless absorbed"), and the lane report does not mention
   the token at all. Nothing breaks today — the route still exists on this branch — but the retirement
   pass will silently break every emailed unsubscribe link.
   *Fix:* keep `/preferences` as a public token-only shim (or move token application onto the kept
   `/preferences/unsubscribe`) and say so explicitly in the lane report so the retirement lane doesn't
   delete it.

3. **major · high** — `details-sheet.tsx:329-330` (and every `update(...)` call site, 341-478) ·
   **preference writes are completely silent.** `update()` fires `updatePrefs.mutate(updates)` and reads
   neither `isPending`, `isError` nor a `savedAt`; both retired pages rendered a `SaveStatus`
   (`preferences/page.tsx:196-200`, `settings/notifications/page.tsx:132`). Worse,
   `useUpdateNotificationPreferences` has no optimistic update — it only invalidates `onSuccess` — so the
   controlled checkbox does not move until the refetch lands (the old `/settings/notifications` set local
   state first, so it moved instantly), and a failed write leaves the box exactly where it was with no
   word at all. That is a failure the client cannot see, not silence.
   *Fix:* render a `role="status"` line from `updatePrefs.isPending / isError / error` beside the section
   head, the way `ProfileSection` already does at :283-297.

4. **major · medium** — `apps/client-portal/src/app/preferences/unsubscribe/page.tsx:52,70` ·
   **the kept unsubscribe page links twice into the route L7 absorbs.** `/preferences/unsubscribe` is a
   **KEEP** route (inventory line 66) and its two "manage all your notification preferences" links point
   at `/settings/notifications`. After retirement those are 404s, and the signed-out recipient who lands
   there has no project page from which to open the details sheet — the absorbed surface is unreachable
   for exactly the audience that page serves.
   *Fix:* repoint both links at the kept `/preferences` (per finding 2) and flag the dependency in the
   lane report for the retirement lane.

5. **major · medium** — `details-sheet.tsx:255-256` (also :338, :521) · **a failed query is
   indistinguishable from loading, forever.** `isLoading || !hydrated` renders "Reading the file…" and
   there is no `isError` branch; `useProfile` (`packages/supabase/src/hooks/use-settings.ts:61-82`) and
   `useNotificationPreferences` both *throw* on error, so a network failure or an expired session parks
   the section on a loading line permanently while the app's global QueryCache handler fires a toast
   elsewhere. The old `/account` was a server component that redirected, and both preference pages had an
   explicit error state.
   *Fix:* destructure `isError` and hold the section with a settled sentence ("The file could not be
   read.") rather than a loading line that never resolves.

6. **minor · high** — `details-sheet.tsx:114-128` vs `app/preferences/page.tsx:53-70` ·
   **four timezones silently dropped** (`Asia/Tokyo`, `Asia/Singapore`, `Asia/Dubai`,
   `Australia/Sydney`). Only the browser's own zone is prepended, so a client who set `Asia/Tokyo` on the
   old page and opens the sheet from a US browser gets a `<select>` whose `value` matches no `<option>`:
   the stored setting is misrepresented as blank, and the next interaction overwrites it.
   *Fix:* restore the full 17-entry list and always prepend `prefs.timezone` as well as the browser zone.

7. **minor · high** — `apps/client-portal/src/components/threshold/mat.tsx:107-118` ·
   **the dialog trigger doesn't announce itself.** "Your details" now opens a modal dialog but carries
   neither `aria-haspopup="dialog"` nor `aria-expanded`, so a screen-reader user gets no warning and no
   state.
   *Fix:* thread the open state into `Mat` and set `aria-haspopup="dialog" aria-expanded={detailsOpen}`
   on that `ScoredAction`.

8. **minor · high** — `details-sheet.tsx:603` vs `components/account/ProfileForm.tsx:139-142` ·
   **the confirmation loses the consequence.** The old dialog said "This ends every active session on
   every device, **including this one**. You'll be redirected to sign in."; the sheet asks only "Sign out
   on every device now?". The section blurb above mentions signing in again, but the moment of
   irreversible consent no longer states that the current session dies.
   *Fix:* carry the old sentence into the confirm step.

9. **minor · high** — `details-sheet.tsx:158-172` · **the Escape handler is bound to `document`
   unconditionally.** L5's `papers-sheet.tsx` is specified to mount the same way in the same
   `threshold.tsx` wrapper with the same Esc contract; with both mounted, one Escape closes both, and the
   handlers fight over `preventDefault`.
   *Fix:* attach the listener to `containerRef.current` instead of `document` (the dialog holds focus
   anyway), or guard on `containerRef.current?.contains(event.target as Node)`.

10. **minor · medium** — `details-sheet.tsx:344-346` · **an inherited promise that isn't true.** "Turn off
    to stop all marketing email. Order receipts and account alerts still send." is carried faithfully
    from `preferences/page.tsx:210-213`, but `isChannelEnabled`
    (`packages/notifications/src/preferences.ts:119-131`) gates *every* type on `channels_email`, with no
    transactional bypass — turning the master switch off stops receipts too. Fidelity was the brief, so
    this is inherited rather than introduced, but the sheet is now the only place the client is told this.
    *Fix:* either correct the sentence or fix the dispatcher; do not ship the promise unexamined.

11. **minor · medium** — `details-sheet.tsx:179` · **no body scroll lock.** The overlay is
    `fixed inset-0 overflow-y-auto`, but the page behind still scrolls on wheel/touch over the scrim, so
    the house drifts underneath the sheet.
    *Fix:* set `document.body.style.overflow = 'hidden'` in the open effect and restore it in the cleanup.

12. **minor · medium** — `details-sheet.tsx:180-186` · **the scrim is a page-sized `<button>` outside the
    focus trap.** It sits outside `containerRef`, so it is not trapped but is still in the document's tab
    order and is announced by screen readers as a full-page "Close your details" button competing with the
    labelled "Shut" act.
    *Fix:* give the scrim `tabIndex={-1}` and `aria-hidden="true"` and let "Shut" be the only announced
    close.

13. **minor · medium** — `apps/client-portal/src/components/threshold/__tests__/details-sheet.test.tsx`
    (whole) · **the focus trap and focus restore are untested**, though the lane report ("What is NOT
    verified") states that trap behaviour "is asserted via RTL + fireEvent/userEvent". Esc and the scrim
    are covered; Tab-wrap and return-focus-to-opener are not asserted anywhere.
    *Fix:* add a Tab/Shift-Tab wrap test and a "focus returns to the trigger on close" test, or correct
    the report.

14. **minor · medium** — same file · **missing behaviour cases**: no test for a failed preference write
    (there is nothing to assert until finding 3 is fixed), none for the push / in-app channel toggles,
    none for the timezone select, none for the profile loading or error state.
    *Fix:* add them alongside the finding-3 fix.

15. **minor · low** — `details-sheet.tsx:335` · **"What you hear from us" puts Patina in the first
    person.** The global constraint reserves first person for a quoted note; a grep of the shipped
    `components/threshold/*.tsx` finds "we/us/our" in exactly one code comment and nowhere in copy, while
    second person ("Your details", "the moment you sign") is the established register.
    *Fix:* "What reaches you" or similar.

16. **nit · high** — `details-sheet.tsx:525-533` vs `settings/notifications/page.tsx:305-311` · **the
    thread kind label is dropped.** The old row printed "Project" / "Vendor brief" / "Direct" under the
    title; two threads with the same counterpart now read identically with no way to tell them apart.
    *Fix:* append the kind in muted type beside the name.

17. **nit · high** — `details-sheet.tsx:415-419` vs `preferences/page.tsx:271-272` · **the
    "(your timezone)" suffix on the browser zone is dropped**, so the reader loses the one cue that told
    them which entry is theirs.
    *Fix:* restore the suffix.

18. **nit · medium** — `details-sheet.tsx:514` · **the empty guard keys on the wrong quantity.**
    `if (!isLoading && overrides.length === 0) return null` renders a heading over an empty list whenever
    a row is neither muted nor custom. It is safe today only because
    `useMyThreadOverrides` filters `muted_at.not.is.null,notification_pref.neq.all` server-side
    (`packages/supabase/src/hooks/use-comms.ts:988`) — a coupling nothing states.
    *Fix:* guard on `muted.length + customPref.length === 0`.

19. **nit · medium** — `details-sheet.tsx:44-47` · **field styling drifts from the shipped threshold
    precedent.** Text inputs use `border-b border-[var(--border-default)]` where `door-gate.tsx:467` and
    `wall-gate.tsx:252` use `border-current`, and the field label tracks at `0.1em` where the precedent is
    `0.13em`. (The checkbox class `h-4 w-4 shrink-0 border border-current` *does* match
    `door-gate.tsx:446` — good.)
    *Fix:* match the two shipped values.

20. **nit · low** — `details-sheet.tsx:608` · **first use of the red `da-danger` ink in
    `threshold/`+`making/`.** `variant="danger"` resolves to `.da-danger:hover { color: var(--color-error) }`
    (`app/globals.css:354-355`, `#C77B6E`), and the global constraint reads "no shadows, red/green". The
    token and the variant both pre-exist in this portal, so this may well be sanctioned — but no other
    act on either surface uses it.
    *Fix:* confirm against the design ruling, or use `secondary` and let the confirm copy carry the weight.

21. **nit · high** — `apps/client-portal/tests/e2e/account.spec.ts:28-49` · **the e2e still drives the
    retired surface.** It navigates `/account` and drives `data-testid="account-full-name"` /
    `account-save` / `account-signout-everywhere`; the sheet exposes `details-full-name` /
    `details-phone` and gives Save and the sign-out acts no testid at all.
    *Fix:* add `data-testid="details-save"` and `details-signout-all`, and hand the spec rewrite to the
    integration lane (the plan assigns e2e there).

## Checks that came back clean

- **Hooks discipline (3).** `useId` / two `useRef` / two `useEffect` all sit above the `if (!open) return
  null` at :174 — no conditional hook. Every data hook lives in a child that mounts only when the sheet
  opens, so a closed sheet costs nothing. `document.activeElement` and `addEventListener` are inside
  effects, never at render. Hydration-safe: `threshold.tsx` initialises `detailsOpen` to `false`, so SSR
  renders `null` and the `Intl.DateTimeFormat()` reads at :326 and :410 can never run on the server.
- **Settle-before-speaking / no reversing copy (3).** The sheet mounts in the single final `return` of
  `threshold.tsx:761-769`, which all three body branches (settle / ground floor / house) pass through, so
  "Your details" works in both Path A and Path B, and the sheet is a sibling of `<SinceYesterday>` so it
  can never be dimmed. `--threshold-accent` is declared on that same wrapper (`ACCENT_STYLE`,
  `threshold.tsx:88`), so the sheet inherits the brass despite being `position: fixed`. No z-index clash:
  `z-40` is the highest in `threshold/` + `making/` (next is `z-[4]`).
- **VISION §6 (4).** No shadow (border + 28%-opacity scrim only), no badge, no tab, no header, no
  hamburger; every act is a `ScoredAction`; typography-first; no "AI" anywhere. Only the red note in
  finding 20.
- **Overlay a11y (5).** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` a `useId` heading,
  Esc, scrim-click, an in-sheet "Shut", a live-requeried Tab trap that picks up the quiet-hours fields as
  they appear, initial focus into the sheet and focus returned to the opener on close. Findings 7, 9, 11,
  12 are the gaps.
- **Shared-file discipline (7).** `mat.tsx` is a one-field prop swap and one `href`→`onClick`;
  `threshold.tsx` is one import, one `useState`, one prop change and one mounted element; `derive.ts` and
  `making/*` untouched. Cheap to merge. The one collision to expect at integration is L5's
  `papers-sheet.tsx` mounting in the same wrapper (see finding 9).
- **Tests (8).** 21 new tests, all behaviour-level (what the client sees and what payload leaves), no
  implementation assertions; the `@patina/supabase` module mock lists exactly the eight hooks the file
  imports and the `next/navigation` mock matches the pattern in `making/__tests__`. The fixture prefs
  object carries every column of `NotificationPreferences`, including the designer-only keys the UI
  deliberately omits — a good witness that they stay off-screen.

## Verdict

MERGEABLE_WITH_FIXES — 21 findings, 0 blockers, 5 majors. Land findings 1, 2 and 3 before integration
(a lost avatar act, a lost emailed-token act, and preference writes that fail without a word); 4 and 5
before the retirement pass. The rest can ride the fix round.
