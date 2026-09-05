# Wave 2 — backend lane, adversarial review R1

Reviewer context: separate from the implementer. Worktree under review
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-backend`
(`git rev-parse --show-toplevel` → exactly that), branch `approvals/w2-backend`,
three commits on top of `main`:

```
37eba0291 docs(approvals): W2 backend lane log
dae0e953c feat(edge): the why in the letter, the receipt after the act, the lock screen
372a7181d feat(approvals): the designer's why, the viewer's chair, and the household's receipt
```

18 files, +2887/−40. Nothing outside `supabase/**`, `packages/supabase/src/database.types.ts`
and the program's own `build/waves/w2/backend-notes.md`. No `.claude/`, no hooks, no `.env`,
no `git add -A` residue: every commit is pathspec-clean.

## Verdict

**fix** — no blocker, two majors. Every one of the five briefed items is delivered and
provable; the majors are a scope over-reach on the push rail and a hole P-13 leaves on the
revise path.

## Gates I ran myself

| gate | result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | `ok \| 200 passed \| 0 failed (1s)` |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | `ok \| 36 passed \| 0 failed (63ms)` |
| `deno check` on all six deploy-set `index.ts` (apns-send, decision-first-notice, decision-reminders, decision-resolved-notify, expire-decisions, notification-digest) | clean, six `Check …` lines, no diagnostics |
| `bash scripts/run-sql-tests.sh` (against the already-reset local stack, no reset of my own) | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157`; `00569_why_viewer_role_receipt_contract_test.sql` **PASS** |
| `deno.lock` left behind | none at repo root or `supabase/functions` |

Live probes against `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (read-only, no reset):

- `project_approval_artifacts.why` — `text`, `is_nullable = YES`.
- `CHECK (((why IS NULL) OR ((char_length(btrim(why)) >= 1) AND (char_length(btrim(why)) <= 200))))`;
  evaluated: 201 chars → false, 200 → true, `'   '` → false.
- `to_regprocedure` — `create_project_approval_decision(uuid,jsonb,text,text)` present,
  `(uuid,jsonb,text)` **gone**, `_project_approval_release_sentence(text[])` present.
- grants: `anon create4 false · authenticated create4 true · service_role create4 false ·
  anon checked false · anon/authenticated/service_role sentence false ·
  anon reviews false · authenticated reviews true`. The regenerated
  `seed/00-legacy-grants.sql` is load-bearing and correct (+54/−18; the three stale 00463
  three-arg statements are removed because the function no longer exists).
- `_project_approval_release_sentence`: `[]`→"Your answer is on the record." · `[one]`→"It
  releases the cabinet order." · `[a,b]`→"It releases a and b." · 3→"three pieces…" ·
  21→"the pieces…" · `NULL`→"Your answer is on the record."
- `decision_resolved_email_dispatch` trigger is live with
  `WHEN (old.status <> 'responded' AND new.status = 'responded')`, and 00569's
  `_respond_project_approval_checked` sets `status = 'responded'` — the receipt's email leg
  really does fire on this transition.
- `project_decision_authority_snapshots` carries `decision_lead_id → profiles(id)`, so
  `decision-resolved-notify`'s new `profiles!decision_lead_id` embed resolves.
- No view over `project_approval_artifacts`, one guard trigger, and the only two
  `INSERT INTO public.project_approval_artifacts` sites are 00463 and 00569 — both column-listed.
  The additive column cannot break a replay.

Letters rendered through a throwaway Deno script (first notice, reminder, overdue, three
receipts). Copy pasted in §"Copy read" below.

## Graft lineage — verified, not taken on trust

`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`:

| function | latest prior | grafted from |
|---|---|---|
| `_create_project_approval_decision_checked` | 00463 | 00463 ✓ |
| `create_project_approval_decision` | 00463 | 00463 ✓ |
| `get_project_decision_reviews` | 00465 | 00465 ✓ |
| `_respond_project_approval_checked` | 00464 | 00464 ✓ |
| `respond_project_approval` | 00464 | 00464 ✓ (body diff: **IDENTICAL**) |

I diffed each grafted body against its source with a Python extractor. The only deltas are the
briefed ones: `p_why` + trim + 200-char guard + conditional hash key + the `why` insert column;
`why`/`viewerRole` on the projection's JSON; the `WITH released … RETURNING name` rewrite,
`releasedItemNames` in the frozen result, and the `notify_client_attention` block. Nothing was
silently dropped or reverted.

Banner, lineage line (00463→00464→00465→00466→00467→00534→00174→00568→00569), `SET search_path`
on every SECURITY DEFINER body, `extensions.gen_random_uuid()` schema-qualified, explicit
REVOKE/GRANT on every new signature: all present.

## Items, against the brief

| item | verdict |
|---|---|
| P-13 data half — column, CHECK, both RPCs, projection, designer read, letter render, SQL + deno tests | delivered (see B2 for the hole) |
| Projection viewer role (iosb3-M2) | delivered as `viewerRole` (camelCase, matching every other key in that projection — the brief wrote `viewer_role`); values `lead`/`studio`/`household`; SQL test present |
| P-20 receipt — rail choice, kind, render, consequence-or-silence, no CTA | delivered; the rail analysis in `backend-notes.md` is correct and I re-verified it against 00466 and 00534 |
| P-22 backend half — category, thread-id, collapse-id header, `interruption-level: active`, badge kept, no NSE keys | delivered (see B1) |
| P-06 verify | delivered; the correction ("the deep link is built in SQL by 00534, not by `client-portal-links.ts`") is right, and I confirmed `client-portal-links.ts` owns only `clientDecisionLink` |

## Findings

### B1 — major · the lock-screen collapse id was applied to a rail P-22 never named

`buildApnsHeaders` emits `apns-collapse-id` for **every** push that carries an entity type and
id, not only the three P-22 names. Three producers push `entity_type = 'design_request'` with
`entity_id` = the same lead id, for three different events:

```
supabase/migrations/00330_accept_design_request.sql:187   'entity_type','design_request'  entity_id = v_lead.id
supabase/migrations/00331_ceremony_complete.sql:347       'entity_type','design_request'  entity_id = p_lead_id
supabase/migrations/00334_refresh_offered_slots.sql:125   'entity_type','design_request'  entity_id = v_ceremony.lead_id
```

They now share `design_request-<lead_id>`, so a later notice **replaces** an earlier unread one
on the lock screen while the bell (which these three write separately, outside
`notify_client_attention`'s dedupe) still shows both. The lane's own test pins the new
behavior — `apnsThreadId({… entity_type:"design_request", entity_id:"abc"})` → `"design_request-abc"`
— so this is deliberate generalization, not an oversight, but it is a user-visible change to a
rail outside the brief.

Fix is one line and keeps every P-22 case: emit the collapse id only when
`apnsCategoryFor(input.entity_type)` resolves (thread-id may stay universal — grouping loses
nothing).

### B2 — major · a revised approval can never carry a why

`supersede_project_approval_decision` (00464:1411) calls
`_create_project_approval_decision_checked(v_project_id, v_core_payload, 'supersede-create:'||v_key, p_decision_id)`
— four arguments, so `p_why` defaults to NULL. And `why` is a **parameter**, not a payload key,
so there is no way for the caller to supply one either: the creator's payload allow-list is
`title, question, context, dueAt, phaseId, sectionKey, artifactKind, artifactId, costCentsDelta,
scheduleDaysDelta, leadTimeDaysDelta` and an unknown key raises
`unsupported project approval payload keys`. The designer lane's
`useSupersedeProjectApproval` (checked in `agent-cae-w2-designer`) sends exactly that payload
and nothing more.

Result: the composer's first field exists on an original ask and is unreachable on every
revision — which is the normal path when a designer answers a RETURNED approval. The lane
disclosed this as "a design question I did not answer"; it needs a ruling (carry the
predecessor's line forward, or widen supersede with its own `p_why`) before the wave ships,
because P-16's three doors make revision the expected sequel to a return.

### B3 — minor · `viewerRole` never reaches the typed data layer

`packages/supabase/src/hooks/use-project-approvals.ts:299-332` — `parseProjectApprovalReview`
constructs its result field-by-field from a whitelist, so an unlisted key is **dropped at
runtime**, not merely untyped. The designer lane added `why` there (`why: nullableString(row,'why')`,
their line 320) but no lane added `viewerRole`, and `ProjectApprovalReview` has no such member.

Impact today is small — the client portal reads `list_my_project_decision_reviews` as raw `any`
(`apps/client-portal/src/lib/data/projects.ts:509`, `active-project.ts:131`) and iOS decodes its
own JSON — so the field is reachable where it is currently needed. But any Threshold or portal
code that goes through the hook will silently see `undefined`. Worth one line in the integration
pass rather than a lane round trip.

### B4 — minor · the consequence clause assumes item names are articled noun phrases

The proposal's exemplar is "It releases the cabinet order." Real
`project_ffe_items.name` values in the local seed are not shaped that way:

```
Walnut dining table, 96"     Paintwork and plaster       Oak Drum Side Table
Møbler Lounge Chair — Bouclé  Cloud Pendant Cluster 19    Custom Walnut Sectional — 3 pc
```

Rendered (my throwaway script, real name, one item):

```
SUBJECT: You approved "Kitchen plan set".
…
It releases Walnut dining table, 96".
```

Grammatically it reads as a machine reading a line off a schedule — no article, and the inch
mark collides with the sentence period. Two items compound it ("It releases Oak Drum Side Table
and Cloud Pendant Cluster 19."). The three-and-up branch ("It releases three pieces that were
waiting on it.") is clean and is the one that always reads well. Options: lower-case/article the
name, or fall back to the counted form whenever a name is not lower-case-initial. Both the SQL
owner (`_project_approval_release_sentence`) and its TS mirror (`decisionReleaseSentence`) would
change together — they are already kept in lockstep, and both sides' tests pin the same five
cases, so this is cheap.

### B5 — minor · iOS does not know the third viewer role

`agent-cae-w2-iosd/.../DecisionsAPIClient+ProjectApprovals.swift:65-72` —
`answering = {decisionlead, lead, client, recipient, owner, clientlead}`,
`observing = {studiocomember, comember, studiomember, studio, designer, teammate, observer,
viewer, watcher}`. `"lead"` and `"studio"` both resolve. `"household"` resolves to neither, so
`ProjectApprovalViewerRole(raw:)` returns `.unspecified` and `viewerAnswers` is **true** —
"waiting on you" for a viewer the backend is explicitly labelling as *not* the answerer.

Latent only: the projection's row filter is `(v_is_studio OR snapshot.decision_lead_id = v_actor)`,
so a non-studio caller only ever sees rows where she IS the lead, and the backend's own notes say
`household` is unreachable at 00569. Still a declared value the two lanes disagree about; the
cheap fix is `"household"` in the iOS `observing` set.

### B6 — minor · the receipt lights the springboard for her own act

`notify_client_attention` writes an **unread** `in_app` row plus a push envelope addressed to
`v_snapshot.decision_lead_id` — the person who just answered, on the device she answered from.
R5's `aps.badge` is the recipient's unread in-app count, so approving raises the home-screen
number by one until she opens the bell. The dedupe does the right thing (it *replaces* the
unread "needs you" line rather than stacking), and this is the rail the brief named, so I am
not calling it wrong — but "she acts, and the app immediately buzzes her about her own act"
deserves a conscious ruling rather than falling out of the plumbing.

### B7 — nit · one of the P-06 pins asserts nothing

`_tests/client-attention-deep-links.test.ts`, "the deep link family is one route per thing, id
last": it builds `const path = \`/${entityType}s/${ID}\`` and then regex-checks the string it
just built. It cannot fail. The real coverage for that claim is the 00569 SQL contract test's
`metadata.deep_link` assertions (which do exist and do pass) plus the `clientDecisionLink`
assertion two lines above. The three producer tests are source-text greps — they will pass
through a rename and fail on a reformat; acceptable as a tripwire, not as proof.

### B8 — nit · receipt subject punctuation and the `quoted()` helper

`renderDecisionReceiptEmail` inlines `` `You ${word} "${title}".` `` instead of reusing the
module's own `quoted()` (`decision-notify.ts:171`), which produces the identical straight-quote
form. Same output, one more place to drift. The trailing period is brief-specified and the lane
flagged the F11 divergence honestly — the F11 test still passes because it iterates the three
ask letters only. Ruling owed, as the notes say.

### B9 — nit · the receipt push still plays a sound

`aps.sound = "default"` is untouched from Wave 1 and now rides the receipt too, so the
acknowledgment of her own act makes a noise. The refusal list bans celebration sound; whether a
receipt's default alert tone counts is a judgement call, and changing it would touch every push
on the rail, not just this one. Flagging, not asking for a change.

### B10 — advisory · `--no-verify` on the edge-function commit

`dae0e953c` was committed with `--no-verify` and the notes explain why: the pre-commit secret
scanner reads whole files, and `apns-send/core.ts` has carried the literal
the PKCS#8 PEM header line (redacted here so this file survives the same scanner) since I66 (the PEM framing `normalizePkcs8Pem` adds; pinned by its
own test). Both strings exist at the base sha, and `git diff` adds no PEM line — I checked. The
consequence worth naming: that commit's other eleven files got no hook coverage either. Same
class as the recorded `playwright.config.ts` secret-scan trap; the integration steward should
re-run the hook over the merged tree.

## Copy read — every string a homeowner sees

Grepped the whole diff for `gate|task|overdue|dashboard|AI|Declined|sage|green|red|checkmark|
badge|emoji|shadow|confetti|celebrat`: every hit is an internal identifier (`decision_overdue`
kind, `isOverdue` projection key from the 00465 graft, `aps.badge` per R5, a test name, and the
line "changes_requested is RETURNED everywhere — never 'Declined'"). **No refusal reaches
homeowner copy.**

Rendered, verbatim:

- first notice — `Leah sent "Kitchen plan set" for your approval` / *"The island moved a foot;
  everything else is as we drew it." — Leah* / `Edition 3 · issued September 1` / `Due Saturday,
  September 12.` / `— Leah, Middle West Studio`
- reminder — `Saturday: "Kitchen plan set"`, same attributed note
- overdue — `Still open: "Kitchen plan set"` / `Still open, Leah asked on September 2.`, same note
- receipt (approved, one item) — `You approved "Kitchen plan set".` / `It releases Walnut dining
  table, 96".` / `The record: https://client.patina.cloud/decisions/…` / `— Leah, Middle West Studio`
- receipt (returned) — `You returned "Kitchen plan set".` / `Your answer is on the record.`
- receipt (approved, three items) — `It releases three pieces that were waiting on it.`

Vocabulary: "approval" is the ask; "the record" for the record; APPROVED/RETURNED/HELD →
approved/returned/held in prose; `changes_requested` renders **returned**, never "Declined"
(`receiptOutcomeWord`, and `receiptOutcomeWord("declined") === null` is pinned). No CTA button
on the receipt — a plain `muted()` link through `clientDecisionLink`. The note's attribution
falls back to the studio name and is **dropped** rather than invented, which is the right call
and is pinned by a test.

## What the tests actually assert

`decision-notify.test.ts` (+170): the why on all three ask letters and the `>&mdash; Leah</p>`
attribution specifically (not the sign-off, which would match loosely); the studio-name fallback;
no dangling em dash and no empty quotation when the why is absent; HTML escaping; the three
outcome words; the receipt's consequence and its silence; the five release-sentence cases plus
blank-name trimming; the studio signature and no Patina tagline.
`00569_…contract_test.sql` (+597): object structure, grants (including `NOT
has_function_privilege(anon, …)`), the projection's `why`/`viewerRole` source text, both chairs'
`viewerRole`, over-length rejection at the RPC **and** at the column (with
`session_replication_role = replica` so it reaches the CHECK rather than a guard trigger), the
frozen `releasedItemNames`, exactly one in_app row and one push row after the answer, both
receipt titles/bodies, and the proposal/invoice `deep_link`.
`_tests/apns-send.test.ts` (+102): category derivation, thread id including the 64-byte cap,
collapse header presence and absence, `interruption-level`, badge survival, and the two negative
assertions (never `time-sensitive`, no `mutable-content`/attachment).

Coverage matches the changed behavior. The one gap the lane names itself is honest: the receipt's
email leg inside `decision-resolved-notify` is exercised only by `deno check`, because there is
no live-stack edge-function test for the decision rail to extend on this branch.

## Deploy set — checked independently

Changed `_shared` modules: `decision-notify.ts`, `project-approval-notification.ts`. Nothing else
in `_shared` imports either, so the transitive closure adds nothing; union with the edited
directories gives the six the notes name: `apns-send`, `decision-first-notice`,
`decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `notification-digest`
(the last only as an importer of `decision-notify.ts`). Migration `00569` first. Correct.
