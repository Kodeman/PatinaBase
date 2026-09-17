# L7 — Your details

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l7`
Branch: `client-page-2/l7`, based on `origin/main` @ `26b15145e`

## What I built

Absorbed `/account`, `/preferences` and `/settings/notifications` (the inventory calls the latter
two a duplicate pair to merge) plus sign-out into one in-place sheet: `components/threshold/mat.tsx`'s
"Your details" act now opens `DetailsSheet` instead of navigating to `/account`.

### New file
- `apps/client-portal/src/components/threshold/details-sheet.tsx` — the sheet, mounted once in
  `threshold.tsx`'s outer wrapper (covers both the house body and the ground-floor body, since both
  render `mat`). Four sections:
  1. **Name and number** — full name / phone (editable) + email (read-only) via `useProfile` /
     `useUpdateProfile`. Dirty-tracked Save act; success/error status line. Hydrates from the profile
     query once per profile id, adjusted during render (not in an effect — see lint note below).
  2. **What you hear from us** — merged `/preferences` + `/settings/notifications`: channel toggles
     (email/push/in-app), four preference groups (Projects, Orders, Product alerts, Inspiration &
     marketing — deduped across both retired pages' lists; designer-only keys like `type_new_lead`
     were never on a client page and stayed out), quiet hours (enable + start/end + timezone), digest
     frequency (5-way radio), reminder cadence (2-way radio, with the same "invoice reminders are
     always immediate" copy both retired pages carried, since it states a real business rule).
     `useNotificationPreferences` / `useUpdateNotificationPreferences`.
  3. **Conversations, muted or set apart** — per-thread overrides ported from `/settings/notifications`'
     `MessagesSection`: muted threads get "Unmute" (`useMuteThread`), threads with a custom pref get a
     preference `<select>` (`useUpdateThreadNotificationPref`). Renders nothing when there is nothing to
     show. I did NOT link thread rows to `/messages/<id>` — the inventory flags that link as already
     broken (dead route) and L4 owns the in-place messages surface; this section names the thread, it
     doesn't navigate.
  4. **Every session, everywhere** — "Sign out everywhere" with a confirm step, `useSignOutAllDevices`,
     redirects to `/auth/signin` on success (same behavior as the old `ProfileForm`), reports a failed
     sign-out inline rather than silently pretending it happened.
  - **Data export / erase acts were intentionally omitted.** The inventory (§8, gap 11) found the two
    API routes (`/api/user/data-export`, `/api/user/data-erase`) have no caller anywhere in the app; I
    confirmed that's still true in this worktree. Per the plan ("ONLY if the API routes have callers ...
    → omit and say so") and "absence is silence," no UI references them.
  - Overlay mechanics: `role="dialog"` `aria-modal="true"`, labelled by its own heading; Esc closes;
    Tab is trapped inside; focus moves to the first focusable element on open and returns to whatever
    had focus before (captured via `document.activeElement`, not a ref threaded through `Mat`) on
    close; a click on the scrim or the sheet's own "Shut" act closes it. Paper on paper with a
    hairline — `--bg-surface` sheet on the page's `--bg-primary`, told apart by a `--border-default`
    border and a translucent scrim, no shadow.

### Shared files (minimal touch, per house rules)
- `components/threshold/mat.tsx` — `MatProps.accountHref: '/account'` → `onOpenDetails: () => void`;
  the "Your details" `ScoredAction` swapped from `href={accountHref}` (a `Link`) to
  `onClick={onOpenDetails}` (a button). One-field change: nothing else in the file moved.
- `components/threshold/threshold.tsx` — added `import { DetailsSheet } from './details-sheet'`; one
  new `useState` (`detailsOpen`); `mat` now passes `onOpenDetails={() => setDetailsOpen((open) =>
  !open)}` (toggle, so the same control that opens it also closes it) in place of `accountHref`; one
  `<DetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} />` mounted in the shared
  final `return` (the one wrapper both the house body and the ground-floor body pass through, so
  "Your details" works in both states).
- `components/threshold/__tests__/mat.test.tsx` — updated the fixture and the one test that asserted
  "Your details" was a `Link` to `/account`; it now asserts the button calls `onOpenDetails`.

## Hooks used (none new — all already exported from `@patina/supabase`)
`useProfile`, `useUpdateProfile`, `useSignOutAllDevices` (from `use-settings.ts` / `use-auth.ts`, same
ones `ProfileForm.tsx` used), `useNotificationPreferences`, `useUpdateNotificationPreferences` (same
table/hook `/preferences` used — confirmed `/api/user/preferences` that `/settings/notifications` called
via raw `fetch` hits the same `notification_preferences` table), `useMyThreadOverrides`,
`useUpdateThreadNotificationPref`, `useMuteThread` (same ones `/settings/notifications`' `MessagesSection`
used). No package edit, so the `@patina/supabase` vitest/type-check/admin-build gate does not apply.

## Copy sources
- Profile section: field labels and Save/status wording adapted from
  `apps/client-portal/src/components/account/ProfileForm.tsx`.
- Notification groups/help text: merged from `apps/client-portal/src/app/preferences/page.tsx`
  (`TOGGLE_GROUPS`, digest/reminder copy, quiet-hours block, `COMMON_TIMEZONES`) and
  `apps/client-portal/src/app/settings/notifications/page.tsx` (`CATEGORIES`, channel toggles,
  `MessagesSection`). The "invoice reminders ... always arrive right away" sentence is carried
  verbatim in substance from both pages (a stated business rule, not paraphrased).
- Sessions section: confirm-dialog copy adapted from `ProfileForm.tsx`'s "Sign out everywhere" dialog.

## Gate output (verbatim, run from the worktree)

```
$ pnpm --dir apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(clean, exit 0)
```

```
$ pnpm --dir apps/client-portal test -- threshold making
...
Test Suites: 31 passed, 31 total
Tests:       589 passed, 589 total
Snapshots:   0 total
Time:        13.834 s
Ran all test suites matching /threshold|making/i.
```
(589 = the pre-existing 568 threshold/making tests + 21 new in `details-sheet.test.tsx`, all green;
`mat.test.tsx`'s updated fixture/test also green in this run.)

```
$ npx eslint src/components/threshold/details-sheet.tsx src/components/threshold/mat.tsx \
    src/components/threshold/threshold.tsx src/components/threshold/__tests__/details-sheet.test.tsx \
    src/components/threshold/__tests__/mat.test.tsx
