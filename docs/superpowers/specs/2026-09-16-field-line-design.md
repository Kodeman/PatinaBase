# The Field Line design

## Context

| Today | After this design is delivered |
| --- | --- |
| Patina has a complete but dormant Twilio SMS rail whose behavior is not yet safe or truthful across studios. The approved deck remains direction, while its older pilot wording is superseded by the Phase 0 execution contract. | The Field Line makes the rail truthful and safe across studios, proves behavior only with fixtures and `SMS_DEV_MODE=redirect` rehearsal to an allowlisted owner phone, and keeps new outbound automation off until its server-phase gate permits it. There is no live pilot. |
| The website and the `patina-merged` application are separate working trees. The website has a narrow Phase 0 companion task after the owner commits the Living Study tree. | This document is the fixed cross-repository design target: application work follows the shared surface below and the website companion restores the `/signup` footer link and sitemap entry without changing the SMS implementation. |

## Owner decisions

| Decision | Today | After |
| --- | --- | --- |
| Trade-text identity | Existing templates vary in provenance and must not imply a new product voice. | Studio name comes first in every trade text; “through Patina” appears only in the opt-in invite. |
| Campaign | The existing Low-Volume Mixed 10DLC campaign is the only campaign in scope. | Widen that campaign. P0-08 drafts the packet; the owner submits it. |
| Evidence | Earlier deck language referred to a pilot and live observation. | All eleven cases are synthetic. A redirect rehearsal is allowed; a live pilot is not. |
| Production activation | Production commands must not be used to discover or solve design questions. | P0-09 alone runs approved Strata activation commands after phase approval; P0-08 is read-only preflight. |
| Integration and review | Wave work is not itself approval to activate. | One integration approval occurs per phase, and an independent Astra review-audit is bound to each wave’s exact candidate commit. |
| RCS | The deck’s later-stage wording described RCS branding and cards. | RCS sizing only: a read-only Phase 3 spike, with no RCS build. |
| UI flags | Browser flags are useful for presentation but are not execution authority. | PostHog flags gate portal UI only; `FIELD_LINE_PHASE` gates edge functions and triggers. |

## Source-cited findings

| Finding | Today: source evidence | After: binding design response |
| --- | --- | --- |
| Field-link lifecycle | `supabase/migrations/00284_field_dispatch_wiring.sql:66-78` stores only a token hash and revokes active tokens when minting. `supabase/functions/_shared/sms.ts:479-494` resolves a body before the quiet-hours decision; `supabase/functions/_shared/sms.ts:633-636,721` flushes the stored body. | Mint only at actual dispatch, preserve hash-only storage, retain a deferred send recipe, and render a fresh body at flush. Routine minting does not revoke a valid prior link; explicit revoke revokes all party links. |
| Cross-studio authority | `supabase/migrations/00282_sms_core.sql:114-161` permits phone fallback for conversation and attributed-message reads, exposing phone-shared state across studios. | Resolve authority before state reads and project every studio view through project-bound context; this is an authority repair, not a test-only change. |
| Guarded effects | `supabase/migrations/00399_journey_authority_integrity.sql:4878-4886` is the guarded `apply_field_effect` wrapper. `supabase/migrations/00399_journey_authority_integrity.sql:4184-4186` rejects an unauthenticated `apply_decision` actor. | Extend the guarded wrapper with the specified trade effects while retaining its existing effect names and actor rules. |
| Existing schedule and website migration reference | `supabase/migrations/00432_twilio_activation_hardening.sql:79-92` already schedules `field-daily` at 14:00 UTC. `PatinaWebsite/src/app/api/founding/route.ts:172` is the stale reference to migration 00433; the current waitlist-consent migration is 00460. | Preserve the 14:00 UTC schedule and correct the website comment in its separately scoped ticket; this design does not renumber migrations. |
| Browser flags cannot authorize server automation | `apps/designer-portal/src/hooks/use-feature-flag.ts:72-75,140-147` resolves flags through browser-side PostHog callbacks. | Read `FIELD_LINE_PHASE` in edge functions and triggers, treating an unset value as phase 0; use PostHog only for portal UI flags. |

## Shared surface S1–S11

