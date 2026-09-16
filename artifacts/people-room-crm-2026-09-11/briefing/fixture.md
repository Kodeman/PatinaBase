# Fixture: the Okonkwo residence

Briefing file 2 of 3. Every seat reasons against this one job. Names, firms, and numbers are invented; the contact realities are typical of a $1M+ studio-led design-build remodel in the Twin Cities. Row ids `F-nn` are the citation handle for findings ("F-14 cannot be recorded").

Where a column says "vocab today", it names the closest value in the code-resident vocabularies (`PartyKind` / `PartyRole` / `VendorSpecialty` / `StaffRole`, see `current-state.md` §B1) or `none`.

---

## 1. Project summary

1. **Job:** Okonkwo residence, 4412 Fremont Ave S, Minneapolis MN 55409. Whole-house remodel of a 1926 two-story plus a 640 sf rear addition (kitchen / mudroom / primary suite over).
2. **Delivery:** design-build, studio-led. Hartwell Studio holds the owner agreement (design + FF&E + construction administration). Marrow & Sons holds the construction contract as GC under the studio's direction. Contract value $1,400,000 (construction $1,120,000; design fee + FF&E $280,000).
3. **Money:** owner-funded 60% cash, 40% construction loan through Great Northern Bank; monthly draws against a schedule of values; 10% retainage on subs; conditional then unconditional lien waivers per draw.
4. **Schedule:** preconstruction 2026-08 to 2026-10; permit issued 2026-10-06; demo 2026-10-12; substantial completion target 2027-08-13; FF&E install and staging 2027-08 / 2027-09.
5. **Studio side:** Priya Natarajan is lead designer of record; Leah Hartwell is principal and approves fee changes; Dale Whitcomb (part-time bookkeeper) posts invoices and reconciles draws.
6. **Client side:** Adaeze Okonkwo decides finishes and selections; Chidi Okonkwo signs money (invoices, change orders over $2,500, draw certifications). Ngozi Eze (Adaeze's sister) holds a key and receives deliveries.

Counts: 3 studio staff · 2 homeowners · 1 receiver · 3 GC people · 1 architect · 9 subs · 4 vendors (5 people) · 1 stager · 1 photographer · 1 draw inspector · 1 AHJ inspector = 28 people, 21 firms.

---

## 2. The people, one table

Legend. Reach reality = what the person actually uses. Patina reach today = the `ReachState` the roster would derive (`account` / `field link` / `on paper`) or `none` where no row can exist. Consent = `sms_consent_status` on the Okonkwo party row where one exists. Docs = COI / W-9 / license / lien waiver held by the studio or GC today. Authority: $ = may approve money; CO = may approve change orders; site = site access.

| ID | Name | Company | Role on project | Trade / specialty | Vocab today | Reach reality | Patina reach today | Phone | Email | Consent | Docs held | Authority | Lifecycle stage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | Leah Hartwell | Hartwell Studio | principal; fee and scope authority | interior design | `StaffRole principal`, org role `owner`; `project_team_members` none on this job | app + email | account | yes | yes | n/a | n/a | $ (studio fee), CO (design scope) | active staff |
| F-02 | Priya Natarajan | Hartwell Studio | lead designer of record; runs RFIs, submittals, selections | interior design | `StaffRole designer`, org role `member`; `project_team_members lead_designer` | app + email + text | account | yes | yes | n/a | n/a | CO (design intent, no $), site | active staff |
| F-03 | Dale Whitcomb | Hartwell Studio (part-time, 2 days/wk) | bookkeeper; posts invoices, assembles draw packages | bookkeeping | `StaffRole bookkeeper`, org role `member`; `project_team_members bookkeeper` | email only, portal on Tuesdays | account | yes | yes | n/a | n/a | none (prepares, does not approve) | active staff |
| F-04 | Adaeze Okonkwo | Okonkwo household | homeowner; decides finishes and selections | n/a | `designer_clients` (client), `PartyRole client` | iOS app daily; email | account | yes | yes | n/a (account rail: `sms_opt_in`) | n/a | CO (selections), site (owner) | active client |
| F-05 | Chidi Okonkwo | Okonkwo household | homeowner; signs money | n/a | `designer_clients` (second household member, no vocab for "co-client"), `PartyKind client_rep` if added as a party | email first; phone for anything over $2,500 | account (if invited) or on paper | yes | yes | n/a | n/a | $ (invoices, draws), CO over $2,500, site (owner) | active client |
| F-06 | Ngozi Eze | (Adaeze's sister) | key holder; receives deliveries; lets trades in | n/a | `PartyKind receiver` | text only; never opens email | field link or on paper | yes | no | granted (kickoff form, 2026-10-10) | n/a | site (key), no $ | active party |
| F-07 | Tom Marrow | Marrow & Sons | GC owner; signs subcontracts; GC-side CO pricing | general contracting | `PartyKind gc` | email + phone; texts only from Erin | field link | yes | yes | not_asked | COI yes (exp 2027-03-31), W-9 yes, MN BC license yes, lien waivers per draw | $ (sub payments), CO (cost side), site | active party; repeat GC (2 prior jobs) |
| F-08 | Erin Sato | Marrow & Sons | GC project manager; RFIs, submittals, draw requests, schedule | project management | `PartyKind gc` | email + text; opens field link weekly | field link | yes | yes | granted (written, 2026-10-08) | n/a (firm docs on F-07) | CO (prepares, does not sign), site | active party |
| F-09 | Luis Ochoa | Marrow & Sons | superintendent; daily site, punch list, inspections scheduling | field supervision | `PartyKind gc` | text only; phone calls | field link | yes | no | granted (verbal at kickoff, recorded by Priya) | OSHA 30 card (held by GC) | site (controls access), no $ | active party |
| F-10 | Sam Rowe | Beck + Rowe Architects | architect of record; stamps drawings; answers RFIs; reviews structural submittals | architecture | `PartyKind architect` | email only; phone for emergencies | on paper | yes | yes | n/a (never texted) | professional liability COI yes; MN AR license yes | CO (design conformance), no $ | active party |
| F-11 | Dana Kowalski | Northgate Electric | electrical sub (owner-operator) | electrical | `PartyKind sub`, `FieldTrade electrical` | text only; email address exists but unread | field link | yes | yes (dead) | granted (2025 Lindqvist consent carried by phone; Okonkwo row set granted 2026-10-12) | COI yes (exp 2026-03-31, LAPSED), W-9 yes (2025), MN electrical contractor license yes, lien waivers per draw | none | active; repeat sub (2025 Lindqvist) |
| F-12 | Pete Rusk | Rusk Mechanical | plumbing sub (owner) | plumbing | `PartyKind sub`, `FieldTrade plumbing` | text only | field link | yes | no | opted_out (replied STOP on the 2025 Lindqvist thread after close; Okonkwo row created `not_asked` 2026-10) | COI yes (exp 2027-01-15), W-9 yes, MN plumbing license yes, lien waivers per draw | none | active; repeat sub (2025 Lindqvist) |
| F-13 | Ingrid Halvorsen | Halvorsen Cabinet Works | cabinetry install sub (owner) | cabinetry | `PartyKind sub`, `FieldTrade cabinetry` | email only; no cell for work | on paper | office line | yes | not_asked | COI yes, W-9 yes, no license required, lien waivers per draw | none | active; repeat sub (2025 Lindqvist) |
| F-14 | Rosa Delgado | Twin Cities Drywall & Plaster | office manager; the contact the firm wants used (owner Frank Bauer does not take calls) | drywall / plaster | `PartyKind sub`, `FieldTrade drywall` (person is not the tradesperson; no "office contact" kind) | email + office phone | on paper | office line | yes | not_asked | COI yes, W-9 yes, lien waivers per draw | none | active |
| F-15 | Frank Bauer | Twin Cities Drywall & Plaster | owner; signs the subcontract; do not contact directly | drywall / plaster | `PartyKind sub` | none by request | on paper | yes (do not use) | yes (do not use) | not_asked | on firm | $ (sub side), CO (sub side) | active |
| F-16 | Amara Osei | Lakeshore Painting Co. | painting sub (owner); has a Patina account from a 2026 job with another studio | paint | `PartyKind sub`, `FieldTrade paint`; `profiles` row exists, unlinkable (`project_parties.profile_id` never written) | Patina account + text | on paper (would be `account` if the FK were set) | yes | yes | granted (web form, 2026-10-14) | COI yes, W-9 yes, lien waivers per draw | none | active |
| F-17 | Jim Lindgren | Boreal HVAC | HVAC sub project manager | hvac | `PartyKind sub`, `FieldTrade hvac` | email only; office dispatch by phone | on paper | office line | yes | not_asked | COI yes, W-9 yes, MN mechanical bond yes, lien waivers per draw | CO (sub side pricing) | active |
| F-18 | Joe Wozniak | Cedar & Iron Framing | framing foreman | carpentry / framing | `PartyKind sub`, `FieldTrade carpentry_framing` | text only | field link | yes | no | pending (invited 2026-10-13, no YES yet) | COI yes, W-9 yes, lien waivers per draw | site | active |
| F-19 | Kelly Marsh | Radon Solutions North | radon mitigation sub (addition slab) | radon mitigation | `PartyKind sub`, `FieldTrade none` (out of vocab; `other` or free text) | email + phone | on paper | yes | yes | not_asked | COI yes, W-9 yes, MDH radon license yes | none | scheduled (2027-02) |
| F-20 | Claire Bissett | Stonehaven Tile Gallery | tile showroom rep; quotes, samples, lead times | tile & stone | `vendors` + `saved_vendors`, `VendorSpecialty tile_stone`; person = `designer_vendor_accounts.sales_rep_*` | email; showroom phone | none (vendor row has no person) | showroom | yes | n/a | W-9 yes (for 1099), resale certificate on file | none | active vendor; same vendor as 2025 Lindqvist |
| F-21 | Marcus Hale | Waterline Supply | plumbing fixtures rep | plumbing fixtures | `vendors`, `VendorSpecialty plumbing_fixtures` | email | none | yes | yes | n/a | W-9 yes | none | active vendor |
| F-22 | Sofia Ferraro | Lumen & Co. | lighting rep | lighting | `vendors`, `VendorSpecialty lighting` | email; text for stock checks | none | yes | yes | n/a | W-9 yes | none | active vendor |
| F-23 | Owen Ashby | Ashgrove Millwork | custom millwork maker on Patina (kitchen island, built-ins); orders through Patina | millwork fabrication | `vendors` with `contact_profile_id` (maker login), `PartyRole maker`, `VendorSpecialty millwork_fabrication` | Patina account (maker portal); email | account (maker) | yes | yes | n/a | W-9 yes, COI for install day pending | none ($ flows via PO) | active maker; quote accepted |
| F-24 | Nadia Brooks | Kestrel Staging | stager for completion photos | staging | `PartyKind stager` | email + text | on paper | yes | yes | not_asked (stager rows carry no SMS rail) | COI yes, W-9 yes | site (install week) | scheduled (2027-08) |
| F-25 | Jonah Feld | Jonah Feld Photography | completion photographer | photography | `PartyKind photographer` | email | on paper | yes | yes | n/a | W-9 yes | site (shoot day) | scheduled (2027-09) |
| F-26 | Carol Nyström | Great Northern Bank | lender's draw inspector; certifies percent complete before each draw | construction lending | `none` (`other`) | email + phone; site visits monthly | on paper | yes | yes | n/a (never texted) | n/a | $ (releases draw), site (inspection) | active; monthly |
| F-27 | Ray Thao | City of Minneapolis, CPED Inspections | building inspector (AHJ); framing, insulation, final | code enforcement | `none` (`other`) | phone and email only; NEVER texted; scheduled through 311 portal | on paper | office | yes | n/a (do not text) | n/a | site (inspection), pass / fail | active; per inspection |
| F-28 | Erin Sato (second seat) | Marrow & Sons | also the GC's contact on the 2025 Lindqvist warranty file (see §4) | project management | second `project_parties` row on a closed project | as F-08 | field link (expired 2026-02) | yes | yes | granted (Lindqvist row, 2025) | n/a | n/a | closed party |

Notes on the table.

- F-05 Chidi: the studio's client record is one `designer_clients` row keyed to Adaeze's login. Chidi has no vocabulary except a second invite or a `client_rep` party row. Both are in use at real studios; pick one and say why.
- F-14 / F-15: the firm's rule is "email Rosa, never call Frank". Today that is two party rows with no relation and no do-not-contact flag (G-7).
- F-16 Amara: the account exists in `profiles`; nothing can attach it to her party row (G-5). The reach chip reads on paper for someone who logs in.
- F-19 Kelly: radon is outside `FieldTrade`; the row stores free text or `other`; an `other` party never opens a profile (G-13).
- F-26 / F-27: no `PartyKind` fits an inspector; both land in `other` and both must never be texted (G-7, G-13).
- F-11 Dana: the COI lapsed in March; nothing in Patina knows (G-14).
- F-12 Pete: STOP on the Lindqvist thread opted out every row on his phone; the Okonkwo row created afterwards reads `not_asked`, so the chip says "Not asked" while the send gate will refuse (G-3).

---

## 3. Where each person would live today

| Group | Rows Patina would hold | Rows Patina cannot hold |
|---|---|---|
| Studio staff F-01..F-03 | `profiles` + `organization_members` (role, staff_role, job_title) + `project_team_members` for F-02, F-03; `people_directory` team rows for co-members | per-surface permission (bookkeeper sees invoices only) |
| Homeowners F-04, F-05 | one `designer_clients` row (Adaeze); Chidi as second invite or `client_rep` party | co-client authority split ($ vs selections) |
| Receiver F-06 | `project_parties` kind receiver, consent granted, field link | "key holder" as a fact |
| GC F-07..F-09 | three `project_parties` kind gc + rolodex person cards + one rolodex company card; field links; trade agreement on the company card | firm-level docs (COI, license) shared across the three people; who at the firm signs |
| Architect F-10 | `project_parties` kind architect; rolodex card | RFI / submittal court (court CHECK has no architect: `00281:167-171`); "never text" |
| Subs F-11..F-19 | nine `project_parties` kind sub with trade; rolodex cards; trade agreements per contact | docs and expiries; office-manager routing; out-of-vocab trade; phone-global opt-out shown per row |
| Vendors F-20..F-22 | `vendors` + `saved_vendors`; reps only in `designer_vendor_accounts.sales_rep_*` | a rep as a person in the room |
| Maker F-23 | `vendors` with maker login; `people_directory` maker row; POs in Orders | install-day COI |
| Stager, photographer F-24, F-25 | `project_parties` kinds stager / photographer | schedule window; site access |
| Inspectors F-26, F-27 | `project_parties` kind other (dark rows) | authority (draw release, pass/fail); never-text rule |

---

## 4. Second fixture: 2025 Lindqvist kitchen (closed)

Purpose: bring-forward. Three subs and the tile vendor are shared with Okonkwo. Everything here is a `project_parties` row on a project with status `completed`, plus whatever the 00418 fold stamped into the rolodex.

| Item | Value |
|---|---|
| Job | Lindqvist kitchen, 2118 Kenwood Pkwy, Minneapolis. Kitchen + butler's pantry remodel, $186,000, design-build, studio-led. |
| Dates | contract 2025-03-14; construction 2025-05 to 2025-10; closed 2025-11-21; warranty through 2026-11-21 |
| Client | Karin Lindqvist (`designer_clients` status completed; account; last touch 2026-01 holiday note) |
| GC | Ostrom Builders, Ben Ostrom (owner, gc, email + text, consent granted 2025-05) |
| Shared subs | F-11 Dana Kowalski / Northgate Electric (consent granted 2025-05-02, written; COI then current, exp 2026-03-31) · F-12 Pete Rusk / Rusk Mechanical (granted 2025-05-02, then STOP 2025-12-03 after close: opted_out on this row) · F-13 Ingrid Halvorsen / Halvorsen Cabinet Works (email only, not_asked) |
| Shared vendor | F-20 Stonehaven Tile Gallery, Claire Bissett (same `vendors` row; saved by Leah in 2025; Priya saved it again in 2026 so `saved_vendors` has two rows) |
| Not shared | painter (Rivera Finishes, one job only), countertop fabricator (Granite North, replaced by Stonehaven's slab program on Okonkwo) |
| Open items | warranty call on a pantry door hinge (2026-06, closed); no open money |
| Field links | all four minted 2025-05, expired 2025-08 (90 days), never regenerated |

Bring-forward questions each seat should answer against these two fixtures.

1. When Priya picks Dana from the rolodex for Okonkwo, which facts should travel (phone, consent, COI expiry, 2025 performance) and which must not (2025 pricing, 2025 project notes)?
2. Pete's STOP was on Lindqvist. What should the Okonkwo row show the day it is created, and who is told?
3. Dana's COI lapsed between the two jobs. Where is the lapse raised: rolodex card, party row, draw package, or nowhere?
4. Stonehaven is saved twice (Leah 2025, Priya 2026). One vendor, two `saved_vendors` rows, one `people_directory` maker row per studio read. What is the studio's view?
5. Halvorsen never texts. Should "email only" be a fact on the person, the firm, or the row?
6. Ostrom Builders is not on Okonkwo. Does the GC's past crew (Ben Ostrom) belong in Okonkwo's rolodex picker, and under what history line?
