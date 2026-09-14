# Everyone on the Job: the People room redesign

One direction, converged from six UX seats over the fifteen-entity CRM model (`crm-model.md` §1) and the Okonkwo fixture. P1 core carried in the room: E1, E2, E4, E5, E6, E7, E8, E9, E10, E12, E15. Linked and not owned: E11 lien waivers (CRM-9), inspections and deliveries (CRM-34), staff permission scoping (CRM-36), maker trade terms and POs (PD-9).

Evidence: `path:line` relative to the worktree, `crm-model.md` §/CRM-n, fixture `F-nn`, current-state `G-n` / `PD-n`, house sheet §.

---

## 1. The direction in ten lines

1. The room's unit changes from the party row to the person card; every project seat becomes a line beneath the human, and a firm becomes a card that owns paper and payment.
2. One list, two entry types: people are circles, firms are 42px rounded squares; eleven role chips collapse to six (Everyone, Clients, Crew, Makers, Studio, Firms) with trade on a second line.
3. Reach moves onto the Directory row, the three words Account / Field link / On paper stay, and a forbidding or routing contact rule prints beside them as a sentence, never as a fourth word.
4. Consent becomes one record per studio per channel value, printed against the number with its date and the job it came from, everywhere that number appears.
5. The company card becomes the only place a compliance document, a payee identity, a signer, or a paperwork contact is written; every other surface reads it.
6. Authority (who signs, up to what number, who only prepares) is written on the seat, defaulted from the agreement, and read on the person card and the Call Sheet.
7. The Call Sheet regroups by window (this week, later, done), puts bidders in their own band, and gains a site access card at its head.
8. Closing a seat becomes a dated act with a reason, Remove stops being a hard delete, and access grants end with the job's window instead of a flat 90 days.
9. Every phone is a live `tel:` link at every width, search matches phone digits, rows wrap instead of truncating, and the bare status dot retires.
10. What stays: the room and its rail, the six other views, MINE / STUDIO with STUDIO default, the Call Sheet as a DocSheet on the letterhead, code-resident vocabulary, and the Document's paper, scored ink, and zero box-shadow.

---

## 2. IA map

### 2.1 Sitemap

```
/people  ·  THE PEOPLE ROOM          studio book · 1200px studio band (PD-14, SPEC §F-Q)
│
├── rail · THE BOOK
│   └── Directory                                        ← the one list
│       ├── chips  Everyone · Clients · Crew · Makers · Studio · Firms
│       ├── line 2 trades (under Crew) · specialties (under Makers)
│       ├── lens   MINE · STUDIO        filters rows, never seats inside a row (PD-5)
│       ├── head   "29 people · 22 firms"   counts cards, never party rows
│       ├── person row (circle)  ──────►  PERSON CARD          ?person=
│       │      ├── tel: link                (its own 44px target)
│       │      └── seat line  ────────────►  PERSON CARD @ seat  ?person=&seat=
│       └── firm row (42px square) ─────►  COMPANY CARD         ?firm=
│
├── rail · RELATIONSHIPS   Threads · Nurture · Reviews        unchanged
├── rail · PRACTICE        Portfolio · Outreach · Your Eye    unchanged
│
├── PERSON CARD    R1 identity · R2 reach & access · R3 contact rule
│                  R4 seats on projects · R5 paper (sole prop only) · R6 history
│      └── seat ───────────────► /doc/<project>?sheet=call
│
└── COMPANY CARD   R1 identity · R2 crew & designations · R3 paper
                   R4 payee · R5 jobs · R6 history
       ├── crew ──────────────► PERSON CARD
       └── paper ─────────────► money book (draws, waivers)   read-only link

/doc/<project>  ·  THE PROJECT PAPER
└── letterhead instrument ─► CALL SHEET (DocSheet, 760px, PD-6)   ?sheet=call
       ├── SITE ACCESS CARD                   owned here
       ├── Studio side  ·  Client side
       ├── On the job · this week
       ├── On the job · later
       ├── Bidding                            never mixed into crew
       ├── Done                               closeout · warranty · off the job
       ├── row ────────────────► PERSON CARD
       └── From the rolodex ──► picker ──► travel-list pane ──► add
```

### 2.2 Object to surface

| Entity | Owned by | Read by |
|---|---|---|
| E1 Person identity | Person card | Directory row, roster row, picker mini row (`roster/party-mini-row.tsx:3-8`), company card crew list |
| E2 Company | Company card | Directory Firms band, person card firm line, roster row company suffix (`roster/roster-row.tsx:148-153`), money book |
| E4 Affiliation | Person card, under the firm | Company card crew list, picker mini row, roster second line |
| E5 Engagement (seat) | Project roster (Call Sheet) | Person card R4, Directory seat lines, Desk |
| E6 Reach channel | Person card (personal lines), company card (office, dispatch, AP, after-hours) | Directory reach word, roster reach chip (`roster/reach-chip.tsx:19-35`), every send rail |
| E7 Contact rule | Person card; one per-job override owned by the seat | Directory row clause, roster row clause, every composer before consent |
| E8 Consent | The consent record, surfaced against the channel value | Person card R2, Directory row, roster row, send gate (`supabase/functions/_shared/sms.ts:174-185`) |
| E9 Access grant | Person card (account tier), the seat that minted it (link tiers) | Reach word derivation (`lib/document/roster-derivation.ts:360-364`), person card R2, roster row |
| E10 Compliance document | Company card (person card only when sole proprietor) | Roster row held clause, picker travel list, site access card, draw line |
| E12 Authority grant | The seat, on the project roster | Person card R4, decision court, approval record, client page "your contact" |
| E15 Site access card | Project paper, head of the Call Sheet | Roster rows (site access mode), field link page, person card seat line for the key holder |
| E11 Lien waiver | Money book (CRM-9) | Company card R4 as a read-only line |
| E13 Touch | The message rails (PD-8) | Person card R6 |
| E14 Lifecycle stage | Stage history, derived | Stage word on the seat and the firm row |
| E3 Household | Client book | Client side band on the Call Sheet, person card R1 |

---

## 3. Screen inventory

Fixture names throughout. Specimen date 2026-10-20. State words are the four families in §3.8.

### 3.1 Directory (`/people`)

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| Room head | "THE PEOPLE ROOM · 29 people · 22 firms" | Add person (primary), Add firm (secondary) | none | count of E1 cards, E2 cards |
| Ask bar | "Find someone, or ask who to reconnect with" | search input | none | client-side match: name, firm legal and DBA, `phone_e164` suffix 4+, trade label, email, role word |
| Chip row | Everyone · Clients · Crew · Makers · Studio · Firms | `role="group"` of `aria-pressed` chips | none | `?role=` (six values, legacy eleven map forward) |
| Trade line | electrical · plumbing · cabinetry · drywall · paint · hvac · carpentry / framing · radon mitigation | chips under Crew | none | `FieldTrade` + `trade_label` |
| Lens | MINE · STUDIO, STUDIO default | two scored words | none | `ContactScope` (PD-5) |
| Person row, identity | "Dana Kowalski" / "Northgate Electric · electrical" | open-person button | none | E1.full_name, E4.company + E5.trade |
| Person row, rule clause | "Text only. The email on file bounces." | none (read) | terracotta leading rule when a hard block | E7.channels_forbidden, E7.reason |
| Person row, words | reach, consent, paper | none (read) | Field link / Texting / Lapsed | E9 strongest live grant, E8, E10 rollup |
| Person row, phone | "(612) 555-0111" | `tel:` link, own 44px target | none | E6 preferred mobile |
| Person row, seats | "Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027" | seats disclosure, `aria-expanded` + `aria-controls` | On the job | E5 |
| Firm row | "Marrow & Sons" / "GC · 3 on the crew · 2 open jobs" | open-firm button | Current | E2, E10 rollup |
| Firm row, payee mark | "Signs: Tom Marrow" | none (read) | plain, uncoloured | E4.is_signer |
| Duplicate band | "These two cards share a phone. Compare them?" | Compare & merge (secondary) | none | dedupe rules 1 to 3 (`crm-model.md` §4) |
| Empty | "Nobody under this narrowing yet." | none | none | house sheet §A10 |

