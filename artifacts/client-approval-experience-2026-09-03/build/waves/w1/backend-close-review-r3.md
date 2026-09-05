# Wave 1 — backend close-out, adversarial review (round 3)

Worktree: `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend rev-parse --show-toplevel`
→ `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-backend` · branch `approvals/w1-backend`

Diff under review: `3e3b890f8..HEAD` — 13 commits, 26 files, 2123 insertions / 179 deletions.

```
b8dd6794d docs(approvals): W1 backend close-out round 3 notes
2c1d1d483 fix(edge): the icon reads a twin the way the bell reads it (r2-M1)
00d4f4141 docs(approvals): W1 backend close-out adversarial review, round 2
c64b39778 docs(approvals): W1 backend close-out round 2 — the three majors
55cd7dd80 fix(client-portal): an approval link names the house it stands on (M3)
f932a6533 fix(edge): the invitation, the nudge and the review request sign from a city (M2)
6f1e7c18c fix(edge): the springboard number counts what the bell counts (M1)
2c4fadd95 docs(approvals): W1 backend close-out adversarial review, round 1
e0b5ec9f7 docs(approvals): W1 backend close-out log
7fc0c5941 fix(edge): the letters a homeowner reads, sentence by sentence (F4-F12)
fd13b9ebb fix(edge): the sign-off reads the designer's own city first (R3-04)
4eb12e776 fix(edge): the springboard number moves while the app is closed (R5)
61da87110 fix(edge): the 48-hour cron returns, it never announces (R3-01)
```

Note on sources: the brief names `waves/w1/wave-report.md`; that file does not exist
(`ls` of `waves/w1/` returns 22 entries, none of them a wave report). The walks
(`walk-r1.md`, `walk-r2.md`), the three `backend-review-r*.md` rounds and the lane's own
`backend-notes.md` were read instead.

## Gates I ran myself

| gate | result |
|---|---|
| `deno test --allow-all --config …/deno.json …/_shared/` | **ok · 190 passed · 0 failed (1s)** |
| `deno test …/_tests/apns-send.test.ts` | **ok · 25 passed · 0 failed (24ms)** |
| `deno test …/decision-reminders/` | **ok · 6 passed · 0 failed** |
| `deno test …/notification-digest/` | **ok · 11 passed · 0 failed** |
| `deno test …/_tests/` (whole dir) | **red — pre-existing**: TS2345 at `fulfillment-po/core.ts:314` (`encodeBase64(Uint8Array)`), a file untouched by this branch and byte-identical at `3e3b890f8` |
| `deno check` × 8 touched entrypoints (apns-send, decision-reminders, decision-first-notice, notification-digest, client-invite, proposal-nudge, review-requests, decision-resolved-notify) | **all clean** |
| `ls deno.lock` (repo root and `supabase/functions/`) | none |
| client-portal jest — `retired-routes`, `active-project`, `page`, `middleware` | **4 suites · 84 passed · 0 failed** |
| deploy set recomputed from scratch (transitive `_shared` closure, both quote styles, + edited dirs) | **28 functions — identical to the lane's list, name for name** |
| `deno fmt --check` on the 8 touched files | 3 unformatted; `branded-email.ts` fails at `3e3b890f8` too, so pre-existing, and fmt gates nothing in `.github/workflows/` or any `package.json` |
| psql (read-only, local): `profiles.city` populated | **0 of 16** |
| psql (read-only, local): `organizations` with an `address` at all | **0 of 11** |

Commit hygiene: 13 commits, every one an explicit pathspec set, Conventional subjects,
no trailers, no `.env`, no `git add -A`. `git status --porcelain` clean apart from the
sandbox's `.env.example` read denials.

## Lane items, verified one by one

