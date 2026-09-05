# Wave 2 — backend lane, adversarial review R3

Reviewer context: separate from the implementer. Worktree under review
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-backend`,
**twelve** commits on `main..HEAD`, 22 files, +4703/−60.

Round 3 covers the four commits made after R2's "ship": the three mid-Wave-2 rulings
(`040af9de7` — 00570 folded in + `why_author_name`; `6d2316922` — the lock screen's
`thread_id`) and two docs commits.

## Verdict

**fix** — one blocker, two majors.

The blocker is a ruled item this lane owns and did not finish: the mid-Wave-2 ruling says
"every surface renders `— {whyAuthorName}` only when present". The projection does. The
**letter does not** — it signs the designer's first-person note with the *project's*
designer, resolved live at send time, which is a different person whenever a studio
co-member composed the ask. `grep -rn "why_author_name\|whyAuthorName" supabase/functions/`
returns **nothing**.

Everything else in the two fix commits is right, and I verified it against a running
database rather than against the lane's own note.

---

## 0. A note on the environment, because it changes what a gate proves

The shared local stack **does not carry 00569**. It is at ledger head **00570** — the web
lane's migration — with `project_approval_artifacts.why` absent and the four-argument
`_create_project_approval_decision_checked` installed:

```
$ psql … -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 3"
00570
00568
00567
$ … "select column_name from information_schema.columns
     where table_name='project_approval_artifacts' and column_name in ('why','why_author_name')"
(0 rows)
```

This is the third instance of the collision the lane already recorded in
`stack-reset-notice.md`. I am forbidden to reset, so I probed by **applying 00569 inside a
transaction I rolled back** — DDL is transactional in Postgres, so this exercises the real
migration against the real schema and leaves the shared stack byte-identical:

```
BEGIN;
\i supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql
<the contract test's body, or my own probes>
ROLLBACK;
```

Every SQL result below was taken that way. It also proves something useful for integration:
**00569 applies cleanly on top of a database that already has 00570**, and the contract
test passes there.

---

## 1. Findings

### B1 · blocker · the letter attributes the why to the wrong person

**Ruling (mid-Wave-2):** "The why is attributed to its author. 00569's projection emits
`whyAuthorName` (the composing designer's display name, frozen with the artifact); **every
surface** renders `— {whyAuthorName}` only when present."

Delivered on the projection. Not delivered on the email, which is the surface this lane owns.

- `renderDesignerNote()` (`_shared/decision-notify.ts:493-505`) signs the note with
  `cobrand.designerGivenName ?? cobrand.studioName`.
- `cobrand` comes from `resolveDecisionSignature` → `resolveStudioSignature`
  (`_shared/studio-identity.ts:163`), which reads `profiles.full_name` for
  **`client_decisions.designer_id`** — the project's designer of record, resolved **live at
  send time**.
- The three notice functions do not even select the frozen column:
  `grep -rn "why_author_name\|whyAuthorName" supabase/functions/` → **no matches**.

This is not only the rename divergence the frozen column exists to prevent; it is a wrong
name on the **first** send. Any studio co-member may compose (`create_…_checked` gates on
`is_design_studio_comember(v_project.designer_id)`), and the lane's own fixture proves the
split — from my probe of the artifact table with 00569 applied:

```
 artifact_title  |                     why                      | why_author_name
-----------------+----------------------------------------------+-----------------
 W2 issued set 7 | You asked us to hold the island where it was  | Peer
```

`W2 issued set 7` was composed by `Peer Ashford`; the project's `designer_id` is
`W2 Designer`. The projection renders `— Peer`; the letter renders the project designer.
A homeowner reads a sentence written in the first person and signed by someone who did not
write it, and the two surfaces disagree about who spoke.

Rendered proof that the letter takes the cobrand name, from a throwaway Deno script:

```
Hi Harper, "Kitchen plan set" is still open and due Saturday.
“The island moved a foot; the rest is as we drew it.” — Leah      ← cobrand.designerGivenName
Edition 3 · issued September 1 … — Leah, Middle West Studio Chicago
```

**Fix:** add `why_author_name` to the four embedded `project_approval_artifacts` selects
(`decision-first-notice`, `decision-reminders`, `expire-decisions`,
`decision-resolved-notify`), carry it on `ApprovalArtifactCitation`
(`resolveApprovalArtifactCitation` already trims `why`), and make `renderDesignerNote`
prefer the frozen name over `cobrand.designerGivenName`, keeping the existing
studio-name → nothing fallback. The lane names this itself under "Left open, deliberately";
the ruling does not leave it open.

### B2 · major · the receipt pushes, sounds and badges the person who just acted

Mechanism confirmed end to end this round, not inferred:

- `_respond_project_approval_checked` calls
  `notify_client_attention(v_snapshot.decision_lead_id, 'decision', …)` — and three lines
  above it refuses any actor that is not that same lead. The receipt is always addressed to
  the person who just answered.
- My probe (00569 applied in-tx) shows the receipt landing on both legs and **unread**:

```
 channel |        type        |       kind       |              title              |             body               | unread
 in_app  | decision_attention | decision_receipt | You approved "W2 issued set 1". | It releases the cabinet order. | t
 push    | decision_attention | decision_receipt | You approved "W2 issued set 1". | It releases the cabinet order. | t