### 3.2 Person card (`?person=`)

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| R1 Identity | "Dana Kowalski", 48px circle, "Northgate Electric · owner-operator, since 2025", "Sole proprietor", "MN electrical contractor licence, personal" | Edit identity (tertiary), Archive (tertiary) | none | E1, E4.role_at_firm, E4.from_date, E4.holds_trade_license |
| R2 Reach & access | §5 in full | Add a channel, Record consent, Mint access, Revoke | Field link, Texting, Lapsed | E6, E8, E9 |
| R3 Contact rule | "Text only. The email on file bounces. Set by Priya Natarajan, 12 Oct 2026." | Edit the rule (tertiary) | terracotta leading rule when a hard block | E7 |
| R4 Seats on projects | "Okonkwo residence · sub · electrical · On the job · 12 Oct 2026 to 13 Aug 2027 · no authority · escorted · contracted through Marrow & Sons · hidden from the client" | Open the Call Sheet (inline), Close this seat (tertiary) | On the job | E5, E12, E5.site_access_mode, E5.contracted_through, E5.show_to_client |
| R4 Past seats | "Lindqvist kitchen · sub · electrical · Closed 21 Nov 2025 · warranty through 21 Nov 2026" | fold | Warranty | E5.off_job_at, E5.warranty_until |
| R5 Paper | sole proprietor only: "COI, general liability · Lapsed 31 Mar 2026 · blocks site access, payment, draw" | Record a document (secondary) | Lapsed | E10 |
| R6 History | "Worked 2 of the studio's projects. Last touch 14 Oct 2026, text, logistics." | none | none | E13, E5 count |

### 3.3 Company card (`?firm=`)

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| R1 Identity | 42px square, "Northgate Electric", "Electrical sub · 1 person · 2 projects · warranty through 21 Nov 2026" | Edit firm (tertiary) | none | E2 |
| R2 Crew & designations | "Dana Kowalski · owner · paperwork contact · signer · site contact · holds the trade licence" | Set paperwork contact / signer / site contact (tertiary) | none | E4 |
| R3 Paper | "COI, general liability · Lapsed 31 Mar 2026 · blocks site access, payment, draw"; "W-9 · on file 2025"; "MN electrical contractor licence · current" | Record a document (secondary), Chase the renewal (tertiary, drafts `awaiting_review`) | Lapsed / Current / Lapses in 30 days / Not on file | E10 |
| R4 Payee | "Remit to Northgate Electric", "Tax id ending 4417", "Retainage 10%" | Edit payee (tertiary) | none | E2.remit_to, E2.tax_id_last4, E2.retainage_bps |
| R5 Jobs | "Okonkwo residence · Dana Kowalski · On the job"; waiver and draw state as a read-only line into the money book | Open the money book (inline) | On the job | E5, E11 read-only |
| R6 History | "First job 2025 (Lindqvist kitchen). Two projects. No verdict recorded." | Record a verdict (tertiary) | none | E14, E1.studio_verdict |

### 3.4 Project roster (Call Sheet, 760px DocSheet)

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| Head | "Call sheet · Okonkwo residence" | From the rolodex (primary), New person (secondary), Print (tertiary) | none | project |
| Site access card | §3.7, folded to one line at the head: "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." | Open the site access card (inline) | none | E15 |
| Vitals | "14 on the job this week · 9 reachable by text · 5 with accounts · 6 on paper" | none | none | E5 window, E8, E9 |
| Studio side | "Priya Natarajan · lead designer"; "Dale Whitcomb · bookkeeper · prepares only"; "Leah Hartwell · principal · approves fee changes" | row | none | `project_team_members`, E12 |
| Client side | "Adaeze Okonkwo · selections"; "Chidi Okonkwo · signs money over $2,500" | row | Account / On paper | E3 members as seats, E12 |
| On the job, this week | Tom Marrow, Erin Sato, Luis Ochoa, Joe Wozniak, Dana Kowalski | row + unfold | On the job | E5.stage, on_site_from/to covering 19 to 25 Oct 2026 |
| Held clause on a row | "Site access held. Northgate Electric's insurance lapsed 31 Mar 2026." | none (read) | terracotta leading rule | E10.blocks |
| On the job, later | Pete Rusk (9 Nov), Rosa Delgado and Frank Bauer (11 Jan 2027), Amara Osei (4 May 2027), Ingrid Halvorsen (5 Apr 2027), Jim Lindgren (1 Feb 2027), Kelly Marsh (1 Feb 2027), Nadia Brooks (Aug 2027), Jonah Feld (Sep 2027) | row | Awarded | E5.on_site_from in the future |
| Bidding | "Rivera Finishes · paint · asked 28 Sep 2026 · due 5 Oct 2026 · No response" | row | No response | E5.bid_due_at, bid_outcome |
| Done | "Granite North · countertop fabrication · Off the job 2 Oct 2026 · slab program went to Stonehaven" | row | Off the job | E5.off_job_at, off_job_reason |
| Row unfold | phone `tel:`, email, consent with source and date, Text, Copy field link, Show to client, Close this seat | acts | Texting / Invited / Opted out / Not asked | E6, E8, E9, E5 |
| Picker (Bring forward) | Rolodex picker opened from the Call Sheet, travel-list pane, multi-select over the Lindqvist kitchen roster | From the rolodex (primary) | Field link / On paper, Texting / Opted out / Not asked | see SPEC §5.7 |

### 3.5 Add / Edit sheet

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| Eyebrow + title | "ADD · TO YOUR ROSTER" / "Bring someone in" | none | none | n/a |
| Kind switch | a client · a household member · a maker · a GC · a sub · an installer · a receiver · someone else | `role="group"`, `aria-pressed` | none | E5.party_kind (widened, CRM-10) |
| Project | "Okonkwo residence" | select | none | E5.project_id |
| Identity | "Joe Wozniak" | field | none | E1.full_name |
| Firm | "Cedar & Iron Framing" (create or match) | field + match list | none | E2, E4 |
| Trade | "carpentry / framing" | select, required for sub and installer | none | E5.trade, trade_label when other |
| Channels | Mobile "(612) 555-0118", typed; Email left empty | typed field rows | none | E6.channel_kind, sms_capable |
| Contact rule | "Text only. No working email." | inline field | terracotta leading rule | E7 |
| Consent block | method "verbal"; evidence "Recorded by Priya at the site kickoff, 13 Oct 2026" | select + prose field | Invited after save | E8.source, evidence_text, status |
| Carried-forward notice | on a rolodex pick: "Opted out by text 3 Dec 2025, on the Lindqvist kitchen." | none (read) | Opted out | E8 read at creation |
| Terminal | "Add to the roster" | terminal act with consequence sentence | none | commits E1, E2, E4, E5, E6, E7, E8 |

### 3.6 Reach & access control

See §5. Mounted identically on the person card in the Directory and on the Call Sheet party sheet; a lighter variant on the company card.

### 3.7 Site access card

| Region | Content (fixture-named) | Control | State words | Source entity/field |
|---|---|---|---|---|
| Head | "Site access · Okonkwo residence · 4412 Fremont Ave S, Minneapolis MN 55409" | none | none | E15.project_id |
| Who to call first | "Luis Ochoa, superintendent, (612) 555-0109"; "Chidi Okonkwo, owner, (612) 555-0105"; "Sam Rowe, architect, (612) 555-0110" | `tel:` links, own 44px targets | none | E15.emergency_lines |
| Way in | "Lockbox, version 3. The code is held off Patina; ask Luis Ochoa."; "Luis Ochoa controls the gate." | Edit (tertiary) | none | E15.lockbox_version, E15.gate_code (see PR-r) |
| Key holder | "Ngozi Eze holds a key. Text only, (612) 555-0106." | opens her person card | Texting | E15.key_holder_engagement_id |
| Hours | "Weekdays 07:00 to 17:00. No Saturday work before 09:00." | Edit (tertiary) | none | E15.site_hours |
| Receiving | "Ngozi Eze receives deliveries. Stage in the detached garage." | Edit (tertiary) | none | E15.receiver_instructions |
| Who was told | "Lockbox changed 16 Oct 2026 by Priya Natarajan. Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana Kowalski." | Log who was told (secondary, inline band) | none | E15.changed_at, changed_by, told_refs |

### 3.8 The four word families (shared, defined once)

| Family | Words | Current (sage) | Pending (golden) | Blocked (terracotta) | Dormant (ink-faint) |
|---|---|---|---|---|---|
| Reach (E6/E9) | Account · Field link · On paper | Account | Field link | not used | On paper |
| Consent (E8) | Texting · Invited · Opted out · Not asked | Texting | Invited | Opted out | Not asked |
| Stage (E5/E14) | On the job · Bidding · Awarded · Closing out · Warranty · Prospect · Declined · No response · Off the job | On the job | Bidding, Awarded, Closing out | not used | Prospect, Declined, No response, Warranty, Off the job |
| Paper (E10) | Current · Lapses in 30 days · Lapsed · Not on file | Current | Lapses in 30 days | Lapsed | Not on file |

