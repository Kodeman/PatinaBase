# Field SMS — Twilio A2P 10DLC Runbook

Manual steps to stand up the field-coordination SMS channel. **Registration takes 1–4 weeks end-to-end — start Brand + Campaign before the code ships.** Code is inert without the secrets (sms-dispatch returns 503 `twilio_not_configured`; local/e2e run in `SMS_DEV_MODE=dry_run`).

## 1. Brand registration (one-time)

Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC → Register Brand.

- Legal entity: the Patina operating entity (EIN required — 2026 TCR rule, even for sole props).
- Standard brand: ~$44 one-time (includes secondary vetting). Low-volume standard also works to start.
- Website: patina.cloud. Vertical: Software/Technology.

## 2. Campaign registration (one-time + monthly)

Register ONE campaign under the brand:

- **Use case: Low-Volume Mixed** (~$1.50–2/mo, fixed 3 MPS, <2,000 segments/day on T-Mobile). Graduate to Standard Mixed / Account Notifications (~$10/mo, trust-scored throughput) when volume demands.
- **Campaign description**: "Operational project-coordination messages between interior design studios and their project contractors/tradespeople: task assignments, daily open-item digests, delivery confirmations, and status-update replies. Recipients are professional contractors working on the studio's projects."
- **Sample messages** (paste close variants of the real templates):
  1. `Hi Sal — Middlewest Studio coordinates the Maple St project through Patina. Reply YES to get job updates by text (~1 msg/day). Msg&data rates may apply. Reply HELP for help, STOP to opt out.`
  2. `Morning Sal — on you at Maple St: 1) Install vanity (due today) 2) Confirm grout color. Reply DONE 1, or text a photo/note. Full list: https://client.patina.cloud/field/<token>`
  3. `New from Middlewest Studio on Maple St: "Confirm rough-in dimensions" is on you. Reply here or tap: https://client.patina.cloud/field/<token>`
  4. `Delivery Thu 9–12 at Maple St: RH sofa (PO-1042). Reply OK to confirm, or reply with a problem.`
- **Opt-in description**: "Designer enters the contractor's phone with their verbal agreement; Patina sends a single opt-in invitation; messaging begins only after the contractor replies YES (double opt-in). STOP honored at any time." Include a screenshot of the People Room consent toggle once Wave 5 lands.
- Opt-in URL: link to a short page describing the flow (add to patina.cloud if the reviewer requires one).

### Widened campaign (Field Line)

Edit the **existing** campaign; do not register a second one. **Do not resubmit before P0-09 deploys** — the sample bodies below are the post-Phase-0 templates, and today's deployed templates do not match them (see "What is not true yet", below).

**Use case:** stays **Low-Volume Mixed**. Do not switch to Standard Mixed for this widening.

**Campaign description** (replace the §2 description with this):

> Operational coordination between an interior design studio and the trades and homeowners on its projects: opt-in invitations, site and delivery coordination, daily open-item digests, selection approvals, and delivery windows. Recipients are the contractors and tradespeople working on the studio's projects and the homeowners who hired the studio. No marketing.

**Message flow (opt-in) — three paths, all double opt-in:**

1. **Trades.** The studio records the tradesperson's verbal agreement against their party row (who, when, by which staff member). That record alone sends exactly **one** invitation — never an operational message. Texting begins only when they reply `YES NN` with the 2-digit code from that invitation. A bare `YES` with more than one outstanding invitation never grants; it asks which.
2. **Homeowners (clients).** Consent is a **separate, unchecked** checkbox on the studio's kickoff form — never bundled with the agreement signature and never pre-checked. The disclosure text is versioned; the stored consent row carries the version the homeowner actually saw. The same one-invitation / `YES NN` confirmation follows.
3. **Website.** patina.cloud/signup. The checkbox copy is a frozen compliance artifact held in the PatinaWebsite repo at `src/lib/copy/system-messages.ts`, exported as `SMS_CONSENT_TEXT`. **Paste it into the console verbatim; never reword it**, including for style. As of this writing it reads:

> I agree to receive account and order notification text messages and login verification codes from Patina at the mobile number provided. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to cancel at any time. See our Privacy Policy and SMS Terms.

