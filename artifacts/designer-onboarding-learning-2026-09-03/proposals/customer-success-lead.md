# The two learners

## A customer-success proposal for the designer portal's onboarding and learning experience

Written from the customer-success chair: the owner → first-hire handoff, the setup checklist as a shared to-do, what I would say on a call, the signals that summon a human, the drip as an instrument, and the moment a studio owner quietly goes back to the tool she already knows.

Audience ruling (Kody, 2026-09-03): the learner is a growing studio's **owner** and her **first hire**. Leah's studio is the reference.

---

## 1. Diagnosis — what the owner and her first hire fail to learn today

**The product does not know there are two of them.**

`desk-walkthrough.tsx` passes `persona="designer"` to both the WelcomeModal and the TourController, hard-coded at lines 453 and 462. There is one welcome, one set of six coachmarks, one voice. But the two people have opposite jobs on day one. The owner is trying to find out whether her real work fits inside this thing. The hire is trying to find out what is hers to touch without breaking something her boss will have to fix. Neither question is answered by "Every live job lands here, one line each, grouped by stage."

**The handoff has no state.** The Studio Setup Checklist (`lib/document/studio-setup.ts`) fills its "Invite your crew" box when `memberCountBeyondSelf > 0` — that is, when an invitation is *sent*. Nothing in the derivation knows whether the hire accepted, landed on `/desk`, or ever opened a document. From a CS standpoint that is the single most expensive blind spot in the system: the moment that defines the customer (VISION §2 — "the moment it adds its first hands") is the one moment with no reading.

**The checklist is private, buried, and flag-gated.** It lives on the Account sheet's STUDIO page, reached by clicking the nameplate at the far right of the drawer — and per `nav-labels.md` and screen `06a-account-sheet.png`, that STUDIO page only exists when `studio-workspaces` is on. On a studio without the flag, the studio's own to-do list is not reachable at all. Even with it on, the hire cannot see it, cannot help with it, and cannot be handed a row of it. The owner's only ambient signal is the whisper — *"The studio isn't fully set up."* — which is owner-only and requires two or more open steps (`studio-setup-whisper.tsx`).

**The first hire's first day is code-identical to a returning designer's Tuesday.** Briefing 02, journey 6, step 9 says it plainly: "there is no separate 'first document' onboarding path distinct from what every returning designer sees." She lands on `/desk` after a 350ms success screen, into a Desk showing sixteen live jobs that belong to someone else, with no statement of what she was brought in to do. The tour she may then be offered never mentions the studio she just joined, the person who invited her, her role, or a single boundary.

**The first-run moment is fragile and desktop-only.** The auto-modal gate requires `window.matchMedia('(min-width: 980px)')` — a hire opening the invite email on her phone, which is the likeliest first contact, gets no tour and writes no state. And any close without a CTA outcome (Esc, backdrop, "Skip") writes `{ abandoned: true, atStep: 0 }` to a cross-device record that "never re-offers on any device." One stray keystroke in minute one permanently spends the studio's one teaching moment. Meanwhile the `desk-first-touch` margin note persists to `localStorage['patina:margin-note:<noteKey>']` — device-local — so the quiet fallback is the thing that repeats across devices while the deliberate tour is the thing that never comes back. That is exactly backwards.

**The help doors open onto empty rooms.** Screen `08-help-panel.png`: opening ⌘K → "Help… / about this surface" on the Desk gives *"No articles for this surface yet."* The PRD's own figure is "~142 of the ~150 Sanity docs are still literal 'PLACEHOLDER — pending Leah review' stubs," and `isPlaceholderContent` correctly hides them, so a designer who follows the product's advice arrives at nothing. The Help Center's Featured section is CSS-hidden when its list is empty. The one thing reliably behind "Browse all help →" is a replay of the tour she just took.

**Nothing teaches the keys.** Per briefing 04: the only mechanism in the product for teaching a shortcut is a trailing chip inside ⌘K rows (`G L`, `G P`) — which requires already being inside the thing the chord is an alternative to. The Board Room carries thirteen-plus bindings (undo, redo, clipboard, z-order, lock, tidy, present, zoom) with no legend anywhere. For a busy owner training a hire, that gap converts directly into interruptions to her own day, which is the one currency VISION §2 says she has none of.