Not printed for lender or inspector firms: a firm whose only people are inspectors or lenders holds no compliance paper for the studio and carries no paper word at all, on any surface.

Authority (E12) is never a state word. It prints as plain uncoloured text: "Signs money to $2,500", "Selections", "Prepares only", "Holds a key", "Controls the gate".

### 3.9 Seat conflicts resolved

| Conflict | Seats | Pick | Reason |
|---|---|---|---|
| C1 Stage on a cross-project Directory row | VC-3 §1 wants a stage word column; IA §2 wants the most advanced live seat's stage; VC open Q3 doubts both | Stage prints only on a seat line, never as a person-level column | One human holds many seats with many stages; a single person-level stage is a fabrication the model does not claim |
| C2 Row measure | VC-3 widens Directory rows to 1104px in the 1200 band; `people-room.tsx:428` caps the main panel at 760px; IX-17 leaves it open | Directory widens to the 1200 studio band (PD-14, SPEC §F-Q); the Call Sheet stays a 760px DocSheet with two word columns plus the unfold | The Directory is the studio's ledger and needs five columns; widening a DocSheet would break PD-6 |
| C3 Do-not-contact as a reach word | Orchestrator allows extending the three reach words; VC-3 §2.4 and IA decision 4 say prose | Prose clause beside the reach word, terracotta leading rule only for a hard block | Access tier answers "how", a contact rule answers "how not"; merging them loses one axis |
| C4 Reach word rendering | FM-3 wants plain text on the Directory row; VC-3 wants a bordered mono word column | Bordered word column at 1440; plain inline text, no border, at 390 | FM's constraint is width, VC's is scanability; both hold at their own width |
| C5 Second household member | IX-5 wants a seventh Add kind "a household member"; LH-5 wants `client_rep` in the front door | One new kind, "a household member", which writes a household membership plus a `client_rep` engagement; the string `client_rep` never appears on a face | One door, the studio's words, no schema word on a face (brief §7) |
| C6 Sequencing the view rebuild | AX-4 and AX open Q2 want `people_directory` rebuilt before the seats-beneath UI; IA and IX want the room now | The view rebuild is P1 and lands before the seats-beneath Directory; P1's first wave ships reach, rule, and the honest count against the existing view | Building seats on the six-branch view bakes in the per-project duplication the redesign exists to remove |
| C7 Signer with a do-not-contact rule | FM-11 says never surface the do-not-contact person's number on a company card; IA §4 R2 lists the signer among crew | Frank Bauer is named as signer on Twin Cities Drywall & Plaster's card with no channel printed; the routed channel shown is Rosa Delgado's | The rule outranks the designation; a name is not a channel |
| C8 Which firm is open in `#state-company` | Orchestrator names Marrow & Sons with a lapsed COI; fixture F-07 gives Marrow a current COI (31 Mar 2027) and F-11 gives Northgate Electric the only lapse (31 Mar 2026); IX-19 flags the same mismatch | `#state-company` opens Northgate Electric, COI lapsed; Marrow & Sons appears as a firm row in `#state-directory` reading Current | The fixture-only rule outranks the example firm name; the state id is unchanged so the deck's switcher still works |
| C9 Row treatment | VC-6 replaces bordered white card rows with hairline-ruled ledger rows; VC open Q4 asks whether that reads colder | Hairline-ruled ledger row | Five word columns on a card-grid row reads as a table wearing a card; house sheet §A4 and §A9 already set the ledger idiom |
| C10 Consent gate during migration | IX-2 and AX-7 repoint the gate at the new record; AX open Q1 warns against two sources of truth | The gate reads `studio_channel_consent` first and keeps the phone-global reduction in `sms.ts:174-185` as a fail-closed secondary check until backfill is proven; only the new table is ever written | Two checks that both fail closed are safe; two writers are not |
| C11 Row structure | FM-6 splits the row into an open-profile target and a `tel:` target; AX-3 splits it into an open-person button and a seats disclosure | One container, three sibling targets: open person, `tel:`, seats disclosure | Both constraints are real and compose; an anchor cannot nest in a button and a run-on accessible name cannot be tabbed into |
| C12 Phone and email digits on a face | FM's memo used ad hoc numbers; fixture.md carries no digits | Deterministic derivation: `(612) 555-01NN` where NN is the F-nn row number; email `<first>@<firm-slug>.com` | Keeps every face fixture-traceable and makes both widths agree byte for byte |
| C13 Paper word on lender and inspector firms | CR2-11 and CR3-3 flag "Not on file" reading as a compliance gap for a firm that never owed the studio paper | Firms whose only people are inspectors or lenders (Great Northern Bank, City of Minneapolis CPED Inspections) hold no compliance paper for the studio, so they print no paper word at all, on the Directory firm row, the company suffix, and the company card's Paper region (one line: "No paper is held for this firm.") | A word that reads "Not on file" or blocked implies an obligation that was never the studio's to collect (Fable, ruling round 3) |
| C14 Task 2 acceptance criterion | CR3-2 flags that no invoice or CO screen exists in this build, so an acceptance criterion naming one cannot be met | Task 2's acceptance is a login and an authority grant recorded as two separate facts, visible on the person card and the Call Sheet's client side; the invoice and change-order surfaces read it later, in the money book | The fact must be recorded and visible in this room; where it is read later is a different room's build (Fable, ruling round 3) |
| C15 Bring-forward as its own state | CR3-1 asks for the rolodex picker's travel-list pane to be a specimen state, not only a described mechanism | A seventh state, `#state-pick`, added to both specimens per SPEC §5.7, with a "Bring forward" button in the state bar between Project roster and Add sheet | A mechanism this central to Leah task 5 needs a face to review, not only a table row (Fable, ruling round 3) |
| C16 Vitals line on the Call Sheet | DR4-2 and CR4-5 flag that SPEC §5.4 #3's literal did not match the fixture's true tally | Fable | The vitals literal becomes "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper", recomputed against fixture §4's engagements; no specimen change is owed since both files already print this string | A vitals line is a fact, not a placeholder; the count must be the fixture's own arithmetic, not a round number (Fable, ruling round 4) |
| C17 Stage word on the Directory person row | DR4-3 flags SPEC §5.1/§6.1 still describing a fourth, stage word column, in tension with PR-p and C1 | Fable | The person row carries exactly three bordered word columns — reach, consent, paper. Stage prints only on the seat line beneath. The company row is unchanged: two columns, paper and payee marker | PR-p already ruled stage off the row; the SPEC text had drifted back to a fourth column and needed to be brought back in line (Fable, ruling round 4) |
| C18 Lender and inspector firms as visible Directory rows | DR4-1 and TR4-4 ask that C13's rule be demonstrated, not only stated | Fable | Great Northern Bank and City of Minneapolis CPED Inspections appear as Directory firm rows, under Everyone and under Firms, with no paper word and no payee marker; the head count of 22 firms already includes them | A rule nobody can see on the face is not yet built; C13 needed a row on screen, not only a table entry (Fable, ruling round 4) |
| C19 Bring-forward footer ordering | DR4-5 and DR4-6 flag the act row and its consequence sentence printing out of order, and the checkboxes and "Put back" reading as gated | Fable | The act row ("Add four to the roster" · "Put back") comes first, the consequence sentence directly beneath it, at both widths; the checkboxes and "Put back" are live at both widths | A consequence sentence that follows the act it explains reads backwards; nothing in this flow is gated (Fable, ruling round 4) |
| C20 Add sheet authority wording | DR4-7 and TR4-1 ask for the authority field's two branches to read exactly, in both files | Fable | When the source engagement carries authority: "Defaulted from the agreement. Confirm it, or write a different one." with the act "Confirm from the agreement". When it does not: "Nothing defaulted from the agreement." with the act "Record the authority" | Two branches need two exact strings, not a paraphrase per builder (Fable, ruling round 4) |
| C21 Company card Paper region, every firm | TR4-2 flags that only firms with a `documents` array in the fixture were rendering a Paper region | Fable | Every company card renders the Paper region. A firm with no `documents` array prints paper word "Not on file" with the act "Record a document". A lender or inspector firm (C13) prints only "No paper is held for this firm." and no act | A missing region reads as an oversight, not as a fact about the firm; "no documents" and "never owed paper" are different facts and need different faces (Fable, ruling round 4) |
| C22 Routed contact line, full channel | TR4-2 flags "Write Rosa Delgado instead." printing without a way to actually reach her | Fable | The routed line prints Rosa Delgado's email and her office phone as a `tel:` link, at both widths, under one channel-selection rule used everywhere a channel is chosen for display: email if present, then the office phone tel-linked, never a bare phone string | A routing instruction with no channel attached sends the reader nowhere; C7's "a name is not a channel" cuts both ways (Fable, ruling round 4) |
| C23 390 Directory row words | CR5-1 flags that at 390 a folded row was dropping consent and paper, leaving only reach visible at a glance | Fable | At 390 every person row's line 2 prints reach · consent · paper as three plain inline words (no border, separated by a middle dot) on EVERY row, folded or not; stage prints only on the seat line inside the unfold. SPEC §5.1 #7's bordered columns apply at 1440 only | A narrow row that hides consent and paper until unfold hides exactly the facts a studio scans fastest for (Fable, ruling round 5) |
| C24 Ray Thao's row, paper word | CR5-3 flags SPEC §5.1 #11 printing paper "Not on file" for an inspector who never owed the studio paper | Fable | SPEC §5.1 #11 drops the paper "Not on file" clause; lender and inspector people print no paper word, extending C13's firm-level rule to the person row (R-A) | The same fact that exempts the firm exempts the person who works for it; one obligation, one exemption (Fable, ruling round 5) |
| C25 Claire Bissett's consent | DR5-3 flags her consent left `null` where the face needs a printable word, and that her row must read her actual firm's paper state | Fable | The fixture JSON in SPEC §3 sets Claire Bissett's (F-20) consent to "Not asked"; her 1440 row prints three bordered words — reach `On paper`, consent `Not asked`, paper `Current` — since Stonehaven Tile Gallery holds a current W-9 | A blank consent field is not a fact; and a maker's paper word must reflect her own firm's document, not a guess (Fable, ruling round 5) |
| C26 Company card Paper region order | DR5-4 flags the table, clause, consequence sentence and act row printing in an order that read as scrambled | Fable | The company card's Paper region prints in one fixed order at both widths: the table, then the leading-rule clause, then the consequence sentence, then the act row | A region a studio reads under time pressure needs one predictable order, not a per-firm shuffle (Fable, ruling round 5) |
| C27 Consent sentence, one wording | DR5-2 flags the consent sentence rendering with different phrasing at different call sites | Fable | One wording everywhere, at every call site, both files: "<Source> consent, <d Mon yyyy>, on the <project>." — "Written consent, 2 May 2025, on the Lindqvist kitchen."; "Verbal consent, 13 Oct 2026, on the Okonkwo residence."; "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." | A fact recorded once should read the same wherever it surfaces; three phrasings for one fact reads as three facts (Fable, ruling round 5) |
| C28 Bid note on a roster row | TR5-4 flags a roster row with bid history printing the dates at 1440 only | Fable | A roster row with a bid history prints it at both widths: "Quoted 2 October 2026. Selected 9 October 2026." | A studio checking the roster on a phone needs the bid history as much as at a desk (Fable, ruling round 5) |
| C29 Blocked clause, everywhere a rule shows | TR5-5 flags a blocking rule's clause appearing on some faces and not others | Fable | A blocked rule clause prints wherever a rule is shown — Directory row, roster row, person card, company card crew line — whenever the rule blocks, with the routed line appended only when a route exists, at both widths | A block that only sometimes shows its own clause reads as an inconsistent rule, not a consistent one applied inconsistently (Fable, ruling round 5) |
| C30 Opted-out note on a collapsed roster row | TR5-6 flags Pete Rusk's opted-out note appearing only inside the unfold, invisible on the collapsed row | Fable | The opted-out note prints on the collapsed roster row, at both widths; a sub the studio may not text must be visible at a glance, not one click deep | The cost of a missed opt-out is a compliance violation; that fact cannot hide behind an unfold (Fable, ruling round 5) |
| C31 Site-access summary under the Call Sheet heading | TR5-3 flags `#state-pick`'s Call Sheet head printing with no site-access summary, though SPEC §5.4 #2 requires one on the roster proper | Fable | The site-access summary line "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." prints under the Call Sheet heading at both widths, including behind the `#state-pick` picker | The Call Sheet heading is the same heading in both states; a fact that belongs under it does not disappear because a picker sits in front (Fable, ruling round 5) |
| C32 Person-card regions on a person with no record | DR6-1 and TR6-1 flag the 390 card dropping the Contact rule, Access grants and Seats regions whole when the person carries no rule, no grant or no seat, so a card read on a phone could not say whether the fact was absent or the region was missing | Fable | Every person card prints all regions with their sub-heads at both widths. When a record is absent the fallback line reads exactly "No contact rule on file.", "No grant on file.", "No open seat on this project.", as the 1440 file already does (R-V) | A region that vanishes reads as an oversight; a region that says "none on file" reads as a fact. The studio must be able to tell the two apart at a glance (Fable, ruling round 6) |
| C33 Crew-line link scope on the company card | DR6-2 flags the 390 crew line wrapping the name, the role and every designation in one link, so the control's accessible name ran on for a whole sentence | Fable | On the company card's crew line only the person's name is the control — a button whose accessible name is the name — at both widths; the designations are plain text (R-W) | A designation is a fact about a seat, not a door to a card; a run-on accessible name cannot be scanned by ear, and C11's split already set this grammar for the Directory row (Fable, ruling round 6) |
| C34 Site access tap target at 390 | DR6-3 reads the 390 site access card linking the whole who-to-call line where 1440 links only the digits, and files it as a width parity gap | Fable | At 390 the whole "who to call first" line is the `tel:` target, at least 44px tall; at 1440 only the phone digits are linked. SPEC §6.2 now names this explicitly; it is not a parity finding (R-X) | A thumb on a job site reaching for eleven digits is the one target that must be generous; the widths are allowed to differ where the hand differs (Fable, ruling round 6) |
| C35 Duplicate band with a dead act | CR2-8, carried as CR3-5 and CR4-2 through four rounds: "These two cards share a phone. Compare them?" names no cards, and its "Compare & merge" button has no target or handler in either file | Fable | The Compare & merge sheet is phase 2 (§8), so the specimen carries no Compare & merge act. The band reads "These two cards share a phone." followed by the two names, Adaeze Okonkwo and Chidi Okonkwo, each a live open-person control opening that person's card. SPEC §5.1 #17 amended to say exactly this (R-Y) | A band that claims a collision it will not name, behind a button that does nothing, asks the studio to redo the detection the band says it already did. Naming the two cards and making each a door pays the notice off with what P1 actually has; the merge itself waits for P2, where it was always scheduled (Fable, ruling round 7) |
| C36 State section ids collide with hash tokens | R7-1 flags the 390 file giving its seven state sections `id="state-<x>"`, the same strings the specimen uses as hash tokens, so a hash navigation is also a fragment jump to the element it is meant to switch | Fable | No element id may equal a hash token. The 390 file's state sections take the 1440 file's `id="face-<state>"` pattern, with a hash-to-id lookup, and every `getElementById` call site follows (R-Z) | The two files were already split on this: 1440 separated the token from the id and 390 did not. One pattern, the safer one, in both (Fable, ruling round 7) |
| C37 Directory seat lines that do not open | R8-1 flags the 1440 Directory seat line rendering as a real, focusable, enabled `<button class="seat-row">` with no handler — eleven in the DOM, five visible on a plain `#state-directory` load — while 390 renders the same content as a non-button `<li>` | Fable | A seat line under a Directory person row is a button at both widths whose accessible name is the seat's text, and activating it opens that person's card by the same open-person path as the row's name, announcing the card in `role="status"`. The 1440 `button.seat-row` takes `data-person`; the 390 `li.seat[tabindex="0"]` becomes a `button[data-open-person]` with button chrome reset, styling unchanged (R-AA) | The seat is the reason the person is in the Directory at all, so the line naming it is a door, not a label. Two builders disagreed on the element; the answer is neither an inert button nor an unopenable row, but one live door at both widths (Fable, ruling round 8) |
| C38 Enabled acts that write nothing | R8-2 reports twelve act/state pairs across both files — Edit the rule, Revoke, Send a text, Record a document, Chase the renewal, Text, Copy field link, Show to client, Close this seat, Add four to the roster, Add to the roster, Save this note — as inert under round 8's literal rubric, while noting each sits beneath a consequence sentence and none was flagged across six prior rounds | Fable | These acts are deliberately inert. The specimens are design specimens, not a prototype of writes. Each stays an enabled, focusable button beside its consequence sentence: no `aria-disabled`, no caveat on the face. SPEC §7 gains rule 13 stating this (R-AB) | A specimen shows the studio what the act will say and what it will cost; wiring the write is the build's job, not the specimen's. Marking these disabled would teach the wrong shape, and a caveat on the face is forbidden by §8 #8. C37 is different in kind: there the element promised a door the file already had (Fable, ruling round 8) |