**Sample messages** (paste all five). Every body leads with the studio name, uses plain words, and closes with the canonical rates/HELP/STOP line. "through Patina" appears **only** in the invitation. `Ref NN` is the 2-digit code the reply grammar (`<VERB> NN`) resolves against.

1. **Opt-in invitation (trade)**
   `Middlewest Studio coordinates the Maple St project through Patina and would like to text you job updates, about 1 msg/day. Reply YES 42 to start. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`
2. **Daily digest (trade), with Ref codes**
   `Middlewest Studio - Maple St today: Ref 17 install vanity, Ref 18 confirm grout color. Reply DONE 17, or send a photo or note. Full list: https://client.patina.cloud/f/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.`
3. **Delivery confirmation (trade)**
   `Middlewest Studio - Maple St: the RH sofa (PO-1042) shows delivered today. Ref 23: reply OK 23 if it arrived in good shape, or reply with the problem. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`
4. **Selection approval (homeowner)**
   `Middlewest Studio - Maple St: your bath tile selection is ready for your approval. Ref 31: reply APPROVE 31, or reply with a question. See it: https://client.patina.cloud/s/AbCdEfGh Msg&data rates may apply. Reply HELP for help, STOP to opt out.`
5. **Delivery window (homeowner)**
   `Middlewest Studio - Maple St: your sofa delivery window is Thu 9-12. Ref 44: reply PICK 44 to take it, or reply with a time that works better. Msg&data rates may apply. Reply HELP for help, STOP to opt out.`

All five are pure GSM-7 basic set (no em dash, no curly quotes, no en dash) and 2 segments each at the representative parameter values shown: 209 / 240 / 214 / 245 / 206 GSM-7 units against the 306-unit two-segment cap. Headroom is as little as 61 units (sample 4), so a long `{{studio_name}}` + `{{project_name}}` pair can push a body to three segments — P0-05 owns enforcing the cap at maximum parameter length.

**Canonical closing line** (one string, defined once in the templates migration; every `sms_%` body ends with it):

> `Msg&data rates may apply. Reply HELP for help, STOP to opt out.`

**Opt-out and help text** (these are the Messaging Service Advanced Opt-Out strings in §3.3; keep the console and the service identical):

- **STOP:** `You're opted out of Patina project texts. No more messages will be sent. Reply START to rejoin.`
- **HELP:** `Patina relays project updates for your design studio. ~1 msg/day. Reply STOP to opt out. Questions: hello@patina.cloud`
- STOP suppresses the phone number on this sender number globally, independent of any party row, and survives being added to a new project or studio. START re-asks eligible pending invitations; it never grants consent by itself. Freeform revocation ("stop texting me") is honored the same as the keyword.

**Console fields to edit** (Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC → Campaigns → the existing Low-Volume Mixed campaign → Edit):

| Field | Action |
|---|---|
| Use case | leave **Low-Volume Mixed** |
| Campaign description | replace with the description above |
| Sample messages 1–5 | replace with the five above (the form takes five) |
| Message flow / opt-in description | replace with the three-path flow above |
| Opt-in keywords / confirmation message | `YES`; confirmation is the `sms_optin_confirm` template |
| Opt-out keywords / message | `STOP`; the STOP string above |
| Help keywords / message | `HELP`; the HELP string above |
| Embedded link | **Yes** (`client.patina.cloud` field and selection links) |
| Embedded phone number | No |
| Age-gated / direct lending / affiliate marketing | No |
| Opt-in URL | patina.cloud/signup |

**What is not true yet (why you must not resubmit before P0-09 deploys).** As of migration 00432 the deployed templates do not yet match these samples: `sms_daily_digest`, `sms_court_assignment` and `sms_delivery_confirm` do **not** end with the canonical rates/HELP/STOP line (only `sms_optin_invite` does), `sms_daily_digest` opens with the recipient's first name rather than the studio name, and there is no `Ref NN` grammar, no selection-approval template, and no delivery-window template in the database at all. Submitting these samples against the currently deployed rail would describe messages the system cannot send. Resubmit only after P0-09 has deployed the Phase 0 migrations and the six functions.

