# L7 — Your details · fix-round re-review

Reviewer: fresh context, did not write this lane and did not write the first review.
Subject: `client-page-2/l7` @ `42bd456c9dfec52bc651264664a74328856beeec`
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l7` (read-only pass — no edits, no git writes)
Prior review: `artifacts/client-page-completion-2026-09-04/waves/w1/l7-review.md` (21 findings, 0 blockers, 5 majors)
Fix round: `ef4f0545f` (fixes) + `42bd456c9` (formatting), on top of `0b006ab2e` (the reviewed commit)

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
Tests:       601 passed, 601 total
Snapshots:   0 total
Time:        7.631 s
Ran all test suites matching /threshold|making/i.
```

Both match the lane's fix-round claims (601 = 589 + 12). No sandbox retry was needed.

## Prior findings — roll call

Every claim below was checked against the file at HEAD, not against the lane's report.

| # | Sev | Claim | Verdict | Evidence |
|---|---|---|---|---|
| 1 | major | avatar upload not absorbed | **fixed** (with a side effect — N3) | `details-sheet.tsx:20` imports `AvatarUploadField`; mounted at `:314-320` with `profile.id` / `profile.avatar_url` / `profile.full_name`, guarded on `profile`. Test `details-sheet.test.tsx:249`. |
| 2 | major | one-click preference token not absorbed | **addressed as instructed** — code unchanged by design | `app/preferences/page.tsx` and `app/api/preferences/apply-token/` both still present and untouched (`git diff --name-only main...HEAD` lists neither). The review's fix was "say so explicitly in the lane report"; `l7-impl.md` now flags the shim requirement for R1–R4. Still an **owed dependency**, not a closed defect. |
| 3 | major | preference writes completely silent | **fixed** (residual below) | `details-sheet.tsx:422-436` renders `role="status"` "Saving…" from `updatePrefs.isPending` and `role="alert"` from `isError`/`error`, beside the section head. Test `:302`. *Residual:* `useUpdateNotificationPreferences` (`packages/supabase/src/hooks/use-notification-preferences.ts:90-130`) still has no optimistic update — only `onSuccess` invalidation — so the checkbox itself still lags one round trip. The review's stated fix did not require it; noting it so nobody reads "fixed" as "the box moves instantly". |
| 4 | major | kept unsubscribe page links into the absorbed route | **fixed** | `app/preferences/unsubscribe/page.tsx:55` and `:73` now `href="/preferences"` (were `/settings/notifications`). Correct **only if** finding 2's shim survives retirement — the two are one dependency. |
| 5 | major | failed query indistinguishable from loading | **fixed** in all three sections | `details-sheet.tsx:304-311` (profile), `:439-446` (prefs), `:672-679` (threads) each branch `isError` → "The file could not be read." before the loading line. Tests `:264`, `:451`. |
| 6 | minor | four timezones dropped | **fixed** | Full 17-entry list `:135-153` including `Asia/Tokyo`, `Asia/Singapore`, `Asia/Dubai`, `Australia/Sydney`; `:403-409` unions `browserTz` + `prefs?.timezone` + the list. Test `:347` asserts a stored `Asia/Tokyo` renders as the select's value. |
| 7 | minor | dialog trigger doesn't announce itself | **fixed** | `mat.tsx:122-123` `aria-haspopup="dialog" aria-expanded={!!detailsOpen}`; `threshold.tsx:678` passes `detailsOpen`. Tests `mat.test.tsx:153-159`. |
| 8 | minor | confirmation loses the consequence | **fixed** | `details-sheet.tsx:780-781`: "This ends every active session on every device, including this one. You'll be redirected to sign in." |
| 9 | minor | Esc handler bound to `document` unconditionally | **fixed as instructed — and it introduced N1** | `details-sheet.tsx:182` guards on `containerRef.current?.contains(event.target as Node)`. Sibling-overlay collision is gone; see N1 for what the guard costs. |
| 10 | minor | inherited promise that isn't true | **fixed, correctly** | `:451` now "Turn off to stop all email from Patina, including order receipts and account alerts." I re-verified the claim independently: `packages/notifications/src/notify.ts:128-137` bypasses **quiet hours** for transactional types, but the channel gate at `:146` (`isChannelEnabled`, `preferences.ts:119-131`) applies to every type with no bypass. The new sentence is true; the old one was not. |
| 11 | minor | no body scroll lock | **fixed** (with an integration caveat — N4) | `:208-215`. |
| 12 | minor | scrim is a page-sized focusable button | **fixed** | `:222-224` `aria-hidden="true" tabIndex={-1}`. |
| 13 | minor | focus trap/restore untested | **fixed** | Three real tests at `details-sheet.test.tsx:520`, `:534`, `:548` — Tab wrap, Shift+Tab wrap, focus returned to the opener on close. They assert `document.activeElement`, not implementation. |
| 14 | minor | missing behaviour cases | **fixed** | Added: pending/failed pref write (`:302`), push + in-app toggles (`:293`), timezone select (`:347`), profile loading (`:254`) and error (`:264`), overrides error (`:451`). |
| 15 | minor | first person in copy | **fixed** | `:421` "What reaches you". |
| 16 | nit | thread kind label dropped | **fixed** | `:647-650` + `:686-694`; labels match the retired page (`app/settings/notifications/page.tsx:334-335`), with "Direct" as the fallback. |
| 17 | nit | "(your timezone)" suffix dropped | **fixed** | `:540`. |
| 18 | nit | empty guard keys on the wrong quantity | **fixed** | `:662` `muted.length + customPref.length === 0`, and now also guarded on `!isError`. |
| 19 | nit | field styling drift | **fixed** | `:49` `border-current`; `:47` `tracking-[0.13em]`. |
| 20 | nit | first use of red `da-danger` ink | **fixed** | `:787` confirm act is `variant="secondary"`. (Red ink returns by a side door — N3.) |
| 21 | nit | e2e still drives the retired surface | **partial, as instructed** | `data-testid="details-save"` `:365`, `details-signout-all` `:773`, `details-signout-all-confirm` `:791`. `tests/e2e/account.spec.ts:28-49` still navigates `/account` and drives `account-full-name` / `account-save` / `account-signout-everywhere` — unchanged, handed to the integration lane per the plan and the review's own fix. Still owed. |