**And the churn evidence is not about the first hour at all.** The 2026-07 discoverability review records Leah fleeing to the legacy `/portal` at least twice in two structured sessions — *"Loves where this is going — but still needs the complete functionality available in the portal."* She did not fail on the modal. She failed on day-40 wayfinding, after any first-run moment had faded, on a task she knew was possible and could not find a door for. The `zone_flight` event had been recording every escape the whole time, unread. That is not a product defect; it is a customer-success defect. No person's job was to read it.

---

## 2. Principles

1. **Teach the studio, not the user.** The account is one studio with two people in it at different distances from the work (VISION §2). Every teaching object should ask which of them it is for and be correct for both or explicitly for one.
2. **Nothing recurs.** Every teaching object appears once and recedes on use or dismissal — the `margin-note.tsx` contract, stated to the reader as *"Appears once · Recedes on use"* (R94). A recurring nudge would violate VISION §4's "you won't notice Patina."
3. **The ambient hundred hours beat the first hour.** The review's own finding, and the reason R93/R94 exist. Investment goes to the palette, the registry blurbs, the contents block, and the margin — not to a bigger tour.
4. **One registry, one word.** Any copy naming a room, ledger, or verb reads `registry.tsx`'s `help.blurb`, never re-types it (registry canon note; the file is data-only).
5. **A human closes a stuck studio; the product does not chase.** Acquisition is 1:1 through Leah's network (VISION §2), so the recovery motion is allowed to be human where the surface must stay quiet. Escalate to a call, never to a second nudge.
6. **The checklist derives; it never demands.** *"The marks follow the work. Nothing on this list is something you tick — do the thing and the box fills."* That footer is already the right philosophy; extend it, don't replace it.
7. **Teaching state belongs to the person and travels.** `profiles.help_state` (migration 00146) already does this for tours and the provider already sweeps localStorage into it. Margin notes should ride the same rail.
8. **No new chrome.** Playfair-italic for teaching prose, DM-mono for structure, zero shadows (D4), no badges or pulsing counts (D8), and the Strata Mark as the only sanctioned progress device (R15/R35).

**Feature test (VISION §8), answered explicitly.** Surface: The Document. Studio moment: the first-hire trigger itself — the exact moment §2 names. Stream: neither directly; it gates activation into both. Promise: "you won't notice Patina," which is why nothing here recurs.

---

## 3. The experience by moment

### Minute 1 — first sign-in (the owner)

*She is trying to find out whether her actual work fits in here.*

**Carried by:** the existing WelcomeModal + six coachmarks (`desk-walkthrough.tsx`), unchanged in structure. **Changed:** one body, and the persistence rail.

Keep the modal exactly as written — *"This is your Desk"* / *"Every client's project is one document, and every document lives here. Six stops, about a minute, and you'll know your way around. You can leave at any step."* It is a minute, it is honest about being leaveable, and it is in voice.

Retune step 6 only, so the tour ends on the studio rather than on a feature:

> **Begin with a lead** — "Every project begins as a captured lead — a name and a note, under a minute. When your first hire joins, she lands on this same Desk; you won't have to teach it twice."

**New (small):** move margin-note seen-state from `localStorage` into `profiles.help_state` alongside tours, using the sweep the `HelpStateProvider` already performs. A note called "appears once" should mean once per person, not once per browser.

**New (small):** a close without a CTA outcome should write `abandoned` but keep the replay doors visible — they already exist (the ⌘K "Take the walkthrough" row and the Help Center pinned row). No copy change; a decision to treat abandonment as "later," not "never."

### Day 1 — the owner's first working session

*She is trying to get two real jobs in and decide whether to bring anyone else in.*

**Carried by:** the Studio Setup Checklist and the whisper, both existing.

**Changed:** ungate the checklist rows from `studio-workspaces` so the studio's own to-do list exists on every studio. Change row 3 to derive on **acceptance**, not invitation — `crewInvited` becomes true when a teammate has an accepted membership, which the `accept_workspace_invitation` RPC already produces. Add one derived row, in the same fill-when-done idiom:

> ☐ **Your first hire opened a document**

That row is the whole thesis of the product stated as a to-do, and it is the row a CS person watches.

