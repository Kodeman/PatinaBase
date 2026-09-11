# CS4. Trade subcontractor owner seat

Seat: owner of a 5-person electrical shop. Work comes by text and phone. My office manager (my spouse) reads email at night and handles COI, W-9, invoices, lien waivers. I will not install an app for one GC or one designer. I have eaten change-order money by taking a "go ahead" from the wrong person at the client.

Read: the common brief, the fixture, `briefing/current-state.md` §A–§D, `briefing/shots/strings-today.md`. Paths are relative to the worktree. `CS` = current-state.md.

---

## 1. What I track today and where

| Entity | Fields | Tool | Who maintains | How it goes stale |
|---|---|---|---|---|
| Job | address, GC, designer, start, rough-in date, trim date, my contract number | phone notes, whiteboard in the shop | me | dates slip by text and never get written down |
| Who I take orders from | name, cell, "can they approve money" (yes/no, in my head) | phone contacts | me | I learn the answer after a dispute |
| GC firm | office number, PM cell, super cell, AP email, pay-app due day, retainage % | phone contacts + a sticky note | me, spouse for AP | PM changes mid-job; nobody tells me |
| Designer / studio | designer cell, principal email, who signs fee-side COs | phone contacts | me | I only have the one designer I met at kickoff |
| Client | the person who answered the door; sometimes a cell | phone contacts | me | the other spouse turns out to be the one who pays |
| My paperwork | COI (GL, WC, auto) exp dates, W-9, MN license #, bond | spouse's laptop, agent's portal | spouse | COI renews 3/31; nobody asks until a pay app bounces |
| Paperwork I owe per job | conditional / unconditional waiver per draw, pay app, invoice | spouse's laptop, QuickBooks | spouse | GC's draw calendar is not in my calendar |
| Inspections | rough, final; inspector name; 311 confirmation # | text from the super | super, then me | I hear about a failed inspection from the drywaller |
| Site access | who has the key, gate code, alarm code, dog | text thread | whoever told me | code changes; the thread is buried |
| My crew | 4 names, cells, who is licensed, OSHA cards | phone contacts | me | the GC super asks who is coming and I say "two guys" |
| Warranty | job, close date, one-year date | nowhere | nobody | a call comes 8 months later from a number I deleted |

---

## 2. Contact-mode reality by role (Okonkwo fixture)

| Row | Role | Opens an app? | Reads email same day? | Must be texted? | Needs a login to do the job? | Who else at their firm must be reachable | Never contact via |
|---|---|---|---|---|---|---|---|
| F-01 | studio principal | yes | yes | no | yes | office / bookkeeper F-03 | n/a |
| F-02 | lead designer | yes | yes | yes for site questions | yes | principal for fee COs | n/a |
| F-03 | bookkeeper | Tuesdays only | Tuesdays | no | yes | n/a | text |
| F-04 | homeowner, selections | yes (iOS) | yes | no | yes | spouse F-05 for money | n/a |
| F-05 | homeowner, money | maybe | yes | phone over $2,500 | not to approve by email | spouse F-04 | text for approvals |
| F-06 | key holder | no | never | yes | no | Adaeze | email |
| F-07 | GC owner | no | yes | no; texts only from Erin | no | PM F-08, AP / office | text from a sub |
| F-08 | GC PM | weekly link | yes | yes | no | owner F-07, super F-09 | n/a |
| F-09 | GC super | no | no | yes | no | PM F-08 | email |
| F-10 | architect | no | yes | never | no | office | text |
| F-11 | electrical sub (me) | no | no (dead address) | yes | no | office manager (spouse) for paperwork | email for anything urgent |
| F-12 | plumbing sub | no | no | yes, but opted out | no | office | SMS via Patina (STOP on file) |
| F-13 | cabinet sub | no | yes | no (no work cell) | no | shop line | text |
| F-14 | drywall office manager | no | yes | no | no | she is the one | text |
| F-15 | drywall owner | no | no | no | no | Rosa F-14 | any direct contact |
| F-16 | painter | yes (has account) | yes | yes | no | n/a | n/a |
| F-17 | HVAC PM | no | yes | no | no | dispatch line | text |
| F-18 | framing foreman | no | no | yes (pending YES) | no | company office | email |
| F-19 | radon sub | no | yes | no | no | n/a | text |
| F-20..22 | showroom / supply reps | no | yes | stock checks only (F-22) | no | showroom line | text for orders |
| F-23 | maker | yes (maker portal) | yes | no | yes for POs | shop | n/a |
| F-24 | stager | no | yes | yes install week | no | n/a | n/a |
| F-25 | photographer | no | yes | no | no | n/a | text |
| F-26 | draw inspector | no | yes | never | no | bank loan admin | text |
| F-27 | AHJ inspector | no | yes | NEVER | no | 311 portal | text, personal cell |

