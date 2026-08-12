# Patina Agent OS — Handoff Quicksheet

One page. What to hand to what, in what order, and how you know it worked.

## The package

| File | Consumer | What it is |
|---|---|---|
| `patina-agent-os-claude-code-handoff.md` | Claude Code | Build PRD: queue, security, Mission Control dashboard, jobs, webhooks — WP-0 → WP-4, ~12 sessions |
| `patina-agent-os-cowork-handoff.md` | Claude Cowork (via you) | Project instructions, 4 skills, scheduled-task prompts, review gates |
| This sheet | You | Sequencing + verification + operating rhythm |

## Order of operations

**Day 1 — plumbing (~2 hrs of your time)**
1. Drop both handoff files into the repo at `docs/agent-os/`. Commit.
2. Cowork: create the `Patina Ops` project → paste Section A → connect **Microsoft 365** → create the Patina Ops SharePoint site + `Ops Inbox/` library tree (sync it locally) → add the four skills (Section B) → run the **cloud write smoke test** (Cowork handoff, setup step 5): if the connector can't write files from cloud runs, flip the affected schedules to local desktop tasks or in-session delivery into the synced folder — the bridge doesn't care which.
3. Claude Code, session 1: *"Read docs/agent-os/claude-code-handoff.md. Execute WP-0.1. Audit the existing vendor task queue and admin portal first, present your migration plan before writing any DDL."* Review the plan, then let it build.
4. Billing: you on Max 20x for interactive work; a **separate capped API key** in Coolify secrets for unattended jobs so scheduled runs never eat your interactive quota. (Plan limits move — verify at support.claude.com.)
5. Credentials for the bridge: create the **Entra ID app registration** (client credentials, `Sites.Selected` application permission granted to the Patina Ops site only — WP-1.5 has the spec) and drop the secret/cert into Coolify secrets so it's waiting when session 5 builds the bridge.

**Week 1 — foundations + first agent**
6. Claude Code session 2: WP-0.2 → 0.4 (roles, skills scaffold, runner + queue-groom job).
7. Claude Code session 3: WP-1.1 (Approval Inbox + Leah mode).
8. Cowork: `/schedule` Designer Scout (C.1) and Design Chicago Prep (C.2). Run Scout once manually first and check the output header format.

**Week 2 — the loop closes**
9. Claude Code sessions 4–5: WP-1.2 → 1.5 (Vitals, Morning Brief, Run Log, **Intake Bridge**).
10. End-to-end test: Scout runs Monday → file lands in the `Ops Inbox` library → bridge ingests overnight (Graph delta) → card in your Approval Inbox Tuesday morning → you approve → audit row exists. That round trip is the system working.

**Then by quarter (per the roadmap)**
- **Q2 (Nov):** Claude Code WP-2.x before the first concierge order. Vendor Qualifier goes live in Cowork; Leah gets her Friday swipe link (`/mission-control?assignee=leah`).
- **Q3 (Feb):** WP-3.x instrumentation; `/schedule` the Content Studio (C.4); apply for Pinterest API Standard access immediately — the review takes time and Trial is sandbox-only.
- **Q4 (May):** WP-4.x finance clerk + data-room assembler.

## Verification checklist (don't advance until green)

- [ ] WP-0: concurrent dequeue test passes; `agent_reader` provably can't write; every transition audited
- [ ] WP-1: keyboard-only review works; Leah card = one mobile viewport; Morning Brief waiting at 6 AM
- [ ] Bridge: re-runs and delta-token restarts create **zero** duplicate tasks; malformed file surfaces as reviewable error; app credential provably touches only the Patina Ops site
- [ ] WP-2: Stripe CLI replay = exactly-once tasks; ledger mismatch produces an inbox flag
- [ ] WP-3: attach-rate tile reconciles against a hand-computed fixture
- [ ] WP-4: no payout leaves without your approval click

## Your operating rhythm once live

- **Daily (30–60 min):** Morning Brief → clear the Approval Inbox (j/k/a/r) → glance at Vitals. Done.
- **Friday (5 min, Leah):** send her the swipe link; brand-score cards only.
- **Weekly:** the three numbers in the Rhythm panel (liquidity · GMV/designer · attach). Everything else is monthly.
- **Monthly:** finance clerk output + a 20-minute spot-check of 3 random approved agent outputs against their sources (your eval discipline).

## Tripwires (change the plan when tripped)

- Approval rate in the inbox **>~90%** → gates are too broad; raise confidence thresholds so only true exceptions surface.
- Cowork weekly caps throttling scheduled runs → move that job to API-billed headless Claude Code.
- Agent spend approaching part-time-contractor cost → prune always-on tasks, batch into fewer sessions.
- **Any** customer/designer/maker-facing error from an agent path → add a human gate + regression eval on that path, same day.
- Liquidity ratio outside 1:1–3:1 for 2+ weeks → rebalance recruiting focus before scaling either side.

## The three rules that outrank everything

1. Agents prep; humans relate. No agent ever conducts a designer, maker, or client relationship moment.
2. Nothing external sends, and no money moves, without your click.
3. The ledger is the truth; Stripe is a witness.
