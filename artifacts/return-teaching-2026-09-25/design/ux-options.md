# Margin Notes: three directions for return teaching

SQ-260 · 25 September 2026 · UX design. Built on `research/external-patterns.md`, `research/patina-inventory.md` and `research/vision-framing.md`, checked against the live anchors in `apps/designer-portal`. Mockups: `design/mockups/01`–`09`.

**Revision 2 (SQ-266)** answers the SQ-262 review (`design/review.md`), findings 1–3, 9, 11–14, 16–30, 32–39, 43–45, 47–50 and 52. The orchestrator's rulings on those findings are final and appear here and in `system-architecture.md` in identical words where the two docs overlap. Mockups 03, 04, 05, 06 and 09 were revised in copy and captions only; all nine now name Leah Kochaver (finding 49). The layouts are unchanged, so mockups 01, 02, 03 and 07 still draw the Desk note above the roster head, where it now renders below it (finding 13). The captions of 01, 02 and 07 still show revision 1's triggers and success events, and 01 and 07 still show a display date in the label; §D and the definitions below supersede them (findings 14, 19, 27).

## Premise corrections

- **The face is Playfair Display, not Fraunces.** `app/layout.tsx` loads `Playfair_Display` as `--font-heading`; Fraunces appears only in the branded email shell. The mockups set it through one `--font-display` variable (coordinator ruling), a one-line swap.
- **Two things are called "margin notes".** `components/document/margin-note.tsx` is the one-shot teaching primitive ("Appears once · Recedes on use"). `hooks/use-margin-notes.ts` and the `margin_notes` table are the designer's own authored notes on a document (R14). The teaching system is named `teachingNote` in code, and its user-facing name is ruling R-RT1.
- **The Desk already stacks four quiet lines** (`desk-first-touch`, `desk-walkthrough-offer`, `hire-handoff`, `StudioSetupWhisper`) with no cap between them. A teaching note would be the fifth.
- **The live first hour is a modal tour.** The Desk Walkthrough (R97) is a WelcomeModal plus six coachmarks, which guardrail 2 forbids (ruling R-RT2). Teaching notes hold while it runs, through the existing `suppressed` prop.
- **"Draw an invoice · new"** (`desk-contents.tsx:397`) is live copy that marks a release by hand. It appears in every mockup as it ships today, and is logged for retirement once the registry carries its release (finding 50).

## What exists, and what every option adds

**Exists.** `MarginNote` shows once per person. It recedes on × or on a named act (`actionEvents`, `commandBar`), and persists cross-device in `profiles.help_state.marginNotes`. Shipping a new key (`key@2`) re-arms it. It can be held (`suppressed`), and it reports shown, dismissed and acted to telemetry. The first-touch note (`clamp`) caps the body at two lines.

**Shared additions.** Options 1–3 all need these:

1. **A note registry.** Sanity type `teachingNote` (finding 39): key, kind (a–e: `release`, `unused_benefit`, `faster_way`, `owner_capability`, `client_promise`), audience (`owner`, `hand` or `all`; admins count as owners), surface, one sentence of 24 words or fewer, and one act, `{ label, hrefTemplate }`. A `bindings` map fills in live names client-side (project name, person name, invoice number); a note without bindings is generic (finding 18). Each note also names its downstream `successSignal`, and carries a release or a flag (every non-release note needs one or the other). Agents draft into `awaiting_review`; Leah approves (framing ruling 3).
2. **A person record in `teaching_note_state`**, a new own-row table that nobody else can read, never `help_state` (F2): the release cursor, the visit, the caps, `ignoredStreak`, `quiet`, and each note's outcome. The release cursor starts at account creation. On first load it is set to the newest release shipped on or before her `profiles.created_at`, so no one is taught a release that predates her, and designers who existed at launch still get every release after they joined (finding 9).
3. **The margin slot.** From Phase 1, one arbiter picks at most one Desk line per visit from every source: `desk-first-touch`, the walkthrough offer, `hire-handoff`, `StudioSetupWhisper` and the teaching note (finding 17). The order: a person's words (`hire-handoff`), the first-touch note (first hour only), the walkthrough offer, (d) owner, (a) release, (c) faster way, the setup whisper.
4. **An eligibility gate.** The `teaching-notes` flag is on (fail closed), the note's own flag is on, her role matches, she is at rest, and the caps allow. A note is `already_knew`, and never shows, only when its success signal fired **after** the release shipped (release notes) or after the note was published (all others). "Has ever used the feature" is an eligibility input for (b) notes only, never a reason to retire a release or faster-way note (finding 1).
5. **Display limits.** Shown on three visits with no act or × retires a note as ignored (`maxDisplays = 3`, finding 26). Three ignored in a row quiet the system for 30 days.
6. **A label line.** Registry notes print a DM Mono label above the italic sentence. This is a change to the primitive, which today prints its caption below the sentence as a footnote (finding 28); existing notes keep their footnote. A release note's label shows the **release** date (`MARGIN NOTE · 11 SEP`); every other note shows the label with no date (finding 27). The label's word follows ruling R-RT1.

