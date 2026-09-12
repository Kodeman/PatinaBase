# Rulings: Everyone on the Job (People room CRM panel, 2026-09-11)

Kody's rulings, in one place. Sections 1 and 2 come from `synthesis/direction.md` §9. Section 3 records what the orchestrator ruled during build so the record stays complete. Section 4 is the parked list. Section 5 states what is out of scope for this ruling pass.

## 1. Rulings needed before build

These seven carry the most weight or the most cost if wrong. Rule these first.

| ID | Ruling | Panel's lean | What changes if overruled | Kody's ruling |
|---|---|---|---|---|
| PR-a | The trade-side compliance upload door (AM-1, AM-8, AM-10, AM-13, AM-15), asked by five of six construction seats as one object | Park it. The studio records the document on the company card; Patina drafts the chase to the firm's paperwork contact, landing `awaiting_review` | A tokened upload page, an unverified-until-confirmed document state, and a trade-facing write tier enter the roadmap; the company card gains an inbound queue | BUILD the trade-side upload door in P3. Overrules the panel's park; amends VISION S2 (Kody, 2026-09-11) |
| PR-b | D-A: does a seat snapshot or live-read firm and person facts | Hybrid. Name at time and trade on the job stay snapshotted; typed channels, contact rule, consent and document expiries read live from the card when `studio_contact_id` is set. Amends PD-3 | Every seat keeps its own copy of consent and expiry, and the room re-derives truth heuristically at every seam, as G-1 already describes | Hybrid adopted |
| PR-c | CRM-19: household object, or `client_rep` party row, for Chidi Okonkwo | Both, split by job. A household holds the members and the change-order threshold; every member who acts on a job gets a seat carrying the authority grant | If household only: authority has no per-job home. If `client_rep` only: the two spouses never resolve to one client | Household + seat adopted |
| PR-d | CRM-14: the 90-day link clock | Retire it. A grant ends with the engagement window, renews on use, and prints its end date in words | The mint act cannot say "ends with the job"; the studio re-mints on a clock unrelated to the work | Ends with the job adopted |
| PR-g | Do firm rows appear under Everyone, or only under Firms | Mixed default list: firms appear under Everyone, sorted into the band of the crew they carry, and the head names both nouns ("29 people, 22 firms") | Everyone lists people only, Firms becomes the sole door to the rolodex's firms, and the head count carries one noun | Mixed list adopted |
| PR-q | Density: hairline ledger rows at the 1200 band, replacing today's bordered white card rows at 760px | Adopt. The Directory is a ledger; the Call Sheet stays a 760px DocSheet | Today's row and measure stand, the word columns collapse into the unfold, and the Directory answers fewer questions per screen | 1200 ledger adopted |
| PR-r | Does Patina store a live gate code at all | Store the lockbox version, the key holder, the hours, and who was told. Hold the code itself off Patina and print that the code is held off Patina, ask the key holder. No re-auth gate, no hide-on-glance | Patina stores the code, and the site access table needs a sensitivity treatment the room has no precedent for | Never store the code adopted |

## 2. Leans on record (stand unless overruled)

Eighteen more rulings. Each carries a working lean; build proceeds on the lean unless Kody overrules a specific row.

