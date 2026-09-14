# UX-1 · Information architecture

Seat: information architect. Charge: fold the 15-entity CRM model into the People room's IA, at the P1 core (E1, E2, E4, E5, E6, E7, E8, E9, E10, E12, E15). Evidence is `path:line` in the worktree, `crm-model.md` §/CRM-n, `F-nn`, `G-n`, `PD-n`, house sheet §.

Premise in one line: the room today lists **engagements**, and the CRM model is built on **humans and firms**. Every structural finding below falls out of that one mismatch.

---

## 1. Object-to-surface map

Six surfaces. "Owns" means the fact is created and edited there and there only. "Reads" means the surface renders it and links back to the owner.

| Entity | Owns | Reads | Not allowed to own it |
|---|---|---|---|
| E1 Person identity | Person card | Directory row · roster row · picker mini row (`roster/party-mini-row.tsx:1-18`) · company card crew list | project roster (snapshot today, `PD-3`) |
| E2 Company | Company card | Directory (Firms) · person card firm line · roster row company suffix (`roster/roster-row.tsx:148-153`) · money book draw and invoice lines | project roster; person card |
| E4 Affiliation (person at firm) | Person card, under the firm | Company card crew list · picker mini row · roster second line | roster row |
| E6 Reach channels | Person card (personal lines) + company card (firm lines: office, dispatch, AP, after-hours) | Directory row reach word · roster row reach chip (`roster/reach-chip.tsx:19-35`) · party composer · every send rail | project roster |
| E7 Contact rule | Person card. One per-job override owned by the seat | Directory row (only when it forbids or routes) · roster row · every composer before consent is read | company card |
| E8 Consent per studio per channel value | The consent record, surfaced on the channel it belongs to on the person card | Directory row · roster row consent dot · composer gate (`supabase/functions/_shared/sms.ts:174-185`) | project roster row (this is CRM-4 / G-3 today) |
| E9 Access grant | Account-tier grants on the person card; link-tier grants on the seat that minted them | Reach word derivation (`lib/document/roster-derivation.ts:360-364`) · roster row · person card Reach & access | Directory (reads only) |
| E10 Compliance document | Company card (person card only when sole proprietor) | Roster row blocking line · picker mini row at pick · site access card · draw line in the money book | project roster; person card for a firm's paper |
| E12 Authority on the engagement | The seat, on the project roster | Person card seat line · decision court · approval record · client page "your contact" | person card; company card |
| E5 Engagement stage + window | Project roster | Person card seats region · Directory row facts line · Desk | Directory |
| E15 Site access card | Project paper, one card per project, opened at the head of the Call Sheet | Roster rows (site access mode) · field link page · person card seat line for the key holder | person card |

Linked, never owned, per the orchestrator's scope line: E11 lien waivers per draw (money book, CRM-9), inspections and deliveries (schedule, CRM-34), staff permission scoping (studio settings, CRM-36), maker trade terms and POs (Orders, `PD-9`).

---

## 2. The Directory's list model

**One human, one row, seats beneath.** The row is the person card's face; a seat line is an engagement. This is the single change that makes the rest of the model addressable (CRM-5, G-1).