**Definitions.** A *visit* is the first Desk load after 30 minutes away (finding 25). *At rest* is defined per surface (F3): the sheet or dialog that hosts the anchor **is** the surface, so an open DocSheet does not block its own in-place note, but a dialog opened on top of the surface does. *Mid-task* means any of: a dialog is open over the surface, an editor holds dirty state (the hold registry), a composer has focus, or an act is pending. *Caps:* **one unsolicited note per visit across all slots**, and two per rolling seven days, per person. When an in-place note and a Desk note are both eligible, in place is preferred. Act-slot consequence sentences (workflow-changing releases only) are exempt from the ceiling, but each shows once only (finding 24). There is no 24-hour spacing rule.

## §A The three directions

### Option 1 — Margin only

**Thesis.** The Desk is the one place she arrives between tasks, which makes it the one boundary Patina can count on. So the Desk carries all the teaching: one italic line below the roster head, drawn from a reviewed registry, and nothing anywhere else. The cost of Option 1 is also its virtue. A note that doesn't fit one sentence on the Desk never ships.

**Mounts.** `app/(document)/desk/page.tsx`, fed by the arbiter's single slot. The note renders **below the roster head**, never inserted above content after paint. If it cannot resolve before the roster's first paint, it waits for the next visit (finding 13). `layout.tsx` is unchanged.

**Adds beyond the primitive.** The registry, the person record, the arbiter, the caps and the label line. There are no new surfaces and no new routes.

### Option 2 — Margin plus What changed

**Thesis.** Option 1's note, plus a plain record she can pull. "What changed" is a prose page, newest first, filtered to her role and flags. It carries no dot and no count. After 30 or more days away, the Desk's one note becomes a collapsed "Since you were last here" line, with no date and no count (finding 43), disclosing at most three **releases** (finding 37). The page holds the rest. Every note she dismisses stays findable there (orchestrator ruling 5, finding 23).

**Mounts (finding 20, one spec).** The route is `/help/changes` in the Help Center shell (`(document-help)/help`). A ⌘K row in `components/document/command-bar.tsx`'s `allUtilityRows`, beside "The words": `What changed` · *changes to the Document, newest first*. An entry in the help panel. The page is reachable from ⌘K, the help panel and the since-line only. The since-line's link is the one permitted pointer to it; nothing else reminds her the page exists (finding 35).

**Adds beyond Option 1.** The changes page, the ⌘K row, the help-panel entry and the since-line, which is a `MarginNote` with a disclosure. The page has no read or unread state. Opening it marks nothing and moves no cursor. It lists every published note: releases grouped by release, and every other note under "Also", dismissed ones included.

### Option 3 — Margin plus in place

**Thesis.** Option 2, plus notes set in type at the place that changed, shown the first time she finishes a unit of work there. Once she sends an invoice, the note about invoices sits in the Accounts sheet's margin, beside the row she just made, **with the sheet still open**: the sheet hosts the anchor, so it is the surface (F3). This is `FeatureAnnouncementCoachmark` retired into the margin idiom. The Radix popover, the pulse ring and the dialog role go; the per-feature persistence and `shippedAt` age stay.

**Mounts.** Region heads that already exist: the DocSheet body of Accounts and Hours (`overlays/doc-sheet.tsx`), the Galley's studio strip (`rooms/drafting/agreement/galley/studio-strip.tsx`), and the members section of the Account sheet (for owner notes). Each waits for a **tagged boundary mutation**, never for mount, and never for a CustomEvent: only mutations with `meta.teachingBoundary = true` count. The named completion acts that set it are invoice sent, time logged, part saved, invite sent and client page sent (finding 11).