Read across: 5 of 28 will open an app. 11 must be texted. 6 must never be texted. The room today serves the 5 and the 11 and has no word for the 6 (`CS:236`).

---

## 3. Authority and decision rights

| Decision | May approve | Must be copied | What the record must hold so a text from the wrong person is caught |
|---|---|---|---|
| Money: invoice, draw, sub payment | F-05 Chidi (owner), F-07 Tom (sub side), F-01 Leah (fee side), F-26 Carol (releases draw) | F-03 Dale, F-08 Erin | per person on the job: `approves: money`, with a dollar ceiling; the approver's phone and email so an inbound text is matched to an approver, not just to a phone |
| Change order over $2,500 | F-05 Chidi | F-04, F-02, F-08 | CO threshold on the job; approval attributed to a named party with CO authority; a "go ahead" from F-04 over $2,500 is flagged |
| Change order under $2,500 / selections | F-04 Adaeze, F-02 Priya (design intent) | F-05, F-08 | same field, lower ceiling |
| Design conformance / RFI answer | F-10 Sam, F-02 Priya | F-08 | court includes architect (today it does not: `supabase/migrations/00281_field_parties.sql:167-171`) |
| Schedule slip | F-08 Erin proposes, F-07 Tom commits, F-02 Priya accepts | F-04, F-05, F-09 | who may move a date, and who is told |
| Site access, daily | F-09 Luis controls; F-06 Ngozi opens the door | F-08 | `site_access: controls` vs `site_access: key` on the party |
| Key handover, codes | F-06 Ngozi, F-04 Adaeze | F-09, F-02 | key holder as a fact, not a note |
| Inspection pass / fail | F-27 Ray | F-09, F-08, F-02 | inspector kind; never-text; result attributed |

From experience: an approval counts only when it comes from a person whose row says they can give it, on a channel that person uses. A text from Adaeze approving a $4,000 panel upgrade is not an approval. Patina should hold both facts and show the studio the mismatch before I pull wire.

---

## 4. Compliance and paperwork per party type

| Party type | Document | Required before | Expiry | Who chases | What it blocks |
|---|---|---|---|---|---|
| GC (F-07) | GL / WC / auto COI naming owner and studio | contract signing | annual (F-07: 2027-03-31) | studio bookkeeper F-03 | draw release |
| GC | MN BC license, W-9 | contract | license annual; W-9 on change | F-03 | first payment |
| GC | conditional then unconditional lien waiver, per draw | each draw | per draw | F-03, lender F-26 | draw release |
| First-tier sub (F-11..F-19) | COI (GL, WC, auto), often additional-insured endorsement | mobilization | annual (F-11: LAPSED 2026-03-31) | GC office (via F-08) or studio if direct | site access in theory; pay app in practice |
| Sub | trade license (MN electrical, plumbing, MDH radon) | permit pull | 1 to 2 years | GC | permit and inspection |
| Sub | W-9 | first invoice | on change | GC AP or F-03 | first check |
| Sub | lien waiver per draw (conditional, then unconditional) | each pay app | per draw | GC AP, F-03 assembles | my check; the owner's draw |
| Sub | OSHA cards, crew list | mobilization | per card | GC super F-09 | site access |
| Vendor / showroom (F-20..F-22) | W-9, resale cert | first order | on change | F-03 | 1099 accuracy |
| Maker on Patina (F-23) | W-9; COI for install day | install day | per event | studio | install day access |
| Stager (F-24) | COI, W-9 | install week | per event | studio | site access |
| Architect (F-10) | professional liability COI, AR license | agreement | annual | studio | nothing operational; the owner's lender asks |
| Inspectors (F-26, F-27) | none | n/a | n/a | n/a | they block everyone else |

