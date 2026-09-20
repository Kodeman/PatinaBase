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
7. **Cron/quiet-hours timing check**: `field-daily` runs **twice a day** once `00648_field_daily_evening_tick.sql` is applied — `field-daily` at `0 14 * * *` (08:00 CST / 09:00 CDT) and `field-daily-evening` at `5 23 * * *` (17:05 CST / 18:05 CDT), both always inside the 08:00–20:00 America/Chicago window. The morning tick is 00432's (`00432_twilio_activation_hardening.sql:79-93` unscheduled 00284's 13:00 UTC job and re-scheduled it at `0 14 * * *`); the evening tick exists because the trade rail's site card is due at 17:00 **local** (`field-daily/core.ts:54`) and 14:00 UTC is 08:00 or 09:00 local and never 17:00, so on a single morning tick the card could never fire at all. Both jobs invoke the same function with the same empty payload — which block does anything is decided by the local-minute gates in `core.ts`, and everything the second tick re-walks is deduped per UTC day or per subject, so nothing is sent twice. 00648 re-declares **both** job names, so replaying that one file restores the whole registry. `FIELD_TZ` stays the only source of the zone (it is set on Strata); 00648 names no zone — it only picks a UTC hour that clears the 17:00 local floor at both of that zone's offsets. **00648 is applied on Strata** as of 2026-09-20 00:07Z (the Phase 1 + Phase 2 activation record below), so both jobs are registered there; before that push Strata had the single 14:00 UTC job and the evening card could never fire. This schedule is read from the migration files, not a live `cron.job` readback — no activation ticket has yet read `cron.job` back, because that needs production SQL and neither activation ran any; `supabase/tests/field/field_daily_schedule_test.sql` asserts the registry, the two expressions and where they land in both daylight-saving states, on a disposable clone.

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
- **Cron:** no change was made at Phase 0 activation (`00432` owned the 14:00 UTC schedule, per `supabase/migrations/00432_*.sql:79-93`; no migration applied on Strata re-schedules it, and the live `cron.job` row was not read back during activation). If it ever must stop: `SELECT cron.unschedule('field-daily');` — and after Phase 1 activation pushes `00648`, also `SELECT cron.unschedule('field-daily-evening');` for the 23:05 UTC tick it adds (§5.7).