**New:** one margin note on the Desk, keyed `desk-first-hire`, reusing the inline-CTA idiom already at `desk/page.tsx:339–358`. Shown only when the viewer is the owner, `memberCountBeyondSelf === 0`, and at least one project is live:

> *— Two jobs are running now. When the next pair of hands arrives, they land on this same Desk with the same doors. **Invite your crew**.*
> APPEARS ONCE · RECEDES ON USE

**CS touch:** the **setting-up call**, thirty minutes, owner alone, day 0–2. What I would say: *"We're not going to tour anything. Open the two jobs you've thought about most this week and we'll put them in — and if something you do every day has no door here, I want to hear the sentence you'd use to look for it."* That sentence is the alias list for `matchSurfaces()`, harvested at the only moment she'll say it out loud.

### Week 1 — the owner alone

*She is trying to run a real job end to end without falling back.*

Ambient only. The `desk-first-touch` note has receded on her first ⌘K. What teaches from here is the Desk's "The Studio" contents block (visible in `03-walkthrough-step-3.png`: Rooms / Ledgers / Begin with sublabels), the ⌘K groups, and the sheet-head `?` glyph (`HelpGlyph`, `overlays/doc-sheet.tsx:175`) which already routes into the contextual panel per surface.

**Changed:** the drip stops running on a calendar. E2–E9 should send only when the studio has *not yet* done the thing the email teaches, at most one a week. An email that teaches Capture to someone who captured on Tuesday is the definition of noticing Patina.

**CS touch:** none scheduled. A person reads her wayfinding events at the end of week one and reaches out only if the stuck signals in §8 fire.

### The first hire's first day

*She is trying to find out what is hers, and not break anything.*

**Carried by:** the same six anchors, the same TourController, a second persona. The `persona` prop already exists on both call sites; only `'designer'` is wired. Add `'teammate'`, selected when the signed-in person's membership role is not `owner`. No new component, no new mechanism, and the `coachmarkContent` Sanity schema already carries per-persona copy.

Proposed teammate bodies, same anchors, same order:

| # | Anchor | Heading | Body |
|---|---|---|---|
| 1 | `desk-needs-your-hand` | The Desk | "Every live job in the studio lands here, one line each. A mark at the margin means someone's hand is needed — not always yours." |
| 2 | `desk-folio` | One client, one document | "Each client's work is one document, brief through care. Pick one up and the studio sees what you did in it." |
| 3 | `desk-contents` | Rooms and ledgers | "The Library and People are rooms you walk into. Orders, Accounts, Hours slide over as sheets — Esc puts them back." |
| 4 | `studio-drawer` | The studio drawer | "The studio's doors, always at the bottom. Hours log themselves while a document is in hand, so time you spend here is time the studio can bill." |
| 5 | `desk-find-anything` | Find anything | "⌘K reaches any folder, person, or book by name — try 'invoice'. Type a question and it answers there too." |
| 6 | `desk-capture-lead` | Begin with a lead | "Anything you begin here belongs to the studio, not to you. Start where you're asked; the rest keeps." |

Steps 3 and 5 are unchanged from today's copy — they were already right for anyone.

**Changed:** the accept-invite success screen (`PortalAuthSuccess`, 350ms before `window.location.replace('/desk')`) is the only place in the product that knows she was invited by a person into a named studio, and it says nothing. Give it one line:

> **You're in — {studio name}.** From here, her desk and yours are the same desk.

**New (email, not product):** **H0 — teammate-welcome**, sent the morning after `invitation_accepted`, in the **owner's** name rather than Kody's, on the model of the T0 invite's `{{personal_observation}}` token. One paragraph, one link to `/desk`, no feature tour.

**CS touch:** the **handoff call**, twenty minutes, owner and hire together, the day the hire accepts. This is the one moment in the whole journey with no product analogue and no way to make one. Beats: who the studio is; what she may touch (Designer versus Member — `teammate_type` controls `studio_designer`, and nobody has ever explained the difference to a customer); the three verbs she will actually use this month; and one sentence from the owner naming what she wants off her plate. That last sentence is the activation event. If the owner cannot say it, the studio is not ready to delegate and no onboarding will fix it.

### Ongoing

*Both of them are trying not to think about Patina.*