| Element | Rule |
|---|---|
| Entry types | Two: a person (circle) and a firm (42px rounded square, `directory/company-row.tsx:89`). Same list, same row grammar, never two lists with two loading states as today (`views/directory-view.tsx:458-507`) |
| Row, person | circle · name · role chip(s) · reach word · facts line · seat lines |
| Row, firm | square · legal name (DBA in parentheses) · kind chip · facts line "N on the crew · N open jobs · paper: current / lapses in 30 days / lapsed" |
| Seat lines | Up to three, indented under the person, each reading `PROJECT · KIND · TRADE · STAGE · window`. More than three folds to "+N more seats" |
| Role chips on the row | Every role the human currently holds, in `ROLE_ORDER` order (`views/directory-view.tsx:107-129`), capped at two plus "+N" |
| Chip row (the filter) | Collapses eleven (`views/directory-view.tsx:93-105`) to six on one axis: **Everyone · Clients · Crew · Makers · Studio · Firms**. Trade and specialty stay as a second line under Crew and Makers (`directory/trade-chip-row.tsx:43-46`) |
| MINE · STUDIO | Filters rows, never seats inside a row. MINE = the signed-in member is lead, creator, or owner of a seat or the card. A person kept under MINE still shows their studio-wide seat count as "+2 on the studio's jobs". STUDIO stays the default (`PD-5`, `directory/scope-lens.tsx:23`) |
| Stage | Belongs to the seat, never to the person. The person's facts line carries the most advanced live seat's stage plus its window |
| Reach word | The three access words stay (`PD-12`): Account · Field link · On paper. A contact rule that **forbids or routes** prints as a separate terracotta clause on the row ("Never text", "Through Rosa Delgado"). Access tier and contact rule are two axes and must not be merged into one word |
| Consent | Shown on the channel, not the row. A row whose phone is opted out anywhere in the studio reads "Opted out 2025-12-03" wherever the phone is named (CRM-4, F-12) |
| The count | Counts what is listed, by card: "28 people" under a people narrowing, "21 firms" under Firms, "28 people · 21 firms" under Everyone. Never party rows (G-9) |
| Search matches | name · firm name (legal and DBA) · phone suffix over `phone_e164` digits, 4 or more · trade and specialty label · email · role word. Not project names; that is the Desk |
| Sort | Role band, then name, as today (`views/directory-view.tsx:107-129`), with firms sorting into the band of the crew they carry under Everyone |

Rolodex cards with no project get a home: they are people, so they appear (G-17 today excludes them, `views/directory-view.tsx:294`).

---

## 3. Person card content inventory, by region

Replaces four divergent profiles (`views/person-profile.tsx:911-955`, `PD-10`) with one card whose regions appear or stay silent. Region order is fixed.

| # | Region | Contents |
|---|---|---|
| R1 | Identity | circle · full name · firm and role at firm (E4) with dates · sole-proprietor flag · trades the human personally licenses · studio verdict line with its date |
| R2 | Reach & access | typed channels (E6): kind, label, value, preferred, sms_capable, verified date, status. Consent (E8) printed against the channel value with source, date, and origin job. Access grants (E9): tier, what it opens, granted, last used, ends. The derived reach word with its reason |
| R3 | Contact rule | allowed · forbidden · route to (a link to the other person card) · hours · escalation by decision class · reason · who set it, when. Job overrides listed with the job named |
| R4 | Seats on projects | one line per engagement: project · kind · trade · stage · window · authority (scope, threshold, prepares-only) · site access mode · contracted through · shown to client. Closed and off-job seats fold under "Past seats" with the reason |
| R5 | Paper | for a sole proprietor only: the compliance documents held on this human. Otherwise one line pointing at the company card |
| R6 | History | touches by channel with decision class and authority check · notices they were told · prior jobs · warranty contact status |

---

## 4. Company card content inventory

The company card does not exist today beyond a name and an unfold of names (`views/directory-view.tsx:477-503`). Six regions.

| # | Region | Contents |
|---|---|---|
| R1 | Identity | square · legal name · DBA · kind · trades · warranty until |
| R2 | Crew & affiliations | every person at the firm with role at firm, and the three designations: paperwork contact, signer, site contact. License holders marked. Crew lines carry no contact rails (CRM-31) |
| R3 | Paper | compliance documents (E10): type, number, issuer, issued, expires, file, verified by and when, held by studio or GC, and what each blocks (site access / payment / draw / contract / permit / mobilization). Expiry states read "current", "lapses in 30 days", "lapsed on 2026-03-31" |
| R4 | Payee | legal name from the W-9, tax id last 4, remit-to, W-9 date, retainage rate. Amounts and the waiver ledger link to the money book, not owned here (CRM-9, `PD-9`) |
| R5 | Jobs | engagements grouped by project with each seat's stage; the draw and waiver state per job as a read-only line that links out |
| R6 | History | first job, last job, repeat count with evidence, verdict with reason and date |

