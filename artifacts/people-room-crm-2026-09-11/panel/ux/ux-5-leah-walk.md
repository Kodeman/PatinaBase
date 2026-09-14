# UX-5 · Leah's walk

Seat: Leah Hartwell, studio principal. Charge: walk today's room in first person on six real Okonkwo tasks, count clicks and doubts, then write acceptance criteria and a ranked top 5. Evidence is `path:line` in the worktree, `F-nn`, `G-n`, `PD-n`, `CRM-n`, house-sheet §.

I did this the way I'd actually do it: open the project, reach for the Call Sheet or the People room, and see how far the room gets me before I have to keep the fact in my head instead. Six tasks, one job (Okonkwo), same conclusion each time — the room can name a person, but it cannot yet hold what I actually need to know about them: who signs, who to skip, who's on site, and what to bring forward. Below: each task's steps, click count, doubts I hit mid-walk, and what was missing; then what the redesign must let me do, in business terms; then my ranked top 5 and the findings that back all of it.

---

## 1. The six tasks

### Task 1 — Add F-11 (Dana Kowalski), text-only, so nobody emails him

| Step | Screen | Evidence |
|---|---|---|
| 1. Open Okonkwo → letterhead instrument → Call Sheet | `roster/call-sheet.tsx:4-6` | `apps/designer-portal/src/components/document/letterhead-instruments.tsx:454-473` |
| 2. "From the rolodex" (primary act) → search "Dana" | `roster/rolodex-picker.tsx:1-18` | |
| 3. Select her row — writes name, company, first trade, phone, **and email**, no way to omit a field | `roster/rolodex-picker.tsx:204-214` | |
| 4. To suppress email: open her new party row → Edit → blank the Email box | `people/party-profile-sheet.tsx:557-610` (Name/Company/Trade/Phone/Email only) | |

**Clicks: 3** to add her. **0** clicks exist to make "text-only" a fact — blanking the field is the only lever, and it is a workaround, not a rule.

**Doubts:** Does blanking Email on the party row touch the rolodex card's email at all, or does the next person who adds her from the rolodex bring the dead address right back? Does "text-only" mean anything to the send gate, or only to whoever remembers not to type in the box? If someone else on staff adds her fresh next month, do they even know to skip the field?

**Missing:** a contact rule with `never_email` / `channels_forbidden` on the person (CRM-3, G-7); the rolodex card carrying zero preference (G-4).

### Task 2 — Give Adaeze the app; note that Chidi signs money

| Step | Screen | Evidence |
|---|---|---|
| 1. People room → Add person → kind **A CLIENT** → name, email, "Send a magic-link invite" checkbox → Add to roster | `people/directory/add-person-sheet.tsx:92-104`, `:759`, `:1005` | |
| 2. To note Chidi: the client kind's only free text is a "note" field on Adaeze's card, or `NoteCard` from her profile's "Edit details" act | `add-person-sheet.tsx` client fields; `views/person-profile.tsx:467` | |
| 3. To add Chidi as his own record: no "client_rep" choice in Add Person's kind list; the only door is the Call Sheet → rolodex picker → "add someone new," which does carry `client_rep` | `add-person-sheet.tsx:92-104` (6 kinds, no client_rep) vs `roster/rolodex-picker.tsx:47-56` |

**Clicks: ~4** to invite Adaeze (already an account per F-04, so this may be zero work); **~5** to add Chidi through the one door that admits him, buried under a different room's instrument; **0** clicks anywhere to attach "signs money, threshold $2,500" as a fact a bookkeeper or an invoice screen ever reads.

**Doubts:** Do I make Chidi a second login, or a client_rep party with no link back to Adaeze's household record? The room offers both, recommends neither, and neither one carries an approval threshold. If I type "Chidi signs money" in Adaeze's note, does that note ever surface next to an invoice awaiting a signature? No.