Nothing was rejected, and I found no finding claimed fixed that isn't. 19 fully fixed, 2 partial by the
review's own instruction (2, 21), 1 fixed with a residual worth stating (3).

## New defects introduced by the fix round

**N1 · major · high — the Escape guard strands a keyboard user the moment focus falls to `<body>`.**
`details-sheet.tsx:181-182`: `if (!containerRef.current?.contains(event.target as Node)) return;`
runs before both the Escape branch and the Tab trap. When `document.activeElement` is `<body>` the
keydown's target is `<body>`, which the dialog does not contain — so **Escape stops closing the sheet
and Tab stops being trapped**, while the scrim still visually blocks everything behind it. Two concrete
paths reach that state in a real browser:

1. *Click any prose inside the sheet.* Mousedown on non-focusable content moves focus to the nearest
   focusable ancestor — there is none inside the dialog, so focus lands on `<body>`. Escape is then
   dead until the user tabs back in.
2. *Keyboard save.* `ScoredAction` renders a real `disabled` attribute (`scored-action.tsx:243-245`,
   `disabled={unavailable}` where `unavailable = disabled || loading`). Tab to Save → Enter →
   `loading` flips true → the focused button is disabled → the browser blurs it to `<body>`; after the
   write, `dirty` is false so it stays disabled. Same dead Escape, and Tab from `<body>` now walks the
   *document* order into the page behind the scrim rather than wrapping inside the dialog.

The existing tests cannot see this: `details-sheet.test.tsx:181` fires Escape on
`document.activeElement!`, which is always inside the sheet at that point.
*Fix:* widen the guard to accept the document-level fallbacks —
`const t = event.target as Node | null; if (t && t !== document.body && t !== document.documentElement && !containerRef.current?.contains(t)) return;`
— or take the review's alternative and attach the listener to `containerRef.current` while also
keeping focus inside (e.g. `tabIndex={-1}` on the dialog and refocusing it on blur-to-body).

**N2 · major · high — the formatting commit rewrites all of `threshold.tsx`, the wave's hottest shared file.**
`42bd456c9` ("prettier formatting on the fix-round files") reformats **364 of `threshold.tsx`'s 845
lines** — single→double quotes and reflowed imports across the whole file, not just the lane's four
substantive lines (`58`, `287`, `677-678`, `842`). `mat.tsx` (18 lines) and
`app/preferences/unsubscribe/page.tsx` (51 lines, for a two-line `href` change) get the same treatment.
Two costs:

- **Merge.** The first review's "shared-file discipline — cheap to merge" no longer holds. Eight other
  lanes edit `threshold.tsx`; a whole-file requote turns every one of their hunks into a conflict.
- **Convention.** There is no repo-root prettier config (only `services/projects/.prettierrc` and
  `services/media/.prettierrc`), so this ran on prettier defaults. In `apps/client-portal/src`,
  128 `.tsx` files open `'use client';` and 6 open `"use client";` — three of those six are this
  lane's. The commit moves shared files off the house style.

