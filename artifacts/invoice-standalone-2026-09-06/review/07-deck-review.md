# The Invoice, Standing Alone — deck review

T7 · 2026-09-06 · Deck reviewer (Sonnet, separate context). Read-only on repo code. Checks `proposal.html` and `mockup/invoice.html` against `review/04-rulings.md` (binding), `architecture/02-system-design.md` (v2), `design/01-directions.md`, `review/03-adversarial.md`, `discovery/*.md`, and the repo itself.

---

## Verdict

Five independent passes — numbers, citations, rulings-compliance + brand voice, rendering in both themes, and interaction testing of the live chooser — turned up **zero blockers and zero majors**; every finding below is minor or nit, and none touches the deck's central claims (the arithmetic, the security posture, the rulings, or the wave/rollback plan). Every T4 ruling in `04-rulings.md` is honored in both files — no spelled-out money as live copy, no "lowest fee of the three," no homeowner-facing "rail," the card rate is always the coalesced 300 bps with no held/"—" state, `has_payer` is gone, the settling sheet exists, the return nonce and `closed` status are described, the W2-additive/W3b-retirement split is stated correctly, the host is `client.patina.cloud`, and `view_count` is confirmed not surfaced — and the mockup's live toggle-and-total mechanic is verified, by driving the actual chooser in a browser, to move the fee row, Total to pay, and the act's label together in exact agreement with `onlineSurchargeCents` for both the household fixture ($9,130.00 / $9,398.75 / $9,125.00) and the studio fixture ($680.00 / $695.25 / $675.00). All seven parts of Kody's ask are satisfied at the design/architecture/presentation level the program promised (§ Completeness below); nothing is built, which is the stated scope, not a gap.

---

## Findings

