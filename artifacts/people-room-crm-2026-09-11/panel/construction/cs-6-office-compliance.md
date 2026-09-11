# CS6: Office manager, compliance and payables

Seat: back office of a builder. COIs, W-9s, licenses, lien waivers per draw, sub payables, 1099s, vendor onboarding, who may be paid. Reasoned against the Okonkwo fixture (`fixture.md` §2) and the Lindqvist bring-forward (§4). Evidence is `path:line` at the worktree root, `F-nn`, `PD-n`, `G-n`, or experience. Findings were written before §E was opened; the last words of each `proposed` cell are the §E mark.

Frame: the firm is the unit of compliance and payment; the person is the unit of contact; the party-on-job is the unit of authority and consent. Patina holds the person and the party; the firm is a name only.

---

## 1. What I track today and where

| Entity | Fields | Tool | Who maintains | How it goes stale |
|---|---|---|---|---|
| Vendor master (firm) | legal name, DBA, entity type, EIN, W-9 date, remit-to, pay method, 1099 eligible, default terms | QuickBooks vendor list + Drive W-9 folder | bookkeeper | sole prop becomes an LLC and nobody re-collects; remit-to moves; DBA differs from the check name |
| COI per firm | carrier, GL / WC / auto / umbrella limits, additional insured endorsement, expiry per line | "COI tracker" spreadsheet + PDFs | office manager | renewal notice goes to the sub, not to us; expires mid-job (F-11); endorsement names the wrong owner |
| License / bond per firm | type, number, state, expiry, bond amount | spreadsheet + state lookup | office manager | owner-operator's license is personal; firm renames; expiry passes between jobs |
| Trade agreement / subcontract | scope, price, retainage %, pay-when-paid, SOV lines, signed date | PDF + AP schedule | PM + bookkeeper | COs move the price and the SOV; retainage release forgotten at closeout |
| Lien waivers | per draw per sub: type, through-date, amount, received date, file | draw package folder per month | bookkeeper | wrong through-date; unconditional never arrives after the check clears |
| Sub payables | invoice, approver, approved date, paid date, retainage held | QuickBooks + email approvals | bookkeeper posts, PM or owner approves | approval buried in email; a sub invoices twice under two names |
| 1099 | per firm, calendar-year paid total, W-9 present | QuickBooks January run | bookkeeper | duplicate vendor records split the total (F-20 saved twice); missing W-9 stops the filing |
| People at each firm | name, role at firm, cell, email, what to call them for | phone contacts, email, a notes column | everyone and nobody | the PM leaves the sub; personal cell dies (F-11 dead email); office manager changes |
| Contact rules | never text, call the office, email only, after-hours number | tribal knowledge | PM | new hire texts the inspector; owner called directly (F-15) |
| Authority | who signs COs, who releases money, threshold | contract + memory | principal | homeowner delegates during travel; sub owner delegates to a PM (F-08) |
| Site access | key holders, gate and alarm codes, dog, hours | job folder + a text thread | superintendent | code changes; key holder changes (F-06) |
| Text consent | who agreed, when, how | nowhere; assumed | nobody | STOP arrives on one job and nobody tells the other PM (F-12) |

---

## 2. Contact-mode reality by role (Okonkwo fixture)

