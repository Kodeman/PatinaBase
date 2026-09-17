# The designer portal, learned — a documentation writer's proposal

*Written from the documentation / information-architecture lens. Audience ruling: the learner is a growing studio's **owner** and her **first hire** (Leah's studio, `docs/vision/VISION.md` §2). Every path cited was opened; anything not confirmed is marked UNVERIFIED.*

---

## 1. Diagnosis — what they fail to learn, and where

Patina has built two onboarding mechanisms and almost no **reference layer**. The 2026-07 discoverability review already found the shape of this: Leah fled to the legacy `/portal` twice inside two structured sessions (`docs/design/the-document/discoverability-review-2026-07.html`), and her failure was not on the tour — it was ambient, day-40 wayfinding, long after any first-run moment had faded. Its conclusion stands: *"a tour teaches once; the palette, the registry, and the margin notes are what a designer relies on the other 999 times."* Everything below is the reference layer that was never finished.

**The Desk's help panel is empty — provably, structurally.** `/desk` resolves to surface key `designer-portal/document/desk` (`lib/help-system/document-pathname-to-surface-key.ts`). In `lib/document/registry.tsx`, that key is owned **only by the five Verbs**, and `components/document/help/document-help.tsx` filters `s.kind !== 'verb'` when it picks the intro blurb. So on the one screen every designer lands on, ⌘K → "Help…" opens a full-height panel reading *"No articles for this surface yet."* with no eyebrow above it — exactly what `screens/08-help-panel.png` shows. The most-asked question in any product — *what is this?* — is unanswered at the point of need on the most-visited surface in the product.

**Inside a document, the panel mis-frames.** `/doc/[id]` resolves to `designer-portal/document/doc`, a key owned in the registry only by `SPEC_BOOK_SURFACE` and `BOARDS_SURFACE` — two *sub-rooms* of a document. The blurb match sorts longest-key-first; the two are equal length, so the stable sort keeps declaration order and the Spec Book wins. Open Help anywhere in a seven-section engagement document and it introduces itself as *"Every specified piece, gathered by the room it lands in."* The Document — the product, the thing VISION §5 ranks first — has no help blurb of its own. `/compose` has none either.

**The vocabulary is dense and taught exactly once.** Desk, Document, Room, Sheet/Ledger, Verb, Spine, Lens Ladder, Strata Mark, the margin, The Post, stamps, facets, courts. The walkthrough teaches four of these in about a minute and never again. The "Ideas & vocabulary" shelf exists (`lib/help-system/help-topics.ts`, prefix `…/document/concept`) but its content is two Featured picks and placeholders. **There is no glossary.** "The margin" is defined precisely once, in a Featured article a designer must already be at `/help` to find (`screens/07-help-center.png`) — the room the review found had *zero inbound links*.

**The first hire gets less than the owner, not more.** She lands on `/desk` after `accept_workspace_invitation`. The auto-modal gate passes for her, so she gets the same modal titled *"This is your Desk"* and the same six coachmarks written for a studio owner. But the Desk she is looking at holds sixteen live jobs she didn't create, grouped by a stage vocabulary (BRIEF · DISCOVERY · DIRECTION · PROPOSAL · PROJECT, `screens/02-desk.png`) nobody has explained, and she has no way to learn which are hers or what her seat permits. Her `member_role` and `is_designer` capability change what she can *do*; briefing 02 §6 records that the Desk roster query does not branch on role (UNVERIFIED). There is no "who am I here" moment, and no channel for the owner to hand anything over.

**Declining is a one-way door.** Any close without a CTA — Esc, backdrop, "Skip" — writes `{ abandoned: true, atStep: 0 }` to the cross-device tour record, and the tour *"never re-offers on any device"* (`desk-walkthrough-gate.ts`). Replay exists at `/desk?tour=desk-walkthrough`, but only via the ⌘K row and the Help Center's pinned row — both behind mechanisms she may not have learned. Margin notes, meanwhile, persist in device-local `localStorage`, so the two teaching layers disagree about what a person has already seen.

