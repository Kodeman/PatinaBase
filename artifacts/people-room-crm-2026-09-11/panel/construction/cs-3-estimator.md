# CS3 · Estimator / preconstruction seat

Seat: prices the job before award; runs sub bids, vendor quotes, allowances, lead times; keeps the sub list, the license list, and the "who actually answers" list. Lens: PR-1, studio-led design-build, Okonkwo fixture. Evidence paths are relative to the worktree `.codex/worktrees/agent-people-crm`.

My job in one line: before award, know who was asked, who answered, what it costs, how long it takes, and whether they are legal to pay. After award, keep that true through closeout.

---

## 1. What I track today and where

| Entity | Fields | Tool | Who maintains | How it goes stale |
|---|---|---|---|---|
| Bid list per scope | scope, sub firm, contact, invited date, bid due, declined / no bid / bid received, amount, alternates, exclusions, selected | bid module (Procore / Buildertrend) plus a spreadsheet that overrides it | estimator | the module holds only "sent / received"; declines and "never answered" live in my inbox, so coverage counts lie |
| Sub qualification | firm, trades, license no. + expiry, COI (GL / WC / auto) + expiry, W-9 date, bond, EMR, crew size, service radius | spreadsheet plus a shared drive folder of PDFs | office manager, me | PDFs expire silently; the spreadsheet says "yes" from 2025 |
| Firm contact map | owner / signer, office manager, dispatcher, estimator, foreman; who answers what; do-not-call | my head, then email signatures | me | a foreman leaves and texts bounce for a month |
| Vendor quote log | vendor, rep, item, quote no., price, valid-until, lead time (as quoted), freight, quote PDF | email folders plus a spreadsheet | me, designer | quote validity passes (30 days typical); rep changes; lead time quoted in August is wrong by October |
| Allowance schedule | line, allowance amount, selection status, who decides, actual, over / under | spreadsheet in the estimate | me, then PM | selection made by text to the designer never reaches the sheet |
| Lead-time board | item, PO date, promised date, source (rep, email date), risk | spreadsheet | PM | promise dates are re-quoted on the phone and not written down |
| Draw paperwork | sub, draw no., conditional waiver in, unconditional in, retainage held, COI current at draw | GC's accounting; studio bookkeeper's copy | GC office, Dale | studio copy lags the GC by a draw |
| Authority sheet | who signs what, thresholds, who is copied | contract exhibit, then memory | PM | it lives in the contract PDF; nobody re-reads it in month six |
| Inspection contacts | AHJ inspector, lender inspector, scheduling channel (311 portal, phone), hours | sticky note, GC's super | super | inspector reassigned by district; nobody tells the studio |

Every row above is a person or firm fact. Patina holds the firm as a name (`supabase/migrations/00417_studio_contacts.sql:76-80`) and the person as a party snapshot with phone and consent (`00281_field_parties.sql:48-61`). Of the fields above, only retainage and a yes/no on insurance exist (`00579_trade_agreements.sql:80-86`).

---

## 2. Contact-mode reality by role (Okonkwo fixture)

