# Wave 2 — backend lane, adversarial review, round 3

Reviewer: separate context, never the implementer. Branch `agreement/w2-backend`
at `173acdac6`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-backend`
(`git rev-parse --show-toplevel` confirmed).

Diff against `main`: **17 files, +8155 / −51**.

```
supabase/migrations/00576_agreement_library.sql              964 +
supabase/migrations/00577_agreement_fee_schedules.sql       2748 +
supabase/tests/commercial/agreement_library_test.sql         777 +
supabase/tests/commercial/agreement_fee_schedules_test.sql  1031 +
supabase/tests/commercial/agreement_parts_projection_test.sql  16 +
supabase/tests/edge_api/public_sd_hardening_contract_test.sql  38 ±
supabase/seed/00-legacy-grants.sql                           262 ±
packages/supabase/src/database.types.ts                      335 ±
packages/supabase/src/hooks/use-agreement-library.ts         361 +
packages/supabase/src/hooks/use-agreement-part-events.ts      84 +
packages/supabase/src/hooks/index.ts                          32 +
packages/types/src/agreement.ts                              130 +
docs/design/the-document/DECISIONS.md                         10 ± (R138)
+ four program docs under build/waves/w2/
```

Every path is inside the lane's pathspec. No `.claude/`, no `.agents/`, no
`.env`, no hook, no settings file. No production mutation was run; the shared
local stack was never written to (confirmed still at head `00575` with
`to_regclass('public.agreement_templates')` NULL after the review).

---

## Verdict

**block** — one blocker that makes the Library unusable for the persona the
walk script itself designates, and one blocker that lets a fee the homeowner
never saw become the executed billing authority. Everything else in the lane is
sound, and both round-1 blockers plus the round-2 blocker are verified fixed.

---

## Gates I ran myself

Scratch DB `patina_w2r3`, cloned from the shared stack (`pg_dump --exclude-schema=cron
--exclude-schema=vault`, ACLs included) — W1 objects present
(`proposal_agreement_parts`, `upsert_agreement_parts(uuid,jsonb)`,
`materialize_standard_parts(uuid)`), W2 objects absent. A second clone,
`patina_base`, kept at the W1 baseline for before/after comparison. Both dropped
at the end.

```
apply 00576_agreement_library.sql          exit=0
apply 00577_agreement_fee_schedules.sql    exit=0

commercial/agreement_library_test.sql             rc=0   13 PASS
commercial/agreement_fee_schedules_test.sql       rc=0    8 PASS
commercial/agreement_parts_projection_test.sql    rc=0    5 PASS
commercial/multi_studio_signature_test.sql        rc=0    7 PASS
schedule/ceremony_hardening_test.sql              rc=0   15 PASS
edge_api/public_sd_hardening_contract_test.sql    rc=0  (assert-only)
  ... and rc=3 on the W1 baseline clone
      ("a public 00511 identity, semantic profile, or body hash drifted")
      — the re-pins are live, not decorative.

commercial/design_services_authority_test.sql     rc=3  ┐ identical failure at
commercial/design_services_gap_hardening_test.sql rc=3  ├ the identical line on
commercial/authorized_schedule_test.sql           rc=3  ┘ the W1 BASELINE clone.
      Pre-existing; all three are in supabase/tests/KNOWN_FAILURES.md.

pnpm --filter @patina/types    type-check   → clean (rc=0, no output)
pnpm --filter @patina/supabase type-check   → clean (rc=0, no output)
pnpm --filter @patina/supabase test         → 87 files, 1068 passed | 12 skipped
python3 scripts/generate-legacy-grants.py   → "baseline + 2263 replayed
                                               statements", git diff EMPTY
supabase gen types (scratch DB) vs the committed database.types.ts
      → 106 diff lines, ALL of them the six FK `Relationships` blocks the
        clone's data COPY drops. No W2 schema drift.