**Shortcuts are functionally undiscoverable.** The product's only teaching mechanism for a keyboard shortcut is a trailing chip *inside the ⌘K rows* (`G L`, `G P`) — you must already be inside the palette to learn the alternative to the palette. Nothing anywhere surfaces: the six `⌘/Ctrl+Enter` file gestures, the palette's own arrow/Enter behaviour, the tour's Enter/Esc, or the seventeen Board Room bindings (undo, redo, clipboard, z-order, lock, zoom, tidy, present). There is no shortcuts modal, no cheat sheet, and no `?` convention (grepped: briefing 04, "What does NOT exist").

**The reference shelf is well-built and empty.** Roughly 142 of ~150 Sanity documents are still literal `PLACEHOLDER — pending Leah review` stubs (`docs/prds/consolidated/09-help-guidance.md`); `isPlaceholderContent` correctly renders them as nothing, so production shows each component's inline fallback. Two spec'd content types were never built (`welcomeModalContent`, `videoContent`; the WelcomeModal borrows `tooltipContent`), and ten videos are blocked on an unresolved hosting decision. The Featured section is CSS-hidden when its list is empty — which makes an empty help centre look *deliberate* rather than broken.

**We cannot currently see whether any of it works.** The package taxonomy (`packages/help-system/src/analytics.ts`) exists, but components fire inline `window.posthog.capture('help.*')` around it, and it is UNVERIFIED whether any empty state fires `help.empty_state.*`.

**And the record misleads whoever writes next.** `components/help/first-signin-tour.tsx` is 280 lines with zero imports; PRD 09 still describes it as live; `CODEBASE-MAP.md` still documents an eight-zone tab UI deleted at the R21 dissolve.

---

## 2. Principles