Nothing recurring ships. Ongoing learning is entirely ambient and already built: the registry blurbs in the contextual panel, the `G L`-style chips in ⌘K, the `?` glyph on every sheet head, and the "This surface" ⌘K group that appears with a document in hand.

Two additions, both inside existing surfaces:

- A **Keys** block at the foot of the contextual help panel, printed from the registry's own `shortcut` field for the surface in hand — so the Orders sheet's panel prints `G O` and the Board Room's prints its editing set. Content source: the registry, per principle 4.
- One new ⌘K Studio row, alongside the eight that exist: **"The keys" · shortcuts, one page** → the Help Center article in §5.

**CS touch:** a weekly read of the wayfinding events by a named person, and the week-six letter — E10, "Six weeks in," which already exists with a personalized `{{firsts_summary}}`. It is the right close and needs no change.

---

## 4. Navigation and vocabulary

The Desk → Document → Rooms / Sheets / Verbs model is already taught three times over, by recognition rather than recall: coachmark step 3 names the two weights and their physics; the Desk's standing "The Studio" block prints all three columns with sublabels (`desk-contents.tsx`, R95, visible in `03-walkthrough-step-3.png`); and ⌘K's group headings repeat the same shape from the same registry. That is a good system and I would not add a fourth telling of it.

What is untaught is the **vocabulary**, and vocabulary is where a first hire stalls silently. "Put down." "In hand." "The margin." "Stamp." "Facet." "Folio." "The Post." "The record." A hire who does not know that a sheet stays over the document and a room puts it down will not ask; she will click and find out, and what she finds out is that she lost her place.

**Position on a glossary: yes, and it already has a home.** Help Center shelf six — *"Ideas & vocabulary — The words Patina uses on purpose — stamps, courts, the margin, the Engine — and why"* — is the glossary, already labelled, already described, already routed (`help-topics.ts`; `/help/topic/[prefix]`). Entries author under the `concept/` prefix, which `help-topics.ts` already describes as a CMS-only authoring namespace. It needs no new surface, only content.

It is reached four ways that all exist: `/help` → the shelf; ⌘K → "Browse the Help Center"; the contextual panel footer "Browse all help →"; and — the one change — **a dry ⌘K query should offer the Help Center row above "Ask the Engine."** R93's own text specifies that a dry query "recovers to the Help Center rather than going silent." Someone typing "stamp" into ⌘K is asking the glossary a question.

**Entry shape:** three lines. The word, in Playfair. One plain sentence. One DM-mono line naming where you meet it. Where the word is a registry surface, the sentence is its `help.blurb`, read, not retyped.

| Entry | Plain sentence | Where you meet it |
|---|---|---|
| **In hand** | The one document you have open; time logs itself against it while you hold it. | THE DRAWER · HOURS |
| **Put down** | Closing a document and going back to the Desk. Rooms put it down for you; sheets don't. | THE SPINE · TOP LEFT |
| **The margin** | The document's right edge, where decisions, messages, money, and notes gather beside the work they belong to. | ANY DOCUMENT · RIGHT |
| **Sheet** | A book that slides over whatever you're holding and puts itself back on Esc. Orders, Accounts, Hours, The Post. | THE DRAWER · LEDGERS |
| **The Post** | Letters and the record — what arrived, what needs review. | THE DRAWER · THE BELL |

The last entry's sentence is `registry.tsx`'s `the-post` blurb verbatim. That is the discipline: the glossary is a reading of the registry, not a second copy of it. It also closes failure class 3 from the review — the bell whose name appears nowhere on screen.

---

## 5. Keyboard shortcuts

**No `?` overlay.** A shortcuts modal is a new chrome surface, a new mechanism, and a fifth place the same facts live. Three carriers that already exist do the job.

1. **The chips stay.** `G L`, `G P` trailing chips in ⌘K rows are recognition-in-place and work well for the person already in the palette.
2. **The panel learns the keys.** The Keys block described in §3, printed from the registry, teaches the chord *on the surface it opens* — including the Board Room, whose thirteen bindings are today the single largest undocumented surface in the product.
3. **One page, one row.** A single Help Center article under the `guide/` prefix, pinned to the Getting started shelf, reachable from a new ⌘K row: **"The keys" · shortcuts, one page**.

