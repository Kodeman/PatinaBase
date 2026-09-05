# Wave 2 — backend lane · adversarial review R4

Reviewer context: fresh, did not write this code. Worktree read
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-backend`,
16 commits ahead of main, 23 files.

**Verdict: ship.** No blocker, no major. The three R3 findings are fixed and proven
fixed against a real database and the real renderers. One new minor (an inherited why
can be re-attributed), and the standing minor/nit backlog is unchanged.

---

## 1 · The R3 findings, each re-tested

### B1 — the letter signs the line with the hand that wrote it · FIXED

Probed by applying 00569 inside a rolled-back transaction on the shared stack and
running the lane's own fixture. `W2 issued set 7` carries
`why_author_name = 'Peer'` while the project's designer of record is `W2 Designer`:

```
 artifact_title  | why                                           | why_author_name | project_designer
 W2 issued set 7 | You asked us to hold the island where it was. | Peer            | W2 Designer
```

Rendered through the real modules (throwaway deno script over
`_shared/decision-notify.ts`), all three ask letters now read:

```
FIRST NOTICE  "Kitchen plan set" is ready, exactly as drawn.
              "You asked us to hold the island where it was."
              — Peer
              ...
              — Leah, Middle West Studio
REMINDER      same quoted line, same "— Peer", foot unchanged
OVERDUE       same
```

R3 reproduced `— Leah` on exactly this input. The four embedded
`project_approval_artifacts` selects carry `why_author_name`
(`decision-first-notice`, `decision-reminders`, `expire-decisions`,
`decision-resolved-notify`); `resolveApprovalArtifactCitation` trims it and drops it
whenever the why is absent; `renderDesignerNote` prefers frozen author → cobrand →
studio → nothing. `notification-digest` is correctly left alone (it never selected
`why` either, so it renders no note).

### B2 — a receipt is not a summons · FIXED

`notify_client_attention` is grafted whole from 00534 — I diffed the two bodies and
the ONLY delta is the receipt branch, so every other caller is byte-identical.
Probed in-tx over the fixture's six decisions:

```
 title        | channel | status    | opened | kind             | row_title
 W2 released  | push    | queued    | f      |                  | A sign-off needs you   ← the ASK's envelope
 W2 released  | in_app  | opened    | t      | decision_receipt | You approved "W2 issued set 1".
 W2 returned  | in_app  | opened    | t      | decision_receipt | You returned "W2 issued set 2".
 W2 signed    | in_app  | opened    | t      | decision_receipt | You approved "W2 issued set 8".
 W2 revise-*  | in_app  | delivered | f      |                  | A sign-off needs you   ← unanswered, untouched
