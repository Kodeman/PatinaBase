# FM: field and mobile, 390px, one hand, gloves

Scope: the studio designer's own phone, on site, signal thin, gloves on. Every screen below is a studio surface (Directory, person/company card, Call Sheet). Patina Field (Capture) gets its own section (5); it is a designer session, never a trade or homeowner login (`current-state.md:208`, `field-login-token/index.ts:7-15`).

## 1. Directory, person card, company card, project roster at 390

Row grammar for all four objects: name and stage never fold, reach word and a live phone (`tel:` link) sit on the row whenever a phone exists, everything else moves to the unfold or the profile. Stage per CRM-7 does not exist yet (`00212_project_parties.sql:27-43` has no stage column); until it ships the fourth row slot is trade or company, not stage.

| Object | Stays on the row at 390 | Folds to unfold / profile |
|---|---|---|
| Directory row | avatar, name (wraps, never truncates), reach word, phone as `tel:` | role badge text, relationship line, rolodex marker, consent chip |
| Person card header | name, primary phone `tel:`, reach word, current affiliation (company + role_at_firm) | contact rule detail, studio verdict, full engagement history |
| Company card | 42px square mark, legal/dba name, kind, one named contact (paperwork or site contact) with `tel:` | full crew list, retainage, warranty_until, secondary reach channels |
| Project roster row | avatar, name, trade/kind (or stage once it ships), reach word, phone `tel:` | consent detail, "Show to client," "Copy field link," Remove |

ASCII wires, 390px content width (24px side padding already spent).

```
DIRECTORY ROW - folded
+--------------------------------------+
| (SW)  Sarah Whitfield                |
|       Field link   612-555-0114 [ ] |   <- [ ] = 44x44 tel: target
+--------------------------------------+
tap row  -> profile
tap [ ]  -> dials

PERSON CARD - header
+--------------------------------------+
| (EO)  Erin Sato                      |
|       Marrow & Sons - PM             |
|       Field link  612-555-0177 [ ]  |
|       On this job: Okonkwo - Active  |
+--------------------------------------+

COMPANY CARD
+--------------------------------------+
| [MS]  Marrow & Sons                  |
|       General contractor             |
|       Erin Sato, PM  612-555-0177[ ]|
|       COI expires in 12 days         |
|       6 people - 2 projects          |
+--------------------------------------+

PROJECT ROSTER ROW - Call Sheet, folded
+--------------------------------------+
| (DK)  Dana Kowalski                  |
|       electrical - sub               |
|       Field link   612-555-0142 [ ] |
+--------------------------------------+
tap row -> unfold (consent, show to
           client, copy field link,
           remove)
```

## 2. Search by phone suffix and first name

Today no search anywhere in the People room or the rolodex picker reads a phone digit. The Directory haystack is name plus role plus company plus email (`directory-view.tsx:304-316`); the rolodex picker's search is the same three fields (`use-studio-contacts.ts:145-151`). At 390, one hand, a designer who just missed a call needs to paste or type the last four to seven digits and find the person.

1. One shared match function, used by Directory, rolodex picker, and Call Sheet search: normalize the query to digits-only; if 3+ digits, match against the last N digits of every `phone_e164` on the row.
2. Same function also matches a first-name token prefix, case-insensitive, independent of the phone branch (a query can be digits or letters, never both at once, so there is no ambiguity to resolve).
3. Company-card search matches the same way against every affiliated person's phone, not only the company's own line, since the fixture's real search ("who called from a 612 number ending in 0142") is a person's cell, not the firm's front desk.
4. Search input type stays `type="search"` for the numeric keypad hint on iOS; no separate phone-only field.

## 3. Site access card at 390

No object exists yet (E15; `packages/types/src/field-config.ts:110-121` has no key-holder kind). This is the single highest-value new mobile screen: arriving at a locked, unmanned site with thin signal is exactly when a designer reaches for a phone instead of a laptop.

| Field | On the card at 390 | Notes |
|---|---|---|
| Emergency lines | first, each as `tel:` | time-critical; sorts above the code |
| Gate code / lockbox version | second, plain text, large | not a badge; a code is not a status |
| Key holder | name + `tel:`, one line | one engagement reference, per fixture F-06 |
| Hours | one line | HOA / city hours |
| Who was told | a short log, newest first | write action: "log who was told," reusing the roster row's inline confirm-band grammar (`roster-row.tsx` Remove band) rather than a new modal |