**No progressive prompts**, with one optional exception. R94's contract and VISION §4 both argue against a system that watches you and speaks up. If the team wants one, it should be exactly one and it should obey the margin-note contract: a second and final Desk note, keyed `desk-the-keys`, shown once after the fifth ⌘K open, reading *"— Most doors have a two-key name. **The keys**, one page."* Appears once, recedes on use, never again. That is the only progressive prompt I would sign off on.

### Proposed cheat sheet — "The keys"

One article page, four DM-mono blocks, no shadow, no chrome.

**Everywhere**
`⌘K` / `Ctrl K` — find anything · `Esc` — put it back · `↑` `↓` — move · `Enter` — choose

**Doors — press `g`, then:** *(1.2 seconds to finish the pair)*
`g l` Library · `g p` People · `g r` The Scans · `g o` Orders · `g a` Accounts · `g h` Hours · `g t` The Post

**Writing**
`⌘⏎` / `Ctrl ⏎` — saves a margin note, a note on a thread, a note on a board, a direction

**The board room**
`p` present · `⌘Z` undo · `⌘⇧Z` / `Ctrl Y` redo · `⌘D` duplicate · `⌘C` `⌘X` `⌘V` copy, cut, paste · `⌘L` lock
`⌘]` forward · `⌘[` back · `⌘⇧]` `⌘⇧[` front, back · `Delete` remove · `⇧T` tidy
`1` fit · `⌘0` reset zoom · `⌘+` `⌘−` zoom

**The walkthrough**
`Enter` next · `Esc` skip

(`⌘⇧F` — leave a note — exists but is internal, behind the `tester-notes` flag; it does not belong on a customer page while that is true.)

Every binding above is from `04-shortcuts-inventory.md`, verified against source. The article should read the door chords from the registry at render rather than being typed, so a re-chord never leaves a lying page — this is the content-rot risk R94 itself names.

---

## 6. Other ways to learn

### Help Center — content plan for the eight shelves

Roughly 142 of 150 Sanity docs are placeholder stubs, invisible by design. The instinct is to fill them. The CS answer is to **write about 58 and delete the rest** — a stub that never resolves is worse than an empty shelf, because it makes the authoring queue look like progress.

Order of authoring, by how much legacy-portal flight each shelf prevents:

1. **Getting started** — nearly done. The five Featured articles rendered locally with real answers (screen `07-help-center.png`): *What is the Desk? · How do I send a proposal and get it signed? · How do I invoice and get paid? · What is the margin? · What does my client actually see?* Publish these first; the Featured section is CSS-hidden until they exist, so this single act turns the Help Center's own front page on. Add "The keys."
2. **How do I…** — about twelve short answers: one per Verb, plus the moves the review's parity matrix marked ABSENT (vendor creation, invoice settle / void / print, scope changes). These are literally the tasks Leah left for. Highest churn value per word in the whole plan.
3. **Ideas & vocabulary** — the glossary, ~20 entries, per §4.
4. **Ledgers & money** — four, one per ledger, each an expansion of its registry blurb.
5. **The Desk & the Studio** — three: the Desk, the Studio contents block, ⌘K.
6. **Your documents** — seven, one per section, Brief through Care.
7. **Rooms** — four.
8. **For your clients** — three. Lowest-frequency, highest-stakes: it is the shelf the owner forwards to her hire *and* the one that keeps her from over-promising to a homeowner.

### Videos

**Yes — three, not ten.** The PRD's ten walkthroughs are blocked on an unresolved hosting decision, and Sanity has no `videoContent` schema (five schemas were built; that was not one). Three ninety-second screen recordings in Leah's voice, on the three revenue-bearing chains a first hire is asked to run alone:

1. A lead to a signed proposal.
2. Approved to ordered to received.
3. Draw an invoice, and get paid.

No interface tour on video — the six coachmarks do that better and in less time. Until the schema and hosting land, these live as articles with an embed.

### Email drip alignment

The seventeen-email deck is a good asset misaligned in two ways.