```

No push row of `kind = 'decision_receipt'` exists anywhere; the one push row each
answered approval owns is the ask's, written at publish. The `status`/`opened_at`
pair is the exact shape `NotificationsAPIClient.markOpened` writes, and
`collapsedBadgeCount` drops an entity as soon as any row of it reads read, so the
springboard number no longer counts her own answer. The `::public.notification_status`
casts are present on both the UPDATE and the INSERT.

### B3 — a comma is not a list · FIXED, both owners

Run through the real SQL function and the real Deno helper; identical on both sides:

```
one, clean name   It releases the cabinet order.
one, with comma   It releases one piece that was waiting on it.
two               It releases two pieces that were waiting on it.
none / NULL       Your answer is on the record.
twenty-one        It releases the pieces that were waiting on it.
```

The "and" join is gone. `RELEASED_COUNT_WORD` now starts at "one" and is indexed by
`length - 1`; the SQL array mirrors it.

### m1 — deno fmt · FIXED

`deno fmt --check` over all 12 branch-touched function files: **Checked 12 files**, no drift.

### n3 — the ask's action set on the receipt push · CLOSED BY B2

There is no receipt push, so `PATINA_DECISION` never rides one.

---

## 2 · Gates I ran myself

| gate | result |
|---|---|
| `deno test --allow-all --config .../supabase/functions/deno.json .../supabase/functions/_shared/` | **ok · 204 passed · 0 failed** |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **ok · 42 passed · 0 failed** |
| `deno test … decision-reminders/ decision-resolved-notify/ notification-digest/` | **ok · 17 passed · 0 failed** |
| `deno check` on all six deploy-set `index.ts` | six `Check …` lines, clean |
| `deno fmt --check` on the 12 touched function files | clean |
| `pnpm --dir <wt> --filter @patina/supabase run type-check` | clean (exit 0) |
| `python3 scripts/generate-legacy-grants.py` | no drift — seed reproduces byte-identically |
| 00569 contract test, 00569 applied in a rolled-back tx | exit 0, no ERROR, no failed ASSERT |
| 00463 + 00464 contract tests, same way | clean each |
| `edge_api/public_rpc_authorization_contract_test`, `public_acl_exception_registry`, `public_acl_residual_census`, same way | clean each — the new signatures do not breach the ACL contract |
| live ACL probe after applying | anon `f` on all eight touched functions; `authenticated` only on the four public RPCs; `service_role` only on `notify_client_attention`; every one `SET search_path = public, pg_temp` |
| letters + receipts rendered through the real modules | six receipt variants + three ask letters, quoted above |

The shared local stack is at ledger tail **00571, 00568, 00567** with no 00569 — a
peer program (`agent-si-db`, studio invoices) reset it again. I did **not** reset: every
SQL result above was taken by applying 00569 inside a transaction and rolling it back,
which also re-proves that 00569 applies cleanly on a database already carrying
00570/00571. I confirmed `00571_studio_invoices.sql` redefines none of the six functions
00569 redefines, so the two migrations do not collide in either order.

## 3 · Structural reading of 00569

- **Lineage.** `grep … | sort | tail -1` agrees with the banner at every name:
  `notify_client_attention` ← 00534, the two creators ← 00463, `supersede…` ← 00464,
  `get_project_decision_reviews` ← **00465** (not 00464), `_respond…checked` ← 00464.
  I diffed each grafted body against its stated ancestor; every delta is a marked,
  intentional edit and nothing else moved.
- **Signature churn is safe.** The three DROP+CREATE pairs each drop the old arity
  first (the ambiguity rule), nothing else in the tree references those exact
  signatures, and PostgREST resolves by supplied argument names, so a portal still
  running the pre-deploy bundle calls the new function through its defaults.
- **DDL.** Two nullable `ADD COLUMN IF NOT EXISTS` (instant) and two CHECKs that scan a
  table holding a handful of Stage-2 artifacts. One transaction. Safe on Strata.
- **Grants.** `CREATE OR REPLACE` preserves 00534's ACL on `notify_client_attention`
  (probed after applying); the four new signatures carry their own REVOKE/GRANT and the
  regenerated seed reproduces with no drift.
- **Deploy set recomputed from actual import lines**: `apns-send`,
  `decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
  `expire-decisions`, `notification-digest`. Matches the lane's.
- **Scope.** 23 files, all inside the brief. No stray paths, no `.env`, no `.claude/`.

## 4 · Homeowner copy

Swept every added line for the refusals. Every hit is a comment, a test name or a
server-side error string; nothing homeowner-visible carries "gate", "task",
"dashboard", "overdue", "Declined", "AI", a badge, a numeric chip or an emoji.
`changes_requested` renders **returned** in the letter and **You returned "…"** on the
bell. The three receipt bodies read: the consequence, or "Your answer is on the
record." No CTA button — a plain `The record: <link>` line. Counts are words.

---

## 5 · Findings

### b4-01 · minor · an inherited why can be re-attributed to whoever reissued it

`supersede_project_approval_decision` carries the predecessor's attribution forward as
`v_why_author_name := v_old_artifact.why_author_name`, which may legitimately be NULL —
`why` non-null beside a NULL `why_author_name` satisfies the CHECK, and the creator
writes exactly that when the composer's profile carries neither `full_name` nor
`display_name`. The creating function then reads NULL as "resolve from the caller"
(`ELSIF v_why_author_name IS NULL THEN … WHERE author.id = v_actor`), so the successor's
identical, inherited sentence is signed by the reissuer.

Proven in-tx on the lane's own fixture: the composer's profile names were nulled, the
approval was composed with a why, confirmed, published, and reissued by Peer with no
`p_why`:

```
PREDECESSOR  why=The island moved a foot; the rest is as we drew it.  author=<NULL>
SUCCESSOR    why=The island moved a foot; the rest is as we drew it.  author=Peer
```

Peer did not write that sentence. The letter and the projection would both render
"— Peer" under it — the exact divergence the frozen column exists to prevent, which is
what made B1 a blocker. Narrower than B1 (it needs a nameless profile, plausible for a
studio member invited but not yet onboarded), hence minor rather than major.