---

## 4. Component inventory

| Component | New or changed | Today's file | Change in one line |
|---|---|---|---|
| `PeopleRoom` | changed | `apps/designer-portal/src/components/document/people/people-room.tsx` | Widen to the 1200 band, count cards not rows (`:383`), stop stripping `?role` / `?view` / `?scope` (`:151-171`), resolve `?person=` by card id and add `?firm=` |
| `DirectoryView` | changed | `.../people/views/directory-view.tsx` | One list of two entry types, six chips replacing eleven (`:93-105`), rolodex person cards no longer excluded (`:294`), search matches phone digits and trades (`:304-316`) |
| `PersonRow` | changed | `.../people/directory/person-row.tsx` | Hairline ledger row, three sibling targets, reach + consent + paper words, rule clause, seat lines, wrap instead of truncate (`:79`, `:85`) |
| `CompanyRow` | changed | `.../people/directory/company-row.tsx` | Paper word wired into the existing `statusDot` slot (`:60-64`), payee marker, kind from an enum not five UI labels (`:34-40`) |
| `SeatLine` | new | none | One engagement under a person row: project, kind, trade, stage word, window |
| `StateWord` | new | none | The one bordered mono word used by all four families; replaces three palettes |
| `StatusDot` | retired | `.../people/person-bits.tsx:206-214` | Bare `aria-hidden` colour circle deleted; every state carries a visible word |
| `ConsentChip` | changed | `.../people/person-bits.tsx:172-203` | Rebound to the shared four tokens; `dotOnly` shape promoted to the general state-dot primitive |
| `RoleBadge` | changed | `.../people/person-bits.tsx:148-155` | Raised to the 12px `.t-meta` floor, `--color-dusty-blue-ink` added, identity hues kept off the four state tokens |
| `RolodexMarker` | changed | `.../people/directory/person-row.tsx:29-37` | `rounded-[16px]` pill redrawn at the shared 3px box |
| `Avatar` | changed | `.../people/person-bits.tsx:117` | Person circle fixed at 34px in every row context; 42px reserved for the company square and card headers |
| `TradeChipRow` | changed | `.../people/directory/trade-chip-row.tsx` | Becomes the second filter line under Crew and Makers; wrapped in `role="group"` with a label |
| `ScopeLens` | unchanged | `.../people/directory/scope-lens.tsx` | STUDIO default stands (PD-5) |
| `AskBar` | unchanged | `.../people/directory/ask-bar.tsx` | Routing keywords widened to the six chips only |
| `AddPersonSheet` | changed | `.../people/directory/add-person-sheet.tsx` | Two new kinds (a household member, someone else), typed channel rows, a contact-rule line, carried-forward consent notice at pick (`:217-229`, `:399-416`) |
| `PartyProfileSheet` | changed | `.../people/party-profile-sheet.tsx` | Folds into the person card as regions R2 and R4; `disabled` replaced by `aria-disabled` + `aria-describedby` (`:610`, `:704`, `:762`, `:873`) |
| `PersonProfile` | changed | `.../people/views/person-profile.tsx` | Four role-branched documents (`:911-955`) collapse to one card with silent regions |
| `ReachAccess` | new | none | Channels, Contact rule, Access grants; reads live from the person or company card, never per engagement |
| `ContactRuleLine` | new | none | The E7 sentence, with a 2px `--terracotta-ink` leading rule for a hard block |
| `CompanyCard` | new | none | Six regions; the only writer of a compliance document or a payee identity |
| `ComplianceTable` | new | none | E10 rows with type, number, issuer, expiry, paper word, held by, blocks |
| `AccessGrantList` | new | none | E9 rows over `v_access_grants`, with end dates and a Revoke act |
| `CompareMergeSheet` | new | none | Its own DocSheet from a Directory duplicate-hint band; never a control inside Reach & access |
| `TravelListPane` | new | `.../roster/rolodex-picker.tsx:188-215` | Second pane in the picker showing the fixed travel list and multi-select before one confirm |
| `PartyMiniRow` | changed | `.../roster/party-mini-row.tsx` | Inherits the shared row grammar; carries reach and paper words at the pick |
| `CallSheet` | changed | `.../roster/call-sheet.tsx` | Site access card at the head; `?sheet=call` becomes addressable while staying an instrument (PD-6) |
| `RosterGroups` | changed | `.../roster/roster-groups.tsx:9-13` | Build & supply replaced by this week / later / bidding / done |
| `RosterRow` | changed | `.../roster/roster-row.tsx` | `tel:` sibling target, held clause, authority phrase, `aria-controls` on the unfold (`:129-131`, `:165`), Remove becomes Close this seat (`use-coordination.ts:808-816`) |
| `ReachChip` | changed | `.../roster/reach-chip.tsx` | Rebound to `StateWord`; three words unchanged (PD-12) |
| `SiteAccessCard` | new | none | E15, studio-only, one card per project, notice log as an inline band |
| `NoticeLog` | new | `.../roster/roster-row.tsx` confirm band | Reuses the inline confirm-band grammar for "log who was told" |
| `TelLink` | new | none | Every phone at every width, its own 44px target, 8px from the row target |
| `DocSheet` | unchanged | `.../overlays/doc-sheet.tsx:24-45`, `:190-260` | Every new sheet mounts through it; no new overlay primitive (AX-16) |
| `people-derivation.ts` | changed | `apps/designer-portal/src/lib/document/people-derivation.ts:197-253` | `deriveStatusDot` retired; stage comes from E5, not from SMS consent |
| `roster-derivation.ts` | changed | `apps/designer-portal/src/lib/document/roster-derivation.ts` | Window grouping replaces trade ordering (`:228-274`); synthetic client row (`:85-148`) replaced by real household seats; vitals read the window (`:402-415`) |
| `directory-roles.ts` | changed | `apps/designer-portal/src/lib/document/directory-roles.ts:15-27` | Eleven values to six, with a legacy forward map |
| `field-config.ts` | changed | `packages/types/src/field-config.ts:18-41`, `:110-121` | Kinds widened (client_rep, inspector with subtype, lender, engineer, vendor, other_named); trades widened (radon mitigation, insulation, waterproofing, roofing, septic) |
| `studio-config.ts` | changed | `packages/types/src/studio-config.ts:169-175` | Stage and paper word families added beside `ReachState` |
| `globals.css` | changed | `apps/designer-portal/src/app/globals.css:11-47` | One alias block mapping `--sage` / `--golden` / `--terracotta` / `--ink` onto the shipped `--color-*` names, plus `--color-dusty-blue-ink` |

