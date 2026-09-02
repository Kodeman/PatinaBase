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