| Row | Role | Opens an app? | Reads email same day? | Must be texted? | Needs a login to do the job? | Who else at the firm must be reachable | Never contact via |
|---|---|---|---|---|---|---|---|
| F-01 | studio principal | yes | yes | no | yes | n/a | n/a |
| F-02 | lead designer | yes | yes | yes for site | yes | n/a | n/a |
| F-03 | bookkeeper, part-time | Tuesdays only | Tuesdays | no | yes, scoped to money | n/a | text |
| F-04 | homeowner, selections | daily (iOS) | yes | no | yes | spouse (F-05) | n/a |
| F-05 | homeowner, money | rarely | yes | phone over $2,500 | optional (paper works) | spouse (F-04) | text for approvals |
| F-06 | key holder / receiver | no | never | yes | no | homeowner | email |
| F-07 | GC owner | no | yes | no (only from Erin) | no | PM (F-08), super (F-09), GC bookkeeper (not in fixture) | text from the studio |
| F-08 | GC PM | weekly via field link | yes | yes | no | owner (F-07) | n/a |
| F-09 | superintendent | no | never | yes | no | PM (F-08) | email |
| F-10 | architect | no | yes | never | no | drafter / office (not in fixture) | text |
| F-11 | electrical, owner-op | no | never (dead) | yes | no | none (one person) | email |
| F-12 | plumbing owner | no | no | yes, but opted out | no | none | text until START |
| F-13 | cabinet install owner | no | yes | never | no | shop office line | text |
| F-14 | drywall office manager | no | yes | no | no | is the route for F-15 | text |
| F-15 | drywall owner | no | do not use | never | no | route through F-14 | everything |
| F-16 | painter, has account | yes (other studio) | yes | yes | has one, unlinkable | none | n/a |
| F-17 | HVAC PM | no | yes | no | no | dispatch by phone | text |
| F-18 | framing foreman | no | never | yes (pending) | no | Cedar & Iron office | email |
| F-19 | radon sub | no | yes | no | no | none | n/a |
| F-20 | tile rep | no | yes | no | no | showroom desk | text |
| F-21 | plumbing fixtures rep | no | yes | no | no | order desk | text |
| F-22 | lighting rep | no | yes | stock checks only | no | order desk | n/a |
| F-23 | millwork maker | yes (maker portal) | yes | no | yes | shop install crew | n/a |
| F-24 | stager | no | yes | yes install week | no | crew lead | n/a |
| F-25 | photographer | no | yes | no | no | none | text |
| F-26 | lender draw inspector | no | yes | never | no | bank loan officer | text |
| F-27 | AHJ inspector | no | yes | never | no | 311 scheduling portal | text; personal cell |

Counts: 5 of 28 open an app; 12 miss same-day email; 9 must be texted; 7 must never be; 4 route through the firm's office.

---

## 3. Authority and decision rights

| Decision | May approve | Prepares / recommends | Must be copied | CRM must record | How a text from the wrong person is caught |
|---|---|---|---|---|---|
| Owner invoice / draw payment | F-05 Chidi | F-03 Dale assembles | F-04, F-02 | grant: money, no threshold, on F-05's party row | approval must arrive as an account act or signed paper from the grant holder; a text from F-04 or F-06 saying "pay it" is not an approval |
| Change order over $2,500 | F-05 signs | F-02 recommends, F-07 prices, F-10 conformance | F-04 | grant: change order, threshold $2,500 | CO routes to the court of the grant holder, never to the selections holder |
| Selection or CO under $2,500 | F-04 Adaeze | F-02 | F-05 | grant: selections, threshold $2,500 | a "yes" from F-04 on a $4,000 item is logged as a recommendation, not an approval |
| Design fee or scope change | F-01 Leah | F-02 | F-04, F-05 | grant: studio fee | staff role principal only |
| Sub payment (GC side) | F-07 Tom | F-08 prepares pay app | F-03 | grant: money on the GC company card; Erin prepares, does not sign | Erin's "release it" is a request, not a release |
| Sub-side CO pricing | F-15 Frank (via F-14 Rosa), F-17 Jim for HVAC | F-08 | F-07 | grant on the firm; route-to F-14 | Rosa forwards; Frank's signature is the act |
| Schedule slip | F-08 proposes, F-02 accepts | F-09 | F-05 if a draw moves; F-26 if the draw date moves | grant: schedule | a super's text "we're pushing a week" is a proposal |
| Site access day to day | F-09 Luis controls | F-08 | F-04 | grant: site (controls) | trades ask Luis, not the homeowner |
| Key handover | F-06 Ngozi holds; F-04 authorizes | F-09 | F-05 | grant: key, with date given and date returned | a stager texting Ngozi directly is fine; a stager texting Adaeze for a key is not |
| Draw release | F-26 certifies %, F-05 authorizes | F-03 | F-07, F-08 | grant: draw certify on F-26; draw release on F-05 | no draw closes on a phone call |
| Inspection pass / fail | F-27 | F-09 schedules | F-08, F-02 | grant: inspection | never by text; the 311 confirmation is the record |

Rule: authority is a fact on the party-on-job, with scope and threshold, defaulted from the firm. The Document reads it before a decision enters a court.

---

## 4. Compliance and paperwork per party type