| item | state | proof |
|---|---|---|
| 1 · R3-01 cron always says `reminder` | **DONE** | `decision-reminders/index.ts:163` is the literal `notice: "reminder"`; `firstNoticeAlreadySent` deleted — `grep -rn firstNoticeAlreadySent supabase/ apps/` returns nothing; no test existed for it at base to delete. No new test either — see `r3-m3`. |
| 2 · R5 badge on `aps` | **DONE, and r2-M1 is genuinely closed** | `buildApnsPayload(input, badge?)` writes `aps.badge` only for a finite non-negative number; `unreadInAppBadge` returns `undefined` on no user / PostgREST error / throw. The read is now the bell's exact window: `channel=eq.in_app`, `status in.(queued,sending,delivered,unconfirmed,opened,clicked)`, `created_at desc`, `limit 50`, **unfiltered by read state**, matching `NotificationsAPIClient.list(limit:50)` (`:66-74`, `:33`, `:39`) line for line. `collapsedBadgeCount` drops an entity as soon as any row of it reads read, which is `collapseDuplicates`' `else if row.isRead` rule (`NotificationsViewModel.swift:184-205` — I read the iosa branch's copy), and `badgeRowIsRead` is `AppNotification.init`'s own predicate (`opened_at != nil ‖ status == "opened" ‖ status == "clicked"`, `NotificationsAPIClient.swift:158`). Keyless rows counted individually, only when unread — `applyNotificationRows` filters `!isRead` the same way, and `merge(real:fallback:)` returns `real + surviving`, so it can never drop a real unread row the badge counted. 10 helper cases, 25 tests green. |
| 3 · R3-04 city precedence | **DONE** | `signatureCity(profileCity, orgAddress)` — profile, then `organizations.address->>'city'`, then omitted; 4 pure cases + 5 stub-client cases including a failed org read signing cityless rather than throwing. |
| 4 · F4–F12 | **DONE** (rendered probe below) | |
| 5 · `markAllOpened` server side | **CORRECTLY DISCHARGED** | The only two migrations that `UPDATE public.notification_log` are 00374 (`status/error/retry_count`) and 00534 (`metadata/type/status/sent_at`); neither writes `opened_at`. 00562's policy already admits `channel IN ('in_app','push')` with the grant pinned to `(opened_at, clicked_at, status)`. No RPC to widen. See `r3-x1` for what that leaves standing on the iOS side. |

### Rendered probe (throwaway `deno run` against the real module)

```
FIRST      Leah sent "kitchen plan set" for your approval
           "kitchen plan set" is ready, exactly as drawn. | Edition 3 · issued August 20 | [Review the plan set]
REMINDER   Wednesday: "kitchen plan set"
           "kitchen plan set" is still open and due Wednesday. Nothing has changed since it was sent.
REMINDER†  (artifact re-issued AFTER sentAt) — the "Nothing has changed" sentence is DROPPED  ✓ F8
OVERDUE    Still open: "kitchen plan set"  /  Still open, Leah asked on August 28.
OVERDUE    (no identity) Still open, your designer asked on August 28.        ✓ F6
LEGACY     Leah sent "Rug color — Natural vs Sand" for your decision | [Review the decision] | eyebrow Decision  ✓ F7
UNMAPPED   kind "project_document" → "…is ready for your answer." | [Review the approval]     ✓ F4
digest     https://client.patina.cloud/decisions/<id>  ===  clientDecisionLink(...)            ✓ F12
tagline in any client letter: false        "undefined" anywhere: false                         ✓ F9, F4
```

Subjects carry no trailing period on any of the three; the designer `decision_resolved`
letter keeps its tagline, as ruled (`audience === "designer"`).

The F7 discriminator (`Boolean(decision.artifact)`) is sound: all three `decision_required` /
`decision_overdue` producers refuse to send a Stage-2 row without a resolved citation
(`decision-first-notice:133`, `decision-reminders:132`, `expire-decisions:116`), so an
artifact-less letter really is a legacy option choice.

M3's read is correct at the key level too: `get_project_decision_reviews` builds
`jsonb_build_object('decisionId', decision.id, 'projectId', decision.project_id, …)`, which is
what `resolveHouseForInstrument` destructures.

No refusal word enters homeowner copy in this diff: grepping every added string for
gate / task / dashboard / overdue / AI / emoji / checkmark returns only doc prose and test
fixture titles.

## Findings

See the structured report. One major (carried, pre-existing, homeowner-facing), five minors,
seven nits. No blocker; every numbered lane item is delivered and every named gate is green.

**Verdict: fix** — the major is the digest's own copy, which the lane names as unruled residue
and which this branch deploys.
