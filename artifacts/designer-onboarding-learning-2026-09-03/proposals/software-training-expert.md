# The designer portal, learned

**A new-user onboarding and learning proposal from the software-training lens**
Prepared 2026-09-03 · audience ruling: the learner is a growing studio's **owner** and her **first hire** (Leah's studio is the reference)

My lens is narrow on purpose: learning-curve shape, tour versus try-it-yourself, whether a practice project earns its place, how shortcuts get chunked, how reinforcement survives week two, and competence measured rather than completion. Everything below is grounded in the briefing pack, the screens, `docs/vision/VISION.md`, and the code paths I opened.

---

## 1. Diagnosis — what these two learners fail to learn today, and why

**The curve is a spike and then a flat line.** The only structured teaching is the Desk Walkthrough: a welcome modal plus six coachmarks, about a minute, desktop only (`window.matchMedia('(min-width: 980px)')` in `desk-walkthrough-gate.ts`), confined to `/desk`, and never auto-offered again once completed *or* abandoned. After that minute, everything the learner acquires she acquires by accident — no second exposure, no practice, no spaced return. The discoverability review already cites NN/g's onboarding-tutorial research for exactly this reason and already ruled for ambient teaching (R93/R94) over tours — yet the tour remains the only place a beginner is taught anything in sequence.

**The tour teaches nouns; the work is verbs.** Read the six bodies as a set: *The Desk* (a place), *One client, one document* (a shape), *Rooms and ledgers* (two categories), *The studio drawer* (a strip), *Find anything* (a key), *Begin with a lead* (an act — described, not performed). Nothing in the first-run experience asks the learner to do a single thing. Recognising the word "ledger" is not the ability to draw an invoice.

**And it cannot show her the Document — the one object the product is about.** A real constraint, not an oversight: D1 plus the R4 timer means a step routing into `/doc/[id]` would start an honest work clock on a fake errand, so `desk-walkthrough.tsx` self-guards to the Desk. The consequence is stark — the seven-section spine (Brief → Discovery → Direction → Proposal → Project → Install → Care), the rail, the Lens Ladder, the Strata Mark, the margin are taught by **zero** onboarding surfaces. Step 2 says "one client, one document" while the learner looks at a list of folders.

**The contextual help panel is empty exactly where a beginner opens it.** Screen `08-help-panel.png` is the sharpest single finding in the pack: ⌘K → "Help… / ABOUT THIS SURFACE" on `/desk` renders a full-height panel saying *"No articles for this surface yet."* The doorway works; the room is bare. Meanwhile `registry.tsx` already carries nineteen one-line `help.blurb` strings for the rooms, ledgers, verbs and document-scoped surfaces — the Desk simply is not a registry surface, so it has none.

**Browse promises what isn't there.** `/help` resolves five Featured articles (screen `07-help-center.png`) and eight topic shelves below the fold with genuinely good labels — *"Getting started · Your first hour with the Desk"*, *"Ideas & vocabulary."* Behind them, per `docs/prds/consolidated/09-help-guidance.md`, sit roughly 142 of ~150 docs still reading `PLACEHOLDER — pending Leah review`, which `isPlaceholderContent` correctly hides. The shelf structure is a promissory note.

**Shortcuts are structurally unlearnable.** The seven `g`-chords appear only as trailing chips (`G L`, `G P`) *inside* the ⌘K palette they are an alternative to — you must already be in the slow mechanism to find the fast one. The six ⌘/Ctrl+Enter save sites carry no hint. The Board Room's thirteen-plus bindings have no legend anywhere, and no cheat-sheet component exists in the tree. A designer who uses Patina daily for a year has no path to getting faster at it.

**The first hire is the least-served learner.** Journey 6: accept-invite polls, succeeds, waits 350 ms, hard-navigates to `/desk`. Her profile is new, so she *does* get the auto-modal — six coachmarks about a studio she has never seen, over sixteen live jobs that are not hers, with no statement of what her seat permits or what to touch first. The invite captured `teammate_type` and a job title; neither shapes anything she sees. And the only "what next" surface — the Studio Setup Checklist — is owner-scoped: `StudioSetupWhisper` returns nothing when `!isOwner`, and the checklist sits on the Account sheet's Studio page behind `studio-workspaces`.