| Party type | Document | Required before | Expiry | Who chases | Blocks |
|---|---|---|---|---|---|
| GC (F-07 firm) | COI: GL, WC, auto, umbrella; studio and owner as additional insured | mobilization | annual, per line | office manager | site access, every payment |
| GC | state contractor license + bond | contract signature | 2 years (MN BC) | office manager | contract |
| GC | W-9 | first payment | refresh on entity change | bookkeeper | payment, 1099 |
| GC | signed agreement | mobilization | n/a | PM | mobilization |
| GC | lien waiver: conditional with pay app, unconditional after payment, per draw | each draw | per draw | bookkeeper | the next draw |
| GC | sworn construction statement (lender jobs) | each draw | per draw | GC bookkeeper | draw certification (F-26) |
| First-tier sub (F-11..F-19) | COI, license where the trade is licensed, W-9, signed trade agreement, waivers per draw | as GC | as GC | GC office, studio verifies | payment via the GC's pay app; studio holds the owner's draw |
| Owner-operator sub (F-11, F-12) | same; license is personal | same | same | same | same; the lapse risk is highest here |
| Second-tier sub | COI + waiver only | mobilization | annual | first-tier sub | the first-tier sub's waiver |
| Vendor / showroom (F-20..F-22) | W-9, resale certificate | first PO | entity change | bookkeeper | PO, 1099 |
| Maker (F-23) | W-9; COI for install day | install day | annual | bookkeeper | install-day site access |
| Stager (F-24) | COI, W-9 | install week | annual | office manager | site access, payment |
| Photographer (F-25) | W-9 | shoot day | n/a | bookkeeper | payment |
| Architect (F-10) | professional liability COI, AR license | stamping | annual | office manager | nothing at the studio; the owner's lender asks |
| Lender inspector (F-26) | none held; receives the draw package | each draw | n/a | bookkeeper sends | draw |
| AHJ (F-27) | none held; permit card on site | each inspection | permit expiry | superintendent | inspection |
| Homeowner (F-04, F-05) | signed agreement, loan commitment, key-holder authorization for F-06 | contract; before F-06 gets a key | n/a | principal | deposit, key |
| Studio itself | own license attestation, own COI to owner, own W-9 to lender | template selection (`00578_design_build_kind.sql:294-307`) | `expires_on` | principal | design-build template (`:362`) |

---

## 5. Lifecycle stages for a person or firm

| Stage | Trigger | Contact mode | Access | Documents due | What goes stale |
|---|---|---|---|---|---|
| Prospect | picked from the rolodex or referred | email or office line; no texting rights | none | none | phone from a prior job |
| Bid | RFQ sent | email; text only with consent on this job | RFQ link (30 days) | none | RFQ link expires, bid goes silent |
| Awarded | trade agreement signed | PM and office both live | agreement link | COI, W-9, license current on the firm | agreement signed, papers not in |
| Active | mobilized | text for field people, email for office | field link (90 days), site | waivers per draw | field link expires mid-job; STOP on the phone |
| Closeout | punch list, final waiver | text for punch, email for money | field link | unconditional final waiver, retainage release | retainage release never requested |
| Warranty | project completed, warranty end date set | email; phone for calls | none; field link lapsed | none | contact leaves the firm; the row sits under a closed project (F-28) |
| Repeat | picked again from the rolodex | bring forward consent, docs, contact rules; not price, not notes | new field link | re-check expiries | 2025 consent read as fresh; lapsed COI carried silently (F-11) |

---

## 6. Three failure stories from experience

**The lapsed COI on the second job.** An electrical owner-operator worked for us in spring; his GL certificate expired the next March and the carrier mailed the renewal to him, not to us. We picked him from the contact list in October, sent the agreement, and he mobilized. A helper cut a hand in week two. The claim went to the homeowner's policy: our tracker held last year's certificate and nobody read an expiry at re-engagement. Missing data: an expiry on the firm, read when the firm is picked again, and a block on mobilization. That is F-11.

**The STOP that only one PM knew about.** A plumber replied STOP after a kitchen job closed. Two months later another PM added him to a new job and the CRM read never asked. Three site schedules never arrived; he missed rough-in day, the framer sat idle, and we paid a half day of standby. Missing data: opt-out as a fact on the phone number, shown on every row that carries it, with the date and the job it came from. That is F-12.

**The waiver with the wrong through-date.** A drywall office sent a conditional waiver through the 15th when the pay app ran through the 30th. The bookkeeper filed it under the firm, not the draw. The lender's inspector caught it at certification and the draw slipped two weeks; the GC floated its subs for a month. Missing data: a waiver keyed to the draw and the firm with through-date and amount, and a check that pay app and waiver agree before the package assembles. The 00578 table has the columns; nothing reads them back.

---

## 7. Findings