Words that exist today: one boolean, `insurance_certificate_required`, and one policy string, `lien_waiver_policy`, on the studio's Trade Agreement (`supabase/migrations/00579_trade_agreements.sql:86-89`). No document, expiry, or file at the firm level (`supabase/migrations/00417_studio_contacts.sql:70-121`).

---

## 5. Lifecycle stages for a person or firm

| Stage | What triggers it | Contact mode | Access | What changes on the record |
|---|---|---|---|---|
| Prospect | studio or GC hears of the firm | email to office, phone | none | firm card exists; person card may not |
| Bid | plans sent, RFQ out | email to the estimator; text to owner for site walk | plan transmittal link, RFQ link (`CS:212-214`) | trade, scope, estimator named |
| Awarded | subcontract or Trade Agreement signed | text to owner and PM; email to office for paperwork | Trade Agreement link (`CS:213`) | contracted_through set; COI / W-9 / license chased; retainage and waiver policy fixed |
| Active | mobilized | text daily (super, PM, designer); phone for anything over the threshold | field link, site request loop | crew list, site access, consent, approvers visible |
| Closeout | punch and final inspection | text for punch; email for unconditional waiver | field link still live | final waiver, retainage release date |
| Warranty | substantial completion + 1 year | phone or text, rare | field link dead after 90 days (`CS:211`) | warranty end date; reach must survive |
| Repeat | next job with the same studio | pick from rolodex | new field link | bring forward: phone, consent, docs, history; not pricing |

---

## 6. Three failure stories

**The wrong approver.** Whole-house remodel, two winters ago. The wife ran finishes and was on site daily. She said "yes, do the under-cabinet lighting, both runs." $3,800. The husband paid the bills and had a "nothing over $2,000 without me" rule nobody wrote down for the subs. He refused the CO. The GC split it with me; I ate $1,900. Missing data: which household member approves money, the ceiling, and that her approvals were selections only. F-04 and F-05 is the same house.

**The lapsed COI that stopped the draw.** My GL renewed March 31. My agent emailed the new cert to my dead address. The GC's April pay app went to the lender's inspector with the old cert. The draw sat eleven days; three subs went unpaid; the framer walked for a week. Missing data: my COI expiry on my firm's record, my office manager as the paperwork contact, and a warning before the draw package was built. F-11 is me.

**STOP on the last job.** After a 2024 kitchen closed, the studio kept texting "how did we do" surveys. I replied STOP. Eight months later the same studio put me on a new job. Their system said "Not asked." The designer thought she had texted me the rough-in date. Nothing arrived. I showed up a day late; the drywaller was already hanging. Missing data: the phone-level opt-out shown on the new row the day it was created, and a prompt to reach me another way. F-12 is that story.

---

## 7. Findings

Drafted cold; §E marks appended.

