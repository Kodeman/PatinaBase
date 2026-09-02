# W1 · L1-A — integration note: the A3-07 self-downgrade

Written by W0 fix round 3 (2026-09-02) as the handoff for **ruling B2 v3(c)**. L1-A owns the change;
this file is the contract it has to satisfy, and the reason the contract is shaped this way.

---

## The finding

**A3-07.** A tester who signed in with Apple landed `profiles.role = 'designer'`.

`public.handle_new_user()` — the `auth.users` INSERT trigger — honours exactly one client-supplied role
string, the literal `'homeowner'` in `raw_user_meta_data.role` (00313). Everything else falls to the
default, which has been `'designer'` since 00013. The app's email and OTP paths send the hint
(`AuthService.swift:437` and `:563`). The Apple and Google paths cannot: `supabase-swift`'s
`signInWithIdToken` and `signInWithOAuth` take **no `data:` parameter**, so there is no way to attach
creation metadata to an OAuth sign-up. The row is created labelled `designer`, and nothing corrects it.

## What W0 decided, and what it did NOT do

Two earlier cuts of migration 00555 tried to fix this in the trigger — first by flipping the default to
`'homeowner'`, then by branching on `raw_app_meta_data->>'provider'`. **Ruling B2 v3 reverted both.**
`handle_new_user` is now 00313 verbatim: every sign-up with no explicit hint still lands `'designer'`,
whatever provider it came in on. The portals are unchanged.

The reasoning, in one line: which **button** somebody tapped is not which **kind of account** they are.
A designer can sign in with Apple. A client can sign up with an email and a password — the client
portal's own invite-accept form does exactly that. A trigger guessing from the provider writes a wrong
label for both, silently, at the one moment nobody is watching.

So the label is corrected by the two callers that actually know the answer. **One of them is this app**,
and that is L1-A's row.

**What W0 shipped for you:** the own-row `UPDATE` policy on `public.profiles` is no longer a freeze. It
is a one-way ratchet (00555 §a2(i-a)):

| column | permitted new value |
|---|---|
| `role` | unchanged, **or** `'homeowner'` |
| `is_designer` | unchanged, **or** `false` |

Never upward, in either column. `profiles.role` grants nothing anywhere in the schema — the
design-request rail (00286/00330/00285) reads `is_designer`, `profiles_select_admin` reads `user_roles`,
and the `designer_clients` restrictive policies read both — so a self-downgrade of the label costs the
caller a word and gains them nothing. That is why it is safe to allow, and it is allowed **only** so
this app can make it.

Regression cover for the policy itself is `supabase/tests/rls/00555_ios_round_one_security.test.sql`
case **7i** (the downgrade lands), **7i2** (it is idempotent), **7i3/7i5** (the ratchet does not turn
back).

---

## The contract L1-A implements

**After a successful `signInWithIdToken` (Apple) or `signInWithOAuth` (Google) — and only those two
paths — the app PATCHes its own `profiles` row to `role = 'homeowner'`.**

```
PATCH {SUPABASE_URL}/rest/v1/profiles?id=eq.{session.user.id}
Authorization: Bearer {session.accessToken}
Content-Type: application/json

{"role": "homeowner"}
```

or, through `supabase-swift`:

```swift
try await client
  .from("profiles")
  .update(["role": "homeowner"])
  .eq("id", value: session.user.id)
  .execute()
```

Five rules, each of which the reviewer will check:

1. **Scoped to `id = self`.** The filter is the signed-in user's own uid, taken from the session the
   sign-in just returned — never a value passed in from anywhere else. The policy would refuse another
   id anyway; the filter says so out loud.
2. **`role` only.** Do not send `is_designer`, and do not send it as `false` "to be safe" — the column
   is already `false` for a fresh sign-up, and writing it makes this call look like an authority write
   when it is a label write. One key in the body.
3. **Idempotent.** It runs after *every* Apple/Google sign-in, not only the first, because the app
   cannot reliably tell a first sign-in from a returning one and a returning user whose downgrade
   failed last time must still get it. Writing `'homeowner'` over `'homeowner'` is a permitted no-op
   (case 7i2).
4. **Once per sign-in, and not in a loop.** It belongs immediately after the session is established, in
   the same place the app already resolves the profile — not in a view's `onAppear`, not in a retry
   timer.
