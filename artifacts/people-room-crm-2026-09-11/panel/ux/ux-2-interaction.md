# Interaction: the People room's construction CRM

Seven flows against the Okonkwo fixture, then the one "Reach & access" control every person card carries. Entities are the synthesis's (crm-model.md §1): E1 Person, E2 Company, E3 Household, E4 Affiliation, E5 Engagement, E6 Reach channel, E7 Contact rule, E8 Consent, E9 Access grant, E10 Compliance document, E12 Authority grant. Nothing here gives a trade or a homeowner a new writing surface; every field-link and account act stays a studio member's act on the studio's surface.

---

## (a) Add a text-only sub — Dana Kowalski, F-11

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | People room | "Add person" act | — | — | — | 1 |
| 2 | Add Person sheet | Kind switch → "a sub" | engagement.party_kind draft | one kind required | — | 1 |
| 3 | Add Person sheet | Project select | engagement.project_id | required | "Field crew work a project — pick which one they're on." | 1 |
| 4 | Add Person sheet | Name field | E1 person.full_name | required | "A sub needs a name." | 1 |
| 5 | Add Person sheet | Company field (create-or-match) | E2 company.legal_name / dba_name; E4 affiliation.company_id | optional but recommended | — | 1 |
| 6 | Add Person sheet | Trade select | E5 engagement.trade | required for sub | — | 1 |
| 7 | Add Person sheet | Phone field, typed Mobile | E6 channel.value, kind=mobile, sms_capable=true | phone required if step 9 is checked | "Texting updates needs a phone number — or turn the toggle off." | 1 |
| 8 | Add Person sheet | Email field | E6 channel.value, kind=email, status=unknown | optional | — | 1 |
| 9 | Add Person sheet | "Text updates" checkbox | (gates step 10) | — | — | 1 |
| 10 | Add Person sheet | Consent block: method select + evidence text | E8 consent.source, evidence_text, status=pending, channel_value=phone, studio_id | both required once step 9 is checked | "Record how and where they gave prior consent before sending a text." | 2 |
| 11 | Add Person sheet | Contact rule line (new, optional) | E7 contact_rule.channels_allowed=[mobile] | none set → "every channel is fair game" | — | 0–1 |
| 12 | Add Person sheet | "Add to roster" terminal act | commits E1/E2/E4/E5/E6/E8 | all required fields present | "Could not add them just now. Try again." | 1 |

Total: 10–11 clicks, one sheet, no navigation away.

---