| ID | P1–P3 | confidence | claim | evidence | proposed |
|---|---|---|---|---|---|
| CS6-1 | P1 | high | No object holds a trade or vendor compliance document (COI, W-9, license, bond) with an expiry; the only insurance word is a boolean requirement flag on the trade agreement. | `supabase/migrations/00579_trade_agreements.sql:84`; `00417_studio_contacts.sql:70-120` (zero compliance columns); grep of migrations, `packages/types/src`, `packages/supabase/src/hooks` for `w9`, `coi_`, `license_number`, `1099` is empty; F-11 | Add a documents object keyed to the firm card (person when sole proprietor): type, number, issuer or carrier, issued_on, expires_on, storage_path, recorded_by; surface the earliest expiry on the rolodex card and the Call Sheet row. known(G-14) |
| CS6-2 | P1 | high | Firm-level facts cannot attach to the firm; the company card is name only, so Marrow's COI would sit on Tom's card and not on Erin's or Luis's. | `apps/designer-portal/src/components/document/people/directory/company-row.tsx:76-84`; `current-state.md` §B2 row 2; F-07, F-08, F-09; `fixture.md` §3 "firm-level docs" | Documents, W-9, remit-to, and authority defaults live on the company card; person cards inherit; a sole proprietor is a person card that is also the firm. touches(G-14): firm as the holder |
| CS6-3 | P1 | high | Nothing records who at a firm or household may approve money, change orders, schedule, or site access, or above what threshold; Chidi's $2,500 line and Frank Bauer's signing authority have no field. | `current-state.md` §B1 `project_parties` columns (no authority column); `client_decisions.court` CHECK lacks architect (`fixture.md` §3, `00281:167-171`); F-05, F-15, F-07 | An authority grant on the party row: scope (money, change order, schedule, site, key, draw certify), threshold_cents, granted_by, dated; the Document reads it before a decision enters anyone's court. known(G-15) |
| CS6-4 | P1 | high | Lien waivers per draw exist only for the studio's own design-build draws, key to a rolodex card, and are never surfaced on the person, the firm, or the Call Sheet; a missing unconditional waiver blocks nothing. | `00578_design_build_kind.sql:491-509`, `:635-660`; `current-state.md` §A6, §A8 (no waiver region on any sheet); F-11, F-12 | The waiver ledger reads onto the company card ("Draw 3: conditional received 10-28, unconditional missing") and the draw package refuses to assemble with a gap. touches(G-14): draw ledger unread |
| CS6-5 | P1 | high | No do-not-contact or channel rule exists on any external person; Frank Bauer, Ray Thao, and Carol Nyström can be texted or emailed by whoever picks them. | `current-state.md` §D:236 (only `designer_clients.preferred_contact`, unused); F-15, F-26, F-27 | A contact rule on the rolodex person card: allowed channels, forbidden channels, route-to person, hours; the send gate and the Text word read it before offering the channel. known(G-7) |
| CS6-6 | P2 | high | No "office contact routes for" relation between two people at one firm; Rosa and Frank are two unrelated rows. | `00417_studio_contacts.sql:70-120` (self FK is `company_id` only); F-14, F-15; PD-4 (`contact_kind` free text) | `routes_to` on the person card plus named `ContactKind` values `office_manager` and `dispatcher`. touches(G-7): routing relation |
| CS6-7 | P2 | high | The consent ledger is hard-deleted with the party row on roster Remove, destroying the record a carrier or a TCPA complaint would ask for. | `apps/designer-portal/src/components/document/roster/roster-row.tsx:280-283`; `packages/supabase/src/hooks/use-coordination.ts:808-816`; contrast `00417:124-128` (rolodex has no DELETE) | Parties soft-delete with `removed_at` as `project_team_members` does (`00084:160-172`); consent evidence is never deleted. known(G-10) |
| CS6-8 | P2 | high | A phone-global STOP reads "Not asked" on a row created afterwards; the office sees a green light the send gate will refuse. | F-12; `current-state.md` §D:230 (`sms-inbound/pipeline.ts:159-164` vs `_shared/sms.ts:174-185`) | Reduce consent across the phone at read time; the row shows "Opted out, Lindqvist, 2025-12-03". known(G-3) |
| CS6-9 | P2 | high | Consent, phone, and document expiries do not travel from the rolodex card into a new party row; each job re-asks, and Dana's 2025 written consent is invisible on Okonkwo. | PD-3 (`studio_contact_id` is lineage, not a join); F-11; `fixture.md` §4 Q1 | Bring-forward rule: consent evidence, contact rules, and document expiries are read from the card; pricing and project notes stay on the old project. touches(G-4): card has nothing to carry |
| CS6-10 | P2 | high | Non-account email (trades, vendors, rolodex) has no suppression, unsubscribe, or bounce record; a dead address is sent to forever and a vendor who asks to stop cannot be stopped. | `current-state.md` §D:229 (`_shared/send-email.ts:430-434`; only the RFQ sender opts out); F-11 "email (dead)" | Email status on the person card (ok, bounced, unsubscribed, dated) written by the email rail and read by every sender. known(G-6) |
| CS6-11 | P2 | med | Vendor reps are not people in the room; W-9 and resale certificate for 1099 have no home; Stonehaven saved twice splits the 1099 total. | `current-state.md` §B1 vendors row (`designer_vendor_accounts.sales_rep_*`); `fixture.md` §3 vendors; §4 Q4; F-20 | A rep is a rolodex person whose company links to the vendor; one vendor master per firm per studio with tax identity and remit-to; `saved_vendors` unique per (studio, vendor). touches(G-19): tax identity, dedupe |
| CS6-12 | P2 | high | The payee is not one object: trade agreements and waivers key to `studio_contacts`, POs key to `vendors`, consent keys to `project_parties`; nothing says "this is who we pay, under which W-9". | `00579:64`; `00578:495`; PD-3; PD-9 | The company card is the payee of record; every money object carries `company_id`; the W-9 legal name must match the card. touches(G-1): money keys diverge |
| CS6-13 | P2 | med | No expiry engine for external documents; the only expiry Patina evaluates is the studio's own license attestation. | `00578_design_build_kind.sql:302`, `:362`; no cron on any party or vendor document; F-11 | pg_cron writes "lapses in 30 days" and "lapsed" facts per firm; they surface on the card and the Call Sheet row and block the draw line for that firm. touches(G-14): no expiry evaluation |
| CS6-14 | P2 | high | No lifecycle stage on a party or firm; a closed job's rows sit beside active ones; the Lindqvist warranty window through 2026-11-21 is invisible. | `current-state.md` §B1 `project_parties` columns (no stage); F-28; `fixture.md` §4 dates | Derive firm stage (prospect, bid, awarded, active, closeout, warranty, repeat) from agreements, draws, and project status; a row on a completed project reads "Warranty until 2026-11-21". new |
| CS6-15 | P2 | med | The bookkeeper has no surface-scoped permission; Dale sees every room or none. | `current-state.md` §B1 `organization_members` (`permissions_override` jsonb, no hook cited reads it); `fixture.md` §3 row 1; F-03 | Map `staff_role bookkeeper` to a default tier (`packages/types/src/studio-config.ts:59-70`) that scopes to invoices, draws, documents, and the Companies chip. known(G-22) |
| CS6-16 | P2 | med | Inspectors and lenders land in `other`, open no profile, and cannot carry "never text" or "schedule via 311". | `fixture.md` §3 inspectors; PD-10; `current-state.md` §A4 `person-profile.tsx:955` (everything else → TeamProfile); F-26, F-27 | `PartyKind` `inspector` and `lender` with a default contact rule "phone and email only" and no consent rail. known(G-13) |
| CS6-17 | P3 | med | A maker's pending install-day COI cannot be recorded; `vendors` has no document slot. | `current-state.md` §B1 vendors columns; F-23 | The CS6-1 documents object also keys to `vendor_id` when the payee is a marketplace maker. touches(G-14): vendor as the holder |
| CS6-18 | P2 | med | The head count counts party rows, not humans or firms; "how many firms need a 1099 this year" cannot be answered. | `current-state.md` §B2 rows 9-11; `people-room.tsx:383` | Count by firm on the Companies chip; 1099 candidates = firms paid over $600 in the calendar year through Patina money objects with no W-9 on file flagged. touches(G-9): count by firm |
| CS6-19 | P2 | high | Changing a phone on one party row revokes that row's consent and leaves the card and the other rows untouched; one human can hold three phones and three consent states. | `party-profile-sheet.tsx:581` (`current-state.md` §A6); §B2 rows 3-4 | AMENDMENT-ASK: phone lives on the card and party rows read it; one phone change is one act with one consent consequence (overturns the PD-3 snapshot for phone only). touches(G-20): phone drifts per row |
| CS6-20 | P2 | med | The invoice pay link is a plaintext token with no expiry; a forwarded email pays the wrong household's invoice with no gate. | `current-state.md` §C:216 (`00574_invoice_links.sql:63-89`) | Hash the token, 30-day expiry, regenerate on send, record the payer email on the payment. new |
| CS6-21 | P3 | med | `designer_clients.preferred_contact` exists and no sender reads it; Chidi's "email first, phone over $2,500" cannot be honored by anyone sending. | `current-state.md` §D:236; F-05 | Retire the free-text column into the CS6-5 contact rule, or type it and read it in the client profile and every sender. known(G-7) |
| CS6-22 | P2 | med | A trade outside `FieldTrade` (radon) files as `other` or free text; a free-text trade never matches a license type or a specialty filter. | F-19; PD-4; `trade-chip-row.tsx:73-82` (legacy free text renders as an extra chip) | Keep the code-resident vocabulary, add `radon_mitigation`, and an `other_named` value with a required label; license type maps from trade. known(G-13) |
| CS6-23 | P3 | low | `ContactKind` is promised by the hooks and has no type; office values like office_manager, dispatcher, estimator will drift as free text per studio. | `current-state.md` §B1 vocab row (`use-studio-contacts.ts:31-34`; grep of `packages/types/src` empty) | Define `ContactKind` in `packages/types` with the office roles named. known(G-12) |
| CS6-24 | P2 | high | `insurance_certificate_required` is a promise the trade signs; nothing later checks the certificate arrived, so a signed agreement proceeds to draws with no COI on file. | `00579:84`, state CHECK `:91-92` (draft, sent, signed, void; no papered state) | Signed → "papered" requires a current COI and W-9 on the company card; the draw line for that firm stays closed until then. new |
| CS6-25 | P3 | med | Call Sheet Print carries no compliance column; the site binder a lender inspector asks for cannot be printed from Patina. | `roster/call-sheet.tsx:150-170` (Print tertiary); `00419_project_roster_wiring.sql:97-147` (no document fields on the view) | Print carries COI expiry and license number per firm from the CS6-1 object. touches(G-14): print reads no documents |