| ID | Ruling | Panel's lean | Kody's ruling |
|---|---|---|---|
| PR-e | Extending the three reach words (Account, Field link, On paper) | Do not extend. A forbidding or routing rule prints as a sentence beside the word, never as a fourth word | STAND (Kody, 2026-09-11) |
| PR-f | CRM-10: widen kinds and trades | Widen in code now: client_rep, inspector with an ahj / lender / third_party subtype, lender, engineer, vendor, other_named with a required label; trades gain radon mitigation, insulation, waterproofing, roofing, septic. Defer studio-editable extension lists | STAND (Kody, 2026-09-11) |
| PR-h | Does a lapsed COI read as a blocking clause on the roster row, or only on the company card | Both, one source. The document lives on the company card; the roster row prints a held clause in words with a terracotta leading rule, not a badge | STAND (Kody, 2026-09-11) |
| PR-i | Which history line a picker mini row may carry | Repeat count and dates only. Never a verdict at the pick | STAND (Kody, 2026-09-11) |
| PR-j | Do `?role`, `?view`, `?scope`, `?trade` stay in the address | Keep them. The People room gets its own rule | STAND (Kody, 2026-09-11) |
| PR-k | Does Chidi Okonkwo get a second Patina account by default | No. Email-only is his default mode; an account is optional and additive | STAND (Kody, 2026-09-11) |
| PR-l | When the engagement window is shorter than the firm's warranty term, does minting auto-extend | Make the studio choose, with the warranty end offered as the second option in words | STAND (Kody, 2026-09-11) |
| PR-m | Is "mark opted out" ever a manual studio act | Yes, with a source and evidence, for a verbal STOP the studio heard. The way back is always a fresh recorded consent or an inbound START | STAND (Kody, 2026-09-11) |
| PR-n | Who may set an authority grant | The principal by default; the lead designer may set a grant whose scope excludes money and draw certification | STAND (Kody, 2026-09-11) |
| PR-o | On merge, may the studio flip which card survives | Yes, always the studio's call. The older card is pre-picked, both ids stay resolvable | STAND (Kody, 2026-09-11) |
| PR-p | Stage on the cross-project Directory row | Stage prints on a seat line only, never as a person-level column | STAND (Kody, 2026-09-11) |
| PR-s | May Patina Field mint a field link for someone met on site with no rolodex card | Yes, for a studio member's own session, creating the person card at the same moment | STAND (Kody, 2026-09-11) |
| PR-t | Does a mobile screen show an authority threshold figure | Show the yes or no ("may approve this change order"), and the figure only on the desk | STAND (Kody, 2026-09-11) |
| PR-u | AM-2: cross-studio compliance sharing | Park it. Each studio verifies independently; the compliant version copies the last verified document forward at the pick, inside one studio | STAND (Kody, 2026-09-11) |
| PR-v | Who adds `--color-dusty-blue-ink` and re-audits every tint used as text | The People room build owns it, in the same alias block that maps house-sheet token names onto the shipped `--color-*` names | STAND (Kody, 2026-09-11) |
| PR-w | Is the site access card ruled out of every client-facing surface, in writing | Yes. Studio-only table, no client RLS branch, no `show_to_client` toggle | STAND (Kody, 2026-09-11) |
| PR-x | Is the phone-global consent reduction in `sms.ts:174-185` retired once `studio_channel_consent` ships | Keep it as a fail-closed secondary check until backfill is proven, then retire it in a named follow-up | STAND (Kody, 2026-09-11) — superseded by R-AY 2026-09-12 unless Kody overrules |
| PR-y | Is the `people_directory` rebuild sequenced before the seats-beneath Directory | Yes, both in P1, view first, behind a flag, with the six-branch view kept live | OVERRULED: no flag — the rebuilt `people_directory` replaces the six-branch view at 100% on deploy (Kody, 2026-09-11) |

## 3. Ruled by the orchestrator during build (Fable)

These were decided mid-build to keep the specimens moving. They stand unless Kody reopens one.