**Nothing measures competence.** The checklist's five rows — *Name & brand the studio · Set your own title · Invite your crew · Seed the rolodex · Open the first project* — are account configuration. A studio can read 5/5 while its owner cannot send a proposal, draw an invoice, or log a delivery. Its footer states the right philosophy verbatim — *"The marks follow the work… do the thing and the box fills"* — over three rows that are not the work.

**The vocabulary is a second language with no dictionary.** Desk, Document, Room, Sheet, Ledger, Verb, the margin, the Post, Put down, Hands free, the spine, the Strata Mark, folio, stamp, the Engine, eight drafting facets, eight FF&E stages. `GlossaryTerm` is named in `packages/help-system/src/index.ts:25`'s doc comment and was never built.

**And the scaffolding misleads its own team.** `first-signin-tour.tsx` is 280 lines with zero mounts; `09-help-guidance.md` still calls it live.

---

## 2. Principles

1. **Teach at the moment of the work, never in advance of it.** VISION §4: *"It prompts and collects information when and where you need it, then gets out of the way."*
2. **Recognition over recall; the permanent surfaces teach.** R93/R94 and their own evidence: Leah fled to `/portal` at day forty, long after any first-run moment had faded. A tour teaches once; the palette, the registry and the margin teach the other 999 times.
3. **Reinforcement rides on her work, never on a clock.** VISION §6 refuses engagement metrics for the studio surface. Spaced repetition is necessary — but each repetition must be triggered by an act she took, never by elapsed time or absence.
4. **Competence, not completion.** Measure first successful acts and the second unaided repeat. Source: VISION §4's *"success is that she doesn't notice"*, and the checklist footer that already says it.
5. **One definition, read from the registry.** `registry.tsx`: *"a surface renamed or re-iconed here changes everywhere at once."* Teaching copy about a room, ledger or verb reads `help.blurb`; never hand-authored twice.
6. **Her own paper, never a fake one.** D1 plus R4 forbid a tour walking into a document. The answer is not a sandbox — it is marginalia inside her real first document.
7. **Two registers, no third.** `globals.css` locks Playfair-italic for teaching prose and DM Mono for labels; D4 forbids shadows, D8 badges. Nothing here adds chrome vocabulary.
8. **The first hire is a different learner, not a smaller owner.** VISION §2 defines the customer as the studio *at the moment it adds its first hands*.

---

## 3. The experience, by moment

### Minute 1 — first sign-in (owner)

*What she is trying to do:* find out, in under two minutes, whether this thing will hold her actual work. She arrived warm, 1:1, through Leah.

**Sign-in.** The left panel currently reads *"Welcome back to the studio."* — wrong for a first-ever sign-in. Same shell, same two panes, copy swapped when no prior session exists on the device:

> THE STUDIO
> **Your studio, on one page.**
> Every client's work becomes one document. There is nothing to set up first.

**The WelcomeModal.** Keep the component; re-cut the body so the minute ends in an act rather than a summary.

> **This is your Desk**
> Every client's work becomes one document, and every document lands here. Four stops, under a minute — then you'll put your first client on paper.
> *Walk it* · *Straight to work*

**The tour: six stops down to four, and the last one hands over.** Stops 3 and 4 today (*Rooms and ledgers*, *The studio drawer*) spend her scarcest minute scrolling her away from her own jobs to the bottom of the Desk — visible in `03-walkthrough-step-3.png` and `-4.png`. Both describe permanently-visible, recall-free surfaces: the Drawer never moves, and the Contents block already prints `Library / pieces and makers`, `Orders / POs, receiving, claims · SHEET`. Retire both as coachmarks; move their one teachable fact into the Contents block (§4). Keep the rest, renumbered:

1. **The Desk** — unchanged.
2. **One client, one document** — unchanged.
3. **Find anything** — unchanged (this is the highest-value line in the whole tour).
4. **Begin with a lead** — body unchanged; CTA changes from *To work* to **"Capture one"**, which closes the tour and opens `CaptureLeadSheet` over the Desk.

That last change is the most important one here. It converts the tour from telling to doing and stays inside canon: the sheet opens *over* `/desk`, and the tour is over before it submits, so when submission routes to `/doc/{leadId}` the R4 timer starts on real work she chose. It needs a ruling (§9).

