# Margin Notes: three directions for return teaching

SQ-260 · 25 September 2026 · UX design. Built on `research/external-patterns.md`, `research/patina-inventory.md` and `research/vision-framing.md`, checked against the live anchors in `apps/designer-portal`. Mockups: `design/mockups/01`–`09`.

## Premise corrections

- **The face is Playfair Display, not Fraunces.** `app/layout.tsx` loads `Playfair_Display` as `--font-heading`; Fraunces appears only in the branded email shell. The mockups set it through one `--font-display` variable (coordinator ruling), a one-line swap.
- **Two things are called "margin notes".** `components/document/margin-note.tsx` is the one-shot teaching primitive ("Appears once · Recedes on use"). `hooks/use-margin-notes.ts` and the `margin_notes` table are the designer's own authored notes on a document (R14). See ruling R-1.
- **The Desk already stacks four quiet lines** (`desk-first-touch`, `desk-walkthrough-offer`, `hire-handoff`, `StudioSetupWhisper`) with no cap between them.
- **The live first hour is a modal tour.** The Desk Walkthrough (R97) is a WelcomeModal plus six coachmarks, which guardrail 2 forbids (ruling R-2). Margin Notes hold while it runs, through the existing `suppressed` prop.

## What exists, and what every option adds

**Exists.** `MarginNote` shows once per person. It recedes on × or on a named act (`actionEvents`, `commandBar`), and persists cross-device in `profiles.help_state.marginNotes`. Shipping a new key (`key@2`) re-arms it. It can be held (`suppressed`), and it reports shown, dismissed and acted to telemetry. The first-touch note (`clamp`) caps the body at two lines.

**Shared additions.** Options 1–3 all need these:

1. **A note registry.** Sanity type `marginNote`: key, kind (a, c or d), one sentence of 24 words or fewer, one act, `successEvent`, release date and flag where relevant, audience (`owner` or `any`), surface. Agents draft into `awaiting_review`; Leah approves (framing ruling 3).
2. **A person cursor in `help_state`**: `lastVisitAt`, `releaseCursorAt`, `lastUnsolicitedAt`, `ignoredStreak`, `quiet`. The release cursor starts at account creation, so no one is introduced to a release that predates her.
3. **The margin slot.** One arbiter picks at most one Desk note per visit from old and new sources, in this order: a person's words (`hire-handoff`), the walkthrough offer, (d) owner, (a) release, (c) faster way, the setup whisper.
4. **An eligibility gate.** Flag on (fail closed), role matches, success event not yet fired (`already_knew` retires silently), not mid-task, caps allow.
5. **Display limits.** Shown on three visits with no act or × retires a note as ignored. Three ignored in a row quiet the system for 30 days.
6. **A label line.** Registry notes print a DM Mono label (`MARGIN NOTE · 25 SEP`) above the italic sentence; existing notes keep their footnote.

**Definitions.** A *visit* is the first Desk load after 30 minutes away. *Mid-task* means any of: a DocSheet or overlay is open, a form is dirty, a composer has focus, or a `DocumentAction` is loading. *Caps:* at most one unsolicited note per visit and two per rolling seven days, per person.

## §A The three directions

### Option 1 — Margin only

**Thesis.** The Desk is the one place she arrives between tasks, which makes it the one boundary Patina can count on. So the Desk carries all the teaching: one italic line above the roster, drawn from a reviewed registry, and nothing anywhere else. The cost of Option 1 is also its virtue. A note that doesn't fit one sentence on the Desk never ships.

**Mounts.** `app/(document)/desk/page.tsx`, the existing `MarginNote` position after `<header>` and before `rosterBlock`, fed by the slot. `layout.tsx` is unchanged: `HelpStateProvider` already installs the backend.

**Adds beyond the primitive.** The registry, cursor, slot, caps and label line. There are no new surfaces and no new routes.

### Option 2 — Margin plus What changed

**Thesis.** Option 1's note, plus a plain record she can pull. "What changed" is a prose page, newest first, filtered to her role and flags. It is reachable only from a ⌘K row and carries no dot and no count. After 30 or more days away, the Desk's one note becomes a collapsed "Since you were last here" line with at most three items, and the page holds the rest. Every note she dismisses stays findable there (orchestrator ruling 5).

**Mounts.** The Desk slot; `components/document/command-bar.tsx`, a row in `allUtilityRows` beside "The words" (`What changed` · *changes to the Document, newest first*); and a `/help/changes` route in the Help Center shell.

**Adds beyond Option 1.** The changes page, the ⌘K row and the since-line, which is a `MarginNote` with a disclosure. The page has no read or unread state. Opening it moves nothing and marks nothing.

### Option 3 — Margin plus in place