- **Retime.** E2–E9 fire on state, not on days: an onboarding email sends only when the studio has not yet done the thing it teaches, one a week maximum. M1–M4 already work this way; extend the pattern rather than invent one.
- **Add two, no more.** **H0 — teammate-welcome** (to the hire, morning after acceptance, in the owner's name). **O1 — owner-handoff** (to the owner when an invite is unaccepted at 72 hours: *"Your invitation to {name} hasn't been opened."*). Both are handoff instruments; the deck currently has none.
- **Keep** the ten in-app Post notes, and keep W0's *"Replay the walkthrough anytime from the Help shelf"* as the only place a replay is advertised outside ⌘K.
- **Keep** T0/N1/N2 untouched. The `{{personal_observation}}` token in the invite is the warmest thing in the system and the model for H0.

### In-person and CS touchpoints

Four human touches, none automated, all justified by VISION §2's 1:1 acquisition:

| When | Who | Length | Purpose |
|---|---|---|---|
| Day 0–2 | Owner | 30 min | Put two real jobs in. Harvest the sentences she'd use to search. |
| Day the hire accepts | Owner + hire together | 20 min | Roles, boundaries, three verbs, and the owner's one sentence about what she wants off her plate. |
| Week 3 | CS alone, no call | — | Read the wayfinding events. Reach out only on a stuck signal. |
| Week 6 | E10 letter | — | Already written. Close the drip. |

**Stuck signals that summon a person** — not a second nudge:

- an invitation unaccepted at 72 hours;
- a studio with three or more live jobs whose hire has held no document after seven days;
- a document picked up and put down three or more times with nothing written;
- a `document_command_bar_zero_result` on a term that maps to a real capability (each distinct term is a CS work item and an alias candidate, not a metric);
- any `zone_flight`, ever.

---

## 7. Reuse / retire

| Existing surface | Verdict | Why |
|---|---|---|
| WelcomeModal + 6 coachmarks (`desk-walkthrough.tsx`) | **Keep, change one body** | Right length, right voice, correctly leaveable. Only step 6 is owner-shaped. |
| `persona` prop on TourController / WelcomeModal | **Change** | Hard-coded `'designer'` at lines 453 and 462. Adding `'teammate'` is the cheapest high-value change in this proposal. |
| `FirstSigninTour` (`components/help/first-signin-tour.tsx`) | **Retire — delete** | Zero imports; its five anchors target `(portal)` zones deleted at the R21 dissolve; its presence makes the 09-help-guidance PRD read as current. |
| `desk-first-touch` margin note | **Keep, change persistence** | Best-written teaching object in the product. `localStorage` makes "appears once" false across devices; move to `help_state`. |
| `desk-walkthrough-offer` margin note | **Keep** | The existing-designer offer pattern will be needed again at every re-cut. |
| `StudioSetupWhisper` | **Keep unchanged** | The correctly-gated exception: owner-only, two-open minimum, one line, no chrome. |
| Studio Setup Checklist | **Change** | Ungate from `studio-workspaces`; derive row 3 on acceptance; add "Your first hire opened a document." |
| `GuidedEmptyState` (6 sites) | **Keep, extend** | Correct idiom, under-deployed — the Library's "Nothing captured yet" and the rooms with none should use it. |
| `@patina/help-system` `EmptyState` (2 sites) | **Retire from this portal** | Two call sites, no visible copy source, duplicate of the above. |
| Help Center `/help` | **Keep** | Structure is right. It is starving, not broken. |
| Contextual help panel (`document-help.tsx`) | **Keep, add Keys block** | Says "No articles for this surface yet" on the Desk today. Registry blurbs plus keys make it non-empty everywhere on day one. |
| `registry.tsx` `help.blurb` | **Keep — content source of record** | Already carries one teaching line per surface. Extend it rather than opening a parallel source. |
| ⌘K populated palette | **Keep, add one row, restore recovery** | Add "The keys." A dry query should offer the Help Center above "Ask the Engine," as R93 specifies. |
| `g`-chords (`registry-shortcuts.tsx`) | **Keep, document** | Good mechanism, invisible. The panel Keys block and the article fix it without touching the code. |
| Board Room shortcut set | **Change — document only** | Thirteen-plus bindings, no legend. Same Keys block, no new surface. |
| The 17-email drip | **Change** | State-triggered instead of calendar-triggered; add H0 and O1. |
| 10 in-app Post notes | **Keep** | Short, deep-linked, in voice. |
| ~142 Sanity placeholder docs | **Retire the ~84 not in the §6 plan** | An unresolvable stub is invisible anyway and disguises the real content debt. |
| `zone_flight` | **Keep — assign an owner** | The largest lesson of the 2026-07 review is that this ledger existed and nobody's job was to read it. |

---

## 8. How we would know it works

Mapped to events that exist today (`document_*` in `lib/analytics/document-events.ts`, `help.*` in `packages/help-system/src/analytics.ts`, `studio_created` / `teammate_invited` / `invitation_accepted` in `studio-events.ts`).

| Signal | Events | Target behaviour |
|---|---|---|
| The handoff completes | `teammate_invited` → `invitation_accepted` | Accepted within 72 hours. This is the activation metric for a studio, and it is the only funnel I would put a number on. |
| The hire works, not watches | `document_wayfinding_room_entered` + a first authored write, within her first 7 days | She holds and changes one document in week one. |
| Recall replaces the tour | `document_wayfinding_door_opened` with `source: 'shortcut'` as a share of that person's total door opens | Rising month 2 over month 1. Measures whether the ambient layer taught anything; no target number. |
| The palette stops going dry | `document_command_bar_zero_result` | Trending to zero per person. Each distinct dry term is a work item — an alias, an article, or a real gap — not a score. |
| Flight stops | `zone_flight` | Zero. Every non-zero read by a person within a week. This is the churn instrument. |
| Help resolves rather than deflects | `document_help_opened` on a surface, followed in the same session by an action on that surface rather than a put-down or a flight | Opening help ends in doing the thing. |
| Setup completes without being chased | `document_margin_note` (`key: 'desk-first-hire'`, `action: 'acted'`) and the checklist's derived rows | The note is acted on rather than dismissed. |

**One new event.** `document_first_authored` — fired **once per person**, on their first write into any document. Deliberately once-per-person so it cannot become an engagement measure; it is a state, not a count.

**One new property.** Add `role` to `invitation_accepted`, so the handoff funnel can separate a Designer hire from a Member — the invite modal already collects `teammate_type` and `member_role` and nothing downstream reads them.

**Never measured, and we should write it down somewhere permanent:** sessions, time in app, DAU or WAU, tour completion rate as a goal, help-article views as a goal, drip open rates as a goal. `help.tour.abandoned` is allowed to be high without alarm — a studio owner who skips a tour and then never flees to the legacy portal is the success case, not the failure case. VISION §6 refuses engagement metrics as a success measure for the studio surface, and a CS function is exactly where that refusal usually erodes first.

---

## 9. Open questions and decisions Patina's team must make

1. **Does teaching branch on role or on capability?** The invite modal collects both `teammate_type` (Designer / Member) and `member_role` (member / admin / guest); nothing downstream uses either for teaching. I propose branching only on owner / not-owner. Needs a ruling.
2. **What is a `guest`?** It is a valid `member_role` with no described concept anywhere in the briefing. Does a guest see the Desk at all, and does she get any teaching?
3. **Does the Studio Setup Checklist ship without `studio-workspaces`?** Today the Account sheet's STUDIO page — the checklist's only home — is flag-gated, so on a flagless studio the checklist does not exist. Intended, or an accident?
4. **Mobile first-run.** The tour gate requires ≥980px, and an invite email is most likely opened on a phone. Either a mobile first-run is in scope, or the honest answer is "the Desk is a desktop instrument" and the invite email should say so.
5. **Video hosting, and the missing `videoContent` schema.** Three videos or none. Until this lands, "10 video walkthroughs" should stop appearing in plans as if it were queued work.
6. **Fill or delete the remaining placeholders?** I recommend delete. It is a one-line decision that changes how the content debt reads for the next year.
7. **Who owns the flight ledger?** Not which dashboard — which person, and on which day of the week. Everything in §8 fails without this.
8. **Is an onboarding email an engagement instrument?** I read the drip as out-of-surface and therefore compatible with VISION §4, but it is the only recurring mechanism in the whole system and deserves an explicit ruling rather than an assumption.
9. **The Pledge must appear nowhere in any onboarding asset** until counsel clears it (VISION §3). The seventeen-email deck was not read in this pass — **UNVERIFIED** whether any of it carries Pledge language. Someone should check before the next send.
10. **Who signs the H0 email?** It is written in the owner's name but sent by Patina's system. That is the right instinct and also the kind of thing a studio owner should be asked about once, plainly, rather than discovered.