**Adds beyond Option 2.** An `anchor` placement for `MarginNote`; the boundary tag on five mutations; a hold registry that every editor with dirty state joins (finding 12). Faster-way (c) notes fire only on has-used booleans plus a named boundary. For example, the Field note in the Hours sheet shows after an hour is logged, to someone who has logged hours but never from Field. Slow-path counters ("the third time she did it the long way") are Phase 3+ and live in `teaching_note_state` (finding 19). In-place notes are once only, and they share the visit's one-note ceiling rather than being exempt from it (finding 24). Empty-state first-use notes are not part of this option; the existing `emptyState` content type covers them (finding 47).

### Behaviour by moment (all three)

| Moment | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| **1 Ordinary return** | At most one Desk note: a release she hasn't met, an owner note, or a (c) whose boundary happened on her last visit, ranked against the jobs holding her pen. Most visits show nothing. | Same. | Same on the Desk. A (c) with an in-place placement waits at its own surface for its boundary instead. |
| **2 Return after a release** | The release's (a) note takes the slot if its flag is on, her role reaches it, and its success signal hasn't fired since the release shipped. A second release waits for the next visit, within the cap. | Same, and the release is on What changed. | If the release also has an in-place note on a surface she has used, the Desk defers to it, and it meets her there after her next completed act. Otherwise as Option 1. |
| **3 Return after 30+ days** | The single most relevant note; everything else lapses. | One collapsed line, "Since you were last here", with at most three releases ranked against the jobs holding her pen (ruling R-RT3). The rest is on the page. | As Option 2. In-place notes still wait at their surfaces. |
| **4 First week** | Silence, except the existing first-touch note. There are no releases: her cursor starts at account creation. | Same. The page is reachable but never pointed at. | Same. No faster-way notes, because there is no habit yet to shorten. |
| **5 Owner adds a second seat** | One (d) note on the owner's next Desk after the invite is accepted. The hand gets `hire-handoff` if the owner wrote one. Owner and hand never see each other's notes. | Same. The owner-only entry on the page is hidden from the hand. | Same, plus an in-place (d) in the members section after her first invite is sent. |
| **6 Mid-task** | Silence. The slot resolves only on Desk arrival, before the roster paints, with nothing open. | Silence. | Silence. An in-place note renders only after its boundary, with its hosting sheet at rest. A dialog opened over the sheet, a dirty editor or a focused composer holds it. |
| **Nothing to teach** | Nothing: no placeholder, no "all caught up", no space kept. | Nothing. The ⌘K row remains, as every row does. | Nothing. |
| **Dismissal** | × or the act retires the note for good, per person and cross-device. | The same, and every note stays readable on the page, dismissed ones included. | Same. In-place notes use the same record. |
| **Cap** | 1 per visit, 2 per 7 days. | Same. The since-line counts as the visit's note. | Same: one unsolicited note per visit across all slots, in place preferred. Act-slot consequence sentences (workflow-changing releases only) are exempt, once only. |

**No fourth option.** *Pull only* (the page, nothing pushed) is the research's purest position, but nobody opens a changes page for a feature she doesn't know exists, so it fails the release-introduction job. Its discipline survives in Option 2.

## §B Trade-offs

| | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| Interruption cost | Low: one line, at the boundary | Low: the since-line replaces the note | Lowest per note, since each appears after work completes. Total exposure is held to the same one note per visit. |
| Teaching power | Weak. The Desk is far from the task, and memory of an out-of-context hint fades in seconds (NN/g). | Weak on arrival. The page adds depth for the few who pull. | Strong: at the anchor, at the moment, once (patterns 2, 3, 5). |
| Build cost | Small. The primitive and flags exist; add the registry, person record, arbiter and caps. | Small plus one route, one ⌘K row and one help-panel entry. | Medium. Anchor placement, tagged boundaries on five mutations, and the hold registry (one hook and nine components). |
| Authoring cost | One sentence and one act per note | Plus a prose entry per release | Plus an anchor and a named boundary for each in-place note |
| "Won't notice Patina" | Good | Best: the record is pulled, never pushed | Good, *if* completion timing holds. It is worst if the timing slips to mount. |
| Blindness risk | High. Same spot, same shape, every visit, which invites banner blindness. | Same risk for the note. The page has none. | Low. It varies by place, and each note is tied to the act just done. |

