# W2 backend lane — adversarial review, round 2

Reviewer context: separate from the implementer. Worktree under review
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-backend`,
seven commits on `main..HEAD`.

**Verdict: ship.** No blocker, no major. The two round-1 majors are genuinely fixed —
each verified against the running database and by reading the grafted body, not by
reading the lane's own note. Eight round-1 minors/nits stand (six of them by design or
awaiting a ruling), and six further small things are recorded below.

---

## 1. Round-1 findings — verified one by one

### B1 · collapse id swallowed unrelated notices — **FIXED**

`buildApnsHeaders` now gates the header on the routed category:

```
const thread = apnsThreadId(input);
if (thread && apnsCategoryFor(input.entity_type)) {
  headers["apns-collapse-id"] = thread;
}
```

`thread-id` stays universal (grouping stacks, it never replaces), which is the right
split. Two tests pin both halves — "an unrouted entity stacks: threaded for grouping,
never collapsed" asserts `!("apns-collapse-id" in headers)` for a `design_request`
push and still asserts the thread id, and "every routed entity collapses its repeats"
loops decision/proposal/invoice. `_tests/apns-send.test.ts` went 36 → 38 tests and I
ran them: **ok | 38 passed | 0 failed**.

No regression: nothing else in the tree reads `apns-collapse-id`, and the three
`design_request` producers (00330:187, 00331:347, 00334:125) now stack again.

### B2 · the why vanished on every revision — **FIXED**

`supersede_project_approval_decision` is widened to five parameters with a defaulted
trailing `p_why`, the four-argument signature DROPped first. Verified live:

```
supersede_project_approval_decision | p_decision_id uuid, p_payload jsonb,
  p_expected_updated_at timestamp with time zone, p_idempotency_key text, p_why text
```

I diffed the grafted body against 00464's (the graft rule's `grep|sort|tail -1` gives
00464 for this function, confirmed) — **five hunks, all of them the disclosed edits**:
signature, two locals, the hash `|| CASE WHEN v_why_given IS NULL THEN '{}'::jsonb …`,
`v_why := COALESCE(v_why_given, v_old_artifact.why)`, and the fifth argument on the
creator call. Nothing else in 247 lines moved.

Both installed callers still resolve at four arguments —
`packages/supabase/src/hooks/use-project-approvals.ts:693` (named) and
`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql:230` (positional) — and
`pnpm --dir packages/supabase run type-check` is clean with `p_why?: string`.

The behavioural test is real, not structural: 00569's contract test supersedes one
published approval with no `p_why` and asserts the successor artifact carries
`'The island moved a foot; the rest is as we drew it.'`, and supersedes a second with
an explicit line and asserts the new line won. It passes.

Grants: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` then
`GRANT EXECUTE … TO authenticated` for the new signature, and I re-ran
`python3 scripts/generate-legacy-grants.py` — **no drift**, the committed seed already
matches ("baseline + 2160 replayed statements", `git status` clean for the seed).

### B3–B10 · still open

| id | state | why |
|---|---|---|
| B3 viewerRole dropped by `parseProjectApprovalReview` | **open** | neither `why` nor `viewerRole` is in the hook on this branch; integration item |
| B4 FF&E names interpolated raw | **open** | reproduced against the real seed, worse than the round-1 sample — see 2.2 |
| B5 `'household'` absent from the iOS role sets | **open** | iOS-lane file, unreachable at 00569 (row filter) — latent |
| B6 receipt pushes/badges the person who just acted | **open** | ruling owed; mechanism re-confirmed, see 2.4 |
| B7 tautological deep-link case | **open** | `const path = \`/${entityType}s/${ID}\`` then asserts a regex over it |
| B8 receipt subject inlines its own quotes; trailing period vs F11 | **open** | ruling owed |
| B9 receipt push carries `sound: "default"` | **open** | pre-existing on the rail; ruling owed |
| B10 `--no-verify` commits | **open, larger** | now **two** commits (`dae0e953c`, `722434763`), **14 files** unscanned |

---

## 2. Findings this round

### 2.1 A revision cannot CLEAR the why (new, minor)

`v_why_given text := NULLIF(btrim(COALESCE(p_why, '')), '')` and then
`v_why := COALESCE(v_why_given, v_old_artifact.why)`. Blank and absent are the same
value, so a designer who *deletes* the line on a reissue silently gets the
predecessor's line back in the homeowner's next letter. There is no argument that
means "reissue with no why". Unreachable today (the designer supersede hook sends no
`p_why` at all), so this is a design consequence to rule on, not a live defect.

### 2.2 The consequence clause still reads as raw data (B4, re-evidenced)

Rendered through `public._project_approval_release_sentence` against the **local seed's
own** `project_ffe_items.name` values:

```
It releases Built-in shelving, north wall.
It releases Built-in shelving, north wall and Built-in Window Banquette.
It releases three pieces that were waiting on it.
```

The two-name case is worse than round 1 recorded: the comma inside the first name makes
the join read as a list of three things. The proposal's exemplar ("It releases the
cabinet order.") assumes an articled lower-case phrase; the counted branch always reads
well. Both owners (SQL + `decisionReleaseSentence`) would have to change together.

### 2.3 The receipt only *replaces* the ask when lead == designer_clients.client_id (new, nit)

00534's `notify_client_decision_raised` addresses `designer_clients.client_id`; the
receipt addresses `project_decision_authority_snapshots.decision_lead_id`
(00569 `_respond_project_approval_checked`, which itself refuses any actor that is not
that lead). They are normally the same person, so the migration's "the receipt replaces
the unread needs-you line" holds. After a lead reassignment they diverge and the
household's unread ask stays beside a receipt addressed to somebody else.