## 3. Number + Messaging Service

1. Buy ONE local 10DLC number (~$1.15/mo). Area code: your primary market.
2. Create a **Messaging Service** ("Patina Field"); attach the number; associate with the campaign.
3. Enable **Advanced Opt-Out** on the Messaging Service — carrier-grade STOP/START/HELP with custom copy:
   - STOP reply: `You're opted out of Patina project texts. No more messages will be sent. Reply START to rejoin.`
   - HELP reply: `Patina relays project updates for your design studio. ~1 msg/day. Reply STOP to opt out. Questions: hello@patina.cloud`
4. Set the Messaging Service **inbound webhook** to the deployed `sms-inbound` function URL: `https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/sms-inbound` (validated live 2026-07-09: reachable with **no `?apikey=`**, unsigned POSTs 403). The URL must equal `SMS_INBOUND_PUBLIC_URL` **byte-for-byte** — the Twilio signature is computed over it.
5. Set the Delivery Status Callback URL to the deployed `sms-status` function URL: `https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/sms-status`. The URL must equal `SMS_STATUS_CALLBACK_URL` **byte-for-byte** — the Twilio signature is computed over it. Delivery receipts (and any `ErrorCode`) land in `sms_messages.twilio_status`/`error_code`.

## 4. Secrets (Strata edge function secrets / Vault, 00258 pattern)

| Secret | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Console → Account Info (also used for inbound signature verification) |
| `TWILIO_FROM_NUMBER` | The **Messaging Service SID** (`MG…`) — preferred over the raw number |
| `SMS_CONVERSATION_NUMBER` | The physical E.164 number used to key `sms_conversations`. **REQUIRED** when `TWILIO_FROM_NUMBER` is a Messaging Service `MG…` SID — outbound and inbound conversations both key on this number |
| `SMS_INBOUND_PUBLIC_URL` | Exact public URL registered in step 3.4 |
| `SMS_DEV_MODE` | unset in prod; `dry_run` local/e2e; `redirect` + `SMS_DEV_REDIRECT_NUMBER` for staging rehearsal |
| `CLAUDE_API_KEY` | **NOT provisioned on Strata** (verified by name 2026-09-19; it is not in the 46 edge-function secret names). `_shared/field-parse.ts:489` reads it for the model fallback, so its absence is fail-safe, not broken: with no key `parseFieldMessage` returns `intent:"unclear"`, `confidence:0` and the reply routes to designer review. The deterministic phrase layer (`parseFieldMessageDeterministic`) needs no key and is unaffected. Provision it only when model parsing is wanted. |

## 5. Go-live smoke (SMS_DEV_MODE=redirect → your phone)

1. Add yourself as a `sub` party with your cell in the People Room, consent toggle on → receive opt-in invite → reply YES.
2. Assign a task/court item to yourself → receive assignment SMS with field link.
3. Open link → mark Done → verify task flips + Post item in the designer portal.
4. Text a freeform delay ("can't get the valve till Tuesday") → verify applied+confirmation or Desk review card.
5. Text STOP → verify opt-out recorded (party consent chip flips) → START to restore.
6. Unset SMS_DEV_MODE.
7. **Cron/quiet-hours timing check**: `field-daily` runs at **14:00 UTC** — `00432_twilio_activation_hardening.sql:79-91` unscheduled the old 13:00 UTC job and re-scheduled it at `0 14 * * *` (08:00 CST / 09:00 CDT, always inside the 08:00–20:00 America/Chicago window), and no later migration touches that cron. `FIELD_TZ` is set on Strata. Nothing to change at cutover; this line was stale and is corrected here. This schedule is read from the migration file, not a live `cron.job` readback (see the activation record below).

### Phase 0 activation record

