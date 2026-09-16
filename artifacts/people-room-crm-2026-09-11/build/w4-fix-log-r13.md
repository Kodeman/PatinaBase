# W4 — fix log, round 13

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`
Scope: the two findings handed to this round — `MAJOR-1` (data/edge) and `F-2` (QA).
Nothing else in `w4-review-r13-data-edge.md`, `-code.md` or `-qa.md` was touched.

---

## MAJOR-1 — a dead address the channel ledger knows about stays mailable on the
## one rail that never asks the ledger — **fixed**

### What was true

`resend-webhook` wrote the provider's verdict onto `studio_contact_channels` from
three places, and onto `profiles.email_suppressed` from two — and the two sets did
not overlap where it mattered:

| path | channel row | profile |
|---|---|---|
| orphan branch, no `notification_log` row (`index.ts:214-231`) | written | **never** — `handleBounce` (`:413`) and the complaint suppression (`:438`) both sit behind `if (logEntry.user_id)`, which this branch never reaches |
| logged row with `user_id = null` (00591 made it nullable) | written | **never** — same two guards |
| logged row with a `user_id` | written | written, by id |

`campaign-dispatch` is the one rail that never asks the channel gate: it posts
straight to `https://api.resend.com/emails/batch` (`index.ts:468`) rather than
through `_shared/send-email.ts`, and its audience is `profiles` filtered on
`email_suppressed = false` and nothing else — confirmed at all four sites the
finding names (`:76`, `:266`, `:290`, `:301`, each `.eq("email_suppressed", false)`).
So an address that hard-bounced on a letter writing no log row (the po-send /
quote-request-send / trade-rfq-send / trade-agreement-send set) could read `dead`
on every card and still be mailed by the next campaign.

### The fix

The symmetric move to r12 MAJOR-2, which made the unsubscribe click write both
books. A killing verdict now writes both books from the one event, keyed on the
ADDRESS — which is the only key the orphan branch has.

- `supabase/functions/resend-webhook/channel-status.ts` — three new exports:
  - `normalizeChannelAddress()` — the `lower(btrim())` 00593 applies on write,
    extracted so the channel lookup and the profile mirror key on one string
    (`applyChannelStatus` now calls it too, replacing its inline copy).
  - `isSuppressingStatus()` — `dead` and `unsubscribed` only. A soft bounce
    records `bounced` and suppresses nobody, exactly as one soft bounce does not
    suppress a profile.
  - `suppressProfilesForAddress()` — `update profiles set email_suppressed = true,
    email_suppressed_at = <now> where email = <normalised address>`, best effort,
    warn-on-failure, same posture as the channel write (the `notification_log`
    side of the event is already recorded and a throw here would make Resend
    retry the whole delivery). `eq`, not `ilike`: an ordinary address carries
    `_` and `%`, and a wildcard read would suppress strangers — the same
    reasoning `applyChannelUnsubscribe` records.
- `supabase/functions/resend-webhook/index.ts` — `writeChannelStatus` normalises
  the address once, then calls the mirror when the resolved status is a killing
  one. Placing it there covers all three call sites: the orphan branch, a logged
  row with a null `user_id`, and (as a harmless repeat of the by-id write) a
  logged row with a user.

The finding's optional second half — teaching `campaign-dispatch` to join
`studio_contact_channels` and drop dead/unsubscribed addresses — was **not**
taken. It is explicitly optional in the finding, it closes the same hole from the
far end, and this round's brief is these two findings and nothing else. Worth
carrying as a minor if a later round wants defence in depth on that rail.

### Evidence

`artifacts/people-room-crm-2026-09-11/build/probe-r13-major1-two-ledgers.{sql,out}`
(local DB, read-only) establishes what the fix rests on:

- `profiles` carries `email`, `email_suppressed`, `email_suppressed_at`.
- profiles email casing: 16 rows, **0** not normalised.
- channel email casing: 46 email/ap_email rows, **0** not normalised — so `eq` on
  the channel value matches the profile row.
- overlap (an address that is BOTH a typed channel and a `profiles` row): **1**
  in the local fixture — the exact class the finding is about.

Tests (all new, all red before the fix by construction — they assert a write that
did not exist):

`supabase/functions/resend-webhook/index.test.ts` (+4, and the stub now records
the column an update was keyed on):
- an UNMATCHED hard bounce suppresses every profile carrying the address —
  also asserts the key is `["email", "dana@kowalskitile.test"]` from a
  mixed-case `Dana@Kowalskitile.test`.
- an UNMATCHED complaint suppresses every profile carrying the address.
- an UNMATCHED soft bounce suppresses nobody (channel row still reads `bounced`).
- a hard bounce on a logged row with no `user_id` still suppresses by address.
- the pre-existing "a bounce on a row with no user_id never touches profiles" is
  renamed "… and no address …", which is what it actually pins now.

`supabase/functions/_tests/email-channel-status.test.ts` (+4), unit-level on the
module itself: normalisation and the `eq` key; only `dead`/`unsubscribed` are
killing verdicts; no address means no write; a failed write returns false rather
than throwing.

### Gates

```
deno test --allow-all --config supabase/functions/deno.json
  _tests/email-channel-status.test.ts
  _tests/paperwork-upload.test.ts
  resend-webhook/ ................................ ok | 78 passed | 0 failed
deno check --config supabase/functions/deno.json
  resend-webhook/index.ts ........................ EXIT=0
deno.lock at the worktree root ................... absent
psql -v ON_ERROR_STOP=1 -f
  supabase/tests/people/w4_channels_touches_paperwork_test.sql
                                                   all 16 blocks passed, ROLLBACK
```

No migration, seed, grant or generated-type change: this round is edge code only,
so no `supabase:reset`, no `db:generate`, no `00-legacy-grants.sql` regeneration.
No portal or workspace-package file was touched, so no portal type-check or jest
gate applies.