### 2.4 The badge does move for her own act (B6, mechanism re-confirmed)

`unreadInAppBadge` selects `metadata, opened_at, status` where `channel = 'in_app'`, and
`collapsedBadgeCount` counts one per unread entity. When the homeowner already opened
the ask row — the ordinary case if she answered in the app — the dedupe in 00534 finds
no unopened row, INSERTs a fresh one, and the springboard badge rises by one for the
acknowledgment of her own act. When she never opened it, the row is UPDATEd and the
number holds. Both are the rail the brief named; the question is whether the receipt
should be push-silent.

### 2.5 R16's 8am–8pm push window does not exist on this rail (new, minor, out of brief)

`grep -niE "quiet|08:00|20:00|8am|push_window"` over `apns-send/`, `00534`, `00568`
returns only 00534's comment "a quiet NULL". The ask push and now the receipt push both
fire at any hour. R16 is binding on the program; nothing in P-13/P-20/P-22/P-06 asked
this lane to build it. Flagging so it is not lost with Wave 1's close.

### 2.6 Two smaller things

- `respond_project_approval` is redefined **byte-identically** to 00464 in 00569
  (`diff` is empty). Harmless — it re-issues its own REVOKE/GRANT and keeps the pair
  together — but it is 40 lines of migration that change nothing.
- The release array filters blank names (`WHERE NULLIF(btrim(released.name),'') IS NOT
  NULL`) while the UPDATE still releases those rows, so `released_item_count` and the
  sentence can understate what moved. Never overstates.
- The receipt bell row inherits the ask row's `metadata` keys (`due_date`,
  `coordination_kind`) through 00534's `metadata || v_meta`. No client reads them; inert.

---

## 3. Brief coverage

| item | state |
|---|---|
| P-13 column + CHECK ≤200 | ✔ `why text`, `CHECK (why IS NULL OR char_length(btrim(why)) BETWEEN 1 AND 200)` verified live via `pg_get_constraintdef` |
| P-13 both creating RPCs widened | ✔ grafted from 00463, old signatures DROPped, why in the hash only when present |
| P-13 on the projection + composer read | ✔ `get_project_decision_reviews` emits it; `list_my_project_decision_reviews`, `get_project_decision_review` and `app_private.project_decision_review_for_actor` all delegate to it |
| P-13 render on first notice / reminder / overdue | ✔ probed all three: `"The island moved a foot…" | — Leah` under the ask |
| P-13 tests | ✔ SQL (create, read back, >200 refused at RPC and at column) + 4 deno tests |
| viewer role `lead\|studio\|household` | ✔ lead-first precedence, SQL test from both chairs |
| P-20 client rail chosen and justified | ✔ `notify_client_attention` for bell+push, email on `decision-resolved-notify` (00174's existing trigger); kind lives in `metadata.kind` / log `type`, collides with no dedupe key |
| P-20 subject + consequence-or-silence | ✔ `You approved "…".` / `You returned "…".` / `You held "…".`; "Your answer is on the record." when nothing released |
| P-20 no CTA, plain record link | ✔ `The record: https://client.patina.cloud/decisions/<id>` via `clientDecisionLink`; tests assert no "Approve"/"Sign" |
| P-20 deno tests with and without consequence | ✔ |
| P-22 category / thread-id / collapse header / active / badge kept / no NSE | ✔ all six, with tests |
| P-22 "notify_client_attention needs no new params" | ✔ confirmed and stated; entity_id present for all three producers |
| P-06 verify + one deno test | ✔ (test is partly source-grep; the real pin is 00569's SQL `metadata.deep_link` asserts) |
| migration banner, lineage, search_path, extension qualification, grants | ✔ all present; `extensions.gen_random_uuid` / `extensions.digest` qualified everywhere |
| deploy set | ✔ six functions; I recomputed the closure from actual `from "…"` lines — `invoice-reminders` mentions `decision-notify.ts` only in a comment, so it is correctly out |

Refusal scan over every added line (`gate|task|overdue|dashboard|AI|Declined|badge|
emoji|shadow|checkmark|sage|green|red`) turns up only internal identifiers
(`decision_overdue`) and test names. `#4E7A66` on the receipt's record link is the
`branded-email.ts` "verd" link colour already used by the same module's other plain
link — not a new palette choice. The client footer omits "Dashboard" (that branch is
designer-only).

---

## 4. Gates I ran myself

| gate | result |
|---|---|
| `bash scripts/run-sql-tests.sh` | **157 total · 136 green · 21 expected-fail · 0 unexpected · effective-green 157/157** |
| `deno test _shared/` | **ok · 200 passed · 0 failed** |
| `deno test _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **ok · 38 passed · 0 failed** |
| `deno test decision-reminders/` · `notification-digest/` | 6 passed · 11 passed |
| `deno check` on all six deploy-set `index.ts` | all `Check …`, clean |
| `python3 scripts/generate-legacy-grants.py` | **no drift** — regenerated file identical to the committed one |
| `pnpm --dir packages/supabase run type-check` | clean |
| `pnpm --dir packages/supabase run test` | **84 files · 989 passed · 12 skipped** |
| `deno.lock` | absent at root and at `supabase/functions` |
| live DB probe (no reset) | 00569 in the ledger; five-arg supersede installed; `anon` holds EXECUTE on none of the new signatures; `_create_…_checked` and `_respond_…_checked` private |

Commit hygiene: seven commits, Conventional Commits subjects, no `merge(...)`, no
trailers, explicit pathspecs, no stray files, nothing under `.claude/`, `.agents/`,
hooks, settings or any `.env`.