**Date:** 2026-09-19 (UTC). **Target:** Supabase Cloud "Strata", project ref `bkvcixdmuyejfzcijpdg`. **Source commit:** `a86ffe986` (main). **Migration head:** `00643_field_line_po_condition.sql`. **Owner approval:** Phase 0 approved 2026-09-19, given in the orchestration session and recorded in the US-1 story log; reviewed in SQ-90 comment `c_mu7sxgag_75ff69` on SQ-10. **Outcome: Phase 0 schema and functions are live; new outbound automation is OFF** because `FIELD_LINE_PHASE` is absent and `_shared/sms.ts:199` reads an absent value as phase 0 — see "What the phase gate does not cover" below for what this outcome does *not* mean.

The evidence files referenced throughout this record (`verification/SQ-10/*`) capture raw command output only; they are not themselves a claim of correctness beyond what that output shows.

**Push before deploy (ordering is load-bearing: `00639` stamps and deletes project-attributed `sms_conversation_context` rows, so it must land before the new consumers run).**

| Step | Command | Start → end (UTC) |
|---|---|---|
| Schema push | `supabase db push --linked --project-ref bkvcixdmuyejfzcijpdg --include-all` | 02:42:38 → 02:42:43 |
| Deploy `sms-dispatch` | `supabase functions deploy sms-dispatch --project-ref …` | 02:43:06 → 02:43:10 |
| Deploy `sms-inbound` | `supabase functions deploy sms-inbound --project-ref …` | 02:43:10 → 02:43:13 |
| Deploy `sms-status` | `supabase functions deploy sms-status --project-ref …` | 02:43:13 → 02:43:16 |
| Deploy `field-daily` | `supabase functions deploy field-daily --project-ref …` | 02:43:16 → 02:43:18 |
| Deploy `field-login-token` | `supabase functions deploy field-login-token --project-ref …` | 02:43:18 → 02:43:21 |

`--include-all` is mandatory: remote's max version is the timestamp `20260910152111`, so a `006xx` file classifies as `missing-remote` and a plain `db push` errors out having applied nothing. The dry-run planned exactly `00639, 00640, 00641, 00642, 00643` with `seeds:[]` and `roles:[]`; the apply logged the same five in the same order. `supabase migration list --linked --project-ref …` afterwards shows zero unapplied local and zero remote-only migrations (596 rows), with `00460` (waitlist consent) and `00432` still paired. That `--include-all` is required is inferred from this successful apply, not from a documented CLI rule; P0-08's read-only preflight established the need because the remote max version was `20260910152111`, below every `006xx` file.

**Function versions (before → after).**

| Function | Before | After | `verify_jwt` |
|---|---|---|---|
| `sms-dispatch` | v39 | **v40** | true |
| `sms-inbound` | v31 | **v32** | false |
| `sms-status` | v9 | **v10** | false |
| `field-daily` | v28 | **v29** | true |
| `field-login-token` | v25 | **v26** | true |
| `client-invite` | v46 | v46 (**not deployed**) | true |

`client-invite` is deliberately excluded: on this base it is the homeowner First Letter over email, outside the Phase 0 SMS set, and redeploying it would put a live email path at risk for no Phase 0 benefit.