**W7 redeploy set: unchanged.** The edit is inside `resend-webhook`'s own folder,
not `_shared` — `grep -rn "resend-webhook/channel-status"` across
`supabase/` and `packages/` returns only the test file's import and one comment in
`_shared/send-email.ts:658`. `resend-webhook` is already in the set; no function
joins or leaves it.

---

## F-2 — designer-portal OTP sign-in failed twice during the r13 walk —
## **does not reproduce; root cause was the local stack, not the product**

The finding asked for an isolated re-attempt and, if it reproduced, the network
response behind the `AppError`. It does not reproduce, and the local record dates
the window that produced it.

### The re-attempt (isolated, fresh mail check, nothing else in play)

Against the same stack the walk used (`http://127.0.0.1:54321`), driving the exact
call `useSendEmailOtp` makes (`packages/supabase/src/hooks/use-auth.ts:309` —
`signInWithOtp` with `shouldCreateUser: false`):

| | attempt | result |
|---|---|---|
| 08:24:52Z | `POST /auth/v1/otp` `{create_user:false}` | **HTTP 200** `{}` |
| 08:24:52Z | mail | delivered to `designer@patina.dev`, subject "Sign in to Patina" (mailpit id `7OLLIyZuOhXVJ4IfF7Pntj`), one 6-digit code |
| 08:25:05Z | `POST /auth/v1/verify` with that code | **HTTP 200**, session granted, `role: authenticated`, `expires_in: 3600` |
| 08:27:20Z | second, independent send (PKCE-shaped: `redirect_to` as query param, `code_challenge`/`s256` in body, as `@supabase/ssr`'s browser client sends it) | **HTTP 200**, mail delivered, code verified, session granted |

`auth.audit_log_entries` records both: `user_recovery_requested` 08:24:52 →
`login` 08:25:05, and `user_recovery_requested` 08:25:20.

### What produced the copy QA saw

"We couldn't sign you in just now. Please try again." is
`FAILURE_MESSAGES.unknown` (`packages/supabase/src/auth/errors.ts:48`), and the
signin page's send path asks for exactly that fallback
(`apps/designer-portal/src/app/auth/signin/page.tsx:110` —
`normalizeAuthError(cause, 'unknown')`). Only an error matching **none** of
`normalizeAuthError`'s buckets lands there, which rules out most candidates:

- a rate limit is `status 429` → `rate_limit` ("Too many attempts were made just
  now."). Demonstrated live: three rapid sends gave 200, then
  `429 over_email_send_rate_limit` twice — different copy, so this was not it.
- a stack that is down is "Failed to fetch" → `network`.
- a 5xx is → `service`. A bad/expired code is → `invalid_code`, and the verify
  path asks for that fallback anyway (`page.tsx:132`), not `unknown`.

The one ordinary GoTrue answer on this flow that falls through to `unknown`,
reproduced live against an address GoTrue does not know:

```
POST /auth/v1/otp  {"email":"nobody-r13-probe@patina.dev","create_user":false}
HTTP 422  {"code":422,"error_code":"otp_disabled","msg":"Signups not allowed for otp"}
```

`errorText` reads `otp_disabled authapierror signups not allowed for otp`, status
422 — no bucket matches ("not allowed" is not in the `access_denied` list), so it
renders the `unknown` copy verbatim. `shouldCreateUser: false` means GoTrue
answers this way whenever the address is not in `auth.users` **at that instant**.

### Why it was true during the walk and is not now

The local stack was restarted and reseeded mid-session:

| fact | value |
|---|---|
| `pg_postmaster_start_time()` | **2026-09-16 07:56:49Z** — the Postgres container restarted |
| newest `auth.users` row | 07:57:19Z — the reseed finishing |
| oldest `auth.audit_log_entries` row | 07:57:48Z — the walk's password `login`, 29 s later |
| oldest mail still in mailpit | 07:17:53Z, "Sign in to Patina" to `designer@patina.dev` — 39 minutes BEFORE that restart, i.e. from the previous stack instance (mailpit storage survives a DB reset; `auth.audit_log_entries` does not) |

So between roughly 07:17 and 07:57:19 the local auth store was being torn down and
reseeded while GoTrue stayed up — the window in which a `shouldCreateUser: false`
send answers 422 `otp_disabled` for an address the fresh DB has not yet got. The
QA doc's own sequence fits it exactly: the OTP attempts failed, and the password
fallback "worked immediately" — the first audit entry, at 07:57:48, 29 seconds
after the seed finished.

### Verdict

No designer-portal auth defect is filed. The OTP rail — send, delivery, code,
verify, session — is green end to end on this stack, twice, from a cold start.
The walk's two failures were a QA-side artifact of a stack restart, which is what
F-2 itself named as the alternative and could not distinguish at the time.

Limitation, stated plainly: the re-attempt drove the network call the hook makes
and the mail and verify behind it, **not** a browser walk of the signin page
(that would have needed both portals rebuilt and restarted; the page contributes
no logic to this path beyond the hook and the fallback named above). If a later
round wants the UI itself re-walked, it is a five-minute act once a portal is
already up.

Observation, not acted on and not a finding of this round: because 422
`otp_disabled` falls through to `unknown`, a real person typing an address Patina
has never seen is told "try again" forever rather than that the address is not on
Patina. That is a copy/classification gap in
`packages/supabase/src/auth/errors.ts`, outside both this wave and this round's
brief.

---

## Left standing on purpose

Every other finding in `w4-review-r13-data-edge.md` (m-1 … m-11 and the rest),
`w4-review-r13-code.md` and `w4-review-r13-qa.md` (F-1, F-3). Not in this round's
scope.