## (b) Grant a homeowner an account and the app — Adaeze F-04 — and record Chidi F-05 signs money over $2,500

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | People room / project | Add Person → "a client" | E3 household.display_name draft | — | — | 2 |
| 2 | Add Person sheet | Name + email + "Send a magic-link invite" | E1 person (Adaeze), E3 household.primary_member_person_id, client_invitations row | email required to invite | "An email brings them onto the roster — and lets you reach them." | 3 |
| 3 | Household / person card | "+ Add a household member" (new act) | E3 household.member_person_ids += Chidi; new E1 person (Chidi) | name required | "This household needs a name before you can add a second member." | 2 |
| 4 | Household card | Authority section (new) → "+ Add authority" | E12 authority_grant.engagement_id (Chidi's), scope, threshold_cents | scope required; threshold numeric | "Pick what they may approve before setting a number." | 1 |
| 5 | Authority row | Scope chips: Money, Change order | E12 scope=[money, change_order] | at least one scope | — | 2 |
| 6 | Authority row | Threshold field | E12 threshold_cents = 250000 | positive integer | "A threshold needs a number." | 1 |
| 7 | Authority row | Save | commits E12 row, source_clause optional | — | — | 1 |
| 8 | Household card | Adaeze's own authority row: scope Selections, no threshold | E12 scope=[selections] on Adaeze's engagement | — | — | 2 |
| 9 | Adaeze's person card | Reach & access → invite state (already sent in step 2) | account tier = client_account | — | "A letter went out within the hour. You can write again after that." | 0 |
| 10 | Adaeze's person card, iOS door | "The app" is the same account (Supabase Auth); no separate grant | — | — | — | 0 |

Chidi's default mode stays Email-only per the contact-mode table (crm-model.md §3); an account for Chidi is optional and additive, added the same way as step 1–2 if the studio chooses.

---

## (c) Mint a field link for the GC PM — Erin Sato F-08 — with a window tied to the engagement, and revoke it

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | Call Sheet / person card | Open Erin's engagement | — | — | — | 1 |
| 2 | Reach & access → Access grants | "Mint a field link" (secondary act) | draft E9 grant.tier=field_link, subject=engagement | a delivery channel (phone or email) must exist | "No delivery channel on file — add a phone or email to send this link." | 1 |
| 3 | Mint confirm (inline, not modal) | Proposed expiry shown: engagement.on_site_to | E9 grant.expires_at = engagement window end | studio may shorten, not silently extend past window | — | 0–1 |
| 4 | Mint confirm | "Mint the link" terminal act | commits E9 row, granted_by, granted_at, token hash | — | — | 1 |
| 5 | Access grants list | Link shown once + "Copy now — shown once" | — | — | "Copied to clipboard · shown once" | 1 |
| 6 | Access grants list, ongoing | Row reads "Field link · expires with the job, 2027-08-13 · renews on use" | E9.last_used_at updates on each resolve | — | — | 0 |
| 7 | Access grants row | Chevron → "Revoke" (tertiary act) | opens inline confirm | — | — | 1 |
| 8 | Revoke confirm | Optional reason field | E9.revoke_reason | none required | — | 0–1 |
| 9 | Revoke confirm | "Revoke — confirm" | E9.revoked_at = now | — | — | 1 |
| 10 | Access grants list | Row reads "Field link · revoked 2026-09-11" | — | — | — | 0 |

Mint: 4–5 clicks. Revoke: 2–3 clicks.

---

## (d) Opt a person out everywhere — Pete Rusk F-12 STOP — and see it on every seat

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | (inbound) SMS rail | Pete texts STOP | E8 consent record (studio_id, channel_value=Pete's phone).status=opted_out, opted_out_at | system-written, no studio act | — | 0 |
| 2 | Any card sharing that phone | Reach & access → Mobile channel row | reads the one E8 record; no per-row write | — | "Opted out, 2025-12-03, on Lindqvist" (not "Not asked") | 0 |
| 3 | New engagement created afterward (e.g. Okonkwo) | Add Person / picker preview | reads existing E8 record at creation, no new row | — | same opted-out fact shown before the add completes | 0 |
| 4 | Composer, any project | Send-text field | aria-disabled | — | "They opted out by text. Only they can rejoin by replying START." | — |
| 5 | Manual capture (studio heard a verbal STOP) | Reach & access → channel row → "Mark opted out" | E8.status=opted_out, source=inbound_sms or other, recorded_by | studio member confirms | — | 2 |
| 6 | Restarting consent | "Record a new consent" (only path back) | new E8 event, source=written/verbal, evidence required — old opt-out kept as history, not erased | source + evidence required | "Only they can restart this by replying START, or record a fresh signed consent." | 2–3 |

No card writes its own opt-out; every seat reads the same record, so "see it everywhere" costs zero extra clicks per seat.

---

## (e) Bring forward the three shared subs and the tile vendor from 2025 Lindqvist, with the fixed travel list

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | Call Sheet | "From the rolodex" primary act | opens picker | — | — | 1 |
| 2 | Rolodex picker | Search "Dana" | — | — | "No one by that name here." | 1 |
| 3 | Picker result row | Row shows "Northgate Electric · worked 1 prior project (Lindqvist, closed)" | — | — | — | 0 |
| 4 | Picker → travel-list preview (new two-pane sheet) | Shows: identity, typed channels, contact rule, consent by channel value, document expiries (COI lapsed 2026-03-31, flagged), history line. Withheld: prior pricing, prior project notes, prior show_to_client | — | — | "This firm's COI lapsed — add them anyway, or chase the renewal first." (non-blocking) | 0 |
| 5 | Travel-list preview | "Add to Okonkwo" terminal act | new E5 engagement referencing existing E1/E2; no channel/consent/document rows copied — read live per D-A | — | — | 1 |
| 6 | Repeat for Pete Rusk F-12 | same picker flow | new E5; his engagement is born reading the existing opted-out E8 record, not "Not asked" | — | see flow (d) | 4 |
| 7 | Repeat for Ingrid Halvorsen F-13 | same picker flow | new E5 | — | — | 4 |
| 8 | Makers view, not the sub picker | Search "Stonehaven" | reuses existing E2 company card; saved_vendors lineage line, not a second card | — | "Saved by Leah, 2025 · saved again by Priya, 2026" | 2 |

Per sub: 4 clicks (search, pick, review, confirm). The vendor: 2 clicks (search, save).

---

## (f) Record a lapsed COI on Marrow & Sons and see what it blocks

*Fixture note: the fixture's actual lapsed policy is F-11 Northgate Electric (exp 2026-03-31); Marrow & Sons' own COI reads current (exp 2027-03-31, F-07). The mechanics below are identical for either firm — Marrow & Sons is used because the charge names it.*

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | Company card (Marrow & Sons) | Compliance documents section (new) | — | — | "No documents on file yet." | 1 |
| 2 | Compliance documents | Edit COI-GL row's expiry | E10 document.expires_on = past date | dated types require a date | — | 2 |
| 3 | Compliance documents | Save | commits E10 row | — | — | 1 |
| 4 | (system, nightly) | Expiry evaluation job (CRM-27) | E10.status derived "lapsed"; blocks=[site_access, payment, draw] evaluated | — | — | 0 |
| 5 | Every active engagement under Marrow & Sons (Tom, Erin, Luis) | Call Sheet row grows a document line | reads the same E10 row, no per-row write | — | "Site access held — Marrow & Sons' insurance lapsed 2027-03-31." (aria-disabled pattern, terracotta rule) | 0 |
| 6 | Draw ledger | Next draw line for Marrow & Sons | E11 waiver gate reads E10.status | — | "This draw is held until a current COI is on file." | 0 |
| 7 | Company card | "Chase the renewal" (tertiary act) | drafts a note, lands `awaiting_review` — no automated external send | — | — | 1 |
| 8 | Compliance documents | Renewal uploaded → expires_on forward, verified_by/at stamped | E10 updated | file or override reason required to mark verified | — | 2 |
| 9 | Every reader | Blocks clear at once — one fact, three readers (D-B) | — | — | — | 0 |

---

## (g) Merge two duplicate cards for the same human

| Step | Screen / sheet | Control | Data written | Validation | Error / empty states | Clicks |
|---|---|---|---|---|---|---|
| 1 | Directory | Duplicate-hint band (new): "These two cards share a phone — merge them?" | — | shown only on rule 1/2/3 evidence (account, phone, or email exact match) | band absent when only names match (rule 5, never auto-offered) | 0 |
| 2 | Duplicate-hint band | "Compare & merge" secondary act | opens a new DocSheet, not a modal | — | — | 1 |
| 3 | Compare & merge sheet | Two cards side by side; survivor pre-picked as the older card, flippable | draft only | — | — | 0–1 |
| 4 | Compare & merge sheet | Review lists: engagements (both kept, repointed), channels (union), consent (untouched — keyed to channel value, not card id), documents (union, original holder id kept), history (both kept) | draft preview only | — | — | 0 |
| 5 | Compare & merge sheet | "Merge cards" terminal act | survivor absorbs; loser marked merged_into=survivor_id (kept resolvable); engagements/affiliations/grants repointed; audit line | requires rule 1/2/3 evidence | "These two cards don't share a verified phone, email, or account — add a matching one first." | 1 |
| 6 | Survivor card | Provenance note: "Merged with a second card, 2026-09-11." | — | — | — | 0 |

Total: 2–3 clicks once the band appears; the band itself is system-proposed, never a search a studio member has to run.

---

## The "Reach & access" control

One component. Same shape on every person card — Directory profile, Call Sheet party sheet, and a lighter Company variant (Decision 3). Three fixed sections, always in this order, never merged with Documents or Authority.

### Sections

| Section | Rows | What each row shows |
|---|---|---|
| Channels | one per E6 reach channel | type (Mobile / Office / Dispatch / After-hours / Email / App / Account / Field link / On paper / 311 portal) · value · preferred (one per kind) · verified word · consent word (SMS/email only) with source + date on expand |
| Contact rule | one, or the collapsed do-not-contact line | allowed chips · forbidden chips · route-to link · hours · reason |
| Access grants | one per E9 grant | tier word · scope · expires (date, or "renews on use") · Revoke act |

### States

| State | Trigger | Look |
|---|---|---|
| Empty | no channels, no grants | "Nothing on file yet — add a phone or email to reach them." |
| Populated, clear | normal | plain rows, no color beyond ink |
| Attention (Held) | dead/bounced email, opted-out channel, revoked grant, lapsed-document echo | `--rail` ground, 2px `--terracotta-ink` leading rule, reason printed in words (SPEC.md §A14) — never a dot, badge, or opacity |
| Do-not-contact | contact_rule.channels_forbidden = all | collapses to one line: "Do not contact directly — routes through [name]." + "Edit the rule" |
| Editing | a row's edit act pressed | field-on-paper per §A14: label always visible (`.t-head`), no placeholder standing in for a label |
| Read-only | viewer's tier lacks edit rights | tertiary words only, no acts rendered |

### Keyboard model

| Interaction | Behavior |
|---|---|
| Tab | moves row to row within a section, then to the next section's first row |
| Tab inside an open row | field to field: type select → value → preferred toggle → verified/consent word (read-only unless an act) |
| Enter / Space on a chevron | expands or collapses that row |
| Enter / Space on an act | activates it (Add a channel, Mint access, Revoke, Edit the rule) |
| Escape | cancels an open inline edit without saving; focus returns to the row's opening act |
| Revoke / Mark opted out | two-step: press opens an inline confirm (`aria-expanded`) with an optional reason field, keyboard-reachable before the second press completes it |
| Focus ring | `outline: 2px solid var(--clay-ink)`, same as every `.act` (SPEC.md §A5) — never a moved border |

No roving-tabindex grid: a person's rows are few, and standard tab order reads correctly at every width.

### Copy — quoted where a string exists today, new where it does not

| Slot | Copy | Source |
|---|---|---|
| Empty state | "Nothing on file yet — add a phone or email to reach them." | new, matches directory-view.tsx:134's register |
| Invite disabled | "Add a phone number to invite this party to texts." | quoted, party-profile-sheet.tsx:893 |
| Opted-out reason | "They opted out by text. Only they can rejoin by replying START." | quoted, party-profile-sheet.tsx:784 |
| Consent checkbox | "They gave prior express consent for text updates" | quoted, party-profile-sheet.tsx:800 |
| Consent method label | "How consent was given" / "Choose a method…" | quoted, party-profile-sheet.tsx:811, :828 |
| Consent evidence placeholder | "Where and when they agreed, e.g. signed site kickoff form on Aug 8" | quoted, party-profile-sheet.tsx:842 |
| Contact rule empty | "No rule set — every channel above is fair game." | new |
| Do-not-contact collapse | "Do not contact directly — routes through Rosa Delgado." | new, names F-14/F-15's fact |
| Mint consequence sentence | "This opens the Call Sheet and the site access card to Erin Sato until the job's window closes, 2027-08-13. It never opens billing or the agreement." | new, per SPEC.md §A6 |
| Revoke reason prompt | "Say why the door closes (optional, kept with the record)." | new |
| Field link row | "Field link · expires with the job, 2027-08-13 · renews when they use it." | new |
| Bounced email | "This address bounced back, Mar 12 — texts and calls still reach them." | new |

---

## Findings

| ID | P1–P3 | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| IX-1 | P1 | high | No single control shows a person's channels, consent, and access grants together; ConsentChip is field-roles-only, reach-chip is Call-Sheet-only, and the party sheet's Contact card is untyped | `person-row.tsx:76-99`; `party-profile-sheet.tsx:271-278`; `current-state.md` G-21 | Build Reach & access as one component mounted on every person card in both Directory and Call Sheet. known(G-21) |
| IX-2 | P1 | high | Consent today writes to a per-project party row; flow (d)'s "opt out everywhere" cannot ship without CRM-4's studio-per-channel-value consent record | CRM-4; `_shared/sms.ts:174-185` | Sequence the Reach & access control's consent behavior behind the CRM-4 migration; ship Channels/Access-grants first if phased. known(G-3) |
| IX-3 | P1 | high | No merge path exists in the product; flow (g) has no UI to extend, so it needs its own review, not a bolt-on inside a person card | G-1; grep of `components/document/people` for "merge" returns nothing | Treat merge as its own DocSheet, launched from a Directory duplicate-hint band, never from inside Reach & access. new |
| IX-4 | P1 | high | Nowhere can a studio member see, in one place, who at a firm is the paperwork contact, the signer, and the site contact — F-07/F-08/F-09 are three separate person cards | fixture.md F-07..F-09; CRM-6, CRM-25; `company-row.tsx` has no named-contact fields | Give the Company card a light Reach & access variant naming those three roles, cross-linked to the person cards. new |
| IX-5 | P2 | high | The Add Person sheet has no kind for a second household member; flow (b)'s Chidi has nowhere to land without a new kind or overloading `client_rep` | `add-person-sheet.tsx:69-75`, `:98-105`; CRM-19 | Add "a household member" as a seventh kind, scoped to an existing client's household. new |
| IX-6 | P2 | high | Authority (who signs money, at what threshold) has no field anywhere; flow (b)'s $2,500 line and flow (a)'s implicit sub-authority both need a section with no existing analog | G-15; `00281:158-171` | Keep Authority visually separate from Reach & access — a contact question should never become a money question on the same control. known(G-15) |
| IX-7 | P2 | high | Field link expiry is a flat 90 days unrelated to the job; flow (c)'s "window tied to the engagement" copy would lie the day it ships if the RPC still writes +90 days | `00283_field_links.sql:26-33`; CRM-14 | Gate the new mint-act copy on the RPC change landing first; do not word the button "expires with the job" ahead of the data. known(G-20) |
| IX-8 | P2 | high | "Route to" (F-14 email Rosa, never call Frank) has no column or UI pattern to borrow from; the Contact rule section and its collapse state are wholly new | G-7; CRM-3 | Prototype the do-not-contact collapse against Frank/Rosa in the specimen deck before wiring `route_to_person_id`. known(G-7) |
| IX-9 | P2 | med | The rolodex picker's mini row shows name and kind only; flow (e)'s travel-list preview needs far more surface than a one-line row affords | `roster/party-mini-row.tsx:3-8`; CRM-24 | Widen the picker's confirm step into a two-pane sheet: search list plus a travel-list preview pane. new |
| IX-10 | P2 | med | Compliance documents have no object at all; flow (f)'s "see what it blocks" has no `blocks` vocabulary anywhere to render on the engagement row | G-14; CRM-1 | Add a Documents section on the Company card, echoed on the engagement row — kept out of Reach & access so contact and compliance stay visually separate. known(G-14) |
| IX-11 | P2 | med | The composer's aria-disabled "opted out" state already matches the house sheet's Held-field grammar; every other held state (dead email, revoked grant, lapsed document echo) should reuse the identical CSS, not invent new visual language per cause | `party-profile-sheet.tsx:784`; SPEC.md:741-763 (§A14 Held) | One Held treatment, four causes, one CSS block. new |
| IX-12 | P3 | med | Directory rows already truncate name and relationship line, which the house sheet forbids; a phone number or email in a new Channels row is exactly the string that will truncate at 390 unless it wraps | G-23; `person-row.tsx:79`, `:85`; SPEC.md §A13 "no truncation" | Channel rows wrap to a second line at narrow widths; never ellipsis. known(G-23) |
| IX-13 | P3 | med | No Directory chip or PersonProfile branch exists for architect, photographer, stager, or inspector kinds; Reach & access has to render sensibly for a kind that today falls into TeamProfile's staff-only colophon by accident | G-13, G-18; `directory-view.tsx:34-44` | Reach & access mounts identically regardless of kind; the PersonProfile kind-branch bug (G-18) is a separate prerequisite fix, not something Reach & access can paper over. touches(G-18) |
| IX-14 | P3 | med | Consent-source options today are verbal / written / web_form / other; a manually-recorded verbal STOP (flow d, step 5) has no matching source value in the current enum | field-config.ts consent-source enum; CRM-2 field dictionary lists `inbound_sms` as a fifth value not yet in the UI | Expose "inbound_sms" as a selectable source only for studio-transcribed stops, not live inbound texts (which write it automatically). new |
| IX-15 | P2 | med | The Add Person sheet locks kind on edit; a mis-typed engagement (sub typed as installer) has no in-place fix, which flow (a) inherits as a dead end if not addressed | `add-person-sheet.tsx:22-25`, `:510` | Keep kind locked at the engagement level (a job-level fact) but say explicitly in the edit copy that correcting a kind means a new engagement, not an edit. new |
| IX-16 | P3 | low | "Text updates" language is SMS-specific while the Reach & access model generalizes consent to any channel value including email, which has no suppression mechanic yet (G-6) | G-6; `send-email.ts:247-253` | Keep consent language SMS-specific until email suppression ships its own words; do not force one vocabulary across both rails prematurely. new |
| IX-17 | P3 | low | No specimen yet shows whether the three Reach & access sections sit side by side or stack at the People room's own panel width versus the Call Sheet's DocSheet width; both read 760px but sit in different chrome | `people-room.tsx:428`; PD-14 | Draft the specimen at 760 and 390 before committing to a two-column layout. new |
| IX-18 | P2 | med | The head count already double-counts a human on two engagements (G-9); if Reach & access rendered per-engagement instead of per-person, the same bug would repeat inside the new control — Dana on Lindqvist and Okonkwo would show two separate grant lists for one human | G-9; CRM-5; PD-3 | Reach & access always renders from the Person/Company card, never the Engagement row; engagement rows keep only a compact reach word, matching D-A's snapshot/live split. known(G-9), touches(CRM-5) |
| IX-19 | P3 | low | The charge names Marrow & Sons for the lapsed-COI flow, but the fixture's only actually-lapsed policy belongs to F-11 Northgate Electric (F-07's COI reads current, exp 2027-03-31) | fixture.md F-07, F-11 | Flow (f) is written against Marrow & Sons as asked; the mechanics are identical for either firm, so no rework is needed if the specimen later uses F-11 instead. new |

---

## Decisions I am making for the direction

1. Reach & access is one component, mounted identically on every person card (Directory profile and Call Sheet party sheet), and reads live from the Person/Company card, never a per-engagement snapshot.
2. Reach & access has three fixed sections, always in this order: Channels, Contact rule, Access grants. Documents and Authority live in separate sections and never fold in, so a contact question never becomes a compliance or money question.
3. The Company card gets a lighter Reach & access variant naming paperwork contact, signer, and site contact, cross-linking to the three underlying person cards, instead of duplicating full channel detail per firm.
4. Consent shown anywhere is always the one studio-per-channel-value record; no card ever writes or reads a per-engagement consent value again.
5. A field link's expiry defaults to the engagement's `on_site_to` date, never a flat 90 days, and the mint act's consequence sentence states the real date in words, not a countdown.
6. Revoke and "mark opted out" are two-step inline confirms with an optional reason field, never a modal, matching the Document's no-modal grammar.
7. Merge is its own DocSheet ("Compare & merge") launched from a Directory duplicate-hint band, never a button inside Reach & access, because merge touches identity, not contact.
8. Every held state (dead email, revoked grant, lapsed-document echo, opted-out channel) uses one visual treatment: `--rail` ground, terracotta-ink leading rule, reason in words, per SPEC.md §A14 — no new color, no badge, no dot.
9. Setting a "route to" rule collapses the entire Channels section to one line naming who to contact instead; the underlying channels are hidden behind "Edit the rule," never deleted.
10. Bring-forward's travel-list preview is a new two-pane sheet inside the existing rolodex picker, not a bigger single row, because the travel/no-travel list is too long for one line at any width.

## Open questions for Kody

1. Does Chidi get a second Patina account by default when the household is created, or only on request? Flow (b) needs a studio-facing default before a household-member kind can ship (CRM-19 leaves both halves open).
2. When a field link's proposed expiry (the engagement window) is shorter than a firm's warranty period, should minting automatically extend to the warranty end, or make the studio choose every time? (touches CRM-14, F-28's warranty-window gap)
3. Should "mark opted out" ever be a manual studio act at all, or is a channel only ever opted out by an inbound STOP? This decides whether IX-14's studio-transcribed source option belongs in the product.
4. Who besides the principal may set an Authority grant — is money/CO threshold locked to Leah alone, or can Priya as lead designer also set it? This decides whether Reach & access needs to hide access-grant minting by role.
5. On merge, synthesis defaults the survivor to the older card (crm-model.md §4) — should the studio ever be blocked from flipping which card survives, or is that always the studio's call?