---

## 5. Project roster (Call Sheet) inventory, and how it differs

The Call Sheet stays a DocSheet on the project paper (`PD-6`). It owns seats; it owns nothing about the human.

| Band | Contents |
|---|---|
| Site access card | at the head: gate code with version, lockbox, alarm reference, key holder (named from a seat), site hours, receiver instructions, emergency lines, last changed and who was told |
| Studio side | as today (`roster/roster-groups.tsx:9-13`) |
| Client side | household members as seats, each carrying its own authority (Adaeze selections, Chidi money over $2,500) |
| On the job · this week | seats whose window covers today, or with no window and stage mobilized or active |
| On the job · later | seats whose window opens in the future (F-19 radon 2027-02, F-24 stager 2027-08) |
| Bidding | invited to bid, bidding, declined, no response: bid due date, who owes the answer, outcome. Never mixed into crew (CRM-20) |
| Done | closeout, warranty, off job, with the reason |

| Axis | Project roster | Person card |
|---|---|---|
| Unit | the seat | the human |
| Owns | stage, window, authority, site access mode, contracted through, show to client, bid facts | identity, channels, contact rule, consent, access grants, verdict |
| Reads | channels, contact rule, consent, documents, from the cards, live (`crm-model.md` D-A) | seats, from the roster |
| Grouping | by window and by side | by project, newest live seat first |
| Removal | closes the seat with a reason; never a hard delete (CRM-13) | archive the card, never delete |

---

## 6. Navigation and deep links

| Param | Today | Proposed |
|---|---|---|
| `?person=` | resolves 8 of 12 roles from a hard list, else waits on the roster (`people-room.tsx:173-197`) | resolves a **person card id**; role is read from the card, so all twelve open. Legacy party ids resolve through lineage |
| `?firm=` | none | opens the company card |
| `?seat=<project>` | none | with `?person=`, opens that person's card scrolled to that seat |
| `?role=` | eleven values, stripped from the address after read (`people-room.tsx:151-171`) | six values, **kept** in the address so a filtered book is linkable; legacy eleven map forward |
| `?view=` | seven, stripped | kept, same reason |
| `?scope=` | mine / studio, stripped | kept |
| `?trade=` | none | narrows under Crew and Makers |
| `?thread=` | kept | unchanged |
| `?add=` | kept as an opening state | unchanged |
| Call Sheet | no addressable door | `/doc/<id>?sheet=call` opens the DocSheet; still an instrument, not a route (`PD-6` intact) |
| Legacy redirects | `/portal/clients` etc. (`next.config.js:415-422`) | unchanged; `?role=client` still resolves |

---

## 7. Sitemap

```
/people  ·  THE PEOPLE ROOM  (studio book, 1200px band, PD-14)
│
├── rail · DIRECTORY
│   └── Directory                              ← the one list
│       ├── chips: Everyone · Clients · Crew · Makers · Studio · Firms
│       ├── second line: trades (Crew) · specialties (Makers)
│       ├── lens: MINE · STUDIO                (rows, not seats)
│       ├── person row ──────► PERSON CARD     ?person=
│       │     └── seat line ─► PERSON CARD @ seat   ?person=&seat=
│       └── firm row ────────► COMPANY CARD    ?firm=
│
├── rail · RELATIONSHIPS   Threads · Nurture · Reviews      (unchanged)
├── rail · PRACTICE        Portfolio · Outreach · Your Eye  (unchanged)
│
├── PERSON CARD            R1 identity · R2 reach & access · R3 contact rule
│                          R4 seats on projects · R5 paper (sole prop) · R6 history
│        └── seat ────────► /doc/<project>?sheet=call   (the seat on its job)
│
└── COMPANY CARD           R1 identity · R2 crew · R3 paper · R4 payee
                           R5 jobs · R6 history
         ├── crew ────────► PERSON CARD
         └── paper ───────► money book (draws, waivers)   read-only link

/doc/<project>  ·  THE PROJECT PAPER
└── letterhead instrument ─► CALL SHEET (DocSheet, PD-6)   ?sheet=call
        ├── SITE ACCESS CARD          (owned here)
        ├── Studio side · Client side
        ├── On the job · this week / later
        ├── Bidding
        ├── Done
        ├── row ─────────► person card       (the human)
        └── From the rolodex ─► picker (mini rows carry reach + paper state)
```