## §C Recommendation

**Build Option 3, in the order 1 → 2 → 3, and ship each step on its own.** The problem is "teach her the one thing that shortens the task she is about to do." Only an in-place note stands where that task happens. The Desk line alone teaches at the wrong distance, and Option 1's fixed position is the setup for banner blindness that the research warns about. The staging keeps risk small, and it maps onto the architecture's phases (`system-architecture.md` §8, finding 21):

- **Step 1 = Phase 1 (~8 lane-days).** The registry, the person record, the Desk arbiter and the release note, behind the `teaching-notes` flag (fail closed) and touching no existing write path (finding 22). The arbiter governs all five Desk lines from the start (finding 17).
- **Steps 2 and 3 = Phase 2 (~16 lane-days).** Step 2 adds the record that makes dismissal safe: the changes page, its ⌘K row, the help-panel entry and the since-line. Step 3 adds anchors on three surfaces (Accounts, Hours, the Galley) plus the members section, the tagged boundaries and the hold registry. It ships only (c) notes that fire on has-used booleans plus a named boundary.
- **Phase 3 (~6 lane-days)** holds measurement and slow-path counters. It is deferred until there are enough studios to measure anything (finding 45).

That is about 30 lane-days in all, and about 24 before scale.

**Grafts.** From Option 1: the Desk stays the only place a note may appear on arrival, and in-place notes never borrow its slot. From Option 2: the since-line is the only long-gap device, and What changed has no read state, ever. Refuse: any "catch-up" count, any reminder that the page exists other than the since-line's one link, and any in-place note fired on mount.

## §D Copy samples

Format: DM Mono label, then one Playfair-italic sentence of 24 words or fewer, then one act. Names in the sentence and the act come from bindings. Each note names a **success event**, which is the downstream task outcome, never the note's own act (finding 14), and a **success signal**, which is the same outcome in the database. If the signal fired after the release shipped (or after the note was published), the note is `already_knew` and never shows. Labels carry the release date on release notes and no date otherwise (finding 27). The label word follows R-RT1.

| # | Kind · audience · where | Label | Sentence | Act | Success event (downstream) | Success signal (`already_knew`) |
|---|---|---|---|---|---|---|
| 1 | (a) release · anyone with Accounts · Desk | `MARGIN NOTE · 11 SEP` | Invoices now say what became of the email, delivered, opened or bounced, beside each one you send. | See the {projectName} invoice | An invoice sent, and its delivery row read on a later visit | None: reading a row leaves no DB trace, so this note is never `already_knew` |
| 2 | (a) release · anyone with Accounts · in place, Accounts, after `invoice_sent` | `MARGIN NOTE · 11 SEP` | An invoice now prints as its own letterhead page, for the clients who still pay by check. | Print {invoiceNumber} | A printed invoice later recorded as paid outside Stripe | None confirmed; a print leaves no row |
| 3 | (a) release · in place, the Galley, after `part_saved` | `MARGIN NOTE · 10 SEP` | Each part you write now prints above its fold exactly as your client's copy will read. | Read the whole paper | An agreement sent and signed with no revision after send | An agreement signed after the release with no superseding revision |
| 4 | (c) faster way · Desk, the visit after `time_logged` | `MARGIN NOTE` | Press t outside any sheet or field to log an hour; it lands on the project in hand. | See the keys | A time entry logged from the `t` key | None: the key and the sheet write the same row |
| 5 | (c) faster way · Desk, the visit after `invoice_sent`, has used Hours | `MARGIN NOTE` | The {projectName} hours can come into an invoice as priced lines, so there is nothing to retype. | Draw from time | An invoice sent with lines drawn from time entries | An invoice line drawn from time entries after the note was published |
| 6 | (c) faster way · in place, Hours, after `time_logged`, has never logged from Field | `MARGIN NOTE` | Hours logged in Patina Field on site land on this project before you are back at the desk. | How Field logs hours | A time entry with source `field_visit` within 30 days (finding 32) | A `project_time_entries` row with source `field_visit` after the note was published |
| 7 | (d) owner · second seat · Desk | `MARGIN NOTE` | {personName}'s hours now land on your Hours ledger; she sees only her own, and billing stays with you. | Open {personName}'s seat | An invoice drawn from hours that include a hand's entries | An invoice line drawn from another member's time entries after the note was published |
| 8 | (d) owner · in place, members section, after `invite_sent` | `MARGIN NOTE` | Your next invite can carry a line that reaches the hire on their first Desk, in your own words. | Write the line | A later invite accepted with a `handoff_note` | An `organization_members` row she invited, with a `handoff_note`, after the note was published |

