# Room Proof: Field, scan and work-order mapping

**Scope and paths.** I read only the ten files you named, and only the first ~200 lines of each. I read follow-up ranges in `trade-scope-detail.tsx` (200–450) and `FieldRosterRules.swift` (200–320). My first read of `field-desk.tsx` errored, so I retried it and it succeeded. I took your Swift note to mean `apps/mobile/Capture/CaptureKit/CaptureKit/{Work,Sync}/…`. Short names below mean:
- **Portal:** `apps/designer-portal/src/components/document/…`
- **CaptureKit:** `apps/mobile/Capture/CaptureKit/CaptureKit/…`

I haven't read the files that surround these. Anything about hooks, migrations, `roster-derivation`, `project-commerce` or the call-sheet rendering is inferred from imports and comments only.

## 1. Verified capabilities (source-backed)

**Roster and team**
- **Project roster is one shared list.** `ProjectTeamRoster` is "the same project roster shown on the call sheet" (`roster/project-team-roster.tsx:60-63`). It says a GC is optional and trades can be added directly when there is no GC (`:60-63`).
- **Party kinds you can add.** The kinds are `gc, sub, installer, receiver, vendor, architect, photographer, stager, other` (`:13-23`).
- **Add flows.** Actions are "Add GC or trade" and "New trade contact" through a rolodex picker (`:82-93`, `:145-155`). There is a guided empty state, a loading state, and an error with retry (`:64-80`, `:112-131`).
- **Roster bands on the phone.** Seats are grouped into this week, later, bidding and done. Order is the rule: off-job beats window, and bidding beats having no window (`CaptureKit/Work/FieldRosterRules.swift:34-107`).
- **Dialing rules.** The `tel:` target comes from `phone_e164` first, otherwise from digits (`:111-136`). With no number the row says "No phone on file" (`:149`).

