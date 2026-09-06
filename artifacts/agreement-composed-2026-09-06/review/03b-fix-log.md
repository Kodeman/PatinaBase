# 03b · Fix log — fresh-context re-review (round 2)

All 23 RR ids dispositioned. Layout lane's round-2 CSS (`.mockscroll`/`.tablewrap`
`position:relative`, `.selectmock` `white-space:normal`) was read from disk before editing and
is untouched.

**Gates after this round — all three green:**

| gate | result |
|---|---|
| `source/check-fixture.mjs` | exit 0 · fixture math ok (65 figures) · all 65 present |
| `source/check-prose.mjs` | exit 0 · 671 / 900 · every section under cap, **no cap raised** |
| `review/render-check.mjs` | **63 pass / 0 fail** (needs `dangerouslyDisableSandbox` to launch Chromium past `mach_port_rendezvous`) |

Files touched: `proposal.html`, `source/proposal.md`.

| id | sev | disposition | what changed |
|---|---|---|---|
| RR-01 | major | handled by layout lane · verified | The render gate is green: 63/63 across 390/760/1280 × light/dark/system-dark. The root cause was `.sr-only` spans escaping their scroll container's clip (no positioned ancestor on `.mockscroll`/`.tablewrap`), fixed in CSS by the layout lane. Not redone. The gate's state is now recorded in this log alongside the other two, which RR-01 also asked for. |
| RR-02 | major | handled by layout lane · verified | `.selectmock` now sets `white-space:normal` itself, so M2's money row wraps instead of being clipped. `figures-sized-and-not-clipped` passes at all nine viewport/theme combinations. Not redone. |
| RR-03 | major | applied | The `deposit (procurement)` row is renamed **`procurement` — deposit % only**, its authority cell reads "not snapshotted onto the authority", and its RPC cell adds "the variant's other fields — markup basis, freight, storage, terms of sale — are record-only". The last row is now "the other **eight** variants". Six named + procurement + eight = fifteen, counted once. |
| RR-04 | major | applied | §5's column is renamed **"Money parts it carries"**. Each row says which way it goes: the standard template's four "all four create billing authority"; consultation's two the same; Furnishings only — "`procurement` — only its deposit % is read today `00422:370`; the rest is **record only** until R9. `retainer` optional, and it does create authority"; Design-build — "all three **record only** until R9; nothing invoices off a draw schedule yet". |
| RR-05 | major | applied | Row headers converted in every table the finding names: Schedule variants (0→15), the projection rule (0→3), Ledger A (8→15), Ledger B cost basis (0→11), Ledger B draws (0→7), ASID map (8→12), Appendix C personas (0→5), Appendix C disagreements (0→5). Document total: 141 → 202 `scope="row"`. Every `<th>` in the file carries `scope`. **Deliberately left alone, and why:** the six "Patterns worth taking" rows, whose first cell is a Steal/Avoid verdict badge rather than a row name (the reviewer calls this defensible); and the 15 rows inside the four `.mocktable` drawings in M3, M5 and M6, which depict product UI rather than document tables — converting them would pull `tbody th`'s body-register styling into the mock chrome. |
| RR-06 | major | applied as ruled | The attestation is a **gate on selecting the design-build template** in all six places: §5's template row ("gated: selectable only once the studio's licensing attestation is on file"), §8's turnkey table ("**gate** — the template is not selectable without it"), M7's mock-cap ("the gate on the design-build template"), M7's letterhead ("Before this studio can use the design-build template"), M7 annotation 2 ("This gates the design-build template … It gates one template, not the studio's other agreements"), P10, and the Wave 3 flag ("the design-build template is selectable only with an attestation on file"). The spine carries the same wording. |
| RR-07 | major | applied | `source/proposal.md` swept fully, amendment note kept. Fixed: ":96" countersign-is-unchanged → the projection table plus "five of the fifteen variants need columns or CHECKs that do not exist yet", and the `TG_TABLE_NAME` cite corrected to `00423:447-451`; ":98" readiness ceiling → amended R4's rate-card rule with `00412:73`; ":169" attestation gate reworded to match RR-06; ":173" M6's rail → ten parts, no separate Schedule of values, Supervision fee added; ":185" "32-word Patina wording" → "the standing disclaimer … 34 words; do not state a count", and M7 retitled; ":187" "five states" → "**six** states" with MA and its 403; ":213" "consent keyed by class" → composed from the money parts present, "never keyed by class"; ":234" the waves line loses "Pledge"; ":256/:263" §13 keeps **Pledge / covenant / royalty language (V6)** as the one prohibition and drops the 32-word claim; ":269" "R1–R15" → "R1–R16 — Kody owns ten, Leah R3 R7 R13, counsel R10 R11, R16 Kody with counsel"; §0 line 1 "blockers" → "checks"; §5's turnkey row gains the record-only note; P10 reworded; the rigidity ledger's fourth `#` column recorded as deliberate; Ledger B's caption gains the pro-ration design choice and the list of drawn-not-derived figures. Zero hits remain for "32-word", "keyed by class" (except the corrected "never keyed by class"), "five states", "countersign is unchanged" and "R1–R15". "Pledge" survives at exactly one line — the kept-out list, where it is the prohibition. |
| RR-08 | major | applied | §3: "Patina's retainer is one amount with an **activation policy** `00412:74-76`, not a recurring fee." |
| RR-09 | minor | applied | `centre` → `center` in M1's figcaption; `colour` → `color` in the CSS comment. Zero British spellings remain, in body text or source. |
| RR-10 | minor | applied | §7: "**Five** hand-built sections over the seven facets `service-agreement-preview.tsx:91-244`" — agrees with §2. |
| RR-11 | minor | applied | Projection rule 3 cites `00423:447-451` for the dispatch, matching Appendix A. |
| RR-12 | minor | applied | "**Five** of the fifteen variants need a new column or a widened CHECK … eight mean nothing until R9", and projection rule 2 says "five of the fifteen variants". |
| RR-13 | minor | applied | M1's Satisfied list gains `Deliverables · 3 items`, so all six required parts are accounted for (3 unmet + 3 satisfied). |
| RR-14 | minor | applied | M6's rail gains **Supervision fee** as a required clause part (now Parts · 10), and the rail caption says what it holds on this agreement: "the 18% cost-plus fee *is* the supervision fee, so no sub markup is taken on top". |
| RR-15 | minor | applied | The two conclusions the finding names are promoted into counted `<p>`: §4's "The honest cost: five of the fifteen variants…" and §8's "The current trade-scope instrument covers none of flow-down, pay-when-paid, insurance certificates or lien waivers…". Two more were promoted beyond the finding's minimum — §5's D-3 ruling ("Class is a column on the parts snapshot; dispatch stays on kind, so Waves 1–2 touch no edge function") and §9's design choice ("this document pro-rates the 18% fee across every schedule-of-values line, and R13 must rule that together with the open- or closed-book choice"). Ledes were trimmed to pay for all four, so **no cap was raised**: model 57/60, library 59/60, turnkey 70/70, fixture 57/60. **The convention, stated:** a `<p>` carries argument and conclusions; `no-prose` captions carry mechanism, citations, sources, legends, effort keys and contents lists. What remains in captions under this rule is the citation trail beneath §5's table and the lane-02 alternative plus the divide-by-1.18 mechanism beneath §9's — evidence, not argument. |
| RR-16 | minor | applied | The ceiling row's CHECK cell now leads with the constraint that actually changes — `billing_ceiling_cents integer NOT NULL CHECK (>= 0)` `00412:73` and its authority twin `00412:145` — and marks the terms-and-rates refusals as the separate relaxation they are. |
| RR-17 | nit | applied | P3: "**ten** literal seeding keys `00422:1754-1766`". Appendix A says "the ten Discovery seeding keys" and adds `create_furnishings_authorization_from_schedule 00422:370`. |
| RR-18 | nit | applied | M3's mock-cap and figcaption read "three **money shapes**". "Variant" now appears nowhere in a mockup, caption or figcaption — only in §4's tables and §5's column sketch, where it is the schema word for a schema thing. |
| RR-19 | nit | applied | `<!-- ==== 15 ==== -->` → `<!-- ==== appendix ==== -->`. |
| RR-20 | nit | applied | Both cites are `00408:24, :37-49, :129-143`, and §5's reader column cites `00408:135-143`. |
| RR-21 | nit | applied | M4's annotation and Appendix A both read `account-studio-page.tsx:811-823 — the card-fee label at :821, the check remit-to described in the help copy at :813`, so neither claims `:813` is the field. |
| RR-22 | nit | applied | `.sim` and `.num` joined the wrap-reset: `td .sim, th .sim, li .sim, p .sim, figcaption .sim, td .num, th .num, li .num, p .num, figcaption .num{white-space:normal;overflow-wrap:anywhere;}`. Only nested spans are affected — `<td class="num">` figure cells keep their `nowrap` and tabular alignment, so nothing moved (render gate still 63/63). |
| RR-23 | nit | declined, as ruled | `data-prose-total="900"` stays on `div.shell`; closing it means editing `source/check-prose.mjs`, which no round so far has been authorized to touch. The attribute's value equals the script's default, so the gate reports the intended cap either way. Carried forward for the round that touches the script. |

## Notes

- **No section cap was raised.** RR-15's promotions were paid for by trimming ledes; the
  clauses removed from prose (the prime being composed from the same parts, `board_templates`'
  scoping, lane 02's separate-fee alternative) moved into captions as citations and mechanism,
  which is where the stated convention puts them.
- **Nothing could not be closed.** RR-23 is a deliberate carry-forward with the same reason
  the previous two rounds gave; every other finding is applied or was closed by the layout lane
  and verified green here.