---

## 8. Ranked top 5 things Patina must track that it does not today

1. Compliance document with expiry (COI, W-9, license, bond). Object: firm. Proof: F-11, lapsed COI carried silently into a second job.
2. Authority grant with scope and threshold. Object: party-on-job (defaults on the firm). Proof: F-05, Chidi signs money and COs over $2,500; Adaeze does not.
3. Contact rule: forbidden channels, route-to person, hours. Object: person. Proof: F-15 (never contact Frank; use Rosa) and F-27 (AHJ never texted).
4. Lien waiver state per draw per firm, visible on the firm and blocking the draw. Object: firm, keyed to the draw. Proof: F-11 and F-12, nine subs on monthly draws with 10% retainage.
5. Payee of record with tax identity, one per firm per studio. Object: firm within the studio. Proof: F-20, Stonehaven saved twice; F-16, an account that cannot link to its party row.

---

## 9. AMENDMENT-ASK items

**AA-1. Trade self-service document upload over the field link.** The cheapest way to keep COIs current is the sub's office uploading the renewal. The trade is the actor, which PR-3 calls a side journey. Ask: one upload door on the field link page for COI, W-9, license, writing to the CS6-1 documents object with `source = 'field_link'`. Compliant version: the studio office manager uploads from the company card; the field link shows the trade what is on file and when it lapses.