5. **Never fatal.** A failure is logged and swallowed. The user is signed in; a wrong label is
   cosmetic (it changes the word `comms_resolve_role` renders beside their name, 00103:37-42) and the
   next sign-in retries it. A sign-in that fails because a cosmetic PATCH 4xx'd is a worse bug than the
   one being fixed.

**Do not add this to the email or OTP paths.** They already send `role: "homeowner"` in
`raw_user_meta_data` and the trigger honours it; a second write there is redundant, and it would make
the app look like it writes its own role unconditionally, which is precisely the shape 00555 spent a
section closing.

### What it will do on a real device

| sign-in | row after trigger | row after the PATCH |
|---|---|---|
| Apple, first time | `role = 'designer'` | `role = 'homeowner'` |
| Apple, returning | `role = 'homeowner'` | `role = 'homeowner'` (no-op, 204) |
| Google, first time | `role = 'designer'` | `role = 'homeowner'` |
| email/password with the hint | `role = 'homeowner'` | n/a — path not touched |
| a real designer signing in with Apple on the app | `role = 'designer'` | `role = 'homeowner'` — see below |

That last row is a real consequence and it is accepted: the Patina **client** app relabels anyone who
signs into it with Apple. Their authority is untouched (`is_designer` and their `user_roles` grants are
not written by this call, and the policy forbids raising either), so the cost is the word beside their
name until an admin resets it. Ruling **D3** takes the Google button off the Welcome screen for round
one anyway, and round one's cohort is Leah's clients.

### Verifying it, without a device

Against a local stack, with a password-grant JWT for a fresh account:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$UID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"role":"homeowner"}'
# want 204 — twice in a row

curl -s -o /dev/null -w '%{http_code}\n' \
  -X PATCH "http://127.0.0.1:54321/rest/v1/profiles?id=eq.$UID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"role":"designer"}'
# want 403 (42501) — the ratchet does not turn back
```

W0 ran exactly this matrix on 2026-09-02; the codes are in the fix-round-3 section of
`build/waves/w0/wave-report.md`.

---

## The other caller, for context

`supabase/functions/client-invite/index.ts` `handleAccept` does the same relabel as `service_role`, for
a client who arrives through a designer's invitation and signs up over email/password with no hint
(ruling B2 v3(d)). It is deployed by Kody in **KODY-RUNBOOK Block A step A10**, and clients who already
accepted are swept up by the one-time backfill in **Block B7**. L1-A does not need to do anything about
that path — it is named here so the two halves of the ruling are visible from one place.

## Dependency

This contract needs **00555 applied** (KODY-RUNBOOK Block B). Before it, the own-row `UPDATE` policy is
00013's `USING`-only version, which permits the PATCH too — so the app code works either way and L1-A is
not blocked on the migration. After it, the PATCH is permitted *because of the ratchet*, and any
attempt to write `role = 'designer'` or `is_designer = true` from the app will start returning 403.

---

## From L1-E (Copy) — 2026-09-02

Six rows, exact final text. Full reasoning for each in `build/waves/w1/l1-e-copy-deck.md`.

### Task A-L1E-1 — `A-52`, the Companion's guest copy

`Features/Companion/Services/CompanionActionRows.swift`, three spots — needs `isAuthenticated` (or
`LocalStoreClaim.hasGuestWork` for the home row) threaded into the row builders, since the same
functions draw for both a guest and a signed-in person today:

- `:32-34` (`homeRow`) — guest hint: `"See what's on Patina"`. Signed-in / guest with local rooms:
  unchanged, `"Back to your space"`.
- `:220-223` (`pieceActRow`, `.askAboutPiece`) — guest hint: `"Sign in and a designer will get back to
  you"`. Signed-in, no designer yet: `"A designer will get back to you"` (was "will come back to
  you" — the small tense cleanup applies to both states so they read as one voice).
- `Features/Notifications/Views/NotificationFeedView.swift:193` (`guestInviteView` — already correctly
  branched on auth state; only the sentence inside it still presumes a designer) — message:
  `"Sign in to see updates on your projects and messages here."` Title `"Nothing yet"` (`:192`) is
  unchanged.

### Task A-L1E-2 — `A-79`, the local-store claim sheet

`Features/Collections/Views/LocalStoreClaimSheet.swift:17`. Add `roomCount`/`pieceCount` to
`LocalStoreClaim` (computed alongside `hasGuestWork`) and compose the title from them:

- rooms only: `"Keep the {n} room{s} you saved on this phone?"`
- pieces only: `"Keep the {n} piece{s} you saved on this phone?"`
- both: `"Keep the {r} room{s} and {p} piece{s} you saved on this phone?"`
- concrete example (0 rooms, 1 piece): `"Keep the 1 piece you saved on this phone?"`

`s` = `""` at count 1, else `"s"`. `:23`'s body sentence is unchanged — it never claims a count, so it
stays true at any count > 0. The sheet is already never shown at zero (`LocalStoreClaim.shouldAsk`
requires `hasGuestWork`) — no change needed for that half of the finding.

### Task A-L1E-3 — `A-101`, the delete-account copy

`Features/Account/AccountDeletionService.swift`, three constants, one verb throughout ("Delete
account" — not "Close"):

- `:41` `confirmationTitle` → `"Delete account"`
- `:42-43` `confirmationBody` → `"This deletes your Patina account, including your saved rooms,
  pieces, and messages. Any project you completed with a designer stays in our records — with your
  name and contact details removed — as required for our legal and accounting obligations. This can't
  be undone."` Grounded in `supabase/functions/delete-account/index.ts` +
  `supabase/migrations/00538_client_account_anonymize.sql`: the server soft-deletes the auth user and
  purges rooms/scans/saved items/started threads, but **never** touches `proposals`, `projects`,
  `invoices`, `client_decisions`, `designer_clients` — those survive indefinitely, PII-stripped. There
  is no fixed purge window in the code; do not invent one.
- `:39` `failureCopy` → `"We couldn't delete your account just now. Try again, or write to
  hello@patina.cloud."` (same one-verb sweep, nothing else changed)

### Task A-L1E-4 — `A-06`, apostrophe sweep

`Features/Onboarding/Views/OnboardingFlowView.swift:31,57,58` — convert the three straight apostrophes
(U+0027) to typographic (U+2019), matching `:37`'s existing `"the room's shape"`. No text otherwise
changes: `"Let's discover yours."` / `"...then we'll show you..."` / `"Let's begin"`, all with U+2019.

### Task A-L1E-5 — `C5-20`, two brand-voice rewrites

- `OnboardingFlowView.swift:32` — `ctaText: "Let's begin"` (reuses page 3's own CTA verbatim, U+2019
  apostrophe per Task A-L1E-4 — write it once, both pages match byte-for-byte).
- `Features/Authentication/Views/AuthenticationView.swift:134` (`headerSubtitle`, `.signUp` case) —
  `"Save your rooms and pieces, and pick them up on any device."`

### Task A-L1E-6 — `C5-10`'s five L1-A-owned casing rows

- `Features/Account/AccountView.swift:184` — `PatinaButton("Sign out", style: .secondary)`
- `Features/QRAuth/Views/QRScannerView.swift:201` — `PatinaButton("Open settings", ...)`
- `Features/FirstLaunch/Views/CameraPermissionView.swift:223` — `Text("Open settings")`
- `Features/Authentication/Views/AuthenticationView.swift:526,528,530,532` (`submitButtonTitle`) —
  `"Sign in"` / `"Create account"` / `"Email me a code"` (unchanged) / `"Send reset link"`
- `Features/Authentication/Views/AuthenticationView.swift:632` (mode-switcher) — `"Sign up"` / `"Sign
  in"`

### Task A-L1E-7 — `B-23`, no deck row needed

`Features/StyleQuiz/Views/StyleResultView.swift:65` — the finding's own fix line already names the
exact replacement, verbatim: `"Your portrait is yours — reset it any time in Settings."` Verified
against the current string ("Your portrait stays on this device and can be reset in Settings.") —
matches the evidence exactly; nothing for a copy review to add.

> ⚠ **File-overlap flag for the steward.** `CompanionActionRows.swift` is also touched by
> `l1-c-notes.md`'s `A-60`/`C-22` note, at `:36-54` — different, non-overlapping lines from Task
> A-L1E-1's `:32-34`/`:220-223`. L1-C merges first (D14); rebase onto its result before applying this
> task.

### VISION check on this note

None of the six rows adds tab/zone/dashboard framing, a shadow, red/green status, a badge, an
engagement mechanic or the word "AI" — every one is a string rewrite or a count-aware composition.
