# Buying for a Job: procurement review, 5 October 2026

This review asks how a Patina design studio buys for a job in the designer portal. It covers catalog pieces, off-catalog pieces, workroom and COM, antiques, retail on a card, samples, freight and reimbursables. The Patina maker (marketplace) order counts as one lane among eight.

The evidence is code only. The code was read on main at `4207b8e2d`. Nobody walked the live portal and nobody interviewed Leah, by Kody's ruling. No code, database or deploy was touched.

**Published deck:** https://claude.ai/artifact/TveKxXXLgafVR9ZvqnV1XP (private, v1, 2026-10-05). **Adversarial review + fix log:** review/01-adversarial-review.md (SQ-390). Render PNGs (`deck/_renders`, `specimens/_renders`) are left out of git; regenerate them locally.

**The thesis:** the purchase order is good, but everything around it is thin. The review proposes one buying spine per job, kept inside The Document (synthesis/direction.md section 1).

## Team

| Seat | Role | Output |
|---|---|---|
| Sweep | Two planning sweeps | briefing/current-state-buying-flow.md, briefing/current-state-intake.md |
| R1 | Senior UX auditor (today's buying flow) | research/r1-buying-flow.md |
| R2 | Product and data analyst (item intake, field survival) | research/r2-item-intake.md |
| R3 | Senior FF&E buyer (48-point checklist, eight lanes) | research/r3-ffe-buyer.md |
| R4 | Competitive researcher (8 platforms + 2 analogues, public sources) | research/r4-competitors.md |
| R5 | Product strategist (studio moment, vision lens) | research/r5-studio-moment.md |
| D1 | Principal interaction designer | design/d1-interaction.md |
| D2 | Buyer-operations designer | design/d2-buyer-ops.md |
| D3 | Staff engineer (phasing, migrations, flags) | design/d3-phasing.md |
| Synthesis | Design director | synthesis/direction.md |
| A, B, C | Specimen builders | specimens/today-1440.html, proposed-1440.html, proposed-390.html (contract: specimens/SPEC.md) |
| Deck | Deck author | deck/ |

## File map

```
briefing/        seed briefs on the buying flow and item intake
research/        r1 to r5, each claim cited path:line with a [H]/[M]/[L] confidence mark
design/          d1 to d3 proposals
synthesis/       direction.md: thesis, 12 disagreement calls, checklist (2 have, 13 partial,
                 33 missing; weighted 40%), top frictions, change list C-00 to C-35, roadmap,
                 rulings, side journeys, risks
specimens/       SPEC.md and three self-contained HTML specimens; _renders/ holds their PNGs
deck/src/        index.html: the deck source with three {{SPECIMEN_*}} placeholders
deck/build.mjs   inlines the specimens as escaped srcdoc and writes deck/index.html
deck/index.html  the built deck, 20 sheets, about 1.1 MB, self-contained except Google Fonts
deck/_renders/   PNG renders of sheets 1, 7, 11, 13, 16 and 19 at 1440 and 390
```

## Rebuild

```bash
node artifacts/procurement-buying-review-2026-10-05/deck/build.mjs
# or, before the specimens exist:
node artifacts/procurement-buying-review-2026-10-05/deck/build.mjs --placeholder
```

The build stops with exit 1 and writes nothing in three cases:

- a specimen's last non-empty line is not `<!-- specimen-complete -->`;
- a placeholder count differs from 3 / 6 / 3 (today-1440 / proposed-1440 / proposed-390);
- the output would exceed 16 MB.

Each frame's state comes from its iframe `name`. A bootstrap injected into each specimen does three things:

- turns the iframe name into `#state-x&nobar`;
- hides the specimen's state bar;
- posts the content height back, so each frame is sized to its state.

## Rulings owed

These are all open. The review flags them and never resolves them. Where a mockup had to draw something, the deck labels it a drawing and not a ruling (sheet 19).

**Already open:**

- **V1:** where the margin pocket sits (docs/vision/VISION-DECISIONS.md:29). It holds up the maker lane beside studio lanes, COM through the maker lane, and the owner block.
- **R1:** who in the studio sees margin. **R5:** may a client price fall below trade. **R6:** price-age thresholds. **R7:** what the client is told about dates. **R8:** what money may change after the client agrees. **R9:** whether the money floor is a warning or a stop. These come from artifacts/pricing-mechanics-2026-09-05; R2, R3, R4, R10 and R11 are untouched by this review.
- **R-DI4 / R-DI5:** whether trade stays empty on imported and clipped lines, and whether V1 applies to pieces from off the marketplace.
- **V10 extension:** may a vendor write into the studio's record through a tokened link.
- **Agent OS:** when a studio member can review agent drafts. Until then, no Designer-Taught Intelligence composes buying drafts.

**New from this review:**

- **R-PB1:** whether a residential order needs the client's yes, and in what form: a warning, an approval record, or a paid invoice.
- **R-PB2:** an in-studio release line. Is it offered at all, per order or per vendor, and can admins release?
- **R-PB3:** with no ship-to, does po-send refuse, or default to the site with a visible line?
- **R-PB4:** is a studio's new maker a studio card over a shared maker record?
- **R-PB5:** does "read by next act" reopen what the R21 dissolve closed?
- **R-PB6:** which owner gates margin and release: the ungrantable `studio_owner` role, or the owner seat?
- **R-PB7:** do riders, store buys, finds and reimbursables bill at client price or pass through at cost?
- **R-PB8:** may a vendor write a quote or acknowledgment into the studio's record?
- **R-PB9:** the default claim window when a vendor account has none.

## Not examined

- No live portal walk. Three findings are code-certain but unverified at runtime: the ETA write, the member send, and whether the mock fallback hides either. Change C-00 is a one-day signed-in probe that settles them.
- No Leah interview. Claim windows, quote validity, yardage overage and lines per job are practitioner norms. Fixture names and prices are invented.

## As built (US-16, 2026-10-06)

The whole change list shipped as story US-16 with **no feature flags**, in three phases. Phase 0 and Phase 1 are in production; Phase 2 ships after its review fixes and member walk. Each phase got a separate-context review and an end-to-end member walk, and the review findings were fixed before deploy.

| C | What | Tickets | Migrations |
|---|---|---|---|
| C-00 | Member probe (ETA write, co-member send) | SQ-391, settled by SQ-400's walk | 00690 |
| C-01 · C-03 · C-04 | ETA RPC, status advance, mark installed | SQ-391, SQ-395 | 00690–00691 |
| C-02 · C-06 · C-07 | Explicit ship-to; po-send refuses no ship-to, spec→product, co-member send | SQ-396, SQ-398, SQ-437, SQ-438 | 00690 |
| C-05 | Line commercials (maker and trade cost) | SQ-391, SQ-397 | 00692 |
| C-08 | Orders book keeps the project lens | SQ-392 | — |
| C-09 · C-10 | One send UI; log the ack in the unfold | SQ-393 | — |
| C-11a | One readiness derivation (R-PB1 warn only) | SQ-394 | — |
| C-11 | Record what we paid | SQ-401, SQ-405, SQ-443 | 00695, 00716 |
| C-12 | Studio vendor accounts | SQ-402, SQ-406 | 00696 |
| C-13 | Studio receivers and locations | SQ-402, SQ-407 | 00697 |
| C-14 | The line unfold's six cells | SQ-404 | — |
| C-15 | Read by maker | SQ-408, SQ-444 | — |
| C-16 | Add to the job, the line card | SQ-409 | 00714, 00715 |
| C-17 | Carry fields at intake, spec seed | SQ-401, SQ-439 | 00693, 00694 |
| C-18 | Tracking on POs | SQ-403, SQ-410 | 00698 |
| C-19 | Receiving that sees | SQ-411 | 00700 |
| C-20 | Claim clock | SQ-412 | 00700 |
| C-21 | Change orders UI | SQ-415 | — |
| C-22 | Notices become acts | SQ-403, SQ-413 | 00699, 00700 |
| C-23 | The order paper | SQ-418, SQ-421, SQ-446 | 00701 |
| C-24 | The custom piece (COM pair, submittals) | SQ-418, SQ-424 | 00702 |
| C-25 | Purchase records | SQ-418, SQ-425 | 00703 |
| C-26 | Riders and shipments | SQ-418, SQ-422 | 00704 |
| C-27 | The acknowledgment check | SQ-419, SQ-426 | 00705 |
| C-28 | Outbound drafts | SQ-419, SQ-423 | 00706 |
| C-29 | Quotes | SQ-419, SQ-427 | 00707 |
| C-30 | Exceptions and substitutions | SQ-419, SQ-428 | 00708 |
| C-31 | Client deposit, then balance; riders and purchases at cost | SQ-420, SQ-429 | 00709 |
| C-32 | Held for release | SQ-420, SQ-430 | 00710 |
| C-33 | Read by next act | SQ-431 | — |
| C-34 | Install manifest and punch; spec snapshot and revision at send | SQ-420, SQ-432 | 00711 |
| C-35 | Samples: return-by and one Desk need (memo library parked) | SQ-420, SQ-433 | 00712 |
| C-36 | Who sees margin (R1) | SQ-402, SQ-414 | 00713 |

**Reviews and hardening:**
- Phase 0: SQ-399, fixes in SQ-437 and SQ-438.
- Phase 1: SQ-416, fixes in SQ-440, SQ-443 (00716) and SQ-442 (00717, studio-scoped reads).
- Phase 2: SQ-434, fixes in SQ-447 (00718) and SQ-448.

**Walks:** SQ-400, SQ-417 and SQ-435. **Follow-ups:** SQ-445 (stable line order). **Docs:** SQ-436, this section, plus `help/` (help drafts, unpublished) and `studio-notice-r1.md` (a draft for Kody to send).

**Carried, not built:**
- **R1 / F4:** margin visibility is a display preference, not a security boundary. The studio notice says so.
- **R3:** a release covers an order's total and is not tied to later edits.
- **R4:** the release threshold applies per order; splitting an order can stay under it.
- **R6:** previewing a held order still assigns its number.
- **Payee history:** rider payments recorded before 00718 stay attributed to the vendor; no reliable link existed to backfill them.
- **Side journeys** are parked in `docs/vision/VISION-DECISIONS.md`.