**Missing:** a household object holding both spouses and a threshold (G-1, G-15); an authority grant with scope and threshold on the engagement (CRM-2); client_rep in the front-door kind list.

### Task 3 — Who has site access on Okonkwo right now

| Step | Screen | Evidence |
|---|---|---|
| 1. Open Call Sheet, unfold every Build & supply row looking for an access fact | `roster/roster-row.tsx:170-184` | |
| 2. Grep the codebase myself for "site access," "key holder," "gate code," "lockbox" — only `site_request_access`, a field-request workflow table, exists; no site-facts card | `supabase/migrations/00374_field_site_request_loop.sql` | |

**Clicks: open Call Sheet (1) + unfold every row (~9-15)** and still no answer — the question is unanswerable at any number of clicks today.

**Doubts:** Is "on the roster" being silently read as "has access," when the fixture says only Ngozi (key), Luis (controls it), and the owners actually do?

**Missing:** a site access card — key holder, codes, hours, emergency lines, who was told (CRM-8; not registered as any existing G-n — it is a wholly new object).

### Task 4 — Opt Frank (F-15) out everywhere; make sure Rosa (F-14) is who we write to

| Step | Screen | Evidence |
|---|---|---|
| 1. Open Frank's party row → unfold → no consent control shows (he was never texted; nothing to revoke) | `roster/roster-row.tsx:170-184` | |
| 2. Open Edit on his row: Name / Company / Trade / Phone / Email only — no do-not-contact box, no "route to" field | `people/party-profile-sheet.tsx:557-610` | |
| 3. Blank his phone and email as the only proxy for "do not contact" — this also erases the record of who he is if his firm ever needs to be reached through him | same | |
| 4. Nothing on Rosa's row marks her as the one to write to instead; nothing links her row to Frank's beyond a matching, unenforced `company_name` string | `packages/supabase` / `project_parties` — no `company_id` FK, `company_name` TEXT | |

**Clicks: ~2** to open and inspect Frank's row; **0** clicks exist to set a rule; a free-text note costs ~2 more clicks and changes nothing structurally.

