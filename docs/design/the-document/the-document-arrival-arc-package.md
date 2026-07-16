# The Arrival Arc — handoff package for Claude Code

*2026-07-16 · design authority → implementation authority*
*Pairs with: `match-ceremony-prototype.html` (look/feel authority — port intent, never markup). Both files land in `docs/design/the-document/` together with this package.*

---

## Part A — the append-ready DECISIONS.md block

The ruling below has **not** yet been appended to the repo log — this session ran without repo access. Landing steps: run `scripts/workstream_state.py` for the true next R-id, replace the `R{next}` placeholder, append via `scripts/append_entry.py --entry`, diff-confirm, re-run `--commit`. The script restores the integrity footer; never hand-edit it.

> ### R{next} · The Arrival Arc — accept, ceremony, introduction, discovery — 2026-07-16
>
> **Resolves punch items P4 (designer intro on match), P5 (accept's destination), P7 (scheduling the discovery introduction). Session run against the live portal walkthrough of 2026-07-15/16; triage doc `designer-portal-punch-list-triage.md`.**
>
> **The problem.** A client scans a room, asks for help, and a designer says yes — and today the yes goes nowhere. The designer stays parked on the request page; no introduction exists; the "Schedule the discovery call" chip names an act it cannot perform (an R22 violation in the current build — the chips are inert text with no href). This is the client's first minute with a human designer and the portal treats it as a status change.
>
> **The ruling: accept is a threshold, not a button.** The arc is — request card → accept → **the Match Ceremony** → introduction sent with offered times → in-motion chip while she considers → she picks → Discovery, scheduled, inside the Document.
>
> **1 · Accept claims immediately.** On accept the request is claimed and the client's iOS app shows a held state at once: *"Middle Studio has taken your request in hand — introduction on its way."* Truth-framed: it reports what happened, it does not speak in the designer's voice. No client sits claimed and greeted by silence, and the system never impersonates her hand.
>
> **2 · The Match Ceremony (new surface).** Full-screen, typography-first, zero shadows. It was considered as a lighter Desk-card flip and rejected: the arrival deserves weight, and the ceremony gives the intro and the scheduling one home instead of splitting the moment in two.
>
> - *What it presents — meet the client.* Name, their ask verbatim, the scanned room (scan preview), style tags and types, budget band, room type. The request payload honored as an arrival, not a form.
> - *What it asks — the designer's hand.* A scaffolded composer: a context line assembled from the payload ("Elena scanned her living room · leans warm-minimal · 25–40k") sits above; the words below are hers. Nothing pre-written, nothing auto-sent. Optional voice-note attachment.
> - *The offered times.* She picks 2–3 concrete slots, manually in v1 — no calendar dependency. Scheduling rides inside the introduction; one moment, not two.
> - *The threshold act.* One send. Intro, optional voice note, and slots travel together. On send the **Document is created**, seeded from the request — client linked, request linked, scan into the Discovery fold, style tags into the Brief, budget band carried — and the designer lands in the Document at Discovery. The document begins with the introduction; nothing "converts."
>
> **3 · Put-downable, not atomic.** Leaving mid-ceremony parks it as a Needs Your Hand card — *"Introduce yourself to Elena"* — draft preserved. This passes the action test: the act available is writing, so it earns a Desk folder. The Document is not created until the ceremony completes. (The atomic alternative — backing out un-claims — was rejected: it punishes a designer accepting on her phone between site visits. The skip-with-system-fallback alternative was rejected as against the grain; revisit only if unanswered ceremonies prove common in pilot.)
>
> **4 · The waiting state is a chip.** After send: in-motion chip, *"Elena Vasquez — intro sent, awaiting her pick."* The only act left is waiting; per R22 that is chip tier, never a Desk folder. When she picks: the chip becomes *"Discovery · Thu 2pm"*, linking to the Document's Discovery fold, and The Post letters it (*"Elena chose Thursday 2pm"* — named, deep-linked, per the P3 fix). At 48h of silence the chip warms to a nudge — an act exists again. If the offered slots go stale before she picks, the chip asks for fresh times.
>
> **5 · The Discovery fold, at this stage, holds:** the scheduled time, the scan (pulled from the linked request — this is P9's display side), the style tags, and a reference to the intro thread. Discovery is no longer an empty apology.
>
> **6 · The client's side (iOS) — ruled in full.** Push: named and specific ("You're matched — Middle Studio accepted your living-room request"), never generic. Held state if the ceremony is deferred: report, don't impersonate. The match screen is one screen, three movements in order: the **designer card** (studio mark, name, one-line credential, portfolio link); the **introduction** in the designer's own words, voice note playable inline — this message becomes the head of the client–designer thread; the **time picker** — 2–3 tappable slots, one tap books with confirmation and add-to-calendar, and an escape hatch ("none of these work") that opens the thread. The companion doc owns pixel detail; this ruling owns the contract and the order of the movements.
>
> **7 · The accept contract.** `accept(request_id)` → claim + client held-state notification. `ceremony_complete(intro, voice?, slots[2–3])` → create Document seeded from request (client_id, request_id, scan→Discovery, style→Brief, budget band), deliver intro+slots to client, navigate designer to the Document at Discovery, spawn the in-motion chip. `client_pick(slot)` → write the time to the Discovery fold, update the chip, letter The Post. **Prerequisite: the Wave 1 linkage fixes** — this arc cannot be stitched onto documents that don't know their client or request.
>
> **Rejected alternatives, for the record:** landing directly in the Document on accept; Desk-card flip; editable template intro; calendar-link scheduling; client-proposes-first. Full reasoning in the session record.

---

## Part B — the build plan

Three phases, gated in order. **Phase 0 findings come back as I-entries before any building.** Designer-visible calls escalate; code-only calls you bless and log — the line is *"would a designer notice this?"*

### Phase 0 · Audit first — verify before building

**0.1** Audit the documents schema. Do `client_id` and `request_id` columns exist on documents? Are they null on iOS-originated rows? Elena's doc `f9970369-b7da-4c03-9892-386e6a82d37e` is a known broken row — header reads "No client linked."
**0.2** Trace the uuid-null. Opening any person record logs `AppError: invalid input syntax for type uuid: "null"` (chunks 7999/4207 in the current build). Name the exact query and the null it carries.
**0.3** Audit the accept endpoint. What does accept currently do — claim? create anything? notify the client? The Post already records "You accepted a design request." Map what exists before replacing it.
**0.4** Inventory reusable surfaces. Request cards in Needs Your Hand exist; the thread infrastructure exists (People → Threads); The Post letters exist. The ceremony reuses these rails wherever honest.

### Phase 1 · The spine (Wave 1 — pipeline integrity)

**1.1** Stitch request → client → document at creation. Additive schema only (add nullable `request_id` if absent; no renames, no drops). Backfill the broken seed rows.
   *Accept: Elena's doc header shows its linked client; a joined query from person → documents returns her doc.*
**1.2** Client records born from iOS requests carry the requester's name and contact from the payload — no more "New Client." (P6)
   *Accept: a fresh iOS request produces a named client record.*
**1.3** Person-record queries guard nulls and, post-backfill, list linked documents. Kills the uuid-null AppError and the "No projects yet" lie.
   *Accept: zero console AppErrors across every seeded person record; documents appear under Projects.*
**1.4** Root-cause the Desk's intermittent empty render (skeleton Needs Your Hand cards, vanished In Motion — observed twice in one session, recovers on reload). If it's the same failing fetch, 1.3 covers it; either way, a failed Desk fetch must surface an error state, never a silent half-desk.
   *Accept: 20 consecutive Desk loads render complete; forced fetch failure shows an error state.*

**Gate: Phase 1 acceptance passes before Phase 2 ships.** The arc cannot be stitched onto documents that don't know their client.

### Phase 2 · The accept contract (the arc, portal side)

Port intent from `match-ceremony-prototype.html` — scenes 02–04 govern these surfaces. Brand: typography-first, zero shadows on content, Strata rules not tabs.

**2.1** `accept(request_id)`: claims the request; fires the client held-state notification ("*{Studio} has taken your request in hand — introduction on its way.*"). Creates nothing else.
   *Accept: claim recorded; client notification delivered; no Document row exists yet.*
**2.2** The Match Ceremony surface. Presents: name, ask verbatim, scan preview, style tags, budget band. Asks: scaffolded composer with payload-assembled context line; optional voice note; 2–3 offered times (manual pick, 45-min default). **Send is gated** on non-empty words AND ≥2 slots — nothing sends itself.
   *Accept: gate behavior matches prototype scene 03; empty composer or <2 slots = sleeping send.*
**2.3** `ceremony_complete(intro, voice?, slots[])`: one transaction — create Document seeded from the request (client_id, request_id, scan → Discovery fold, tags → Brief, band carried); deliver intro + slots to the client; navigate the designer to the Document at Discovery; spawn the in-motion chip "*{name} — intro sent, awaiting her pick.*"
   *Accept: after send, designer is inside the Document at Discovery; the Document knows client, request, scan, tags, band; the chip exists and is a real link.*
**2.4** Put-down: parks a Needs Your Hand card — "*Introduce yourself to {name}*" — draft and slot selections preserved; re-entry resumes the ceremony. No Document until completion.
   *Accept: put down, reload the portal, pick back up — draft intact.*
**2.5** The Discovery fold at this stage renders: offered/scheduled time, the scan from the linked request (P9's display side), carried tags, and the intro-thread reference.
   *Accept: Discovery fold is never the bare "no structured discovery" apology on an arc-born Document.*
**2.6** `client_pick(slot)`: writes the time to the Discovery fold; chip becomes "*Discovery · {day time}*" linking to the fold; The Post letters "*{Name} chose {time}*" — sender named, deep-linked. (Until A3/deep-link routing is fixed in Wave 3, in-app navigation from the letter is acceptable; a full URL that survives refresh is the Wave 3 acceptance, not this one.)
   *Accept: pick on the client side updates fold, chip, and Post within one refresh.*
**2.7** Chip timers: 48h client silence → nudge state (an act exists again — chip warms, Golden Hour dot). Offered slots in the past → chip asks for fresh times.
   *Accept: both states reachable in test by clock manipulation; copy per prototype scene 04.*

### Phase 3 · The client's side (iOS contract)

**3.1** Bless-and-log the payload contract so portal and iOS agree: designer card fields (studio name, mark, credential line, portfolio URL), intro text, optional voice-note URL + duration, slots[2–3] with timezone, thread id. Escalate any field you'd add that a designer or client would notice.
**3.2** The match screen builds to ruling §6: push named and specific; three movements in order (card, her words, the pick); one tap books with confirmation + add-to-calendar; escape hatch opens the thread. Prototype scene 05 is the reference.
   *(May run as a parallel track once 3.1 is blessed.)*

### Telemetry (name them even if the portal's analytics rail lands later)

`ceremony_opened`, `ceremony_put_down`, `ceremony_completed` (with time-to-complete), `intro_voice_attached`, `slots_offered_count`, `client_held_state_shown`, `client_pick` (with time-from-send), `nudge_fired`, `fresh_times_requested`.

### Out of scope — do not pull in

Share-link 404 (Wave 2), dead-click/hydration hunt and deep-link routing (Wave 3, except as noted in 2.6), Room View, palette/boards, proposal naming. They're logged in the triage doc; scope creep here delays the client's first minute.

---

## The kickoff line

> Read `docs/design/the-document/the-document-arrival-arc-package.md` and `match-ceremony-prototype.html`, run the Phase 0 audit first and log findings as I-entries before building anything; first review milestone is Phase 1 acceptance — zero uuid-null errors, linked documents, twenty clean Desk loads — reported with screenshots.

---

*Manual landing step (no repo access this session): place this package, the prototype HTML, and Part A's ruling into `docs/design/the-document/` — ruling appended to DECISIONS.md via `append_entry.py` (assigns the real R-number, restores the footer). Ruling + artifact + package land together.*