```

`./scripts/run-public-acl-psql.sh` named in build-sheet §7 **does not exist in
this repo** — I ran the contract test directly with `psql -v ON_ERROR_STOP=1`.
Worth correcting in the sheet.

### Directed probes

| Probe | Result |
|---|---|
| Fingerprint stability, all 33 proposals (8 composed, spread over draft/sent/accepted) | `diff` of `_commercial_document_fingerprint` per proposal, W1 baseline vs W2 → **ALL IDENTICAL** |
| `\df` on the widened functions | exactly one row each; `(uuid,text,uuid,text)`, `(uuid,jsonb)` arities **gone** |
| ACLs after the DROPs | `sign_…_with_trusted_ip` → service_role; `_sign_…_authorized` → owner only; `upsert_agreement_parts`, `save_agreement_part`, `save_agreement_as_template`, `materialize_agreement_template`, `copy_agreement_parts_from_authority` → authenticated; `compose_agreement_consent` → authenticated + service_role. Every definer pins `search_path`; every helper is REVOKEd from PUBLIC, anon, authenticated **and** service_role. |
| `app_private.issue_invoice_for_actor` caller universe | six routines, byte-identical to the W1 baseline. No new caller. |
| Pinned hashes, recomputed | `8539825f7dc69971ae5ab3ec81c7e86d7b663f7beea5133fb4cbe010fd7f0288` and `a5c8dfec6d6798dc7bc8c2ab0f0ac71f97b715536a33be466f65ab0840e9221b` — both match the file. Counts still 17 and 9; the `:2332` sibling literal moved with the function. |
| Body diffs (baseline → W2) | countersign **42 lines** (authority columns + snapshot INSERT, both after every lock); bundle **20 lines** (two keys); fingerprint **13 lines** (the CASE); `upsert_design_services_draft` **0 lines**. Minimal, named grafts. |
| Seeded rows immutable | postgres UPDATE refused, postgres DELETE refused, service_role UPDATE refused; rename lands under `SET LOCAL app.allow_patina_template_mutation='on'` |
| Plain member | reads 3 seeded templates + the studio's parts; `save_agreement_part` raises `insufficient_privilege`; a direct rename returns **0 rows** (RLS) |
| Owner / admin rename + delete | 1 row each, under column-level `UPDATE (title, consent_key)` |
| `save_agreement_as_template` from a **sent** agreement | succeeds, 9 parts snapshotted, and the sent paper's part rows are **unmoved** |
| Materialize | strips owner refs at every depth, restores a fresh `id` per list item, lands in `position` order, stamps `source_template_key` |
| Consent composer | nine standard / consultation / flat / per-phase+non-refundable / furnishings / zero-money all byte-exact against the pinned literals |
| **Flat rail end to end** (the branch the suite never countersigns) | send → sign → countersign OK; TERMS `flat/800000/NULL/credited`; AUTHORITY identical; snapshot hash = fingerprint (`t`) |
| P7 `copy_agreement_parts_from_authority` | 4 parts copied in order, `fee_basis=per_phase amount=1100000 schedule_len=3 credit=non_refundable`, 4 `added` events carrying the why and "Marguerite" |
| R22 floor | a composed agreement with no fee part, **and** one whose only fee is studio-only, are both refused at send: *"This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee."* |
| Vocabulary / W3 leakage | no "clause library", "contract builder", "snippet", "AI"; `design_build` and `per_draw` appear only in comments saying they are Wave 3 |
| Numbering | `00576`/`00577` unique across every local ref; main head is `00575` |

---

## Round-2 findings: what is fixed

- **B1 fingerprint break** — fixed and re-verified (all 33 fingerprints identical).
- **B2 keepsake raw fields** — fixed; the renderer prints `AGREEMENT_PART_COPY`
  sentences, never a payload key, raw cents, or a raw enum.
- **M1 consent composer unauthorized** — fixed; the predicate is
  `get_client_commercial_document_bundle`'s own, character for character
  (verified against the live `prosrc` of both), and the only caller in the tree
  (`app/api/proposals/[id]/sign/route.ts`) uses `createServerClient()`, a
  user-context client, so no legitimate caller regressed.
- **F1 two-studio Template leak** — the leak is closed. The fix, however, is the
  first blocker below.

Round-2 findings F2–F15 were, per the lane's own notes, deliberately not
addressed. I re-verified each; all persist and are restated below.

---

## Findings

### R3-B1 · A designer who belongs to two studios cannot use the Library at all — blocker (0.95)

`00576_agreement_library.sql:677-681` (and `:512-517` for the mirror act).
Round 2's fix replaced "the Template must belong to one of the studios we
share" with "there must be **exactly one** studio the actor and the lead
designer share, or refuse". When the two-studio designer is herself the lead —
the ordinary case — both studios answer for both people, the count is 2, and
**every studio Template is refused, including her own studio's**.
`save_agreement_as_template` has carried the same arithmetic since round 1.

Proof, on the scratch DB, as the local seed's own primary designer
`designer@patina.dev` (`a0000000-…-0004`), member of *Leah Hartwell* and
*Local Dev Studio*, both `design_studio`/`active`, owner of both:

```
NOTICE:  designer@patina.dev active non-guest design studios = 2
NOTICE:  SEEDED materialize: OK, 9 parts
NOTICE:  SAVE AS TEMPLATE: REFUSED -> template studio is not an authorized design workspace
NOTICE:  OWN-STUDIO materialize: REFUSED -> this agreement does not sit in a single
         studio, so a studio Template cannot be composed into it