```

- `apns-send/core.ts` gives every push `sound: "default"` and now
  `"interruption-level": "active"`, so the receipt wakes the screen and makes a noise.
- `unreadInAppBadge` + `collapsedBadgeCount` count one per unread entity, so the springboard
  badge R5 made real rises for the acknowledgment of her own act whenever the ask row was
  already opened (the ordinary case if she answered in the app); when it was not, the
  dedupe UPDATEs and the number merely fails to fall.
- iOS routes the row into the `.decision` bucket
  (`NotificationsAPIClient.swift:240`), so the bell also carries an unread dot for it.

Raised at R1 (B6), re-confirmed at R2 (§2.4) as "ruling owed"; three rounds later there is
still no ruling and the behaviour ships as-is. The vision line "never optimize the studio
surface for engagement / no guilt" argues the receipt should be **push-silent and
read-on-arrival** — bell row written already opened, no APNs dispatch — with the email
carrying the ceremony. That is a small change in one place (`notify_client_attention`'s
call site plus an `opened_at`), and it is the difference between a receipt and a nag.

### B3 · major · the consequence clause still reads as raw data

`public._project_approval_release_sentence` and its Deno mirror `decisionReleaseSentence`
interpolate `project_ffe_items.name` verbatim. Rendered through the real function:

```
It releases Built-in shelving, north wall.
It releases Built-in shelving, north wall and Built-in Window Banquette.
It releases three pieces that were waiting on it.
```

The second line reads as a list of three things because the first name contains a comma.
The proposal's exemplar ("It releases the cabinet order.") assumes an articled lower-case
phrase; catalogue names are Title Case noun phrases with commas in them. This is
homeowner-visible copy on three surfaces at once (email body, bell, lock screen).

Raised at R1 (B4), re-evidenced at R2 (§2.2), unchanged. Cheapest honest fix: name pieces
only when the array is 1 long **and** the name has no comma, else count them
("It releases two pieces that were waiting on it."), in both owners together. Words over
numbers is satisfied either way.

---

## 2. Minors

| # | finding |
|---|---|
| m1 | **New `deno fmt` drift.** `decision-resolved-notify/index.ts` and `_tests/apns-send.test.ts` are formatted on `main` and unformatted on this branch (`deno fmt --check` per file, both checkouts). Two wrapped conditions; `deno fmt` fixes both. |
| m2 | **A revision still cannot CLEAR the why** (r2-2.1). `v_why := COALESCE(v_why_given, v_old_artifact.why)` treats blank and absent alike, and now the author carries with it. Unreachable today (no caller sends `p_why`); still a ruling. |
| m3 | **DRAFT approvals reach the household lead through the projection — now carrying the why and its author.** My probe as the lead returns rows with `"lifecycle": "draft"` and a populated `why`/`whyAuthorName`. The row filter is `(v_is_studio OR snapshot.decision_lead_id = v_actor)` with no status predicate; Wave 1 excluded drafts client-side only. The lane names it; P-13 widens what leaks from title/question to the composer's line. |
| m4 | **`released_item_count` and the sentence can understate.** The UPDATE releases every matching row; the array filters blank names (`WHERE NULLIF(btrim(released.name),'') IS NOT NULL`). Never overstates. (r2-2.6, unchanged.) |
| m5 | **The designer leg is unguarded in front of the homeowner's receipt.** `decision-resolved-notify` awaits `deliverDecisionNotification` before the receipt block; a throw there (network, not an error return) costs her the one-shot receipt entirely. The lane applied exactly this principle in SQL — "a notification can never unwind a homeowner's answer" — and not here. A `try/catch` around the designer leg restores the symmetry. |
| m6 | **The receipt has no retry.** 00174's trigger is one-shot, as the first notice was; a transient failure loses the letter silently. Same class as the Wave-1 first-notice retry that rides P-28 (Wave 3) — worth carrying on the same ticket. |
| m7 | **`deliverDecisionReceipt`'s docstring is wrong about its own gate.** It claims the chokepoint applies "preference + channel gate, quiet hours, suppression, rate cap"; `sendCompliantEmail` has no quiet-hours logic and this path never calls `isQuietHours`. The behaviour (send regardless of hour) is the right call and the paragraph below says so — the first sentence should stop claiming otherwise. |
| m8 | **Three `--no-verify` commits, 14 files unscanned** (`dae0e953c`, `722434763`, `6d2316922`). The reason is real and documented (the scanner reads whole files; `apns-send/core.ts` has carried the PKCS#8 header literal since I66). I scanned the branch diff myself — `git diff main...HEAD | grep -inE "PRIVATE KEY\|eyJ…\|sk_live\|sk_test\|AKIA…\|-{5}BEGIN"` returns only the notes' own prose about the trap. Clean, but the exemption should be recorded for the wave report. |
| m9 | **"Signature only on Approve" is enforced nowhere on the server.** `respond_project_approval` accepts `clientConsentMethod`/`clientSignature` on any outcome, and accepts an *approval with neither* — the ceremony lives entirely in the two surfaces. Defensible (the migration says it adds no rule), but it means a future surface that forgets the typed name records an unsigned approval and nothing notices. |
| m10 | **`pickProjectThreadId` needs exactly one project thread and nothing guarantees one.** `comms_threads` has no unique index on `project_id` for `kind='project'` (only `idx_comms_threads_project`, non-unique). A project that ever acquires two project threads loses "Ask a question" routing permanently and silently. The graceful fallback is the ruling's, so this is a monitoring/constraint note rather than a defect. |
| m11 | **R16's 8am–8pm push window still does not exist on this rail** (r2-2.5). `grep -niE "quiet\|08:00\|20:00\|push_window"` over `apns-send/`, 00534 and 00568 finds only 00534's "a quiet NULL" comment. Out of this lane's brief; flagged so it does not close with Wave 2. |

## 3. Nits

- **n1** `_tests/client-attention-deep-links.test.ts`'s last case is still tautological:
  `const path = \`/${entityType}s/${ID}\`` and then a regex over the string it just built
  (r1-B7). The real pin is 00569's SQL assert, which I re-ran and which passes.