| id | severity | confidence | file + location | finding | fix |
|---|---|---|---|---|---|
| N1 | minor | high | `proposal.html:502` ("Five plates from the built mockup") | The section heading says five plates; it actually contains **six** (Plate 1 desktop-open, Plate 2 phone-open, Plate 3 paid/receipt, Plate 4 studio invoice, Plate 5 dead link, Plate 6 settling sheet — all captioned "Plate N" in the markup). | Change the heading to "Six plates from the built mockup." |
| N2 | nit | high | `proposal.html:1203` (colophon, describing `mockup/shots/`) | Says "twenty rendered plates." `mockup/shots/` contains **21** PNGs (10 states × 2 viewports = 20, plus `open-print.png`). | Say 21, or note the print shot separately as a bonus. |
| N3 | minor | high | `proposal.html:505, 1086, 1203` ("nine states") | The mockup's own dev-toggle strip implements **ten** distinct states (`open, past-due, partial, processing, paid, returned-cancelled, returned-confirming, settling, studio, dead` — confirmed against `mockup/invoice.html`'s state list and the 21 `shots/` files), but the deck says "nine states" three times. Line 399's "nine states" is faithful to `design/01-directions.md` §0.6's original table (pre-dating the settling-sheet split and the confirming/cancelled split), so that one instance is defensible; the other three describe the shipped mockup and are off by one. | Say "ten states" at 505, 1086, 1203, or enumerate them. |
| N4 | minor | medium | `proposal.html` §4 (G4 row, "≈$265.23") — inherited verbatim from `review/03-adversarial.md` | The deck repeats the adversarial review's claim that Stripe's US card cost on the fixture is "≈$265.23" (2.9% + $0.30). Recomputed independently: 2.9%+$0.30 on the $9,125.00 balance = $264.93; on the $9,398.75 charged total = $272.86. Neither reproduces $265.23. The qualitative conclusion (card surcharge $273.75 exceeds Stripe's actual cost, so "the fee is what the rail costs" over-claims) still holds under either interpretation — this doesn't undermine the G4 fix — but the specific figure looks like an arithmetic slip carried forward uncritically. | Recompute and correct the figure, or drop the specific number and keep the qualitative point. |
| N5 | minor | medium | `proposal.html` §5 ("The page") vs `mockup/invoice.html` states | The mockup's `partial` (partially-paid) state is implemented and screenshotted (`partial-desktop.png`, `partial-phone.png`) — and partially-paid was one of the design's original nine named states (`design/01-directions.md` §0.6) — but it is never plated, named, or mentioned anywhere in the deck's §5 page section or its "three more states … not plated here" note. | Add partially-paid to the "not plated here" note, or plate it. |
| N6 | minor | medium | `proposal.html:1197` ("produced by six subagents") | `brief.md`'s team table names six subagent steps (T1 design lead, T2 architect, T3 adversarial reviewer, T5 mockup builder, T6 deck builder, T7 this review), but the same brief also states the pre-T1 facts were "verified by three read-only surveys this session," and the architecture blueprint header credits `discovery/04-blueprint.md` to "a Plan agent" distinct from T2. If those survey/Plan agents are separate dispatches, the actual subagent count is higher than six; if T1–T3/T5–T7 personally produced the four discovery docs as part of their own steps, six is right. The deck doesn't say which, and the colophon's own 12-file table includes all four `discovery/*.md` files without attributing them to a T-numbered step. | State explicitly how the discovery docs were produced, or drop the specific headcount. |
| C1 | minor | high | `proposal.html` (system section, near the G5/arithmetic discussion) — cites `00428:250-253` | The claim `coalesce(v_card_bps, 300)` "immediately before charging" is correctly attributed to `claim_invoice_checkout_attempt`, but the actual assignment line in the migration is **`00428:257`**, not within 250-253 (250-253 is the not-payable/zero-balance guard just above it). Same file, same function, correct migration number — a precision miss, not a fabrication. | Cite `00428:254-257` or `:257`. |
| C2 | nit | medium | `proposal.html` §7, "The signed-in surfaces" heading (cited `§6, §7`) | The paragraph under this heading also describes iOS (architecture §8) and the print fold (§6/D1), but the heading cites only §6 and §7. | Add `§8` to the heading's citation. |
| R1 | minor | high | `proposal.html`, the entity-relationship SVG diagram (invoices → invoice_links → invoice_checkout_attempts → invoice_payments), the "1 — 0..1 active" edge label | Screenshot-confirmed in both light and dark themes: the label is clipped by the adjacent `invoice_links` box — only "1 — 0..1 ac…" is visible. A layout bug, not a theme-contrast bug (identical in both themes). | Widen the gap between the arrowhead and the `invoice_links` box, or shorten the label. |
| I1 | nit | high | `mockup/invoice.html`, the `aria-live="polite"` region | Interaction-tested: on initial page load with ACH pre-selected, the live region is empty — `announce()` fires only on the radiogroup's `change` event, not during initial render. A screen-reader user who lands on the page and pays via the pre-selected default without ever touching the chooser gets no live announcement of the total, though the visible total is present in the DOM. Design directions' own accessibility notes (§1/§2/§3 in `design/01-directions.md`) describe the live region as announcing "the whole change as a sentence" but don't explicitly require an announcement on initial render. | Either accept as correct (nothing "changed" on load) or fire one announcement on mount naming the pre-selected default. |

**No findings** on: rulings compliance (all 11 checks below pass clean), brand voice (no "AI," no jargon, no hedging, no over-claiming found in any homeowner-facing string), the core surcharge arithmetic (exact on both fixtures), the chooser/fee-row/Total-to-pay/act-label mechanic (verified to move together correctly), the check panel copy ("Quist Interiors" as payee, "Let Nora know a check is coming" as the notify act), no horizontal scroll in either theme or viewport, and 23 of 24 path:line citations plus all 17 §-citations sampled.

---

## Rulings compliance (04-rulings.md), checked by grep + read against both files

1. No spelled-out money as live payable copy — **clean.** The banned sentence appears only twice, both quoting the rejected G1 finding as an example of what was cut (`proposal.html:487,1035`); zero instances in the mockup.
2. "Lowest fee of the three" — **dropped**, everywhere. Survives only in the description of the old chooser and the rejected G3 finding.
3. "Rail" in homeowner-facing copy — **absent** from the mockup entirely; in the deck it appears only in architect/system prose ("the guest rail") or quoting the rejected G4 string as an example.
4. Card rate always the coalesced 300 bps, no "—"/held state — **confirmed**; the mockup's JS has no conditional em-dash branch, and the deck's only em-dash references describe the rejected G5 design.
5. `has_payer` / no-payer state — **removed**; only mentioned as the G7 write-up stating it was deleted.
6. Settling sheet present — **yes**, in both (mockup `settling` state, deck Plate 6).
7. Return nonce covered in the system description — **yes**, extensively (§7 prose, the sequence diagram, the security table).
8. `closed` link status described — **yes** (statuses list, dead-link semantics, entity diagram, security table).
9. W2 additive / W3b retirement — **stated correctly and repeatedly**, including in the deploy-step rollback column.
10. Host `client.patina.cloud`; `pay.patina.cloud` ruled never — **confirmed** at four locations.
11. `view_count` not surfaced — **confirmed** explicitly; no view-count UI anywhere in the mockup.

---

## The numbers table

| Claim | Source of truth | Verified? |
|---|---|---|
| Fixture total/received/balance $16,730.00 / $7,605.00 / $9,125.00 | Rulings G2 | Yes — used consistently in both files; no leftover $18,250/$9,125 superseded fixture found anywhere |
| ACH fee/total on $9,125.00 balance: $5.00 (capped) / $9,130.00 | `floor((912500·80+5000)/10000)=7300→cap 500` | Yes, exact |
| Card fee/total: $273.75 / $9,398.75 | `floor((912500·300+5000)/10000)=27375` | Yes, exact |
| Check fee/total: $0.00 / $9,125.00 | formula | Yes, exact |
| Studio fixture total $675.00; ACH $5.00/$680.00; Card $20.25/$695.25 | mockup `STUDIO.totalCents=67500` + formula | Yes, exact on all three |
| 49 findings = 7 blocker / 17 major / 21 minor / 4 nit | `review/03-adversarial.md` | Yes — sums to 49, unique IDs counted match |
| Migration head 00573, mint 00574 | `ls supabase/migrations` | Yes |
| Ten `verify_jwt=false` functions (9 existing + `invoice-link-checkout`) | `supabase/config.toml` | Yes — 9 real directive lines confirmed independently (`grep -c` returns 10 only because one hit is inside a doc-comment, not a real entry) |
| Ten new RPCs | architecture §2.6 table | Yes, exactly 10 rows |
| "Twelve files" (colophon) | actual artifact directory | Yes — README.md deliberately excluded from its own list |
| "Twelve rows" (security table) | `proposal.html` §8 | Yes, counted 12 |
| "Nine ways this goes wrong" (risk register) | `proposal.html` §11 | Yes, counted 9 |
| "Four" rulings owed | `proposal.html` §12 | Yes, counted 4 |
| "Five design defects" (G1–G5 table) | `proposal.html` §4 | Yes, counted 5 |
| Line counts: old page 752, `invoice-folio.tsx` 858, `invoice-checkout-core.ts` 287, `invoice-checkout-integrity.ts` 263, `settlement.tsx` 217, architecture doc 566 | `git show`/`wc -l` on the repo | Yes, all six exact |
| "$61,400 of $85,000" (the source of the fixture's original confusion) | `docs/design/the-client-page/README.md:65` | Yes, exact |
| "Five plates from the built mockup" | the same section's own content | **No** — six plates present (N1) |
| "Twenty rendered plates" | `mockup/shots/` | **No** — 21 files (N2) |
| "Nine states render" (×3) | mockup's actual state list | **Partial** — 10 states implemented; `partial` undocumented in §5 (N3, N5) |
| Stripe cost "≈$265.23" (G4, quoted from the adversarial review) | 2.9% + $0.30 on the fixture | **No / unclear** — recomputes to $264.93 or $272.86 depending on base; qualitative conclusion unaffected (N4) |
| "Produced by six subagents" | `brief.md` team table vs. the "three read-only surveys" + "a Plan agent" also mentioned in `brief.md` | **Unclear** — see N6 |

~30 distinct numeric/count claims checked; 24 verified exactly correct, 4 wrong or partial (N1–N3, N5 combined under "nine states," N4), 1 ambiguous (N6).

---

## The citations table

~41 total citations sampled across the deck (17 `§n` references to architecture v2, ~24 `path:line`/migration/commit citations) — under the 40-per-file-type expectation and comfortably reviewable in full.

**§-section citations** — all 17 verified against `architecture/02-system-design.md`: §2.1–§2.3 (link table/mint/backfill), §3 (read path), §4/§4.1/§4.5/§4.6 (guest pay, edge function, payer resolution, return nonce), §2.4/§2.5 (discriminated union, changed RPCs), §5–§8 (letters/portals/iOS), §3.1 (payload leakage), §10 S17 (link-forwarding risk), V3/§6 reasoning (`view_count`). One nit: the "§6, §7" heading over a paragraph that also discusses §8 content (C2).

**path:line citations**, sampled in full against the live repo:

| Citation | Deck claims | Verified? |
|---|---|---|
| `packages/shared/src/invoice/index.ts:169-223` | Surcharge formula + constants | Yes, byte-for-byte |
| `middleware.ts:264-290` | 308-fold to `#letterbox` | Yes, exact |
| `lib/retired-routes.ts:63,145-152` | `/invoices` → `letterbox` mapping | Yes, exact |
| `components/threshold/settlement.tsx:183-192` | The single-sentence charge notice | Yes, verbatim match |
| `middleware.ts:144-147` / `:148-152` | Cache-Control/Robots block / public-list exclusion | Yes, exact for both |
| `middleware.ts:172,232`, `use-auth.ts:130` | `callbackUrl` builders | Yes |
| `posthog.ts:83` | `HEX_BEARER_IN_URL` | Yes, exact |
| `invoice-send/index.ts:259`, `invoice-reminders/index.ts:353` | The `/invoices/<id>` literal | Yes, exact both |
| `stripe-webhook/index.ts:418`, `:517` | Receipt / failure letters + applinks comment | Yes, exact both |
| `00428:250-253` | `coalesce(v_card_bps, 300)` before charging | **No — off by ~4-7 lines**; actual line is 257 (C1) |
| `00428:294-296` | Actor-mismatch RAISE | Yes, exact |
| `00318:181-190`, `00511:4071-4080` | `issue_invoice`/`issue_invoice_for_actor` status writes | Yes, both exact |
| `00429:1908-1911` | `resolve_plan_transmittal` grant shape | Yes, exact |
| `00571:1318` | `resolve_studio_identity` 3-arg | Yes, exact |
| `00018:2-5` | `designer_clients.client_id` nullable | Yes, exact |
| `00397:1454-1477` | `void_invoice` rename + wrapper | Yes, exact |
| `invoice_checkout_integrity_test.sql:748` | Pinned signature literal | Yes, exact |
| `923c0e935^:…page.tsx` (752 lines), `d95bb80a0` | Old page recovery + cutover merge | Yes, both exact incl. commit messages |
| `00178`, `00571` (bare, RLS) | authenticated-only RLS | Yes |
| `00548` (bare, hashing comparison) | `resolve_board_share` is anon-callable | Yes |
| `00282` (bare, "the incident") | Schema-qualification precedent | Yes, corroborated by later migrations |

23 of 24 path:line/commit citations verified exact; 1 minor line-range miss (C1, same file/function/migration, wrong sub-range).

---

## Rendering notes

Both files were wrapped in a `<!doctype html><html><head><meta charset="utf-8"></head><body>…</body></html>` scratch copy and rendered with Playwright's bundled Chromium (from `apps/designer-portal/node_modules`); the macOS sandbox's `MachPortRendezvousServer: Permission denied` was hit and cleared with `dangerouslyDisableSandbox: true`, as expected.

Scratch files (fork-produced, under `/tmp/claude-501/invreview/`): `deck.html`, `invoice.html` (wrapped copies); `render.js`/`render2.js`/`render3.js`; screenshots `deck-{light,dark-media,dark-attr}-1280.png` (full-page), `svg-{1..5}-{light,dark-media,dark-attr}.png` (all 5 deck diagrams × 3 render modes), `plates-{light,dark-media,dark-attr}.png`, `sec-{masthead,directions,waves,risks,rulings,colophon,security}.png`, `mockup-{open,dead}-dark-{390,1280}.png`. (This reviewer independently prepared an equivalent wrapped copy at `/private/tmp/claude-501/.../deck-review-render/` and confirmed Playwright + Chromium were present and reachable, as a cross-check; the fork's run superseded the need to re-execute it.)

- **Deck, no horizontal body scroll**: pass at 1280px in light, dark (`prefers-color-scheme`), and dark (`data-theme="dark"` attribute) — `scrollWidth <= innerWidth` true in all three renders.
- **Anchor nav**: all 13 `nav.index` hrefs (`#ask` through `#colophon`) resolve via `document.querySelector(hash)` — pass.
- **SVG diagrams, both themes**: all 5 diagrams legible in light, dark-media, and dark-attr — ink/paper roles swap correctly, no black-on-dark or white-on-light text found. One layout defect independent of theme: the entity-diagram's "1 — 0..1 active" edge label is clipped by the adjacent box (R1, minor).
- **Plates in frame**: all six plates render fully inside their bordered `.plate` frames in both themes, no overflow or misalignment; the selected chooser row is visually distinguished (filled dot + lighter background) in every plated state.
- **Tables scroll in their own container**: `.tablewrap{overflow-x:auto}` is present on every table; at 1280px no table's content exceeds its container, so the safety net wasn't exercised but is correctly wired for narrower viewports.
- **Mockup, dark mode**: `?state=open&nostrip=1` and `?state=dead&nostrip=1` at both 390 and 1280 — pass. Strong cream-on-near-black contrast; the selected "Bank transfer" row is clearly outlined against the other two at both widths; the dead-link state renders as a legible centered sentence with no letterhead, matching the design's intent.

No blocker or major rendering defects. One minor (R1, the clipped SVG label).

---

## Interaction testing (the mockup's chooser)

Verified with Playwright driving the live page (served locally so relative script/state handling worked as it would in a browser; scratch copy at `/tmp/invoice-scratch/`).

| Selected | Fee line | Total to pay | Button/act label | `aria-live` text |
|---|---|---|---|---|
| Bank transfer (pre-selected, initial load) | Bank transfer fee — $5.00 | $9,130.00 | Pay $9,130.00 | *(empty — see I1)* |
| Card | Card processing fee — $273.75 | $9,398.75 | Pay $9,398.75 | "Total to pay $9,398.75" |
| Check | *(fee row absent)* | $9,125.00 | Let Nora know a check is coming | "Total to pay $9,125.00" |
| Back to Bank transfer | Bank transfer fee — $5.00 | $9,130.00 | Pay $9,130.00 | "Total to pay $9,130.00" |

- All three move together and match the exact `onlineSurchargeCents` arithmetic — **pass**, high confidence.
- `aria-live="polite"` announces every subsequent change correctly — **pass**, with the initial-load gap noted as I1 (nit).
- Selecting Check reveals the check panel; it renders **"Quist Interiors"** as the payee and the notify act reads **"Let Nora know a check is coming"** (rendered as the act's own label, correctly separate from the panel's address/memo body) — **pass**, high confidence.

---

## Completeness vs Kody's ask

| Ask item | Satisfied? | Where shown |
|---|---|---|
| Stand-alone page, viewable with just a link, no account | Yes, at the design/architecture level | `architecture/02-system-design.md` §3–§4 (resolve_invoice_link granted to `authenticated`+`service_role`, never `anon`, called server-side only; `invoice-link-checkout` is `verify_jwt=false`); K1/K2 rulings; deck §7 "The system" |
| Payment-method selection on the page | Yes | mockup's live radiogroup chooser; deck §6 "The toggle and the total"; interaction-tested and passing |
| Real total-to-pay updating live as the method toggles | Yes | Interaction-tested: fee row, Total to pay, and act label move together, matching exact arithmetic, for both fixtures |
| Looked at what the invoice page was before the client-page cutover | Yes | Deck §3 "What the page was" + `discovery/02-old-page.md`, recovering `923c0e935^`'s page verbatim (752 lines, structure, arithmetic); citations verified exact |
| Team assembled to design and architect the system | Yes, with one loose thread | `brief.md`'s T0–T8 program; deck colophon lists the process and files — see N6 on the exact subagent headcount claim |
| Presented as an HTML presentation | Yes | `proposal.html` — a complete, navigable, themed HTML deck; renders cleanly, no h-scroll, all nav anchors resolve |
| Presented as a full-fidelity invoice mockup | Yes | `mockup/invoice.html` — interactive, ten states, live surcharge arithmetic verified correct, print stylesheet, renders cleanly in dark mode at 390/1280 |

All seven parts of the ask are satisfied by the design, architecture, and presentation deliverables. Per `brief.md`'s explicit scope ("No repo code changes, no migrations, no deploys in this program"), nothing is built or shipped — that is the stated boundary of this program, not an unmet item.