---

## 5. Reach & access control

One component. Three fixed sections in this order, never merged with Documents or Authority. Reads live from the person or company card, never from an engagement (IX-18, `crm-model.md` D-A).

### 5.1 Sections and rows

| Section | Row | Fields on the row | Fixture example |
|---|---|---|---|
| Channels | one per E6 | kind (Mobile / Office / Dispatch / After hours / AP email / Email / App / Account / Field link / On paper / 311 portal), value as `tel:` or `mailto:`, PREFERRED marker, verified date, consent word for SMS and email | "Mobile · (612) 555-0111 · preferred · verified 12 Oct 2026 · Texting" |
| Channels, held | dead, bounced, unsubscribed, opted out | `--rail` ground, 2px `--terracotta-ink` leading rule, reason in words | "Email · dana@northgateelectric.com · This address bounced back, 12 Mar 2026. Texts and calls still reach them." |
| Contact rule | one, or the collapsed do-not-contact line | allowed, forbidden, route to (a link to another person card), hours, reason, who set it and when | "Text only. The email on file bounces. Set by Priya Natarajan, 12 Oct 2026." |
| Access grants | one per E9 | tier word, what it opens, granted date, last used, ends, Revoke | "Field link · the Call Sheet and the site access card · minted 12 Oct 2026 · used 17 Oct 2026 · ends with the job, 13 Aug 2027" |