**Site access**
- **What the card stores.** It stores the lockbox version, key holder, hours, receiving note and who was told. It never stores the code and has no field to type one (`roster/site-access-card.tsx:6-10`).
- **Audience.** It is studio-only. There is no client RLS leg and no `show_to_client` toggle, and the card says so on its face (`:12-13`). The phone string is "Studio only. This card never reaches a client page." (`FieldRosterRules.swift:221`).
- **Gate and key lookups.** The gate controller is the seat with a `site_access` grant that is not `prepares_only` (`site-access-card.tsx:79-89`). The key holder comes from the card's own pointer (`:92-98`).
- **Head-of-sheet summary.** A one-line summary reads like "Key held by X. … Changed <date>." (`site-access-card.tsx:101-113`, `FieldRosterRules.swift:211-218`).
- **Change notice wording.** The notice reads "The way in changed <day>. Lockbox, version 3." (`site-access-card.tsx:68-76`).
- **Code leak guard on the phone.** Free text that looks like a code (a run of 4–8 digits that isn't a phone or a year) is withheld and replaced with "The code is held off Patina; ask <name>." (`FieldRosterRules.swift:173-208`).
- **Touch target.** The whole who-to-call line is the `tel:` target, at least 44px tall (`site-access-card.tsx:15-17`).

**Authority**
- **Phone-safe authority.** Phones say yes or no, never the figure (PR-t). Dollar amounts become "an agreed amount" (`FieldRosterRules.swift:232-262`). The threshold column is never selected (`:282-284`).
- **Sentences.** Examples: "Prepares only." and "May approve a change order." (`:285-297`).
- **Vocabulary.** Reach reads Account, Field link or On paper (`:307-313`). Texting consent is a separate word (`:317-`).

**Trade scope and work order**
- **Work order content.** `WorkOrderSheet` is "the page the trade gets" (`commercial/trade/work-order-sheet.tsx:4`).
  - It carries the same prose as the signed scope, room by room (`:6-8`, `:78-90`).
  - It shows the party name, project name and company (`:61-71`).
  - It shows terms text (`:93-99`) and the line "Payment is per the number agreed with the studio." (`:101-103`).
  - It has no client price, markup or bid ledger (`:8-10`).
  - It has a print-only CSS path (`:12-14`, `:25-31`) and a Print action (`:106-116`).
- **Scope as work after signing.** `TradeScopeDetail` treats a signed scope as live work (`commercial/trade/trade-scope-detail.tsx:4-9`).
  - It has a four-state journey band (`:77-109`).
  - Engagement is a second act after the client authorizes, so there are two events and two dates (`:7-9`, `:365`).
  - Engaging states its schedule impact first (`:313-325`, `:418`, `:426-449`).
  - Gated acts stay visible and give their reason (`:11-14`, `:112-146`). The engage act shows "reading the schedule" while that read is in flight (`:429-436`).
  - Acceptance belongs to the client. The studio records substantial completion and issues draws (`:15-17`).
  - A void needs a reason of at least 5 characters and a typed `VOID TS{n}` confirmation (`:148-266`).
  - It records "signed on paper" (`:381-385`).
- **Studio-side figures.** The studio view of the same scope does show client price, deposit and draws (`:389-416`). This is the audience split against the work order.

**Field-side evidence**
- **Desk field rollup.** The Desk has a cross-project field rollup with triage cards for inbound texts, each with a proposed effect and Apply or Dismiss (`field/field-desk.tsx:4-22`).
  - Need-lines cover parties who haven't opted in and overdue field tasks (`:56-88`).
  - Reported hours are behind the flag `field-line-time-reports` (`:119-123`).
  - "Applied by text" lists what Patina changed on its own, with Undo, grouped per text (`:154-186`).
  - The Desk renders nothing when there is no field work (`:19-22`).
- **Room mapping on capture.** A capture stamps only the room id legal for its lane (`CaptureKit/Work/FieldVisitRoomMerge.swift:4-9`, `:16-18`).
  - Spec rooms (`project_rooms`) and scan rooms (`rooms`) are merged by case-insensitive trimmed name (`:45-73`).
  - An entry present in only one list keeps the other id nil, "never guessed" (`:45-46`).
  - A "Whole house" option exists (`:35-36`).
  - With no client rooms, the app says so out loud: "a scan has nothing to attach to" (`:79-83`).
- **Scan setup guard.** The scan setup states are collapsed or expanded, with an instruction tone or a caution tone. It expands and says so when a project isn't ownable or has no scan room (`:90-129`).
- **Capture envelope.** The envelope is `FieldCapturePayload` (`CaptureKit/Sync/FieldCapturePayload.swift:21-59`, schema v4).
  - **Kind and visit:** capture kind is note or context (`:51-53`). A visit has kind site or sourcing and kit walk_through, trade_walk or install (`:167-177`).
  - **Media:** photos carry path, width, height, order and capture mode (`:131-143`). Voice carries segments, a transcript with source and a duration (`:103-129`).
  - **Provenance:** provenance is kept per field (`:36-38`). Confirmations record who confirmed and when (`:39-45`).
  - **Suggestions:** a suggestion is "ALWAYS distinct from the fact"; its confidence is never rendered (`:57`, `:186-193`).
- **Portal note reader.** `readFieldNotePayload` returns body, capture id, `captureVisible`, `hasAudio`, audio paths, photo paths and duration (`lib/document/field-note-payload.ts:15-23`, `:34-52`). The body falls back to the 80-character title (`:8-11`, `:44`).

**Read but not relevant:** `discovery/field-kit.tsx` is the typed form-input kit for discovery blocks (text, number, date, select, chips, add and remove rows). It has nothing to do with Field ops (`:1-8`).

**Not in any file I read**
- **Drawings and renderings:** no source touches either.
- **Scan to work order link:** nothing connects a scan or capture to a work-order section. Work-order sections carry `roomName` and `prose` only (`work-order-sheet.tsx:78-90`).
- **Site-return to work-order link:** nothing connects a site return to a scope.
- **Scope send or share:** there is no send action. The work order only prints.
- **Contractor-facing field note:** `captureVisible` exists (`field-note-payload.ts:46`), but I haven't read what it governs.

## 2. Proposal: one room, one thread (not source parity)

Everything in this section is a design proposal for a fictional prototype. It uses placeholder scans and invented people, with no sends.

Use one room, for example "Primary bath", as the page's spine. The room page keeps one scrolling column with one marginal rail, so there are no portal tabs.

1. **Scan and measure.** A visit chip reads "Walk-through · Primary bath". Show a placeholder scan plate with 2–3 dimension callouts, plus a field note with a photo and voice duration. The caption says "Scan attached to room" or "No client room to attach to".
2. **Drawing and rendering pair.** The drawing and the rendering sit side by side, each with a "what changed from the scan" annotation. These are design-process artifacts the source does not model.
3. **Scope for the room.** A paragraph in the work-order voice, one section per room, addressed to a named trade. It has no price and ends with the payment sentence. The studio-only column beside it shows the client price and journey state (the audience split).
4. **Access and who to call.** Print the way-in sentence, the key holder and the gate controller. The code is shown only as "held off Patina; ask Dana". The studio-only stamp stays.
5. **Instruction.** Show the journey (signed → engaged → in progress → substantially complete) with the gated engage act and its stated reason. Preview the schedule effect in one sentence before engaging.
6. **Site return.** A text-style reply or voice note comes back as a triage card with a proposed effect and Apply or Dismiss. After Apply, it shows as "applied by text" with Undo. The room page updates its own evidence strip.

The thread reads from top to bottom: scan, drawing and rendering, scope, access, instruction, return.

## 3. State and audience distinctions to preserve

- **Verified fact vs suggestion.** Keep a captured fact separate from a machine suggestion. Show confirmed-by only where confirmations exist, and never show confidence (`FieldCapturePayload.swift:57`, `:186-193`).
- **Studio vs trade vs client.**
  - The work order has no money except "per the number agreed" (`work-order-sheet.tsx:8-10`).
  - The scope detail shows client price and draws (`trade-scope-detail.tsx:389-416`).
  - The access card is studio-only (`site-access-card.tsx:12-13`).
  - Phone authority never shows figures (`FieldRosterRules.swift:232`).
- **Scope states.** Keep signed, engaged, in progress and substantially complete as separate states. Engagement comes after authorization and is a different act with a different date (`trade-scope-detail.tsx:7-9`). Acceptance stays the client's act (`:15-17`).
- **Gated acts speak.** A disabled act says why (`:11-14`).
- **Roster bands.** Keep this week, later, bidding and done. Bidders are not on the job, and wordless seats are never silently promoted (`FieldRosterRules.swift:57-62`).
- **Reach and consent.** Reach (Account / Field link / On paper) is a separate word from texting consent (`FieldRosterRules.swift:305-319`).
- **Room lanes.** A spec room and a scan room are different ids. A room matched only by name stays one-sided and is labeled, never guessed (`FieldVisitRoomMerge.swift:45-46`).
- **Access never shows a code.** Show the version, the key holder and who to ask. The code is held off Patina.
- **Applied vs proposed.** A text-applied change and a proposal awaiting Apply look different, and Undo covers all of one text's applies (`field-desk.tsx:154-186`).

## 4. Interactions to mock next

1. **Room spine with scan plate.** Scan, drawing and rendering as three aligned plates, with margin notes tied to scope sentences.
2. **Scan-attach states.** Collapsed "Project · Room", instruction expanded, caution expanded, and "No client rooms… nothing to attach to" (`FieldVisitRoomMerge.swift:90-129`).
3. **Scope as a trade page.** Toggle between "what the trade gets" (no money) and "what the studio sees" (client price and draws) on the same prose.
4. **Gated engage with schedule sentence.** Show the "reading the schedule" state, then the engage act, then the second date stamp.
5. **Way-in card.** Show the lockbox version, key holder, gate controller, a large tel-row, and a typed-code input that gets swapped for the "held off Patina; ask…" sentence.
6. **Site return triage.** An inbound text card with a proposed effect, Apply or Dismiss, then an "Applied by text" line with Undo.

I can draft the room-spine page order and copy next, still inside the fictional prototype. I'd keep the placeholder names, scan values and drawing captions visibly marked as invented.