| F | Role | Opens an app? | Reads email same day? | Must be texted? | Needs a login to do the job? | Who else at the firm must be reachable | Never contact via |
|---|---|---|---|---|---|---|---|
| F-01 | Studio principal | yes | yes | no | yes | n/a | n/a |
| F-02 | Lead designer | yes | yes | yes (site day) | yes | n/a | n/a |
| F-03 | Bookkeeper, 2 days/wk | Tuesdays only | Tuesday | no | yes, invoices and draws only | n/a | text |
| F-04 | Homeowner, selections | daily, iOS | yes | no | yes | F-05 for money | n/a |
| F-05 | Homeowner, signs money | if invited | yes | phone over $2,500 | optional | F-04 for selections | text for approvals |
| F-06 | Key holder / receiver | no | never | yes | no | n/a | email |
| F-07 | GC owner | no | yes | no (texts only from Erin) | no | F-08 PM, F-09 super, GC office for lien waivers | text from the studio |
| F-08 | GC PM | weekly field link | yes | yes | no | F-07 for signatures | n/a |
| F-09 | GC super | no | no email | yes, plus calls | no | F-08 | email |
| F-10 | Architect | no | yes | never | no | firm's PM for submittal logs | text |
| F-11 | Electrical sub, owner-op | no | email dead | yes | no | none (one-man shop) | email |
| F-12 | Plumbing sub, owner | no | no | yes, but STOP on file | no | none | SMS until he replies START |
| F-13 | Cabinet install sub | no | yes | no cell for work | no | shop office line | text |
| F-14 | Drywall office manager | no | yes | no | no | F-15 signs only | n/a |
| F-15 | Drywall owner | no | do not use | no | no | F-14 for everything | phone, text, email |
| F-16 | Painter, has Patina account | yes (other studio) | yes | yes | has one already | none | n/a |
| F-17 | HVAC PM | no | yes | no | no | dispatch line for service calls | text |
| F-18 | Framing foreman | no | no email | yes | no | Cedar & Iron office for COI / waivers | email |
| F-19 | Radon sub | no | yes | no | no | none | text (not scheduled until 2027-02) |
| F-20 | Tile showroom rep | no | yes | no | no | showroom line, order desk | text |
| F-21 | Plumbing fixtures rep | no | yes | no | no | order desk | text |
| F-22 | Lighting rep | no | yes | stock checks only | no | inside sales | n/a |
| F-23 | Millwork maker | yes (maker portal) | yes | no | yes | shop install lead (COI pending) | n/a |
| F-24 | Stager | no | yes | yes, install week | no | crew lead | n/a |
| F-25 | Photographer | no | yes | no | no | none | text |
| F-26 | Lender's draw inspector | no | yes | never | no | bank construction loan desk | text |
| F-27 | AHJ inspector | no | yes | NEVER | no | 311 scheduling portal | text; personal cell |

Three counts that matter to me. Logins: 5 of 28 need one to do their job. Text-first: 8. Never-text: 7. The People room today models the first group well and the third group not at all (`current-state.md` §D last row: no do-not-contact anywhere).

---

## 3. Authority and decision rights

| Decision | May approve | Threshold | Must be copied | Who prepares |
|---|---|---|---|---|
| Studio fee change | F-01 Leah | any | F-05 | F-02 |
| Design intent / conformance | F-02 Priya, F-10 architect for structural | none | F-04 | F-02 |
| Selections and finishes | F-04 Adaeze | within allowance | F-02, F-08 | F-02 |
| Change order, cost | F-05 Chidi | over $2,500; F-04 under | F-01, F-07, F-08 | F-08 prices, F-02 reviews |
| Sub payment / sub CO | F-07 Tom (GC), F-15 Frank and F-17 Jim on their firm's side | firm rule | F-08 | F-08 |
| Draw release | F-26 Carol certifies, F-05 signs | per draw | F-03, F-07 | F-03 assembles, F-08 requests |
| Schedule slip | F-08 proposes, F-02 accepts, F-05 informed past 2 weeks | 2 weeks | F-04, F-05 | F-08 |
| Site access | F-09 Luis daily; F-06 Ngozi holds the key | n/a | F-02 | F-09 |
| Key handover | F-04 or F-05 to F-06; F-06 to F-09 by written note | n/a | F-02 | F-02 |
| Inspection pass / fail | F-27 Ray | n/a | F-08, F-02 | F-09 schedules |

What the CRM must record so a text from the wrong person is caught:

| # | Record | Fields | Proof |
|---|---|---|---|
| 1 | Authority grant on the party-on-job | kind (money / change_order / selections / schedule / site / key / inspection), threshold_cents, copy_to, granted_by, dated | F-04 vs F-05; F-07 vs F-08 |
| 2 | "Prepares, does not sign" flag | boolean on the grant | F-03, F-08 prepare money paper; neither approves |
| 3 | Contact rule per person | channels allowed / forbidden, route_via person | F-15 texts a $9,000 CO; it counts only when F-14 emails it |
| 4 | Composer and court read the grant | court vocab must include the grantee's kind | `client_decisions.court` admits no architect (`00281_field_parties.sql:167-171`); F-10 cannot hold a structural RFI |

---

## 4. Compliance and paperwork per party type