Company variant: Channels holds only firm lines (office, dispatch, AP email, after hours); Contact rule is replaced by three designations (paperwork contact, signer, site contact) linking to person cards; Access grants lists firm-scoped tokens only.

### 5.2 Consent

| Rule | Statement |
|---|---|
| Key | One record per `(organization_id, channel_kind, channel_value)`. Never per project, never per row (CRM-4, G-3) |
| Display | Printed against the channel value with source, date, and origin job, everywhere the number appears |
| Birth | A new seat on an opted-out number is born reading "Opted out 3 Dec 2025, on the Lindqvist kitchen", never "Not asked" (F-12) |
| Way back | Only a fresh recorded consent with source and evidence, or an inbound START. The prior opt-out is kept as history, never erased |
| Gate | The send gate reads the record first and keeps `sms.ts:174-185`'s phone-global reduction as a fail-closed secondary check (C10) |

### 5.3 Grants

| Rule | Statement |
|---|---|
| Lifetime | Defaults to the engagement's `on_site_to`, not 90 days (CRM-14). Renews on use |
| Warranty | A firm's warranty term may extend the end date, by the studio's choice at mint (PR-l) |
| Display | The end date prints in words on the row; remaining days print only inside 14 days |
| Revoke | Two-step inline confirm with an optional reason. Never a modal |
| Read | `v_access_grants`, a `security_invoker` UNION over the eleven token tables. Writes stay in each table's own RPC |

### 5.4 States

| State | Trigger | Look |
|---|---|---|
| Empty | no channels, no grants | "Nothing on file yet. Add a phone or email to reach them." |
| Clear | normal | plain rows, ink only |
| Held | dead or bounced email, opted-out channel, revoked grant, lapsed-document echo | `--rail` ground, 2px `--terracotta-ink` leading rule, reason in words (§A14). No dot, no badge, no opacity |
| Do not contact | `channels_forbidden` covers every channel | Channels collapses to one line: "Do not contact directly. Write Rosa Delgado instead." plus Edit the rule. Channels are hidden, never deleted |
| Editing | a row's edit act pressed | fields on paper (§A14): label always visible, no `placeholder` |
| Read only | viewer's tier lacks edit rights | tertiary words only, no acts rendered |

### 5.5 Keyboard

| Interaction | Behaviour |
|---|---|
| Tab | row to row inside a section, then to the next section's first row |
| Tab inside an open row | type select, value, preferred toggle, then read-only words |
| Enter / Space on a chevron | expands or collapses that row; `aria-expanded` paired with `aria-controls` |
| Enter / Space on an act | activates it |
| Escape | cancels an open inline edit without saving; focus returns to the opening act |
| Revoke, Mark opted out | two-step; the first press opens an inline confirm reachable by keyboard |
| Focus ring | `outline: 2px solid var(--clay-ink)`, offset 2px (§A5). Never a moved border |
| Gated act | `aria-disabled="true"` plus `aria-describedby` plus a visible consequence sentence. Never `disabled` |
| Announcement | consent, grant, and document changes print into the room's existing `role="status"` line (`people-room.tsx:459-460`) |

### 5.6 Copy

| Slot | Copy | Source |
|---|---|---|
| Empty | "Nothing on file yet. Add a phone or email to reach them." | new |
| Invite with no phone | "Add a phone number to invite this party to texts." | quoted, `party-profile-sheet.tsx:893` |
| Opted out | "They opted out by text. Only they can rejoin by replying START." | quoted, `party-profile-sheet.tsx:784` |
| Consent checkbox | "They gave prior express consent for text updates" | quoted, `party-profile-sheet.tsx:800` |
| Consent method | "How consent was given" / "Choose a method" | quoted, `party-profile-sheet.tsx:811`, `:828` |
| Consent evidence | "Where and when they agreed, e.g. signed site kickoff form on Aug 8" | quoted, `party-profile-sheet.tsx:842` |
| Rule empty | "No rule set. Every channel above is fair game." | new |
| Do not contact | "Do not contact directly. Write Rosa Delgado instead." | new, F-14 / F-15 |
| Mint consequence | "This opens the Call Sheet and the site access card to Erin Sato until the job's window closes, 13 August 2027. It never opens billing or the agreement." | new, §A6 |
| Revoke reason | "Say why the door closes. Optional, kept with the record." | new |
| Field link row | "Field link. Ends with the job, 13 August 2027. Renews when they use it." | new |
| Bounced email | "This address bounced back, 12 March 2026. Texts and calls still reach them." | new |
| Carried consent | "Opted out by text, 3 December 2025, on the Lindqvist kitchen." | new, F-12 |
| Held by paper | "Site access held. Northgate Electric's insurance lapsed 31 March 2026." | new, F-11 |

---

## 6. The six Leah tasks

| # | Task | Acceptance criterion | Met by | Clicks today | Clicks proposed | LH max |
|---|---|---|---|---|---|---|
| 1 | Add Dana Kowalski text only, so nobody emails her | A rule on the person that every add, every send, and every future edit honours without retyping | Person card R3, Add sheet contact-rule line, picker travel list | 3 to add, rule impossible (LH-1, LH-2) | 4 to add from the rolodex, 2 to set the rule | 2 for the rule |
| 2 | Give Adaeze the app; record that Chidi signs money over $2,500 | A login and an authority grant recorded as two separate facts, the grant visible on the person card and on the Call Sheet's client side. The invoice and change-order surfaces read it later, in the money book | Add sheet (a client, a household member), Call Sheet Client side, person card R4 | 4 to invite, 5 for Chidi through a different room's instrument, 0 for authority (LH-3, LH-4, LH-5) | 3 to invite, 2 for the household member, 1 to confirm the authority defaulted from the agreement (4 when composed by hand) | 2 per fact |
| 3 | Who has site access on Okonkwo right now | Key holder, gate control, hours, and who was told last, from one screen | Site access card at the head of the Call Sheet | unanswerable at any count (LH-6, LH-7) | 1 | 1 |
| 4 | Mark Frank Bauer do not contact; route to Rosa Delgado | Every attempted contact and every future pick shows "write Rosa instead" | Person card R3, Directory row clause, roster row clause, company card C7 | 2 to look, 0 to set (LH-8, LH-10) | 2 | 2 |
| 5 | Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo | Each arrives with current consent, document status, and one history line, never with old pricing | Rolodex picker travel-list pane with multi-select | 9 for three subs, dead end for Claire Bissett (LH-11, LH-14, LH-15) | 6 for all four (search, select four, one confirm) | 2 per person |
| 6 | Everyone on Okonkwo by role, this week | The roster narrows to who is on site this week, leaving out unopened and closed windows | Call Sheet window bands | 1 to see everyone ever added, 0 to narrow (LH-16, LH-17) | 1 to open already grouped, 2 to narrow by role | 2 |

---

## 7. Data changes

Adjusted from AX §B. Cost bands: S = one additive migration and one surface. M = migration plus a view plus two to four surfaces. L = migration plus backfill plus a send-path repoint. XL = L plus a flagged parallel-run view.