| ID | P | confidence | claim | evidence | proposed |
|---|---|---|---|---|---|
| CS4-1 | P1 | high | No firm-level compliance record exists: COI, W-9, license, bond have no type, number, expiry, file, or verifier anywhere; the only insurance word is a boolean on the studio's Trade Agreement. | `supabase/migrations/00579_trade_agreements.sql:86-89`; `supabase/migrations/00417_studio_contacts.sql:70-121`; F-11 | Add a compliance-document object on the rolodex company card: doc_type, number, issuer, expires_at, file, verified_by, verified_at; party rows and the draw package read it; the Call Sheet shows a lapse in words. known(G-14) |
| CS4-2 | P1 | high | A person's role at their firm (owner / signer / office / dispatcher / PM / foreman) is not a fact; "email Rosa, never call Frank" is two unrelated party rows. | F-14, F-15; `CS:150` (contact_kind TEXT, no CHECK, no role-at-firm) | Add role_at_firm vocab on the person card plus a do_not_contact flag with reason; the firm card names its paperwork contact and its site contact. touches(G-7): adds role-at-firm |
| CS4-3 | P1 | high | Authority is not recorded for anyone: who approves money, at what ceiling, who approves COs, selections, site access, key. The second homeowner has no row unless invited. | F-04, F-05, F-06; `CS:155` (designer_clients one row keyed to one login); `CS:151` (project_parties has no authority column) | Add an authority set on party-on-job: money (ceiling), change_order (ceiling), selections, schedule, site_access, key; project carries the CO threshold; Chidi enters as a `client_rep` party carrying money authority, not a second invite. known(G-15) |
| CS4-4 | P1 | high | An inbound text approving a change is matched to a phone, never to an approver; the studio cannot see that a "go ahead" came from someone without CO authority. | `CS:230` (inbound routed by phone_e164); `supabase/functions/_shared/sms.ts:194-215`; experience §6 story 1 | When a text is filed as a decision or CO approval, attribute it to the party and check authority; show "approved by Adaeze, who holds selections only" on the decision. touches(G-15): inbound text attribution |
| CS4-5 | P2 | high | Reach preference and a hard never-text rule have no home on parties, rolodex cards, or vendors; only `designer_clients.preferred_contact` exists and the room ignores it. | `CS:236`; F-10, F-13, F-26, F-27 | Add reach_preference (text / email / phone / office) and never_text on the person card; the party row inherits; the composer refuses on never_text before it checks consent. known(G-7) |
| CS4-6 | P2 | high | A phone-level STOP is invisible on a later party row: the chip reads "Not asked" while the send gate refuses. | F-12; `supabase/functions/_shared/sms.ts:174-185`; fixture §4 | Derive the displayed consent from the phone-level reduce; at party creation on an opted-out phone, say "Opted out 2025-12-03 on Lindqvist; reach them another way." known(G-3) |
| CS4-7 | P2 | high | One untyped phone per row: office lines and dispatch lines are offered "Invite to texts" the same as a cell. | `party-profile-sheet.tsx:887-893` (via strings-today.md); F-13, F-14, F-17 | Type the phone (mobile / office / dispatch); offer the SMS invite only for mobile; office lines print on the Call Sheet as "office". new |
| CS4-8 | P2 | med | The person who handles a firm's paperwork (office manager, AP) is not a fact, so COI and waiver chasing goes to the tradesperson's cell or a dead email. | F-11 (dead email), F-14; `CS:150` | Firm card names a paperwork contact (a person card with role_at_firm = office); document chases go there by email. touches(G-7): names the paperwork contact |
| CS4-9 | P2 | high | Lien waivers per draw have no record; only a policy string exists on the agreement. The bookkeeper assembles draw packages with nothing to read. | `supabase/migrations/00579_trade_agreements.sql:89`; F-03, F-26 | Add a per-draw waiver ledger keyed to firm and draw number: type (conditional / unconditional), amount, received_at, file. known(G-14) |
| CS4-10 | P2 | med | Trades outside the 23-value list (radon, insulation, excavation, generator, fire alarm, solar) land in `other` and an `other` party never opens a profile. | `packages/types/src/field-config.ts:18-41`; F-19 | Keep the curated list, allow a free-text trade, and let every party kind open the same profile. known(G-13) |
| CS4-11 | P2 | high | Inspectors (AHJ, lender draw inspector) have no kind, land in `other`, and carry no never-text rule; the AHJ must never be texted and the draw inspector releases money. | F-26, F-27; `packages/types/src/field-config.ts:110-121` | Add PartyKind `inspector` with subtype (ahj / lender / third_party), never_text on by default, and authority `certifies_draw` or `inspection_result`. known(G-13) |
| CS4-12 | P2 | med | One human is many rows; a phone change on one party row revokes consent there and leaves the other rows on the old number. | `CS:174-192`; `party-profile-sheet.tsx:581` (via strings-today.md) | Phone, typed phones, consent, and never_text live on the person card; party rows reference it; a change propagates. known(G-1) |
| CS4-13 | P2 | med | Field links die at 90 days and are never re-minted; a repeat sub gets a new link on a new job with nobody sending it. | `CS:211`; fixture §4 field links | When a party is added from the rolodex, mint the link and send it on the person's preferred channel; keep it live while the stage is active or warranty. known(G-20) |
| CS4-14 | P3 | med | A sub's crew (my four electricians) has no place; the super cannot see who is coming on site or who holds a license. | F-09, F-11; `CS:151` (one person per party row) | Firm card carries a crew list (name, role, license yes/no) without individual contact rails; the Call Sheet reads "Northgate Electric: Dana + 3." new |
| CS4-15 | P2 | med | Relationship stage (prospect / bid / awarded / active / closeout / warranty) is not tracked; a sub's status dot derives from SMS consent. | `CS:137` (deriveStatusDot for sub/installer/receiver by consent) | Add stage on party-on-job, independent of reach and consent; drive contact rules from stage. new |
| CS4-16 | P2 | high | Picking a repeat sub from the rolodex brings forward name and phone but not COI expiry, consent state, or last-job outcome; 2025 pricing and notes would travel if anything did. | fixture §4 Q1; `CS:150` (studio_contacts: notes, no history) | Rolodex card carries firm docs and history lines (job, dates, role, on-time, back-charges) that travel; pricing and project notes stay on the old job. touches(G-24): history facts, not a count |
| CS4-17 | P2 | med | Warranty is a stage with no record; the closed party's link expired months before the warranty ended. | F-28; fixture §4 (warranty through 2026-11-21, link expired 2026-02) | Party-on-job carries warranty_until; reach stays live through it; the rolodex card shows "under warranty on Lindqvist until 2026-11." touches(G-20): warranty outlives link |
| CS4-18 | P3 | low | Consent evidence is free text; the kickoff form it names cannot be attached. | `add-person-sheet.tsx:964-969` (via strings-today.md) | Allow a file on the consent record. new |
| CS4-19 | P2 | med | Only `show_to_client` exists; nothing shows a trade the subset of the Call Sheet a trade needs (super, key holder, approvers, inspection dates). | `CS:207`; F-06, F-09 | The field link view carries a site card drawn from the Call Sheet: who lets you in, who approves what, who to text for the schedule. Document first; the field link is an existing trade surface. new |
| CS4-20 | P2 | high | Site access and key holding are not facts; "key holder" on Ngozi cannot be recorded. | F-06; fixture §3 receiver row | Authority set includes site_access (controls / key / escorted); Call Sheet shows who lets trades in. known(G-15) |
| CS4-21 | P3 | med | The room head count counts party rows, not humans; a GC on two jobs is two people. | `CS:187`; `people-room.tsx:383` | Count humans by person card, or drop the count. known(G-9) |
| CS4-22 | P2 | med | "Releases the draw" and "passes the inspection" are money and schedule authorities held by people who are not clients, GCs, or subs. | F-26, F-27; `supabase/migrations/00281_field_parties.sql:167-171` (court excludes them) | Authority verbs include certifies_draw and inspection_result; the court vocabulary admits inspector and architect. touches(G-15): adds inspector verbs |
| CS4-23 | P3 | med | Retainage is a rate on the agreement, never a running balance per firm; my office asks what is held every month. | `supabase/migrations/00579_trade_agreements.sql:81-82`; F-07 | Per-firm retainage held and release date on the studio's draw ledger; the figure the sub sees is an AMENDMENT-ASK (§9). touches(G-14): balance, not policy |
| CS4-24 | P2 | high | Who holds a trade's paper (studio direct vs. through the GC) is not a fact; it decides who chases COI, who receives waivers, and who may text about money. | F-07 (GC signs subcontracts); `CS:151`; `00579:63-64` (studio-side only) | Add contracted_through (studio / gc / owner) on party-on-job; chases and money texts route accordingly. new |
| CS4-25 | P3 | med | No Directory chip for architect, photographer, stager, or an inspector; deep links resolve 8 of 12 roles. | `CS:24`, `CS:59` | Every kind on the Call Sheet gets a Directory home. touches(G-17): chips for named kinds |