```

Consequences:

- **Walk script §9 fails at step 2 and step 5.** The sheet designates the
  walker as "an owner or admin of a **two-studio account**". Step 2 is *Save as
  template…*; step 5 is *Start from a template…*. Neither can run. "A failure at
  any step is a blocking finding, not a note."
- This is not a rare shape. `00295_studio_workspace_provisioning.sql:250-295`
  auto-provisions a personal `design_studio` the moment `profiles.is_designer`
  flips true, so any designer who signed up alone and later joined a studio has
  two. The lane's own fixture knows it: `agreement_library_test.sql:81-83`
  suppresses the trigger with `session_replication_role = replica` *"which would
  … make save_agreement_as_template's two-membership resolution ambiguous"*. The
  suite is green because the fixture builds a designer no real account matches.
- The cited precedent does not do this. `save_board_as_template`
  (`00408:315-341` — the exact citation) takes `p_studio_id` as an **argument**
  and checks membership with `EXISTS`; it never counts. And 00566's countersign
  fix went the other way, replacing a count with an `EXISTS` for precisely this
  persona.
- Case 12 of `agreement_library_test.sql` **asserts the broken behaviour**
  (`'an unsettled studio is a refusal, not a guess'`), so the suite cannot catch
  this and will have to move with the fix.

Fix: the repo already owns a deterministic answer —
`public._primary_studio_for(p_user uuid)` (ordered `owner` first, then
`joined_at`), which returns `7798c891-…` for the probe designer. Resolve the
agreement's studio through it (or through the project/commercial-document the
agreement belongs to) and keep the "the Template's `studio_id` must equal that
studio" check. Then re-point cases 11 and 12 and confirm they go red against the
current body first.

### R3-B2 · A studio-only fee becomes the executed billing authority — blocker (0.8)

`00577_agreement_fee_schedules.sql:1376-1392` selects the fee part
`WHERE ap.kind='schedule' AND ap.variant IN ('flat','per_phase')` with **no
`client_visible` predicate**, where build-sheet §3.4 froze the rule as *"exactly
one of a `flat` or a `per_phase` **client-visible** schedule part"*. Round 2
recorded this as a wording nit (F14). It is not: it produces billing authority
for a fee the homeowner never read and never consented to.

Probe — a client-visible rate card and ceiling, plus a `clientVisible: false`
flat fee of $8,000, run all the way through send → sign → countersign:

```
NOTICE:  CONSENT SHE READS = I agree to these design-services terms, the signed role
         rates, and the design authorization ceiling, and understand my signature alone
         does not authorize work until the studio countersigns.