| Table | Reuse / extend / new | Columns | RLS | Cost | Risk | Phase |
|---|---|---|---|---|---|---|
| `studio_contacts` (person) | extend | `reach_preference`, `never_text`, `do_not_contact`, `do_not_contact_reason`, `is_sole_proprietor`, `studio_verdict`, `studio_verdict_at` | `is_active_studio_member(organization_id)` | S | Low, additive on a stable table | P1 |
| `studio_contacts` (company) | extend | `legal_name`, `dba_name`, `company_kind` enum, `trades[]`, `w9_on_file_at`, `tax_id_last4`, `remit_to`, `retainage_bps`, `warranty_until`, `paperwork_contact_person_id`, `signer_person_id`, `site_contact_person_id` | same | M | Med, `contact_kind` free TEXT to enum touches every filter chip (`00417:82-87`, `company-row.tsx:34-40`) | P1 |
| `studio_person_affiliations` | new | person_id, company_id, role_at_firm, is_paperwork_contact, is_signer, holds_trade_license, from_date, to_date | `is_active_studio_member` via the owning card's org | S | Low, no existing reader | P1 |
| `project_parties` | extend | `stage` enum, `on_site_from`, `on_site_to`, `site_access_mode`, `contracted_through`, `off_job_at`, `off_job_reason`, `company_id` fk, `warranty_until`, `warranty_contact_person_id`, bid fields | `is_studio_comember(designer_id)` (`00584:884-921`) | M | Med, `stage` displaces the consent-derived dot; every reader of `deriveStatusDot` needs a pass | P1 |
| `studio_contact_channels` | new | owner_type, owner_id, channel_kind, value, label, sms_capable, verified, verified_at, preferred, status, status_at | `is_active_studio_member` via the owner | M | Med, becomes the join every send path repoints to | P1 |
| `studio_contact_rules` | new | subject_type, subject_id, channels_allowed[], channels_forbidden[], route_to_person_id, contact_hours, escalation_by_class, reason, set_by, set_at | person rows `is_active_studio_member`; job overrides `is_studio_comember` | S | Low to med, omission fails closed, not open | P1 |
| `studio_channel_consent` | new | PK (organization_id, channel_kind, channel_value) plus every 00432 evidence column plus `origin_project_id` | `is_active_studio_member(organization_id)` | L | High, the send gate, the STOP handler and every chip repoint at once; backfill must preserve opted_out precedence | P1 |
| `project_parties.sms_consent_*` | demote | read-only cached mirror during transition | unchanged | S | Med, two readers, one writer (C10) | P1 |
| `studio_compliance_documents` | new | holder_type, holder_id, doc_type, number, issuer, issued_on, expires_on, file_path, verified_by, verified_at, held_by, blocks[] | `is_active_studio_member(organization_id)` | M | Med, every gate depends on `blocks` being right from day one | P1 |
| `project_party_authority` | new | engagement_id, scope, threshold_cents, prepares_only, copy_to[], source_clause, granted_by, effective_from, effective_to | `is_studio_comember(designer_id)` via the project | M | Med, wrong defaults silently over- or under-grant | P1 |
| `project_site_access_cards` | new | project_id 1:1, gate_code (see PR-r), lockbox_version, alarm_ref, key_holder_engagement_id, site_hours, site_notes, emergency_lines[], receiver_instructions, changed_at, changed_by, told_refs[] | `is_studio_comember(designer_id)`, no client branch, no `show_to_client` | S | High, the first genuinely sensitive text in the room; `show_to_client` is per row not per column (`00419:61-62`) | P1 |
| `people_directory` | rebuild | one row per identity, engagements read separately | carries forward the per-branch predicates | L | High, every reader repoints; ship behind a flag with the six-branch view live | P1 |
| `v_access_grants` | new view | security_invoker UNION over the eleven token tables, normalised to grant_id, tier, subject_ref, scope_ref, granted_by, granted_at, expires_at, last_used_at, revoked_at, revoke_reason | deferred to each base table | M | Med, degrades if one base shape drifts; read-only so no write risk | P1 |
| `create_field_link` RPC | extend | expiry from the engagement window, not `now() + 90 days` (`00283:26-33`) | unchanged | S | Med, the mint copy lies until this lands (IX-7) | P1 |
| `studio_contact_merges` | new | survivor_id, merged_id, matched_on, merged_by, merged_at | `is_active_studio_member(organization_id)` | S | Low, append-only audit | P2 |
| `compliance-document-expiry-sweep` | reuse pattern | pg_cron, advisory lock, `job_runs` row, per `00574_invoice_links.sql` | service role | S | Low, copies a shipped shape | P2 |
| `project_parties` bid fields | extend | bid_due_at, bid_outcome widened, bid_valid_until, bid_quoted_by_person_id | unchanged | S | Low | P2 |
| `client_decisions.court` | extend | CHECK widened to architect, engineer, inspector, lender, or court becomes an engagement reference (`00281:167-171`) | unchanged | S | Med, an existing CHECK with live rows | P2 |
| `notification_log` / channel status | extend | email rail writes `status` and `status_at` back onto the channel; `List-Unsubscribe` for non-account people (`send-email.ts:247-253`, `:430-434`) | unchanged | M | Med, touches every transactional send | P3 |
| `touches` | new | subject_ref, channel_kind, direction, occurred_at, actor_ref, decision_class, authority_check, notice_of, notified_refs[] | `is_studio_comember` | M | Med, derives onto the person card without becoming a stored activity log (PD-8) | P3 |
| `client_households` | new | display_name, member_person_ids[], primary_member_person_id, co_threshold_cents | `is_studio_comember(designer_id)` | S | Low | P2 |
| `invoice_links` | harden | hash the plaintext token, add an expiry, record the payer (`00574:63-89`) | unchanged | S | Med, live pay links | P3 |

---

## 8. Phasing

| Phase | Ships | Cost band | What the room shows after it |
|---|---|---|---|
| P1 | `people_directory` rebuilt behind a flag; person and company card extensions; affiliations; typed channels; contact rules; one consent record per studio per channel value; compliance documents; authority on the seat; engagement stage and window; site access card; `v_access_grants`; field-link expiry from the window; Directory at the 1200 band with six chips, reach word, rule clause, seat lines, honest count, `tel:` links, phone-digit search; the company card; the Call Sheet regrouped by window with bidders apart and the site access card at its head; `StatusDot` retired; `disabled` replaced by `aria-disabled` everywhere in `party-profile-sheet.tsx` | XL | One human, one row, seats beneath. Every row answers how to reach them, whether it is allowed, and what paper stands behind them. The Call Sheet answers who is on site this week. The site access card answers who gets in. |
| P2 | Compare & merge sheet and the merge record; nightly expiry sweep writing "lapses in 30 days" and "lapsed"; travel-list pane with multi-select in the picker; bid fields and the Bidding band's dates and outcomes; household object with the change-order threshold; decision court widened; Close this seat replacing Remove across every surface; archive and restore as a standing door | L | The room stops losing facts: consent, bids and lineage survive a roster edit, duplicates converge, a lapse announces itself before it blocks a draw, and a repeat pick arrives with its paper. |
| P3 | Email channel status, suppression and unsubscribe for non-account people; touches with decision class and authority check; notice records on the site access card and the engagement window; invoice-link hardening; Patina Field roster and site-access screens scoped to the active project, read-mostly, cached offline | M | The room can say who was told what, on which channel, and whether the person who said yes had the authority to. The designer's phone carries the job's crew and the way in. |

---

## 9. Rulings for Kody