**If she skips.** Keep `desk-first-touch` exactly as it is, verbatim — *"This is your Desk. Folders that need you gather here; the rest stays quiet. ⌘K finds anything by name — try 'invoice'."* / `APPEARS ONCE · RECEDES ON USE`. It is the best-written teaching object in the product.

*Carried by:* WelcomeModal, TourController, MarginNote, CaptureLeadSheet — all existing. *New:* the signed-out first-visit copy variant; the CTA hand-off.

### Day 1

*What she is trying to do:* put one real client on paper and see whether it holds.

**A first-document margin note.** The largest gap in the product closes with one new `MarginNote` key, `doc-first-touch`, rendered in the right margin column of the first document she opens (the column already headed `IN THE MARGIN`, screens 09/09c):

> – One client, one paper. The rail on the left says where this stands; the margin here is where decisions, messages, and money gather. Nothing is a form — it fills as the work happens.
> `APPEARS ONCE · RECEDES ON USE`

Recedes on her first margin note or first section act. No new primitive: `MarginNote` is SSR-safe, localStorage-scoped, and already exports `hasMarginNoteBeenSeen` / `markMarginNoteSeen` for exactly this reuse.

**Re-cut the Studio Setup Checklist so it tracks the work.** Same component, same monochrome check-squares, same footer verbatim; five rows that are actually the job:

1. Name & brand the studio *(unchanged)*
2. **Put one client on paper** — a document exists
3. **Invite your first hand** — `memberCountBeyondSelf > 0`
4. **Send something to a client** — a proposal sent or a share link minted
5. **Draw the first invoice**

"Seed the rolodex" goes (it is derived data — the sub-line already admits *"The rolodex fills itself from your projects"*), and its role-gated SKIP goes with it. `StudioSetupWhisper` stays exactly as built: owner-only, two-or-more open, one Playfair line, no badge.

**Give the Desk a help blurb and three articles.** So that ⌘K → "Help…" on `/desk` stops rendering an empty room. Blurb, in the registry idiom: *"Every live job, one line each. Quiet means the work is in motion."*

### Week 1

*What she is trying to do:* get the first proposal out, and get paid.

**Three act-triggered notes, each once, each in the document where the act happened.** This is the spaced-repetition layer, and it is spaced by her calendar, not ours.

- On her first proposal sent — `first-proposal-sent`:
  > – It's out. The Proposal section watches from here: opens, reading time, and the signature the moment it lands. Nothing to check on.
- On her first signature — `first-signature`:
  > – Signed. The same paper moves to Project. Nothing to re-enter; Orders and Accounts already have what they need.
- On her first approved FF&E line — `first-order-ready`:
  > – Approved pieces go out as a purchase order. Orders keeps the register — `G O` opens it.

The third does double duty: it is the shortcut prompt delivered at the exact moment of first repetition, which is when a chunk will actually stick.

**Realign the drip from a clock to a condition.** The seventeen-letter deck is well written and mis-sequenced: E2–E9 fire on elapsed weeks regardless of what the studio has done, so a studio that drafted on day two still gets *"From shelf to proposal"* in week four. Three changes: (a) each onboarding letter becomes conditional on its act *not* having happened and is dropped rather than deferred — the milestone track M1–M4 already proves the pattern; (b) each in-app Post note deep-links to the surface it teaches, not to `/desk` (four of ten point there today); (c) drop E9 (*"Teach it your taste"*) from the onboarding track — outside the first-ninety-days path, and the letter most likely to drift into mechanics framing.

### The first hire's first day

*What she is trying to do:* be useful today without asking her boss five questions.

**A first-hire modal variant.** `WelcomeModal` already takes a persona; today the fallback is `designer` for everyone.

> **{Studio name}, on one page**
> Every client here is one document. You see the same desk the studio sees — pick one up and the work is where it was left. Four stops, under a minute.

**An arrival note, `hire-first-touch`**, on her first Desk — the three things a new hand actually wonders, in one line:

> – You can open anything the studio can. Hours log themselves while a document is in hand. Nothing you do here is hidden from the studio, and nothing is lost.

**One line back to the owner.** Once "Invite your first hand" fills, its sub-line names who arrived — `Ada Kern · designer · joined Sep 3`. One line, no chrome, no count.

**Say what her seat does.** Whether Member and Designer see different desks is UNVERIFIED (briefing 02 §6). Whatever the answer, it belongs in one sentence in her help panel and in one Tier-1 article — *"What can my first hire see and do?"*