**Thesis.** Option 2, plus notes set in type at the place that changed, shown the first time she finishes a unit of work there. Once she sends an invoice, the note about invoices sits in that sheet's margin, beside the row she just made. A faster-way note appears where the slow path runs, after her third slow repetition. This is `FeatureAnnouncementCoachmark` reworked into the margin idiom. The Radix popover, the pulse ring and the dialog role go; the per-feature persistence and `shippedAt` age stay.

**Mounts.** Region heads that already exist: the DocSheet body of Accounts and Hours (`overlays/doc-sheet.tsx`), the Galley's studio strip (`rooms/drafting/agreement/galley/studio-strip.tsx`), and the Invoice folio. Each listens for a completion event (`document:invoice-sent`, `document:time-logged`, `document:part-saved`), never for mount.

**Adds beyond Option 2.** An `anchor` placement for `MarginNote`; completion events on three surfaces; and slow-path counters in `help_state`. Each (c) note carries its own signature, for example "time logged via the Hours sheet, three times in 14 days". In-place notes are once only and exempt from the visit cap, but at most one shows per surface per visit.

### Behaviour by moment (all three)

| Moment | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| **1 Ordinary return** | At most one Desk note: a release she hasn't met, an owner note, or a (c) tied to the slow path she took last session on a job now holding her pen. Most visits show nothing. | Same. | Same on the Desk. A (c) also waits at its own surface for the third slow repetition. |
| **2 Return after a release** | The release's (a) note takes the slot if its flag is on, her role reaches it, and its success event hasn't fired. A second release waits for the next visit, within the cap. | Same, and the release is on What changed. | The Desk note is skipped when the change is to a surface she uses weekly. The in-place note meets her there instead, after her next completed act. |
| **3 Return after 30+ days** | The single most relevant note; everything else lapses. | One collapsed line, "Since you were last here", with at most three items ranked against the jobs holding her pen. The rest is on the page. | As Option 2. In-place notes still wait at their surfaces. |
| **4 First week** | Silence, except the existing first-touch note. There are no releases: her cursor starts at signup. | Same. The page is reachable but never pointed at. | Same, plus first-use notes at a region's empty state (V9 P5). No faster-way notes, because there is no habit yet to shorten. |
| **5 Owner adds a second seat** | One (d) note on the owner's next Desk after the invite is accepted. The hand gets `hire-handoff` if the owner wrote one. Owner and hand never see each other's notes. | Same. The owner-only entry on the page is hidden from the hand. | Same, plus an in-place (d) at the invite act the first time she invites. |
| **6 Mid-task** | Silence. The slot resolves only on Desk arrival with nothing open. | Silence. | Silence. An in-place note renders only after the completion event and with the region at rest. If a sheet opens, it holds. |
| **Nothing to teach** | Nothing: no placeholder, no "all caught up", no space kept. | Nothing. The ⌘K row remains, as every row does. | Nothing. |
| **Dismissal** | × or the act retires the note for good, per person and cross-device. | The same, and it stays readable on the page. | Same. In-place notes use the same key store. |
| **Cap** | 1 per visit, 2 per 7 days. | Same. The since-line counts as the visit's note. | Same. In-place notes are exempt but once only, one per surface per visit. |

**No fourth option.** *Pull only* (the page, nothing pushed) is the research's purest position, but nobody opens a changes page for a feature she doesn't know exists, so it fails the release-introduction job. Its discipline survives in Option 2.

## §B Trade-offs

| | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| Interruption cost | Low: one line, at the boundary | Low: the since-line replaces the note | Lowest per note, since each appears after work completes. Total exposure is highest. |
| Teaching power | Weak. The Desk is far from the task, and memory of an out-of-context hint fades in seconds (NN/g). | Weak on arrival. The page adds depth for the few who pull. | Strong: at the anchor, at the moment, once (patterns 2, 3, 5). |
| Build cost | Small. The primitive, store and flags exist; add the registry, cursor, slot and caps. | Small plus one route and one ⌘K row. | Medium. Anchor placement, completion events on three surfaces, and slow-path counters. |
| Authoring cost | One sentence and one act per note | Plus a prose entry per release | Plus an anchor and a slow-path signature for each (c) |
| "Won't notice Patina" | Good | Best: the record is pulled, never pushed | Good, *if* completion timing holds. It is worst if the timing slips to mount. |
| Blindness risk | High. Same spot, same shape, every visit, which invites banner blindness. | Same risk for the note. The page has none. | Low. It varies by place, and each note is tied to the act just done. |

## §C Recommendation

**Build Option 3, in the order 1 → 2 → 3, and ship each step on its own.** The problem is "teach her the one thing that shortens the task she is about to do." Only an in-place note stands where that task happens. The Desk line alone teaches at the wrong distance, and Option 1's fixed position is the setup for banner blindness that the research warns about. The staging keeps risk small. Step 1 lands the registry, cursor, slot and caps, which every option needs, and tames the Desk's four ungoverned lines. Step 2 adds the record that makes dismissal safe. Step 3 adds anchors on three surfaces only (Accounts, Hours, the Galley) and ships only (c) notes whose slow path is already an instrumented event.