| ID | Ruling | Panel's lean | Why | What changes if overruled |
|---|---|---|---|---|
| PR-a | The trade-side compliance upload door (AM-1, AM-8, AM-10, AM-13, AM-15), asked by five of six construction seats as one object | Park it. The studio records the document on the company card; Patina drafts the chase to the firm's paperwork contact, landing `awaiting_review` | The writer is a trade, not the studio (S2, `VISION-DECISIONS.md:19`); five asks, one ruling, one identical fallback | A tokened upload page, an unverified-until-confirmed document state, and a trade-facing write tier enter the roadmap; the company card gains an inbound queue |
| PR-b | D-A: does a seat snapshot or live-read firm and person facts | Hybrid. Name at time and trade on the job stay snapshotted; typed channels, contact rule, consent and document expiries read live from the card when `studio_contact_id` is set. Amends PD-3 | A COI expires once for the firm; a do-not-text rule belongs to the human. A snapshot of either is wrong the day after it is taken | Every seat keeps its own copy of consent and expiry, and the room re-derives truth heuristically at every seam, as G-1 already describes |
| PR-c | CRM-19: household object, or `client_rep` party row, for Chidi Okonkwo | Both, split by job. A household holds the members and the change-order threshold; every member who acts on a job gets a seat carrying the authority grant | Authority must sit where the Call Sheet and the decision court read it; a login is a reach question, not an authority question | If household only: authority has no per-job home. If `client_rep` only: the two spouses never resolve to one client |
| PR-d | CRM-14: the 90-day link clock | Retire it. A grant ends with the engagement window, renews on use, and prints its end date in words | A ten-month job outlives a 90-day link three times; a twelve-month warranty outlives it four (F-28) | The mint act cannot say "ends with the job"; the studio re-mints on a clock unrelated to the work |
| PR-e | Extending the three reach words (Account, Field link, On paper) | Do not extend. A forbidding or routing rule prints as a sentence beside the word, never as a fourth word | Access tier and contact rule are two axes; merging them loses one (C3, VC-17) | A fourth word ("Do not contact") joins PD-12, and the rule's reason, route and hours have to compress into one label |
| PR-f | CRM-10: widen kinds and trades | Widen in code now: client_rep, inspector with an `ahj / lender / third_party` subtype, lender, engineer, vendor, other_named with a required label; trades gain radon mitigation, insulation, waterproofing, roofing, septic. Every kind opens the same card. Defer studio-editable extension lists (AM-7) | Carol Nystrom and Ray Thao fall to `other` and go dark today (F-26, F-27, G-13) | The AHJ and the draw inspector stay off the Call Sheet, and "everyone on the job" is not everyone |
| PR-g | Do firm rows appear under Everyone, or only under Firms | Mixed default list: firms appear under Everyone, sorted into the band of the crew they carry, and the head names both nouns ("29 people · 22 firms") | The honest IA is one book; the count stops pretending firms are people | Everyone lists people only, Firms becomes the sole door to the rolodex's firms, and the head count carries one noun |
| PR-h | Does a lapsed COI read as a blocking clause on the roster row, or only on the company card | Both, one source. The document lives on the company card; the roster row prints a held clause in words with a terracotta leading rule, not a badge (D-B) | A clause in words is not a status badge, and the super needs the fact where the body is dispatched | The lapse is visible only on the firm card, and a designer mobilises an uninsured sub from the Call Sheet |
| PR-i | Which history line a picker mini row may carry | Repeat count and dates only ("Worked 1 prior project, Lindqvist kitchen, closed 2025"). Never a verdict at the pick | A verdict is a judgement one co-member wrote about a firm; it belongs on the card, read deliberately, not at a moment of speed | The picker shows "would rehire" / "would not" inline, and a co-member's judgement drives a pick without its reason |
| PR-j | Do `?role`, `?view`, `?scope`, `?trade` stay in the address | Keep them. The People room gets its own rule | A filtered book that cannot be sent to a teammate is not a book | They keep being stripped (`people-room.tsx:151-171`), and only `?person=` is linkable |
| PR-k | Does Chidi Okonkwo get a second Patina account by default | No. Email-only is his default mode; an account is optional and additive, added the same way as Adaeze's | The fixture says he writes email first and wants a phone call over $2,500; a login the studio invents is a login nobody uses | Household creation mints two invitations, and every second household member is invited whether or not they asked |
| PR-l | When the engagement window is shorter than the firm's warranty term, does minting auto-extend | Make the studio choose, with the warranty end offered as the second option in words | Silently extending a door past the work is the failure PR-d exists to fix | Mint auto-extends to warranty end, and a link outlives the job without a studio act |
| PR-m | Is "mark opted out" ever a manual studio act | Yes, with a source and evidence, for a verbal STOP the studio heard. The way back is always a fresh recorded consent or an inbound START | A studio that hears "stop texting me" on site must be able to write it down before the next send | Only an inbound STOP can opt a channel out, and a verbal stop lives in someone's memory |
| PR-n | Who may set an authority grant | The principal by default; the lead designer may set a grant whose scope excludes money and draw certification | Leah approves fee changes; Priya runs the job. A money threshold is the principal's paper | Priya can set money thresholds, or every authority edit waits on Leah |
| PR-o | On merge, may the studio flip which card survives | Yes, always the studio's call. The older card is pre-picked, both ids stay resolvable | The studio knows which card carries the real history; the rule is evidence for the merge, not for the survivor | The survivor is fixed by age, and a richer newer card is absorbed into a thinner older one |
| PR-p | Stage on the cross-project Directory row (C1) | Stage prints on a seat line only, never as a person-level column | A person holds many seats with many stages; a dominant stage is a claim the model does not make | The Directory row gains a fifth word column whose value is chosen by a rule nobody can state |
| PR-q | Density: hairline ledger rows at the 1200 band, replacing today's bordered white card rows at 760px (C2, C9) | Adopt. The Directory is a ledger; the Call Sheet stays a 760px DocSheet | Five word columns on a card-grid row reads as a table wearing a card (§A4, §A9) | Today's row and measure stand, the word columns collapse into the unfold, and the Directory answers fewer questions per screen |
| PR-r | Does Patina store a live gate code at all | Store the lockbox version, the key holder, the hours, and who was told. Hold the code itself off Patina and print "the code is held off Patina, ask Luis Ochoa". No re-auth gate, no hide-on-glance | The value of the card is who to call and who was told; a live code is the one fact whose leak has a physical consequence | Patina stores the code, and the site access table needs a sensitivity treatment the room has no precedent for |
| PR-s | May Patina Field mint a field link for someone met on site with no rolodex card | Yes, for a studio member's own session, creating the person card at the same moment | A framer's second who shows up unannounced is the real case; the alternative is a text from the truck | Every new body goes through the desk, and the designer keeps the name on paper until evening |
| PR-t | Does a mobile screen show an authority threshold figure | Show the yes or no ("may approve this change order"), and the figure only on the desk | A phone in a hallway is read over a shoulder | The figure prints on the phone, and the client learns their own threshold from the designer's screen |
| PR-u | AM-2: cross-studio compliance sharing | Park it. Each studio verifies independently; the compliant version copies the last verified document forward at the pick, inside one studio | A platform-level record on a firm breaks the studio-wide rolodex boundary (PD-1) | A firm's paper becomes platform state, and one studio's verification speaks for another's liability |
| PR-v | Who adds `--color-dusty-blue-ink` and re-audits every tint used as text | The People room build owns it, in the same alias block that maps the house-sheet token names onto the shipped `--color-*` names (VC-2, AX-2) | The widened kinds inherit this badge family; 2.8:1 text is already shipping | The audit routes to a design-system wave, and the new kinds ship at the current contrast |
| PR-w | Is the site access card ruled out of every client-facing surface, in writing | Yes. Studio-only table, no client RLS branch, no `show_to_client` toggle | `show_to_client` is per row, not per column; a naive reuse leaks a code through a row a designer marks visible (AX-12) | The card inherits the roster's visibility mechanism, and the client-portal RLS sweep owns a code |
| PR-x | Is the phone-global consent reduction in `sms.ts:174-185` retired once `studio_channel_consent` ships | Keep it as a fail-closed secondary check until backfill is proven, then retire it in a named follow-up | Two checks that both fail closed are safe; two writers are not | The reduction is removed at cutover, and a backfill miss becomes a send to an opted-out number |
| PR-y | Is the `people_directory` rebuild sequenced before the seats-beneath Directory | Yes, both in P1, view first, behind a flag, with the six-branch view kept live | Building the seats UI on the six-branch view bakes in the per-project duplication the redesign exists to remove | The Directory ships first and re-derives one-human-ness heuristically, as `directory-view.tsx:155-178` already does |

---

## 10. Parked

Side journeys under `docs/vision/VISION-DECISIONS.md:18-21`. Never dropped, never quietly folded into the compliant version.

| ID | Ask | Why parked | Compliant fallback |
|---|---|---|---|
| P-1 | AM-1, AM-8, AM-10, AM-13, AM-15: a trade-side upload door for COI, W-9, licence and signed waivers over the field link | The writer is a trade, not the studio (S2). Five seats, one object, one ruling (PR-a) | The studio records the document on the company card; Patina drafts the chase to the firm's paperwork contact, landing `awaiting_review` |
| P-2 | AM-2: a platform-level compliance record on a firm, readable by every studio that holds it | Cross-studio state on a firm breaks the studio-wide rolodex boundary (PD-1) | Copy the last verified document forward at the pick, inside one studio (PR-u) |
| P-3 | AM-3, AM-11: a seat pointing at another seat as the party it contracts through, so second-tier bodies resolve to a COI | Sub-to-sub paper is outside the studio's contract (PR-1) | `contracted_through` set to studio, gc or owner, plus a first-tier crew list on the company card |
| P-4 | AM-4: a trade-side write tier over the field link (daily log, mark a sub off the job, confirm a delivery) | The primary user is the GC's superintendent (S2, PR-3) | The read-only Call Sheet plus the site access card over the existing field link; the seat that asked already accepts this |
| P-5 | AM-12: an owner's representative login with delegated money and change-order authority | The primary user is the homeowner's agent (S2) | A `client_rep` seat carrying the authority facts, with approvals recorded by the studio |
| P-6 | AM-14, AM-16: a read-only draw-packet link for the lender's inspector, minted by the bookkeeper | Lender-facing surface (S2, PR-3) | A PDF export from the waiver ledger, sent by the studio |
| P-7 | AM-7: a studio-editable extension list for trades and firm kinds, layered over the code-resident base | Vocabulary policy, deferred not refused (PD-4) | Widen `FieldTrade` and company kinds in code now (PR-f); revisit when a second region onboards |
| P-8 | AM-5: default `show_to_client` on for gc and sub seats whose window covers this week | An amendment to PD-11's opt-in default | One act, "show this week's crew", with the stored default left false |