Fix: distinguish "inherit, even when the inherited value is NULL" from "resolve from the
caller" — a sentinel, an extra boolean parameter, or resolving the author eagerly in the
supersede body and passing a non-null placeholder. Same sentinel family as m2.

### Carried, unchanged this round

| id | sev | what |
|---|---|---|
| m2 | minor | a revision cannot CLEAR the why: blank and absent are one value, and the author now carries with it. Unreachable today (no caller sends `p_why`… the designer lane now does, but never blank). Ruling owed. |
| m3 | minor | the projection has no status predicate, so draft approvals reach the household lead — now carrying the composer's why and its author. Wave 1 excluded drafts client-side only. |
| m5 | minor | `deliverDecisionNotification` is awaited unguarded in front of the P-20 receipt block in `decision-resolved-notify`; a throw there costs her the receipt, and 00174's trigger is one-shot. The lane applied the opposite principle in SQL. |
| m6 | minor | the receipt email has no retry sweep. Same ticket as the Wave-1 first-notice retry (P-28, Wave 3). |
| m7 | minor | `deliverDecisionReceipt`'s docstring still opens by claiming a quiet-hours gate the path does not have; the next paragraph says the opposite. One sentence. |
| m9 | minor | "signature only on Approve" is enforced by the surfaces alone; the server still accepts a signature on `changes_requested`/`needs_discussion` and an approval with none. Accept-and-document, or refuse it in one place. |
| m10 | minor | `pickProjectThreadId` needs exactly one project thread; live index list still shows only the non-unique partial `idx_comms_threads_project`. Degradation is the ruled fallback. |
| m11 | minor | R16's 8am–8pm push window does not exist on this rail. `grep -niE "quiet\|08:00\|20:00\|8am\|push_window"` over `apns-send/`, 00534, 00568 and 00569 returns only 00534's "a quiet NULL" comment. Wave 3 item. |
| m8 | nit | four commits made with `--no-verify` (`dae0e953c`, `722434763`, `6d2316922`, `459de403b`). Cause verified: the scanner reads whole files and `apns-send/core.ts` + `_tests/apns-send.test.ts` carry the documented PEM framing. I re-scanned the branch diff independently — no secret is added. |
| n1 | nit | the last case in `client-attention-deep-links.test.ts` still builds a path and asserts a regex over the string it just built. |
| n2 | nit | the receipt subject keeps its trailing period against F11's rule for the three ask letters. Still unruled either way. |
| n4 | nit | the answered letter's only accent is the sage `#4E7A66` link, against the mid-Wave-2 ruling moving answered marks to mocha. Design steward's call; move both links together if it moves. |
| n5 | — | RESOLVED at program level: `whyAuthorName`/`viewerRole` consumers now exist on `approvals/w2-web`, `approvals/w2-designer` and `approvals/w2-iosd`, and the designer lane sends `p_why` under exactly that parameter name. |

### New nits

- **b4-n1 · deploy order is load-bearing and its cost is permanent.** All four decision
  functions now select `why_author_name`. Deployed before 00569 they take a PostgREST
  400 on the embedded select, `decision-first-notice` answers `decision_not_found`, and
  00568's publish trigger is one-shot — the first notice is lost, not delayed. The lane
  documents migration-first; the wave report should say why.
- **b4-n2 · the ask letter now carries two names.** The subject reads
  "Leah sent …" and the overdue opening "Still open, Leah asked on …" (the designer of
  record, per R7/R8) while the quoted line beneath is signed "— Peer". Both are ruled
  correctly; whether a homeowner should meet two names in one letter is a design call.
- **b4-n3 · a doc overclaim.** The notes say the receipt makes "the springboard number
  fall". With no receipt push, `aps.badge` is never recomputed — the number falls on
  the next push to that user, or when the app foregrounds and loads the feed. The
  count is right; the timing claim is not.
- **b4-n4 · cosmetic.** The supersede graft added a stray blank line before its closing
  `$$;`.

### Advisory to the integration steward

`packages/supabase/src/database.types.ts` (this lane) and
`packages/supabase/src/hooks/use-project-approvals.ts` (web AND designer lanes) are
touched by three branches; expect conflicts in `packages/supabase`. The web lane's
`00570_approval_response_signature.sql` still exists on `approvals/w2-web` and must be
deleted at integration per the ruling — 00569 already carries its wrapper verbatim in
substance, and I read both. The iOS-C lane has correctly deleted its duplicate 00569.