(no output — 0 errors, 0 warnings)
```

One lint fixup along the way worth noting: my first draft hydrated the profile fields inside a
`useEffect`, which `react-hooks/set-state-in-effect` correctly flagged (cascading-render smell). Fixed
by adjusting state during render instead — a `hydratedId` ref-like state compared against
`profile.id`, set directly in the component body — which is the documented pattern for "sync state to
a prop that just arrived" and avoids the extra render.

## What is NOT verified
- No dev-server/browser check — this is a Jest-only pass; the sheet has not been visually rendered in
  either theme, and I did not test viewport/responsive behavior beyond what CSS classes assert.
- `useMyThreadOverrides`, `useProfile`, `useNotificationPreferences` etc. are mocked in every test; no
  test exercises them against a real/local Supabase instance (house rules disallow a local DB reset in
  this lane).
- Focus-trap/Esc/scrim-close behavior is asserted via RTL + fireEvent/userEvent, not with a real
  screen reader or keyboard-only pass.
- Did not verify how `DetailsSheet` interacts with `SinceYesterday`'s dimming — the sheet is mounted
  as a sibling of `<SinceYesterday>`, not inside it, so it should never dim, but I did not add a test
  asserting that specifically.
- Did not touch `/preferences/unsubscribe` (stays a public route per the plan; its middleware fix is
  the retirement plan's job, not this lane's).
- Integration with L1–L6, L8, L9's concurrent edits to `threshold.tsx`/`mat.tsx` is unverified — my
  diff to those two files is deliberately small (see above) to keep the merge cheap, but I have not
  seen the other lanes' diffs.

## Fix round (review: `artifacts/client-page-completion-2026-09-04/waves/w1/l7-review.md`)

Reviewed at `0b006ab2e294b3cd9de4c3b3a58de4bb0a15f8d2`. Verdict was MERGEABLE_WITH_FIXES — 21 findings,
0 blockers, 5 majors. I agreed with all 21 and applied fixes for all of them; two (2 and 21) are
partial by the review's own fix instructions (see below), not rejections.

### Fixed, by finding number

1. **major** — Avatar upload was unreachable. Mounted `@/components/account/AvatarUploadField`
   (`userId`/`currentUrl`/`displayName` from `useProfile`) at the top of `ProfileSection`, guarded on
   `profile` being loaded. New test: `mounts the avatar upload act, absorbed from /account`.
2. **major** — One-click preference token. No code path in this lane deletes or touches
   `/preferences` or `/api/preferences/apply-token` — both are unchanged on this branch and still
   serve the emailed unsubscribe/token flow today. Per the review's own fix ("say so explicitly in
   the lane report so the retirement lane doesn't delete it"): **the retirement plan MUST keep
   `/preferences` alive as a public token-application route** (or move the token POST onto
   `/preferences/unsubscribe`) — it is on the ABSORB list for the UI surface, but its
   `?token=` handler has a real caller (`packages/notifications/src/tokens.ts:109` mints links into
   outbound email) and must not be deleted wholesale. Flagging this loudly for R1–R4.
3. **major** — Silent preference writes. `NotificationsSection` now reads
   `updatePrefs.isPending`/`isError`/`error` and renders a `role="status"` ("Saving…") or `role="alert"`
   line beside the section head, matching `ProfileSection`'s existing pattern. New test:
   `reports a pending write and a failed write beside the section head`.
4. **major** — `/preferences/unsubscribe`'s two "manage preferences" links pointed at the dead
   `/settings/notifications`; repointed both to the kept `/preferences` route.
5. **major** — Failed queries were indistinguishable from perpetual loading. All three data-bearing
   sections (`ProfileSection`, `NotificationsSection`, `ConversationsSection`) now destructure
   `isError` and hold on "The file could not be read." instead of "Reading the file…" forever. New
   tests in each section's describe block.
6. **minor** — Restored the full 17-entry timezone list (`Asia/Tokyo`, `Asia/Singapore`, `Asia/Dubai`,
   `Australia/Sydney` were missing) and the select's option set now always includes `prefs.timezone`
   as well as the browser's zone, so a stored non-US zone never renders as a blank/mismatched value.
   New test: `carries the full timezone list and always offers the stored zone`.
7. **minor** — Threaded `detailsOpen` into `Mat` (`MatProps.detailsOpen?: boolean`) and set
   `aria-haspopup="dialog" aria-expanded={!!detailsOpen}` on the "Your details" act;
   `threshold.tsx` now passes `detailsOpen={detailsOpen}`. New `mat.test.tsx` test.
8. **minor** — Carried the old `ProfileForm` confirm sentence verbatim in substance: "This ends every
   active session on every device, including this one. You'll be redirected to sign in." replaces
   "Sign out on every device now?". Updated the existing sign-out test to match.
9. **minor** — Guarded the Esc/Tab keydown handler on
   `containerRef.current?.contains(event.target as Node)` so a keypress belongs to THIS sheet before
   it acts — L5's `papers-sheet.tsx` can mount in the same wrapper without the two Esc contracts
   fighting. New tests: `ignores a keydown whose target sits outside this sheet`, plus updated the
   existing Escape test to fire on the focused element (a real keypress's actual target) instead of
   `document`.
10. **minor** — The inherited "Order receipts and account alerts still send" line is not true: I
    traced `packages/notifications/src/notify.ts` and confirmed `isChannelEnabled` has no
    transactional bypass (only `isTypeEnabled`, step 2, bypasses for `TRANSACTIONAL_TYPES` — the
    channel gate at step 5 applies to every type uniformly). Fixing the dispatcher is out of this
    lane's file scope (shared package, "shared-file edits minimal"), so I corrected the copy instead:
    "Turn off to stop all email from Patina, including order receipts and account alerts."
11. **minor** — Added a body-scroll lock effect (`document.body.style.overflow = 'hidden'` while open,
    restored on close/unmount) so the house no longer drifts under the sheet.
12. **minor** — Scrim now carries `tabIndex={-1}` and `aria-hidden="true"`; "Shut" remains the only
    announced close act.
13. **minor** — Added three focus-trap tests: Tab wraps last→first, Shift+Tab wraps first→last, and
    focus returns to whatever had focus before the sheet opened once it closes.
14. **minor** — Added the missing behaviour cases: failed/pending preference write (finding 3's fix),
    push and in-app channel toggles, the timezone select (finding 6's fix), and profile
    loading/error states (finding 5's fix).
15. **minor** — "What you hear from us" → "What reaches you" (second person, matches the surface's
    established register).
16. **nit** — `ConversationsSection` now prints the thread kind ("Project" / "Vendor brief" / "Direct")
    in muted type under the name, sourced from `override.thread_kind` (already on `ThreadOverride`).
    Tests assert "Project" and "Vendor brief" render.
17. **nit** — Restored the "(your timezone)" suffix on the browser-zone option.
18. **nit** — Fixed the empty guard: `if (!isLoading && !isError && muted.length + customPref.length
    === 0) return null;` (was keying on `overrides.length`, which the live query happens to always
    equal `muted.length + customPref.length` for, but nothing states that coupling).
19. **nit** — `TEXT_INPUT_CLASS` now uses `border-current` (was `border-[var(--border-default)]`) and
    `FIELD_LABEL_CLASS` tracks at `0.13em` (was `0.1em`), matching `door-gate.tsx`/`wall-gate.tsx`.
20. **nit** — `variant="danger"` (red `da-danger` ink, which VISION §6 bans) on the sign-out confirm
    act is now `variant="secondary"`; the confirm copy (finding 8's fix) carries the weight instead.
21. **nit** — Added `data-testid="details-save"`, `details-signout-all"` and
    `details-signout-all-confirm` per the finding's fix. Did **not** rewrite
    `tests/e2e/account.spec.ts` — the plan assigns e2e to the integration lane and the review's own
    fix says to hand the rewrite there; flagging it again here so it isn't dropped.

