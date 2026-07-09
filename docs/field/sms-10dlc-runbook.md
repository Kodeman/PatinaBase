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

## 3. Number + Messaging Service

1. Buy ONE local 10DLC number (~$1.15/mo). Area code: your primary market.
2. Create a **Messaging Service** ("Patina Field"); attach the number; associate with the campaign.
3. Enable **Advanced Opt-Out** on the Messaging Service — carrier-grade STOP/START/HELP with custom copy:
   - STOP reply: `You're opted out of Patina project texts. No more messages will be sent. Reply START to rejoin.`
   - HELP reply: `Patina relays project updates for your design studio. ~1 msg/day. Reply STOP to opt out. Questions: hello@patina.cloud`
4. Set the Messaging Service **inbound webhook** to the deployed `sms-inbound` function URL: `https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/sms-inbound` (validated live 2026-07-09: reachable with **no `?apikey=`**, unsigned POSTs 403). The URL must equal `SMS_INBOUND_PUBLIC_URL` **byte-for-byte** — the Twilio signature is computed over it.
5. Optional: set the status callback URL to the same function (delivery receipts update `sms_messages.twilio_status`).

## 4. Secrets (Strata edge function secrets / Vault, 00258 pattern)

| Secret | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Console → Account Info |
| `TWILIO_AUTH_TOKEN` | Console → Account Info (also used for inbound signature verification) |
| `TWILIO_FROM_NUMBER` | The **Messaging Service SID** (`MG…`) — preferred over the raw number |
| `SMS_INBOUND_PUBLIC_URL` | Exact public URL registered in step 3.4 |
| `SMS_DEV_MODE` | unset in prod; `dry_run` local/e2e; `redirect` + `SMS_DEV_REDIRECT_NUMBER` for staging rehearsal |
| `CLAUDE_API_KEY` | already provisioned (companion/aesthete) |

## 5. Go-live smoke (SMS_DEV_MODE=redirect → your phone)

1. Add yourself as a `sub` party with your cell in the People Room, consent toggle on → receive opt-in invite → reply YES.
2. Assign a task/court item to yourself → receive assignment SMS with field link.
3. Open link → mark Done → verify task flips + Post item in the designer portal.
4. Text a freeform delay ("can't get the valve till Tuesday") → verify applied+confirmation or Desk review card.
5. Text STOP → verify opt-out recorded (party consent chip flips) → START to restore.
6. Unset SMS_DEV_MODE.
7. **Cron/quiet-hours timing check**: `field-daily` runs at 13:00 UTC — ~8am CDT in summer but 7am CST in winter, which the quiet-hours gate defers into the next day's run. At cutover either move the cron to 14:00 UTC or set `FIELD_TZ` so the digest lands inside the 8am–8pm window year-round.

## 6. Standing compliance rules (enforced in code; do not defeat)

- **Double opt-in** before any operational message; consent recorded per phone across all party rows.
- **Quiet hours** 8am–8pm project-local; off-hours sends defer into next digest.
- **~1 recurring message/day** (the digest). No individually-triggered nudge spam. Event-driven sends only for genuine assignments.
- **Freeform revocation** ("stop texting me") is honored, not just the STOP keyword (Apr 2025 TCPA rules; 10-business-day outer bound, we do it immediately).
- **Never** put marketing content in this channel — it's registered as operational; mixing jumps the consent bar and risks campaign suspension.

## 7. Cost expectations

~20 active field parties ≈ 900 segments/mo ≈ **$10–15/mo** (messages + carrier fees + campaign fee + number). LLM parsing (haiku): **<$1/mo**. MMS in ≈ $0.026 each incl. carrier fee.