The one write action on this screen at 390 is the notice log. Codes, key holder, and hours are read-mostly and must work fully offline (§6).

## 4. Reach and access control at 390

| Action | Available at 390 | Constraint |
|---|---|---|
| Call | yes, `tel:` on every row with a phone | needs a real tap target, not the row's whole button (§7, FM-6) |
| Text | yes, existing composer | textarea must stay above the iOS keyboard; sticky, not scrolled under it |
| Mint / copy field link | yes | show the link's remaining days on the row, not only after opening it (CRM-14) |
| Revoke a link | yes, from the profile | destructive act, needs the same confirm-band grammar as Remove |
| Record consent captured in person | not today, no path after add-time (`add-person-sheet.tsx:217-229` is the only entry) | add a one-line "record consent" quick action reachable from the party sheet on site |
| Edit compliance documents / authority thresholds | no | belongs to the desk (bookkeeper, principal), never a 390 quick edit |

## 5. What Patina Field (Capture) should and should not surface

Capture today has no roster screen of any kind (grep of `apps/mobile/Capture/**/*.swift` for roster/party/contact/people returns only Leads, SiteRequests, Decisions). This redesign is the first time any part of the CRM model reaches Field. `field-login-token` mints only for the caller's own email (`current-state.md:208`), so every Field session is a studio staff member's own scoped login, never a trade identity, which is the technical backstop for the list below, not only a policy preference.