### Rejected
None — I agreed with all 21 findings. Findings 2 and 21 are partial fixes by the review's own
instructions (a report flag for the retirement lane, and new testids with the full spec rewrite
handed to integration), not rejections.

### Gate output (verbatim, after the fix round)

```
$ pnpm --dir apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(clean, exit 0)
```

```
$ pnpm --dir apps/client-portal test -- threshold making
...
Test Suites: 31 passed, 31 total
Tests:       601 passed, 601 total
Snapshots:   0 total
Time:        6.992 s
Ran all test suites matching /threshold|making/i.
```
(601 = 589 from the initial pass + 12 new tests from the fix round, all green.)

```
$ npx eslint src/components/threshold/details-sheet.tsx src/components/threshold/mat.tsx \
    src/components/threshold/threshold.tsx src/app/preferences/unsubscribe/page.tsx \
    src/components/threshold/__tests__/details-sheet.test.tsx \
    src/components/threshold/__tests__/mat.test.tsx
(no output — 0 errors, 0 warnings)
```

### Still not verified
Same caveats as the initial pass (no dev-server/browser check, hooks mocked in every test, no
screen-reader pass) plus: the `/preferences` token-shim requirement from finding 2 is a note for the
retirement lane, not something this lane can enforce in code; and the e2e spec for finding 21 still
drives the retired `/account` route until the integration lane rewrites it.
  seen the other lanes' diffs.