*Fix:* revert the pure-formatting churn on the three files (keep the substantive lines) before
integration — e.g. re-apply the lane's edits onto the pre-format text of `threshold.tsx`, `mat.tsx`
and `unsubscribe/page.tsx`. `details-sheet.test.tsx` / `mat.test.tsx` / `details-sheet.tsx` are new or
lane-owned and can keep whatever style, though matching the portal's single quotes is cheaper still.

**N3 · minor · high — the avatar fix imports a different visual grammar into the sheet.**
`details-sheet.tsx:314` mounts `AvatarUploadField`, which renders `@patina/design-system`'s plated
`Button` and `Avatar` (`components/account/AvatarUploadField.tsx:6, 107-121`) plus hard-coded hexes
`#7A736C` (`:125`) and the red `#C45B4A` error ink (`:128`) — inside a surface whose every other act is
a `ScoredAction`, and one commit after finding 20 removed red ink from this very file for VISION §6.
The act is correctly absorbed; only its dress is foreign. *Fix:* either restyle the two `Button`s as
`ScoredAction`s and move the error line onto `--color-error`/`--text-muted` tokens, or get an explicit
ruling that the imported component ships as-is.

**N4 · minor · medium — the scroll lock's restore is order-dependent across sibling sheets.**
`details-sheet.tsx:208-215` captures `document.body.style.overflow` at open and writes it back at
close. L5's `papers-sheet.tsx` mounts in the same `threshold.tsx` wrapper and the review expects it to
carry the same contract. Open Details, then Papers (which captures `"hidden"`), close Details first
(restores `""`), then close Papers — Papers writes back `"hidden"` and the page behind is locked
permanently with no overlay on screen. *Fix:* at integration, use a shared counted lock (a tiny
`useScrollLock` in `threshold/`) rather than two independent capture/restore pairs.

**N5 · nit · medium — two `role="status"` regions can render at once.**
`:370` ("Saved 3:14 PM") and `:423` ("Saving…") are both `role="status"` inside the same dialog. Not a
product defect, but `screen.getByRole("status")` (used at `details-sheet.test.tsx:311`) throws on a
second match, so a future test that saves the profile and then touches a preference will fail for a
reason that has nothing to do with the behaviour under test. *Fix:* give each an
`aria-label`/`data-testid` and query by that.

## Re-checked and still clean

- **Hooks discipline.** All four `useEffect`s / `useId` / two `useRef`s sit above `if (!open) return null`
  (`:217`); the render-phase `setState` trio in `ProfileSection` (`:278-282`) is the documented
  "adjust state during render" pattern, keyed on `profile.id` so a post-save refetch cannot stomp
  in-flight typing. `Intl.DateTimeFormat()` reads (`:399`) stay behind `detailsOpen === false` on SSR.
- **Security.** Unchanged from the first pass and re-confirmed: no id from the page reaches any hook;
  `AvatarUploadField` derives its `userId` from `useProfile()` (`:316`), not from a prop supplied by
  the surface, and writes to `avatars/${userId}/…` exactly as `/account` did.
- **Shared-file semantics.** `threshold.tsx`'s substantive delta is still only one import (`:58`), one
  `useState` (`:287`), the two `Mat` props (`:677-678`) and one mounted element (`:842`); `mat.tsx` is
  the prop swap plus the two ARIA attributes. No `accountHref` reference survives anywhere in
  `apps/client-portal`. It is the *formatting* (N2), not the logic, that makes the merge expensive.
- **Tests.** The 12 new tests assert observable behaviour (focus targets, rendered sentences, mutation
  payloads), not internals; the focus-trap trio genuinely exercises the wrap and the restore.

## Still owed, carried forward

- Finding 2 — the retirement lane MUST keep `/preferences` (or `/preferences/unsubscribe`) applying
  `?token=`, or every emailed unsubscribe link dies. Finding 4's repointed links now depend on it too.
- Finding 21 — `tests/e2e/account.spec.ts` still drives `/account`; the integration lane owns the rewrite.
- Finding 3's residual — no optimistic update on preference toggles.

## Verdict

MERGEABLE_WITH_FIXES — all 21 prior findings addressed (19 fully, 2 partial by the review's own
instruction), 5 new findings, 0 blockers, 2 majors. Land N2 (revert the whole-file reformat of
`threshold.tsx`/`mat.tsx`/`unsubscribe/page.tsx`) before this lane meets the others, and N1 (the
Escape/Tab guard's `<body>` hole) before the surface ships; N3 and N4 can ride integration.