*New here:* the persona variant's copy, one margin-note key, one checklist sub-line, one article. No new mechanism.

### Ongoing

Nothing recurs. Three permanent teachers carry the product after week one: the populated ⌘K, the Desk's Contents block, and the Help Center. One new permanent surface is added — the keys sheet (§5) — and nothing else.

**Content rot.** R94's own risk note names it: *"notes written once and never revisited slowly describe an interface that has moved on."* Answer: every `MarginNote` key carries a version suffix (`doc-first-touch@2`); when the surface is re-cut, the key changes and the note appears once more. Not a nag — the identical one-shot contract, re-armed by a real product change. It is the one place this proposal bends an existing ruling, so it needs one (§9).

---

## 4. Navigation and vocabulary

The Desk/Document/Rooms/Sheets/Verbs model is learned in three passes, and only the first is onboarding.

**Pass one — the physics, stated once, permanently.** Rooms and sheets differ by a physical rule, and the tour spends a whole coachmark on it. Move it into the Contents block, one DM-mono line under the `THE STUDIO` eyebrow, where it is true forever and costs nobody a minute:

> Rooms replace the page. Sheets slide over it — Esc puts them back.

**Pass two — in use.** ⌘K's group headings teach the taxonomy every time it opens: `WHERE THE WORK STANDS`, `ROOMS & LEDGERS`, `BEGIN`, `STUDIO`. The alias table is the quiet asset nobody counts — a designer arriving with Houzz or Programa vocabulary types "moodboards", "POs", "timesheet", "billing" and lands correctly. Keep feeding it (§8, signal 4).

One fix, visible in `04-command-bar.png`: at 1440×900 the empty palette shows only `Library` and `People` before the fold, so the two rows that teach — "Take the walkthrough" and "Browse the Help Center" — sit below the fold of the front door itself. For an account in its first fortnight, cap `WHERE THE WORK STANDS` at three stage rows so `BEGIN` and `STUDIO` clear it.

**Pass three — reference. My position: yes to a glossary, one of them, in the Help Center, as articles.**

- **Where it lives:** under the existing `Ideas & vocabulary` shelf (`HELP_TOPICS[5]`), whose description already reads *"The words Patina uses on purpose — stamps, courts, the margin, the Engine — and why."* No new route, no new component, no new content model — Sanity articles under a prefix that already files correctly.
- **How it is reached:** the shelf on `/help`; a new ⌘K "Studio" row (`the-words` · label *"The words"* · sub *"what Patina calls things"*); and the help panel's existing `BROWSE ALL HELP →` footer.
- **What it is not:** an inline hover-term. `GlossaryTerm` is named in a doc comment, was never built, and should stay unbuilt — dotted underlines on every *margin*, *folio*, *stamp* would put permanent decoration on typography-first paper and nag on every read.
- **Entry shape:** term · one sentence in the desk's voice · where you meet it · what it is not. Five worked entries:

**The margin** — *The document's right edge, where decisions, messages, money, time, notes and field texts gather beside the work they belong to.* You meet it as the right column of any open document, headed `IN THE MARGIN`. Not a comment thread: one act in the margin updates every surface that item touches.

**Sheet (also: ledger)** — *A book that slides over the document in your hand without disturbing it.* You meet it as Orders, Accounts, Hours and The Post, each headed `PUT BACK · ESC`. Not a page you navigate to: you never lose your place opening one.

**Room** — *A place you walk into. Picking up a room puts down the document you were holding.* You meet them as the Library, People and The Scans; the Drafting Room exists only once a proposal does. Not a tab — there are none.

**Put down** — *Setting the document back on the desk. It is the only way out of one, and it stops the clock.* You meet it at the top of the spine, `← PUT DOWN`. Not saving: nothing in a document needs saving.

**Hands free** — *Time logging itself while a document is in hand — no timer to start, no timesheet to reconcile.* You meet it in the drawer, right of Find anything. It counts the paper you are holding, and Hours is where it lands.

---

## 5. Keyboard shortcuts

Today the only mechanism for teaching a shortcut is a chip inside the destination it is a shortcut *for*. That serves recognition and cannot serve acquisition. Three rungs:

**Rung 1 — keep the chips.** `G L`, `G P`, `G A` in the palette rows are correct and cost nothing.