**What the phase gate does not cover.** `FIELD_LINE_PHASE` being absent (phase 0, per `fieldLinePhase()` in `_shared/sms.ts:198-201`) only blocks a caller that declares `automationPhase > 0` — GATE 3 at `_shared/sms.ts:1415-1416` refuses only that case (a deferred send re-checks the same gate at flush against the persisted `automation_phase` field, `_shared/sms.ts:2044`). `field-daily/core.ts:451` (the daily digest) and `:516` (delivery confirmation) both declare `automationPhase: 0`, so they keep running on the existing 14:00 UTC cron regardless of `FIELD_LINE_PHASE` — and on the 23:05 UTC tick too, once Phase 1 activation pushes `00648` (§5.7): both jobs run the whole function, and those two phase-0 paths are what the evening tick re-walks. It sends nothing twice (the digest's send claim is keyed on the UTC date and both ticks share one; delivery confirms are keyed on the event id), but it is a second run of them per day and not only a trade-rail change. `sms-inbound` v32 is live on the public webhook (`verify_jwt=false`). None of this is new: these are the pre-existing rail paths that were already live at v28 (`field-daily`) and v31 (`sms-inbound`) before Phase 0. The only lever over them is redeploying older function code or `SELECT cron.unschedule('field-daily');` — the phase gate itself does not touch them.

### Phase 1 + Phase 2 activation record

**Date:** 2026-09-20 (UTC). **Target:** Supabase Cloud "Strata", project ref `bkvcixdmuyejfzcijpdg`. **Source commit:** `5bb66eaea579958696d065d09d227d8da424c890`, which was also `origin/main` at activation (both `git rev-parse HEAD` and, after `git fetch origin main`, `git rev-parse origin/main` printed it; tree clean). **Migration head:** `00654_client_letter_phone_status.sql`. **Owner approval, verbatim (2026-09-19):** "Phase 2 approved with Phase 1 then push main and deploy" — quoted by the orchestrator on SQ-106 over both GO gates, SQ-14 (Phase 1) and SQ-19 (Phase 2; portal leg `c_mu8k06rh_83d7b6`). **Outcome: Phase 1 and Phase 2 schema and functions are live, and no new outbound automation can send** — `FIELD_LINE_PHASE` is absent (reads as `0`) and `FIELD_LINE_CAMPAIGN_APPROVED` is absent, so the trade rail and the homeowner rail are both shut at the server gate. As at Phase 0, that sentence does **not** mean nothing sends: read "What the phase gate does not cover" in the Phase 0 record above, which still applies verbatim.

Raw command output is in `verification/SQ-106/*` (files `01`–`14`); as at Phase 0 those files are output, not a claim of correctness beyond what the output shows.

**Push (one command, nine files, ordering as the CLI planned it).** `supabase db push --linked --project-ref bkvcixdmuyejfzcijpdg --include-all`, 00:07:26 → 00:07:32 UTC, exit 0. `--include-all` is still mandatory for the reason the Phase 0 record gives (remote's max version is the timestamp `20260910152111`, so every `006xx` file classifies as `missing-remote`). The dry-run first planned **exactly** the nine below in this order with `"seeds":[],"roles":[]`, and the apply logged the same nine in the same order:

`00644_field_line_resend` → `00645_field_line_trade_prompts` → `00646_field_line_consent_gate` → `00647_explain_sms_delivery` → `00648_field_daily_evening_tick` → `00650_field_line_client_identity` → `00651_field_line_client_effects` → `00652_field_line_client_templates` → `00654_client_letter_phone_status`.

There is no `00649` and no `00653` — `00653` is reserved for Phase 3. **Push output digest** (sha256, so the record is checkable against the capture): the result line `{"upToDate":false,…"message":"Finished supabase db push."}` hashes to `a5f2154591a61e9b911f58ea5b32f40d2f9395405dba29a7ac766bfdfaa9b812`, and the nine `Applying migration …` lines together hash to `1b1dbca9915286dac5b1c9d9471d683bb3f5735f4591a5b23264c58f4225f2bc`. Full capture: `verification/SQ-106/05-push.txt`.

**Migrations (before → after),** from `supabase migration list --linked --project-ref …`:

| | Rows | Local-only (unapplied) | Remote-only |
|---|---|---|---|
| Before | 605 | the nine above | 0 |
| After | 605 | **0** | 0 |

`00639`–`00643` were paired before the push (the Phase 0 set, unmoved), and `00460` (waitlist consent), `00432` and `20260910152111` stayed paired throughout.

**Function versions (before → after).** Deployed one at a time, 00:07:48 → 00:08:37 UTC, each `supabase functions deploy <fn> --project-ref bkvcixdmuyejfzcijpdg`, each exit 0. Every `verify_jwt` is unchanged, because it comes from `supabase/config.toml` (`sms-inbound` and `sms-status` are declared `false` there; the other four have no entry and take the `true` default). The before column matched the Phase 0 activation record exactly, i.e. nothing had drifted on Strata between the two activations.

| Function | Before | After | `verify_jwt` |
|---|---|---|---|
| `sms-dispatch` | v40 | **v41** | true |
| `sms-inbound` | v32 | **v33** | false |
| `sms-status` | v10 | v10 (**no new version**) | false |
| `field-daily` | v29 | **v30** | true |
| `field-login-token` | v26 | v26 (**no new version**) | true |
| `client-invite` | v46 | **v47** | true |

`sms-status` and `field-login-token` were deployed as instructed but the CLI answered `No change found in Function`, so no version was cut and their `updated_at` still reads 2026-09-19T02:43Z. That is correct rather than a failure: neither has any code in `a86ffe986..5bb66eaea`, and neither imports a changed `_shared` module (`sms-status/handler.ts:19` imports only `_shared/twilio-verify.ts`; `field-login-token` imports no `_shared` at all). They are in the six for completeness, not necessity.

**Secrets — nothing was written, set, unset, or changed.** 46 names before and the **identical** 46 names after, compared as sorted sets. Names only were read; no value was printed and no digest was reversed.

Confirmed **absent after the run**, each deliberately:

- `FIELD_LINE_PHASE` — absent, which `fieldLinePhase()` (`_shared/sms.ts:263-267`, reading through the `env(deps, …)` helper at `:172`) reads as `0`. Setting it to `1` would open GATE 3 (`_shared/sms.ts:1852-1858`, re-asked at dispatch at `:2593`) to callers declaring `automationPhase: 1` — the trade rail: the site-card / day-of asks from `field-daily/core.ts`'s site-visit block, the cadence budget and dead-end handoff, and `reply-to-renew`. Setting it to `2` would additionally open the homeowner rail, including the client freeform branch that `sms-inbound/pipeline.ts:1682` gates on `fieldLinePhase(deps) >= 2`. It stays absent until the owner names the value.
- `FIELD_LINE_CAMPAIGN_APPROVED` — absent. GATE 3b (`_shared/sms.ts:1861-1873`) refuses **any** client-kind send unless this reads exactly `"1"` *and* the phase is ≥ 2, and it is re-asked at the deferred flush (`:2613`), so turning it off is how the homeowner rail stops mid-flight. Setting it to `"1"` asserts that Twilio approved the widened campaign; **the owner has not confirmed that approval, so it was not set here.**
- `SMS_DEV_MODE` and `SMS_DEV_REDIRECT_NUMBER` — both absent, correct for production (`devMode()` falls through to `off`: real sends only, no redirect). Their absence was checked as a HALT condition; neither was ever set, and no redirect was unset as a smoke step.

Secret NAMES the Phase 1 / Phase 2 rail reads that are absent and were **left alone**, each with an in-code default, found by grepping `Deno.env.get` / `getEnv` / the `env(deps, …)` helper across the six functions and `_shared`:

- `CLIENT_LETTER_FROM_EMAIL` — new at Phase 2, `client-invite/index.ts:76`, defaults to `hello@patina.cloud` (the canonical envelope address, which R1 keeps whatever the display name is). Absence is correct, not broken.
- `FIELD_LINE_TRIAGE_USER` — `sms-inbound/pipeline.ts:956`, the **last** resort for a review owner after the `field_project_lead_user` RPC and `projects.designer_id`. Absent, `reviewOwner` returns null and `ownedReview` returns false, so an inbound with no project gets no owned review card. Fail-safe, but it is a silent gap: provision it if projectless inbound traffic is ever expected.
- Not new to this activation, each already safe: `CLAUDE_API_KEY` (see §4), `POSTHOG_KEY` (`_shared/aesthete-events.ts:40` degrades to a structured log line), `FIELD_LOGIN_TOKEN_TTL_SECONDS` (3600), `EMAIL_BUSINESS_ADDRESS`, `EMAIL_ASSET_HOST`, `COMMS_PUBLIC_BASE`, `EMAIL_DEV_MODE`, `EMAIL_DEV_REDIRECT_TO`, `EMAIL_USER_CAP_PER_HOUR`, `RESEND_FROM_MARKETING`, `RESEND_FROM_TRANSACTIONAL`.

**Cron: both jobs stay scheduled.** The owner's decision, recorded by the orchestrator on SQ-106. `00648` re-declares both `field-daily` (`0 14 * * *`) and `field-daily-evening` (`5 23 * * *`) — it unschedules each by name first (`00648:75`, `:83`) and re-schedules both (`:91`, `:98`), which is why replaying that one file restores the whole registry. Nothing was unscheduled here, and the live `cron.job` table was **not** read back: that needs production SQL, which this activation did not run. §5.7 above is the schedule's description; the migration file is its authority.

**No smoke was sent, and no production SQL was run.** The §5 redirect rehearsal was again deliberately not run: no allowlisted recipient was provided and `SMS_DEV_MODE` is unset on Strata, so a "rehearsal" send would reach a real handset. No Twilio and no PostHog API was called, and no Supabase project other than `bkvcixdmuyejfzcijpdg` was touched.

**Known stale function: `site-request-dispatch` (not deployed here, on purpose).** It is at **v20, deployed 2026-09-16T17:30:32Z**, and `site-request-dispatch/index.ts:7` imports `isQuietHours` and `sendPartySms` from `_shared/sms.ts` (used at `:85` and `:154`) — the one shared runtime module that changed in `a86ffe986..5bb66eaea` (+715/−55). Because shared code is bundled per function, its live bundle carries a pre-2026-09-17 `_shared/sms.ts`: it is missing the four 2026-09-17 hardening commits (`4c76b01c7` deferred-flush holes, `40040feaf` abandoned send claim and bare token, `787520001` bearer-token redaction, `ed8b27554` notification-only callback settlement) and everything after. **Phase 0 did not redeploy it either**, so this staleness predates both activations rather than being introduced by one. The nine migrations do not break its deployed-era calls: that build of `sms.ts` calls only the `create_field_link` and `record_touch` RPCs, none of the nine redefines either, none of the nine alters `sms_messages` or `sms_conversations`, and the only alter touching a table it writes is `00650:127-133`, which merely widens the `studio_channel_consent` source CHECK to add `kickoff_checkbox`. It is nevertheless a live production SMS path, so its redeploy is filed as its own ticket, **SQ-117**, which verifies it against the current `_shared/sms.ts` first. Do not treat it as covered by this record.

**Rollback.**

- **Pre-push pointer:** the commit whose code was live on the six before this activation is `a86ffe986` (Phase 0's source commit). It is a valid function-rollback source for all six, `client-invite` included: `client-invite`'s last pre-Phase-2 change is `a468b9c9b` (2026-09-11), before the 2026-09-16 deploy that cut v46, so `a86ffe986` still holds that code. As at Phase 0 the CLI has **no version rollback** — rolling a function back means `supabase functions deploy <fn> --project-ref bkvcixdmuyejfzcijpdg` from that checkout, which re-cuts a *new* version carrying the old code.
- **Schema:** the Phase 0 record's rollback paragraph covers only `00639`–`00643` and its answer there is "leave it in place". That answer still holds here, and for the same reason: the practical kill switch is the phase gate (both flags absent), not the schema. **None of the nine ships a down script or a rollback header** — verified by grepping all nine for `rollback` / `down migration` / `to reverse`, which matches nothing. So the order below is the reverse-dependency order derived from each file's own objects, and it is a plan to write a forward migration against, not a script to run.
- **Down-order, `00654`→`00650` then `00648`→`00644`,** each step citing the file that created what it undoes:
  1. `00654` — restore `00581`'s `client_invitation_status` body over `00654:56`, and drop `client_link_refresh_target` (`00654:167`).
  2. `00652` — restore `00651`'s `client_decision_batch_bump_version` and `apply_client_effect` bodies over `00652:79` and `:136`, reverse the `client_decision_batches` alter (`00652:65`), and delete the three `sms_client_first_letter` / `sms_selection_ready` / `sms_window_pick` template rows. The three prompt KINDS need no reversal: they are free text on `sms_prompts` with no CHECK to narrow.
  3. `00651` — drop `apply_client_effect` (`00651:402`), the two bump triggers (`:190`, `:219`), `client_decision_batches` / its options, `delivery_availability`, and reverse the `decision_events` alter (`:359`).
  4. `00650` — drop `create_client_link` / `resolve_client_link` / `revoke_client_link` (`00650:226`, `:330`, `:385`), the `client_links` and `client_link_uses` tables with their RLS (`:203-204`), the `normalize_client_invitation_phone` trigger and function (`:85`, `:108`) and the `client_invitations` phone columns (`:55-70`); narrow the `studio_channel_consent` source CHECK back (`:127-133`) **only after** confirming no row carries `kickoff_checkbox`, since narrowing it with such a row present fails.
  5. `00648` — `SELECT cron.unschedule('field-daily-evening');` for the 23:05 UTC tick, and re-schedule `field-daily` at `00432`'s `0 14 * * *` if the morning job must be restored to `00432`'s declaration (`00432_twilio_activation_hardening.sql:79-93`; `00648:75-98` re-declares both).
  6. `00647` — `DROP FUNCTION public.explain_sms_delivery(uuid);` (`00647:78`). Diagnostic only; nothing sends through it.
  7. `00646` — restore `00644`'s `sms_resolve_prompt`, `sms_grant_optin_prompt` and `resend_party_invite` bodies over `00646:116`, `:153`, `:220`, and drop the two evidence-key constraints (`:72`, `:81`). Note this re-opens the two defects `00646` closed (a voided challenge can grant; evidence keys are unconstrained).
  8. `00645` — drop `sms_claim_party_budget` (`00645:91`) and `sms_party_prompt_gate` (`:181`), restore `00639`/`00641`'s `sms_create_prompt`, `sms_prompt_reply_verb` and `sms_apply_prompt` bodies over `:383`, `:465`, `:520`, reverse the `sms_conversation_context` alter (`:62`), and delete the `sms_site_card` / `sms_day_of` / `sms_field_link_renew` template rows.
  9. `00644` — drop `resend_party_invite` (`00644:277`), the `sms_void_stale_optin_challenges` trigger and function (`:238`, `:202`), the three CHECKs (`:55`, `:64`, `:71`) and the resend/void columns on `sms_prompts` (`:41`), and restore `00639`'s `sms_prompts_guard_binding` body over `:105`.
- **Reversing the phase after it is ever set:** dropping `FIELD_LINE_PHASE` from 1 back to 0 leaves any open `site_card`/`day_of` prompt in the residue US-2 documented — `sms_prompt_reply_verb` keys its trade branch on the prompt KIND and knows nothing about the phase, so TS resolves `LATE NN` by reference where SQL raises `23514`. The cost is one designer handoff, not a wrong effect. Expect it; fixing it would change Phase 0 reference grammar.

## 6. Standing compliance rules (enforced in code; do not defeat)

- **Double opt-in** before any operational message; consent recorded per phone across all party rows.
- **Quiet hours** 8am–8pm project-local; off-hours sends defer into next digest.
- **~1 recurring message/day** (the digest). No individually-triggered nudge spam. Event-driven sends only for genuine assignments.
- **Freeform revocation** ("stop texting me") is honored, not just the STOP keyword (Apr 2025 TCPA rules; 10-business-day outer bound, we do it immediately).
- **Never** put marketing content in this channel — it's registered as operational; mixing jumps the consent bar and risks campaign suspension.
- **Field Line design:** Follow [the fixed Phase 0 design](../superpowers/specs/2026-09-16-field-line-design.md) for phase boundaries and synthetic-evidence rules.

## 7. Cost expectations

~20 active field parties ≈ 900 segments/mo ≈ **$10–15/mo** (messages + carrier fees + campaign fee + number). LLM parsing (haiku): **<$1/mo**. MMS in ≈ $0.026 each incl. carrier fee.
