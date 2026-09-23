# The Second House — build program

Assembled 2026-09-22 from the deck (`../deck/index.html`), program-final, the completeness critic, and Kody's rulings taken in interview the same day. This file is the brief the build runs from. The deck stays the record of *why*; this is the record of *what, who, when*.

## 1. Rulings (Kody, 2026-09-22)

| # | Decision | Ruling |
|---|---|---|
| R-SH1 | The studios behind the problem statement | **Leah is the case.** No other studio is named; nothing waits on one. |
| R-SH2 | Homeowner in or out for the outside-house invoice | **In, as a named step.** The invite + invoice email to Leah's client is part of the trial and is the First Letter's first real production test. |
| R-SH3 | Wave 1 production mutations | **All four authorized:** P2a (Pledge band + commission copy out), the two enrollment pauses, H1 (funnel retirement), the founder-seat rule with an "independence unverified" outcome allowed. |
| R-SH4 | Capacity | **Agents build, Kody observes.** Kody's time = sit-downs with Leah + deploy approvals. The three-hour observation cap stands. |
| R-SH5 | House census (Kody's prior knowledge) | **4–8 live houses**, spread across a spreadsheet, her inbox and vendor PDFs, her head and phone, and **QuickBooks**. Exact count and per-house location are still asked at the sit-down. |
| R-SH6 | Invoice tool today | **QuickBooks.** Whether a Patina bill gets re-keyed into it is **asked at the sit-down** before P3 is shaped for QuickBooks import. |
| R-SH7 | Sit-down | **Not scheduled yet.** Build proceeds; the observation slots in when Leah can. Pre-demo observation of the last comparable invoice is still required before anything is demonstrated. |
| R-SH8 | Wave 2 scope | **All three now:** P3 billing export, P4 name the studio at invite, P2b pilot terms. |
| R-SH9 | Pilot terms | **Free, 90 days, sit-downs on request, cancel any time, return package = the P3 export.** No price; V2 untouched. |
| R-SH10 | Enrollment resume | **After Wave 2 lands** (Deploy 2). |
| R-SH11 | Ship posture | **One branch. Deploy 1 (Wave 1) lands by 24 Sept** so the pauses precede the 25 Sept due step; **Deploy 2 (Wave 2) follows** on the same branch. No feature flag. Adversarial review + green gates before each deploy. |

Untouched, by design: V1 (margin pocket), V2 (price), V6 (Pledge vs subscription). P6 and P3f stay on the shelf until the sit-down picks one (slide 20). PostHog OAuth is deferred; nothing in this program reads PostHog.

## 2. The bet, restated for the build

Make the next invoice on a house outside Patina easier to finish than in QuickBooks, then earn the next one, without making Leah keep two books. Measure a removed task and a "told" count, never engagement. Continuation rule = slide 21.

## 3. Waves and deploys

### Deploy 1 — Wave 1 — code complete 23 Sept, in production by end of 24 Sept

| Move | What lands | Owner model | Size |
|---|---|---|---|
| **P2a** copy out | Forward seed migration updating the live `email_templates` rows for `designer-invite`, `milestone-first-payment`, `onboarding-aesthete` (source `.tsx` in `packages/email/src/templates/` kept in step); preview text corrected; **both** Pledge figures removed from `accounts-book.tsx` (the band and the second figure at ~:169); inventory of adjacent welcome/help copy with a disposition per hit — known hits to start from: `components/document/accounts/accounts-earnings-page.tsx`, `lib/document/pledge.ts`, and 11 `Pledge` mentions across `apps/designer-portal/src`. Historical seeds 00293/00310/00404 untouched. Deploy = `./infra/deploy-portal.sh designer-portal` (redeploying `designer-invite` is a no-op for copy). | Opus | S |
| **Pauses** | Migration (or reviewed SQL in the same deploy) setting `sequence_enrollments.status='paused'` on the enrollment rows for user `19e7ae9b` (Kody's seat, enrollment `24f71966`) and user `1a94f78f` (enrollment `82a64492`), `next_step_at` pushed past the window, step history preserved, resume note "after Deploy 2". QA enrollment `9ad7029e` (user `86cdd0aa`) untouched and disclosed. | Opus (same ticket as P2a) | S |
| **H1** retire readouts | Drop `designer_funnel`, `conversion_funnel`, `consumer_funnel`; remove `FunnelStepRow` + `funnel-chart.tsx` + their admin display; dependents return explicit *unavailable*, never zero; guard or delete the `::regclass` casts in `supabase/tests/rls/00555_ios_round_one_security.test.sql:368-373, 2057-2062`. Admin-portal build enforces types, so this is one atomic ticket. Deploy = admin-portal via `deploy-portal.sh`. | Opus | S–M |
| **P1 instruments** | `build/observation/case-record.md` template (house aliases, operator, minutes, corrections, founder help, **told** column); `build/observation/founder-seat-snapshot.sql` read-only SELECTs over Middle West business rows for start / repeat start / readout, run through the Management API `read_only:true`; invoice-attribution SQL (union across three members, `studio_id IS NULL` rows included, per 00318/00513). No code ships to the portals. | Sonnet | S |
| **P5 readiness** | Read-only checks before the trial: Kody's Middle West seat role domain (must satisfy 00511:3392 / 00578:2250 for *Open the project*); the household→client picker path; First Letter accept leg smoke on a staging client (no real send). Output = a go/no-go note, not code. | Opus (read-only) | S |

Migration numbers: reserve **00655–00657** (current head 00654). Shared local Postgres — announce the reset window before `supabase:reset`.

### Deploy 2 — Wave 2 — target 30 Sept, no later than 2 Oct

| Move | What lands | Owner model | Size |
|---|---|---|---|
| **P3** billing export | Studio invoices / payments / clients spreadsheet with manifest (scope, exclusions, missing values). Tenant leg = `.eq('studio_id', …)` on top of existing co-member RLS (00316/00584) plus a disclosed NULL-studio count; payer name via the 00588 derivation; failed/refunded distinguished from collected; stable IDs, invoice numbers, currency, money units, tax, status, received dates, relationship keys; dated snapshot. Column set designed so a QuickBooks Online import mapping is a second sheet, added only if the sit-down says she re-keys (R-SH6). Surface: Accounts book download. | Opus | M |
| **P4** name at invite | Studio-name input on the invite chain (dialog → service → route → function); `business_name` carried in the same profile upsert that grants designer status; never overwrite an existing `business_name` on re-invite; live flag read for the teammate-persona condition, then `@middlewest.studio` added only if absent. Existing tours not re-armed. | Sonnet | S |
| **P2b** pilot terms | One plain page `/pilot-terms` (designer portal, house paper style): free, 90 days, sit-downs on request, cancel any time, return package = P3 export, support path, data handling. Shown on the referral path (`designer-invite` → `/auth/callback?next=/desk`) with acceptance recorded (`profiles` or a `pilot_acceptances` row — implementer picks the smaller). Jurisdiction line: `/terms` says Minnesota, VISION §1 says Madison, WI — **flag for Kody, do not resolve in code.** No price, no Stripe. | Sonnet | M |
| **Resume** | Reviewed SQL resuming the two enrollments with `next_step_at` set forward one full tick, per R-SH10. | with P4 ticket | S |

### Not in this program
P6 (spreadsheet/PDF door), P3f (schedule export), any QuickBooks write-back, any phone surface, any pricing evidence. The sit-down's census picks what comes off the shelf; that is a new brief.

## 4. Observation track (Kody's calendar, three-hour cap)

1. **Book the sit-down** with Leah (screen-share or in person). Open with the census: how many houses, where each lives, why the one is in Patina. Then watch the last comparable invoice assembled in QuickBooks before demonstrating anything. Fill the case record; every thing Kody has to say is one "told" row.
2. **Ask R-SH6** at the same sit-down: does a Patina bill get re-keyed into QuickBooks?
3. **P5, the trial**: Leah picks a genuinely due bill on an outside house. Open a project → invite the homeowner (R-SH2) → draw → issue → send when she ordinarily would. Kody logs every intervention; the founder-seat snapshot runs at start and readout.
4. **Readout**: net minutes (normal method vs all Patina time, Kody's time separate, machine wait separate), the told count, where the invoice went afterwards. Ask "What did this remove from your day?"
5. **Second occurrence** (Wave 2 window): repeat without founder preparation, or mark independence unverified.

## 5. Team

Fable orchestrates and reviews; it executes nothing. All tickets go through the Sidequest board; each implementer gets its own worktree off `build/studio-hook-2026-09-22` (created from `main`).

| Role | Model | Count | Notes |
|---|---|---|---|
| Implementer, P2a + pauses | Opus, high | 1 | Migration + portal copy + inventory. Gate: `pnpm --filter designer-portal type-check && pnpm test --filter designer-portal --filter @patina/email` |
| Implementer, H1 | Opus, high | 1 | Gate: `pnpm --filter admin-portal build` (types enforced) + `supabase test db` on 00555 |
| Implementer, P1 instruments + P5 readiness | Opus, read-only + Sonnet | 2 | Strata reads via Management API `read_only:true`; no secrets in output |
| Implementer, P3 export | Opus, xhigh | 1 | RLS tenant leg is the risk; first attempt must be right |
| Implementer, P4 | Sonnet, medium | 1 | Literal scope: the four files on the invite chain + the flag read |
| Implementer, P2b | Sonnet, medium | 1 | patina-brand-voice loaded; no price anywhere |
| Adversarial reviewers | Opus, high | 1 per deploy, separate context | Report every finding with confidence + severity; Fable filters |
| Verification | Sonnet | 1 per deploy | Browser walk of the changed surfaces at 1440 + 390; `wrangler deployments list` bottom row; behaviour probes; chunk grep after deploy (placeholder incident) |
| Deploys | Kody approves; a subagent runs `deploy-portal.sh` and `supabase db push` | — | Explicit "ship" per deploy, per CLAUDE.md |

Dispatch shape: Wave 1 = four concurrent tickets, review, deploy; Wave 2 = three concurrent tickets, review, deploy. A Workflow run per wave if Kody opts in; otherwise Sidequest dispatch per ticket.

## 6. Gates (every deploy)

- Adversarial review clean of majors; every minor dispositioned in writing.
- Type-check green on the touched portals; admin-portal `build` green for H1.
- `supabase db reset` locally replays 00655–00657 with seeds; 00555 SQL test passes after the view drop.
- Copy gates: `grep -wc AI` = 0 on every touched template and page; no "Pledge", "commission", "share" surviving in the three templates or the Accounts book.
- Post-deploy: `wrangler deployments list` bottom row = new version; grep the served chunk for the removed band string; send one test `designer-invite` to a Patina-owned mailbox and read the rendered copy.
- Nothing lands as a tile, target, streak or score on any studio surface.

## 7. Still owed from Kody before or during the build

- Sit-down date with Leah (R-SH7).
- Exact house count and per-house location (R-SH5) — at the sit-down.
- QuickBooks re-key answer (R-SH6) — at the sit-down; gates the second P3 sheet only.
- Jurisdiction ruling for the pilot terms (Minnesota vs Madison, WI).
- "Ship" for Deploy 1 and, separately, for Deploy 2 — **Deploy 1 consumed 2026-09-23** (COMPLETE 17:21Z: Strata 00655–00657, designer Worker b61988c8, admin Worker 044936f8). Only the Deploy 2 "Ship" is still owed.

## 8. Risks named up front

- **24 Sept is one working day away.** Wave 1 is four S-sized tickets; the compression risk is review and deploy time, not build time. If review is not clean by noon 24 Sept, the fallback is the standalone SQL pause (reviewed) so the 25 Sept step never fires, with the rest landing 25–26 Sept.
- **The homeowner invite is a real send** (R-SH2). The First Letter accept leg is unverified in production; P5 readiness is the only thing standing between the trial and a broken first impression.
- **Founder-seat attribution** has no author column to lean on; the snapshot diff is the audit. "Independence unverified" is a legitimate readout.
- **Shared local Postgres** across sessions: reserve numbers and announce resets.