**Rung 2 — `?` opens the keys sheet.** One new permanent surface, rendered as a `DocSheet` so R96's *"a sheet stays one page"* holds — no tabs, no internal navigation, zero shadow, two registers. It binds at window/capture with the *same* guard set `registry-shortcuts.tsx` already uses (ignored under any modifier, on editable targets, and when `anOverlayIsOpen()`). Also reachable as a ⌘K "Studio" row (*"The keys · what the keyboard does"*) and from the sheet-head `?` glyph's panel footer, which already exists on all four ledgers.

**Rung 3 — three progressive prompts, at the moment of repetition, once each.**
- The third mouse-open of a ledger in one session → *"– Orders answers to `G O`."* Recedes on first chord use.
- After the second button-submit in a ⌘⏎-capable composer → that field's placeholder permanently gains `⌘⏎ to post`. A label change, not a note, and it closes all six silent sites.
- First entry into the Board Room in edit mode → *"– This canvas takes the usual keys — undo, duplicate, arrange, zoom. `?` shows them all."*

No fourth prompt, ever.

**The keys sheet, laid out.** Doorway rows read from `registry.tsx`, so they cannot drift:

```
THE KEYS                                          PUT BACK · ESC
Everything here also has a door. The keys are the short way.

FIND
  ⌘K / Ctrl K        Find anything — documents, rooms, ledgers, verbs
  ↑ ↓                Move through the list
  ⏎                  Open the line
  Esc                Put the palette back
  ?                  This page

GO                   (press g, then the letter, within a moment)
  g l  Library                       g o  Orders
  g p  People                        g a  Accounts
  g r  The Scans                     g h  Hours
                                     g t  The Post

WRITE
  ⌘⏎ / Ctrl ⏎        Post a margin note, a thread note, or a board direction

THE BOARD ROOM
  p       Present               ⌘Z · ⌘⇧Z      Undo · Redo   (Ctrl Y on Windows)
  ⌘D      Duplicate             ⌘C · ⌘X · ⌘V   Copy · Cut · Paste
  ⌘L      Lock                  ⌘] · ⌘[        Forward · Back  (⇧ for front, back)
  ⇧T      Tidy                  Delete          Remove
  1       Fit to view           ⌘0 · ⌘+ · ⌘−   Zoom

IN A DOCUMENT
  Esc                Put it down
```

Every binding above is from `04-shortcuts-inventory.md` and confirmed in `06-fact-check.md`. ⌘⇧F (Tester Notes) is deliberately excluded — it is internal and flag-gated.

---

## 6. Other ways to learn

**Help Center content, in priority order.** The ~142 placeholders are the largest single lever in this whole proposal, and the shelf order on `/help` is not the authoring order.

*Tier 1 (~14 articles).* **Getting started** (`designer-portal/document/guide`): the five Featured articles already resolve and are good; add four — *How do I capture a lead?*, *How do I put a piece into a project?*, *How do I order and receive?*, *What can my first hire see and do?* And **The Desk & the Studio** (`.../desk`, `.../contents`, `.../command-bar`): three articles here delete the empty-panel moment in `08-help-panel.png`.

*Tier 2 (~20).* **How do I…** — the everyday moves a week-two learner searches for. And **Ledgers & money**: Orders, Accounts and Hours each already carry a wired `?` doorway on their sheet head, so an article per ledger lands on a door that exists.

*Tier 3 (~15).* **Ideas & vocabulary** — the glossary in §4.

*Tier 4.* **Your documents**, **Rooms**, **For your clients** — the last matters more than its position suggests: it is what the homeowner asks about in week two.

*And a retirement.* Cap the corpus near sixty authored articles and delete the surplus stubs. `isPlaceholderContent` hides them, but they still inflate a ledger nobody can act on, and 150 docs is a maintenance burden no two-person team should sign up for.

**Videos: yes — three, and not walkthroughs.** The PRD's ten are the wrong shape: video is the most expensive artefact to keep true against a product that re-cuts monthly, and the audience is time-poor by construction. `VideoPlayer` already exists in `packages/help-system/src/reference/VideoPlayer` with zero designer-portal call sites, so this is a content decision, not a build. Three, ninety seconds each, in a designer's hands rather than a narrator's:

1. **Lead to signed proposal** — the arc the entire product is about.
2. **Approved pieces to a purchase order to a received delivery** — the arc that carries the margin stream (VISION §3), and the one no written article makes legible.
3. **Capture** — the extension, because it is the only thing that lives outside the portal and cannot be taught in place.

Everything else stays written.

**The human channel is the strongest Patina has, and it is free.** Acquisition is 1:1 through Leah's network (VISION §2). Two touchpoints, both human, neither in-product — and this is where the instinct toward a practice project should go instead of into the software:

- **The sit, at signing.** Thirty minutes, not a demo: the owner brings one live client and puts them on paper while Kody or Leah watch and say nothing unless asked. The artefact is her real first document.
- **The hire handover**, the week the first hand starts. Twenty minutes, run by the owner rather than by Patina, with one printed page Patina supplies: the keys sheet plus five glossary entries.

**On a sample project — no.** A seeded practice document needs fake households, makers, money and a clock; it either lies to the R4 timer or needs a parallel timer path; it drifts out of date faster than anything else in the tree; and it must be visibly quarantined from the real Desk, which reintroduces the "two vocabularies for one thing" failure the review's second-palette finding warned about. She has a real first client inside her first hour. Teach on that.

---

## 7. Reuse / retire

| Existing surface | Verdict | Why |
|---|---|---|
| Desk Walkthrough (6 coachmarks) | **Change** | Four stops; drop *Rooms and ledgers* and *The studio drawer* (both describe permanently-visible, recall-free surfaces and scroll her away mid-tour); last stop hands over to Capture a lead |
| `WelcomeModal` | **Keep, re-copy** | Component is right; body should end on an act. Add the first-hire persona variant (persona is already a parameter) |
| `desk-first-touch` margin note | **Keep verbatim** | Best teaching object in the product; recedes correctly on first ⌘K |
| `desk-walkthrough-offer` margin note | **Retire** after the R97 cohort | It addresses *"New desk, same studio"* — a condition no new studio can be in |
| `MarginNote` primitive | **Keep, extend** | Five new keys (`doc-first-touch`, `hire-first-touch`, `first-proposal-sent`, `first-signature`, `first-order-ready`) plus version-suffixed keys for rot |
| Studio Setup Checklist | **Change** | Five rows that track the work, not account admin — making its own footer true |
| `StudioSetupWhisper` | **Keep exactly** | Owner-only, ≥2 open, one Playfair line, no badge — the correct model for a recurring nudge |
| `GuidedEmptyState` (6 sites) | **Keep, instrument** | Good copy; wire `help.empty_state.shown` / `.cta_clicked`, which the taxonomy defines and no site fires |
| Contextual help panel | **Keep, fill** | Mechanism is sound; give the Desk a blurb and articles so it stops rendering an empty room |
| `/help` Help Center | **Keep** | Structure is right; the shelves need Tier-1 content before any layout change is worth arguing about |
| ⌘K palette | **Keep, two rows** | Add `the-keys` and `the-words` to the Studio group; cap stage rows for new accounts so `BEGIN` clears the fold |
| Desk Contents block (R95) | **Keep, one line** | Add the room-vs-sheet physics line the tour currently spends a coachmark on |
| `g`-chords | **Keep, teach** | The keys sheet plus one repetition prompt |
| ⌘/Ctrl+Enter (6 silent sites) | **Change** | Add `⌘⏎ to post` to each placeholder — a label, not a note |
| Board Room shortcut set | **Keep, document** | Thirteen-plus bindings, zero legend; the keys sheet is the whole fix |
| `first-signin-tour.tsx` | **Retire, delete** | 280 lines, zero mounts, actively misleads contributors |
| `09-help-guidance.md` (FirstSigninTour section), `CODEBASE-MAP.md` as a nav source | **Retire as current-state** | Both describe a portal that no longer exists |
| Email drip (17 letters) | **Change** | Condition each letter on its act not having happened; re-point Post notes at the surface they teach; drop E9 from the onboarding track |
| ~142 Sanity placeholders | **Retire the surplus** | Author ~60; delete the rest |
| `VideoPlayer` (package) | **Keep, finally use** | Three films, not ten |
| `GlossaryTerm` (doc comment only) | **Do not build** | The glossary is articles on an existing shelf |

---

## 8. How we'd know it works

Never engagement. The question is always *can she now do the thing again, unaided* — and a rising help-read rate on the studio surface is a defect signal, not a win.