NOTICE:  TERMS fee_basis=flat amount=800000
NOTICE:  EXECUTED AUTHORITY fee_basis=flat fee_amount_cents=800000 ceiling=2400000
NOTICE:  KEEPSAKE mentions the hidden fee = f
```

The sentence she ticked names the rates. The keepsake she keeps never mentions
$8,000. The authority that bills her says `flat / $8,000.00`. Three surfaces of
one agreement disagree, and the one that disagrees is the one that charges.

The inconsistency is inside this migration: `compose_agreement_consent`
(`:707`), `_render_agreement_snapshot_html` (`:447`) and the R22 floor all read
`client_visible`; only the projection does not. R22's whole purpose — a visible
fee must exist before send — is defeated if an invisible one then overrides it.
The same omission sits on the duplicate one-fee-basis refusal at `:1216-1221`.

Fix: add `AND ap.client_visible` to both the fee-selection query and the
one-fee-basis count, and pin it with a case that hides a flat fee beside a
visible rate card and asserts the authority stays `hourly`.

(Counter-reading the orchestrator may prefer: R25 tolerates hidden money parts
on the page, and the authority is the studio's instrument. I record it, but the
sheet's frozen wording and the demonstrated three-way disagreement point the
other way.)

### R3-M1 · P7 ships with no SQL test — minor (0.9)

`copy_agreement_parts_from_authority` (`00577:2610-2691`) is the whole backend
of P7 and appears in **no** test file — `grep` across `supabase/tests/` finds it
only in `database.types.ts` and the hook. It carries real behaviour: a
`document_kind = 'service_addendum'` guard, a draft guard, a project-binding
guard, the active-authority read, verbatim ordering, and a re-run of the
projection and the event log.

The behaviour is correct — I ran it end to end on the suite's own executed
per-phase rail: 4 parts in order, `fee_basis=per_phase amount=1100000
schedule_len=3 credit=non_refundable`, four `added` events carrying
*"Added the study to the scope"* and "Marguerite". So this is a coverage gap,
not a defect. It is still walk step 14's only server-side act.

### Carried forward from round 2, all re-verified as still open

| id | sev | conf | what |
|---|---|---|---|
| F2 | minor | 0.9 | **Keepsake attachment placement.** `_render_agreement_snapshot_html` emits attachments **inline, in `position` order, under an `<h2>`**. `agreement-parts-body.tsx:425-446` pulls them out and draws them **last**, each with an `<hr>` and an `ATTACHMENT {A,B,C} · {title}` mono eyebrow. My render: `…<h2>Lead-safe practices</h2><article class="leaf">…`, `attachment_letter_eyebrow = f`. R12+R27 and the migration's own banner ("leaf for leaf it says what agreement-parts-body.tsx said") require these to agree. |
| F3 | minor | 0.9 | **Keepsake drops the boundary sentence.** `AgreementPartsBody` always closes with *"This agreement authorizes design services only. Furnishings, freight, tax, installation, and purchasing require a separate named furnishings authorization."* (`:440-446`). The SQL render ends at the last part: `has_boundary_sentence = f`. The permanent copy loses the one line that limits what she authorized. |
| F4 | minor | 0.9 | **Empty attachment prints a naked heading.** The attachment branch (`00577:475-487`) opens `<article class="leaf">` unconditionally, so an empty body yields `<h2>Empty attachment</h2><article class="leaf"></article>`, which clears the loop-tail `v_body <> ''` guard. Probe: `naked_empty_attachment = t`, `naked_empty_clause = f`. R21 says an empty part renders nothing. (F2 and F4 are one decision: either align on trailing lettered leaves, or draw nothing when there is no body and no acknowledgment.) |
| F5 | minor | 0.8 | **`AgreementExecutionSnapshot` over-promises.** `packages/types/src/agreement.ts:241-247` requires `proposalId` and `partSet`; the bundle emits only `{html, documentHash, createdAt}` (`00577:2457-2464`, and the suite asserts `NOT (executionSnapshot ? 'partSet')`). |
| F6 | minor | 0.85 | **Neither new hook module has a spec.** `pnpm --filter @patina/supabase test` → 87 files / 1068 passed, and `packages/supabase/src/hooks/__tests__/` holds `use-agreement-parts.test.ts` and `use-studio-agreement-defaults.test.ts` only. `useAgreementTemplates` interpolates `studioId` into a PostgREST filter string unescaped (`use-agreement-library.ts:142`); with B1 unfixed that filter is the only thing keeping studio B's Template off the picker. |
| F7 | minor | 0.9 | **Flat authority branch untested.** Case 6 countersigns only the per-phase agreement. I ran the flat rail: correct (`AUTH basis=flat amount=800000 schedule=NULL credit=credited`, hash matches). Coverage gap only. |
| F8 | minor | 0.9 | **`patina.deposit` is two different parts.** `patina.design_services` seeds it `schedule/procurement`; `patina.furnishings_services` seeds the same key as a `clause`. Confirmed by query. R19 asks the `patina.*` keys to be stable. |
| F9 | minor | 0.9 | **Two event actions nothing writes.** The CHECK admits `renamed` and `materialized`; `_log_agreement_part_events` can only emit added/removed/edited/reordered. A template materialization logs `added x9 : Materialized from Design services (Patina standard)` — P8's own subject reads as nine additions. |
| F10 | nit | 0.95 | `copy_agreement_parts_from_authority(p_proposal_id uuid, p_why text DEFAULT NULL)` where §3.4 froze `(p_proposal_id uuid, p_why text)`. Catalog confirms the default. Harmless; the sheet called cross-lane signatures frozen. |
| F11 | nit | 0.95 | The R17(a) "cannot leak past this statement" paragraph appears **twice** in `upsert_agreement_parts`' live body (`prosrc` lines 470 and 513); the W1 body has it once. Graft artefact. |
| F12 | nit | 0.75 | `agreement_part_events.actor` → `public.profiles(id)` while `agreement_templates.created_by` → `auth.users(id)`; `_log_agreement_part_events` inserts `auth.uid()` unconditionally, so a caller without a profiles row would FK-violate the whole save rather than lose the event. |
| F13 | nit | 0.8 | `retainer_credit_rule NOT NULL DEFAULT 'credited'` on `project_billing_authorities` backfills every already-executed authority with a value nobody snapshotted at countersign. Needs one sentence in the deploy note, no code. |
| F15 | nit | 0.7 | `agreementCadenceText` uses JS `.replace` (first occurrence) where the SQL renderer uses `replace()` (all). No current cadence value has two underscores. |

### New nits

| id | sev | conf | what |
|---|---|---|---|
| R3-N1 | nit | 0.9 | **`materialize_agreement_template` never compares `class` to `document_kind`.** `grep` finds `v_template.class` used nowhere in the RPC. A `furnishings_services`-class Template composes cleanly onto a `design_services` agreement, which then meets R22's refusal at send. The picker filters by class, so this is only reachable by a hand-made call — but the refusal the designer would see is about the fee, not about the Template. |
| R3-N2 | nit | 0.85 | **A raw query key beside its factory.** `use-agreement-library.ts:261, 356` invalidate the literal `['agreement-part-events', proposalId]` while `use-agreement-part-events.ts:38-41` exports `agreementPartEventsKeys.list`. Same array today; a rename orphans the invalidation silently. Build-sheet §8.17 asks for one canonical key per entity. |
| R3-N3 | nit | 0.7 | **The projection-parity exclusion is broader than its own justification.** `agreement_parts_projection_test.sql` now drops all four W2 columns from `terms_shape`. The stated reason — the seven-facet room cannot author them — holds for `fee_basis`/`fee_amount_cents`/`fee_schedule`, but `retainer_credit_rule` is `'credited'` on both doors by construction and would have compared equal. |
| R3-N4 | nit | 0.9 | **`./scripts/run-public-acl-psql.sh` does not exist.** Build-sheet §7 tells every lane to run the hardening contract test through it. `ls scripts/ | grep -i acl` is empty in both the worktree and the main checkout. Correct the sheet before integration reads it as a gate. |

---

## What I did not verify

- Anything in the designer or client lanes (their branches are not merged; the
  keepsake-parity findings F2/F3/F4 are stated against `main`'s
  `agreement-parts-body.tsx`, which is what W1 shipped).
- `pnpm supabase:reset` on the shared stack — the integration steward owns it;
  this review ran entirely on scratch clones.
- The three KNOWN_FAILURES suites' *intended* behaviour — I established only
  that they fail identically before and after this lane.
- The e2e and portal jest gates (no portal file is in this lane's diff).