### Per-screen content inventory

| Screen | Owns | Reads | Acts |
|---|---|---|---|
| Directory | nothing (a projection) | person cards, company cards, seats, reach, consent, paper state | Add person · Add firm · search · chips · lens |
| Person card | E1, E4, E6 personal, E7, E8 surfacing, E9 account-tier | E5 seats, E10 firm paper, E13 touches | edit identity · add channel · set contact rule · record consent · mint or revoke a grant · archive |
| Company card | E2, E10, E4 designations | E5 seats, waiver ledger, draws | edit firm · record a document · set paperwork contact, signer, site contact · archive |
| Project roster | E5, E12, E15, bid facts, show to client | E1, E6, E7, E8, E10 | add from rolodex · new person · close a seat with a reason · print · copy field link · text |
| Site access card | E15 | key holder seat | change a code and record who was told |
| Project paper | the project | the roster's vitals line | open the Call Sheet |

---

## Findings

| ID | P | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| IA-1 | P1 | high | The Directory's unit is a party row per project, so one human on two jobs is two rows in two role bands, and the room can never be a rolodex | `supabase/migrations/00589_return_to_lead_hardening.sql:824-860`; `current-state.md` §B2; `views/directory-view.tsx:288-302` | List one row per person card with seats beneath it; the party row becomes a seat line, never a list entry. known(G-1), touches(G-9) |
| IA-2 | P1 | high | A rolodex person with no project never renders: `role='contact'` is filtered out of every chip, so the studio's own book is invisible from the Directory | `views/directory-view.tsx:34-44`, `:294` | Every person card is a Directory entry; the Companies chip becomes a narrowing of one list, not the only door to the rolodex. known(G-17) |
| IA-3 | P1 | high | The Directory row carries no reach word, so the studio book cannot answer "how do I reach Dana" without opening a project | `directory/person-row.tsx:76-99`; `current-state.md` §A7 | Reach word on the Directory row, derived from the person card's grants, with the forbidding clause of the contact rule beside it. known(G-21), CRM-16 |
| IA-4 | P1 | high | No surface owns a firm: the Companies chip renders a name, a kind, and an unfold of names, with no region for documents, payee, signer, or crew roles | `views/directory-view.tsx:477-503`; `directory/company-row.tsx:76-107`; `00417_studio_contacts.sql:76-80` | Build the company card as §4, and make it the only place a compliance document or a payee identity is edited. known(G-4), CRM-6 |
| IA-5 | P1 | high | There is no region anywhere for authority, contact rule, compliance paper, or site access, so four of the model's P1 entities have nowhere to land even if the columns existed | `crm-model.md` CRM-1, CRM-2, CRM-3, CRM-8; `views/person-profile.tsx:911-955` | Person card R3, roster seat authority line, company card R3, site access card at the head of the Call Sheet. known(G-14), known(G-15), known(G-7) |
| IA-6 | P1 | high | The person surface is four different documents chosen by role, so a sub's sheet has no engagements or history and an architect gets a studio-role colophon | `views/person-profile.tsx:911-955`; `party-profile-sheet.tsx:497-503`; `PD-10` | One person card with silent regions; the field-party rails (SMS thread, field link) become R2 and R4 inside it, not a separate sheet. known(G-18), touches(G-13) |
| IA-7 | P1 | high | The roster has no window axis: a February radon sub, an August stager, and today's framer all sit in "Build & supply" in trade order | `roster/roster-groups.tsx:9-13`; `lib/document/roster-derivation.ts:228-274`; F-19, F-24 | Group by window: this week · later · done, with bidding apart. known(new), CRM-7 |
| IA-8 | P1 | high | Bidders and crew are indistinguishable on the Call Sheet, so an asked-and-declined firm reads as if it is on the job | `supabase/migrations/00423_trade_scope_instrument.sql:221-222`; `roster/roster-groups.tsx:26` | A Bidding band with due date, who owes the answer, and a dated outcome. new, CRM-20 |
| IA-9 | P1 | med | The head count is unscoped and counts hidden `contact` rows while the list below is scoped and hides them, so the number and the list disagree on screen | `people-room.tsx:115`, `:123`, `:383`; `views/directory-view.tsx:294` | Count what is listed, by card, with the noun the narrowing names. known(G-9) |
| IA-10 | P2 | high | Role chips mix three axes (relation to the studio, kind on a job, entity type) across eleven values, which wraps to two rows inside the 1200px band and cannot absorb the model's new kinds | `views/directory-view.tsx:93-105`; `crm-model.md` CRM-10 | Six chips on one axis (Everyone · Clients · Crew · Makers · Studio · Firms); kind and trade narrow on a second line. new, touches(G-13) |
| IA-11 | P2 | high | Search matches name, role label, company, email only: a phone number, a trade, or a DBA finds nobody, which is how the field actually searches | `views/directory-view.tsx:304-316`; `packages/supabase/src/hooks/use-studio-contacts.ts:145-151` | Match name, firm legal and DBA, `phone_e164` suffix of 4+, trade and specialty label, email, role word. touches(G-9), CRM-32 |
| IA-12 | P2 | high | Companies read a different table with their own loading line, empty copy, and no reach or paper state, so the room holds two directories with two grammars | `views/directory-view.tsx:244-251`, `:458-507` | One list, two entry types, one loading and empty grammar; a firm row carries a paper-state clause. new, touches(G-4) |
| IA-13 | P2 | high | `?person=` resolves against a hard list of 8 roles, so architect, photographer, stager, and rolodex-contact deep links depend on the roster having loaded | `people-room.tsx:173-197` | Resolve a person card id; read the role from the card. new, touches(G-18) |
| IA-14 | P2 | high | A firm cannot be addressed: no `?firm=`, no route, no cross-link from a roster row's company suffix | `people-room.tsx:162-171`; `roster/roster-row.tsx:148-153` | `?firm=<id>` opens the company card; the roster's company suffix links to it. new |
| IA-15 | P2 | med | `?role`, `?view`, and `?scope` are stripped from the address after they are read, so a designer cannot send a teammate a filtered book | `people-room.tsx:151-171` | Keep them; they name what is on screen exactly as `?person` does. new |
| IA-16 | P2 | high | Consent renders per party row while the send gate reduces across the phone, so the Directory and the roster can print "Not asked" on a number the gate refuses | `directory/person-row.tsx:95`; `supabase/functions/_shared/sms.ts:174-185`; F-12 | Print consent against the channel value wherever the number appears, with the date and the job it came from. known(G-3), CRM-4 |
| IA-17 | P2 | high | Reach, consent, field links, and client visibility are all per party row, so one human's reach state differs by job and lapses silently after 90 days with nothing in the Directory | `supabase/migrations/00283_field_links.sql:26-33`; `supabase/migrations/00419_project_roster_wiring.sql:113-118` | Grants list on the person card R2 with end dates; the Directory row shows the strongest live grant. known(G-20), CRM-14 |
| IA-18 | P2 | high | The same human wears three different field sets in three places (Directory row, roster row, picker mini row), each with its own second line | `directory/person-row.tsx:76-99`; `roster/roster-row.tsx:139-161`; `roster/party-mini-row.tsx:45-56` | One row recipe with a declared field order; surfaces choose which fields are silent, never which grammar. new |
| IA-19 | P2 | med | The People room offers no door to a person's seat on a job, and the Call Sheet no door to the person card's history; the two levels are one-way | `people-room.tsx:281-282`; `roster/roster-row.tsx:160` | Seat lines link into the Call Sheet; roster rows link into the person card. new, touches(G-24) |
| IA-20 | P2 | med | Remove on a roster row hard-deletes the party, so an IA that hangs consent, bids, and lineage off the seat would destroy them on a roster edit | `packages/supabase/src/hooks/use-coordination.ts:808-816` | Close the seat with `off_job_at` and a reason; the seat stays on the person card under Past seats. known(G-10), CRM-13 |
| IA-21 | P2 | med | The client side of a roster is a synthetic row with no party behind it, so a household's second member cannot hold a seat or an authority | `lib/document/roster-derivation.ts:85-148`, `:378-395`; F-04, F-05 | Household members are real seats on the Client side band, each carrying its own authority. known(G-15), CRM-19 |
| IA-22 | P2 | med | Vendor reps are not people in the room: a maker row is a firm wearing a person's circle, with the orders email as its address and the human rep unread | `supabase/migrations/00589_return_to_lead_hardening.sql:779-796`; `supabase/migrations/00009_vendor_management.sql:59-76` | A maker is a firm row (square) with its rep as a person card affiliated to it. known(G-19), CRM-17 |
| IA-23 | P3 | high | Directory rows truncate the name and the facts line, which the house sheet forbids, and a seats-beneath row makes the line longer, not shorter | `directory/person-row.tsx:79`, `:85`; house sheet §A4 | Wrap. The facts line runs to two lines before it folds. known(G-23) |
| IA-24 | P3 | med | Archived cards are reachable only through the seed-review sheet, so an archived firm or person has no standing address | `directory/rolodex-seed-sheet.tsx:3-12` | An Archived narrowing on the Firms and people chips; `?person=` and `?firm=` resolve an archived card read-only. known(G-11) |
| IA-25 | P3 | low | The room's rail groups (Directory / Relationships / Practice) put the studio's book on the same shelf as outreach campaigns, which makes the Directory read as one of seven views rather than the room itself | `view-shell.tsx:25-49`; `current-state.md` §A2 | Leave the rail; name the first group "The book" so the Directory reads as the room's ground floor. new |