| Surface | Today | After: pinned shared surface |
| --- | --- | --- |
| S1 | Replies may depend on current menu state and no immutable short-reference record exists. | **S1. Ref codes: `Ref NN` where NN is a 2-digit code 10–99 (3-digit once exhausted), unique per (sender number, recipient phone) across open prompts and prompts closed within 90 days; never reused inside that window; immutable binding of party + project + prompt kind + target (subject_id) + version + expiry on public.sms_prompts. A late reply resolves against the ORIGINAL prompt version or is rejected (“That one's closed. Latest: Ref 17 — <title>”); never against the current menu. Reply grammar: `<VERB> NN`; a verb with no NN resolves only when the recipient has exactly one open prompt on that sender.** |
| S2 | Consent and suppression behavior is not a phone-global, sender-bound state machine. | **S2. Consent codes: same code space, kind='optin', one outstanding challenge per engagement version, bound to the normalized recipient. `YES NN` grants only the referenced engagement's existing pending record; bare YES retains the owner-approved behavior of granting every pending studio record. STOP suppresses the recipient phone on that sender number globally (carrier semantics; independent of party rows; survives adding a new party); START lifts pair suppression and re-grants opted-out records only; pending records receive a fresh coded challenge, never a grant. `studio_channel_consent` is the only grant; suppression wins over it, and legacy party consent columns remain frozen.** |
| S3 | Existing effects do not yet express the full, separated trade-delivery lifecycle. | **S3. Effect names on the guarded apply_field_effect wrapper (00399:4878): keep all existing names; add confirm_availability, report_arrival, report_condition, report_departure; reuse the existing report_delay. Availability never marks goods received; arrival and condition are distinct. Actor is the party (p_party_id), target is the prompt's subject.** |
| S4 | Conversation transport state and project context can be conflated, and unresolved content risks inappropriate projections. | **S4. State: sms_conversations keeps its transport key (phone ↔ sender). Project context moves to public.sms_conversation_context keyed (conversation_id, project_id, party_id): state, state_context (menu, awaiting_confirmation, project pin), updated_at. Unresolved chooser text/media stay service-only; studio projections expose only rows for their projects. Review ownership: sms_messages.owner_user_id; pause: sms_conversation_context.paused_until.** |
| S5 | A caller cannot reliably distinguish a durable send, a quiet-hours deferment, a provider failure, and later provider delivery. | **S5. Dispatch contract: every send has a durable sms_messages id; sendPartySms returns {id, status:'sent'|'queued'|'deferred'|'failed', reason?, dueAt?, provider_code?}. sms-dispatch answers 200 sent, 202 queued/deferred, 422 consent or suppression refusal, 502 provider failure with provider_code; a deferred message keeps its id (the flush is not a new send). Provider delivery (sms-status) is tracked separately and never means "read". Portal: draft clears only on sent/queued; stays on deferred/failed with the reason in plain words.** |
| S6 | Link minting can occur before quiet-hours handling, and deferred rows rely on a durable rendered body. | **S6. Links: hash-only storage stays. Mint at ACTUAL dispatch (after consent, suppression and quiet-hours gates), never at defer time. A routine mint does not revoke a still-valid prior link; old links expire on their own expiry. Explicit revoke revokes all of the party's links. Deferred rows store a recipe {template_key, params, party_id, project_id, link_kind?}; stored body is a redacted preview; flush renders fresh. No raw token appears in any durable log or view.** |
| S7 | A browser-delivered feature flag cannot gate cron, triggers, or edge functions. | **S7. Server gate: edge functions and triggers read FIELD_LINE_PHASE from env/secrets (unset = 0). New outbound automation introduced by this feature (site cards, day-of, prompts with refs, client texts) sends only when FIELD_LINE_PHASE >= its phase number; safety fixes (authority, receipts, suppression, compliance lines) are unconditional. PostHog flags `field-line-trades`, `field-line-client`, `field-line-time-reports` gate portal UI only.** |
| S8 | Template compliance is uneven across the existing `sms_%` bodies. | **S8. Copy: studio name first; "through Patina" only in sms_optin_invite; every sms_% body ends with the canonical rates/HELP/STOP line (one string, defined once in the templates migration); GSM-7 bodies ≤ 2 segments (306 chars) with params at max length.** |
| S9 | Later migrations may already have higher numbers when a ticket begins. | **S9. Migration numbers are allocated by the orchestrator on the ticket (00639 authority, 00640 dispatch/links, 00641 effects/templates for Phase 0). Keep the allocated number even if a higher number exists when you start; report a collision instead of renumbering.** |
| S10 | Parallel edits can collide in shared implementation files. | **S10. File ownership: within a wave exactly one ticket may write each of _shared/sms.ts, sms-inbound/pipeline.ts, field-daily/core.ts, party-profile-sheet.tsx, use-party-sms.ts, client-invite/index.ts. Declared files on the ticket are the whole write scope; scope-request anything else.** |
| S11 | The local Supabase stack is shared by worktrees. | **S11. Local Supabase stack is shared across worktrees. Only the ticket marked "owns the local stack this wave" runs `supabase db reset`; others dry-apply SQL inside one rolled-back transaction. Deno tests run from the repo root: `deno test --no-check -A --config supabase/functions/deno.json <files>`; delete any root deno.lock you create.** |

## Repaired inbound consumer contract (Phase 0A inbound slice)

SMS completion is per original inbound, not the handset's latest resolved chooser. Existing `sms_messages.applied_effect` (including `applied:false`) and immutable prompt receipts are the only durable completion authorities; `selection_intent` is provenance, never proof of completion. Source/receipt read failures, missing origins and malformed evidence remain HTTP 503. Historical completed rows may be quietly suppressed, but an ambiguous actor binding must never disclose their result.

For SMS calls with an inbound ID, `apply_field_effect` locks and rechecks that original row, validates conversation phone/actor/project, binds existing attribution columns transactionally on first application, and returns the unchanged saved result plus return-only `_sms_replayed:true` on replay. Replacement payloads are ignored before casting. No-ID/non-SMS/triage calls retain their prior behavior. Atomic lock order is pair → prompt → message → consent → reentrant wrapper → business; raw callers use message → business and never subsequently acquire pair/prompt/consent locks. `sms_apply_prompt` returns exactly `{status:"already_completed"}` for raw replay, without closing a prompt or minting a misleading receipt. Raw consumers distinguish saved/replayed/failed/unknown; replay skips new stamps, touches, notifications and success copy. NULL evidence alone never proves rollback; transport ambiguity/40003 stays retryable behind SQL lock/recheck.

Before any chooser digit CAS, media handling or effect, persist its original inbound/outbound selection pointer and check original completion. Same-SID retries use that pointer, immutable manifest and persisted original body/media, not a newer chooser. A pointer-write failure permits no CAS/effect/success. If its original binding cannot later be reconstructed, retain the SID and return 503 for operator recovery rather than promising automatic liveness or guessing the handset's current chooser. Completion gates also cover origin recovery, outbound dispatch and metadata binding; no shared sender/selection change is required.

Chooser consumption and recovery binding compare the exact stored JSONB context read as well as state, including the manifest pointer and original inbound ID. Identical `awaiting_project_choice` states do not identify the same question: a stale CAS must preserve the newer context untouched and follow existing quiet/retry paths, with completion still decided by the durable original-result reader. No new marker or authority is introduced.

The implementation preserves the original inbound delta on the independently accepted atomic, selection/callback and availability foundations. Context migration, pause and digest-ref hookup remain the subsequent inbound slice (SQ-25); P0-06c now applies `report_condition` through the atomic prompt authority (00643).

### Atomic references and honest receipts

All prompt RPCs are service-role-only. `sms_create_prompt(p_party_id, p_project_id, p_kind, p_subject_id, p_version, p_expires_at, p_sender_number, p_recipient_phone, p_proposed_effect DEFAULT NULL)` returns `(id, short_code)`. Allocation and complete proposed-effect insertion share one transaction. A medium-confidence proposal stores the whole effect (including date, availability, note, target and media) on the immutable prompt; handset context is never proposal authority.

Bound effects call `sms_apply_prompt(p_prompt_id, p_sender, p_recipient, p_sms_message_id, p_effect DEFAULT NULL)`; coded consent calls `sms_grant_optin_prompt(p_prompt_id, p_sender, p_recipient, p_sms_message_id)`. Business write, prompt answer and write-once SID/result receipt are atomic. Stored proposals require YES/Y/OK and no replacement effect. Command-only refs use the immutable target plus the accepted server mapping, including AVAILABLE. A command-only, sole-open availability prompt can consume a trusted parsed freeform date/window such as Tuesday 9-11; exact-code/reserved-command precedence and pair-lock serialization remain SQL authority. The original persisted inbound body is never rewritten to bypass grammar. Availability never means goods received. Existing note and punch effects remain supported, including a successful note result with `applied:false`.

The response envelope is `{status, result:{kind:'effect'|'optin', result:<business result>}}`. Before the SID duplicate/open-ref shortcut, `sms_prompt_receipt(p_sender,p_recipient,p_sms_message_id)` reconciles a persisted inbound row and adds `prompt_id` to a found receipt. NULL means no visible prompt receipt, not proof of raw rollback; the per-origin result and SQL lock/recheck still govern. A read failure is retryable. Same-SID replay uses the stored result even after expiry; a different SID sees a closed prompt. Unknown commit outcomes preserve the inbound SID and attempt metadata. A failed follow-up cannot turn a saved effect into a new business action or a false not-saved receipt.

### Authorized selection questions

Only the shared sender accepts `{kind:'selection',phone,selection:{kind:'project_choice'|'ref_clarify',inboundMessageId,options:[{partyId,projectId,promptId?}]}}`. The caller provides no prose, attribution, recipe or bypass. Initial per-option record/contact authorization precedes numbering; suppression wins. The null-attributed durable outbox recipe holds the authorized manifest, stable numbers/ref codes and origin.

The inbound dispatcher binds chooser/clarification metadata only after a verified durable sent/queued/deferred result. It consumes choices only after `recoverSmsSelection({inboundMessageId,kind,phone,messageId?})` returns `selection.usable` under current full authorization. Deferred, claimed and provider-queued are not asked. Choice IDs come from the recovered manifest, never mutable handset option arrays. Same-origin retries recover the existing row, including after metadata failure; unavailable recovery never authorizes a new question. A terminal row never revives after START or late callbacks. Ordinary replies continue through the generic/specialized shared templates; both `sms_selection` and `sms_inbound_reply` seeds are retained.

### Handoff and deployment precondition

Owned review requires a persisted owner assignment and a current successful notification response carrying a nonempty `notification_id`. HTTP 200 or `error:null` alone is not evidence of a handoff. Missing persistence yields a retryable failure, and committed business SIDs remain retained through receipt/handoff failures.

Legacy command refs and old medium proposals are indistinguishable when `proposed_effect` is NULL. Never infer proposal identity from NULL or handset context, and never blanket-close command refs. Before activation, establish from deployment provenance that the rejected producer never ran on the target; otherwise halt for a reliable explicit proposal-ID inventory and targeted cancellation/reissue. Production absence remains unverified. No production access, reset, migration-up or activation is authorized by this consumer repair.

## Phases, waves and ticket map

| Phase and wave | Today | After: ticket map |
| --- | --- | --- |
| Phase 0, wave 0A | The deck and this design were not versioned together. | **P0-01** commits the deck, this design, and the runbook design pointer. It is the sole 0A ticket. |
| Phase 0, wave 0B | No synthetic baseline or tenant-authority repair is integrated. | **P0-02** establishes the synthetic harness; **P0-03** repairs cross-studio authority; **P0-08** performs read-only preflight and drafts the campaign packet; **P0-W** is the PatinaWebsite companion that restores the `/signup` footer link and sitemap after the owner commits the Living Study tree. |
| Phase 0, wave 0C | Sender outcomes and guarded trade effects do not yet meet the shared dispatch contract. | **P0-04** owns sender and dispatch semantics; **P0-05** owns effects, templates, and parsing on disjoint files and migrations. |
| Phase 0, wave 0D | Inbound protocol and portal behavior are not yet bound to the durable result contract. | **P0-06** integrates the inbound protocol, including the sole wave owner for `pipeline.ts` and `field-daily/core.ts`; **P0-07** delivers portal behavior after P0-04’s dispatch shape is submitted. |
| Phase 0, cross-cutting completion | Consent/suppression and compliance corrections are incomplete, and no end-to-end fixture gate has proven the phase. | **P0-10** completes consent, suppression, and template-compliance hardening without violating S10 ownership; **P0-11** runs the integrated synthetic fixture proof. **P0-09** is the post-approval activation ticket and is not a pilot. |
| Phase 1 | Trades lack robust resend, renewal, operational diagnostics, and cadence protection. | **P1-01** is the single owner of SMS resend UI; **P1-02** adds quick trade consent capture and reply-to-renew; **P1-03** adds day-of trade messaging and delivery diagnostics; **P1-04** adds cadence/dead-end protection and Phase 1 fixture evidence. All are behind `field-line-trades`. |
| Phase 2 | Homeowner texting, phone-only identity, client decision replies, and delivery-window replies are absent. | **P2-01** establishes phone-only client identity and consent; **P2-02** sends the first letter by text; **P2-03** adds selection approvals; **P2-04** adds delivery-window replies; **P2-05** provides vocabulary lint and synthetic client-flow proof. All are behind `field-line-client`. |
| Phase 3 | Contractor time reports by text and an RCS assessment are not part of the active system. | **P3-01** adds flagged time-report proposals without touching `project_time_entries` RLS; **P3-02** is the read-only RCS sizing spike; **P3-03** supplies final phase proof and activation closure. Time-report UI is behind `field-line-time-reports`. |

The phase ordering is authority before consumers, production preflight separate from activation, and one independent Astra review-audit per wave bound to the candidate commit. An owner approves once per completed phase; no activation or live pilot follows merely from a candidate’s test result.

## Evidence

| Synthetic case | Today | After |
| --- | --- | --- |
| Two projects and two studios sharing one contractor's phone | The deck lists it as pilot evidence. | Fixture proves tenant isolation for one shared phone. |
| STOP, then a new engagement is added | Existing party rows are insufficient to establish carrier-style suppression. | Fixture proves sender-number global suppression persists independently of party rows. |
| START from a number with no prior consent | Existing behavior can grant broadly or ambiguously. | Fixture proves START re-grants only opted-out records, re-asks pending engagements, and never invents a grant for a missing record. |
| A reply with an old ref code, days late | Reply resolution can depend on current state. | Fixture proves it resolves the original prompt version or returns the closed-reference response. |
| A database failure mid-effect | A failure can be reported as success. | Fixture proves a truthful failure response and review handoff. |
| A duplicate inbound message id from Twilio | Existing idempotency needs durable regression proof. | Fixture proves the duplicate has no second effect. |
| A stale or forwarded link | A stale link needs an explicit safe resolution. | Fixture proves it cannot authorize unintended action. |
| A provider failure with an error code | Provider acceptance and delivery can be conflated. | Fixture proves durable send state, plain-language reason, and provider code are distinct from read state. |
| A daylight-saving boundary against quiet hours | Scheduled and local quiet-hours behavior can diverge. | Fixture proves the send is deferred or sent according to project-local time. |
| An unknown sender and a wrong number | Unresolved traffic can leak into a project context. | Fixture proves service-only handling without studio projection. |
| A photo upload that drops mid-way, on a flip phone and on mobile Safari | Media failure lacks a full synthetic regression proof. | Fixture proves interrupted media is safe and prompts a recoverable path. |

## Verification commands

| Today | After |
| --- | --- |
| There is no committed design baseline for these documents. | Run `git diff --check`, then `grep -c "[T]BD\\|[T]ODO" docs/superpowers/specs/2026-09-16-field-line-design.md`; the resulting count must be `0`. |
| The shared-surface identifiers are only in the contract. | Run `for n in 1 2 3 4 5 6 7 8 9 10 11; do grep -q "S$n\\b" docs/superpowers/specs/2026-09-16-field-line-design.md || echo "missing S$n"; done`; it must print nothing. |
| The deck is untracked in the worktree and its permitted edits must be auditable. | Run `git diff --no-index -- /Users/kody/Code/patina-merged/docs/design/field-text/the-field-line-proposal.html docs/design/field-text/the-field-line-proposal.html || test $? -eq 1` and inspect that only the four Phase 19 text nodes and the Phase 21 ask line differ. |
| The commit has not yet established its exact file set. | After the scoped commit, run `git show --stat HEAD`; it must list only `docs/design/field-text/the-field-line-proposal.html`, `docs/superpowers/specs/2026-09-16-field-line-design.md`, and `docs/field/sms-10dlc-runbook.md`. |

## Out of scope

| Today | After |
| --- | --- |
| The dormant rail and older planning material mention broader product possibilities. | This phase excludes an RCS build, vendor portal or trade accounts, marketing texts, phone/SMS auth, a second designer inbox, an ML parser sidecar, changes to `project_time_entries` RLS, homeowner texting before Phase 2, and SMS resend UI before its sole Phase 1 owner. |
| Browser flags can appear to control a feature, and existing code may contain unsafe behavior. | PostHog flags do not authorize cron, triggers, or edge functions. Safety repairs—authority, receipts, suppression, and compliance lines—are unconditional; new automation remains server-phase-gated. |
| A redirect rehearsal might be mistaken for a release criterion. | `SMS_DEV_MODE=redirect` is synthetic rehearsal to an allowlisted owner phone only. This design authorizes no live pilot, production access, campaign submission, or deployment. |

Recovery binders acquire the exact context snapshot before reading durable root completion, then CAS that snapshot. Chooser source ordering (sms_messages.created_at, inbound ID tiebreak) permits only the same or a newer source to replace a recorded source; the separate flattened root remains the completion/effect authority. Daily digest context CAS claims and freezes the day/items before any mint, with a two-minute JSON run_id/claimed_at/lease_until lease. Live-owner losers send nothing; expired unrendered claims re-read open refs and mint only missing items, while handled failures release only their own snapshot. Ownership is checked immediately before each mint and before rendering is saved; a lost owner sends nothing and never closes the minted prompt, which remains open for recovery to adopt. The stalled-create residual is closed by 00643 sms_create_prompt's daily identity transaction lock and existing-row return (party/project/kind/subject/frozen YYYYMMDD version), including either commit ordering after an expired lease recovery's stale reuse read.

### P0-06c PO field-report authority

`delivery_events` is an aggregate UNION ALL view, not a write target. Texted PO confirmation/arrival writes presence (`field_delivery_reports.arrived_at`); condition writes `condition_ok`, `condition_note`, and `condition_at`, with damage assigned to the project lead. The actor remains the party, and the PO must belong to the same project. No purchase-order status/delivered_date, receiving inspection, receiving RLS, or time-entry write occurs. Displaying these field reports beside receiving events is outside Phase 0.

`DAMAGED`/`DAMAGE` maps to condition with a note; `GOOD`/`FINE` maps to confirmation. Condition and delivery prompts admit one-open freeform condition text; wrong codes, reserved controls, and stored-proposal replacement remain refused. Atomic consumption retains immutable SID/result receipts and truthful “didn’t save” review on validator refusal. Daily prompt issuance uses the producer’s frozen YYYYMMDD version under 00643’s identity lock and returns the existing open id/code, closing the expired-lease stalled-create residual without new RPC signatures.

### US-6 off-grammar hours replies — `_shared/hours-judgment.ts`

The evening hours ask (contract S7, migration 00653) is answered in a number and nothing else: `HOURS_REPLY` in `supabase/functions/sms-inbound/pipeline.ts:2218` reads `6`, `6.5`, `6,5`, `6 hrs`, `6.5 42`. A crew that writes “about 6 and a half” is answering the question and is not read. `supabase/functions/_shared/hours-judgment.ts` is the typed-judgment reader for exactly those bodies, built as a standalone module with no pipeline caller yet (see the blocker below).

Shape, copied from `_shared/field-parse.ts`: injectable `{fetchImpl, getEnv, model, timeoutMs}`, plain `fetch` plus `AbortController`, every failure answered with a value and nothing thrown.

- `findHourCandidates(body): {span, hours}[]` — pure, deliberately over-recalling. Decimals and comma decimals, `NN and a half`, `NN 1/2`, bare `1/2` and `half`, the number words `one`–`sixteen`, and plain one- or two-digit integers. Overlapping matches are resolved longest-span-first, so `6 and a half` is one candidate worth `6.5` and never also offers the bare `6` inside it. Nothing is filtered for plausibility or range here.
- `judgeHoursReply(input, deps)` — one `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer ${TYPESAFE_API_KEY}`, model `jev-latest`, 4000 ms default timeout. Body is `{model, state, questions}`.
- `state` is `{message, ask:{text, task_title, day}, candidates:[span…], open_prompts:[{code,label}]}`. Per Kody’s 2026-09-20 ruling this carries the message body, the ask’s own words, the visit’s task title and the frozen ask-day, and **never** a phone number, a party or studio name, or a row id. `hours-judgment.test.ts` asserts the outbound body carries no phone-shaped digit run and none of the fixture identities.
- Questions: `intent` (choice: `reports_hours` | `did_not_work` | `question_or_confused` | `other_topic` | `none`), `hours_span` (choice over the candidate spans plus `none_of_these`), `multi_day` (noul), and `which_prompt` (choice over open prompt codes plus `unclear`) — the last asked **only** when more than one hours ask is open. Instructions reference state by backticked path (`` `message` ``, `` `ask.day` ``); every choice list carries its own no-match option.
- Act only when `intent = reports_hours`, `multi_day < 0.5`, `min(confidence)` across the choices asked is at least `HOURS_JUDGMENT_MIN_CONFIDENCE` (exported, initially `0.7`, tuned by the SQ-133 live eval), and the selected span’s value is in `0 < hours <= 16`.
- **Select, never generate.** The hours returned are `findHourCandidates`’ own normalization of the span the model *selected*. No number is read out of the model’s reply; a choice that is not one of the offered spans is treated as malformed.
- Everything else answers `{kind:"defer", reason}` with one of `no_key`, `http`, `timeout`, `malformed`, `no_candidates`, `intent`, `multi_day`, `low_confidence`, `out_of_range`. `no_key` and an empty candidate list make no request at all.

`TYPESAFE_API_KEY` is read through `getEnv` only. There is no `supabase/functions/.env.example` in this repo, so the key is documented here rather than in an env sample; in production it is set with `supabase secrets set` (gated), by name only.

#### Why the pipeline is not wired to it yet (blocker, 2026-09-20)

A confident free-text reading **cannot** currently be applied through the existing consumption door, and the fix is a SQL semantics decision rather than an edge-function change.

`consumePrompt` (`pipeline.ts:2119`) calls `sms_apply_prompt`, which at `supabase/migrations/00653_field_time_reports.sql:298` calls `sms_prompt_reply_verb(p, m.body)` against the **stored inbound body** re-read by `p_sms_message_id`. TypeScript cannot substitute that body, and rewriting it would falsify the 10DLC record. `sms_prompt_reply_verb` refuses both reachable free-text shapes for a `report_hours` prompt:

- Multi-token, e.g. “about 6 and a half”. The anchored hours grammar at `00653:227` misses, the `VERB` / `VERB NN` match at `00653:243` misses, and the freeform admission at `00653:251` is gated on `kind IN ('confirm_availability','report_condition','confirm_delivery')` — `report_hours` is absent, so it raises `23514 'sms_prompt: reply must identify this prompt'`.
- Single token, e.g. “eight”. `00653:243` matches and returns verb `EIGHT`; the `(verb, effect)` pairing at `00653:311-330` admits `report_hours` only as `verb IS NULL` (`00653:323`), so it raises `23514 'sms_prompt: conflicting command'`.

So the only body `sms_apply_prompt` accepts for a `report_hours` prompt is exactly the `HOURS_REPLY` grammar the regex path already handles; a judged free-text reply routed through `consumePrompt` would land on `effectFailure` as a designer handoff, never as a `proposed` `field_time_reports` row. 00653 is the newest definition of both functions.

The phase-3 fixture does **not** model this. `supabase/functions/_tests/field-line/inbound-fixture.ts:93-94` derives `verb` as the first whitespace token of the body and uses it only for the `proposed_effect` / `YES`-`Y`-`OK` guard; there is no reply-grammar check and no `(verb, effect)` pairing. A fixture case asserting “confident free-text produces one `proposed` effect” would therefore pass while production raises `23514`. Any wiring ticket must teach the fixture the grammar before the fixture can be its oracle.

A fix is not one line. It needs `report_hours` added to the `00653:251` freeform admission so a multi-token body yields verb `NULL`; a route for a lone all-caps token to yield `NULL` rather than its own word; and a ruling on the one-open-prompt guard at `00653:265-269`, which with `v_hours` false demands exactly one open prompt of **any** kind and so contradicts the `which_prompt` disambiguation across more than one open hours ask. That is a new migration plus a semantics ruling, and it is tracked as its own ticket rather than folded into the module.
