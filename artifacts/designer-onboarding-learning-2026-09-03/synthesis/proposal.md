# The designer portal, learned — synthesis

*Prepared by the synthesis lead, 2026-09-03, from three persona proposals (documentation writer, customer-success lead, software-training expert), their adversarial critiques, the briefing pack, and `docs/vision/VISION.md`. The learner is a growing studio's owner and her first hire — Leah's studio is the reference (VISION §2). Every path cited exists in the tree or is marked NEW.*

## 1. Summary

Nothing about how the designer portal looks changes. What changes is that the two doors a designer already reaches for — the contextual help panel behind ⌘K's "Help…" row, and the Help Center at `/help` — start answering instead of opening onto silence, and a new hire gets a version of the one existing tour that is actually about her, instead of a copy of the owner's. The panel gets a real introduction on the Desk and inside the Document, the two screens where it currently says nothing. A short, generated glossary answers the words nobody defined — margin, sheet, room, folio. A single reference page teaches the keyboard, including thirteen-plus Board Room bindings nobody has ever been told exist. The Studio Setup Checklist starts tracking whether a hire actually arrived, not just whether she was invited. And the tour's last stop, for the first time, does something instead of describing something — it opens the "Capture a lead" sheet before it closes, so the first thing a new owner learns is finished by doing it. Almost everything here extends a component or field that already exists: `registry.tsx`'s `help.blurb`, `MarginNote`, the checklist, the tour's `persona` prop, the ⌘K Studio group. Nothing here is a dashboard, a badge, a percentage, or a nag — every new teaching object appears once and recedes, or is a permanent reference a designer can ignore forever at no cost. The studio still won't notice Patina; it will just, for the first time, be able to ask it a question and get an answer.

## 2. Diagnosis