| ID | Ruling |
|---|---|
| R-A | No paper word for lender or inspector firms |
| R-B | Task 2 acceptance softened to the person card and Call Sheet; money papers read it later in the money book |
| R-C | Seventh specimen state is Bring forward: a rolodex picker with a travel list |
| R-D | Dana Kowalski's seat window runs to substantial completion, 13 Aug 2027 |
| R-E | The 1440 kind-picker mapping is canonical |
| R-F | The Call Sheet vitals literal reads "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper", recomputed against fixture §4's engagements; no specimen change is owed since both files already print this string |
| R-G | The Directory person row carries exactly three bordered word columns — reach, consent, paper. Stage prints only on the seat line beneath, never as a person-level column. The company row is unchanged: two columns, paper and payee marker |
| R-H | Great Northern Bank and City of Minneapolis CPED Inspections appear as Directory firm rows, under Everyone and under Firms, with no paper word and no payee marker; the head count of 22 firms already includes them |
| R-I | On the bring-forward picker the act row ("Add four to the roster" · "Put back") comes first, the consequence sentence directly beneath it, at both widths; the checkboxes and "Put back" are live at both widths, not gated |
| R-J | The Add sheet's authority field reads exactly, per branch: with a source engagement, "Defaulted from the agreement. Confirm it, or write a different one." and the act "Confirm from the agreement"; with none, "Nothing defaulted from the agreement." and the act "Record the authority" |
| R-K | Every company card renders the Paper region. A firm with no `documents` array prints paper word "Not on file" with the act "Record a document". A lender or inspector firm prints only "No paper is held for this firm." and no act |
| R-L | A routed contact line prints the routed person's email and office phone, the phone `tel:`-linked, at both widths, under one channel-selection rule used everywhere a channel is chosen for display: email if present, then the office phone tel-linked, never a bare phone string |
| R-M | At 390 every person row's line 2 prints reach · consent · paper as three plain inline words (no border, middle-dot separated) on every row, folded or not; stage prints only on the seat line inside the unfold; §5.1 #7's bordered columns apply at 1440 only |
| R-N | SPEC §5.1 #11 drops the paper "Not on file" clause; lender and inspector people print no paper word |
| R-O | The fixture JSON in SPEC §3 (and both files) sets Claire Bissett's consent to "Not asked"; her 1440 row prints reach `On paper`, consent `Not asked`, paper `Current` (Stonehaven holds a current W-9) |
| R-P | Company card Paper region prints, at both widths: the table, then the leading-rule clause, then the consequence sentence, then the act row |
| R-Q | One consent sentence wording everywhere: "<Source> consent, <d Mon yyyy>, on the <project>." e.g. "Written consent, 2 May 2025, on the Lindqvist kitchen."; "Verbal consent, 13 Oct 2026, on the Okonkwo residence."; "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen." |
| R-R | A roster row with a bid history prints it at both widths: "Quoted 2 October 2026. Selected 9 October 2026." |
| R-S | A blocked rule clause prints wherever a rule is shown (Directory row, roster row, person card, company card crew line) whenever the rule blocks, with the routed line appended only when a route exists, at both widths |
| R-T | An opted-out note prints on a collapsed roster row at both widths, not only inside its unfold |
| R-U | The site-access summary line "Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026." prints under the Call Sheet heading at both widths |
| R-V | Every person card prints all its regions with their sub-heads at both widths. When a record is absent the fallback lines read exactly "No contact rule on file.", "No grant on file.", "No open seat on this project.", as the 1440 file already does |
| R-W | On the company card's crew line only the person's name is the control — a button whose accessible name is the name — at both widths; the designations are plain text |
| R-X | At 390 the whole "who to call first" line on the site access card is the `tel:` target, at least 44px tall; at 1440 only the phone digits are linked. A deliberate mobile adaptation named in SPEC §6.2, not a parity finding |
| R-Y | The Compare & merge sheet is phase 2 (direction.md §8), so the specimen carries no Compare & merge act. The duplicate band keeps its sentence "These two cards share a phone." followed by the two names, each a live open-person control, at both widths. SPEC §5.1 #17 is amended to say exactly this |
| R-Z | No element id may equal a hash token. The 390 file's state sections take the 1440 file's `id="face-<state>"` pattern with a hash-to-id lookup; all `getElementById` call sites follow |
| R-AA | A seat line under a Directory person row is a button at both widths whose accessible name is the seat's text, and activating it opens that person's card — the same open-person path as the row's name — announcing the card in `role="status"`. No inert buttons |
| R-AB | These specimens are design specimens, not a prototype of writes. The acts that would write to the studio's book — Edit the rule, Revoke, Send a text, Record a document, Chase the renewal, Text, Copy field link, Show to client, Close this seat, Add four to the roster, Add to the roster, Save this note — are deliberately inert. They stay enabled, focusable buttons beside their consequence sentences; no `aria-disabled`, no caveat on the face. SPEC §7 gains rule 13 stating this. Settled: not a finding |
| R-AC | Owners and admins of the studio receive the compliance_document_inbound notice, plus the member who minted the paperwork link if they are neither. No new role. (Kody) |
| R-AD | A firm with no active engagement may still be minted a paperwork link; the studio chooses the end date, offered as 30 days or the firm's next engagement window, in words on the mint act (PR-l pattern). No silent fallback clock. (Fable) |
| R-AE | A confirmed waiver upload stays a compliance document on the company card; it writes nothing to the money book. The money book reads it later if it chooses (CRM-9 lean). (Fable) |
| R-AF | One paperwork token per firm by convention; a person who is paperwork contact for two firms holds two links. (Fable) |
| R-AG | record_channel_consent refuses 'not_asked' as a target status; no status change may null or overwrite consent evidence columns; a change restates evidence or is refused (W1a M3-1). (Fable, 2026-09-11) |
| R-AH | flushDeferredMessages re-checks consent through channelConsentVerdict keyed off the party row before every deferred send (W1a M3-2). (Fable, 2026-09-11) |
| R-AI | 00592 backfills studio_person_affiliations from studio_contacts.company_id; a trigger keeps company_id equal to the open affiliation; the room reads affiliations, company_id is a derived legacy pointer (W1a M3-3). (Fable, 2026-09-11) |
| R-AJ | Inbound START/UNSTOP grants consent only for studios whose record for that phone is opted_out or pending; not_asked and no-record studios are untouched (W1a M3-4). (Fable, 2026-09-11) |
| R-AK | The no-record consent fallback is scoped to the resolving studio's own party rows; PR-x's fail-closed phone-global check means across that studio's projects, never across tenants (W1a F3). (Fable, 2026-09-11) |
| R-AL | record_channel_consent's transition gate also reads the studio's own party rows: a grant is refused (channel_opted_out) while any party row on that phone in the studio is opted_out with a dated opt-out and the record does not already say opted_out (W1a B5-1). (Fable, 2026-09-11) |
| R-AM | The edge SMS rail never calls _primary_studio_for (revoked from client roles by 00483); orgs resolve through organization_members/organizations with errors checked at every call site (W1a M5-1). (Fable, 2026-09-11) |
| R-AN | The consent mirror never overwrites a non-null evidence column with NULL; inbound YES/START falls back to the disclosure version and recorder standing on the studio's own seats (W1a M5-2). (Fable, 2026-09-11) |
| R-AO | Affiliations are N persons × N firms; the company pointer trigger opens or closes only the affiliation it names and leaves siblings standing (W1a M5-3). (Fable, 2026-09-11) |
| R-AP | paperwork_contact_person_id, signer_person_id and site_contact_person_id must each name a person card in the same studio and never the row itself, enforced by a BEFORE trigger (W1a M5-4). (Fable, 2026-09-11) |
| R-AQ | R-AN refined: a refusal with no source has evidence known absent, so a sourceless opt-out mirrors NULL into every sibling seat's evidence columns; COALESCE governs every other transition (W1a R8-M1). (Fable, 2026-09-11) |
| R-AR | A BEFORE UPDATE OF entity_kind, organization_id trigger on studio_contacts refuses the change while any channel, designation, rule route, or affiliation still points at the card (W1a R8-M2). (Fable, 2026-09-11) |
| R-AS | The consent mirror trigger (00594 mirror_channel_consent_to_parties) is retired: studio_channel_consent is the single source of truth; project_parties.sms_consent_* columns are frozen legacy (readable, never written by new code); every reader (people_directory, v_project_roster, the roster derivations, the party sheet, the send gate's second check) reads the record; ten review rounds of mirror-evidence findings (r5–r10) are closed by removing the copy rather than patching it (W1a close-out). (Fable, 2026-09-12) |
| R-AT | An inbound STOP whose studio attribution read failed is answered 500 / opt_out_incomplete with the Twilio idempotency claim released, never acknowledged; studiosHoldingPhone returns its failed flag and the STOP gate checks it (close-out BLOCKING-1). (Fable, 2026-09-12) |
| R-AU | START targets are chosen by the consent verdict, not the raw status column: opted_out, pending, or any record with refusal_unanswered; a not_asked record with no refusal stays untouched (close-out MAJOR-1). (Fable, 2026-09-12) |
| R-AV | Patina Field reads consent from v_project_roster.sms_consent_status (the record's verdict), never from the frozen party column; PunchCourtResolver and SupabaseSiteRequestService are repointed in this program (close-out MAJOR-2). (Fable, 2026-09-12) |
| R-AW | An inbound STOP that resolves to NO studio at all is answered 500 / opt_out_incomplete with the Twilio claim released, exactly as a failed attribution read is: a refusal the rail cannot record is a refusal it may not acknowledge. studiosHoldingPhone reports `unattributed` separately from `failed`, and the STOP gate checks both; START is not gated on it, because a studio-less seat can hold no record to lift. The SEND fail-open for that population stays open and is a policy ruling owed, not a code defect (close-out r5 BLOCKING-1). (Fable, 2026-09-12) |
| R-AX | An `opted_out` seat's phone_e164 cannot move. The freeze trigger names phone and phone_e164 beside the eight consent columns and raises consent_opted_out_phone_frozen on a genuine change, so the rule lives where the portal hook cannot be bypassed — a transplanted refusal was reachable by any authenticated studio member through PostgREST. A cosmetic reformat still lands, every other seat status still edits freely, and app.consent_legacy_write remains the one repair door (close-out r5 MAJOR-1). (Fable, 2026-09-12) |
| R-AY | Record-only consent: studio_channel_consent is the only thing any gate, RPC, view, trigger or edge path consults for SMS consent; the frozen project_parties.sms_consent_* columns are read by nothing but the one-time backfill; the site-request rail (00374 dispatch + site_request_send) is repointed to the record. Supersedes PR-x's lean (keep a phone-global seat check until backfill is proven): the backfill runs in the same migration and the freeze makes seats informationless, so a second source can only disagree. Kody may overrule (close-out r6 MAJOR-1). (Fable, 2026-09-12) (Referred to as R-AW in the W1 final-run briefs and in build/w1a-report.md; R-AY is the canonical id.) |

## 4. Parked (side journeys under VISION)

Never dropped, never quietly folded into the compliant version. Each has a compliant fallback already built into the direction.

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

## 5. What these rulings do not decide

- Build sequencing beyond the P1/P2 phasing already recorded in `synthesis/direction.md` §8.
- Migration numbers or file names for any schema change.
- Flag names for the rollout.
- The client page's "your contact" designation.
- Patina Field scope beyond what PR-s and PR-t already state.

## 6. Program rulings (Kody, 2026-09-11)

| Axis | Ruling |
|---|---|
| Scope | All three phases (P1, P2, P3) build in this program — including the trade-side compliance upload door (PR-a) in P3 |
| Deploy | One chain at the end, covering the whole program — not a phase-by-phase deploy |
| Rollout | 100% at deploy, no flag. Overrules PR-y: the rebuilt `people_directory` replaces the six-branch view outright, not behind a flag |
| Call Sheet flag | Retired. The `call-sheet` flag comes out; Call Sheet is live for all studios |
| Email deliverability | The pending email-deliverability chain deploys as step one of the final chain, ahead of the People room CRM changes |
| iOS | Patina Field (Capture) roster + site access screens are built and shipped to TestFlight as part of this program |
| Help | Help articles for the People room are drafted and pushed to Sanity |
| Definition of done | Deploy + probes + a walk script. Kody's signed-in prod walk is owed and not part of "done" for this program |