| Party type | Document | Required before | Expiry | Who chases | What it blocks |
|---|---|---|---|---|---|
| GC (F-07) | COI: GL, WC, auto, umbrella; studio named additional insured | contract execution | annual (F-07 exp 2027-03-31) | studio bookkeeper | first draw |
| GC | MN BC license no. | contract | 2 years, state | studio | contract |
| GC | W-9 | first payment | none (re-collect on entity change) | studio bookkeeper | payment |
| GC | conditional then unconditional lien waiver | each draw | per draw | F-03 from F-08 | next draw; final payment |
| Sub, licensed trade (F-11, F-12, F-17) | trade license + bond where MN requires | award | 1 to 2 years | GC office; studio copy | award; inspection sign-off |
| Sub, any (F-11..F-19) | COI naming GC and owner | site mobilization | annual (F-11 LAPSED 2026-03-31) | GC office | site access; sub payment; draw |
| Sub, any | W-9 | first payment | none | GC office | payment |
| Sub, any | lien waiver per draw, retainage 10% | each draw | per draw | GC office; F-03 copy | draw |
| Sub, any | sub tier: who they contract with | award | n/a | estimator | pay-when-paid math |
| Specialty (F-19 radon) | MDH radon license | award | annual | studio | slab work |
| Architect (F-10) | professional liability COI; MN AR license | agreement | annual | studio | stamped drawings |
| Maker (F-23) | W-9; install-day COI | PO; install day | install day | Orders book | install day site access |
| Vendor / showroom (F-20..F-22) | W-9 for 1099; resale certificate on file (studio's) | first PO | resale cert per state rule | studio bookkeeper | 1099 at year end |
| Stager (F-24), photographer (F-25) | COI; W-9 | site day | annual | studio | site day |
| Field crew (F-09) | OSHA 30 / 10 card | mobilization | none | GC | nothing in practice; matters after an incident |
| Lender inspector (F-26), AHJ (F-27) | none held by studio | n/a | n/a | n/a | n/a; they block us |

Today in Patina: `studio_contacts` carries zero compliance columns (`current-state.md` §B1 row 2; `00417_studio_contacts.sql:70-120`). The Trade Agreement carries `insurance_certificate_required boolean` with no certificate, no expiry, no file (`00579_trade_agreements.sql:84`). The only license check in the codebase is the studio's own (`00579:408`).

---

## 5. Lifecycle stages for a person or firm

| Stage | Trigger in | Trigger out | Contact mode | Access | What I need on the row |
|---|---|---|---|---|---|
| Prospect | added to the sub list or rolodex | invited to bid | email; office line | none | trades, license, service radius, "who answers" |
| Bidding | RFQ sent | bid, decline, or due date passes | email plus a phone follow-up two days before due | RFQ link | due date, asked-of person, scope snapshot, decline reason |
| Declined / no response | reply or silence past due | next job | none | none | reason (busy / too small / out of area); counts toward "reliable bidder" |
| Awarded | bid selected, agreement sent | agreement signed, COI in | email for paper; text for schedule | Trade Agreement link | signer at firm; COI, W-9, license verified |
| Active | mobilized | punch signed off | text-first for field, email for office | field link; SMS consent | consent, daily contact, office contact, tier |
| Closeout | substantial completion | final unconditional waiver, final payment | email | link expires | final waiver, retainage release, warranty terms |
| Warranty | closeout | warranty end date | email; phone for calls | none | warranty end date, callback contact |
| Repeat | picked from the rolodex | new job's Bidding | carries phone, contact rule, docs with expiry | new links | prior jobs, performance, docs still current? |

Today: `project_parties` has no stage; a party is on the job the moment it is inserted (`00212_project_parties.sql:27-43`). Bidding parties and active parties look identical on the Call Sheet.

---

## 6. Three failure stories

**The lapsed COI at draw four.** Repeat electrician, one-man shop, COI expired in March between two jobs. Nobody re-collected it; the spreadsheet cell still said "COI yes" from the prior job. Draw four went to the lender, the inspector pulled the sub list and asked for certificates. Draw held eleven days; the GC floated payroll; the studio argued interest with the client. Missing: an expiry date on the document, on the firm, visible in the picker the day the sub was brought forward. The fixture repeats it (F-11; fixture §4 Q3) and the rolodex card has no place for it.

**The change order nobody could approve.** Drywall owner texted the super a photo and "add $9,000 for level 5 over the stair, ok?" at 6:40 pm. Super replied "ok" meaning received. Firm proceeded. The firm's rule was "email Rosa, never call Frank"; ours was "Chidi signs over $2,500." Neither rule existed outside two heads. Work done, price disputed, split the difference. Missing: the firm's route-via contact, the client's threshold, and a place a text can be checked against a grant (F-14, F-15, F-05).

**The bid coverage that was not.** Nine trades in preconstruction; HVAC had "three bids out." Two firms declined by voicemail, one never answered. The module showed three sent, zero received; the schedule assumed award in week 6. Single coverage surfaced in week 8, award landed 14% over budget, and the client asked why we never went back to the second firm. Missing: declined and no-response as dated outcomes, a due date per ask, and the person at the firm who owed the answer. Patina's ledger holds quoted / selected / withdrawn only (`00423_trade_scope_instrument.sql:221-222`); the ask has no due date (`00424_trade_rfq_rail.sql:74-96`).

---

## 7. Findings

Written cold, before `current-state.md` §E. Tags at the end of each `proposed` cell were added after reading §E. Tally: 7 new (CS3-2, 6, 7, 8, 9, 19, 24) · 11 known · 6 touches.

| ID | P | confidence | claim | evidence | proposed |
|---|---|---|---|---|---|
| CS3-1 | P1 | high | No compliance document object exists: COI, W-9, license, bond, lien waiver have no table, no expiry, no file, no holder. | `00417_studio_contacts.sql:70-120` (zero compliance columns); `00579_trade_agreements.sql:84` (boolean only); F-11 | Add a `compliance_documents` object on the firm card: type, number, issuer, effective, expires, file, verified_by, verified_at; party rows, the picker, and the draw package derive "current / lapsed / missing" from it. known(G-14) |
| CS3-2 | P1 | high | The bid ledger cannot record declined-to-bid or no-response; status is quoted / selected / withdrawn only, and the ask is draft / sent / responded / closed. | `00423_trade_scope_instrument.sql:221-222`; `00424_trade_rfq_rail.sql:88-89` | Add `declined` (with reason) and `no_response` to the RFQ ask; coverage per scope reads asked / declined / no answer / quoted / selected. new |
| CS3-3 | P1 | high | A firm has no internal structure: signer, office, dispatch, field are unrelated party rows; "email Rosa, never call Frank" lives only in free-text notes. | F-14, F-15; `00417:82-87` (`contact_kind` TEXT no CHECK); `00417:76-80` (company card name only) | Person-at-firm role vocabulary (signer / office / dispatch / estimator / foreman / rep) and a route-via pointer from one person to another. touches(G-7): route-via is the contact half |
| CS3-4 | P1 | high | Authority is not a fact anywhere: who may approve money, change orders, selections, schedule, site, key, and at what threshold. | `00212_project_parties.sql:27-43`; `00281_field_parties.sql:48-61` (no authority columns); F-04, F-05, F-07, F-08 | Authority grants on the party-on-job: kind, threshold_cents, copy_to, granted_by, dated; the composer and court read them. known(G-15) |
| CS3-5 | P2 | high | Vendor reps are not people; three TEXT columns on a per-designer account row, invisible in the room. | `00009_vendor_management.sql:69-71`; F-20, F-21, F-22; `fixture.md` §3 vendors row | Rep = person card at the vendor firm in the rolodex, with channel, coverage (showroom / territory / inside sales), and the quotes they issued. known(G-19) |
| CS3-6 | P2 | high | Lead time is one JSON blob per vendor, not a commitment per item with a promised date and who said it. | `00009:28`; F-20, F-23 | Lead-time commitment per PO line or selection: quoted_weeks, promised_date, quoted_by (person), quoted_at, source (email / phone). Orders book owns it; the People room shows the person behind it. new |
| CS3-7 | P2 | high | A quote or bid has no validity date and no quoting person; amount and note only. | `00423:213-230`; F-20 | `valid_until` and `quoted_by` (person) on every bid and vendor quote; expired quotes read as expired. new |
| CS3-8 | P2 | high | The RFQ ask has no due date; `timeline` is free text; nobody owes a number by a date. | `00424_trade_rfq_rail.sql:74-96` (no `due_at`) | `due_at` on the ask; the Call Sheet shows who owes a bid and when it is late. new |
| CS3-9 | P2 | med | A firm must already be a project party to be asked to bid, so every losing bidder sits on the Call Sheet as if on the job. | `00424:77` (party_id NOT NULL to project_parties); `00423:218` | Engagement stage on the party-on-job: invited_to_bid / bidding / declined / awarded / active / closed; the sheet groups by stage. new |
| CS3-10 | P2 | high | Out-of-vocab residential trades (radon, insulation, waterproofing, abatement, excavation, septic, gas / fireplace, elevator) fall to free text or `other`, and `other` opens nothing. | `packages/types/src/field-config.ts:18-41` (23 values); F-19 | Widen `FieldTrade` to the residential list; keep `other` as a typed value with a label the profile opens on. known(G-13) |
| CS3-11 | P2 | high | No `PartyKind` for AHJ inspector, lender / draw inspector, structural engineer, surveyor, utility; all land in `other`. | `field-config.ts:110-121`; F-26, F-27 | Add `inspector`, `lender`, `engineer` kinds with a default never-text contact rule. known(G-13) |
| CS3-12 | P2 | high | No do-not-text / email-only / never-contact rule on any party, contact, or vendor; the one `preferred_contact` column is on clients and unread. | `00062_client_management_v2.sql:20`; `current-state.md` §D last row; F-10, F-13, F-15, F-27 | `contact_rule` on the person: channels_allowed, channels_forbidden, route_via, reason, set_by; the composer and every send gate read it. known(G-7) |
| CS3-13 | P2 | high | Bring-forward carries phone and consent but no documents; a COI that lapsed between jobs is raised nowhere. | F-11; `fixture.md` §4 Q3; `00418_studio_contacts_backfill.sql:40-52` (fold keys) | AMENDMENT-ASK: (AA-1, PD-3) documents live on the firm card (CS3-1) and the engagement reads them live; the picker reads "COI lapsed 2026-03-31" on the mini row before the party is created. touches(G-4): bring-forward path of G-14 |
| CS3-14 | P2 | high | A phone-global STOP is invisible on a new party row: the chip reads Not asked while the gate refuses. | F-12; `supabase/functions/sms-inbound/pipeline.ts:159-164`; `_shared/sms.ts:174-185` | Display consent derived from the phone-level reduction; the new row reads "Opted out 2025-12-03 (Lindqvist)" at creation and names who is told. known(G-3) |
| CS3-15 | P2 | med | One human is N rows; the head count and the GC chip count Tom twice; no per-person or per-firm history survives across jobs. | `current-state.md` §B2; `00589:824-860`; `people-room.tsx:383` | AMENDMENT-ASK: (AA-1, PD-3) identity = the rolodex card; party rows are engagements under it; the room lists a person once with N engagements and a firm once with N people. known(G-1) |
| CS3-16 | P2 | med | Removing a party is a hard delete; bid, consent, and waiver lineage die with it, and `trade_scope_bids` RESTRICT will refuse the delete for any bidder. | `packages/supabase/src/hooks/use-coordination.ts:808-816`; `00423:218`; `docs/design/studio-rosters/README.md` follow-up 4 | Soft-close the engagement (stage closed / removed, reason, dated); never delete a party that has a bid, a consent record, or a waiver. known(G-10) |
| CS3-17 | P2 | med | The Trade Agreement holds retainage and a lien-waiver policy but no per-draw waiver ledger (conditional / unconditional, draw no., amount, received). | `00579_trade_agreements.sql:80-86`; `fixture.md` §1.3 | Lien waiver = compliance document type with draw_no and amount_cents; a missing waiver reads on the firm's row before the next draw package. touches(G-14): per-draw ledger, not policy |
| CS3-18 | P3 | med | The agreement checks the studio's own license attestation and never asks for the trade's license. | `00579:408`; `00579:84` | License no. + expiry on the firm card; sending an agreement to a licensed trade (electrical, plumbing, HVAC, GC) warns when missing. touches(G-14): trade license expiry |
| CS3-19 | P2 | med | Sub tier does not exist: no "contracts with" relation, so a sub's sub and pay-when-paid chains cannot be recorded. | `00212:27-43` (no parent party); F-17, F-18 | `contracts_with` on the engagement: studio / GC party id / sub party id. new |
| CS3-20 | P3 | low | A 90-day field link minted at kickoff is dead by the time a February sub or an August stager arrives. | `00283_field_links.sql:26-33`; F-19, F-24 | Tie link minting to the engagement window (scheduled_from / scheduled_to); mint at 30 days out. touches(G-20): expiry vs engagement window |
| CS3-21 | P3 | med | The household's decision split (F-04 selections, F-05 money over $2,500) cannot be recorded on one `designer_clients` row. | F-04, F-05; `fixture.md` §2 note on F-05 | Chidi as a `client_rep` party carrying a money authority grant (CS3-4); one household record, two deciders. touches(G-15): household half |
| CS3-22 | P3 | low | The bookkeeper has no per-surface permission; Dale sees everything or nothing. | `00021_user_management_foundation.sql:132-146` (role only); `fixture.md` §3 studio row | Out of the People room's scope; note for the access-tier owner. known(G-22) |
| CS3-23 | P3 | low | Firm kinds are UI-only labels (gc, workroom, showroom, vendor, supplier); no architect, engineer, lender, agency, sub firm. | `apps/designer-portal/src/components/document/people/directory/company-row.tsx:34-40` | Firm kind vocabulary in code, including `sub`, `architect`, `engineer`, `lender`, `agency`, `maker`. known(G-12) |
| CS3-24 | P3 | med | Allowances have no object; a trade's price maps to SOV lines but nobody can see which person decides an allowance and whether it is spent. | `00579:93` (`sov_line_ids`); `fixture.md` §1.6 | Allowance line with decider (party) and status; the People room shows "decides 3 allowances, 1 open" on the client row. new |

---

## 8. Ranked top 5 things Patina must track that it does not today

| # | Fact | Object | Proof |
|---|---|---|---|
| 1 | Compliance documents with expiry: COI, W-9, license, bond, lien waiver per draw | firm | F-11: COI lapsed 2026-03-31; nothing in Patina knows |
| 2 | Authority grants with thresholds: money / change order / selections / schedule / site / key, plus "prepares, does not sign" | party-on-job | F-05 signs over $2,500, F-04 decides finishes; F-08 prepares what F-07 signs |
| 3 | Contact rule per person: never text / email only / do not contact / route via | person | F-15 do not contact; F-27 never texted; F-13 no work cell |
| 4 | Bid coverage per scope: asked / declined / no response / quoted / selected, each dated, with a due date and the person who owes the answer | party-on-job, bidding stage | F-17 prices the sub side; F-11..F-19 hold no record of who else was asked |
| 5 | Person-at-firm role and one identity: signer / office / dispatch / rep; one card, N engagements | person, firm | F-14 / F-15 unrelated rows; F-20 rep is three TEXT columns; `current-state.md` §B2 one human = 13 rows |

---

## 9. AMENDMENT-ASK items

Each ask is written in full. Each carries the compliant version the panel can take if the ask is refused.

| ID | Touches | Ask, in full | Why | Compliant version |
|---|---|---|---|---|
| AA-1 | PD-3 (party rows snapshot; `studio_contact_id` is lineage, not a join) | Let the engagement read compliance documents and contact rules LIVE from the firm and person cards. Name, phone, and trade stay snapshotted as PD-3 intends. | A COI expires once, for the firm, on every job at the same instant. A do-not-text rule belongs to the person, not the job. A snapshot of either is wrong the day after it is taken. | Copy expiry dates and contact rule onto the party row at creation and re-copy on each open; accept that a mid-job lapse is caught late. |
| AA-2 | PD-4 (taxonomy code-resident) | A studio-editable extension list for trades and firm kinds, layered over a code-resident base. | The residential trade list moves by region (radon in Minnesota, seismic in California, termite in Texas) faster than a release cycle. | Widen `FieldTrade` in code now (CS3-10); revisit when a second region onboards. |
| AA-3 | S2 / PR-3 (studio is the customer; no trade portal) | A tokened upload page for the sub's office manager, on the `fulfillment_evidence_upload_tokens` shape (`00364_fulfillment_exceptions.sql:55-64`), where F-14 drops a fresh COI PDF and the expiry is read from it. | Chasing a certificate is the sub's office job, not the studio's. The page's primary user is a trade, so it is a side journey. | The studio uploads the PDF it receives by email; Patina drafts the chase email and it lands `awaiting_review`. |
| AA-4 | PR-1 lens (GC works under the studio's direction) | A `held_by` field (studio / GC firm) on each compliance document, with no GC-facing surface. | In studio-led design-build the GC's office holds the subs' COIs and waivers; the studio holds copies for the draw package. Naming the GC as holder makes its back office a half-user. | The studio records only documents it holds a copy of. |

---

## 10. What would change my mind

| # | Evidence or specimen | Effect |
|---|---|---|
| 1 | A Strata read showing fewer than one in five active studio projects carries more than one sub party | CS3-2, CS3-8, CS3-9 drop to P2; the bid rail matters only where the studio runs subs |
| 2 | A ruling that draw packages and lien waivers live entirely in the GC's software and the studio never assembles one | CS3-17 drops to P3; CS3-1 narrows to COI and W-9 |
| 3 | Evidence that Leah's studio routes every trade contact through the GC's PM (F-08) | CS3-3 and CS3-12 drop to P2; one contact rule on one person covers the job |
| 4 | A specimen where the composer already refuses a text to a party marked never-text | CS3-12 closes as known |
| 5 | Proof that `vendors.lead_times` is read per item anywhere in the Orders book | CS3-6 softens to a People-room display finding |

---

## 11. Entities a construction CRM must hold (this seat's list)

| Entity | Belongs to | Minimum fields | Fixture proof |
|---|---|---|---|
| Person | studio rolodex | name, phones, emails, contact rule, role at firm | F-14, F-15 |
| Firm | studio rolodex | name, kind, trades, licenses, docs, signer | F-07, F-14 |
| Person-at-firm role | person x firm | signer / office / dispatch / estimator / foreman / rep; route_via | F-14 → F-15 |
| Engagement (party-on-job) | project | kind, trade, stage, contracts_with, consent, links, show_to_client | F-11, F-18 |
| Contact rule | person | channels allowed / forbidden, reason, set_by, dated | F-10, F-27 |
| Authority grant | engagement | kind, threshold_cents, copy_to, granted_by | F-04, F-05 |
| Compliance document | firm (or person for cards) | type, number, issuer, effective, expires, file, verified_by, held_by | F-11 |
| Lien waiver | firm x draw | conditional / unconditional, draw_no, amount, received | fixture §1.3 |
| Bid ask (RFQ) | scope x engagement | sent, due_at, asked_of person, outcome (declined / no_response / quoted) | fixture §6 story 3 |
| Bid / quote | scope x engagement | amount, valid_until, quoted_by, alternates, exclusions, selected | F-17 |
| Lead-time commitment | PO line x person | quoted_weeks, promised_date, quoted_by, quoted_at | F-20, F-23 |
| Allowance line | project | amount, decider (engagement), status, actual | fixture §1.6 |
| Engagement stage history | engagement | stage, entered_at, by, reason | F-28 (closed party) |

---

## 12. Bring-forward answers (fixture §4)

| Q | Answer |
|---|---|
| 1 | Travels: phone, email, contact rule, consent (phone-level, with its date and source job), firm documents with expiry, prior jobs list, decline / no-response history, on-time performance flag. Does not travel: 2025 amounts, 2025 scope notes, 2025 project threads. Prices are a scope fact, not a person fact. |
| 2 | The Okonkwo row reads "Opted out by text 2025-12-03 (Lindqvist). Only Pete can rejoin by replying START." Priya is told at pick time in the picker mini row; Erin (GC PM) is told nothing by Patina; Priya tells her. |
| 3 | On the firm card first (it is the firm's certificate), echoed on the party row's unfold and on the picker mini row. The draw package reads the same fact; it is never re-keyed there. |
| 4 | One vendor, one firm card, one rep person (Claire), two "saved by" lines (Leah 2025, Priya 2026). The studio view is the firm with its rep and both jobs; the duplicate `saved_vendors` rows are lineage, not two vendors. |
| 5 | On the person. Ingrid never texts for work; that is true on every job and at every firm she works through. The firm's rule ("call the shop line") is a firm fact; the person's rule wins when they conflict. |
| 6 | Yes, in the picker, under a history line "GC · Lindqvist kitchen 2025 · closed 2025-11". A studio that ran two design-build jobs with Ostrom wants him one search away for the third. His consent and docs travel; the Lindqvist field link does not. |