**(1) The two most-visited screens teach nothing, and it is the same bug twice.** ⌘K → "Help…" on `/desk` renders *"No articles for this surface yet"* (`screens/08-help-panel.png`), and the same doorway inside `/doc/[id]` is no better — not because it mis-frames the Document as the Spec Book (the documentation-writer proposal's stable-sort story, corrected below), but because it too resolves to nothing. `document-help.tsx`'s `introBlurb` computation (`document-help.tsx:129–146`) filters candidates from `ALL_STUDIO_SURFACES` and excludes `kind === 'verb'`. The Desk's key is owned only by the five Verbs — filtered out, zero candidates, `null`. The Document's key is owned only by `SPEC_BOOK_SURFACE` and `BOARDS_SURFACE`, both declared standalone and explicitly excluded from `ALL_STUDIO_SURFACES` — the very array `document-help.tsx` reads. Neither ever reaches the matching code; both are empty for the identical structural reason (`critique-documentation-writer.md` FC1, confirmed against `registry.tsx:340–419`). One fix covers both: a non-verb, non-doorway owner for each key, following the standalone-surface pattern the registry already uses for the Spec Book and Boards.

**(2) The owner/first-hire handoff has no state and no distinct voice.** The Studio Setup Checklist's "Invite your crew" row fills when an invite is *sent* (`memberCountBeyondSelf > 0`), never when accepted — the exact moment VISION §2 names as the trigger defining the customer has no reading anywhere. `desk-walkthrough.tsx` passes `persona="designer"` at both call sites; a hire who just accepted gets the identical six coachmarks written for an owner, over sixteen jobs that aren't hers, with no statement of what her seat permits (customer-success-lead.md §1).

**(3) The reference layer is a well-built shelf with almost nothing on it.** Roughly 142 of ~150 Sanity documents are still literal `PLACEHOLDER — pending Leah review` stubs (`09-help-guidance.md`); `isPlaceholderContent` correctly hides them, and the Featured section CSS-hides itself when empty, making a starved Help Center look deliberate. No glossary exists, though "Ideas & vocabulary" already promises one.

**(4) Shortcuts teach themselves only to people already inside the mechanism they replace.** The seven `g`-chords surface only as trailing chips inside ⌘K's own rows — you must already be in the palette to learn its alternative. The six `⌘/Ctrl+Enter` save sites carry no visible hint. The Board Room canvas carries thirteen-plus design-tool bindings — undo, redo, clipboard, z-order, lock, tidy, zoom, present — with zero legend anywhere (briefing 04).

**(5) The two teaching layers disagree about permanence, and disagree backwards.** Tour state lives cross-device in `profiles.help_state` (migration `00146`); margin notes live device-local in `localStorage`. The deliberate one-time tour is durable; the quiet fallback note repeats across devices — backwards for a system whose whole philosophy is "appears once" (customer-success-lead.md §1).

**(6) The instrument the customer-success case leans on hardest does not exist.** `zone_flight` — the event the 2026-07 discoverability review credits with recording every one of Leah's flights to the legacy portal, "unread" — is not emitted anywhere in `apps/designer-portal/src` today (ruling R-b; the string exists only in the review's own HTML and `DECISIONS.md`'s narrative). Any stuck-signal design leaning on it proposes new instrumentation, not an existing ledger (`critique-customer-success-lead.md` F4).

**(7) The one structured teaching moment teaches nouns, never an act.** The tour's six bodies read as a place, a shape, two categories, a strip, a key, and an act described but never performed (software-training-expert.md §1). The curve is a spike, then flat: no second exposure, no practice, no way to tell recognition from competence.

## 3. Principles

1. **Teach at the moment of the work, never in advance of it.** VISION §4: *"It prompts and collects information when and where you need it, then gets out of the way."* (software-training-expert.md §2.1)
2. **Recognition over recall — the permanent surfaces teach the other 999 times.** R93/R94: Leah did not fail on the tour; she fled to the legacy portal on day forty, long after any first-run moment had faded (briefing 03 §12; all three proposals converge here).
3. **One definition, one place.** `registry.tsx`'s `help.blurb` is the single content source for any room, ledger, or verb; nothing hand-authors a second copy (`registry.tsx` canon note; both docs-writer and customer-success principle 4).
4. **Nothing recurs without an explicit, tight gate.** Model every nudge on `StudioSetupWhisper`: owner-only or live-state-derived, one Playfair line, no counter, no badge (R94; D8; all three).
5. **Reference is not engagement — a shorter, resolving visit is the win.** No learning surface is judged by how often it opens; a rising `help.help_center.viewed` after a fix means the panel is still failing (VISION §6; documentation-writer.md §8).
6. **Extend ratified idioms; invent nothing.** Two registers only — Playfair-italic teaching prose, DM Mono structure. Zero shadows (D4), no badges outside the Strata Mark (D8/R15). The Arc post-mortem is cited in Patina's own canon as "a caution, not a template" (`05-constraints.md` §4, §8).
7. **Her own paper, never a fake one.** D1 plus the R4 timer forbid any teaching step from entering `/doc/[id]` — it would lie about time or corrupt data. The answer is marginalia inside her real first document, and a tour's final act may open a Verb sheet *over* the Desk, never route into one (`05-constraints.md` §5; software-training-expert.md §3).
8. **The first hire is a distinct learner, not a smaller owner.** VISION §2 names her arrival — "the moment it adds its first hands" — as the trigger defining the customer, not a footnote to the owner's onboarding (customer-success-lead.md §1; software-training-expert.md principle 8).
9. **A human closes a stuck studio; the product does not chase.** VISION §2's "1:1 through Leah's network" licenses escalating to a conversation where the product must stay quiet — but this is a proposal's own interpretive extension, not settled canon (customer-success-lead.md principle 5; `critique-customer-success-lead.md` F10; §12 item 11).

Feature test (VISION §8): **surface** — The Document, ranked first (§1); **moment** — the exact trigger §2 names; **stream** — neither directly, but the program gates activation into both; **promise** — "you won't notice Patina," why nothing here recurs without principle 4's gate.

## 4. The experience, layered

Layered against the package's own four-tier taxonomy (`packages/help-system/src/analytics.ts`: Ambient / Reactive / Proactive / Reference) — the honest inventory of what exists, and the smallest set of changes that closes the gaps found in §2.

### Ambient — empty states, margin notes, field helpers

**What exists.** `GuidedEmptyState` at six confirmed sites with strong, specific copy (`project-mood-boards.tsx`, `work-block.tsx`, `ffe-section.tsx`, `plans/plan-room-set.tsx`, `roster/project-team-roster.tsx`, `commercial/authorizations-ledger.tsx`). The `desk-first-touch` margin note — *"This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'."* / `Appears once · Recedes on use` — is the best-written teaching object in the product, called out by all three proposals. `StudioSetupWhisper` is the correctly-gated recurring exception: owner-only, `openCount ≥ 2`, one line, no chrome.

**What changes.** The Library's raw-capture shelf ("Nothing captured yet. Bring something in — it lands here, raw") gets copy that says how: *"Nothing captured yet. Bring a piece in from a vendor's page with Capture, or drop a photo here — it lands raw, and you tidy it later."* A new key, `doc-first-touch`, renders once in the first real document a designer opens (the margin column already headed `IN THE MARGIN`, `screens/09-document.png`): *"— One client, one paper. The rail on the left says where this stands; the margin here is where decisions, messages, and money gather. Nothing is a form — it fills as the work happens."* / `Appears once · Recedes on use`. Margin-note "seen" state moves from `localStorage` into `profiles.help_state`, on the sweep `HelpStateProvider` already runs for tours — "appears once" then means once per person, not per browser (§2 finding 5). The checklist's "Invite your crew" row re-derives on **acceptance**, not send, and one new row is added: *"Your first hire opened a document"* — stating the moment VISION §2 defines.

### Reactive — tooltips, the contextual panel, "what is this?"

**What exists.** `document-help.tsx`'s contextual panel, opened by ⌘K's "Help…" row or a sheet-head `?` glyph (`HelpGlyph`, `overlays/doc-sheet.tsx`) — architecturally sound, already wired to render a registry blurb as its intro line wherever one resolves.

**What changes.** Fix R-a: give `designer-portal/document/desk` and `designer-portal/document/doc` each a non-verb, non-doorway owner, in the same standalone-declaration pattern `registry.tsx` already uses for `SPEC_BOOK_SURFACE`/`BOARDS_SURFACE` — a `help.blurb` without a new Drawer or ⌘K doorway. Sample copy: Desk — *"Every live job, one line each — the quiet ones are in motion."* Document — *"One client, one paper — Brief through Care. The rail says where it stands."* Extend `HelpGlyph` (already on every sheet head) to the Drafting Room header and the document's own front matter. Add a **Keys** block to the panel's footer, printed from the registry's own `shortcut` field for whatever surface is in hand — the Orders panel prints `G O`; the Board Room prints its editing set.

### Proactive — welcome, walkthrough, coachmarks, checklist, drip

**What exists.** The WelcomeModal + six-coachmark Desk Walkthrough (`desk-walkthrough.tsx`), desktop-only, `persona="designer"` hardcoded, never auto-offering again once completed or abandoned. The Studio Setup Checklist and its whisper. The seventeen-email "First Six Weeks" drip with ten Post notes.

**What changes.** Step 1's coachmark anchors correctly instead of rendering top-left over the greeting (`screens/03-walkthrough-step-1.png`). A third modal action, *"Show me later,"* writes `{ atStep: 0 }` without `abandoned: true`, so a stray Esc falls through to `desk-walkthrough-offer` instead of permanently closing the door (§12, item 2). The tour's last stop stops describing and starts doing: *"Begin with a lead"* closes the tour and opens `CaptureLeadSheet` **over** the Desk — never routing into `/doc/[id]`, so the R4 timer only starts once she submits a real lead she chose, staying inside D1. This needs its own ruling (§12; see §11.2). The drip retimes from calendar to condition: E2–E9 fire only when the studio has not yet done the thing the email teaches, at most weekly, on the pattern M1–M4 already use.

The first hire gets a distinct persona rather than a copy of the owner's tour — §12 item 9 covers what building this actually costs.

### Reference — Help Center shelves, glossary, cheat sheet, videos

**What exists.** `/help`, three sections in fixed order: a pinned walkthrough row, a Featured section (CSS-hidden when empty), and the eight `HELP_TOPICS` shelves — well-labeled, almost entirely unwritten.

**What changes.** Wave 1 of a content plan (§8) targets the ~20 articles that make the contextual panel and the Help Center's front page resolve to something on first sign-in. A short glossary is authored under "Ideas & vocabulary" (§6), reading the registry's `help.blurb` verbatim wherever a term is a registry surface. One new article, *"The keys,"* teaches every shortcut on a single reference page (§7), resolving the overlay-vs-article disagreement in favor of the article (§11.1). The Featured section stops silently hiding when empty, falling back to the topic grid instead. Video drops from ten spec'd walkthroughs to two or three, gated on the still-open hosting decision (§12, item 14).

## 5. The experience by moment

| Moment | User goal | What Patina does | Surface / component | Copy sample | Signal watched |
|---|---|---|---|---|---|
| **Minute 1** (owner) | Find out in two minutes whether this holds her real work | WelcomeModal + tour, unchanged length and voice, ends in a real act | `WelcomeModal`, `TourController`, `CaptureLeadSheet` | *"This is your Desk… Six stops, about a minute."* → step 6 CTA opens the lead sheet | `help.tour.completed`; a lead created same session |
| **Minute 1** (owner, declines) | Get straight to work, no commitment | `desk-first-touch` note, unchanged; new "Show me later" branch | `MarginNote`, tour gate (small change) | *"This is your Desk… ⌘K finds anything by name — try 'invoice'."* | `document_margin_note {key, action}` |
| **Day 1** (owner) | Put one real client on paper | `doc-first-touch` note in the real document's margin; panel now answers | `MarginNote` (NEW key), `document-help.tsx` (R-a fix) | *"One client, one paper. The rail on the left says where this stands…"* | `document_help_opened` resolving to a blurb |
| **Day 1** (owner, inviting) | Bring her first hand in | Checklist row derives on acceptance, not send | `studio-setup-checklist.tsx` (changed derivation) | *"Invite your crew"* fills only once `accept_workspace_invitation` succeeds | `teammate_invited` → `invitation_accepted` |
| **Week 1** (owner) | Send the first proposal, draw the first invoice | Ambient only — panel, `?` glyph, ⌘K groups, registry chips | Existing surfaces, unchanged | *(none — week one's point is that nothing new appears)* | `document_command_bar_zero_result`, falling |
| **First hire's first day** | Work out what's hers, without breaking anything | A persona-correct WelcomeModal + tour; accept-invite screen states the studio's name | `WelcomeModal`/`TourController` (§12 item 9), accept-invite screen | *"You're in — {studio name}. From here, her desk and yours are the same desk."* | `invitation_accepted` → first document opened, same session |
| **First hire's first day** | Know what to do first, in the owner's words | One optional handoff line, carried on the invite, rendered once as a margin note | `StudioInviteModal` (NEW field), `MarginNote` (NEW key) | *"— From Leah: start with the Olsen lake house — the brief's written, it just needs the schedule built."* | `document_margin_note {key: 'hire-handoff', action: 'acted'}` |
| **Ongoing** (both) | Not think about Patina | Nothing recurring ships. Permanent reference only: panel, glossary, "The keys," Contents block | Existing surfaces + one new article | *(none — reference costs nothing unused)* | `help.article.opened`, trending toward zero repeat views per person |

## 6. Navigation & vocabulary

The Desk → Document → Rooms / Sheets / Verbs model is taught twice already, in recognition not recall: the tour's step 3 names the room/sheet physics once, and the Desk's Contents block (R95) restates it permanently. Untaught is the **vocabulary** — the nouns a hire will click through rather than ask about. Fix: a short, generated glossary under the existing "Ideas & vocabulary" shelf (`help-topics.ts`, `HELP_TOPICS[5]`, already described as *"The words Patina uses on purpose"*) — no new route or component. The discipline: wherever a term is a registry surface, its first line is `registry.tsx`'s `help.blurb`, rendered, never retyped — closing R94's own risk that "notes written once… slowly describe an interface that has moved on."

**Eight entries, finished:**

> **The Desk** — *Every live job, one line each; the quiet ones are in motion.* Where: `/desk`, the only landing page after sign-in. Related: Document, Room, Sheet.

> **Room** — *A place you walk into. Picking one up puts down the document you were holding.* Where: Library, People, The Scans, and the Drafting Room once a proposal exists. Related: Sheet, Put down.

> **Sheet** (also called a ledger) — *A book that slides over the document in your hand without disturbing it.* Where: Orders, Accounts, Hours, The Post — Esc puts it back. Related: Room, The Post.

> **The margin** — *The document's right edge, where decisions, messages, money, time, and notes gather beside the work they belong to.* Where: the right column of any open document, headed `IN THE MARGIN`. Related: In hand, Put down.

> **In hand** — *The one document currently open; time logs itself against it while you hold it.* Where: the drawer's `HANDS FREE` control, next to Find anything. Related: Put down, Hands free.

> **Put down** — *Closing the document you're holding and going back to the Desk. It is the only way out of one, and it stops the clock.* Where: `← PUT DOWN`, top of the document's spine. Related: Room, In hand.

> **The Post** — *Letters and the record — what arrived, what needs review.* Where: the bell at the right of the drawer, `G` then `T`. Related: Sheet, The margin.

> **Hands free** — *Time logging itself while a document is in hand — no timer to start, no timesheet to reconcile.* Where: the drawer, right of Find anything; lands in the Hours sheet. Related: In hand, The Post.

Reached three ways: the Help Center shelf; the contextual panel's footer (a second link beside `Browse all help →`); and one new ⌘K row, **"The words" · what Patina calls things**.

## 7. Keyboard shortcuts

The real inventory, per `briefing/04-shortcuts-inventory.md`:

- **⌘K / Ctrl K** — find anything; `↑`/`↓` move; `Enter` chooses; `Esc` closes (twice if the Engine "ask" is active).
- **Seven `g`-chords** (`registry-shortcuts.tsx`, `CHORD_WINDOW_MS = 1200`): `g l` Library · `g p` People · `g r` The Scans · `g o` Orders · `g a` Accounts · `g h` Hours · `g t` The Post.
- **Six silent `⌘/Ctrl+Enter` save sites**: margin-note composer (desktop + mobile), thread-note composer, board item note, board note textarea, board direction panel — none carries a visible hint.
- **The Board Room canvas**, thirteen-plus bindings, zero legend anywhere: `Escape` (two-press exit), `p` present, `⌘Z`/`⌘⇧Z`/`Ctrl Y` undo/redo, `⌘D` duplicate, `⌘C`/`⌘X`/`⌘V` copy/cut/paste, `⌘L` lock, `⌘]`/`⌘[` (+ Shift for front/back), `Delete`/`Backspace`, `⇧T` tidy, `1` fit to view, `⌘0` reset zoom, `⌘+`/`⌘−` zoom.
- **Tour navigation**: `Enter` advances/completes, `Esc` skips — bound at `document` level, disabled while ⌘K is open.
- **⌘⇧F (Tester Notes)** — internal, flag-gated; excluded from any customer-facing sheet while that remains true.

**Design: a three-rung ladder, resolving the overlay-versus-article disagreement (§11.1) in favor of a single Help Center article.**

1. **The chips stay.** `G L`, `G P` inside ⌘K rows remain the recognition layer for someone already in the palette — no change.
2. **One permanent reference page, "The keys,"** authored under the Getting Started shelf, reachable three ways: a new ⌘K "Studio" row (**"The keys" · shortcuts, one page**), the contextual panel's new Keys block (§4), and the sheet-head `?` glyph's footer. The doorway rows for `g`-chords are printed from the registry's own `shortcut` field at render, so a re-chord never leaves the page lying.
3. **One progressive nudge, once, gated exactly like `StudioSetupWhisper`.** After a designer has opened a ledger by mouse three or more times in one session, a single margin note: *"— Orders answers to `G`, then `O`. Every room and book takes two keys; 'The keys' has the rest."* Recedes permanently on the first `g`-chord fired, or on dismissal. No second nudge, ever.

No global `?` keybinding ships (§11.1) — the reference page carries the whole shortcut system without adding the first bare single-key global binding outside the `g`-chord family.

## 8. Other ways to learn

**Help Center — first 20 articles, mapped to shelves, authoring order.** The blocker is review time per string against the ~142-placeholder backlog, not writing capacity. Sequence by what a designer asks at the point of need:

1. What is the Desk? *(Getting started, already resolves, `screens/07-help-center.png`)*
2. How do I send a proposal and get it signed? *(Getting started, resolves)*
3. How do I invoice and get paid? *(Getting started, resolves)*
4. What is the margin? *(Getting started, resolves)*
5. What does my client actually see? *(Getting started, resolves)*
6. How do I capture a lead? *(Getting started)*
7. How do I put a piece into a project? *(Getting started)*
8. How do I order and receive? *(Getting started)*
9. What can my first hire see and do? *(Getting started)*
10. The Desk *(The Desk & the Studio)*
11. ⌘K, Find anything *(The Desk & the Studio)*
12. The Contents block *(The Desk & the Studio)*
13. Orders *(Ledgers & money)*
14. Accounts *(Ledgers & money)*
15. Hours *(Ledgers & money)*
16. The Post *(Ledgers & money)*
17. How do I create a vendor? *(How do I… — ABSENT in the 2026-07 review's parity matrix)*
18. How do I void, settle, or print an invoice? *(How do I… — same gap)*
19. How do I change a project's scope? *(How do I… — same gap)*
20. "The keys" — the shortcut reference page *(Getting started, new, §7)*

Waves 2–5 follow the same shelves: the eight-entry glossary (§6) under Ideas & vocabulary; the seven document sections under Your Documents; the three Rooms; the client-mirror articles under For your clients — the shelf the owner forwards to her hire and to the homeowner both. The remainder of the ~142 placeholders is retired rather than authored: a stub that never resolves is worse than an empty shelf.

**Video: two or three, not ten, only after Wave 1.** The ten spec'd walkthroughs are blocked on an unresolved hosting decision (§12, item 14) and no `videoContent` schema exists. If it clears this quarter, the worthwhile two or three are what text cannot carry — a real engagement moving Brief through Proposal, and the Capture gesture. No interface tour on video; the coachmarks do that in less time.

**Drip alignment.** The seventeen-email deck and ten Post notes are well-written and already in voice; the fix is retiming, not rewriting. E2–E9 move from calendar to state — sent only when the studio hasn't yet done the thing taught, at most weekly — on the pattern M1–M4 use. Notes pointing somewhere other than the surface they teach get re-pointed. Whether the drip is sending at all is UNVERIFIED (§12).

**CS touchpoints.** Two human touches are proposed, licensed by VISION §2's 1:1 acquisition: a setting-up conversation with the owner in her first two days, and a handoff conversation with owner and hire together the day she accepts. Both are **candidates**, not settled doctrine — §11.5 and §12, item 11, cover why this needs a ruling first.

## 9. Reuse / change / retire

| Surface | Verdict | Path |
|---|---|---|
| Desk Walkthrough (modal + 6 coachmarks) | **Change** — anchor step 1; add "Show me later"; last step opens `CaptureLeadSheet`; add a teammate persona (cost noted §12, item 9) | `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx`, `desk-walkthrough-gate.ts` |
| `desk-first-touch` margin note | **Keep, unchanged copy** — best object in the product | `apps/designer-portal/src/components/document/margin-note.tsx` |
| `desk-walkthrough-offer` margin note | **Change** — widens to cover the new "Show me later" branch | `apps/designer-portal/src/app/(document)/desk/page.tsx:339–358` |
| `MarginNote` primitive | **Keep, extend** — new keys `doc-first-touch`, `hire-handoff`; persistence moves to `help_state` | `margin-note.tsx` |
| Studio Setup Checklist + whisper | **Change** — "Invite your crew" derives on acceptance; new "first hire opened a document" row; whisper unchanged | `account/studio-setup-checklist.tsx`, `studio-setup-whisper.tsx`, `lib/document/studio-setup.ts` |
| `GuidedEmptyState` (6 sites) | **Keep, one copy fix** — Library capture shelf | `components/document/guided-empty-state.tsx` |
| Contextual help panel | **Keep the mechanism, fix R-a, add Keys block** | `components/document/help/document-help.tsx` |
| `registry.tsx` `help.blurb` (17 entries) | **Keep, extend** — two new standalone owners (Desk, Document); source of truth for the glossary and Keys block | `lib/document/registry.tsx` |
| ⌘K populated palette | **Keep, add two rows** — "The words," "The keys" | `command-bar.tsx` |
| `g`-chords (7) | **Keep, document** — via the new Keys reference page | `registry-shortcuts.tsx` |
| Help Center `/help`, 8 shelves | **Keep structure, re-sequence content** per §8 | `app/(document-help)/help/page.tsx`, `lib/help-system/help-topics.ts` |
| Featured section's empty-hide | **Change** — falls back to topic grid instead of vanishing | `app/(document-help)/help/page.tsx` |
| Email drip (17) + 10 Post notes | **Change** — state-triggered, not calendar-triggered | `docs/marketing/founding-onboarding/copy-deck.md`, `supabase/functions/automation-processor` |
| `FirstSigninTour` | **Retire — delete** | `components/help/first-signin-tour.tsx` |
| `localStorage['help-system.welcome-shown.*']` | **Retire** — dead key belonging to the above | — |
| `docs/design/the-document/CODEBASE-MAP.md` route table | **Retire / mark superseded** | doc, not code |
| ~142 Sanity placeholder docs | **Retire the ~120 not in the Wave 1–5 plan** | `studios/help-system` |
| 10 spec'd videos + missing `videoContent` schema | **Retire the track pending §12, item 14** | — |
| Typed `HELP_EVENTS` vs. inline `window.posthog` calls | **Change — consolidate** | `packages/help-system/src/analytics.ts` vs. component call sites |
| `zone_flight` | **Build** — does not exist today (R-b); needed before any stuck-signal design can run | NEW event |

## 10. Measurement plan

**On events that exist today, unmodified:**

- `document_help_opened {surface_key, source}` — target: after the R-a fix, ≥90% of opens on `desk` and `doc` resolve to a blurb. The number of opens is never the target.
- `help.help_center.viewed` — expected to **fall** as the panel starts answering in place; a rise means the panel is still failing.
- `help.article.opened`, `help.related_article.clicked` — per surface key; a live article with zero opens in thirty days is retired, not promoted.
- `help.search.performed` / `help.search.result_clicked` — zero-result queries are the glossary's actual backlog.
- `document_command_bar_zero_result` — a dry ⌘K query is a vocabulary miss at the moment it happens. Target under 20%, each recurring miss becoming an alias in `registry.tsx`, exactly as "moodboards" already did under F62.
- `document_wayfinding_door_opened {source}` — target: after the shortcut nudge, `source: 'shortcut'` becomes a non-zero, stable share.
- `document_margin_note {key, action}` — the honest test of R94: `acted` should exceed `dismissed`, or the note is noise and gets cut.
- `teammate_invited` → `invitation_accepted` — the handoff funnel; target acceptance within 72 hours.
- `help.tour.started / completed / abandoned` — target is not completion; `abandoned` at step 0 should fall once "Show me later" ships.

**New events to build, and no more:**

- `zone_flight` — genuinely new instrumentation, not a revival; per ruling R-b it is not emitted anywhere today. Until built, no stuck-signal design can rest on it.
- `help.glossary.opened {source, term}` — the only way to learn whether the vocabulary gap is real or assumed.
- `help.shortcuts.opened {source}` — which rung of the shortcut ladder actually carries.
- `help.empty_state.shown` **actually fired** from `GuidedEmptyState` — the taxonomy exists; UNVERIFIED whether any call site fires it.
- `document_first_authored` — fired once per person on their first write into any document, the handoff's activation signal, deliberately once-per-person so it cannot become an engagement count.

**Explicitly never reported as success:** sessions, time in app, DAU/WAU, help-center pageviews as growth, tour-completion rate, drip open rates, help-article view counts. VISION §6 refuses engagement metrics as a success measure for the studio surface — a learning layer that works should be opened *less* over time, not more. A rising number anywhere in this plan, except handoff-acceptance, is a signal to fix something, never to celebrate.

## 11. Where the personas disagreed

**11.1 — `?` cheat-sheet overlay vs. a Help Center article page.** Documentation-writer and software-training-expert both build a global `?` keybinding opening a new `DocSheet` overlay; customer-success argues against one at all — *"a new chrome surface, a new mechanism, and a fifth place the same facts live."* The critiques sharpen the case against the overlay: nothing today binds a bare, unmodified single key globally outside the `g`-chord family (always a two-key sequence, far less collision-prone); a bare `?` binding is a bigger commitment than either proposal building it treats it as (`critique-software-training-expert.md` F12). **Recommendation: the article page.** It reuses an existing route and component rather than a new global keybinding and sheet type, and stays reachable from the same three doorways. If `?` is wanted later, it should open the same article, not a parallel overlay.

**11.2 — Tour as exposition vs. a tour that ends in an act.** Software-training-expert cuts the tour to four stops and has the final step open `CaptureLeadSheet` before closing — *"converts the tour from telling to doing."* The other two keep all six stops as description. The critiques note this stays inside D1/R4 (the sheet opens over `/desk`; the timer only starts once she submits a real lead) but is a genuine departure — "a tour never acts" is closer to today's contract than the proposal treats it. **Recommendation: adopt the act-ending close, but as a ruling** (§12, item 1) — the sharpest idea across all three proposals, but it changes what a tour is permitted to do.

**11.3 — A practice/sample project.** Only software-training-expert considers this, and rejects it: a seeded practice document needs fake households and money; it either lies to the R4 timer or needs a parallel one; it drifts out of date fastest of anything in the tree; and it risks the discoverability review's own "second palette" failure. **Recommendation: no.** She has a real first client inside her first hour (Journey 2); teach on that, via `doc-first-touch` (§4).

**11.4 — Version-suffixed margin notes vs. R94's "once, for good."** Software-training-expert proposes version-suffixed `MarginNote` keys (`doc-first-touch@2`) so a note re-arms exactly once when its surface has genuinely changed — its own answer to R94's acknowledged risk that "notes written once… slowly describe an interface that has moved on." Documentation-writer reuses `featureAnnouncements` similarly, "at most quarterly," but never logs it as an open question the way training-expert logs its own mechanism (`critique-documentation-writer.md` H3-3). **Recommendation: version-suffixed keys, as a narrow amendment to R94** (§12, item 5) — the more precise mechanism, tied to a real re-cut rather than a calendar.

**11.5 — CS calls as doctrine.** Customer-success's principle 5 — *"a human closes a stuck studio; the product does not chase"* — treats VISION §2's "1:1 through Leah's network" as license for scheduled CS calls. Its own critique (`critique-customer-success-lead.md` F10) flags this: VISION's studio promise is stated about the *product surface*; it says nothing about calls, and exempting human touchpoints from it is a reasonable but unruled inference. **Recommendation: log it as an open decision** (§12, item 11), not adopt it as settled — the calls may be right, but the promise is Patina's hardest constraint, and deserves an explicit yes from Kody first.

## 12. Decisions needed from Patina's team

1. **May the tour's last step act, not just describe?** Ending on `CaptureLeadSheet` opening over the Desk (§11.2) stays inside D1/R4 but changes what a tour is permitted to do. Needs a `DECISIONS.md` entry either way.
2. **Does a tour close without a CTA outcome deserve a third state — "later," not "never"?** "Show me later" amends `desk-walkthrough-gate.ts`'s §4.7 rule that a resolved tour "must never auto-offer again."
3. **Practice/sample project: yes or no?** This synthesis recommends no (§11.3); log it rather than assume it, since two proposals never raised it and one rejected it.
4. **Retire `FirstSigninTour`?** 280 lines, zero imports, PRD 09 still calls it live — every proposal recommends deletion; needs someone to do it.
5. **May a `MarginNote` key re-arm, version-suffixed, when its surface genuinely changes shape?** (§11.4) A narrow, self-limiting bend of R94's "appears once, for good," tied to a re-cut, never a calendar — needs an explicit amendment, not a silent ship.
6. **A PostHog flag for staged rollout, or does R125's no-flag law hold?** Most mechanisms here ship unflagged in the spirit of R125 — but the teammate persona work (item 9) touches a cross-portal shared type, a larger blast radius, and may be the one piece worth a flag.
7. **Who writes the ~142 Sanity docs (and reviews the ~20 that replace them)?** Is Leah's review the gate on every string, or may a writer draft to her voice for batch approval? The single largest blocker on §8, named by every proposal.
8. **Where does the shortcut reference live — a Help Center article, or later a `?`-triggered overlay?** This synthesis recommends the article (§11.1); if the overlay is preferred, own that it's a new global single-key binding, and check it against the Board Room's existing single keys (`p`, `1`) first.
9. **Does the first hire get a distinct arrival, and what does building it cost?** `Persona` is a fixed, cross-portal shared union (`packages/help-system/src/contentTypes.ts:9`), consumed by every portal the package serves, with a matching fixed Sanity `options.list`. A `'teammate'` value widens a shared type and its CMS schema, and `coachmarkContent` has no persona field of its own (`critique-customer-success-lead.md` F1, F2). The goal is right (§2 finding 2); the plumbing needs honest scoping.
10. **Does any onboarding surface touch the client portal?** Nothing here proposes it — every mechanism is designer-portal-only, per VISION §1's ranking. Confirm this stays out of scope rather than by omission.
11. **Are CS calls doctrine, or one proposal's extension of VISION?** (§11.5) Needs an explicit yes or no before a setting-up or handoff call becomes a scheduled part of onboarding.
12. **Reconcile R96's "a sheet stays one page" against the shipped Orders sheet's four tabs** (`LEDGER · THE WEEK · RECEIVING · VENDORS`). Two proposals cite R96 as settled canon without checking it holds in production; it does not.
13. **Is the seventeen-email drip actually sending in production?** UNVERIFIED across all proposals. Retiming it (§8) is wasted work if nothing sends — the cheapest item here to close.
14. **The video-hosting decision**, open since PRD 09. If it can't land this quarter, drop the video track rather than carry it as queued work.

## 13. Appendix

**`proposals/documentation-writer.md`** — Diagnoses the empty contextual panel as the sharpest finding, builds a wave-sequenced content plan (registry blurbs as the one content source, a generated glossary, a five-wave authoring order), and alone names the R96/shipped-Orders-sheet contradiction. Its causal story for the Document panel ("the Spec Book wins a stable-sort tie") is factually wrong — both panels are empty for the same reason, corrected as R-a. [`../proposals/documentation-writer.md`](../proposals/documentation-writer.md)

**`proposals/customer-success-lead.md`** — Frames the problem as two learners with no shared state, catches that the checklist marks "invited" not "accepted," and proposes the most fully worked stuck-signal escalation table. Its "cheapest high-value change" (a `'teammate'` persona) understates real plumbing cost (§12, item 9), and its central `zone_flight` recovery motion rests on an event that does not exist in code (R-b). [`../proposals/customer-success-lead.md`](../proposals/customer-success-lead.md)

**`proposals/software-training-expert.md`** — Alone treats the tour as needing an act, not exposition, cutting it to four stops and ending on `CaptureLeadSheet`; builds the fullest shortcut-teaching ladder and a genuinely new competence signal (`document_first_act {act, nth}`, separating exposure from unaided repetition). Misses that the Document panel has the same emptiness bug it diagnoses on the Desk, and cites R96 without checking it against the shipped Orders sheet. [`../proposals/software-training-expert.md`](../proposals/software-training-expert.md)

**`proposals/critique-documentation-writer.md`** — Corrects the "Spec Book wins" story (both panels are empty, not mis-framed), and flags first-hire copy built atop an unclosed checklist gap. Praises the registry-blurb content discipline and clean anti-metric pairing in §8. [`../proposals/critique-documentation-writer.md`](../proposals/critique-documentation-writer.md)

**`proposals/critique-customer-success-lead.md`** — Establishes `zone_flight` is not emitted anywhere in the tree (R-b) and that the "teammate persona" fix requires widening a shared cross-portal type and its Sanity schema, not wiring an unused prop. Praises the two-persona framing and the "never measured" list as the proposal's most disciplined moments. [`../proposals/critique-customer-success-lead.md`](../proposals/critique-customer-success-lead.md)

**`proposals/critique-software-training-expert.md`** — Finds the same Document-panel bug the proposal missed on the Desk, catches the R96 citation against the shipped four-tab Orders sheet, and notes five new margin-note keys inherit the device-local persistence bug unacknowledged. Praises the act-ending tour close as "the single sharpest idea across all three proposals" and `document_first_act` as genuinely novel. [`../proposals/critique-software-training-expert.md`](../proposals/critique-software-training-expert.md)