**Secrets — nothing was written, set, unset, or changed.** 46 names before and 46 identical names after. Confirmed **present** among the names the five functions read: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM_NUMBER`, `SMS_CONVERSATION_NUMBER`, `SMS_INBOUND_PUBLIC_URL`, `SMS_STATUS_CALLBACK_URL`, `FIELD_TZ`, `CLIENT_PORTAL_URL`, `DESIGNER_PORTAL_URL`, `POSTHOG_HOST`.

Expected **absent**, each confirmed absent and each left alone:

- `FIELD_LINE_PHASE` — **absent**, which is the off position. This is the phase gate of contract S7; absent reads as `0`, so no new outbound automation can send even with the schema and functions live.
- `SMS_DEV_MODE` — absent, correct for production (`devMode()` falls through to `off`, i.e. real sends only, no dev redirect).
- `SMS_DEV_REDIRECT_NUMBER` — absent, correct for production.

Also absent, each with a safe in-code default and none of them introduced by this activation: `FIELD_LOGIN_TOKEN_TTL_SECONDS` (defaults to 3600), `CLAUDE_API_KEY` (see §4), `POSTHOG_KEY` (`_shared/aesthete-events.ts` degrades to a structured log line), `EMAIL_BUSINESS_ADDRESS` (`_shared/render-template.ts:53` has a literal default).

**No smoke was sent.** The §5 redirect rehearsal above was deliberately **not** run on Strata: no allowlisted recipient was provided and `SMS_DEV_MODE` is unset there, so a "rehearsal" send would have gone to a real handset. The refusal-without-an-allowlisted-recipient behavior is already proven synthetically (P0-11 step 5). No production SQL was run and no Twilio or PostHog API was called.

**Rollback, per step.**

- **Functions:** the CLI has no version rollback — redeploy the five functions from the last pre-Field-Line tip of main, `e0598724e` (`supabase functions deploy <fn> --project-ref bkvcixdmuyejfzcijpdg` from that checkout). Exact per-version build commits for v39 / v31 / v9 / v28 / v25 were not recorded at deploy time; `e0598724e` is the last commit git shows as unchanged, for each function's directory and `_shared`, since before its respective pre-Phase-0 deploy (sms-dispatch/sms-inbound/field-daily's last touching commits predate their 2026-09-16 17:28–17:30Z deploys; sms-status's predates its 2026-08-12 deploy; field-login-token's predates its 2026-07-10 deploy; none of `_shared`'s later commits fall in any of those windows). It is also the last commit known to be schema-compatible with the migrations applied on Strata before `00639` (`00594`'s `refuse_legacy_consent_write_trg` through `00635`). Redeploying is also what disables any behavior that `00640`/`00641` only enable through function code.
- **Schema (`00639`–`00643`):** leave it in place. There is no CLI down-migration, the authority/RLS/suppression work is an unconditional safety fix meant to survive a phase drop, and the practical kill switch is the phase gate, not the schema — the gate stays off because `FIELD_LINE_PHASE` is absent (= 0). If a specific object must go, it goes as a forward migration.
- **Cron:** no change was made (`00432` already owns the 14:00 UTC schedule, per `supabase/migrations/00432_*.sql:79-93`; no later migration re-schedules it, and the live `cron.job` row was not read back during activation). If it ever must stop: `SELECT cron.unschedule('field-daily');`

**What the phase gate does not cover.** `FIELD_LINE_PHASE` being absent (phase 0, per `fieldLinePhase()` in `_shared/sms.ts:198-201`) only blocks a caller that declares `automationPhase > 0` — GATE 3 at `_shared/sms.ts:1415-1416` refuses only that case (a deferred send re-checks the same gate at flush against the persisted `automation_phase` field, `_shared/sms.ts:2044`). `field-daily/core.ts:451` (the daily digest) and `:516` (delivery confirmation) both declare `automationPhase: 0`, so they keep running on the existing 14:00 UTC cron regardless of `FIELD_LINE_PHASE`, and `sms-inbound` v32 is live on the public webhook (`verify_jwt=false`). None of this is new: these are the pre-existing rail paths that were already live at v28 (`field-daily`) and v31 (`sms-inbound`) before Phase 0. The only lever over them is redeploying older function code or `SELECT cron.unschedule('field-daily');` — the phase gate itself does not touch them.

## 6. Standing compliance rules (enforced in code; do not defeat)

- **Double opt-in** before any operational message; consent recorded per phone across all party rows.
- **Quiet hours** 8am–8pm project-local; off-hours sends defer into next digest.
- **~1 recurring message/day** (the digest). No individually-triggered nudge spam. Event-driven sends only for genuine assignments.
- **Freeform revocation** ("stop texting me") is honored, not just the STOP keyword (Apr 2025 TCPA rules; 10-business-day outer bound, we do it immediately).
- **Never** put marketing content in this channel — it's registered as operational; mixing jumps the consent bar and risks campaign suspension.
- **Field Line design:** Follow [the fixed Phase 0 design](../superpowers/specs/2026-09-16-field-line-design.md) for phase boundaries and synthetic-evidence rules.

## 7. Cost expectations

~20 active field parties ≈ 900 segments/mo ≈ **$10–15/mo** (messages + carrier fees + campaign fee + number). LLM parsing (haiku): **<$1/mo**. MMS in ≈ $0.026 each incl. carrier fee.