**Grafts.** From Option 1: the Desk stays the only place a note may appear on arrival, and in-place notes never borrow its slot. From Option 2: the since-line is the only long-gap device, and What changed has no read state, ever. Refuse: any "catch-up" count, any reminder that the page exists, and any in-place note fired on mount.

## §D Copy samples

Format: DM Mono label, then one Playfair-italic sentence of 24 words or fewer, then one act. Each names its success event; if that event fired before display, the note never shows.

| # | Kind · audience | Label | Sentence | Act | Success event |
|---|---|---|---|---|---|
| 1 | (a) release · anyone with Accounts | `MARGIN NOTE · 11 SEP` | Invoices now say what became of the email, delivered, opened or bounced, beside each one you send. | See the Sonnenberg invoice | invoice folio opened with a delivery row |
| 2 | (a) release · anyone with Accounts | `MARGIN NOTE · 11 SEP` | An invoice now prints as its own letterhead page, for the clients who still pay by check. | Print INV-0014 | `/invoices/[id]/print` opened |
| 3 | (a) release · in place, the Galley | `MARGIN NOTE · 10 SEP` | Each part you write now prints above its fold exactly as your client's copy will read. | Read the whole paper | whole-paper sheet opened |
| 4 | (c) faster way · in place, Hours | `MARGIN NOTE · 25 SEP` | Press t anywhere in the Document to log an hour; it lands on the project in hand. | See the keys | log-time opened from the `t` key |
| 5 | (c) faster way · Desk, task-tied | `MARGIN NOTE · 25 SEP` | The Sonnenberg hours can come into an invoice as priced lines, so there is nothing to retype. | Draw from time | invoice composer opened with the time source |
| 6 | (c) faster way · Hours, Field installed | `MARGIN NOTE · 25 SEP` | Hours logged in Field on site land on this project before you are back at the desk. | Open Field | first time entry with source `field` |
| 7 | (d) owner · second seat | `MARGIN NOTE · 25 SEP` | Tess's hours now land on your Hours ledger; she sees only her own, and billing stays with you. | Open Tess's seat | studio page, members section opened |
| 8 | (d) owner · at the invite | `MARGIN NOTE · 25 SEP` | A line on the invite reaches your next hire on their first Desk, in your own words. | Invite with a note | invite sent with `handoff_note` |

Samples 1 and 2 are the two release introductions. Sample 8 needs `onboarding-teammate-persona` on; with the flag off it is never taught. No sample says "new", asks a question, or ends in an exclamation mark.

## §E Accessibility and motion

- **Set type, not a widget.** `<aside role="note">`, as today; the label is plain text, not a heading. No `role="dialog"`, focus trap or `aria-live`, and the note never takes focus on arrival. A screen reader meets it in reading order, above the roster.
- **One act and one ×**, each a real `<button>` or `<a>` with a 44px target (`min-h-11`, as the whisper's act today) and the clay-ink focus ring. The × keeps `aria-label="Dismiss note"`. The since-line's disclosure is `<button aria-expanded aria-controls>`.
- **Contrast.** Sentence in `--text-body` (mocha), label in `--text-faint`, act in clay-ink: each clears 4.5:1 on paper. Nothing relies on colour alone.
- **Motion.** One 240ms opacity fade on reveal, inside `@media (prefers-reduced-motion: no-preference)`; otherwise it simply appears. No slide, pulse or ring. Dismissal is instant.
- **Reflow.** 34ch measure, wrapping at 390px without clamping (`clamp` stays reserved for the first-touch note; SC 2.4.11).
- **Quiet switch.** "Quiet the notes" in the Account sheet silences every unsolicited note; ⌘K and What changed stay reachable.

## Open rulings

- **R-1 Name collision.** Keep "Margin Notes" and live with two meanings, or take the framing's runner-up, **Workshop Notes**, for the teaching system. The designer's own `margin_notes` keep their name either way. *Recommend Workshop Notes if a designer will ever see the word; Margin Notes if it stays a DM Mono label only.*
- **R-2 The Desk Walkthrough.** Its modal and coachmark tour contradict guardrail 2. Retire it in favour of first-use empty-state lines, or keep it as the one sanctioned exception. Not resolved here.
- **R-3 Since-line relevance.** On the Desk "the project she opens" is not yet known. These mockups rank the three items against the jobs holding her pen. The alternative is to show the line in the margin of the first document she opens.
- **R-4 Ignore threshold.** Three visits without an act or × retires a note. This is new; the primitive today shows until touched.