- **n2** The receipt subject inlines straight quotes and carries a trailing period, departing
  from F11's no-trailing-period rule for the three ask letters (r1-B8). F11's own test still
  passes because it iterates the three asks. Ruling owed.
- **n3** `PATINA_DECISION` puts "Open / Ask a question" on the **receipt** push as well as
  the ask. Harmless (neither action is Approve or Sign) but the action set was designed for
  an ask.
- **n4** The answered letter's only accent is the `#4E7A66` "verd" link colour. It is the
  colour the same module already uses for the ask letter's plain link, so it is not a new
  choice — but the mid-Wave-2 pigment ruling moves *answered* marks to mocha, and this is
  the one letter that is entirely about an answer.
- **n5** Cross-lane: nothing on this branch consumes `why`, `whyAuthorName`, `viewerRole` or
  `clientSignature` — `packages/supabase`'s `parseProjectApprovalReview` still drops them
  (r1-B3). Expected given the lane split; it is the integration steward's join.

---

## 4. Round-2 work verified

| ruling | state |
|---|---|
| **00570 folded into 00569** | ✔ allow-list is `['outcome','optionId','clientConsentMethod','clientSignature']`; the two hard-coded NULLs are `v_consent_method`/`v_signature`, each `NULLIF(btrim(COALESCE(…,'')),'')`. All validation stays in `_respond_project_approval_checked`, and I diffed that body against 00464 — the only hunks are the disclosed P-20 edits (released-names CTE, `releasedItemNames`, the receipt block and its five new locals). Probed: `{"outcome":"approved"}` leaves all three consent columns NULL; `{"outcome":"approved","clientConsentMethod":"electronic_signature","clientSignature":"Harper Vale"}` writes method, signature and `client_consented_at`. |
| **whyAuthorName frozen, not joined** | ✔ column + `CHECK ((why_author_name IS NULL OR char_length(btrim(why_author_name)) BETWEEN 1 AND 120) AND (why IS NOT NULL OR why_author_name IS NULL))`; resolved by the same first-token rule as `givenName()`; truncated (`left(…,120)`), never raised on. Private 6-arg `_create_…_checked`; public creator untouched at 4. Probed: lead's projection carries `whyAuthorName` `"W2"` on the carried revision and `"Peer"` on the re-asked one, and `null` on both why-less rows. **The projection half is correct; see B1 for the half that is missing.** |
| **`thread_id` on the envelope** | ✔ `projectTableFor` (decision/proposal/invoice only), `pickProjectThreadId` (exactly one row or nothing), payload key omitted rather than nulled, `aps["thread-id"]` untouched. `client_decisions`, `proposals`, `invoices` all carry `project_id` and `comms_threads` carries `project_id`+`kind` — verified against `information_schema`. `resolveProjectThreadId` returns null on any failure. |
| **R1/R2 majors** | ✔ B1 (collapse id gated on `apnsCategoryFor`) and B2 (supersede carries the why forward) both still fixed and still pinned. |
| **Contract tests retargeted, not weakened** | ✔ 00463 → 6-arg private creator with `proargnames` pinned; 00464 → 5-arg supersede plus a new `COALESCE(v_why_given, v_old_artifact.why)` assert. Both pass with 00569 applied. |
| **Migration safety on Strata** | ✔ no top-level BEGIN/COMMIT, no `CONCURRENTLY`, no DROP COLUMN/TABLE, `extensions.`-qualified everywhere, every function `SET search_path = public, pg_temp`. Two nullable ADD COLUMNs (no rewrite) and two CHECKs (validating scan on a small table). The artifact guard blocks every UPDATE outright, so the new columns are as immutable as the rest. |
| **Grants** | ✔ with 00569 applied: `anon` holds EXECUTE on **none** of the seven functions; `authenticated` on exactly the four public ones; the two `_checked` cores and `_project_approval_release_sentence` private. `python3 scripts/generate-legacy-grants.py` reproduces the committed seed with **no drift** and the tree stays clean. |
| **Deploy set** | ✔ six functions — `apns-send`, `decision-first-notice`, `decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `notification-digest` — recomputed from the two edited `_shared` modules' importers plus the touched directories. |

## 5. Gates I ran myself

| gate | result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **ok · 200 passed · 0 failed** |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **ok · 42 passed · 0 failed** |
| `deno test … decision-reminders/` · `notification-digest/` | 6 passed · 11 passed |
| `deno test … _tests/` (whole dir) | type-check failure in `fulfillment-po/core.ts:314` — **reproduced identically from the main checkout**, pre-existing, not this branch |
| `deno check` on all six deploy-set `index.ts` | six `Check …` lines, clean |
| `deno fmt --check` on the touched files | **2 files newly drifted** (m1) |
| `pnpm --dir <wt> --filter @patina/supabase run type-check` | clean (exit 0) |
| `python3 scripts/generate-legacy-grants.py` | no drift; `git status` clean afterwards |
| `deno.lock` at root / `supabase/functions` | absent, both |
| `bash scripts/run-sql-tests.sh` (shared stack, **at 00570 without 00569**) | 157 total · 131 green · 21 expected-fail · **5 unexpected** |
| — of those 5: `00463`, `00464`, `00569` approval_authority | environmental: they assert 00569's shapes and 00569 is not applied to the shared stack |
| — of those 5: `edge_api/public_sd_hardening`, `mood_boards/project_board_share` | **also fail from the main checkout** against the same database — not this branch |
| 00463 / 00464 / 00569 contract tests, with 00569 applied in a rolled-back transaction | **all three exit 0**, no ERROR, no failed ASSERT |
| live behavioural probe (rolled back) | projection carries `why` / `whyAuthorName` / `viewerRole`; `viewerRole` = `lead` from the lead's chair and `studio` from the peer's; consent columns written only when the payload carries the pair; receipt bell + push rows written with `metadata.kind = 'decision_receipt'` and `/decisions/<id>`; `/proposals/<id>` and `/invoices/<id>` written for the other two producers (P-06) |
| letters rendered through a throwaway Deno script | first notice, reminder, overdue (why + attribution present, escaped, dropped when no name resolves) and five receipts (approved/returned/held × 0/1/2/3 released) |

## 6. Refusal scan

Every homeowner-visible string added by this branch, read in the rendered output rather
than in source: `You approved "…". / You returned "…". / You held "…."`, `It releases …`,
`Your answer is on the record.`, eyebrow `Answered`, `The record: <url>`, and the quoted
designer note with `— {name}`. No badge, no count chip, no red/green status, no checkmark,
no shadow, no fill, no tab, no emoji, no "AI", no "gate"/"task"/"dashboard"/"overdue".
`changes_requested` is **returned** everywhere and "Declined" appears nowhere. The client
footer omits "Dashboard" (that branch is designer-only). The only colour on the receipt is
the module's existing link "verd" (n4). B3 is a copy defect, not a refusal breach.

## 7. Commit hygiene

Twelve commits, Conventional Commits subjects, no `merge(...)`, no trailers, explicit
pathspecs, no `git add -A` residue. Nothing under `.claude/`, `.agents/`, hooks, settings or
any `.env`. `stack-reset-notice.md` in this worktree is byte-identical to the shared copy in
the main checkout (`diff` empty) — the clobber the lane recorded is genuinely repaired.