1. **Answer "what is this?" where the question is asked.** The contextual panel already exists and already has a doorway on every sheet head; filling it beats building anything new. *(Discoverability review foundation item F5, "give `/help` a door"; `document-help.tsx`.)*
2. **Teach a noun once; let it be looked up forever.** One-shot teaching plus a permanent, silent reference — never a second tour. *(R94, "Appears once · Recedes on use"; `margin-note.tsx`.)*
3. **Reference is not engagement. A shorter visit is the win.** No learning surface may be judged by how often it is opened. *(VISION §4, "we will never optimize the studio surface for engagement"; §6.)*
4. **One definition, one place.** Anything nameable is defined once in `registry.tsx`'s `help.blurb`; every other surface renders that string, never a copy of it. *(`registry.tsx` canon note; the review's "one definition, one icon, no surface described twice".)*
5. **Extend ratified idioms; invent nothing.** Palette rows, margin notes, `DocSheet`, the `?` glyph, the Strata Mark. *(D4/D8; the Arc post-mortem cited inside Patina's own canon as "a caution, not a template".)*
6. **Two registers only.** Playfair-italic for teaching prose, DM Mono for structural labels. Understatement over exclamation; no third voice. *(`globals.css`; `patina-brand-voice`.)*
7. **The first hire is a distinct reader with a distinct question:** *which of these are mine, and what am I allowed to touch?* She is the moment VISION §2 names, and she is currently reading the owner's copy.
8. **Nothing may lie.** No teaching step enters `/doc/[id]` (it would start the R4 timer — D1, and the walkthrough's own module doc). No blurb describes a surface that has moved on; every fallback string carries an owner.

---

## 3. The experience, by moment

### Minute 1 — first sign-in (owner)

*She is trying to establish that this is not a new system to learn.*

**Keep the WelcomeModal and the six coachmarks, copy unchanged.** They are good, honest about their length, and already carry the right refusal ("You can leave at any step").

**Change one thing: anchor step 1 where it points.** Today it renders in the top-left corner, over the greeting (`screens/03-walkthrough-step-1.png`). A coachmark that does not touch the thing it names teaches nothing.

**New, small: a third modal action.** Today the choice is take-it, or a decline that is permanent on every device. Add a quiet third:

> **Show me later**

which writes `{ atStep: 0 }` without `abandoned: true`, so the tour falls through to the existing `desk-walkthrough-offer` margin note instead of vanishing. That note's copy in this state:

> *— The walkthrough is still here — six stops, about a minute — whenever you'd rather see it than find it.*
> `APPEARS ONCE · RECEDES ON USE`

*Carrier:* existing `WelcomeModal`, existing `MarginNote`, existing gate — one new branch, no new chrome.

### Day 1 (owner)

*She is putting one real client into it.*

**Give the Desk a blurb.** A non-verb registry owner for `designer-portal/document/desk`:

> `EVERY LIVE JOB, ONE LINE EACH — THE QUIET ONES ARE IN MOTION.`

**Give the Document its own blurb**, so it stops introducing itself as the Spec Book:

> `ONE CLIENT, ONE PAPER — BRIEF THROUGH CARE. THE RAIL SAYS WHERE IT STANDS.`

**Keep the studio setup checklist exactly as written.** Its footer — *"The marks follow the work. Nothing on this list is something you tick — do the thing and the box fills."* — is the clearest statement of Patina's posture toward its own user in the product. Keep the whisper's gate as tight as it is.

**New: one margin note on the first document opened**, printed in the document's own right margin, which already renders as `IN THE MARGIN · + NOTE` with the empty line *"The margin — decisions, messages, and money gather here"* (`screens/09-document.png`):

> *— This is the paper for one client — the whole engagement, brief through care. The rail on the left says where it stands; press a line to jump.*
> `APPEARS ONCE · RECEDES ON USE`

Recede conditions: a Lens Ladder click, or the ×. `MarginNote` already accepts `actionEvents` for exactly this.

**Change one empty state.** The `GuidedEmptyState` sites read well. The one that strands a first-timer is the Library's raw-capture shelf, which says *"Nothing captured yet. Bring something in — it lands here, raw."* without saying how (`screens/10-library.png`):

> **Nothing captured yet.** Bring a piece in from a vendor's page with Capture, or drop a photo here — it lands raw, and you tidy it later.

### Week 1 (owner)

*First proposal out; first invoice drawn.*

**Extend the `?` glyph, don't build a new doorway.** `overlays/doc-sheet.tsx` already renders `<HelpGlyph helpKey source="sheet-head" />` on any sheet given a help key — visible on the Orders sheet (`screens/12-orders-sheet.png`). Give the same glyph to the Drafting Room and the document header. Same component, same event, no new chrome.

**Re-link the drip's in-app Post notes to the surface each email teaches** — E5 teaches the Drafting Room and deep-links `/desk`. Alignment only; no new emails.

**New: one shortcut prompt, once.** `documentEvents.wayfinding.doorOpened` already carries `source`. After a designer has opened a ledger by drawer or palette several times in a week, print one margin note beside the drawer:

> *— Orders answers to G, then O. Every room and book takes two keys; press ? for the list.*
> `APPEARS ONCE · RECEDES ON USE`

Recedes the first time any `g`-chord fires. One nudge, not a system.

### The first hire's first day

*She is working out which of sixteen jobs are hers and what she is allowed to touch.*

**Keep the accept-invite flow untouched**, including the deliberately indistinguishable `invitation_invalid_or_expired` error — security posture beats a friendlier message.

**New: a persona variant of the existing WelcomeModal** (the component already takes a persona; today's fallback is `designer`). For an account that arrived by invitation and is not the owner:

> **This is the studio's Desk.**
> Every job the studio has open lives here — yours and everyone's — one line each, grouped by stage. Six stops, about a minute. You can leave at any step.

with two substituted coachmarks:

- **One client, one document** — *"Whoever's hand it is in, the paper is the same one. Pick it up, and the studio sees what you did."*
- **Where to start** — *"The Desk shows every job, not a queue. Ask whose line is whose; nothing here is assigned to you by the software."*

**New: the owner's handoff note — the one genuinely new object I would build.** `StudioInviteModal` already asks Designer-or-Member, a permission tier, and an optional job title. Add one optional field, *"A line for her first day,"* carried on the invitation and rendered once on the hire's first `/desk` as a margin note in the owner's name:

> *— From Leah: start with the Olsen lake house — the brief's written, it just needs the schedule built.*
> `APPEARS ONCE · RECEDES ON USE`

Against the VISION §8 feature test: **surface** — The Document (§1, rank 1); **moment** — §2's literal trigger, the first hire; **stream** — the subscription floor, since a second seat that works is what a studio pays for; **promise** — "won't notice," because it is one line, once, in the owner's own words rather than Patina's.

**New: state the seat.** The Account sheet already prints `LEAH HARTWELL · OWNER` under the nameplate (`screens/06-account-studio-setup.png`). For a member, print the honest line:

> `LEAH HARTWELL · MEMBER` — full access to the studio's work; the owner manages seats.

*(Contingent on the open question in §9.1 — if the Desk does filter by role, this line must say so instead.)*

### Ongoing

Nothing recurring. The permanent additions — a filled help panel, a glossary, a shortcut sheet — cost a designer nothing when unused, which is the only kind of learning surface VISION §4 permits. One exception, gated as tightly as the whisper: `profiles.help_state.featureAnnouncements` already exists and is unused in the Document. Use it at most quarterly, one line, dismissible, when a surface genuinely changes shape.

---

## 4. Navigation & vocabulary

The Desk / Document / Rooms / Sheets / Verbs model should be met three times, in three registers:

1. **Named** in the walkthrough — step 3 already does this correctly ("rooms you walk into… sheets slide over… Esc puts them back").
2. **Restated structurally** by the Desk's standing Contents block (R95), which already prints ROOMS / LEDGERS / BEGIN. One change: ⌘K rows carry the weight word (`ROOM ↗`, `LEDGER`); print it on the Contents rows too, so a designer who never types meets the same vocabulary.
3. **Looked up forever** in a glossary.

**Position: yes to a glossary, and it must be generated, not written.**

*Where it lives:* the shelf that already exists. `help/topic/[prefix]/page.tsx` is a live route and "Ideas & vocabulary" is already a topic bound to `designer-portal/document/concept`. The glossary is that shelf rendered as a short A–Z rather than an article list.

*How it is reached:* (a) the Help Center's own shelf; (b) a new ⌘K utility row beside the three help rows already in the Studio group — **"The words" · `WHAT PATINA CALLS THINGS`**; (c) a second link in the contextual panel's footer beside `BROWSE ALL HELP →`.

*The rule that makes it maintainable:* every entry naming a room, sheet, or verb renders its `registry.tsx` `help.blurb` **verbatim** as its first line; only the second paragraph — why we call it that, and how to reach it — is authored. The registry stays the single definition and the glossary is a view of it, which answers R94's own acknowledged risk that *"notes written once and never revisited slowly describe an interface that has moved on."*

**Five entries, as they would read:**

> **The Desk** · *where you start*
> Every live job, one line each — the quiet ones are in motion.
> It is the only landing page; there is nothing behind it. If something needs your hand it comes here, and if it doesn't, it stays where it is. `⌘K` → **The Desk**, or the wordmark at the left of the drawer.

> **Room** · *a place you walk into*
> Library, People, The Scans — and the Drafting Room, once a proposal exists.
> Walking into a room puts the document you were holding down. That is the whole difference between a room and a sheet. `G` then `L`, `P`, or `R`.

> **Sheet** · *also called a ledger, or a book*
> Orders, Accounts, Hours, The Post — and the Call sheet, once a project is in hand.
> A sheet lays over the work without disturbing it; `Esc` puts it back and the document underneath never moved. `G` then `O`, `A`, `H`, or `T`.

> **The margin** · *the document's right edge*
> Decisions, messages, money, time, notes, and field texts gather beside the work they belong to.
> One act in the margin updates every surface that item touches — including your client's copy. `+ NOTE` writes one; `⌘⏎` files it.

> **The Post** · *the studio's mail*
> Letters and the record — what arrived, what needs review.
> The bell at the right of the drawer opens it; `G` then `T`. The dot means unread. There is no count, and there will not be one.

A note for whoever authors these: the Orders sheet renders four tabs (`LEDGER · THE WEEK · RECEIVING · VENDORS`, `screens/12`), which sits awkwardly against R96's *"a sheet stays one page"* guardrail. Do not write that guardrail into an entry until it is reconciled — see §9.

---

## 5. Keyboard shortcuts

A four-rung ladder, three rungs of which are already built.

1. **Make `?` the convention.** The glyph already means "help about this" on sheet heads. Add one global `?` (Shift+/) keydown reusing the suppression logic `registry-shortcuts.tsx` already implements — no modifiers held, not in an editable target, no overlay open — opening the cheat sheet as a `DocSheet`. One binding, one page, an existing idiom.
2. **Keep ⌘K's trailing chips and repeat them** on the Desk Contents rows and in the drawer's `LEDGERS · SHEETS` popover, so a designer who never types still meets them.
3. **One progressive prompt**, as in Week 1 — once, receding on the first chord.
4. **Label the invisible gestures in place.** The six `⌘/Ctrl+Enter` sites all have visible composers; print `⌘⏎ TO FILE` in DM Mono beside the send affordance. That is a label, not chrome.

**Proposed cheat sheet — "The keys," one page, DM Mono keys left, Inter gloss right, no shadow:**

> **FIND**
> `⌘K` — find anything: documents, rooms, books, and the five ways to begin
> `↑` `↓` — move through the list · `⏎` — open the row
> `Esc` — put the palette back (twice, if you are asking the Engine)
>
> **GO** — press `G`, then the letter, within a moment
> `G L` Library · `G P` People · `G R` The Scans
> `G O` Orders · `G A` Accounts · `G H` Hours · `G T` The Post
> *Rooms take you out of the document. Books lay over it.*
>
> **WRITE**
> `⌘⏎` — file a margin note, a thread note, a board note, a direction
>
> **BOARDS** — while a board is open
> `P` present · `Esc` leave present, then leave the board
> `⌘Z` undo · `⌘⇧Z` / `Ctrl Y` redo
> `⌘D` duplicate · `⌘C` `⌘X` `⌘V` copy, cut, paste
> `⌘L` lock · `⌘]` forward (`⌘⇧]` to front) · `⌘[` back (`⌘⇧[` to back)
> `⌦` delete · `⇧T` tidy
> `1` fit to view · `⌘0` reset zoom · `⌘+` `⌘−` zoom
>
> **THE WALKTHROUGH**
> `⏎` next · `Esc` leave
>
> *`?` opens this page. Nothing here is required — every key has a door.*

`⌘⇧F` (Tester Notes) is internal and flag-gated; list it only when `tester-notes` is on.

---

## 6. Other ways to learn

**Help Center content plan.** The bottleneck is not authoring capacity — it is one designer's review time per string. So sequence by *what is asked at the point of need*, and cap the first wave at a single sitting's worth.

- **Wave 1 (~20 entries) — make the panel answer.** One short article per live surface key with a `?` doorway or a pathname mapping: `desk`, `doc`, `library`, `library/piece`, `people`, `rooms`, `drafting`, `compose`, `plans`, `orders` (+ `week`, `receiving`, `vendors`), `accounts`, `hours`, `the-post`, `margin`, `command-bar`, `contents`, `coordination`, `call-sheet`. Each ≤120 words, answering three things: what this is, what you do here, what it changes elsewhere. Feeds four shelves at once.
- **Wave 2 (~15) — *Ideas & vocabulary*, as the glossary.** Registry blurb plus one authored sentence each.
- **Wave 3 (~10) — *How do I…***: the moves the shelf already promises, plus the ones the review found people fled the product for — create a vendor, void or print an invoice, change a scope.
- **Wave 4 (~5) — *For your clients***: expand the existing Featured "What does my client actually see?" across the mirror routes.
- **Wave 5 — *Getting started*, written last**, as a table of contents over waves 1–4 rather than new prose.
- **Retire the remainder of the ~142 placeholders.** They render as nothing today; deleting them makes shelf counts honest and stops a future writer inheriting a phantom backlog.

- **Two schema gaps to close, one to abandon:** build `welcomeModalContent` (today the modal borrows `tooltipContent`) and a `glossaryEntry` type. Do not build `videoContent`.
- **Change the Featured section's empty behaviour.** Silently CSS-hiding an empty section makes a bare Help Center look intentional. Fall back to the topic grid with one line, not to nothing.

**Videos: two, not ten, and only after Wave 1.** The ten spec'd walkthroughs are blocked on an unresolved hosting decision, and each would go stale with the next ruling. The two worth making are the ones text cannot carry: **"One client, one document"** — ninety seconds, screen only, no face, no music, one real engagement moving Brief → Proposal; and **"Capture"** — forty seconds of the extension pulling a piece off a vendor page, because it is a physical gesture. If hosting cannot be settled this quarter, ship the text and drop the videos rather than let them block the shelf.

**Email drip: align, do not extend.** Seventeen emails and ten in-app Post notes already exist in the right voice. Three changes: re-link the Post notes that point somewhere other than the surface they teach; move W0's sentence *"Replay the walkthrough anytime from the Help shelf"* into the tour's own final step, since it is currently the only place in the system that tells a designer replay exists; and verify the drip is sending at all before spending anything more on it (UNVERIFIED, briefing 03 §11).

**In-person and CS.** Acquisition is 1:1 through Leah's network (VISION §2), so the highest-leverage "content" is not content. Two touchpoints: the owner's first-hire handoff note above, which replaces a CS email with the owner's own voice; and a twenty-minute walk in the studio's second week whose only artifact is a list of the exact words the owner used for things Patina calls something else — that list is Wave 2's input. No webinars, no in-app chat, no "book a call" affordance in the product.

---

## 7. Reuse / retire

| Surface | Verdict | Why |
|---|---|---|
| Desk Walkthrough (modal + 6 coachmarks) | **Keep, three changes** | Copy is right and it is honest about its length. Anchor step 1; add "Show me later"; add a first-hire persona variant. |
| `desk-first-touch` margin note | **Keep unchanged** | The best teaching object in the product — it states its own contract to the reader. |
| `desk-walkthrough-offer` margin note | **Change** | Widen its gate from pre-ship-date designers to anyone who chose "Show me later". |
| `MarginNote` primitive | **Keep and reuse** | `actionEvents` gives "recedes on use" for free — the carrier for the shortcut prompt and the handoff note. |
| Studio setup checklist + whisper | **Keep unchanged** | Live-derived, owner-gated, no badges. Model behaviour for everything else here. |
| Contextual help panel (`document-help.tsx`) | **Keep the mechanism, fill it** | Correct architecture; empty on the Desk, mis-framed inside a document. |
| `?` `HelpGlyph` on sheet heads | **Keep and extend** | Already the point-of-need doorway; extend to the Drafting Room, the document, and the new `?` key. |
| `registry.tsx` `help.blurb` | **Keep, extend** | Add non-verb owners for the `desk` and `doc` keys; make it the glossary's source of truth. |
| Help Center's 8 shelves | **Keep the structure, re-sequence the content** | The shelves survive; the ~142 placeholders do not. |
| Featured section's empty-hide | **Change** | A silently hidden section makes an empty help centre look deliberate. |
| ⌘K populated palette + chips | **Keep** | R93, settled canon; relitigating it would cut against R5. |
| `g`-chords (7) | **Keep, teach** | Seven bindings with no teaching outside the palette they substitute for. |
| Email drip (17 + 10 Post notes) | **Keep, re-link** | Alignment only; live send status UNVERIFIED. |
| `components/help/first-signin-tour.tsx` | **Retire — delete** | 280 lines, zero imports, and PRD 09 still calls it live. It will mislead the next writer. |
| `localStorage['help-system.welcome-shown.*']` | **Retire** | Dead key belonging to the above. |
| `CODEBASE-MAP.md` route table | **Retire / mark superseded** | Documents an eight-zone UI deleted at the R21 dissolve. |
| Board Room shortcuts (17) | **Keep, document** | The single largest undocumented surface found; the cheat sheet is the whole fix. |
| Typed `HELP_EVENTS` vs inline `window.posthog` | **Change — consolidate** | Today we cannot answer "did she find it". |
| 10 spec'd videos + `videoContent` schema | **Retire** | Blocked on an unresolved decision; two videos replace ten. |

---

## 8. How we would know it works

Every signal below is a **reduction** or a **resolution** — never a duration, a visit count, or a completion rate. VISION §6 forbids engagement as a success measure here, and a learning layer that works should be opened *less* over time, not more.

**On existing events:**

- `document_help_opened` (`surface_key`, `source`) — today the Desk and the document both open onto nothing. Target: ≥90% of opens land on a `surface_key` that resolves to a blurb *and* an article. The number of opens is not the target.
- `help.help_center.viewed` — expect this to **fall** as the panel starts answering in place. A rise means the panel is still empty and people are routing around it.
- `help.article.opened`, `help.related_article.clicked` — per `surface_key`. A live surface with zero article opens over thirty days is an entry nobody needed; retire it rather than promote it.
- `help.search.performed` + `help.search.result_clicked` — the zero-result queries **are** the glossary backlog. Target: under 20% zero-result, and every recurring miss becomes an alias in `registry.tsx`.
- `document_command_bar_zero_result` — the same instrument, better placed: a dry ⌘K query is a vocabulary miss in the moment it happens. Target: the top ten dry queries each resolve within a wave, exactly as "moodboards" already did under F62.
- `document_wayfinding_door_opened` (`source`) — the shortcut signal. Target: after the single prompt, `source: 'shortcut'` becomes a non-zero and **stable** share of door opens. Stable is the win.
- `document_margin_note` (`key`, `shown` / `dismissed` / `acted`) — the honest test of R94. For `desk-first-touch`, `acted` should exceed `dismissed`. If dismissal wins, the note is noise and should be cut.
- `help.tour.started` / `completed` / `abandoned`, and `document_walkthrough_started` (`source`) — the target is **not** completion. It is that `abandoned` at step 0 falls once "Show me later" ships, because an accidental Esc stops being a permanent verdict.
- `invitation_accepted` → that user's first document opened. The first-hire activation signal, and the only one here mapping to the subscription stream.
- `zone_flight` — the review's long-unread ledger. It should sit near zero; a spike names the next article to write.

**Three new events, and no more:**

- `help.glossary.opened { source, term }` — the only way to learn whether the vocabulary problem is real or assumed.
- `help.shortcuts.opened { source: 'key' | 'palette' | 'sheet_head' | 'margin_note' }` — tells us which rung of the ladder actually carries.
- `help.empty_state.shown` **actually fired** from `GuidedEmptyState` — the taxonomy exists, the call sites do not (UNVERIFIED). The same person meeting the same empty state repeatedly is a stuck user, and that is currently invisible.

**Explicitly not reported:** sessions, time in app, tour completion as a goal, help-centre pageviews as growth.

---

## 9. Open questions Patina's team must decide

1. **Does the Desk branch on role at all?** Briefing 02 §6 marks this UNVERIFIED. The first-hire copy and the seat line both change if a Member sees a filtered roster.
2. **Who owns the fate of the ~142 placeholders?** Is Leah's review the gate on every string, or may a writer draft to her voice for batch approval? Wave 1 is unschedulable until this is answered — and it is the single largest blocker in this proposal.
3. **The video-hosting decision** (open since PRD 09). If it cannot land this quarter, kill the video track rather than carry ten unmade assets on the plan.
4. **Is the drip live-sending in production?** UNVERIFIED. Re-linking Post notes is wasted work if nothing sends.
5. **Is `guest` a real `member_role`?** It is accepted by `workspace-member-invite` but absent from the three-rung description. Onboarding copy must not name a fourth rung that does not exist.
6. **Does "Show me later" need a ruling?** It amends the tour spec's decline semantics (§4.7's "resolved once completed OR abandoned"). It is a rule change, not a new mechanism, but it should be logged rather than slipped in.
7. **Is the designer portal desktop-only by ruling, or by accident?** The walkthrough gates at ≥980px and margin notes are device-local. The answer decides whether the mobile bar needs a teaching layer at all — today it has none.
8. **Who reviews a `registry.tsx` blurb change once the glossary renders it?** Making the registry the published source of truth means an engineer editing a data file is now editing customer-facing copy. That needs an owner before it needs code.
9. **Reconcile R96's "a sheet stays one page" with the shipped Orders sheet's four tabs.** Until that is settled, the guardrail cannot be written into a glossary entry without publishing something the product contradicts.
10. **Does the owner's handoff note belong to Patina at all,** or is it a text message she would send anyway? One conversation with Leah before building it.