Samples 1 and 2 are the two release introductions. Sample 4 no longer sits in the Hours sheet, where `t` does nothing because a dialog is open (`log-time-shortcut.tsx` L9–10); its sentence now says where `t` works (finding 33). Sample 6 takes its place in mockup 06. Samples 7 and 8 need `onboarding-teammate-persona` on; with the flag off they are never taught. No sample says "new", asks a question, or ends in an exclamation mark.

## §E Accessibility and motion

- **Set type, not a widget.** `<aside role="note">`, as today; the label is plain text, not a heading. No `role="dialog"`, focus trap or `aria-live`, and the note never takes focus on arrival. A screen reader meets it in reading order: below the roster head on the Desk, and after the rows in a sheet's margin.
- **One act and one ×**, each a real `<button>` or `<a>` with the clay-ink focus ring. The live × is about 18 px (`p-0.5` around an `h-3.5` icon, `margin-note.tsx:266–273`), and the mockups draw it at 24×24; both pass WCAG 2.5.8 AA. This design proposes 44 px for the act only (`min-h-11`, as the whisper's act today) (finding 29). The × keeps `aria-label="Dismiss note"`. The since-line's disclosure is `<button aria-expanded aria-controls>`.
- **Face (finding 30).** The sentence is Playfair italic, as the live primitive sets it. Framing guardrail 9 ("Inter body, Playfair only for a release headline") is corrected to match.
- **Contrast.** Sentence in `--text-body` (mocha), label in `--text-faint`, act in clay-ink: each clears 4.5:1 on paper. Nothing relies on colour alone.
- **Motion.** One 240ms opacity fade on reveal, inside `@media (prefers-reduced-motion: no-preference)`; otherwise it simply appears. No slide, pulse or ring. Dismissal is instant.
- **Reflow.** 34ch measure, wrapping at 390px without clamping (`clamp` stays reserved for the first-touch note; SC 1.4.10, finding 48).
- **Quiet switch.** "Quiet the notes" in the Account sheet silences every slot, act notes included (finding 16); ⌘K and What changed stay reachable.

## Rulings for Kody

- **R-RT1 User-facing name.** Workshop Notes is the evidence-backed default: the designer's own notes are announced as "Margin note actions" (`margin-rail.tsx:748`), and Option 3 sets Patina's notes in the margin she writes in. The alternates are Margin Notes, or no visible name at all (the label carries only a release date), which serves "the studio won't notice Patina" best.
- **R-RT2 The Desk Walkthrough.** Its WelcomeModal and six coachmarks contradict guardrail 2. Retire it, or keep it as the one sanctioned exception. Either way it joins the Desk arbiter, and teaching notes hold while it runs (the existing `suppressed` prop).
- **R-RT3 Since-line relevance input.** Rank the since-line's releases against the jobs holding her pen (`useReturnNote({ pinnedProjectIds })`, as mockup 03 draws), or show the line in the margin of the first document she opens.
- **R-RT4 Owner letter** (framing ruling 2). Whether an owner (d) note may be followed by a letter, drafted by an agent into `awaiting_review` and sent only after Leah approves.
- **R-RT5 Dormant studios** (framing ruling 5). Whether Leah keeps a staff-run, studio-level list of studios dormant 90+ days. Nothing in the product detects dormancy, and nothing here builds it.
- **R-RT6 SQ-265.** Fix the `help_state` clobber (web adapter, iOS adapter, e2e helper) before Phase 1 or alongside it. Teaching state no longer depends on it; tours and margin notes do.

**Decided from evidence (not rulings):** admins count as owners (HT-10: the 00606 header has "owner/admin" read the studio's hours); there is no holdout at this scale (about 24 prod profiles, and cells under 5 are suppressed); the Sanity draft-only token mechanism is an engineering choice made at build.