---

## 8. Ranked top 5 things Patina must track that it does not today

1. Compliance documents with expiry on the firm: COI (GL, WC, auto), W-9, license, bond. Object: firm. Proof: F-11 (COI lapsed 2026-03-31, nothing knows).
2. Authority per person on the job: money with a ceiling, change order with a ceiling, selections, schedule, site access, key. Object: party-on-job. Proof: F-05 (Chidi signs money over $2,500) and F-06 (key holder).
3. Role at the firm, do-not-contact, and the firm's paperwork contact. Object: person and firm. Proof: F-14 / F-15 (email Rosa, never call Frank).
4. Reach preference and a hard never-text rule, with typed phones, separate from SMS consent. Object: person. Proof: F-27 (AHJ never texted), F-13 (office line only), F-12 (phone-level STOP shown as Not asked).
5. Who holds the trade's paper and the per-draw lien waiver ledger. Object: party-on-job and firm. Proof: F-07 (GC signs subcontracts) and F-03 (bookkeeper assembles draw packages from nothing).

---

## 9. AMENDMENT-ASK items

**AA-1. A paperwork page on the trade's field link.** Outside the frame because the primary user is the sub, not the studio (PR-3). The ask: on the existing field link, a trade uploads its COI, W-9, and license, signs the conditional and unconditional waiver for the current draw, and reads its retainage held and release date. Why: the bookkeeper chases nine firms by email every draw; six of those owners do not read email; the office managers who do are on no row. One link the office manager opens removes the chase. No login, no app. Compliant version: the studio records documents on the firm card (CS4-1) and chases by email to the firm's paperwork contact (CS4-8); the sub sees nothing.

**AA-2. Second-tier subs under a first-tier sub.** Outside the frame because the relationship is sub-to-sub. The ask: a party-on-job may name another sub as the party it contracts through (my low-voltage guy under Northgate), so the super knows who is on site and whose COI covers them. Compliant version: contracted_through (CS4-24) allows only studio / gc / owner; second-tier crews ride on the first-tier firm's crew list (CS4-14).

---

## 10. What would change my mind

1. A Call Sheet specimen where the bookkeeper builds the Okonkwo October draw package from Patina alone, every sub's COI and waiver shown: CS4-1 and CS4-9 become done.
2. Evidence that Leah's studio never contracts trades directly and never assembles draw packages: CS4-9, CS4-23, CS4-24 drop to P3; AA-1 gets stronger.
3. One real studio catching a wrong-approver text with today's threshold or decision court: CS4-4 drops to P2.
4. If the target studio's GCs always run Procore or Buildertrend, the compliance ledger is the GC's; CS4-1 becomes an import, not a table.
5. A signed kickoff form specimen with the household's money and selections split written down: CS4-3 is a form problem, not a data problem.