**AA-2. Lender draw package read link.** The lender's inspector (F-26) certifies against the package; a read link removes a monthly email chain. The lender is not the customer (PR-3). Ask: a 30-day hashed read link on the draw, minted by the bookkeeper. Compliant version: export the package as one PDF and email it from the studio.

**AA-3. Phone as a card fact, not a row snapshot (CS6-19).** PD-3 keeps a snapshot per party row; for phone and consent that yields three phones and three consent states for one human. Ask: read phone and consent from the rolodex card when `studio_contact_id` is set; the row keeps history only. Compliant version: keep the snapshot and show a "differs from the card" line with a one-word Sync.

---

## 10. What would change my mind

1. A studio-led job where the GC's office holds every sub COI and waiver and the studio never sees a lapse: CS6-1 and CS6-4 drop to P2; the firm object carries the GC only.
2. Evidence that Leah's studio pays no sub directly and issues no 1099 to a trade: top-5 #5 narrows to vendors and makers.
3. A specimen where authority is captured on the agreement (parts 00575) and read by `client_decisions.court`: CS6-3 becomes wiring, not a missing object.
4. A send-gate read of `preferred_contact` or a do-not-contact flag I missed: CS6-5 and CS6-21 collapse into one wiring nit.
5. A ruling that warranty-stage contact belongs to the project, not the person: CS6-14 moves to the Desk seat.