**Available today:** `document_walkthrough_started`; `help.tour.started / step_viewed / step_advanced / completed / abandoned / replayed`; `document_margin_note` (`{key, action}`); `document_help_opened` (`{surface_key, source}`); `document_wayfinding_door_opened` (`{key, weight, source}`); `document_wayfinding_room_entered`; `document_command_bar_opened / _queried / _zero_result / _selected`; `document_desk_contents_acted`; `help.help_center.viewed`; `help.article.opened`; `help.search.performed / result_clicked`; `help.empty_state.shown / cta_clicked` (defined, unfired); `studio_created`; `teammate_invited`; `invitation_accepted`; `zone_flight`.

1. **A real client on paper in the first session.** `help.tour.completed` or `welcome_modal.action` = skip, followed by a lead created in the same session. Target behaviour: she leaves minute one holding her own work, not six memorised names.
2. **Time from `studio_created` to first proposal sent, and to first invoice drawn.** These two acts gate both revenue streams (VISION §3). Target: both inside week one. The alarm is regression, never a growth curve.
3. **The second unaided repeat.** *New event required:* `document_first_act` `{act: 'lead' | 'proposal_sent' | 'po_sent' | 'invoice_drawn' | 'delivery_logged', nth}`. The signal is `nth: 2` in a session carrying no `help.*`, `document_help_opened` or `document_margin_note` event. That is competence; everything else is exposure.
4. **`document_command_bar_zero_result`, falling.** Already instrumented. A rising rate names vocabulary the alias table does not carry. Target under 5% of queries, every zero-result string reviewed monthly as an alias candidate — cheaper and truer than any article.
5. **`document_wayfinding_door_opened` with `source: 'shortcut'`, per active designer.** The only honest measure of whether a shortcut was learned; plausibly zero for everyone today. Target: non-zero for the owner by week four. A floor to clear, not a rate to maximise.
6. **`acted ÷ shown` per margin-note key.** A note whose named action never fires teaches the wrong move. Target above 50% for `desk-first-touch`; under 20% gets rewritten or removed. This makes R94's contract auditable rather than asserted.
7. **Help opens that land on nothing.** *New property required:* `article_count` on `document_help_opened` (or fire `help.empty_state.shown` from the panel). Target: zero. The Desk is one such surface today.
8. **`zone_flight` stays at zero for new studios.** The legacy portal is the honest failure detector — the event that caught Leah — and stays watched until those routes are gone.
9. **The first hire's first act, day one.** `invitation_accepted` → a document opened → a write, inside her first session. Pair existing events; nothing new needed.
10. **Stated anti-metrics.** No target for sessions, session length, DAU, tour replays, or help reads on the studio surface. An onboarding programme that quietly optimises any of these has broken the promise it exists to serve.

---

## 9. Open questions and decisions for Patina's team

1. **Does a Member see a different Desk than a Designer?** UNVERIFIED (briefing 02 §6 — no role branch found in the roster query, but no signed-in walk was done). The first-hire copy and the *What can my first hire do?* article both depend on the answer.
2. **Is the seventeen-letter drip sending in production?** UNVERIFIED. If not, the week-one reinforcement layer does not exist today and Tier-1 help content becomes more urgent, not less.
3. **Video hosting.** Still open per the PRD, and it now blocks three films rather than ten. A cheap ruling with a real payoff.
4. **May the tour's last step open a Verb?** It ends the tour and opens `CaptureLeadSheet` over `/desk`, never routing into `/doc/[id]`, so R4 stays honest — but it departs from "a tour never acts" and wants a ruling in DECISIONS.md's idiom.
5. **Cap the Sanity corpus near sixty and delete the surplus placeholders?**
6. **May a margin-note key be re-armed when its surface is re-cut?** The one place this proposal bends R94's *appears once, for good* — and the answer R94's own risk note asks for.
7. **Mobile.** The walkthrough is desktop-only (≥980px) and writes no state below it; a first hire arriving on a phone gets nothing at all. Acceptable for the next twelve months given VISION §1's ranking, or does her arrival need a mobile answer?
8. **`?` as a global single-key binding.** It collides with nothing today and reuses the `registry-shortcuts.tsx` guard set, but it is the first single-key global outside the `g`-chord family and the Board Room. Confirm the guards suffice before it ships.