Should surface, for the active project only:
1. The Call Sheet roster, same row grammar as §1: name, reach word, phone `tel:`, trade/stage.
2. The site access card, read-mostly, full offline (§3, §6).
3. Who holds money and change-order authority on this job, read-only (once CRM-2 ships) so a field decision is not made past the wrong person.
4. A quick "record consent" and a quick "mint a field link for someone new on site" (a framer's second who showed up unannounced), both studio-staff writes, not a trade-facing door.

Must never surface:
1. The studio-wide Directory or rolodex across every project (out of scope per PR-4, iOS ranks second; Field's job is the job in front of the designer).
2. Compliance-document upload or verification, authority-threshold editing, or anything else that belongs to the desk (bookkeeper, principal).
3. Any writing surface for a trade or a homeowner. Every AM-1/AM-8/AM-10/AM-13/AM-15 ask for a trade upload door is parked (`crm-model.md` §9); Field does not smuggle one in through a "designer's phone, but handed to the super to fill in" pattern.
4. Engagement chrome: counts, streaks, "N days since last touch" badges. This is a studio surface; never optimized for engagement (`VISION-DECISIONS.md:21`).

## 6. Offline and slow-network posture

A job site is frequently one bar or zero. Nothing in the read files (`use-people.ts`, `use-coordination.ts`, `roster-derivation.ts`) shows a cache-and-show-stale pattern; this is undesigned today, flagged low-confidence pending a data-hook read outside this seat's scope.

1. The active project's roster and site access card are the two objects that must be readable fully offline, cached from the last successful load, with a plain-text "as of [time]" line, not a spinner (house sheet A6: loading is ink, not a spinner).
2. Writes made offline (a notice-log entry, a recorded consent) queue and show "will send when back online," never a silent failure or an infinite spin.
3. `tel:` and viewing cached codes must never depend on a network round-trip.
4. A field link's 90-day expiry (CRM-14) should not hard-fail a renewal attempted with no signal; the mint should retry when connectivity returns rather than reading as broken on the spot.

## 7. Touch targets and thumb zones

The house sheet already sets the floor: `.act` is `min-height: 44px; min-width: 44px` (`SPEC.md` §A5). The Call Sheet's row and its chevron already meet it (`roster-row.tsx:131`, `:163`, both `min-h-11 min-w-11`); the Directory row's chevron is a bare glyph inside the row's own button, so the whole row is the target, which also passes. Two real gaps:

1. Adding a `tel:` link on a row that is today one clickable `<button>` (`roster-row.tsx:129-165`; `person-row.tsx:69-98`) is not legal HTML: an `<a>` cannot nest inside a `<button>`. The row needs to become a container with two sibling targets, the open-profile button and the tel link, each its own 44px zone with an 8px gap so a gloved thumb does not double-fire.
2. One hand, on site, means the primary act per screen sits in the bottom third. The portal already reserves the thumb edge for one forward act (`mobile-bar.tsx`, "The phone's single thumb-edge owner"); a Field roster screen should reuse that shell rather than invent a new one, so the call/text act for whoever is in view lands where the thumb already rests.

---

## Findings

| ID | P | Confidence | Claim | Evidence | Proposed |
|---|---|---|---|---|---|
| FM-1 | P1 | high | No `tel:` link exists anywhere in the designer portal or Capture; a phone number cannot be dialed from any face | grep of `apps/designer-portal/src`, `apps/mobile/Capture` for `tel:`, zero hits; F-09, F-06 | Render every phone as `tel:` on the Directory row, roster row, and person/company cards, on at every width. new |
| FM-2 | P1 | high | No search anywhere matches a phone digit; Directory, rolodex picker, and Call Sheet all match only name/role/company/email | `directory-view.tsx:304-316`; `use-studio-contacts.ts:145-151` | One shared match function: digit-suffix match plus first-name-token match, used everywhere search exists. touches(G-9) |
| FM-3 | P1 | high | The reach word (Account / Field link / On paper) renders on the Call Sheet but not in the People room Directory | `A7`; `person-row.tsx:76-99` | Reach word joins the Directory row as plain text, not a chip. known(G-21) |
| FM-4 | P1 | high | Phone hides behind an unfold on every roster row and is absent outright on every Directory row | `roster-row.tsx:170-184`; `person-row.tsx:76-99` | Phone (as `tel:`) sits on the row by default at 390 whenever the person has one. known(G-9) touches CRM-32 |
| FM-5 | P1 | high | No object holds the site access card; gate code, key holder, hours, and emergency lines live in a superintendent's phone, not Patina | `packages/types/src/field-config.ts:110-121`; `fixture.md` §3 receiver row | Build E15 as one object per project with a change log; the mobile view is read-mostly plus one write (log who was told). known(CRM-8) |
| FM-6 | P1 | med | Today's row is one clickable `<button>`; a `tel:` anchor cannot legally nest inside it, so adding tap-to-call requires restructuring the row into two sibling targets | `roster-row.tsx:129-165`; `person-row.tsx:69-98` | Row becomes a container with an open-profile control and a separate tel link, each its own 44px zone with spacing between. new |
| FM-7 | P2 | high | Engagement stage does not exist in the schema (CRM-7); a mobile row cannot show "stage" as the task asks until it ships | `00212_project_parties.sql:27-43` | Sequence the mobile row redesign after CRM-7 lands; until then the row's fourth slot is trade or company. touches(CRM-7) |
| FM-8 | P2 | med | The Call Sheet is a backdrop-dismiss modal; at 390 the backdrop is close on either side of a ~342px panel, one fat-finger from losing an in-progress compose | `doc-sheet.tsx:354-378` | Suppress backdrop-dismiss (or confirm) while `composing` is true on any child row. new |
| FM-9 | P2 | low | The rolodex picker autofocuses its search field on mount, which may race the sheet's slide-up animation and the keyboard on a real device | `rolodex-picker.tsx:136` | Verify on-device; delay focus until the open animation settles if a race is confirmed. new |
| FM-10 | P2 | high | No compliance-document or authority object exists (CRM-1, CRM-2); a mobile company or engagement card cannot show "COI expires" or "who may approve $2,500" until they ship | `00579_trade_agreements.sql:84` | Block the company/authority mobile card content on CRM-1/CRM-2 landing; do not fake it with free text. touches(CRM-1, CRM-2) |
| FM-11 | P2 | med | The company row shows one kind pill and a headcount line, no named contact; the fixture's "call the office, never the owner" rule (F-14/F-15) has nowhere to render on a 390 card | `company-row.tsx:34-40`, `:76-84` | Company card names one contact (paperwork or site contact) with `tel:`; do not surface the do-not-contact person's own number. known(G-4) |
| FM-12 | P3 | med | `person-row.tsx` and `company-row.tsx` use `truncate`; the house sheet forbids `text-overflow: ellipsis` on any specimen, and 390 is where truncation bites hardest | `person-row.tsx:79`, `:85`; `SPEC.md` §A4, §A13 | Switch to wrap; recompute the 44px row-height math once names can grow to two lines. known(G-23) |
| FM-13 | P2 | med | Recording a verbal consent captured on site has no path after add-time; the only consent fields are in the Add Person sheet | `add-person-sheet.tsx:217-229` | Add a one-line "record consent" quick action on the party sheet/roster row, usable in the field. touches(CRM-4) |
| FM-14 | P2 | med | Field-link expiry is invisible until a designer opens the profile and mints/copies; the roster row shows only the current state word, no days remaining | `party-profile-sheet.tsx:420-436`; `reach-chip.tsx:19-35` | Show remaining days on the row when a link is within 14 days of expiry. touches(CRM-14) |
| FM-15 | P2 | low | No cache-and-show-stale pattern is visible in the read hooks for the roster or Directory; offline behavior today is undesigned as far as this seat can verify | `use-people.ts`; `use-coordination.ts` (no offline handling found) | Cache the active project's roster and site access card locally with an "as of" line; needs a data-layer read beyond this memo. new |
| FM-16 | P3 | low | Capture has no roster, party, or contact screen today; this redesign is the first time any part of the CRM model reaches Field | grep of `apps/mobile/Capture/**/*.swift` for roster/party/contact/people | No existing Field pattern to preserve; build the roster/site-access screens fresh, reusing the portal's row grammar. new |
| FM-17 | P2 | high | `field-login-token` mints only for the caller's own email; every Field session is a studio staff member's own scoped login, never a trade identity | `field-login-token/index.ts:7-15` | Treat this as the technical backstop for "Field never gives a trade a writing surface," not only a policy line. touches(PR-3) |
| FM-18 | P3 | low | The portal already owns one thumb-edge pattern (`mobile-bar.tsx`); a new Field roster screen risks inventing a second, competing pattern | `mobile-bar.tsx:3-4` | Reuse the existing bottom-bar shell for Field's roster/site-access screens. new |
| FM-19 | P3 | low | When the site access card ships, emergency lines are the most time-critical field and should sort above the gate code, which is not time-critical | `fixture.md` §3 receiver row | Order the mobile card: emergency lines, then code, then key holder, then hours. new |
| FM-20 | P3 | low | No existing UI pattern for a "who was told" notice log; the nearest reusable grammar is the roster row's inline Remove confirm-band | `roster-row.tsx` (confirm-remove band, inline, no modal) | Reuse that inline-band grammar for the site access card's notice log rather than a new modal. new |

## Decisions I am making for the direction

1. Name and stage never fold on any row at 390; reach word and phone fold last, everything else folds first.
2. Every phone renders as a live `tel:` link at every width, not a desktop-only affordance.
3. The row's tap target and the phone's tap target are two separate elements from now on, never one button carrying both.
4. Search matches phone-digit suffixes and first-name tokens everywhere a search field exists in this model, one shared function.
5. The site access card's only mobile write action is the notice log; codes, key holder, and hours are read-mostly and cached offline.
6. Patina Field's roster and site-access screens are scoped to the active project only, never the studio-wide Directory.
7. Nothing in this model gives Capture a trade-facing or homeowner-facing writing surface; every such ask stays parked per AMENDMENT-ASK (crm-model.md §9).
8. The mobile roster row's fourth fact is stage once CRM-7 ships; until then it is trade or company, and the direction says so rather than mocking a fact that does not exist.

## Open questions for Kody

1. Is a gate code or lockbox version sensitive enough to warrant a re-auth or hide-on-glance treatment on a phone screen, or is studio-membership access sufficient the way every other field is treated today?
2. Should Patina Field ever let a designer mint a field link for a brand-new person met on site (no existing rolodex card), or must that always go through the desk first?
3. When CRM-2 (authority) ships, should the mobile card show a threshold number ("$2,500") on a screen a client might glance over the designer's shoulder to see, or should it show only the yes/no ("may approve this change order")?
