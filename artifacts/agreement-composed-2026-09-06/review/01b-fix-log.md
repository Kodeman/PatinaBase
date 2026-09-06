# 01b · Fix log — evidence-and-vision review (round 1a)

Every EV-01…EV-70 dispositioned. Where the orchestrator's ruling (`00-orchestrator-rulings.md`
D-1…D-7) differs from the reviewer's proposed fix, the ruling wins and is cited.

Gates after this round: `check-fixture.mjs` exit 0 (65/65 present) · `check-prose.mjs` exit 0
(628/900, every section under cap). Files touched: `proposal.html`, `README.md`,
`source/proposal.md`.

| id | disposition | what changed |
|---|---|---|
| EV-01 | applied | M1's `Projects into proposal_service_terms.retainer_cents` row deleted outright rather than renamed — DR-04 forbids column names in mockup UI. The correct column (`retainer_amount_cents`) now appears only in §4's projection table and M1's annotation 5. |
| EV-02 | applied | M0 annotation 4 now reads "Terms is one free-text field `00412:80`"; the clause inventory is marked `[05 §1]` simulated, with "the single field is not". |
| EV-03 | applied | Rigidity 8 cites `:459 vs :377-378, :399`. |
| EV-04 | applied | §2 money chain's last box is now "design time is authorized against this · 00414:911-913", and the empty fourth arrow cell became a real `→` (also DR-36). |
| EV-05 | applied | "What each act may touch" — Supersede/Sent is now `New RPC, P7`; Supersede/Executed cites the addendum countersign superseding the prior authority `00566:761-763`. |
| EV-06 | applied | The ASID Core row is flagged "this document's own mapping — lane 01's table starts at Schedule A". |
| EV-07 | applied | §5's reader column now reads "seeded `patina.*` rows: all authenticated. Studio rows: `is_active_org_member` on an active studio `00408:135-141`", with the `studio_id NULL` problem stated on the template row. M4's figcaption drops the `board_templates` RLS claim and says "reusing its ownership and namespacing". |
| EV-08 | applied | Appendix A: "EXISTS check 00477:306, message :309". |
| EV-09 | applied | §1's "Not yet set" row now cites `commercial-document-shell.tsx:225, :235; service-agreement-preview.tsx:155, :180` as a codebase fact, not the Aug-13 walk. §1's closing paragraph says so explicitly. |
| EV-10 | applied | `issue_trade_draw_invoice` cited to 00423 in §8's template table, P9 and Appendix A. |
| EV-11 | applied as ruled (D-3) | `furnishings` → `furnishings_services`; D1's Class box says a class is narrower than a `document_kind`, not a synonym; §5 caption states the three classes keep `document_kind = 'design_services'` and that `design_build` is a new kind (P9). |
| EV-12 | applied (D-7) | §3 lede: "lettered schedules whose option labels are not published". The "every fee model has a settled shape" claim is gone. |
| EV-13 | applied (D-7) | Monthly retainer / subscription row → **No**, with the reason: "Patina's retainer is one amount with a credit rule `00412:74-76`, not a recurring fee". |
| EV-14 | applied (D-7) | §3 lede: "Patina expresses two of the fee models below, and part of a third." |
| EV-15 | applied (D-7) | Mydoma steal row → "Per-project **feature** toggles"; "Contract-section grain **not confirmed**". |
| EV-16 | applied (D-7) | MA carries `unconf` in §8's notices row *and* in P11 ("mass.gov returned 403 on re-fetch … seeded last"). A sixth MA row was added to the licensing table (DR-27). |
| EV-17 | applied (D-7) | §9 gains a stated design choice: the SOV column header shows `(cost × 1.18)`, and a caption says lane 02 §8 keeps the SOV at cost with one separate fee line, shows both, names the divide-by-1.18 recovery risk, and sends it to R13 with the open/closed-book choice. R13's recommendation now rules the two together. |
| EV-18 | applied | §0 line 2: "The brief asked for four things…". |
| EV-19 | applied | Unified on **four** asks: §0 line 2, §1's lede and README all say four. |
| EV-21 | pass, no change | Recorded by the reviewer as a pass. |
| EV-22 | pass, no change | Fixture integrity confirmed; gate still 65/65 after this round. |
| EV-23 | applied | §9 lede → "every money figure in the ledgers below". M8's mock-cap now says `illustrative` with an annotation; M3's cost-plus card is labelled illustrative for the 30%; §9's closing caption enumerates all four drawn figures. |
| EV-24 | applied | The `130` hours total cell is dropped from M3's rate card (no fixture covers it). |
| EV-25 | pass, no change | Already correct. |
| EV-26 | applied as ruled (D-5) | P1 now waits on **R1, R4, R5, R6**. |
| EV-27 | applied as ruled (D-5) | The standard template is **nine parts** (Services · Deliverables · Exclusions · Role rates · Ceiling · **Furnishings deposit** · Retainer · Billing cadence · Terms); "verbatim" is gone; the deposit writes `furnishings_deposit_percent` (00422) in both §5 and §4's projection table; M5 renders it as its own typed part, not Terms prose. |
| EV-28 | applied as ruled (D-5) | P1 seeds `proposal_agreement_parts` from a code-resident list in `packages/types` (the `studio-config.ts` vocabulary pattern), explicitly "no template table yet"; the template object stays in P4. Wave 1 remains one migration. |
| EV-29 | applied | M6's rail drops the separate Schedule of values part (now **9 parts**) and carries a caption saying Pricing basis holds it (also DR-03). |
| EV-30 | applied | `phases` is "checklist of phases, on or off. No money" / Typed money **No**; the fee lives in `per_phase`. |
| EV-31 | applied | Standardised on "identities always; awarded prices per the open- or closed-book clause; the bid ledger never" in §8's table, M6's annotation and R13. |
| EV-32 | applied | M2's Blank column now lists all six kinds (Clause · List · Money · Attachment · Phase checklist · Attestation). |
| EV-33 | applied | §14: "Kody owns ten; Leah R3, R7 and R13; counsel R10 and R11; R16 is Kody's with counsel on the wording." |
| EV-34 | applied | M4's counts are now Clauses 5 · Lists 1 · Money parts 4 · Attachments 1, and M2's picker lists exactly those eleven rows (a Notice-of-cancellation attachment was added to the picker). Both figcaptions say so. |
| EV-35 | applied | M8's subhead → "changes one part" (DR-12); a new annotation says countersign supersedes the prior authority `00566:761-763`; the figcaption says `create_service_addendum` copies the whole origin terms row `00422:1870-1878`, so an addendum is a new edition, not a patch. |
| EV-36 | applied | P0 no longer claims the unified renderer — "the three renders keep their own code for now; one renderer arrives with P6". Wave 1's line is now "A studio that changes nothing gets today's agreement, unchanged." |
| EV-37 | not applied — external | `ARTIFACT_URL_PLACEHOLDER` is filled at publish time, which has not happened. Left for the publisher. |
| EV-38 | declined | The fix is a change to `source/check-prose.mjs`, which this round is not authorized to edit. The attribute stays on `.shell`; the gate's default is 900, the same number, so no gate behaviour changes. Logged for a later round. (Same as DR-19.) |
| EV-39 | applied | Counts re-swept after P14/R16: fifteen proposals and sixteen rulings in the masthead, §0, index, §10, §11 Wave 3, §12, README. Six kinds ✓, fifteen variants ✓, three waves ✓, eleven questions ✓, rigidity 12 ✓, constraints 8 ✓. |
| EV-40 | applied as ruled (D-1) | §8 re-founded. New table "What the existing trade scope actually is" with four evidence rows (`route.ts:178-187`, `00423:1881`, `consent-copy.ts:31`, `00423:185`, lane 02 §7). D2 redrawn: prime above, three **Trade Agreements** (`studio_trade_agreements`, studio ↔ sub, token-link signature on their own table) beneath, and the existing trade scope shown dotted as the client's optional per-trade authorization. New table mapping lane 02 §7's eight essentials onto the Trade Agreement, naming flow-down, pay-when-paid, insurance and lien waivers as the four the current instrument has no room for. Constraint 7 re-derived: it holds for the prime and is not reopened. New **P14 · The subcontract** (W3, L) and **R16 · Do subs sign inside Patina?** |
| EV-41 | applied as ruled (D-2) | The projection table states it: `billing_ceiling_cents` becomes nullable, NULL = uncapped, only when no `rate_card` part is present; `00414:911-913` learns NULL; the send/sign/authority refusals `00423:1608-1614`, `00477:306-309`, `00412:815-820` relax to "required only when time is billed". Listed in P1's bullets and P2's. R4 amended to match. §4's readiness row rewritten. M1's rail gives Ceiling the required dot. |
| EV-42 | applied as ruled (D-2) | New §4 table **"What each money variant writes"** — variant → terms column → authority column → CHECKs widened → RPC that reads it → proposal, with rows for `rate_card`, `ceiling`, `retainer`+credit rule, `cadence` (`per_draw` on both CHECKs, `00412:77-78, :148`), `flat`/`per_phase` (new `fee_basis`, `fee_amount_cents`, `fee_schedule`), `deposit`, and the other nine as record-only. "Countersign and authority are unchanged" is deleted from projection rule 2. |
| EV-43 | applied as ruled (D-3) | Class ⊂ kind. Waves 1–2 touch no edge function (stated on P1 and P6). P9 lists the new-kind surface: `00423:94-101`, `00412:115-117`, `route.ts:273`, `handler.ts:240-259`, `policy.ts:69`, the consent drift test, plus `proposal-send` and `commercial-document-notify`. |
| EV-44 | applied as ruled (D-4) | The consent sentence is composed from the money parts present — not keyed by class. §7's table row rewritten with the `consent-copy.ts:59` problem stated; the sentence is rendered once at send, hashed with the document, stored on the signature row (`metadata, 00412:107`); the drift test pins the composer, not the strings. M5's consent line is now composed from that agreement's parts. The record table replaces "consent sentence version" with "the consent sentence itself". |
| EV-45 | applied | The 00422 retainer-zeroing rule (`:1870-1878`) is named in §6's act table and in P7, which must exclude the retainer or remove the zeroing under R6. R6's recommendation carries it. |
| EV-46 | applied | Hashing is now per **client-visible** part, in D1, projection rule 3, §6's flow strip, the record table and M5's annotations: studio-only parts stay out of the client's digest. |
| EV-47 | applied | The column sketch carries `-- RLS: is_studio_comember via proposals, exactly as proposal_service_terms_studio_rw (00412:318-325)`. |
| EV-48 | applied | P7 and P13 each state that lifecycle moves stay under the existing GUC discipline `00477:134-139, :207-227`. |
| EV-49 | applied | P3 cites `upsert_design_services_draft`'s eleven literal seeding keys `00422:1754-1766` and says the RPC must be edited, not merely read. |
| EV-50 | applied | M5's leaf is labelled "Wave 3, counsel-gated — drawn here for shape only", noting ATCP 110 is a home-improvement rule so its applicability to a design-services agreement is counsel's call, with conspicuousness inside that review (R11). The figcaption says the leaf is not in M1's rail for that reason. |
| EV-51 | pass, no change | Recorded by the reviewer as a pass. |
| EV-52 | applied as ruled (D-6) | Appendix D and README: "Stream — the subscription floor. Procurement parts are where V1's answer will land; construction cost-plus is the studio's margin, not Patina's." |
| EV-53 | applied as ruled (D-6) | Wave 3 carries "A studio shape not yet on record — Leah's studio holds no subs, so this waits for a real one." README repeats it. Question 11 added: "Does Middle West hold trades under its own name, or plan to?" (§14 is now eleven questions). |
| EV-54 | applied | M7's annotations reframe the attestation as a required *part of the template the studio fills in*, "not a Patina gate between a studio and its own agreement"; R10 now also asks counsel whether storing credentials creates exposure of its own. §5's template row says the template carries the part rather than "selectable only after". |
| EV-55 | applied | R14's recommendation is now "Pending Q7. The simulated panel raised it `[disagreement 4]`; a real answer from a real studio should settle it." |
| EV-56 | applied | The word "Pledge" is gone. §11 drops the line entirely; §13 reads "Covenant or royalty language of any kind — V6". |
| EV-57 | applied | `licence`→`license`, `licences`→`licenses`, `labour`→`labor`, `labelled`→`labeled` throughout (11 occurrences). |
| EV-58 | pass, no change | Recorded by the reviewer as a pass. |
| EV-59 | applied | R12: "A frozen HTML snapshot at execution in Wave 2, **downloadable by the client**." |
| EV-60 | applied as ruled (D-6) | No compliance is asserted anywhere. §3: "Patina's fixed form meets the e-sign elements lane 03 lists, except a client-held reproducible copy (R12). Counsel to confirm." §7: "This is the floor lane 03 describes, applied per part rather than per document. Whether it is enough is counsel's call, not this document's." |
| EV-61 | applied | "The trade solved composability before software did" is cut. |
| EV-62 | applied | Fixed with EV-15. |
| EV-63 | applied | M7 annotation 3: the checkbox wording "is a placeholder — counsel writes it". |
| EV-64 | pass, no change | Hedges preserved; two more added (MA, the document's own ASID Core mapping). |
| EV-65 | applied as ruled (D-6) | Appendix D loses `no-prose` and is counted; the appendix cap is raised 40 → 60 in both the HTML and the spine. The vision test is four counted paragraphs at 57/60. |
| EV-66 | applied as ruled (D-6, DR-07) | §3's e-sign note is a plain counted `<p>`. §3 sits at 57/60 with the cap unchanged; the enumeration of the floor's elements and the press-and-hold hedge moved to a caption beneath, which is what a caption is for. |
| EV-67 | applied | Promoted to counted `<p>`: §1's "two tester notes and one walked journey…", §2's "A part list must drive all three…", §2's money-chain conclusion, §7's e-sign line, §11's Wave 1 and Wave 3 captions. §11's Wave 2 caption stays a caption — it is a contents list ("Four seeded templates, the picker, the door from parts"), not a conclusion. |
| EV-68 | applied | The "Licensing in six states" Rule cells are cut to the rule; thresholds and exceptions sit in the third column, with a caption saying so. §3's Patterns "Why" cells trimmed on the two longest rows. R4 and R9 recommendations are still long — they carry the amended ruling D-2 requires, and shortening them would lose the mechanism; logged as a partial. |
| EV-69 | applied as ruled (DR-05) | M0's readiness list is thirteen production strings, verbatim, including the three red ones; the heading reads "3 of 13 checks unmet" with a `▪ unmet · ▫ met` legend. |
| EV-70 | applied | §5: "R85 retired proposal templates because the Discovery-seeded path covers the job; that table happened to be per-user." R1 retitled **"Does R85 bind agreement templates?"** with the recommendation "No — a studio Library is a different object…" (HTML, README and spine). |

## Not applied, in one place

- **EV-37** — the artifact URL is filled at publish; nothing to do in the document.
- **EV-38 / DR-19** — requires editing `source/check-prose.mjs`, outside this round's scope. No
  behavioural difference today (the attribute value equals the script's default).
- **EV-68** — partial: the two Recommendation cells in §12 stay long because D-2 requires the
  mechanism to be stated there.