**Doubts:** If I blank Frank's contact info, do I lose the fact that he's the one who signs the subcontract (fixture: he's the $/CO authority on the sub side)? Nothing marks him as signer either.

**Missing:** contact rule with `do_not_contact` + `route_to_person_id` (CRM-3, G-7); affiliation with `is_signer` / `role_at_firm` (CRM-25); a company link so Frank's and Rosa's cards actually know they share an employer (G-4).

### Task 5 — Bring the three Lindqvist subs (Dana, Pete, Ingrid) and the tile vendor onto Okonkwo

| Step | Screen | Evidence |
|---|---|---|
| 1. Call Sheet → "From the rolodex" → search → select, once per person (no multi-select) | `roster/rolodex-picker.tsx:188-215` | |
| 2. Each add writes name/company/trade(first specialty)/phone/email/`studio_contact_id` only | `rolodex-picker.tsx:204-214` | |
| 3. For Claire (Stonehaven): reps are TEXT columns on a vendor account, not people — she may have no rolodex card to find at all | `supabase/migrations/00009_vendor_management.sql:59-76` | |

**Clicks: ~3 per person × 3 subs = 9**, then a dead end for Claire — zero successful clicks to add the actual person I talk to at Stonehaven.

**Doubts:** Does Pete's new Okonkwo row read "Not asked" even though he said STOP after Lindqvist closed, and would that read as safe-to-invite? Yes (F-12, CRM-4). Does anything flag that Dana's COI lapsed in March? No (F-11, CRM-1). Does the pick carry any line saying "worked the 2025 Lindqvist kitchen, no issues"? No.

**Missing:** a fixed bring-forward travel list — identity, contact rule, consent by phone, document expiries, one history line, never prior pricing or notes (CRM-24); vendor reps as people (CRM-17); COI status surfaced at the moment of picking (CRM-1).

### Task 6 — See everyone on Okonkwo by role, this week

| Step | Screen | Evidence |
|---|---|---|
| 1. Open Call Sheet — three fixed groups, Studio side / Client side / Build & supply, the third ordered kind → trade → name | `roster/roster-groups.tsx:9-13`; `lib/document/roster-derivation.ts:228-274` | |
| 2. Look for a "this week" cut — none exists; the vitals line is a studio-wide count, not a date window | `roster-derivation.ts:402-415` | |

**Clicks: 1** to see everyone ever added to the job; **0** clicks available to narrow to "this week" — I'd have to know each person's schedule from memory to tell a February radon sub from this week's framer.

**Doubts:** Would Kelly Marsh (radon, Feb 2027) and Nadia/Jonah (staging/photo, Aug–Sep 2027) list identically alongside this week's crew? Yes. Would the AHJ inspector or the lender's draw inspector even appear — the `party_kind` CHECK admits neither? No fit exists for them at all.

**Missing:** engagement stage + on-site window (CRM-7, marked "new" in the model, not an existing gap row); a this-week roster read; inspector/lender in the kind vocabulary (CRM-10, G-13).

---

## 2. Acceptance criteria for the redesign, per task

| Task | Must be able to, in business terms | Max clicks |
|---|---|---|
| 1. Text-only, no email | Mark a person "text only" and have every add-from-rolodex, every send screen, and every future edit honor it without re-typing a rule | 2 |
| 2. App + authority | Give a household member an app login, and separately name who signs money on that job with a dollar threshold, visible on the invoice or CO screen that needs the signature | 4 total (2 per fact) |
| 3. Site access | See who holds keys, who controls the gate, and who was told the code last changed, from one screen on the project | 1 |
| 4. Do-not-contact + route-to | Mark a person "do not contact" and have every attempted contact — including a future rolodex pick — show "write Rosa instead" automatically | 2 |
| 5. Bring-forward | Add a repeat sub or vendor rep to a new job and get their current consent, document status, and one performance line for free, never their old pricing | 2 per person |
| 6. Roster by role, this week | Filter the project roster to who is actually on site this week, by role, correctly leaving out anyone whose window hasn't opened or has closed | 2 |

## 3. Ranked top 5 Patina must track that it does not today

1. **Authority to approve money and change orders, with a threshold.** Object: the engagement (Role-on-project). Fixture: F-04/F-05 — Adaeze decides finishes, Chidi signs anything over $2,500, and neither fact has anywhere to live.
2. **A contact rule: forbid a channel, route through someone else.** Object: the person. Fixture: F-15/F-14 — "never contact Frank, always write Rosa" is two unrelated rows today with nothing between them.
3. **A site access card for the project.** Object: the project. Fixture: F-06/F-09 — Ngozi holds the key, Luis controls the gate, and neither fact exists anywhere in Patina.
4. **A compliance document with an expiry that blocks something.** Object: the company. Fixture: F-11 — Dana's COI lapsed in March and nothing knows, so nothing stops her from being remobilized uninsured.
5. **A fixed bring-forward list at the moment of picking a repeat person.** Object: the pick itself. Fixture: F-11/F-12/F-13/F-20 — three subs and a vendor from Lindqvist should arrive with their consent and paper status, not a blank slate, and never with their old prices.

---

## 4. Findings

| ID | P | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| LH-1 | P1 | high | No field marks a person "never email" or "text only"; Add Person and the party edit form offer independent, unrestricted Phone and Email boxes | `people/directory/add-person-sheet.tsx:217-229`; `people/party-profile-sheet.tsx:557-610`; F-11 | Add a contact rule with `channels_forbidden` on the person, read by every add and send path. touches(G-7) |
| LH-2 | P1 | high | Adding a rolodex card to a project copies its email automatically with no way to omit it per add | `roster/rolodex-picker.tsx:204-214`; F-11 | The add flow should read and honor the person's contact rule before copying a forbidden channel. touches(G-6) |
| LH-3 | P1 | high | A client household has one login; a co-owner who acts on the job (Chidi) has no structured slot — only a free note or an unlinked `client_rep` party | `people/directory/add-person-sheet.tsx` (client fields); current-state.md §D; F-04/F-05 | Add a household object holding both members with a shared threshold. new |
| LH-4 | P1 | high | No field anywhere records who may approve money or change orders, at what threshold | grep of migrations for authority/threshold, empty; F-05 | Authority grant on the engagement, defaulted from the agreement. known(G-15) |
| LH-5 | P1 | high | `client_rep` is reachable only through the Call Sheet's rolodex picker, not the primary Add Person sheet a studio member actually opens first | `add-person-sheet.tsx:92-104` (6 kinds, no client_rep) vs `roster/rolodex-picker.tsx:47-56` | Put client_rep in the front-door kind list, or make one door for both. new |
| LH-6 | P1 | high | No object records site access — key holder, codes, hours, emergency lines; only `site_request_access` exists and it is a field-request workflow table, not a facts card | `supabase/migrations/00374_field_site_request_loop.sql`; F-06/F-09 | One site access card per project, key holder as an engagement reference. new |
| LH-7 | P1 | high | "Who has site access on Okonkwo" is unanswerable today at any click count — every Build & supply row looks equally "on the job" with no access fact to unfold to | `roster/roster-row.tsx:170-184` | Same as LH-6; the room must stop implying access from mere roster presence. new |
| LH-8 | P1 | high | No do-not-contact flag and no route-to-person field exists on a party or a person; Frank cannot be marked, Rosa cannot be designated | `people/party-profile-sheet.tsx:557-610`; F-14/F-15 | Contact rule with `do_not_contact` + `route_to_person_id`. known(G-7) |
| LH-9 | P2 | high | Frank and Rosa are two independent party rows linked only by a matching, unenforced `company_name` string — no FK connects them as coworkers | current-state.md §B1 `project_parties` (`company_name` TEXT, no `company_id`) | Give the party a real company reference so coworkers resolve to one firm card. known(G-4) |
| LH-10 | P2 | med | The only present-day way to leave a "do not contact Frank, write Rosa" instruction is a free-text note that no send path or future rolodex pick will ever read | `add-person-sheet.tsx` note field | Same as LH-8; a note is not a rule. touches(G-7) |
| LH-11 | P1 | high | Bringing a repeat sub or vendor rep onto a new job (the bring-forward path) carries only name/company/trade/phone/email/`studio_contact_id` — no consent, no COI status, no history line | `roster/rolodex-picker.tsx:204-214`; F-11/F-12/F-13 | Fixed travel list at pick: identity, contact rule, consent by channel value, document expiries, one history line. touches(G-24) |
| LH-12 | P1 | high | Pete Rusk's new Okonkwo row would read `not_asked` even though he replied STOP on the Lindqvist thread after close, inviting the studio to text him again while the send gate silently refuses | F-12; `supabase/functions/sms-inbound/pipeline.ts:159-164`; `_shared/sms.ts:174-185` | Consent as one record per studio per phone value, carried at pick with its origin project and date. known(G-3) |
| LH-13 | P2 | high | Dana's lapsed COI (expired 2026-03-31) shows nowhere in the rolodex picker or the new party row when picking her for Okonkwo | F-11; grep of migrations for `coi`/`w9`, empty on a document object | Surface document expiry on the picker's mini row and block mobilization until it is current. known(G-14) |
| LH-14 | P2 | med | Claire Bissett, the actual person I talk to at Stonehaven, may have no rolodex card to pick at all — vendor reps are TEXT columns on a vendor account, not people | `supabase/migrations/00009_vendor_management.sql:59-76`; F-20 | A rep is a person card affiliated to the vendor firm. known(G-19) |
| LH-15 | P2 | med | The rolodex picker adds one person per search-and-select cycle; bringing four people from Lindqvist takes four separate passes with no multi-select | `roster/rolodex-picker.tsx:188-215` | Allow selecting several rolodex cards before one confirm. new |
| LH-16 | P1 | high | The project roster has no stage or on-site window, so "everyone this week" cannot be filtered — a February 2027 radon sub lists identically to this week's framer | `roster/roster-groups.tsx:9-13`; F-19/F-24 | Stage plus on-site window on the engagement; group by "this week / later / done." new |
| LH-17 | P2 | high | The vitals line is a studio-wide count ("N on the job"), not a this-week cut, and cannot answer "who's actually here this week" either | `lib/document/roster-derivation.ts:402-415` | Same as LH-16; the vitals line should read the window, not a raw tally. new |
| LH-18 | P2 | high | Neither the AHJ inspector (F-27) nor the lender's draw inspector (F-26) has a matching party kind; both may never appear on "everyone on Okonkwo" at all | current-state.md §B1 `party_kind` CHECK (11 values, no inspector/lender); F-26/F-27 | Widen the kind vocabulary to include inspector and lender, each defaulted never-text. known(G-13) |
| LH-19 | P3 | med | The People room Directory shows no reach word on any row; "how do I reach Dana" costs an extra screen even after finding her | `people/directory/person-row.tsx:76-99` | Show reach and the contact rule on the directory row, not only the Call Sheet. known(G-21) |
| LH-20 | P2 | med | Even after the visual grammar settles (people circles, firms squares), Frank's and Rosa's shared employer still resolves to nothing but a matched text string, not a real company card | current-state.md §B1; F-14/F-15 | Company reference on the party row, not a TEXT snapshot. known(G-4) |
| LH-21 | P3 | low | Consent capture (verbal/written/web_form/other + evidence) is thorough for a brand-new party but there is no analogous capture for revoking or overriding a channel per person after the fact | `people/directory/add-person-sheet.tsx:927-969` | Extend the same evidence pattern to a revoke or do-not-contact action. touches(G-7) |
| LH-22 | P3 | med | "Receiver" is the closest kind to Ngozi's actual job (holds a key, lets trades in) but the label only promises "receives deliveries" in the UI, so site-access facts get silently folded into a role that doesn't carry them | current-state.md §A3/§B1; F-06 | Site access facts belong on the site access card, not implied by a party kind. touches(G-13) |

---

## Decisions I am making for the direction

1. A contact rule (forbid a channel, route to another person) lives on the person, with an optional per-job override — this closes tasks 1 and 4 in one object, per CRM-3.
2. Authority (who signs, up to what dollar amount) lives on the engagement, defaulted from the agreement, never on the person alone — a person's authority can differ project to project.
3. A household groups client-side people who act together on one job; a login and an authority grant are two different facts about the same household member, and the room must stop conflating them.
4. Site access is a project-level card, not a party fact — it answers "who can get in," which is a different question from "who is on the roster."
5. The bring-forward pick carries a fixed, named list of facts (identity, contact rule, consent, document expiry, one history line) and never carries pricing or project notes — this is not configurable per studio.
6. Vendor reps get a person card. A firm without a reachable human is a dead end I hit on this very walk.
7. The Call Sheet's "this week" grouping reads the engagement's stage and window, not a raw list of everyone ever added to the job.
8. client_rep belongs in the same front door as client, gc, sub, installer, receiver — a studio member should never have to know which of two rooms admits which kind of person.

## Open questions for Kody

1. When a household splits money-signing and selections authority (Chidi vs Adaeze), does Patina need two logins, one login plus a delegated authority record, or does that decision belong to the studio per household, not to the platform?
2. Cross-studio compliance sharing (AM-2) would let Dana's COI lapse show up even for a studio that never itself verified it — is that acceptable, or must every studio verify independently even for a well-known repeat sub?
3. Site access facts (gate codes, lockbox versions) are physical-security-adjacent — does Patina want to store a live gate code at all, or only who holds a key and who was told, leaving the code itself off-platform?