---

## Decisions I am making for the direction

1. The Directory's unit is the person card, and the party row becomes a seat line beneath it.
2. Firms and people live in one list with one row grammar; a firm is a 42px rounded square, a person a circle.
3. The chip row collapses to six values on one axis; kind and trade narrow on a second line.
4. Reach stays the three access words; a forbidding or routing contact rule prints as its own clause beside them, never merged into a fourth reach word.
5. Consent is printed against the channel value, with its date and origin job, everywhere that number appears.
6. The company card is the only place a compliance document or a payee identity is edited; every other surface reads it.
7. Authority lives on the seat, on the project roster, and is read on the person card.
8. The project roster groups by window (this week / later / done), with bidding as its own band.
9. The site access card sits at the head of the Call Sheet and is owned by the project paper.
10. The person surface is one card with silent regions; the field-party sheet's rails fold into it as regions R2 and R4.
11. `?person=` resolves a person card id, `?firm=` a company card id; `?role`, `?view`, `?scope`, `?trade` stay in the address.
12. The head count counts cards and names its noun; it never counts party rows.
13. Closing a seat is a dated act with a reason; hard delete leaves the roster.
14. Lien waivers, draws, POs, inspections, and staff permission scoping are linked from these cards and owned elsewhere.
15. Rows wrap; no truncation on any face.

---

## Open questions for Kody

1. Firms in the main list: does a firm row appear under **Everyone**, or only under **Firms**? A mixed default list is the honest IA but changes what "28 people" means on the room's head.
2. The client side: do a household's second member and an owner's rep get real seats on the Call Sheet (CRM-19, AM-12), given that both are homeowner-side and S2 says the homeowner is not the customer?
3. Does the studio see a **lapsed COI** as a blocking clause on the roster row, or only on the company card? A blocking clause on the row is close to a status badge, which the house sheet forbids.
4. Bring-forward at the pick: which history line is allowed on a picker mini row (repeat count, verdict, both, neither)? A verdict on a picker row is a judgment about a firm that a co-member wrote.
5. Do `?role` and `?view` staying in the address conflict with the Document's stripping convention elsewhere, or is the People room allowed its own rule?
