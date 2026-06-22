# DECISIONS.md — The Document workstream

> Append-only shared log between the implementation side and the design session.
> Never edit past entries; corrections get a new dated entry referencing the old one.

---

## Locked decisions (seeded from spec §2, v1.0 April 2026)

| ID | Decision |
|----|----------|
| D1 | Strict one document at a time. No split view, no peek/hold. Esc or "Put down" is the only exit; switching costs one trip through the Desk or a ⌘K jump. |
| D2 | Interruptions are designer-driven, never system-dictated. Nothing breaks through by default; per-designer break-through rules, shipping with zero enabled. |
| D3 | Mobile pattern: margin items collapse to anchored chips; spine becomes a bottom sheet. Dedicated mobile milestone gates the default flip (D7). |
| D4 | No shadows. Anywhere. No exceptions. Value contrast + flat stacked edges + folder tab; mechanically enforced via lint, CI-blocking. |
| D5 | The Weekly Pulse lives in the margin (kind `pulse`, anchored to the Project section). Friday unsent Pulses rise on the Desk. |
| D6 | Documents visible to all studio members; no exclusive holds. Soft presence line in the spine; per-member "needs *your* hand". |
| D7 | Ship alongside, phase in. Parallel flagged route against real data; zones dissolve only after validation + mobile pattern. |
| D8 | Studio Drawer persistent on every screen; ledgers open as overlay sheets; collapsed by default, no badges, no pulsing counts. |
| D9 | Time: capture in the document (spine timer), review in the drawer (Hours ledger). |
| D10 | Suggestive, adjustable capture. Timer counts, designer adjusts up or down, nothing auto-trims. <60s discards silently. Idle detection only annotates. |
| D11 | Timer auto-starts on pick up — provisional, pending Leah's gut-check; fall back to one-tap start if it feels surveilling. |

---

## Open — needs design ruling

### O1 · Document identity vs codebase lifecycle split — 2026-06-11

**Conflict:** Spec §1 says one document per *client relationship*; spec §3 routes `/doc/[projectId]`. Codebase: the lifecycle is split across `designer_clients` (lead→proposal→active→completed→nurture), `proposals` (own status chain, version supersede), and `projects` — and a project row **only exists after signing** (`activate_proposal_as_project`). A client may have several projects; projects can also be created manually with no proposal lineage.
**Proposed resolution (CODEBASE-MAP §4):** document = project when one exists; pre-signing, document = live proposal chain (or lead). Desk unions the three shapes. A client with two projects shows two folders. Manual projects render Brief→Proposal as ghost sections. Also: no "direction shared" marker exists — Direction is proposed as "latest proposal in draft".
**Blocks:** Slice 1.

### O2 · Stamp vocabulary divergence — 2026-06-11

**Conflict:** Spec §6 stamps `to_order → ordered → in_production → shipped → received → installed` (+ `decision_due/extended`, `damaged/returned`). Codebase FF&E machine (00184, DB-enforced ratchet): `specified → quoted → approved → ordered → production → shipped → delivered → installed`, plus `blocked`/`blocked_by_decision_id`, inspection outcomes (clean/damaged/partial), damage-claim states. Specifics: `to_order` collapses three designer-meaningful pre-order states; spec `received` = codebase `delivered`; `extended` and `returned` have no data behind them.
**Proposed resolution (CODEBASE-MAP §5):** stamps render the codebase machine 1:1 where it's richer (sub-state as the stamp's second line), `received` derives from `delivered`, drop `extended`/`returned` from v1.
**Blocks:** Slice 1 (need-line stamps), Slice 2.

### O3 · Time system collision — 2026-06-11

**Conflict:** Spec §9 designs a fresh `time_entries` table (seconds, activity vocabulary Design/Sourcing/Client/Site visit/Admin, `raw_seconds`, `idle_seconds`, `source`). The codebase **already shipped** `project_time_entries` (00177) with UI (header TimerButton, stop dialog, ⌘K commands): minutes granularity with **min-1-minute round-up** (spec: sub-60s silent discard), phase/task attribution (no activity vocab), invoice claim/release + guard triggers, one-running-timer-per-user. D11 auto-start also inverts the current manual-start UX.
**Proposed resolution:** extend `project_time_entries` additively (new columns per spec needs); never fork a second table. Needs rulings on: seconds vs minutes; discard vs round-up; activity vocabulary vs/alongside phase attribution; how the existing header timer coexists with the spine timer during phase-in.
**Blocks:** Slice 5 (and the drawer "In hand today" readout).

### O4 · D4 scope vs D7 — 2026-06-11

**Conflict:** D4 demands a CI-blocking shadow ban "in this app" from PR 1. The app currently has 111 `shadow-*` usages in old zones that D7 forbids touching, and `@patina/design-system` primitives (Dialog/Popover/Command) ship shadows into anything that mounts them.
**Proposed resolution:** PR 1 adds the CI-blocking lint scoped to Document surfaces (`/desk`, `/doc`, document/drawer/ledger components) + `shadow-none` overrides wherever design-system primitives are reused inside those surfaces; widen the ban app-wide at the dissolve step.
**Blocks:** Slice 1 PR.

### O6 · R10–R12 referenced but absent from this log — 2026-06-12

**Gap:** Session 02 prep cited "R10–R15 appended," and R14 references R12's
"needs-action ordering," but only R13–R15 are present in this file — the
R10–R12 text appears to have been truncated in the paste. Blocked on the
missing text: the I6 Desk-heuristics constants retune (R10's calibrated
values exist nowhere in the repo) and dued-note ordering (R12). Slice 4
proceeds on the fully-specified scope (unfolds, Orders ledger, per-item
DAMAGED, R14 Note, R15 fill-state); notes with due dates provisionally rank
with due decisions pending R12.
**Blocks:** I6 retune; final dued-note ordering.

### O5 · Portal surfaces with no Document-model home — 2026-06-11

**Conflict:** The portal has grown past the five zones the design sessions mapped (spec §3). Unmapped: **Aesthete** (Teaching + Aesthete Engine), Insights, Portfolio, Resources, Team, Reviews, Nurture queue, rooms directory, and the vendor directory (People vs Orders ledger?).
**Proposed resolution:** none yet — these stay untouched through the phase-in (D7), but each needs a destiny (ledger, document section, margin, or deliberate exile) before the default flip.
**Blocks:** Slice 6 / default flip only.

---

## Implementation decisions (code-level; designers wouldn't notice)

### I1 · Feature flag mechanism — 2026-06-11

PostHog flag `the-document-pilot` via the existing `useFeatureFlag` hook (fail-closed, same as `procurement-workspace-pilot`), with the existing `NEXT_PUBLIC_FLAG_OVERRIDES` env override serving as the spec's env override. No per-designer DB flag store exists; if per-designer targeting is needed later, PostHog targeting by email covers it without schema work.

### I2 · Brand token source — 2026-06-11

Document surfaces use the CSS vars in `apps/designer-portal/src/app/globals.css` (`--color-clay` etc. — exact spec hexes), not `@patina/design-system/tokens/colors.ts` (different OKLCH values). Fonts already loaded. "Strata Mark" has no existing asset — it will be a new primitive; final name TBD given the repo brand is Patina.

### I3 · Repo-reality corrections to workstream docs — 2026-06-11

The spec/CLAUDE.md reference a "strata monorepo", `@strata/*` packages, and React 18. Reality: patina-merged, `@patina/*`, React 19, Next.js 15. The workstream CLAUDE.md was placed at `apps/designer-portal/CLAUDE.md` with a dated correction note. Also: only prototype v0.3 (`patina-the-document-prototype-v3.html`) exists in `docs/design/the-document/` (no `prototypes/` subdir, no v0.1/v0.2, no concept deck) — references resolved to the file that exists.


## Rulings — design session, 2026-06-11
 
### R1 · Ruling on O1 — Document identity — 2026-06-11
 
A document = one **engagement**: the project once one exists (`/doc/[projectId]`);
pre-signing, the live proposal chain (keyed by chain root); pre-proposal, the
lead/designer_client. The Desk unions all three shapes. A client with N projects
gets N folders (tab = surname, title distinguishes); the client-level view is the
People ledger — the ledger rule applied to relationships. Direction derives from
latest-proposal-in-draft (accepted as approximate; the settled state means
"direction work concluded," not "client reacted" — upgrade the derivation when a
direction-share feature ships). Manual projects ghost Brief→Proposal and open at
Project. Edge cases blessed as audited: `on_hold` = paused in-motion chip, never
"needs your hand"; `archived` = ⌘K/People only; declined/expired proposals hold
at Proposal-active with the state in the need line. Spec §1/§3/§4 updated to
engagement language in v1.1.
 
### R2 · Ruling on O2 — Stamp vocabulary — 2026-06-11
 
Stamps render the codebase FF&E machine 1:1: SPECIFIED / QUOTED / APPROVED /
ORDERED / PRODUCTION / SHIPPED / DELIVERED / INSTALLED, with
`src/components/portal/ffe/stages.ts` STAGE_CONFIG as the canonical label/color
source. RECEIVED is a derived ninth state: `status='delivered'` + clean
receiving inspection logged — "delivered, awaiting inspection" is therefore a
visible studio to-do and a valid need-line input. DAMAGED derives from
inspection outcome / open damage claim, with claim state in the unfold.
DECISION DUE derives from `blocked_by_decision_id` → pending blocking decision
and always displays the *current* due date; extensions are narrated by the
decision margin item, never a stamp. EXTENDED and RETURNED are dropped from v1
(no data). Spec §6 vocabulary superseded.
 
### R3 · Ruling on O4 — Shadow ban scope & defense — 2026-06-11
 
CI-blocking lint scoped to Document directories (/desk, /doc, document/drawer/
ledger component dirs) from the Slice 1 PR; widened app-wide at the dissolve
step. Defense is two ESLint rules (flat config): (1) `no-restricted-syntax`
catching `shadow-*` class strings and `box-shadow`/`drop-shadow` CSS within
Document dirs; (2) `no-restricted-imports` banning direct design-system overlay
primitives (Dialog/Popover/Command/Sheet/Tooltip) in Document dirs — overlays
enter only through Document-local `Doc*` wrappers that bake in `shadow-none`
plus the paper treatment (ink border, flat edges, spec §10 recipes). Wrappers
are portal-local first, promoted per the catalog-ui precedent when the client
portal mirrors need them. Old zones untouched until dissolve (D7 upheld).
 
### R4 · Ruling on O3 — Time system unification — 2026-06-11
 
Extend `project_time_entries` additively; never fork. `duration_minutes`
remains canonical (invoice guard triggers, `project_unbilled_time` view, and
shipped data untouched); add `raw_seconds` (pre-adjustment elapsed, audit
trail), `idle_seconds` (annotation only — never subtracted, per D10), `source`
('timer_auto' | 'timer_manual' | 'manual_entry'), and `activity`. Attribution
is two-dimensional: `phase_key` auto-fills from the document's current phase at
log time (the spine knows where the pen is — the designer is never asked), and
the picker asks only `activity` (Design / Sourcing / Client / Site visit /
Admin in v1); `task_id` stays optional. The sub-60s rule follows start mode:
`timer_auto` discards silently, `timer_manual` keeps the shipped
round-up-to-1-minute. Picking up a document chains out ANY running timer
(header-started included) through the log-offer strip — one mechanic
everywhere. The header TimerButton continues unchanged in old zones through the
phase-in and dissolves with them. Granularity ruled at implementation level
(designer-invisible): minutes canonical + raw_seconds additive. D10/D11
otherwise stand; D11 auto-start remains provisional pending Leah's first
session.
 
### R5 · Ruling on O5 — Destinies for unmapped surfaces — 2026-06-11
 
Four destinies exist: document section / ledger / margin / quiet exile
(⌘K-reachable, no nav presence). Assignments:
- **Reviews** → Care section + margin item on arrival; aggregate column in People.
- **Nurture** → dissolves: due follow-ups rise on the Desk as need lines; the
  cadence lives in Care; the queue becomes a People filter.
- **Rooms directory** → dissolves into documents (project_rooms / proposal scope).
- **Portfolio** → quiet exile; sources Install/Care photos; ⌘K-reachable.
- **Resources** → quiet exile behind the help affordance.
- **Team** → settings region; D6 presence covers in-document visibility.
- **Inbox** → retire after Slice-6 verification that margins + Desk cover all
  unique functions.
- **Aesthete** folds, not shelves: teaching becomes a mode of the Library
  ledger (classification lives with products); Engine stats and teaching
  royalties move into Accounts — the 25% Pledge rendered as a line in the
  studio's own account book.
- **Insights** distributes as each ledger's front-matter summary page
  (Accounts: revenue/AR · People: pipeline conversion · Orders: procurement
  throughput · Hours: utilization). No dashboard book.
- **Vendors** → Orders ledger directory pane; People stays clients-only.

---

## Implementation decisions — Slice 1 (2026-06-11)

### I4 · Desk reads engagements from a `document_state` view — 2026-06-11

Migration 00188 creates a SECURITY INVOKER view unioning the R1 shapes
(project / live proposal chain / open lead / pre-proposal relationship) with
derived `active_section` (§4) and need-input counts (§7), so Desk, the Slice 2
spine, and ⌘K share one source (§11.6). Slice 1 renders pre-signing
engagements as Desk folders only — no `/doc` route exists yet; the route
scheme for proposal-chain/lead documents (spec §3 permits a canonicalizing
resolver) will be decided and logged in Slice 2.

### I5 · DocSheet built without design-system overlay primitives — 2026-06-11

The first `Doc*` wrapper implements its own minimal dialog semantics (Esc,
backdrop dismiss, focus in/restore) rather than wrapping a shadowed
design-system primitive. The R3 `no-restricted-imports` ban is in place for
Document dirs; when a future wrapper genuinely needs a primitive, that file
gets an explicit exemption in `eslint.config.mjs` (documented inline there).

### I6 · Desk heuristics v1 — 2026-06-11

Hesitating proposal = sent >3 days unopened, or opened >5 days unsigned.
Lead urgency = response deadline inside 48h (or passed). Motion chips capped
at 6. All thresholds are constants in `desk-derivation.ts` — tune with Leah
during phase-in step 2.

### I7 · Signed-awaiting-activation proposals surface on the Desk — 2026-06-11

An `accepted` proposal with no project row (signed, `activate_proposal_as_project`
not yet run) was invisible in the original union — the Desk would silently
omit the signing moment. Now surfaces as a needs-your-hand folder: need line
"Signed — open the project", SIGNED stamp (sage), ranked directly under
overdue decisions. §4 doesn't enumerate this sub-state; flagged for design
review in the Slice 1 PR since the need line is designer-visible.

### D12 · Full-bleed document — 2026-06-11

A document in hand fills the entire viewport. No charcoal surround, no page
border or radius, no stacked edge — those are Desk-state devices, for objects
ON the desk; in hand, the paper IS the screen (D1 expressed spatially). The
Studio Drawer is the only persistent layer above the paper — the desk edge
still showing beneath the work. Ledger sheets, the log strip, Doc* popovers,
and ⌘K are the only other overlays; nothing else coexists with an open
document. The spine and margin become sticky full-height rails (Put down,
timer, presence, and margin items always reachable); main content scrolls
between them, padded clear of the drawer. Pick up = raise-to-fill scale
(~270ms; reduced-motion: crossfade); put down recedes to the Desk. The Desk
itself is unchanged. Prototype v0.4 is the canonical reference; spec §3/§10
amended at next revision. Mobile interim: spine = sticky horizontal paper
strip at top, margin flows after main — the dedicated D3 pattern still gates
the flip.

---

## Implementation decisions — Slice 2 (2026-06-11)

### I8 · Document route: one `/doc/[id]` + canonicalizing resolver — 2026-06-11

All three engagement shapes share a single route. The id accepts ANY of the
engagement's keys — engagement_id (canonical: project id / proposal-chain
root / lead id / relationship id), or the live proposal id — resolved by one
`document_state` lookup (`.or()` across the key columns); the URL is not
rewritten. Per spec §3's "canonicalizing resolver is acceptable." Limit: an
ACTIVATED proposal's id no longer resolves (shape B excludes proposals with
a project row) — those engagements are addressed by project id, which is how
the Desk and ⌘K link them anyway.

### I9 · DAMAGED stamp attribution is PO-level — 2026-06-11

`receiving_inspections` / `damage_claims` hang off `purchase_orders` (00150)
with no FF&E-item FK, so every line on a PO with an open claim (drafted /
vendor_notified) stamps DAMAGED until the claim resolves. Per-item
attribution would need additive schema; deferred until the Slice 4 unfold
shows claim detail. Designer-visible over-attribution on multi-item POs —
flagged for design review.

### I10 · Slice 2 presentation seams — 2026-06-11

Sequencing artifacts a designer will notice, all per the §13 build order,
flagged for review in the slice PR: the margin rail ships present but empty
(fills in Slice 3); the spine ships without the timer box (Slice 5); only
the Proposal settled bar unfolds (Brief/Discovery/Direction bars are inert
until their unfolds are designed); Discovery and Care active bodies are one
quiet line each (Care grows its Guide/reviews/cadence at R5 in Slice 6).
Spine sub-labels only claim dates the data actually carries.

## Rulings — design session, 2026-06-11 (Slice 2 review)

### R6 · Ruling on I8 — Resolver redirects activated proposal ids — 2026-06-11

I8 blessed with one amendment: the stated limit (an activated proposal's id no
longer resolves) is a dead link across the signing moment — the document grew,
the URL must agree. The resolver catches ids of proposals that have a project
row and redirects to `/doc/[projectId]` (one extra lookup on the miss path;
`router.replace`, no history pollution). Bookmarked or shared pre-signing
links survive activation. No URL rewriting otherwise; I8 stands as logged.

### R7 · Ruling on I9 — DAMAGED stamp deferred to per-item attribution — 2026-06-11

The over-attributing stamp does not ship. Stamps are the document's truth
device (R2: pure renderings of real state); PO-level claim data stamping every
line on a multi-item PO lies at the item grain and teaches the designer to
discount stamps. Until per-item attribution exists, claims surface where they
are true: the line unfold's PO detail, the Orders ledger, and a Desk need line
("PO-0214 has an open damage claim"). In Slice 4, add the additive
`ffe_item_id` FK to damage_claims/receiving_inspections and ship DAMAGED as a
truthful per-item stamp. Spec §6 DAMAGED row amended accordingly at next
revision.

### R8 · Ruling on I10 — Slice 2 seams — 2026-06-11

Margin rail ships present with one quiet placeholder line in muted italic
("The margin — decisions, messages, and money gather here") — honest
scaffolding that keeps the D12 full-bleed geometry stable when Slice 3 fills
it. Inert settled bars (Brief/Discovery/Direction pre-unfold) must NOT render
the "unfold ↓" hint — affordances that do nothing teach the document to lie;
hint copy appears only when a bar's unfold ships. Spine sub-labels claiming
only real dates: blessed as logged. Timer box absent until Slice 5: blessed.

### R9 · Pilot checkpoint — Leah's first structured session — 2026-06-11

Informal peeks anytime; the first structured first-Tuesday session happens
after Slice 3, when the margin loop (decision → stamp + margin + Desk in one
act) works against Middlewest's real data. Rationale: first impressions don't
repeat, and the margin is the concept's heart — a shell with a placeholder
margin risks anchoring on "pretty but hollow." The D11 auto-start gut-check
and idle-threshold calibration still occur at Slice 5.

---

## Implementation decisions — Slice 2 amendments (2026-06-11)

### I11 · R6–R8 implementation notes — 2026-06-11

R6: implemented as one extra `proposals.project_id` lookup on the resolver's
miss path; `router.replace`, loading state holds until the redirect lands.
R7: migration 00189 appends `open_claim_count` / `open_claim_po`
(vendor_po_number, falling back to sidemark) to `document_state`; the line
stamp and its PO→inspections→claims select are removed. The Desk need line
reads "AP-012 has an open damage claim" (pluralizes without a PO identifier)
and ranks below overdue decisions and the signing moment, above everything
else. Its stamp label is **CLAIM OPEN** — not DAMAGED, which R7 reserves for
the truthful per-item stamp in Slice 4 — designer-visible word choice,
flagged for review. R8: placeholder line rendered verbatim in muted italic;
inert settled bars were already affordance-free (hint shows only the settled
date; "unfold ↓" appears solely on bars whose unfold exists).

---

## Implementation decisions — Slice 3 (2026-06-11)

### I12 · Pulse v1 mechanics — 2026-06-11

The Friday draft job is pure SQL (pg_cron, Fridays 13:00 UTC): one draft
`weekly_pulses` row per active project per ISO week — no edge function, no
email. The client mirror is the project comms thread: `send_weekly_pulse`
(00192) flips the pulse and posts the message in ONE transaction, so the
client sees it in their portal Messages and the existing comms notification
machinery fires. An email leg (Resend) can ride later without schema change
— **flagged for design**: is in-portal + comms-notification enough for v1?
The default draft body composes from the week's REAL movement (FF&E stamp
changes this week + decisions settled/pending), editable before send.

### I13 · Margin mechanics — 2026-06-11

The `margin_items` view (00191) is an INDEX (kind, anchor, state, thin
payload); expanding an item fetches content through the existing domain
hooks. Message `unread` derives from the caller's `last_read_at`; opening
the item marks the thread read. Time rows are read-only daily summaries
until Slice 5. Decision resolution from the margin uses the shipped
override-with-consent path (`useApplyDecisionOverride` → `apply_decision`)
— the designer records the client's pick with method + evidence, audit row
included; UI wording "Record the pick" — **flagged for design review**.
Decision due-date extension is a plain `due_date` patch; the margin item
narrates it (R2: the stamp shows only the current date). Invoice send =
`issue_invoice` RPC + the existing `invoice-send` edge function.

### R13 · Pulse email leg — v1 as built; email gates the flip — 2026-06-12
Slice 3's Pulse ships as logged (portal message + existing comms
notification): for the pilot, Leah's clients get a Friday inbox touch via the
comms-notification email, which is acceptable scaffolding. The full-body
Friday email (Resend leg, using the already-designed Pulse template from the
journey email set) is added to the DEFAULT-FLIP GATES — the Pulse's product
truth is reassurance arriving where the client lives, and that is the inbox.
No schema change required per I12. Flip gates now: D3/D13 mobile validation ·
Pulse email leg · idle annotation (D10) · R5 destinies staged.

### R14 · The Note — sixth margin kind — 2026-06-12
Ratifying Leah's Session 01 finding: designer-authored marginalia, the most
literal margin item of all. Spec: kind `note`, Mocha-adjacent accent (distinct
from time; suggest Aged Oak), authored by any studio member, anchored like all
margin items (line / section / letterhead; default letterhead). CAPTURE MUST
BE ≤5 SECONDS — one tap from the margin rail header ("+ Note") on desktop and
from the spine sheet's margin section on mobile; from a line unfold, the note
pre-anchors to that line. Optional due date; a dued note joins needs-action
ordering (R12), otherwise notes sit in anchor order. ESCALATION is what makes
it structural: a note converts in place to (a) a client decision via the
shipped decisions machinery, or (b) a Scope Change Authorization when the
call was a change request — if no SCA artifact exists in the codebase yet,
Claude Code stubs the action and flags it (audit-first; do not invent the
artifact). Notes are studio-visible (D6), never client-visible — the margin's
private layer. Sequencing: rides Slice 4 as an add-on while the margin
machinery is fresh; storage is additive (margin_notes or equivalent — naming
to repo conventions).

### R15 · Strata Mark fill-state + the breath — 2026-06-12
Ratifying Leah's Question 9, moderated. The mark becomes a progress device:
its three lines render as fill-state mapped to the engagement's three
movements — line 1 fills through SHAPING (Brief→Direction), line 2 at
COMMITMENT (proposal signed), line 3 through DELIVERY (Install→Care).
Unfilled lines render at the ghost opacity already in the recipe. Surfaces:
folder tabs' mark, the letterhead mark, ⌘K result rows — anywhere the mark
stands for a document. Spine section markers keep their per-section state
colors (settled/active/ghost) — they answer "which section," the fill-state
answers "how far." MOTION: exactly one — a slow breath (~3s ease, subtle
opacity swell) on the ACTIVE spine marker only, where "alive" is literally
true; `prefers-reduced-motion` disables it; nothing on the Desk ever moves.
"Pulsing" beyond this is declined — ambient motion is what the no-badge
discipline exists to prevent. Sequencing: fill-state is static rendering and
ships with Slice 4 (Leah gets her brand moment next session); the breath
joins the Slice 6 motion pass.

---

## Implementation decisions — Slice 4 (2026-06-12)

### I14 · Slice 4 implementation notes — 2026-06-12

Per-item DAMAGED (R7 follow-through): `damage_claims.ffe_item_id` (00193);
the inspection flow drafts ONE claim PER attributed item when the designer
picks pieces in LogInspectionDrawer (additive prop — old-zone callers
unchanged); unattributed claims stay PO-grain and never stamp a line. Note
(R14): `margin_notes` table; capture is one tap from the rail header or a
line unfold (pre-anchored); escalation paths are BOTH real — a draft
client_decision, or a draft scope_change_request (audit found the artifact
R14 thought might be missing: `scope_change_requests` + create/send/approve
flows, 00066/00084/00114) — no stub needed. RLS is author-scoped (the 00150
single-lead-designer limitation; widen with studio membership). Dued-note
ordering is PROVISIONAL (groups with overdue decisions) pending the missing
R12 (O6). Orders ledger batch action: "same truck" — a shared confirmed_eta
across selected same-vendor POs via repeated `log_po_acknowledgment`
(coalesce semantics; vendor_po_number untouched) — wording + semantics
flagged for design review. R15 fill-state fractions: settled sections count
1, the active section ½, per movement group; the Desk folder-tab mark uses a
lineage-blind approximation (manual projects overstate SHAPING there) —
flagged. The breath waits for the Slice 6 motion pass per R15.

---

## Rulings ratified via spec v1.2 — 2026-06-12

### R10–R12 confirmed — resolves O6 — 2026-06-12

Spec v1.2 (supersedes v1.1; §-numbering unchanged) landed in-repo with the §2
one-line ruling table and the R10 constants in §7; R12's full text is now in
the design-session log. O6 is RESOLVED: R10 = I6 retune to Leah's numbers
(hesitating = sent **1 day** unopened OR opened **2 days** unsigned · lead
urgency = deadline inside **24h**; precision watch at Session 02; per-studio
settings when studio #2 onboards) · R11 = CLAIM OPEN blessed + the
decision-override action personalized ("Record Sarah's pick") · R12 = margin
ordering under load (needs-action floats, urgency-ranked like the Desk →
anchor order → resolved items fold into a collapsed "Settled · N" group; the
fold label is the only number anywhere in the margin). R10/R11 full session
text remains absent from this log — spec v1.2 §2/§7 taken as authoritative.

### I15 · R10/R11/R12 landed — Slice 4 amendments — 2026-06-12

R10: `desk-derivation.ts` constants retuned 3d/5d/48h → **1d/2d/24h**, with
≥ boundary semantics ("sent 1 day unopened" rises ON day one); landed
immediately per §13, not gated on the slice. R11: the override button
personalizes from `document_state.client_name` first name; falls back to
"Record the pick" when no name. R12 mechanics (implementation-level):
needs-action = overdue decisions (0) → dued notes (1) → the week's unsent
pulse (2 — Friday-gated like the Desk, per D5), ordered most-overdue-first;
anchor order = letterhead band → section band → line band, lines ranked by
the document's rendered FF&E order (the rail supplies the rank map; unknown
anchors sink within their band); within one anchor, newest first; "Settled ·
N" is collapsed by default, newest-first when expanded. ⌘K fill-state rows
(R15) ride the Slice 6 ⌘K extension per §13. Ops notes: a `supabase db
reset` from main wiped the transient demo engagements + unmerged document
migrations locally — rebuilt via the new idempotent
`scripts/the-document-local-seed.sql` (resolves the Whitfield id through the
R6 redirect; activation ids are random — supersedes the slice-3 seed's
pinned ids). Migration-number collision: main now carries
`00188_po_send_columns` (procurement); this stack's 00188–00194 renumber to
00189–00195 at rebase.

---

## Implementation decisions — Slice 5 (2026-06-12)

### I16 · Slice 5 implementation notes — 2026-06-12

Time (R4): migration 00195 extends `project_time_entries` additively —
`raw_seconds` / `idle_seconds` / `source` (default `'timer_manual'`, so the
header TimerButton keeps writing honestly with ZERO old-zone edits) /
`activity`. One `DocumentTimeProvider` above the Desk and every document
owns the mechanics; hold/release/chain-out operations run through a
serialized promise queue (an unmounting document and a mounting one must
never race over the single running-row). Close-out WRITES the entry first,
then offers adjustment in the strip — a dismissed strip still leaves the
truth logged; Discard deletes. The chained-out row's phase auto-fills from
its own project's `current_phase` when the row carries none (header starts).
Pause logs the segment quietly (no strip; adjust later in Hours) — the
schema has no paused state, so pause = close-out + local resume latch.
Designer-noticeable defaults flagged for the session: the strip's activity
select defaults to Design (prototype parity); the spine "+ Log" form
likewise. Timer attaches to PROJECT documents only in v1
(`project_time_entries` FK — proposal/lead documents carry no spine timer).
The spine timer is hidden in the <980px interim pattern; the D13 bar timer
glance arrives with the Slice 6 mobile build (the timer/strip components
take state via the provider, unforked per surface, per §13). Hours ledger:
this week, day-grouped, inline activity/duration edits disabled once an
invoice claims the entry (00177 guard); "Export week → Accounts" is a
disabled stub until the Accounts book exists (Slice 6). The "in hand today"
readout sums the designer's own day (completed + live elapsed) — it is a
readout, not a badge (D8 discipline upheld). Esc priority per §3: the strip
listens on capture (Esc = discard) ahead of sheets and put-down.

---

## Rebase + procurement integration (2026-06-12, post-Slice-5)

### I17 · Stack rebased onto procurement Waves 4–5 — 2026-06-12

The five-slice stack (PRs #3–#7) was rebased onto main `d249b49a`
(po-send, PO numbering, procurement crons, expediting, partial receiving).
Conflicts in exactly two files, both resolved as compositions: the
receiving-inspection hook carries BOTH per-item received quantities
(their W5-T2 `items[]`) and per-item claim attribution (our
`damagedFfeItemIds`); the inspection drawer keeps their self-fetched
"Items received" counts section and our "Which pieces?" claims picker —
now fed by the drawer's own PO-item query (the document's `ffeItems` prop
was retired as redundant). The Order Assistant v2 step architecture kept
the v1 core mount props — the line-unfold mount carries over unchanged
(verified live from the unfold, step 1-of-3 rendering over the paper).
Migrations renumbered at the stack tip: 00188–00195 → **00191–00198**
(earlier slice trees keep old prefixes; lexical apply order stays correct).
All 13 scripted acceptance assertions re-run green; 367/367 jest.
⚠ Surfaced pre-existing gap: `activate_proposal_as_project` copies
`vendor_name` but DROPS `vendor_id` on FF&E lines — the Order Assistant
can't mount on activated un-ordered lines anywhere in the portal. Local
seed backfills; the real fix belongs on main's activation lineage.

### O7 · Weaving the PO send/expedite lifecycle into the Document — 2026-06-12

**Context:** procurement now carries a full send lifecycle (po_number →
PDF → vendor email → sent_at → acknowledgment → expediting flags →
partial receiving) plus time-driven events (payment-due flips,
delivery-week notifications). The document currently renders the PO cell
(number/placed/ack), Movement, and Receiving — but the SEND act and the
expediting signals have no document-model home.
**Proposed resolution (CODEBASE-MAP §11):**
1. **Unfold** — the Purchase order cell narrates the send lifecycle
   ("PO-00012 · sent to vendor Jun 12 · acknowledged"); a **Send to
   vendor** action (po-send: PDF + email) joins the action row for
   drafted POs; expediting flags surface as quiet Movement sub-lines
   (never badges).
2. **Orders ledger** — adopts `po-send-actions` as row actions
   (send / resend / PDF preview); the unscheduled-shipment condition
   renders as a row mark, not a banner.
3. **Desk need lines** — candidates: "PO drafted — not yet sent" and
   "sent — unacknowledged N days" (thresholds need Leah's numbers, R10
   style); the 00189 payment-due flips arrive as Money margin items via
   the existing invoice/auto-draft narration.
4. **Spec §6** gains the PARTIAL receiving state (already truthful in the
   unfold's "N of M inspected" cell).
**Sequencing proposal:** rides Slice 6 as "Orders ledger v2 + the send
weave" (alongside ⌘K and front-matter), unless the session prefers a
dedicated slice before the mobile build. Designer-visible calls needed:
send-action placement (unfold vs ledger vs both), need-line thresholds,
and whether vendor email send requires a confirm step inside the paper.
**Blocks:** nothing current — Slice 6 scoping only.

### R18 · Ruling on O7 — the send weave — 2026-06-12

**Sequencing:** a dedicated **Slice 5.5 — "Orders ledger v2 + the send
weave"** lands after Session 02 and before Slice 6, keeping the flip's
critical path (mobile build + gates) unburdened, and sequencing the weave's
thresholds behind Leah's numbers. **Placement: both homes**, per the ledger
rule — sending one PO while working its line is engagement work (the unfold's
action row, drafted POs only); sending/resending across vendors and projects
is cross-engagement work (Orders ledger row actions: send / resend / PDF
preview). Same act, two honest homes. **Confirm: the PDF preview IS the
confirm** — review-then-send per the R11 invoice precedent. The PO renders as
paper over the document ("This is what Sawkille receives"), one action: Send
to vendor. No "are you sure" dialogs; the confirm step is the document
showing you the document. **Need lines:** "PO drafted — not yet sent" after
**2 days** · "sent — unacknowledged" after **3 days** — both PROVISIONAL,
Leah's numbers captured at Session 02 (R10 contract). **The rest as
proposed:** payment-due flips arrive as Money margin items through existing
narration; expediting flags render as quiet Movement sub-lines, never badges;
unscheduled-shipment is a row mark, not a banner; spec §6 gains the PARTIAL
receiving state. O7 RESOLVED.

### R16 · Slice 4/5 blessings + refinements — 2026-06-12

*Provenance: ratified via spec v1.3 §2 (the table text below is quoted
verbatim). The session's long-form text did not reach this log — only the
§2 one-liner arrived (same gap as O6); a correcting entry can follow if
longer text exists.*

Slice 4/5 blesses: write-first close-out is a D10 refinement (truth logged,
fully editable; Esc = discard stands) · pause-as-segment · activity default
Design (provisional) · IN HAND / TYPED labels · "same truck" wording blessed
but narration says "ETA aligned," never "acknowledged" · fill-state:
project-exists ⇒ line 2 filled regardless of lineage · tab fallback = first
word of document title, never a role noun · claim need lines must be
engagement-scoped (AP-012 check).

*Implementation note: the build-bearing items (fill-state line-2 rule, tab
fallback, same-truck narration) are HELD until after Session 02 per the
session's build-hold directive; they land with Slice 5.5 alongside the
R18 weave.*

### R17 · Activation vendor_id gap — fix before Session 02 — 2026-06-12

*Provenance: ratified via spec v1.3 §2, quoted verbatim (long-form text
not received — see R16 note).*

`activate_proposal_as_project` drops `vendor_id` (main-lineage bug,
procurement session owns) — fix + backfill land **before Session 02**, or
the session script gains a seam answer.


### R16 (full text) · Slice 4/5 review — blesses and small rulings — 2026-06-12

*Correcting entry: the session's long-form text, superseding the §2-quoted
placeholder above (which noted it had not arrived).*

**Write-first close-out (I16): blessed as a D10 refinement.** Capture remains
suggestive because the designer retains full edit/delete (Hours inline edits);
the system errs toward preserving truth — losing time silently is the worse
failure. Esc = discard stands. **Pause-as-segment**: blessed; revisit only if
Session 02 shows pause-noise in Hours. **Activity default = Design**: blessed
provisionally; Session 02 entry data decides whether a per-document sticky
default earns its complexity. **IN HAND / TYPED source labels**: blessed.
**"Same truck"**: the wording is blessed — exactly Midwest-plain — but the
history narration must say "ETA aligned across POs," never "acknowledged";
a batch ETA is not a vendor act and the log may not claim it is.
**Fill-state tab fix**: a project's existence IS commitment — manual projects
render line 2 filled at Project-active regardless of proposal lineage; this
replaces the lineage-blind approximation that overstated SHAPING.
**Tab fallback rule**: when no surname resolves, the tab shows the first word
of the document title — never "CLIENT"/"USER"/any role noun. Fix the Olsen
Lake House tab. **AP-012**: verify claim need lines are engagement-scoped;
one claim must never produce two folders.

### R17 (full text) · vendor_id activation gap — priority — 2026-06-12

*Correcting entry: the session's long-form text, superseding the §2-quoted
placeholder above. Status: LANDED on main as `00199_activation_carry_vendor_id`
(`83a2171c`) — function fix + backfill, applied and verified locally.*

The `activate_proposal_as_project` vendor_id drop is a main-lineage bug
(procurement session owns the RPC fix + backfill migration), but its symptom
lands on Middlewest's REAL activated projects — Leah cannot mount the Order
Assistant on un-ordered lines. Fix + backfill land BEFORE Session 02, or the
session script gains a seam answer for it.


## Pilot record

### L2 · Leah Session 02 — findings — 2026-06-12

**Build:** Slice 5 (rebased, d249b49a) · **Desk at start:** 4–6 folders
(R10 heat — real conditions) · **Signal: GREEN, with two capture debts**
**Numbers.** Time-to-true-read: <1 min at 4–6 folders (clean read-back —
a materially stronger result than L1's one-folder minute) · Unaided margin
acts: 1–2 · Old-portal flights: **2+ — triggers NOT captured, second
session running** · R17 seam answer armed (vendor_id fix had not landed).
**The Note (R14).** Reached for **unaided** — her own Session 01 finding,
shipped in Slice 4, used without prompting. The teaching loop closed on
itself; strongest qualitative signal of the pilot to date.
**D11 verdict.** Timer never mentioned unprompted during the work block;
on direct ask (Q10): "punch card — comfortable." → R19.
**Write-first close-out (R16) in the wild.** She missed the log strip at
put-down entirely, moved to the next task, noticed later, adjusted her
minutes. Under confirm-first the time would have been lost; under
write-first her inattention cost nothing. → R20. (Adjustment venue —
strip vs Hours — not captured.)
**Margin read-back (R12).** Mostly matched her triage order; quibbled an
item or two — specifics not captured.
**NOT captured (debts):** Q1/Q2 precision-recall (MISSED A SECOND TIME —
now owed async, see constants watch) · Q11 idle number · Q12 R18 threshold
numbers · Q14 flight triggers · margin quibble specifics · Q9 verbatim ·
D13 phone hand-off result (flip gate remains unsatisfied).
**Disposition.** Proceed to Slice 5.5. Capture debts collected async —
they are questions, not sessions.

## Rulings — design session, 2026-06-12 (Session 02)

### R19 · D11 RESOLVED — auto-start ratified — 2026-06-12

The two-part evidence is exactly what D11 asked for: the timer went
unnoticed through a full real-work block (unnoticed = punch card, not
camera), and on direct ask Leah's verdict was "punch card — comfortable."
Auto-start on pick-up is no longer provisional. Implementation
consequence: retire any one-tap-start fallback path scaffolding; manual
start remains only as the spine/bar control for documents picked up
without intent to work. The D-table's D11 entry stands with this ruling
as its resolution. Spec §14.1 CLOSED.

### R20 · Write-first close-out vindicated; strip persistence — 2026-06-12

R16's bless now has field evidence: a missed strip cost nothing because
the truth was already logged. No design change. One verification rides
the slice: confirm the log strip has NO timeout — if unengaged it
persists quietly until acted upon or the next pick-up chains it out. If
any auto-dismiss exists, remove it. The strip's quietness is correct;
its patience must match.




## Implementation decisions — Slice 6 (2026-06-12)

### I19 · Slice 6 increment 1 — motion, capture, command, interruptions — 2026-06-12

Slice 6 is the flip-gate omnibus; built as increments. **Increment 1**
(this entry): **The breath (R15)** — a single `doc-breath` keyframe (~3s
opacity swell, prefers-reduced-motion stills it), opt-in via a `breathing`
prop, applied to EXACTLY the active spine marker; the script asserts 1
breathing element in the spine and 0 on the Desk (nothing on the Desk ever
moves). **Idle annotation (D10)** — the time provider listens for activity
pings (pointer/key/wheel/visibility, coalesced to ~20s) while a timer runs;
at close-out `idleSecondsFromPings` sums gaps over the PROVISIONAL 8-min
threshold (Session-02 async Q11) and writes `idle_seconds` (00198); the
strip annotates "~N quiet minutes" beside the number, NEVER subtracting it
(verified: 40 min logged unchanged with idle recorded). **The ⌘K command
bar** — a Document-local paper surface (R3-clean: no design-system Command
import), every row a document (with its fill-state Strata Mark, R15) or a
ledger or an action; documents navigate to `/doc/[id]`, ledgers open the
Studio Drawer sheet via a `document:open-ledger` CustomEvent, the Desk's
"Find anything" affordance opens it via `document:open-command-bar`.
**Interruption settings (D2)** — migration 00201
`designer_interruption_rules` (author-scoped RLS, SHIPS EMPTY = the D2
zero-interruptions default); a sheet opened from ⌘K lists the six margin
kinds all-OFF; a toggle upserts a row (the louder channel that reads these
is later — this is storage + surface). **Friday Pulse desk-rise** confirmed
already shipped (the Friday-gated `pulse_due` need line, Slice 3/5). 5/5
scripted acceptance (`the-document-slice6-shots.mjs`); 384/384 jest.
**Flip-gate status:** the idle-annotation gate is now CLOSED. Remaining
Slice 6 work + gates: Pulse email leg (R13, buildable — increment 2) ·
ledger front-matter (Hours/Orders exist; Accounts/People still stubs) ·
Aesthete fold (large, touches old zone) · R5 exiles staged · ⚠ **D13
mobile build BLOCKED** — the canonical mobile prototype
`patina-the-document-mobile-d3-v1.html` is NOT in the repo (design
authority); Leah device validation + Desk precision at R10 (async Q1/Q2,
missed twice) are externally gated. Migrations now 00191–00201.



### I20 · Slice 6 increment 2 — the Pulse email leg (R13) — 2026-06-12

R13's flip gate built. The Friday email arrives where the client lives:
a new journey-set template `WeeklyPulse` (`@patina/email`) wraps the
designer's composed/edited Pulse prose; a Node-runtime route
`/api/pulse/send-email` authenticates the designer (`createServerClient`
from `@patina/supabase/server` — the working route pattern; the po/generate
copy authenticated as nobody, fixed), loads the sent pulse + project +
client, resolves the recipient, renders the template, and sends via Resend
(`sendEmail`). **Decoupled + non-fatal (I12):** `useSendWeeklyPulse` calls
the route AFTER the `send_weekly_pulse` RPC commits; a non-2xx or network
failure is swallowed — the in-transaction portal mirror already reached the
client, so the inbox touch is best-effort. No schema change (I12). Verified
end-to-end: the Pulse sends (status→sent + mirror posted) AND the email
renders + Resend accepts it (`emailSent:true` + message id) to the test
recipient; template render asserted by 2 vitest cases (50/50 email pkg).
**`@patina/email` added to the app's `transpilePackages`** (it ships raw
TS from `src/`, was absent — the import would not have transpiled).
⚠ **Faithful template:** the design session's referenced "already-designed
Pulse template from the journey set" was NOT in the repo; `WeeklyPulse` is
built to the package's conventions (eyebrow · project heading · prose
paragraphs · See-the-project CTA · designer reply line). If a designed
template lands, swap the chrome — the props contract (clientName /
designerName / projectName / body / weekOf / portalUrl) is stable.
**Flip-gate status: the Pulse email leg gate is now CLOSED (R13
satisfied).** Remaining gates are the externally-blocked three: D13 mobile
build (missing prototype) · Leah device validation · Desk precision at R10
(async Q1/Q2). Prod needs `RESEND_API_KEY` (already true for all email).



### I21 · Slice 6 increment 3 — the D13 mobile build — 2026-06-12

The canonical mobile prototype `patina-the-document-mobile-d3-v1.html`
landed in-repo (design session) and is committed alongside (full CSS — the
look/feel/motion authority; demo body elided as scaffolding). The React
shell ports its INTENT (never markup), active only below the 980px
breakpoint; the desktop spine rail, margin rail, and Studio Drawer nav all
hide there. The three rulings, built:
  • **D3-1 unified bar** (`mobile-bar.tsx`): one bar owns the thumb edge —
    Desk = drawer handle + "in hand today"; document = section handle
    (→ spine sheet, labelled with the active section) + timer glance
    (→ timer sheet, live from the time provider) + drawer book.
  • **D3-2 anchored chips** (`mobile-margin-chips.tsx`): margin items render
    as chips beneath their FF&E line (line anchor) and the letterhead
    (letterhead/section anchors); a tap raises the full item as a paper
    sheet with its actions — the SAME body as the desktop rail, via the
    extracted `MarginItemBody`.
  • **D3-3 the spine sheet doubles** (`mobile-sheets.tsx`): a paper sheet
    with Put-down + the seven sections on top, "In the margin · N" beneath,
    each summary row jumping to its margin item.
Materials honored: paper sheets for document parts (spine, item, timer),
charcoal sheets for desk books (the drawer's five books open the existing
DocSheet ledgers via the `open-ledger` event). Scrim dimming, no shadows
(D4). State: a `MobileShellProvider` holds the active doc (published by the
page via `useMobileActiveDoc`, lifted above the early returns so the hook
is unconditional) + the open sheet. The log strip's bottom offset is now
responsive (56px mobile bar / 42px desktop strip). 6/6 scripted acceptance
(`the-document-mobile-shots.mjs`, 390px) + 384/384 jest; lint/tsc clean.
**Flip-gate status: D13 pattern BUILT — the gate is closed for the build;
Leah's on-device validation (the gate's other half) remains hers.**
Remaining flip gates are now only the two externally-held: Leah device
validation + Desk precision at R10 (async Q1/Q2). Migrations unchanged
(00191–00201; this increment is presentation-only).

### Slice 6 review — blessed as logged, verification rides L3 — 2026-06-12

The three increments (motion/capture/command/interruptions · Pulse email
leg · D13 mobile) are blessed per report: prototype canonical in-repo,
intent-ported shell below 980px, all three D3 rulings scripted-green,
materials honored, the breath as the only ambient motion, margin item
bodies shared with the desktop rail so the two surfaces cannot drift.
No designer-visible items were flagged; accordingly the design review
rides the L3 walk (the real device IS the review). Two confirmations
owed in the log before flip: R17 vendor_id landed (was made in-slice at
5.5 — confirm or name the blocker) and the AP-012 engagement-scoping
verification result (§14.13). R20's strip-timeout check: log the finding.

### R21 · The flip protocol — 2026-06-12

**Gate satisfaction, defined.** (1) D13 gate = the L3 walk lands GREEN:
Leah discovers the spine sheet and opens a chip unaided or with at most
one hint, no material-confusion moments, and her verdict is usable
("works on a job site" energy, not "where am I"). (2) Precision gate =
Q1/Q2 finally CAPTURED at her real desk heat, with either ≤1 false
positive and no high-cost miss, or thresholds retuned to her numbers
and re-checked async. Captured-and-tolerable flips; captured-and-noisy
retunes first.

**Mechanics — stage now, toggle later.** The flip is prepared as ONE
change: `/portal` root resolves to `/desk`; zone routes stay URL-reachable
with no nav entry points (spec §12.5); her existing bookmarks keep
working; the pilot flag graduates to default-on for the studio. Rollback
is the same toggle in reverse — instant, no migration, no data effect.

**Flight telemetry replaces the twice-missed Q14.** At flip, every
old-zone route visit fires a lightweight event carrying from-route and
last-document-in-hand. The triggers we failed to capture twice by
observation will name themselves as data within the first week. This is
the dissolve criterion's instrument as well.

**Week-one watch:** daily zone-visit count and contexts · strip
engagement rate · timer entries/day against her historical baseline.
**Rollback criteria:** Leah asks, or >50% of her work sessions route
through old zones in week one (voting with her feet), or any
data-integrity issue. Un-flipping is cheap; pretending is not.

**Dissolve staging (post-flip, telemetry-gated, each stage its own PR):**
Stage 1 (flip +2 weeks, flat zone telemetry): R5 quiet exiles staged
(Portfolio / Resources / Team) · Inbox verification (§14.10).
Stage 2: ledger front-matter (Insights distribution) · the Aesthete fold —
NOTE: the fold's Accounts rendering (teaching royalties, the 25% Pledge
as lines in the studio's own book) is brand-critical and RETURNS TO THE
DESIGN SESSION for a pass before build; it is the one remaining named
design deliverable in the dissolve.
Stage 3: old-URL redirects · zone removal · app-wide shadow ban (R3) ·
Inbox retirement. Spec v1.4 cuts when the gates check — the flip-state
consolidation, one cut, not three.

## Pilot record

### L3 · Leah validation walk — findings — 2026-06-12

**Build:** Slice 6 / PR #9 (real build, her phone, <980px) · **Both gates: GREEN**
**D13 gate.** Spine sheet: unaided · chip: tapped unaided · put-down: spine
sheet handle · Hours + reply asks: both clean · one brief stall opening the
drawer (first-run affordance — polish watch, not a build item) · first
sentence, verbatim: **"Very slick."** · Q9, verbatim: **"It almost seems too
easy."** GATE SATISFIED per R21.
**Precision gate.** At 4–6-folder heat: **0 false positives, 0 misses** —
and still "slightly noisy," located precisely: the day-one SENT need line
("was there action needed?"). Noise without inaccuracy = a tier problem,
not a threshold problem. → R22. GATE SATISFIED (captured-and-tolerable,
with one nudge landing in the flip window).
**Flights (Q14).** Completeness-seeking, not friction: "Loves where this is
going but still needs the complete functionality available in the portal."
No broken moments named. Post-flip flight telemetry ranks the dissolve.
**Her numbers.** Idle: <1 min · PO drafted-unsent: 1 day · PO
sent-unacknowledged: 1 day.

### R22 · The action test — the awareness tier — 2026-06-12

A Desk folder claims "needs your hand"; the claim is honest only if an act
is AVAILABLE. New rule for every need-line input: **if the designer's only
available act is waiting, it renders as an In-motion chip carrying its
state — not a folder.** First application (Leah's finding): proposal sent,
unopened day 1 → In-motion chip ("Aspen Loft — sent, unopened 1d");
promotes to a needs-your-hand folder at 2 days unopened. Opened-2d-unsigned
stays a folder (act: follow up). DELIVERED-awaiting-inspection stays (act:
inspect). PO lines stay folders at her thresholds (acts: send / chase).
The chip tier is the pressure valve for every future "hot threshold vs.
noisy desk" tension — thresholds can run as hot as her instincts without
the Desk ever nagging. Lands in the flip PR window; constant
`SENT_UNOPENED_PROMOTE_DAYS = 2` beside the R10 set.

### Constants — FINAL (I-entry on land) — 2026-06-12

idle_annotation: 8 min → **1 min** (her number, honored literally; watch
item: if week-one annotations exceed ~⅓ of entries or go ignored, revisit
with data) · po_drafted_unsent: 2d → **1d** · po_sent_unacknowledged:
3d → **1d** · R10 thresholds: **stand as-is** (zero-FP/zero-miss at heat) ·
sent_unopened: 1d → chip tier; folder at **2d** (R22).

### THE GO — 2026-06-12

Both human gates satisfied. Sequence per the Flip Package §4: (1) R22 +
final constants land (one PR window) · (2) pre-flip checklist confirmed in
the log — R17, AP-012, R20 strip timeout, rollback tested both directions ·
(3) toggle: /portal → /desk · (4) Kody's one line to Leah · (5) week-one
watch runs with two added eyes: idle-annotation volume at 1 min, and
sent-unacknowledged noise at 1d (the R22 chip tier is the remedy if either
runs hot). Flight telemetry ranks the dissolve from day one. The Aesthete
fold remains the one named design deliverable, post-flip. Spec v1.4 cuts
at flip-state. — The Document workstream is feature-complete, validated,
and cleared to become the default.

### Pre-flip checklist — confirmed (B3) — 2026-06-12

The three owed confirmations, verified before the toggle:
- **R17 vendor_id — LANDED.** `00199_activation_carry_vendor_id` is on main
  (`83a2171c`); `activate_proposal_as_project` carries `v_item.vendor_id`
  onto FF&E lines (verified in `pg_proc.prosrc`) + backfill via
  `source_proposal_item_id`. No blocker — the Order Assistant mounts on
  activated un-ordered lines.
- **AP-012 / §14.13 — engagement-scoped by construction.** A claim reaches
  its project through the single-FK chain claim → receiving_inspection → PO
  → project; max claim→project fanout across all data = **1**. One claim
  can never produce two folders. §14.13 CLOSED.
- **R20 strip timeout — none exists.** `log-strip.tsx` holds zero
  `setTimeout`/`setInterval`; the strip persists until Logged, Discarded,
  Esc, or the next pick-up chains it out. Confirmed.
- **Rollback — tested both directions** (`the-document-flip-shots.mjs` +
  the rollback walk): flag ON → `/portal` resolves to `/desk`, zone routes
  stay URL-reachable; flag OFF → `/portal` stays on the old Today and
  `/desk` fails closed to `/portal`. Instant, no migration, no data effect.

### I22 · The flip mechanics — implementation (B1–B2) — 2026-06-12

R22 awareness tier in `desk-derivation.ts`: a sent-unopened proposal is an
In-motion chip carrying state ("sent, unopened 1d") via `deriveMotion`
until `SENT_UNOPENED_PROMOTE_DAYS = 2`, where `deriveNeed` promotes it to a
folder; the In-motion chip is now a tappable `Link` to `/doc/[engagement]`
(opens the document, never urgency-outlined). Final constants landed:
idle_annotation `IDLE_THRESHOLD_SECONDS` 8→**1 min**; `PO_DRAFT_UNSENT_DAYS`
2→**1**; `PO_SENT_UNACKED_DAYS` 3→**1**; R10 set unchanged. The flip
toggle: `/portal` (the old Today) redirects to `/desk` when
`the-document-pilot` is on — the bare landing flips, `/portal/*` zone
routes stay reachable; rollback = flag off. Flight telemetry
(`document-events.ts` + `zone-flight-telemetry.tsx` in the portal layout):
a post-flip old-zone visit fires `document_zone_flight` with from-route +
`last_document_in_hand` (stashed in localStorage from `/doc/[id]`).
Week-one watch events: `document_desk_rendered` (folder/chip counts +
need-kind mix — reads sent-unack frequency) on every Desk load;
`document_log_strip_acted` (log/discard, adjusted, had_idle) on strip
action. 386/386 jest; tsc/lint clean.

### FLIP CONFIRMED — 2026-06-12

THE GO executed. (1) R22 + final constants landed (this PR window). (2)
Pre-flip checklist confirmed in the log — R17 landed, AP-012 scoped (§14.13
closed), R20 no strip timeout, rollback tested both directions. (3) Toggle:
`the-document-pilot` graduated to default-on for the studio → `/portal`
resolves to `/desk` (verified live: the portal root flips, zone routes stay
URL-reachable, the R22 awareness chip renders correctly). (4) Kody sends
Leah the one line. (5) Week-one watch is wired: `document_zone_flight`
(from-route + last-document-in-hand) ranks the dissolve; `document_desk_
rendered` carries the sent-unacknowledged frequency at 1d; `document_log_
strip_acted` carries idle volume at the 1-min threshold. Rollback remains
the same toggle in reverse — instant, no migration, no data effect. The
Document is the default. Post-flip: the Aesthete fold returns to the design
session before build; spec v1.4 cuts at flip-state; dissolve stages run
telemetry-gated. — The workstream is flipped.

### I23 · Ledger front-matter (R5 / Insights distribution) — 2026-06-12

Post-flip feature build (production flagging deferred; building the model
out). R5's "Insights distributes as each ledger's front-matter summary
page — no dashboard book": the two ledgers that exist gain their opening
summary. Pure aggregations in `ledger-summary.ts` (tested): `ordersThrough
put` (Open · Arriving this week · Unsent · No ack — the last three only when
present) and `hoursUtilization` (logged minutes + billable share). A shared
`LedgerFrontMatter` band renders them at the top of the ledger sheet (Orders
on the Orders view, not the Vendors pane; Hours always) — charcoal-sheet
styling, a mono lens caption + stat pairs, no dashboard furniture. The
mobile ledgers inherit it for free (same components via the drawer's
DocSheet). Accounts/People front-matter (revenue/AR · pipeline conversion)
await those ledgers being built; the Aesthete-fold Accounts rendering stays
the design-session deliverable. 392/392 jest; lint/tsc clean.


## Rulings — design session, 2026-06-12 (the Dissolve design package)

> Source for all entries below: the live old-portal walk (the-document-parity-map.md)
> and the approved design package (patina-dissolve-eleven-surfaces-v1.html), which is
> the canonical look/feel reference for everything in this block.

### D14 · Sheets & Rooms — the drawer's two weights — 2026-06-12

Drawer objects declare a weight. **Sheets** (existing): charcoal overlays for
quick reference — pull, glance, put back; the document stays mounted beneath.
Orders, Hours, Accounts, People remain sheets. **Rooms** (new): full-screen,
paper-material workplaces you walk into. Entering a Room puts the current
document down through the normal put-down flow — D1 holds, a Room IS the
thing in hand; the timer chains out through the log offer. The drawer bar
persists inside Rooms (D8), Rooms render full-bleed paper (D12), no shadows
(D4). The drawer renders room-weight objects with a doorway affordance
(spine tick + "↗") so the hand learns which pull opens which physics.
**The Library is the first Room.** Leaving a Room returns to wherever you
were.

### R23 · The Work — tasks, deliverables, and gates-are-decisions — 2026-06-12

Resolves C-4, the philosophy ruling: the document absorbs the work and
refuses the task manager. Each active section carries a quiet block, "The
work": deliverables/tasks as checkable lines in the paper's grammar (square
tick that fills sage — a stamp, not a SaaS checkbox), ≤5-second capture
("+ Task", the Note's contract), optional due dates. **A dued task passes
the R22 action test and may rise to the Desk; undated tasks never nag.**
Hour estimates live in the work-head meta ("est. 2–4 wks · 9h of 14h est.")
and give Hours its "of N est." readout. **The gate ruling: an approval gate
IS a client decision** — `client_decisions` with kind 'approval', anchored
to the section, requested from the gate line, mirrored to the client portal,
overdue on the Desk, resolvable from the margin. Client approval SETTLES the
section (stamp + date — the settled stamp becomes something the client
grants). Declined approval holds the section active with the gate narrating
why. Declined from scope: kanban, assignees, priority flags, "+ Add Phase"
(custom sections deferred; six phases cover Middlewest).

### R24 · The Folio — files clipped to the paper — 2026-06-12

Resolves C-5. Files are material, not conversation — NOT a seventh margin
kind. They clip where they belong: a thin folio strip under any section head,
and on FF&E line unfolds (cut sheets, spec PDFs). Drag-anywhere-on-a-section
= the folio catches it (dashed clay dropzone on drag-over). **Versioning
renders literally: a re-uploaded file stacks behind its predecessor using
the Desk's stacked-edge recipe** — one click slides older versions out.
Letterhead unfold "The folio · N files" lists all, grouped by section.
Files open in a full-screen paper viewer (Doc* wrapper), never a new tab.
Per-file client_visible flag, DEFAULT STUDIO-ONLY — the folio respects the
same private layer as Notes; the client mirror renders only flagged files.

### R25 · Rooms on the schedule — 2026-06-12

Resolves C-3. Rooms are how a real FF&E schedule is written: room headings
as Playfair-italic sub-heads in the Project section (name + allocation +
progress meta), Strata mini-rules as dividers, lines beneath keeping every
existing behavior (stamps, unfolds, chips, anchors). "+ Room" adds inline
(name + optional budget allocation); lines assign by drag or from the
unfold; unassigned lines fall under "Throughout · unassigned". Room headings
join the mobile spine sheet as jump rows. Allocations feed the Account
Page's by-room variance — one source. The old Pipeline "Rooms" tab
dissolves: rooms are paper structure, not a directory.

### R26 · The Account Page — engagement financials in the document — 2026-06-12

Resolves C-2, the biggest in-document parity gap, under the ledger rule:
engagement-scoped money lives IN the document. A settled-bar band at the top
of the Project section — "The accounts · this project" — collapsed to one
honest line (budget · committed · margin %), unfolding in place to: the
variance table by room × category (DM Mono numerals; SAGE under, TERRACOTTA
over — never red/green), the margin line (trade vs client, with coverage
note), the designer-earnings block (design fee + est. commissions, linking
→ Accounts), and payment milestones with INLINE TRIGGER CONFIG (on signing ·
on production start · when [section] settles · on date) — R23's gates make
"when a section settles" a real client-granted trigger. Actions: Generate
invoice (drafts into the Money margin, review-then-send) and Export (QBO,
reusing the procurement exporter). **Marked "Studio eyes only" and excluded
from the client mirror — enforce with a CI test, not a convention.**

### R27 · The letterhead instruments — 2026-06-12

Resolves C-6 as one quiet DM-mono row under the letterhead subtitle.
**View as the [clients]** renders the real client mirror full-screen under a
thin charcoal banner ("You're seeing what they see · ← back to your copy") —
read-only preview session. **Send a note** is the Pulse's ad-hoc sibling
("the Pulse handles Fridays; this is for now"): compose sheet → comms post →
letterhead-anchored message item; no new schema. **The scan** is a Discovery
artifact card (floor-plan thumbnail from iOS RoomPlan, full-screen viewer);
scan dimensions become available to R25 room headings — the first physical
iOS↔portal handshake (advances §14.8).

### R28 · The Orders book grows pages — 2026-06-12

Resolves C-7, C-8, C-9 in one structure. The Orders book gains DM-mono page
links — LEDGER · THE WEEK · RECEIVING · VENDORS — never tabs.
**Vendors (C-7):** each vendor page carries terms, open POs, and the thread —
vendor comms in the margin's message grammar, PO-anchored chips deep-linking
into documents; "+ Brief vendor" (R29 colophon) opens it pre-addressed.
**The Week (C-8):** the old calendar in book material (weeks across,
projects down; expected / received / conflict events). The intelligence gets
promoted, not just preserved: **conflicts rise on the Desk as need lines**
("Two installs collide — week of Jul 13") because a calendar you must
remember to check fails the action test; R22 tier rules apply (collision =
folder; drift with no act = in-motion chip).
**Receiving (C-9):** front-matter stat line (arriving · awaiting log ·
claims · 30-day pass rate) + the warehouse-day queue; every Inspect mounts
the SAME inspection drawer the unfolds use — one component, two doors;
cleared items use the Settled fold.

### R29 · The Colophon — 2026-06-12

Resolves C-11. The paper's last line states its own facts: a quiet DM-mono
row at the document's foot — studio · hands on the work · Brief a vendor ·
Hold · Archive · Team… Click → small paper popover. Hold → the Desk's paused
in-motion chip. Archive → "the document goes to the cabinet — find it any
time in ⌘K" (confirm copy as written). Team… → invite designer / add
bookkeeper / reassign lead — **and the §14.6 studio-membership RLS widening
rides this exact popover.** Brief a vendor deep-links the R28 vendor pane
with PO context.

### R30 · Via Patina — the marketplace rail — 2026-06-12

Resolves C-10. Catalog vendors carry the Via-Patina mark (Strata micro-mark
+ "PATINA CATALOG" chip) on unfold PO cells and vendor pages. Ordering via
Patina = the same Order Assistant with a fulfillment branch (Patina handles
production/freight/claims) and the same review-then-send: the preview shows
what Patina receives. The PO cell narrates PATINA HANDLED thereafter — a
PO-cell state, never a line stamp. Vendor-pane "Order all via Patina"
batches through the same preview-as-confirm. **The brand moment ships with
v1: at the instant of ordering, one quiet line shows the commission flowing
to her own book and the Pledge's share of it** ("Commission to your
Accounts: ~$336 · the Pledge returns $84 as teaching royalty"). Ledger rows
land in the Accounts book (stub the destination until B-2 builds; never
stub the line itself).

### R31 · The Engine — a presence, not a place — 2026-06-12

Resolves C-1. The Engine gets NO standalone surface, no chat thread, no
history, no avatar. It answers in exactly two places where asking already
happens: **(1) ⌘K speaks** — the intent splits jump-vs-ask; asks return
Engine results as paper result-lines with one act, "Place → [document]";
ask-and-place, no conversation. One honest footer line: "The Engine · every
ask teaches your profile · deeper: open the Library ↗". **(2) the Library's
librarian** — the standing input at the top of the Library Room for style
recs, market trends, longer work. All Engine output renders in document
grammar (lines, cards, stamps). /portal/companion retires at dissolve with
its capability fully absorbed; its backend API is reused, re-skinned.

### R32 · The Library — the first Room — 2026-06-12

Builds B-1 under D14. Full-screen paper Room at /library: three layers as
SHELVES separated by Strata rules — My Library (raw captures: Chrome
extension, photos, URL paste) · Studio Library (proven) · Patina Catalog
(the marketplace, with Via-Patina marks and maker nomination) — with
capture → promote → nominate as the movement between shelves. The Engine
stands at the top as the librarian (R31). **Teaching happens while
browsing:** needs-teaching cards carry a Golden-Hour tag; tap = Quick Tags
inline on the card; Deep Analysis opens as a paper sheet over the Room for
15-minute sittings. Teaching stats (today's progress · accuracy · impact)
compress to one quiet line in the Room's foot — present, never gamified.
The old Teaching Queue page and Products zone dissolve into this Room.

---

## Implementation decisions — the Dissolve (2026-06-12)

### I24 · Dissolve package logged — two referenced artifacts absent — 2026-06-12

The R23–R32/D14 block above is appended verbatim as received. Two artifacts
it references did NOT arrive in the repo or any local path (searched):
the canonical design package `patina-dissolve-eleven-surfaces-v1.html`
(named the look/feel authority for this block) and the companion walk
evidence `the-document-parity-map.md`. Same gap class as the D13 prototype
(I19) — which later landed. The Track 1 build proceeds on the rulings'
written detail plus the shipped document grammar (prototype v0.4 +
mobile-d3 recipes); designer-visible calls return with screenshots per the
standing protocol, and the package file gets committed the moment it
arrives. Track 1 build entries follow below.

### I25 · Dissolve Track 1 — in-document parity (R23–R27, R29) — 2026-06-12

Built on `the-document/dissolve-track-1` (stack tip); migrations
**00202–00205** (00199 stays main's). All five SQL acceptance assertions +
8 scripted browser checks + 404/404 jest green. Audit-first findings and
implementation calls:

**The Work (R23) · 00202.** The package's `section_tasks` table was
pre-empted by the codebase: `project_tasks` (00169) already carries
title/status/due_date/completed_at — extended additively with
`section_key` / `estimate_minutes` / `created_by`. Gates ride
`client_decisions` exactly as ruled: `decision_kind` ('choice' default ·
'approval') + `section_key`; the approving option carries an explicit
`approves` flag (a fact on the option, never a name match). The gate is
created through the SAME machinery as any decision (options +
`notify_decision_required`) so the client-portal mirror and notification
came free. **Settlement is server-side and one-transaction** (00204
SECURITY DEFINER trigger, §5): an approved gate advances the project's
REAL vocabulary — section 'project' → `current_phase='installation'`,
'install' → `status='completed'` — so spine, Desk, and old zones read one
truth; the settled bar wears "Approved · date" from the gate. Dued tasks
join `document_state` (due_task_count/title; due-today counts, R10
boundary semantics) and rise as a TASK DUE folder ranked below
awaiting-inspection, above the send-weave nudges — at Whitfield/Olsen demo
heat the task is rightly shadowed by overdue-decision/claim needs (the
one-thing discipline); derivation proven at unit + view layers. Tasks are
project-scoped in v1 (the I16 timer precedent). Hours gains an "of open
work est." front-matter stat; the work-head meta reads "Xh of Yh est."

**The Folio (R24) · 00203.** The package's `engagement_files` was likewise
pre-empted: `project_documents` (00169) + the `project-documents` bucket
(00170) extended additively with margin-grammar anchors
(anchor_kind/anchor_id/section_key), `version_of` (literal stacking — the
Desk's stacked-edge recipe at chip scale, one click slides versions out),
and `client_visible` DEFAULT FALSE. **Backfill: pre-folio rows →
client_visible=true** (they were already client-readable; D7 — no live
engagement loses anything). Client RLS narrowed to flagged rows on BOTH
the table and the storage-objects read policy. Drag-anywhere-on-section is
caught by the page and lands on the strip; per-file studio/shared toggle;
full-screen paper viewer (shared with the scan). Drag-to-ASSIGN-rooms and
cross-section drag are polish debt — assignment ships via the unfold.

**Rooms (R25) · no migration.** The audit answered R25's question:
`project_rooms` (00066) already carries name/budget_cents(allocation)/
sort_order with activation lineage, and `project_ffe_items.project_room_id`
exists. The paper just renders the truth: Playfair-italic headings with a
Strata mini-mark (state = the room's own progress), live
committed-of-allocation + placed counts, "Throughout · unassigned",
"+ Room" inline; room jump rows join the mobile spine sheet. The Account
Page variance reads the SAME rows (one source, as ruled).

**The Account Page (R26) · 00204.** Settled-bar band; collapsed line =
budget · committed · margin% from the same aggregates as the unfold.
Variance by room (sage under / terracotta over) with a muted category line
per room (full room × category matrix deferred until a real schedule needs
it). Margin line carries the trade-coverage note; earnings block links to
the Accounts ledger (stub destination per R30's rule). **Milestone
triggers:** additive trigger_kind/trigger_section_key/invoice_id on
project_payment_milestones; `draft_invoice_from_milestone` is the ONE
drafting path (idempotent, drafts only — review-then-send via
issue_invoice stands; designer door is the checked
`generate_milestone_invoice` RPC). WIRED to auto-draft: on_section_settled
(the gate trigger — "when Install settles" drafts Delivery, asserted in a
rolled-back transaction) and on_production_start (first line into
production). on_signing/on_date are stored config; their drafting stays
with the designer's Generate-invoice act (activation already seeds the
signing milestone outstanding) — flagged: if the session wants them
auto-drafting, say so. Band placement: renders above the FF&E schedule in
project/install/care states (the "top of the Project section" home, kept
reachable through delivery) — designer-visible, flagged for review.

**Instruments (R27).** One DM-mono row under the letterhead vitals: View
as the [surname]s · Send a note · The scan (only when the client has a
RoomPlan scan with imagery). The client mirror is a designer-portal
projection component (NOT an iframe of the client app): full-screen under
the charcoal banner, read-only by construction, querying ONLY
client-visible material. **The R26 CI test is twofold:** a source-contract
jest suite (client-mirror-contract.test.ts — the R3 shadow-lint precedent)
asserts the flag filter, forbids account/task/note references and any
mutation call; the browser script additionally asserts the accounts band,
studio tasks, and unflagged files are absent from the rendered mirror.
Send-a-note posts through rpc_start_project_thread + comms_messages (zero
schema, as ruled) and lands letterhead-anchored in the margin.

**The Colophon (R29) · 00205.** Foot row: studio (resolved from
organization_members) · hands on the work (D6 presence) · Brief a vendor ·
Hold/Resume · Archive (confirm copy verbatim) · Team…. Hold/archive ride
project status (paused chip / cabinet; archived stays ⌘K-findable per R1).
**§14.6 landed as 00205:** margin_notes gains studio READ (active org
co-membership with the engagement's lead, or project-team membership);
authoring stays author-scoped. The Team popover adds members by email
(project_team_members). Brief-a-vendor opens the Orders book — it
pre-addresses the vendor pane when Track 2.1 builds it.

**Seed/scripts:** the-document-track1-seed.sql (idempotent addendum),
the-document-track1-assertions.sql (5 SQL asserts incl. the rolled-back
settlement chain + client-RLS folio check), the-document-track1-shots.mjs
(8 checks + 8 screenshots → screenshots/track-1/), rebuild script now
applies 00202–00205 + both seeds. Gotcha for posterity: client_decisions
embeds of options must disambiguate
`!client_decision_options_decision_id_fkey` (recommended_option_id is a
second FK).

---

## Rulings — design session, 2026-06-12 (Track 1 review)

### R33 · Track 1 review — blessed, with six fixes — 2026-06-12

**Blessed as built:** the project_tasks/project_documents pre-emptions
(audit-first working as designed — the package proposes, the codebase
disposes) · gates-as-decisions with the explicit `approves` option flag
and SERVER-SIDE one-transaction settlement advancing the project's real
vocabulary (spine, Desk, and old zones reading one truth is the whole
model in one trigger) · the settled bar wearing "Approved · date" · TASK
DUE ranked below awaiting-inspection, above send-weave nudges · the folio
backfill (pre-folio rows → client_visible=true; D7 honored — no live
engagement loses anything) with RLS narrowed on table AND storage ·
rooms rendered with zero migration off 00066 · variance as room rows
with a muted per-room category line (the full matrix stays deferred
until a real schedule demands it) · the mirror as a projection component
with the twofold contract test · the colophon carrying §14.6's RLS
widening (00205) · Brief-a-vendor pre-addressing a pane that doesn't
exist yet · the Account band's placement above the FF&E schedule through
project/install/care — blessed as built.

**The fixes (F1–F6, designer-visible):**
**F1 — Own-authored messages settle.** A comms post authored by a studio
member must NEVER render as a needs-attention margin message (the
designer's own Pulse mirror currently surfaces as MESSAGE · unread-ish).
Studio-authored posts render pre-settled (the Settled fold), excluded
from needs-action and unread derivation. The margin asks for her hand;
her own voice never qualifies.
**F2 — Mirror attribution.** The client mirror groups the CLIENT's own
message under "From the studio." Split attribution: studio-authored
under "From the studio," client-authored rendered as their own ("You
asked," or thread-style) — a mirror that misattributes the client's own
words breaks the trust the instrument exists to build.
**F3 — Pulse idempotency.** The mirror shows the same Pulse posted twice
(Jun 12 ×2). Verify one-mirror-post-per-pulse (the status flip should
guard it); if seed artifact, fix the seed; if real, guard the RPC.
Assert it in the acceptance script either way.
**F4 — "NO TRIGGER" → "MANUAL."** The signing milestone's trigger cell
reads NO TRIGGER; the honest word for a designer-act milestone is
MANUAL. Same cell, better word.
**F5 — Room vocabulary.** Room meta reads "0 of 1 placed" while the
section meta reads "underway" — one schedule, two vocabularies. Rooms
adopt the section's word: "committed $X of $Y · N of M underway."
"Placed" retires until it can truthfully mean installed.
**F6 — Sender names.** "MESSAGE · DESIGNER USER" is the USER-bug's third
cousin. Sender labels always render profile display names; the seed gets
real names; a production guard falls back to the studio name, never a
role noun (R16 extended to senders).
**Sanity line (not a reopening):** §14.13 closed at flip — confirm in
one log line that the two AP-012 desk folders reference two DISTINCT
claims (seed coincidence), not one claim crossing engagements.

### R34 · Milestone triggers — the flagged question resolved — 2026-06-12

**on_date: WIRE IT** to `draft_invoice_from_milestone` — a date the
designer deliberately configured arriving IS the drafting moment; drafts
only, review-then-send unchanged, idempotent path already guards repeats.
**on_signing: STAYS a designer act** — activation already seeds the
signing milestone outstanding; an auto-draft would duplicate the
existing flow's output and the moment is ceremonial anyway (she's in the
document when it signs). Config stored, drafting manual, as built.

---

## Implementation decisions — Track 2 (2026-06-12)

### I26 · Track 1 fixes (F1–F6) + Orders book Track 2 (R28) — 2026-06-12

Built on `the-document/track1-fixes` (PR #11) → `the-document/track2-orders-book`
(stacked). Migrations **00206** (margin own-voice + milestone-date cron) and
**00207** (vendor pane links). 47 jest suites / 433 tests green; Track 1
asserts 1–8 + Track 2 asserts 1–4 green; 6 review screenshots in
`screenshots/track-2/`.

**F1–F6 / R34 (PR #11):** own-voice messages settle (00206 derives `own_voice`
= latest post not from a client/vendor participant; excluded from unread,
sunk to the Settled fold) · the mirror splits "From the studio" / "You asked"
by `client_id` · the pulse-×2 was the shots-script reset orphaning the prior
mirror (RPC guard sound; scripts now retire the orphan; ASSERT 6 holds it) ·
MANUAL replaces NO TRIGGER · rooms speak "committed $X of $Y · N of M
underway" · senders render display names (seed designer = Leah Hartwell;
00206 falls back to the STUDIO name for nameless studio senders only, never a
role noun) · on_date milestones now draft via `milestone-date-invoices-daily`
pg_cron, on_signing stays manual.

**R28 — audit-first findings:**
- **00207 was a latent bug, not just an addition:** the shipped Orders-ledger
  vendor directory already rendered `trade_account_email` / `trade_portal_url`
  but NO migration ever defined them — they read undefined on every row.
  Defined now (additive, D7), alongside `contact_profile_id` (the missing link
  between vendor COMPANIES and vendor comms PROFILES).
- **The conflict classifier already existed** (`delivery-conflicts.ts`, Wave
  2.1) with overlap/late/drift per-project. R28's cross-project install
  collision is the one shape it lacked — added `detectInstallCollisions`
  (two+ DISTINCT projects, same ISO Mon-week; same-project installs never
  collide — one home, one crew).
- **The inspection drawer is reused wholesale** — Receiving and the line
  unfold mount the SAME `LogInspectionDrawer` (one component, two doors;
  source-contract test holds it), so the two doors write identical rows.

**R28 build:** Orders book grows four DM-mono page links — LEDGER · THE WEEK ·
RECEIVING · VENDORS (never tabs; source-contract forbids Tabs primitives).
The Week is weeks-across / projects-down over `delivery_events`; its
intelligence is **promoted, not just preserved** — `desk-conflicts.ts` maps
the classifier onto the Desk's two tiers (collision/late → folder need line
ranked under awaiting-inspection per R33's blessed order; drift/overlap →
in-motion chip per R22) through `use-desk-engagements` (one 60s cycle reads
both sources). Receiving carries the I23 front-matter stat line (arriving ·
awaiting log · claims · 30-day pass) + the warehouse-day queue + the Settled
fold. Vendors resolves the thread through `contact_profile_id` (vendor_brief
threads with the company's comms profile); "+ Brief vendor" and the R29
colophon both pre-address it with the document's project. Mobile inherits via
the shared DocSheet (the open-ledger event mounts the same book).

---

### I27 · Design-authority audit + grammar polish; I24 CLOSED — 2026-06-13

The two artifacts logged absent in **I24** arrived and are now committed:
`patina-dissolve-eleven-surfaces-v1.html` (the look/feel authority) +
`the-document-parity-map.md`. **I24 is closed.** Track 1 (R23–R27/R29) and
Track 2 (R28) were both built against the rulings text alone, without these
mocks — so a 12-agent adversarial audit compared the shipped code against
the authority.

**Verdict: logic-correct, right C-gaps closed, visual grammar systematically
under-built.** Of 11 surfaces: 3 full parity, 6 partial, 2 divergent — zero
wrong on logic. The parity map confirms Track 2 closed C-7/C-8/C-9 and Track 1
closed C-2..C-6/C-11; no C-cluster mis-targeted. The recurring miss was
load-bearing grammar classes (`.mitem`, `.wk-ev` pills, the `.gate` stamp,
`.minirule`, `.mono-link` palette) skipped or approximated with one-off
Tailwind — the data true, the paper not yet looking like the paper.

**Polished (high-leverage subset, this PR):** shared primitives `MItem`/
`MItemContent` (the margin rail AND the vendor thread now render through one
grammar — anti-drift, I21; §6 had drifted to flat `<li>`s) + `StrataMiniRule`.
**§6 Vendor pane** → a bookbar (Terms · Thread · Orders · N, DM-mono links
never tabs), messages as `.mitem` with the studio's own posts reading "You"
in clay (ownVoice) over the vendor's dusty-blue, and a PO-anchored "re:
{project} →" deep-link into the document. **§7 The Week** → `.wk-ev` pill
chips with "✓ recvd" / "⚠ collides" annotations (only true cross-project
install collisions wear the word — overlaps get the cell border, no word) +
the legend. **§1 The Work** → the Golden-Hour "Gate" stamp on the gate row +
"Request sign-off" + the `.work` container + a sage ✓-glyph tick + head
"N of M". **§3 Rooms** → the Strata mini-rule under each heading. New
source-contracts hold the anti-drift + pill + gate-stamp + mini-rule grammar
(`dissolve-grammar-contract.test.ts`). 48 jest suites / 442 tests green;
screenshots re-captured. **No migration** — presentation-only.

**Correctly superseded — the v1 HTML is the OLD version, code is right (NO
action):** §3 room vocabulary "placed" → "underway" (R33 F5 retired "placed");
§7 conflict-count word generalization + `<table>` vs CSS-grid (a11y) + concise
chip dates; §4 band placement; §2 viewer/D12. Flag the HTML stale at the next
spec cut.

**Deferred (gap inventory, a later polish session):** §8 Receiving
product-name-first queue rows + ARRIVING in-flight rows (needs an ffe-items
query join) · §2 folio `.f-kind`/`.f-meta` card anatomy · §5 instrument
three-color palette + scan-date suffix · §9 colophon `.cdot` separators +
clay-default actions · the `MonoLink` color-variant util · the broader RLS
spot-checks (§14.6 widening, folio storage-objects policy) + the full-surface
mobile walk. **Week-count:** The Week shows 8 weeks (not the mock's 5) —
deliberate visibility choice, logged here rather than diverged silently.

**Track 3 — NOT gaps, unbuilt by design:** §10 Via Patina (R30), §11 The
Engine (R31), §12 The Library Room + D14 Rooms physics (R32) — return with the
Accounts/Aesthete design session. Any future audit must scope these as
not-yet-built, never regressions.

### R35 · Strata Mark progress system — extends R15 — 2026-06-13

Ratifies the Strata Mark as a working progress device and adds two things R15
left open: the per-line gradient coloring and the component build contract.
Canonical reference: patina-strata-mark-progress-system.html.

**The three-hue gradient (NEW — extends R15's single-hue fade).** Each line
carries its own MOVEMENT color, fading back through time rather than one hue
at decreasing opacity:
  - Line 1 · Mocha #5C4A3C — Shaping (Brief→Direction), the deepest layer
  - Line 2 · Clay #C4A57B — Commitment (the signing), the middle layer
  - Line 3 · Dusty Blue #8B9CAD — Delivery (Project→Care), the newest layer,
    rendered at ~55% opacity so the canonical gradient fade survives.
The brand's 100/80/60 width ratios and the soft third line are preserved; the
movement-to-line mapping is exactly R15's. Movement hues are for the mark
ONLY — never the stamp palette (sage/terracotta) and never equalize the three.

**The fill API (build contract).** One CSS custom property per line, `--f`
(0..1), drives a left-clipped color fill over a ghost track; unfilled = track.
The component reads engagement stage and sets three values. Stage→fill triples
(canonical): Brief [0.15,0,0] · Discovery [0.5,0,0] · Direction [1,0,0] ·
Proposal [1,0.5,0] · Signed [1,1,0] · Procurement [1,1,0.4] · Install
[1,1,0.7] · Care [1,1,1]. Commitment (line 2) is binary — signed is 0 or 1.
Fill transitions ~.6s ease on stage change; otherwise still.

**Three behavior classes.** (none)+fill = determinate progress / static brand
mark at fill=1. `.breathing` = R15's single sanctioned ambient motion (~3s
opacity swell, staggered per line), used on EXACTLY the active element (the
spine marker of the held document), never on the Desk, reduced-motion → steady
glow. `.sweeping` (NEW) = indeterminate loader for scans / saves / Aesthete
thinking: lines fill in sequence then the set fades and restarts (~2.2s),
reduced-motion → static partial. The sweep replaces spinners portal-wide.

**Surfaces (per R15, now with fill).** Folder tab, letterhead, ⌘K result rows,
and the spine's seven markers each carry the engagement's fill — a glance reads
how far along. Size variants set the mark's overall width (sm/md/lg/xl =
48/88/120/150px) so the descending taper and per-line fill stay legible; the
⌘K and tab marks render at the wider end so result-row progress is readable
before opening. Decreasing line HEIGHT (brand canon for large lockups) is
available via per-line height vars but equalized for crispness at small sizes;
width ratios and the opacity fade are always honored.

Build note for Claude Code: ships as the `Strata` component's progress mode —
a presentation concern, no schema. Fill derives from the existing
`document_state` stage; the breath already shipped (I19). The `.sweeping`
loader and the three-hue fill are the new surface. Folds into spec §10 (visual
system) at the next cut. If the single-hue fade is ever wanted back for a pure
brand context (wordmark lockup), the component takes a `mono` flag — the
progress system is the default in-product.

---

### I28 · Strata progress system built (R35) — 2026-06-13

Built the Strata Mark's progress mode per R35 (presentation only, no schema);
artifact `patina-strata-mark-progress-system.html` committed.

**Three-hue gradient.** `StrataMark` fill mode now paints each line its
movement hue — line 1 `--color-mocha` (Shaping), line 2 `--color-clay`
(Commitment), line 3 `--color-dusty-blue` (Delivery) at 0.55 opacity (the
canonical fade) — as a left-clipped `scaleX(--f)` over a ghost track, with a
`mono` flag for pure-brand contexts. Four size variants sm/md/lg/xl =
48/88/120/150 (lines at 100/80/60). The stage→fill mapping was already R15's
(`fillStateForDesk`/`deriveFillState`); added `fillStateAtSection` so the
spine's seven markers read as a filling staircase (active breathing). Verified
on real data: Desk folder tabs, ⌘K rows, the spine, and the letterhead all
fill (the letterhead mark shows Mocha-full · Clay-full · Dusty-Blue-partial).

**The sweep.** New `StrataSweep` (`components/ui/strata-sweep.tsx`) + globals
keyframes (`strata-sweep-1/2/3` + `-fade`, byte-faithful to the blessed HTML;
reduced-motion → static partial). The lines fill in sequence then the set
fades and restarts. Replaces spinners on the **permanent surfaces**: the
canonical `Button` loading affordance (so every `loading`-prop button
portal-wide now sweeps), the **live-scan LoadingOverlay** (the review surface
— %/bar/stage dots preserved, blue rebranded to clay), auth (signin/callback),
and the room-scan family (RoomScanViewer save, room-scan-detail,
associated-room-scans ×3, lead-room-scans). Source-contract
`strata-progress-contract.test.ts` holds the three-hue + sweep + spine +
overlay + button grammar. 48 suites / 450 tests green.

**Deferred spinner inventory (dissolving old zones — rebuild into the Library
Room, R32; not churned now):** `catalog/image-uploader.tsx:154`,
`catalog/search-autocomplete.tsx:174`, `catalog/duplicate-detection-panel.tsx:308`,
`teaching/QuickTeachModal.tsx:110`, `vendors/vendor-form.tsx:267`,
`vendors/vendor-slide-over.tsx:60`, `products/validation-issues-panel.tsx:172`,
`portal/account-menu.tsx:160`. Their submit buttons already sweep via the
canonical Button; the standalone spinners ride the zone's eventual rebuild.
(`validation-issues-panel.tsx:203` is a RefreshCw affordance, not a loader —
intentionally left.)

---

## Rulings — design session, 2026-06-13 (Track 3 — the Accounts book, the Aesthete fold, the Engine, the Library, the Composing Page)

> Opens Track 3 of the Dissolve. Source for look/feel: `patina-dissolve-eleven-surfaces-v1.html` §10–12 (landed I27), the shipped Orders book (R28), ledger front-matter (I23), and the Strata progress system (R35) — now joined by two prototypes landed in the workstream dir: `patina-library-room-prototype.html` (the Room shell + the Library, R39) and `patina-composing-page-prototype.html` (the Composing Page, R40). These rulings unblock the build I27 deferred ("return with the Accounts/Aesthete design session").

### R36 · The Accounts book — the studio's money ledger — 2026-06-13

R26 put per-engagement money inside the document (the Account Page, a Project-section band, studio-eyes-only). What stays inherently studio-wide — cross-engagement receivables, the studio's own earnings, the Pledge — needs its own Drawer ledger. R5 named the destiny ("Accounts: revenue/AR … the 25% Pledge rendered as a line in the studio's own account book"); this rules its shape.

The Accounts book grows pages in the R28 grammar — DM-mono page links, never tabs — and carries three: **Ledger** (invoices: draft / sent / paid / partially-paid / void — the old Billing list), **Receivables** (A/R aging buckets plus the Send-reminder dunning Billing carried), and **Earnings** (design fees + Via-Patina commissions + teaching royalties; the Aesthete fold lives here per R37). The opening **front-matter** band (the I23 treatment — a mono lens caption with stat pairs, charcoal sheet, no dashboard furniture) states **Revenue · AR · margin**: money in, money owed, margin percent. This extends R5's revenue/AR lens with margin now that the per-engagement Account Pages (R26) roll up into the book. A teaching lens joins this band — ruled in R37.

Aging receivables obey the action test (R22): an invoice past due **rises on the Desk as a need line** — the available act is "send the reminder / chase" — and the Receivables page carries the same dunning action, so one act updates both surfaces. A receivable still within terms has no available act and therefore stays an in-motion reading on the page, never a Desk folder. The book aggregates; it does not re-author. The per-engagement Account Page (R26) is the leaf, this book is the sum — it rolls up the Account Pages and the cross-engagement rows (studio AR, earnings) that have no single-document home, with no figure entered in two places. Studio-eyes-only carries over from R26; bookkeeper access rides the colophon's Team… affordance (R29 / §14.6). Drawer weight: Accounts is a **Sheet** (D14), not a Room — pull, glance, put it back; the document stays mounted beneath.

### R37 · The Aesthete fold — teaching royalties and the two-sided Pledge — 2026-06-13

The brand-critical rendering, and the one named design deliverable the flip left open (R21, THE GO). The Designer-Taught loop (R31) earns the designer money; R5 routed teaching royalties and the 25% Pledge into Accounts. This rules how that money reads, on the Earnings page of the Accounts book (R36).

The Pledge mechanic, as confirmed this session (correct against brand if it differs): ordering via Patina earns the designer a commission, and 25% of it is the **Pledge** — rendered **two-sided**: what it returns to her, and what it gives to the commons (R30's worked example: a $336 commission, $84 at 25%).

The **Earnings page reads in two bands.** *What you earn* gathers design fees and Via-Patina commissions — client-work income. *What teaching returns* gathers teaching royalties and the running Pledge — taught-taste income. Keeping them apart lets the Designer-Taught loop speak in its own voice instead of dissolving into the invoice stream. The **Pledge is twinned, and the two directions never blur**: each Pledge event renders as a pair of distinctly labelled sub-lines — **returned to you** (royalty income, accruing to a year-to-date total: "the Pledge, returned to you: $X") and **given to the commons** (the share that funds the shared catalog and maker community). Money she keeps and money she contributes are labelled on the face of the line, so "is this mine?" is answered without a tooltip. R30's order-moment line now shows both halves at the instant of ordering, then lands both in this band.

Teaching also appears in the Accounts **front-matter as one quiet stat pair** — a teaching lens beside Revenue · AR · margin — to make the loop visible where the book opens. This is rendered strictly as a single mono lens pair (for example "Taught this month · royalties returned"), never a dashboard: a deliberate, bounded extension of R5's "no dashboard book," and it must stay one line and not grow furniture. Teaching *progress* — accuracy, impact — stays where R32 put it, in the Library Room's foot line; Accounts shows only the monetary face, and the front-matter pair links into the Library for the progress detail.

**Open (brand input, not ruled here):** the commission rate and the Designer-Selections-vs-Style-Matches split that feed these lines are a marketplace-config / brand decision. The rendering is built to receive them; promote them to spec §14 at the v1.4 cut.

### R38 · The Engine — built as a presence (R31, build-grade) — 2026-06-13

R31 ruled the Engine "a presence, not a place." This deepens it to what Claude Code can build and resolves C-1, the highest-stakes undefined item: where a conversational capability lives in a model whose whole thesis is "no chrome, just paper."

**⌘K speaks by read intent, with no mode.** One box: a destination-like input jumps (the existing ⌘K behavior); a question-like input asks the Engine, whose answer renders inline beneath the query as **paper result-lines** — each a product or idea in document grammar carrying one act, **Place → [document]**. No toggle, no "ask mode," no chat affordance. Ask-and-place; the Engine is summoned where asking already happens and leaves no surface behind it. While it works, the Engine "thinking" state uses the R35 Strata sweep, never a spinner.

**No thread, no history, no avatar — but the placement carries provenance.** The ask itself does not persist; what persists is the *act* — a placed item wears a quiet "via the Engine" mark in the document and its folio, and the Engine profile updates silently (the teaching). This holds R31's no-room rule while giving trust a faint, honest footprint ("where did this come from?") without reconstructing a conversation log. The **Library's librarian** is the second and only other home: the standing input at the top of the Library Room (R32, built in R39) takes the longer work — style recommendations, market trends, deeper sittings — in the same paper grammar and the same no-history stance ("Ask the librarian … every ask teaches your eye"). Two homes, both places where asking is already native. `/portal/companion` retires at the dissolve, re-skinned rather than rebuilt: its backend capability is reused behind these two surfaces while the conversational web surface is exiled (⌘K-reachable only until removal). Always the Engine / Designer-Taught Intelligence in copy — never "AI."

### R39 · The Library — the first Room, on a reusable Rooms shell (D14) — 2026-06-13

R32 builds the Library as the *first Room*; D14 ruled the Sheets-versus-Rooms model but no Room has been built yet. This rules the build order and what the Room is. Canonical look/feel: `patina-library-room-prototype.html` — the Room shell and the Library together; the Desk marks a Room "walk in" and a book "a sheet" ("A Room is a place you walk into. A book is a sheet you pull"), and exiting reads "Putting the Library down…".

**Build the Rooms shell first; the Library is its first tenant.** The reusable physics land as a foundation before any Library content: entering a Room runs the normal **put-down** of the current document (D1 — a Room *is* the thing in hand, so the timer chains out through the log offer), the **Drawer persists** inside the Room (D8), the Room renders **full-bleed paper** (D12) with **zero shadows** (D4), the Drawer marks room-weight objects with a **doorway affordance** (a spine tick and "↗" so the hand learns which pull opens which physics), and **leaving a Room returns you to wherever you were.** This costs more upfront than a one-off surface, but it validates the physics once and makes the second Room nearly free.

The Library itself is **three shelves separated by Strata rules** (R32, unchanged): **My Library** (raw captures — Chrome extension, photos, URL paste — landing raw, no taxonomy, no queue, taught when ready), **Studio Library** (proven, promoted from captures), and **Patina Catalog** (the marketplace, with Via-Patina marks and maker nomination), with capture → promote → nominate as the movement between shelves. The Engine stands at the top as the librarian (R38). **Teaching happens while browsing** (R32): needs-teaching cards carry a Golden-Hour tag; a tap opens Quick Tags inline on the card, and Deep Analysis opens as a paper sheet over the Room for fifteen-minute sittings. Teaching stats compress to one quiet line in the Room's foot ("taught today · accuracy · future matches improved") — present, never gamified. Authoring a new piece opens the Composing Page (R40). The old Teaching Queue page and the Products zone dissolve into this Room.

### R40 · The Composing Page — detailed processes as self-composing paper — 2026-06-13

Ratifies `patina-composing-page-prototype.html` as the canonical pattern for "detailed processes" in The Document — the model's answer to the wizard, the modal, and the multi-step form. A detailed process is **a paper artifact that builds itself**: there is no Next, no Back, no "Step N of M." Sections fill in **any order**, the artifact shows its own gaps, and it is a real, usable **draft at every percentage**, saveable at any point. The **Strata Mark (R35) is the only progress indicator** there is; the three movements map to the three Strata lines, and the state reads Capture → Draft → Catalog-ready off the same fill the mark shows.

Three weights, one continuum — **inline · sheet · room**: the same compositional act can happen inline (Quick Tags on a card, R32), as a sheet over a surface, or as a full room/page (the Composing Page) for the deepest work. The weight changes; the grammar does not.

First instance — **Compose a piece** (a catalog product), reached from the Library (R39): three movements mapping to the three Strata lines — *the record* (identity + the piece: name, maker, dimensions, materials), *the catalog* (commerce + the folio: trade/retail price, lead time, min order, images & cut sheets — the same folio as R24), and *the eye* (the teaching — style & character, the exact Quick-Tags act of R32, here as one section of the larger composition). It is **composed from both sides of the marketplace**: the maker fills price and lead time in their own portal; the designer adds the eye — one page, two authors. The librarian (the Engine, R38) stands by, but nothing is required to save — a piece can rest at draft and be taught later from the shelf. This pattern governs detailed creation flows generally, not the Library alone; other "compose" surfaces adopt it as they arrive.

### Spec cut — v1.4 (flip-state consolidation) — 2026-06-13

`the-document-spec-v1.4.md` cut, superseding v1.3 (preserved). Folds the flip
(THE GO / FLIP CONFIRMED), Dissolve Tracks 1–2 (R23–R34, I25–I27), the Strata
progress system (R35 / I28), and the Track 3 rulings R36–R40 — with the
`patina-library-room-prototype.html` and `patina-composing-page-prototype.html`
references — into the body. §-numbers are frozen, so every existing `spec §N`
cross-reference in this log remains valid. New: §16 (the Dissolve) and §14.15
(Via Patina commission rate + the Designer-Selections-vs-Style-Matches split,
open). The I27 "HTML is the old version" flags are carried as §0/§10 notes.

### I29 · Dissolve Track 3 — the Rooms shell + the Library (R39/R32, slices 1–2) — 2026-06-13

Built on `the-document/track3-rooms-library`. **No migrations** — presentation plus reuse of the shipped catalog / teaching / time layers; the audit (`the-document-track3-audit.md`) confirmed the data already exists everywhere Track 3 needs it. type-check + lint (including the D4 shadow ban, scope unchanged — the Room components live under `components/document/**`, already covered) are green on every new file; live-verified against real data on local Supabase.

**Slice 1 — the reusable Rooms shell.** `RoomShell` (`components/document/rooms/room-shell.tsx`): full-bleed paper (D12), zero shadows (D4), a thin head (leave · ident · one action slot), reduced-motion-safe enter/leave. It mounts under the `(document)` group (`app/(document)/library/page.tsx`) so the Drawer (D8), the log strip, and ⌘K persist around it. **Put-down on entry rides the existing path, not a fork** — navigating off `/doc/[id]` unmounts the page, whose `useHoldDocument` cleanup chains the timer out through the log offer (R39 reuse #5). **Return-to-origin** is a new session-scoped stash (`lib/document/room-origin.ts`, distinct from the telemetry-only `rememberDocumentInHand`); leaving reads it and navigates back (verified live: `/library` → ← → `/desk`). The Drawer marks the Library room-weight with a **doorway affordance** (Strata spine-tick + "↗"); clicking it — or ⌘K "Library", or the mobile drawer row — navigates IN rather than opening a sheet, centralized in the Drawer's `open-ledger` listener so all three entry points agree. A room-weight book reads "· here" when current.

**Slice 2 — the Library, first Room.** Three Strata-ruled shelves on the real catalog (`useLayerProducts` / `useLayerCounts`; layer enum `personal | studio | catalog`) — re-housed, data layer untouched. Capture lands raw in My Library (`useCaptureProduct`; verified end-to-end — the count ticked and the card appeared with its Promote CTA). Promote (personal→studio) reuses `PromoteToStudioModal`; nominate (studio→catalog) reuses `NominateToCatalogModal` from Studio cards (vendor resolved on click, studio from `useOrganizations`). Teaching in place: inline **Quick Tags** (a doc-grammar panel over `useStyleArchetypes` + `useAssignStyle`) and **Deep Analysis** as a paper sheet over the Room (`RoomSheet`) reusing the proven `StyleAttributionPanel` + `StyleSpectrumSlider` + `ClientMatchingPanel` → `useSubmitTeaching`. The foot compresses teaching to one quiet line (`useDesignerTeachingStats`); gamification (badges, daily-goal bars) stripped per R32/R37. The **librarian** input stands atop the Room (R38) but the ASK is deferred to slice 3 (the Engine) — present, honestly noted, no companion call. The old Teaching Queue page and the Products zone stay URL/⌘K-reachable (staged exile, D7).

**Flagged for the design session (none blocking slices 1–2):**
1. **Non-project Room time.** The library-room prototype's Hours sheet shows a "Sourcing · the Library" line, implying a Room logs its own time. The shipped time system is project-scoped and R39's physics list requires only putting the held *document* down — slice 1 does that and does NOT capture Library time. Wants a ruling if "studio time" inside a Room is intended.
2. **Via-Patina mark + Golden-Hour signal are derived, not columns.** The Catalog "Patina" mark renders off `layer='catalog'`; "needs teaching" renders off `teaching_queue` membership. Nothing invented; a distinct Via-Patina / Golden-Hour signal would need an additive read view (R30 territory).
3. **Foot stat granularity.** `designer_teaching_stats` is lifetime, not per-day — the foot reads "taught" (lifetime), not "taught today". A daily cut needs a new read.
4. **Grammar seam.** Promote / Nominate reuse the existing portal-grammar modals (functional, correct movement); a doc-grammar re-skin is a follow-up, not a slice-2 blocker.

**Next:** the L4 device check — the Library Room on Leah's phone (the Rooms physics are new, like the D13 walk) — before the Engine (slice 3). Screenshots ≥1280 were captured live; the local Chrome automation renders at a fixed ~1886px logical viewport, so the ~390px capture folds into the L4 device walk.

### I30 · Dissolve Track 3 — the Engine, a presence (R38, slice 3) — 2026-06-13

Continues `the-document/track3-rooms-library`. Migration **00208** (additive: `project_ffe_items.added_via`). type-check + lint green; live-verified end-to-end on real data (both homes → ask → real result-lines → Place → the "via the Engine" mark + SPECIFIED stamp on the FF&E line); adversarially reviewed (3 confirmed fixes, 2 false alarms refuted).

**The ask sources from the real catalog, not the companion edge fn — deliberately.** R38 says reuse `/portal/companion`'s backend, but the audit found its product extraction stubbed (`parseAIResponse` returns null) AND `companion-message` **persists** conversation (`companion_messages`) — which R38 forbids for the Engine ("no thread, no history; the ask does not persist"). So the Engine answers from a **non-persisting cross-layer catalog search** (`useCrossLayerSearch`) — the designer's own taught/captured shelves, which *is* Designer-Taught Intelligence. Only the **placement** persists. This honors the no-persistence rule, is reliable, and is locally verifiable (the edge fns aren't served in local dev — `useCompanionQuickActions` already treats them as optional). **Follow-up:** LLM-curated re-ranking via a NON-persisting companion path (Claude tool_use, no message write) is a one-line swap of the result-line source.

**⌘K (3a) — no mode.** A destination-like input filters documents/ledgers/actions (jump, unchanged); a non-empty query always also offers an **"Ask the Engine"** row (last option) — when nothing matches, it is the natural Enter target. Choosing it answers INLINE in the same paper panel: the R35 sweep while reading, then paper **result-lines** (real piece · maker · layer), each carrying **Place → [document]**. The held document (resolved from `/doc/[id]` via the desk data) is the place target; off-document, a quiet "Place into" picker of active projects. No route change, no persistence; "← results" / Esc steps back.

**The librarian (3b)** — the Library Room's standing input (replacing the slice-2 deferred stub) does the same ask-and-place inline.

**Placement + provenance.** `usePlaceInDocument` inserts a `project_ffe_items` line (mirroring the 00175 feed-through shape) with `added_via='engine'`; the FF&E `select('*')` carries it through and the line wears a quiet **"via the Engine"** mark (ffe-section). Dual-pricing honored (00185): `unit_price_cents` = client `price_retail` (the budget source of truth), `trade_price_cents` = `price_trade`.

**Review fixes (3 confirmed):** (1) HIGH — placement wrote trade cost into the client-price column (budget understatement); now mapped per 00185. (2) HIGH + (3) MED — `doPlace` lacked try/catch, so a team-member RLS rejection failed silently + leaked an unhandled rejection; now caught with an inline "you may not be the lead designer" message. (Refuted: the ⌘K Escape `stopPropagation` is correct; the ⌘K-results-have-no-toast is intentional — the inline "placed ✓" suffices and the bar stays open for a multi-place session.)

**Copy:** the Engine surfaces say "the Engine / Designer-Taught Intelligence," never "AI." `/portal/companion` is already nav-less post-flip (exiled, ⌘K-unreached); its legacy copy stays pending Stage-3 removal — it is NOT the Engine surface.

**Flags (none blocking):** the companion edge backend stays stubbed-for-products + persists, so the ask doesn't use it (above); R30's Via-Patina order-moment line into Accounts is slice 4–5; placed lines land `item_type='tbd'`, unassigned-room (designer assigns). **Next:** the Accounts book (R36, slice 4) + the Aesthete fold (R37, slice 5), then the Composing Page (R40, slice 6). The L4 device check (Rooms-shell physics, R39) is still pending.

### I31 · Dissolve Track 3 — the Accounts book, a Drawer Sheet (R36, slice 4) — 2026-06-13

Continues `the-document/track3-rooms-library`. Migration **00209** (additive: `invoices.ar_last_chased_at` + the `chase_invoice` RPC). type-check + lint + 36 desk-derivation tests green; **live-verified end-to-end on real data** (all three pages render; the overdue→Desk→chase→clear loop walked with INV-0001 temporarily backdated, then restored); adversarially reviewed (no critical bugs; 3 fixes applied).

**The book reuses the Billing data layer wholesale — no rebuild.** The audit found everything already shipped: `useInvoices` (Ledger), `useArAging`/`computeArAging` + `useSendInvoice({type:'reminder'})` (Receivables + dunning), `useEarningsStats` (Earnings). The book is a re-housing in document grammar, not a new data layer. The `accounts` LEDGERS entry (weight `sheet`, spine sage) already existed with a stub — slice 4 fills it. Three pages in the R28 grammar (DM-mono links, never tabs): **Ledger · Receivables · Earnings**; the I23 front-matter states **Revenue · A/R · margin**. Studio-eyes-only.

**No figure authored twice (R36).** Revenue (Σ `amount_paid_cents`) and A/R (`computeArAging` balance) come straight off invoice rows; the front-matter margin uses the SAME committed-line trade→client definition as the per-engagement Account Page (`useStudioMargin` mirrors `use-account-page.ts`, aggregated studio-wide, one query). The book is the sum; the R26 Account Page is the leaf (its `→ Accounts ↗` button already pointed here).

**The overdue receivable rises on the Desk via the R28-conflict precedent — no `document_state` surgery.** `buildDeskReceivables` (mirroring `desk-conflicts.ts`) classifies invoices client-side in `use-desk-engagements` and injects a `ReceivableSignal` map into `partitionDesk` (4th arg, like `conflicts`). A new `overdue_invoice` NeedKind (rank 1 — money owed sorts just under a blocking decision) carries `need.ledger` so the folder **opens the Accounts book onto Receivables** (the act surface) rather than the document — `folder-card` renders a button for ledger-acted needs. AR thresholds (`AR_OVERDUE_NEEDS_DAYS=1`, `AR_CHASE_COOLDOWN_DAYS=7`, provisional like the send weave) sit beside the R10/R22 set.

**One act clears both surfaces (R36 / R22).** The automated reminder cadence owns `last_reminder_at`/`ar_flagged_at` — a manual nudge must not perturb it — so the designer's chase gets its OWN stamp, `ar_last_chased_at` (00209, `chase_invoice` SECURITY DEFINER + ownership + status guard). The Receivables dunning act emails the reminder AND stamps the chase; the Desk need gates on overdue **AND** not-chased-within-cooldown, so chasing drops it (verified live: the PAST DUE folder cleared and Chen fell back to its next need). The Desk reads invoices under its OWN key (`['document-state','desk']`), so `doChase` invalidates `['document-state']` too — the Orders-book same-truck precedent.

**Review fixes (3):** (1) server-side status guard on `chase_invoice` (a direct RPC call can't stamp a paid/void invoice); (2) corrected the `useChaseInvoice` comment (it does NOT clear the Desk — the Receivables page does, separately) to kill a maintenance trap; (3) Ledger "owed" tail now only reads for issued receivables (a draft isn't owed). Also fixed a bare-DATE timezone off-by-one in desk-derivation's `fmtDay` (the invoice due_date rendered a day early).

**Open input carried forward (R37, §14.15):** the Earnings page builds the *What you earn* band on real earnings (design fees + Via-Patina commissions); the *What teaching returns* band + the twinned 25% Pledge are the Aesthete fold (slice 5). There is **no `teaching_royalty` earnings source_type and no stored commission/Pledge rate** in the schema yet — flagged here, to be wired from brand/marketplace config in slice 5 (render real-or-placeholder, never invent the rate).

### I32 · Dissolve Track 3 — the Aesthete fold (R37, slice 5) — 2026-06-13

Continues `the-document/track3-rooms-library`. **No migration** — the Pledge is a client-side read model computed from existing `designer_earnings`. type-check + lint green; **live-verified** (a test commission temporarily seeded then removed: $336 commission → $84 Pledge, R30's exact worked example, rendered twinned).

**The Earnings page now reads in two bands (R37).** *What you earn* (slice 4) gathers design fees + Via-Patina commissions; *What teaching returns* (new) gathers the Designer-Taught loop's income — the **two-sided 25% Pledge**. Each Pledge event renders the twinned, distinctly-labelled sub-lines — **returned to you** (sage) and **given to the commons** (clay) — never blurred; the brand-critical **"returned to you, YTD"** crescendo accrues at the band head. A one-line **teaching lens** ("N taught · $X returned → Library ↗") joins the front-matter beside Revenue·A/R·margin and links into the Library Room for the progress detail (R37: the monetary face here, the progress in the Library's foot).

**The Pledge is computed, not stored — 25% is confirmed, the commons split is NOT.** `pledge.ts`: `PLEDGE_RATE = 0.25` (R37/R30, confirmed). The Pledge = 25% × the Via-Patina commission (`product_commission` earnings — real). Per R30's worked example ("the Pledge returns $84 as teaching royalty") **returned-to-you = the full Pledge** (real, accrues YTD — satisfies the acceptance). `COMMONS_MATCH_RATE = null` (OPEN §14.15): the commons share renders "—" with a visible flag ("the commons share awaits brand config — never invented"). There is **no `teaching_royalty` source_type and no stored rate** — the structure is built to receive the config; nothing is invented.

**⚠ Open — needs design ruling (R30 vs R37 tension):** R30's example frames the Pledge as *returning* to the designer ("returns $84 as teaching royalty"), but R37 says "money she **contributes**" to the commons — i.e. the commons share may be carved OUT of her Pledge rather than a separate match alongside it. The build follows R30 (returned = full Pledge; commons = a separate, pending rate) so the YTD crescendo is real, but the commons mechanic (carve-out vs match) + its rate are the design session's to rule. Flagged, not silently chosen.

**Money-unit correction (caught in build):** the Track-3 audit map called `designer_earnings` money "dollars," but the schema (`net_amount` integer) and the live `/portal/earnings` page (`cents/100`) prove it is **CENTS**. The earnings surfaces format with `fmtUsd` (cents); the misleading `fmtUsdFromDollars` helper was removed. (Invisible at the seed's $0 earnings; a 100× error with real data — fixed before it shipped.)

### I33 · Dissolve Track 3 — the Composing Page (R40, slice 6) — 2026-06-13

Continues `the-document/track3-rooms-library`. **No migration** — reuses the shipped catalog tables. type-check + lint green; **live-verified** (entered from the Library; "Heirloom Oak Dining Table" by "Nordic Atelier" → the mark advanced to 17% / DRAFT off the fill; Save draft wrote a real `products` row, layer `personal`/status `draft`; test row removed).

**The anti-wizard, as a Room (R40).** `/compose` is a full-bleed paper Room (reuses RoomShell). The page is a paper artifact that **builds itself**: five sections fill in **any order**, each shows its own completion, and the piece is a usable draft at every percent. There is **no Next/Back/Step N of M** — the **Strata Mark is the only progress indicator**: the three movements map to the three lines (*the record* = identity + the piece → line 1; *the catalog* = commerce + the folio → line 2; *the eye* = the teaching → line 3), and the state band reads **Capture → Draft → Catalog-ready** off the same fill (`compose-progress.ts`, pure). A sticky live preview + the librarian's offer line (⌘K, never blocks) sit at the top.

**It writes a real catalog draft (no migration).** `useComposePiece` creates/updates a `products` row on the designer's own shelf (`layer 'personal'`, `status 'draft'`) — saveable at any completeness; `savedId` is held so re-saves UPDATE (no duplicates). The eye reuses `product_styles` (the same upsert `useAssignStyle` uses) — the exact Quick-Tags act of R32, here one section of the larger composition. **Percent-composed is DERIVED from what's filled** (the "draft/percent-composed read" the plan called for) — no stored progress column. Prices: the form takes dollars, persisted as integer cents (`price_trade`/`price_retail`); **min-order is dropped (no column)** — schema is authority. **Two-sided authorship** holds in copy (the maker fills price/lead time in their portal; the designer adds the eye); nothing is required to save.

**Nested-Room return (RoomShell `backTo`).** Compose is always reached from the Library, but `rememberRoomOrigin` no-ops on a Room path (the single origin slot holds the surface *before* the Library), so the leave read "← the Desk." Added an optional `backTo`/`backLabel` to RoomShell: a nested Room returns to its parent and leaves the stashed origin intact (so leaving the Library still returns to the real prior surface). `isRoomPath` now also covers `/compose`. Verified: "← the Library."

**The Composing Page is the pattern, not the one screen (R40).** This is the model's answer to the wizard/modal/multi-step form generally — `inline · sheet · room`, one grammar, three weights. Other "compose" surfaces adopt it as they arrive.

---

## Rulings — design session, 2026-06-13 (Track 3 review)

### R41 · Track 3 review — blessed, with rulings on the flagged calls and four fixes — 2026-06-13

Reviews the Track 3 build (I29–I33, slices 1–6 on `the-document/track3-rooms-library`): the Rooms shell + the Library, the Engine, the Accounts book, the Aesthete fold, the Composing Page. Built fast, additive-only (00208 `added_via`, 00209 `chase_invoice`), live-verified, each slice adversarially self-reviewed with fixes applied. The substance is sound; this ruling blesses it, rules the four designer-visible questions Claude Code raised, and names the gates to merge.

**Blessed as built:**
- **The Engine's no-persistence deviation (I30).** R38 said reuse `/portal/companion`; the audit found that backend *persists* messages — which R38 forbids ("the ask does not persist") — so Claude Code answered instead from a non-persisting cross-layer catalog search over the designer's own taught/captured shelves. That *is* Designer-Taught Intelligence, and choosing the rule over the instruction is exactly right. Blessed. The follow-up — LLM re-ranking via a non-persisting companion path (no message write) — is a code-only swap when wanted.
- **The Desk-receivable model (I31).** An overdue invoice rises as an `overdue_invoice` need (ranked just under a blocking decision) whose folder opens the Accounts book onto Receivables — the *act surface*, not the document — and the manual chase carries its own `ar_last_chased_at` stamp so it never perturbs the automated reminder cadence. One act clears both surfaces. The action test (R22) applied to money, done right. Blessed.
- The Composing Page writing a real `products` draft with **derived** percent (no stored progress column), the **cents** money-unit correction (a caught 100× error), and the derived Via-Patina / Golden-Hour signals (no invented columns) — all blessed as built.

**Ruling — the Pledge is a separate match on top (resolves the R30/R37 tension).** "Returned to you" is the **full 25%** — R30's $84 on $336 stands and the YTD crescendo is real; "given to the commons" is a **separate Patina contribution alongside it**, never a carve-out of her share. The Pledge is generative — it does not shrink what she keeps. Rates ship as **visible provisional defaults** (tune later, the send-weave precedent), wired as named constants and flagged in-product as provisional: `PLEDGE_RATE = 25%` (confirmed); `COMMONS_MATCH_RATE` provisional **10%** of the commission, clearly labelled provisional; the **Designer-Selections vs Style-Matches commission differential** is an upstream earnings/marketplace concern (provisional-equal until brand differentiates) — the document renders whatever commission lands and needs no change when the split is set. §14.15 stays open for the FINAL brand/finance numbers; the build no longer renders "—".

**Ruling — Room time is project-scoped in v1.** Rooms do not log time; the timer stays attached to project documents (I16 holds). Browsing/teaching in the Library is not billable project time, so the prototype's "Sourcing · the Library" Hours line is **deferred, not built** — "studio time" inside a Room is a deliberate later expansion, logged here as a known prototype-vs-build divergence rather than a silent drop.

**Ruling — the foot stat reads the day.** R32's foot line is "taught **today**"; the build's lifetime `designer_teaching_stats` is a stand-in. Add a per-day read so the foot reads the day's teaching, matching the prototype (F3).

**Ruling — Promote / Nominate may keep portal grammar for now.** The reused `PromoteToStudioModal` / `NominateToCatalogModal` are functional and the movement is correct; a document-grammar re-skin is a **follow-up polish, explicitly non-blocking** for the merge (F4).

**Fixes (F1–F4):**
1. **F1 — land the screenshots.** Track 3 committed none (only track-1/2 + the slice dirs exist). Capture and commit the ≥1280 set for each new surface — the Library, the Engine ask-and-place, the Accounts three pages + the Desk receivable, the Aesthete fold's twinned Pledge, the Composing Page; the ~390px set rides the L4 walk. The record cannot show its own surfaces until this lands.
2. **F2 — the provisional rate constants.** Wire `COMMONS_MATCH_RATE` (provisional 10%) and the commission handling as named, tunable constants beside the R10 / R22 / send-weave set; render the commons line as a real provisional number, flagged provisional in-product — never present a provisional as final.
3. **F3 — daily teaching read** (above): the Library foot reads "taught today," not lifetime.
4. **F4 — doc-grammar re-skin of Promote / Nominate** — follow-up, non-blocking.

**Gates to merge `the-document/track3-rooms-library` → main:** (1) the **L4 device check** — the Library Room, the Composing Page, and the Engine ask-and-place on Leah's phone (the Rooms physics are new, as the D13 walk was); GREEN means the shell is trustworthy for every future Room. (2) **F1 screenshots** landed. F2–F4 may ride the same PR or follow as a short polish slice; they do not block the merge. Rollback remains the pilot flag.

---

## Implementation decisions — Track 3 review fixes (2026-06-13)

### I34 · F1–F4 landed — the Track 3 review fixes — 2026-06-13

All four R41 fixes shipped on `the-document/track3-rooms-library`, additive-only,
behind the `the-document-pilot` flag, in one PR. Each was adversarially
self-reviewed (a 4-lens pass over the diff against the R41 rulings + D4 /
additive / flag constraints); the catches it surfaced are folded in below.

**F1 — the ≥1280 screenshot set landed.** `docs/design/the-document/screenshots/track-3/`
now holds 15 desktop (1440px) captures, live against real/seeded data: the
**Library Room** (shelves + librarian bar; the populated My Library) and its
**foot reading "Taught today · 1"** (F3); inline **Quick Tags**, the **Deep
Analysis** paper sheet, the **Capture** paper sheet; the **Promote paper
RoomSheet** (F4); the **Engine** ⌘K ask ("credenza") → result-lines → **placed ✓**
into Whitfield; the **Accounts** Ledger / Receivables (the overdue INV-0001 +
the chase) / **the Aesthete fold** (the twinned Pledge with the real provisional
commons figures — F2); the **Desk** PAST DUE receivable need; and the **Composing
Page** at 17% and 83% (the Strata Mark the only progress). The capture harness is
`apps/designer-portal/scripts/the-document-track3-shots.mjs` (the per-slice
convention). The **~390px set is NOT here — it rides the L4 device walk** (R41).

**F2 — provisional rate constants; the commons renders a real flagged number, no "—".**
`pledge.ts`: `COMMONS_MATCH_RATE = 0.10` (was `null`) + `COMMONS_MATCH_PROVISIONAL = true`
— named, tunable constants beside `PLEDGE_RATE` (the R10/R22/send-weave precedent).
`returnedToYou` stays the **full 25%** (R41: a separate match on top, never a
carve-out); `givenToCommons = commission × 0.10`. The Earnings band renders each
commons sub-line as a real number with an in-product **"provisional · 10%"** tag
and a band note ("the commons share is provisional (10%) — final rate awaits
brand config §14.15"). The **Designer-Selections vs Style-Matches commission
differential** is upstream earnings (provisional-equal until brand sets it) — the
document renders whatever commission lands, so **no document change is needed and
none was built** (R41/F2). §14.15 stays open for the FINAL brand/finance number;
wiring it later is a one-constant change, no rebuild.

**F3 — the Library foot reads "taught today."** Audit first (R41): `designer_teaching_stats`
is a lifetime base table and `teaching_sessions` is unused, so the daily cut is a
new additive read — `useDesignerTaughtToday()` counts distinct `product_styles`
rows the designer wrote today (the canonical Quick-Tags / Deep-Analysis target),
scoped to the designer's local day folded into the queryKey so it resets daily.
**No migration** (a date filter on existing rows sufficed). The review caught a
missing invalidation: `useAssignStyle` / `useSubmitTeaching` now invalidate
`['designer-taught-today']` so the foot's count refreshes with accuracy / matches
after a teach (verified live: the count ticked to 1). Accuracy and matches stay
lifetime quality measures.

**F4 — Promote / Nominate re-skinned as paper RoomSheets (non-blocking).** Both
shared modals gained an opt-in `asSheet` prop that renders the unchanged form
inside the Document `RoomSheet` (paper, flat edges, no shadow — D4; the
white-card wrapper dropped, padding de-doubled, Esc owned by the sheet) instead
of the portal-modal card. Default off — every existing portal caller (teaching
page, layer-view, promotion banner) is untouched; only the Library Room passes
`asSheet`. The movement (personal→studio, studio→catalog) and RPCs are unchanged.
Shipped in this PR though R41 made it non-blocking.

**Local demo seed:** `scripts/the-document-track3-demo-earnings.sql` (dev-only,
idempotent) seeds for `designer@patina.dev` the Via-Patina commissions + design
fees the Aesthete fold renders, one raw My Library piece (for the Promote shot),
and flips INV-0001 overdue (the Desk/Receivables need). These are **real rows the
document renders truthfully** — no figure is mocked; the Pledge arithmetic is
computed from them.

**Merge status:** F1 + F2 landed (the two merge-gating fixes), F3 + F4 ride the
same PR. The remaining gate is the **L4 device walk** (human, Kody + Leah — the
~390px captures get taken there). Do not merge until L4 is GREEN.

---

## Pilot record — the L4 device walk (2026-06-14)

### L4 · Leah's phone — the Rooms shell + Track 3 surfaces — 2026-06-14

**Gate:** the R39/R41 device check — the Rooms **physics** are new (a full-screen
paper place you *walk into*), so they get validated on a real phone before they're
trusted for every future Room. Per R41 the walk covers **three** surfaces: the
Library Room, the Composing Page, and the Engine ask-and-place.

**Build under test:** `the-document/track3-rooms-library` incl. the F1–F4 commit
(`22006e8a`) — reached on Leah's phone via a local tunnel to :3000, so the "taught
today" foot (F3), the paper Promote/Nominate sheets (F4), and the live Engine were
all present in what she tapped. Flag default-on; rollback = the toggle.

**Signal: GREEN — all three surfaces, clean.**
- **The Library Room** — GREEN. The Rooms physics held one-handed: the doorway
  read as walk-in vs pull, full-bleed paper, the Drawer persisted, no
  shadow/zone/badge, walking in put a held document down (timer chained out),
  capture + teach worked in place, leaving returned to origin.
- **The Composing Page** — GREEN. Sections fill in any order, the Strata Mark is
  the only progress, a usable draft at every percent, saved.
- **The Engine ask-and-place** — GREEN. The ask returned real paper result-lines
  and Place dropped a piece into a document. (The librarian is no longer inert —
  the slice-2 deferred stub is closed.)
- **Reduced motion** — GREEN. Run with Reduce Motion on: enter/leave fell to
  plain fades, the put-down veil skipped, nothing janked or was lost.
- **Findings:** none — a clean green. No physic felt off; nothing to route back.

**The ~390px set landed (F1 closeout).** The walk is where the mobile frame gets
taken (desktop automation couldn't — fixed viewport). Committed 14 ~390px
captures (`screenshots/track-3/mobile-*.png`) generated via the capture harness at
a 390px viewport (`SHOT_W=390 SHOT_H=844 SHOT_PREFIX=mobile-`), corroborating the
green walk: the Library Room, foot, Quick Tags, Deep Analysis, Promote sheet, the
Engine ask→placed, the Composing Page, the Desk receivable, and the Accounts
pages all render in mobile form. **Harness-render note (NOT a gate failure, device
walk was green):** at a strict 390px headless frame the *overlay* surfaces (the ⌘K
command bar, the ledger DocSheets) and the Room head action row sit a touch wide —
right-edge content (e.g. the commons dollar figure on the Aesthete fold, the
"Capture" head button) clips. Full-page surfaces (Library, Compose, Desk) are
clean. Confirm the overlay width on a real device in a later mobile-polish pass;
note that Accounts was a bonus capture, not one of the three walked surfaces.

**Disposition:** the L4 gate is **satisfied** — the last merge gate for
`the-document/track3-rooms-library` → main. With F1 + F2 landed and L4 green,
**Track 3 is cleared to merge** (PR #13 marked ready for review; the merge itself
is Kody's / a reviewer's call). After merge: deploy migrations 00191–00209,
surface week-one flight telemetry at the next review.

---

## Rulings — design session, 2026-06-14 (Proposal Authoring + Desk integration)

> Source: the approved prototypes (patina-proposal-authoring-prototype.html primary)
> and the Feature Gap Matrix (portal-vs-desk-feature-gap-matrix.md), Proposals zone.
> Closes the matrix's #1 P0 gap: proposal authoring (20 absent capabilities).

### R42 · The Drafting Room — proposal authoring as a Room — 2026-06-14

Resolves the matrix's largest gap: the legacy 8-tab Scope Builder
(/portal/proposals/[id]/scope) and the block-based section editor
(/portal/proposals/[id]) are reconceived, not ported. **Proposal authoring
is a Room** (D14) — "The Drafting Room" — entered from the Proposal section
of a document, never a top-level zone. Inside, the eight scope-builder tabs
become **eight facets that compose in any order** (R40 anti-wizard): Rooms
in scope · FF&E schedule · Palette · Mood boards · Phases & fees ·
Exclusions · Payments · Change-order terms. **The Strata Mark is the only
progress** (R35) — no "step N of 8" — filling across three movements:
*scope* (Rooms + FF&E, line 1) · *the offer* (Phases, Exclusions, Payments,
Terms, line 2) · *the vision* (Palette, Boards, line 3). Each facet is a
checkable section showing its own completion and summary; draft saves at any
percentage (the proposal is a real, usable draft throughout). The drawer bar
persists inside (D8) — the Library is one tap away for FF&E selections.
Declined from scope: a wizard stepper, hard gates between tabs, a separate
"generate" step (see R43).

### R43 · The live proposal — generate-as-you-compose — 2026-06-14

Resolves "Generate Proposal from Scope" (matrix ABSENT) by dissolving it.
There is no generate button. The Drafting Room shows a **live proposal
preview** (right rail) that builds itself as facets fill — "Sarah's copy" —
rendering rooms, palette, pieces, exclusions, and the investment total in
client-mirror grammar (NO cost breakdown, NO margin, NO TBD logic; CI-tested
exclusion per R27). The full client view opens via the existing client
mirror (R27). The FF&E schedule carries the three line types from the
lead→proposal flow as canonical: **Fixed** (a specific piece at a set price)
· **Allowance** (a budget for a category not yet chosen) · **TBD** (to be
determined), tap-to-cycle. Section editors (Concept/Space Plan/Selections/
Investment/Timeline/Terms — all matrix ABSENT) are the facet editors; asset
uploads (mood boards, palette, space plan) clip via the Folio (R24).

### R44 · Send and revise — letterhead instrument + supersede — 2026-06-14

Resolves "Send Proposal to Client" and "Revise Proposal (Supersede/Clone)"
(both matrix ABSENT, P0). **Send is a letterhead instrument** (R27 family):
a sheet carrying recipient, CC, expiry, and a personal note (the matrix's
/send ClientPicker form), flowing into the client mirror and the
signature-as-decision (R23). Sending a proposal does NOT mutate the sent
copy thereafter. **Revise creates a new version:** "Sarah asked for a
change" opens a revise sheet showing her feedback on v1, then opens **v2**,
which **supersedes v1 and carries the feedback forward** (the matrix's
useCreateProposalRevision); v1 is kept in version history on the document,
never deleted (D7). Signature settles the Proposal section and opens the
Project in the same document — nothing converts (R23, the lead→proposal
spine). Proposal *list/filter* and *tracking dashboard* (matrix ABSENT) stay
TRANSFORMED into Desk need-derivation and the margin, per the matrix's own
"TRANSFORMED ≠ gap" caveat — not rebuilt as zones.

### R45 · The proposal on the Desk — lifecycle tiers — 2026-06-14

Defines how an authoring/sent proposal surfaces on the Desk, completing the
thread from Drafting Room to Desk. The Desk's two populations (R1/R22)
classify a proposal by its lifecycle state, derived — never a list:
- **Drafting, actively** → quiet; nothing waits, nothing shows.
- **Drafting, untouched** past a threshold → an **in-motion chip**
  (`drafting` kind) — one quiet line ("Aspen Loft — drafting, untouched
  3d"), awareness tier, no urgency stamp.
- **Sent, unopened ≥1 day** → an **in-motion chip** (`sent_unopened`) —
  awareness tier; the client hasn't acted, no hand needed yet.
- **Hesitating** (opened, no signature past the R10 threshold) → **promotes
  to a needs-your-hand FolderCard** (`hesitating_proposal` need-line — "sent
  6 days ago, opened twice, no signature"), because a nudge is the available
  act (passes R22).
- **Signed** → the folder resolves; the engagement re-enters the Desk as a
  **project** with its first real need. The Drafting Room's send is the hinge
  that drives this whole chain.
The Drafting Room is reachable only through the document (Desk → folder →
document → Proposal section → the Room doorway), consistent with D14/D1.

### I35 · Track 4 — Proposal Authoring built (R42–R45) — 2026-06-14

Proposal authoring landed as one program on `the-document/track4-proposal-authoring`
(off `origin/main` f70de9df, which already carries Track 3). Closes the gap matrix's
#1 P0 gap. **Audit-first finding:** the data layer was far more complete than "20
absent" implied — all `proposal_*` tables, hooks, and the `send_proposal`/
`clone_proposal`/`activate_proposal_as_project` RPCs already existed; this was
mostly a new *surface* over existing data (like the Library Room).

**Migrations (additive, D7):** `00210` — `sign_proposal` (SECURITY DEFINER, client-
invoked): one transaction settles an `approval` `client_decision` (R23), flips the
proposal to `accepted`, logs a `signed` engagement, and auto-activates the project
(the §5 one-act-many-surfaces invariant, modeled on `send_weekly_pulse`); idempotent
via the `accepted` short-circuit + a partial unique index on
`(linked_proposal_id) where decision_type='approval'`. Also `request_proposal_change`
(client feedback capture). `00211` — `document_state` gains `proposal_updated_at`
(greatest of the proposal + its child rows) for the R45 drafting-untouched tier.

**Sign→project ruling (Kody, this session):** `sign_proposal` ships parameterized
(`p_auto_activate`, default **true**) — the project opens the instant the client
signs (R44 "nothing converts"); the existing `proposal_signed` "Signed — open the
project" Desk folder is **retained as a safety net** (fires only if activation is
deferred). Revisit with Leah whether to keep the two-step ever available.

**Surfaces:** the Drafting Room (`/drafting/[proposalId]`, a RoomShell tenant
cloning the Composing Page) — eight facets (the reused scope-builder editors)
composing in any order, the Strata Mark (`draftingFill`, three movements:
Scope/The Offer/The Vision) as the only progress, FF&E Fixed/Allowance/TBD tap-to-
cycle, and a NEW proposal-grain live client mirror (`proposal-mirror.tsx`) — the
shipped `client-mirror.tsx` was project-grain, so a parallel projection + its own
CI contract test was added (excludes cost/margin/TBD, R43). Send/Revise are
`DocSheet` overlays (`ProposalInstruments` on the document's Proposal section: a
doorway into the Room for drafts; Send/Preview/Revise + version-history once live;
D1 — the document never unmounts beneath). The client sign route now calls
`sign_proposal` while keeping the `proposal-sign-confirmation` email (the RPC does
not send it). Desk (R45): `deriveMotion` gates drafting (actively-drafting = quiet;
untouched ≥ threshold = a `drafting` chip), typed `MotionKind`.

**Verification:** `00210`/`00211` apply clean on a fresh `db reset`; functional SQL
smoke green (sign creates exactly one approval decision + a project, idempotent on
re-sign); both portals type-check with **zero Track-4 errors** (260 designer + 91
client errors are all pre-existing email/scans/msw noise); 186 document/Desk Jest
tests pass incl. the two new contract suites. **Live Chrome walk GREEN** against
real seed data: the Desk shows the accepted proposal as a *Signed — open the
project* folder, the sent one as a *sent, unopened 1d* chip, and a fresh draft
correctly absent (actively-drafting = quiet); the draft document shows the
*Into the Drafting Room ↗* doorway + *Send* instrument; the Room renders the
three movements, the Strata Mark (17% drafted), and the live *Client's copy* rail
excluding cost; the Send sheet opens as an overlay over an intact document.

**Provisional / needs-Leah (shipped truthful, revisit):** `DRAFTING_UNTOUCHED_CHIP_DAYS`
= 3d (provisional, like the send-weave constants); the hesitating-proposal copy
ships as "Opened {date} — no signature yet" (the matrix's "opened twice" is not
backable — only `proposal_viewed_at` first-open is tracked, no open-count); revise
supersedes **on send** (v1 stays a real option until v2 ships); the Room's facet
display order is Scope → The Vision → The Offer (movement labels L1/L3/L2) — a
Leah-facing ordering call, flagged. **Known follow-ups:** `screenshots/track-4/`
not auto-captured (Chrome automation can't reliably save files — manual ≥1280 +
~390px pass pending); the `['desk-engagements']` invalidation is a harmless no-op
(real key `['document-state','desk']` is prefix-covered). NOT yet merged; prod
deploy of `00210`–`00211` rides the pending `00191`–`00209` deploy (migrations
before app).

---

## Rulings — design session, 2026-06-15 (Track 5 — Project Coordination · the ball-in-court)

> Opens Track 5 of the Dissolve. **Project Coordination generalizes
> `client_decisions` in place** — an RFI, a submittal, a sign-off, and a punch
> item are all a decision with an owner (a court). The table is the widened
> `client_decisions` (coordination_kind · court · blocks_kind are new columns,
> orthogonal to the existing decision_type/decision_kind axes), the option child
> is `client_decision_options`, the resolve path is the one-tx SECURITY DEFINER
> `resolve_coordination_item`, and the read models are
> `coordination_court_summary` / `task_blocked_state`. All work is **additive,
> D7-clean — migrations 00212–00220**; the old decision/FF&E/phase machinery is
> untouched and reads truthfully through the reused `blocking_status` axis. The
> canonical look/feel reference is
> `docs/design/the-document/patina-project-coordination-prototype.html`. These
> rulings open the build; the the-document-spec.md Track-5 fold is owed post-merge
> (R54).

### O7 (Track 5) · Quiet inline confirmation vs. toast for coordination acts — 2026-06-15

> NOTE: an earlier O7 (the PO send/expedite weave) was opened and RESOLVED at R18
> on 2026-06-12. This is a distinct Track-5 open item that the session opened and
> resolved in the same sitting (R51); logged here to keep the O-number trail honest.

**Conflict:** the coordination acts (resolve / nudge / extend / reassign /
resubmit) are mutations that a SaaS reflex would confirm with a toast. D2 forbids
anything breaking through by default, and the document's whole grammar answers
"did that work?" by the surface itself changing — the stamp, the court bar count,
the margin row — not by a transient overlay shouting it.
**Proposed resolution:** the acts confirm by the surfaces updating in place (the
one-act-many-surfaces invariant, §5) and at most a quiet inline "recorded ✓"
beside the act; never a toast.
**Resolved by R51.**

### R46 · Tracked parties — GC and vendor courts without a login — 2026-06-15

The ball-in-court needs four courts (designer / client / gc / vendor), but a GC or
a vendor has no Patina login in v1 and onboarding one is not Track 5's job.
**Parties are tracked, not authenticated.** `project_parties` (00212) holds a
GC / vendor / client_rep / other per project — display name, company, email,
phone, optional `vendor_id` — and `profile_id` is **NULLABLE**: a v1 party does
NOT log in. The designer records the party's move on its behalf through
`resolve_coordination_item` (the same one-act path a designer uses to record a
client's pick, R11). This is additive and forward-compatible: giving a party a
real login later is a flag flip (set `profile_id = auth.uid()`, the party then
reads its own court via 00217's party-self read path), never a migration. The
court bar groups open items by court so the designer sees, at a glance, whose move
each item is waiting on — even when "whose move" is a party who will never sign in.

### R47 · RFI answer authority — the designer writes, the GC court is tracked — 2026-06-15

An RFI's answer is the designer's to record. The RFI sits with the GC court while
open (`court='gc'`, the question is theirs to answer); resolving it WRITES the
`answer` and stamps `answered_by` / `answered_at`, and the default ball hand-off
returns the item to the designer's reading (`next_court_for`: rfi → gc while open,
designer on resolve). Because the GC is login-less in v1 (R46), the answer is
**designer-recorded** — the designer captures the GC's reply through
`resolve_coordination_item` exactly as a client's pick is recorded. The authority
to settle the item is the designer's; the court column tracks accountability (whose
answer this is), not write access. No new write surface for GCs ships in v1.

### R48 · The submittal split — vendor resubmits, only the designer approves — 2026-06-15

A submittal is a review loop, not a one-shot answer, so its two moves are split
across two acts and two parties. **A vendor resubmit creates a new
`coordination_item_revisions` row** (Rev-N history, 00214) via the RPC-only
`submit_coordination_revision` — the revisions table carries no broad write policy,
so a round can only be added through the function; **the item stays `pending`** (a
resubmit does not resolve anything — it puts a fresh revision in front of the
designer). **Only the designer approves a revision and resolves the item:**
`resolve_coordination_item` takes the approved `revision_id`, marks that revision
approved, and settles the submittal. The two acts never collapse into one —
submitting is the vendor's move (designer-recorded in v1, R46), approving is the
designer's. This is why the submittal carries its own RPC write path while the
other kinds resolve through the shared dispatch.

### R49 · The punch two-step — open with the GC, close by designer verify — 2026-06-15

A punch item is two moves: the GC fixes it, the designer verifies the fix. While
open the punch sits with the **GC court** (`court='gc'` — the fix is theirs).
**Resolving is the designer's verify-and-close step:** the resolve records the
verification note and the designer steers the ball home with the
`p_next_court` override (gc → designer) rather than the kind's default — the punch
does not auto-return, the designer's act is the closure. This is the one place the
explicit `p_next_court` argument earns its keep: a punch's "done" is a designer
assertion ("I checked it"), not a status the GC can set. Until that verify, the
punch stays an open GC-court item carrying its state.

### R50 · One thread per item — `comms_threads.coordination_item_id` — 2026-06-15

A coordination item's conversation — the back-and-forth on an RFI, the notes across
submittal rounds — lives in **ONE canonical thread** anchored to the item via
`comms_threads.coordination_item_id` (00216, partial unique index: one thread per
item). The item row's preview reads the latest post on that thread; the per-item
margin/row surfaces all point at the same thread, so the conversation never
fragments across the item's life. **`decision_comments` is retained for
back-compat** — existing decision comments keep working untouched (D7); the new
thread link is additive and the legacy comment surface coexists. New coordination
conversation flows through the one thread; old comment history stays readable where
it already lives.

### R51 · Quiet inline confirmation, never a toast (D2) — resolves O7 (Track 5) — 2026-06-15

A coordination act confirms by the document changing, not by an overlay shouting.
The resolve/nudge/extend/reassign/resubmit acts fan out across their surfaces in
one transaction (the §5 one-act-many-surfaces invariant) — the item's status, the
court bar's per-court count, the dependent task flipping blocked→todo, the margin
row — and **that visible change IS the confirmation**, optionally joined by a quiet
inline "recorded ✓" beside the act. **No toast, ever** (D2: nothing breaks through
by default). This is the same discipline the ⌘K ask-and-place follows (I30, the
inline "placed ✓" with no toast) and the no-badge ledger discipline (D8): the
surface answers "did that work?" by being true, not by interrupting. O7 (Track 5)
RESOLVED.

### R52 · Block-on-phase unlocks, it does not auto-advance — 2026-06-15

A coordination item can block FF&E, a task, or a phase (`blocks_kind`), mapped onto
the existing `blocking_status` axis so the legacy machinery and the Desk need-lines
read truthfully. **Resolving a blocking item UNLOCKS what it gated — it does not
advance the project's phase.** Clearing an FF&E block lets procurement proceed;
flipping a blocked task to todo lets the work resume; clearing a phase block lifts
the gate — but the phase advances only when its own gate is granted. The one
exception is the **sign-off**, which keeps its existing settle path: a sign-off is
an approval gate (R23) and its settlement still advances the project's real
vocabulary through the 00204 trigger, unchanged. Coordination unblocks; only the
gate-as-decision (the sign-off) settles a section. The distinction keeps "the GC
answered the RFI" from silently moving the project forward.

### R53 · Cycle prevention — DB self-reference only; multi-hop is app-side for v1 — 2026-06-15

The dependency web (an item blocks an FF&E line / a task; a task can be blocked by
an item) can, in principle, form a cycle. **The database enforces only the direct
self-reference guard** — an item cannot block itself, a task cannot depend on its
own blocker in a one-hop loop — because that is the constraint a trigger can hold
cheaply and correctly. **Multi-hop cycle detection (A blocks B blocks C blocks A
across mixed item/task edges) is handled app-side for v1** — the create/resolve
surfaces refuse to wire an edge that would close a longer loop. Pushing full
transitive-closure cycle detection into the database is deferred; the v1 webs are
shallow (an item gates a few lines or a task), the app-side check covers the real
shapes, and the DB self-ref is the floor that nothing can slip past. Promote to a
DB-side closure check if real coordination webs ever grow deep enough to need it.

### R54 · The Track 5 prototype is the canonical reference; the spec fold is owed — 2026-06-15

`docs/design/the-document/patina-project-coordination-prototype.html` is the
canonical look/feel reference for Project Coordination — the court bar, the
kind-grouped coordination band, the per-item rows, the resolve/nudge/extend/
reassign/resubmit acts, and the quiet-inline confirmation (R51) all read from it,
exactly as the Library and Composing Page prototypes governed Track 3. The
**the-document-spec.md Track-5 fold is owed post-merge** — the rulings R46–R54 and
the I36 implementation note land in the spec body at the next cut (alongside the
§14.15 open items still carried from Track 3), with the coordination_kind/court/
blocks_kind axes documented against §6 (stamps) and §11 (the presentation-layer
contract). Until that cut, this log plus the prototype are the authority; any
designer-visible call returns with screenshots per the standing protocol.

### I36 · Track 5 — Project Coordination built (R46–R54) — 2026-06-15

Project Coordination landed as the verified foundation
(`packages/supabase/src/hooks/use-coordination.ts` + migrations 00212–00220) plus
the designer surfaces, on `the-document/track5-project-coordination`. Built
additive-only (D7) — `client_decisions` is widened in place, never forked.

**`coordination_kind` is a NEW third axis, orthogonal to the two that already
existed.** The codebase carried `decision_type` (00084) and `decision_kind`
(00202); Track 5 adds `coordination_kind` (selection · rfi · submittal · signoff ·
punch) as a separate column (00213) and **leaves both prior axes untouched** — so
the existing gate logic (decision_kind 'approval' = R23's sign-off gate) and the
existing choice logic (decision_type) keep working unchanged. A coordination item
rides `decision_kind='choice'` and carries its real shape on the new axis; the
sign-off is the bridge (coordination_kind='signoff' is a decision_kind='approval'
gate, R52). `court` and `blocks_kind` join it (00213); `blocks_kind` maps onto the
reused `blocking_status` axis (ffe→blocks_procurement, phase→blocks_phase,
task/none→non_blocking) so the legacy FF&E/phase machinery and the Desk need-lines
read truthfully with zero edits.

**Submittal revisions are RPC-only-writable.** `coordination_item_revisions`
(00214) has no broad write policy; a Rev-N row can be added only through
`submit_coordination_revision` (R48) and the item stays pending. Approval/resolve
flows through `resolve_coordination_item` (00218, SECURITY DEFINER), which
dispatches by kind, then in the SAME transaction clears FF&E blocks, flips
downstream tasks blocked→todo (00215 `blocked_by_item_id`), and shifts the ball via
`p_next_court` / `next_court_for` (R47/R49). The one-act-many-surfaces fan-out
(§5) is the resolve hook's invalidation pass (coordination-items + section-tasks +
margin-items + document-state + project-decisions + FF&E), with an optimistic
cascade preview (the item resolves, its dependent tasks unblock) and rollback.

**GC/vendor courts are login-less, so the existing notify covers all kinds.**
`project_parties.profile_id` is nullable (R46); a v1 GC/vendor never signs in, the
designer records its move. Because no new external actor receives notifications,
the shipped client+designer notify path (`notify_decision_required` /
`notify_decision_resolved`, 00173/00174 + the overdue cron) already addresses
every party that can act — the client when the ball is in their court (they read
their coordination items through the SAME `designer_clients.client_id=auth.uid()`
RLS that already let them read decisions), and the designer otherwise. **00220 is
therefore an intentional NO-OP** — a documentation migration confirming the notify
coverage rather than adding DDL; every coordination_kind is already a first-class
citizen of the decision notify path. Read models: `coordination_court_summary` /
`task_blocked_state` (00219); one thread per item via
`comms_threads.coordination_item_id` (00216, R50). Migrations now **00191–00220**.

---

## Rulings — design session, 2026-06-15 (The Decision Composer — the authoring half)

> Closes the Feature Gap Matrix's **Decisions zone #1 P0 cluster — composition.** The read/act half is already FULL (margin `DecisionBody`, override-consent, nudge) and Track 5 (R46–R54, I36) generalized the decision in place (coordination_kind · court · blocks_kind) and built the resolve cascade. What remained absent is the **authoring** half — creating, building, and publishing a decision from inside the Document. These two rulings build it, ratifying `patina-decision-system-prototype.html` (the composer depth) against `portal-vs-desk-feature-gap-matrix.md`. The project-coordination half of the original decision-system package is NOT re-ruled here — it shipped as Track 5. Source/look-feel: `patina-decision-system-prototype.html`; build foundation: Track 4 (the Drafting Room sheet machinery, R42–R45) + Track 5 (the widened `client_decisions`, R46–R54) + the Composing Page's fill-in-any-order grammar (R40).

### R55 · The decision composer — create / build / publish from the margin — 2026-06-15

Resolves the Decisions zone's seven P0 composition rows. The legacy create/edit surfaces — `/portal/clients/[id]/decisions/new`, the `DecisionComposerModal` on project detail, the `DecisionNewPicker` "+ New" picker, `/portal/decisions/[id]/edit` — are reconceived as **one composition sheet**, opened from the margin ("+ New") or from a project section, never a full-page modal or a separate route. It reuses the editing-mode sheet machinery from Track 4 (the Drafting Room / proposal instruments) and the Composing Page's grammar (R40): the sheet composes **in any order**, shows its own gaps, and is a savable draft at every point.

The sheet composes: **decision_kind** (the taxonomy — Material/Color · Product · Layout · Finish · …) · **title** · **context** (the client-facing explanation) · **options** via a `DecisionOptionBuilder` carrying full attributes (name, price, quantity, image/swatch, designer note, the recommended "pick") · **materialize options from the Library** (the draft-product-seeding path, `useMaterializeDraftOptions` — the librarian seeds options one tap away) · **due date** · **link to a project phase** · **blocking** (a toggle plus the FF&E line it gates). The **lifecycle** is draft → publish → delete: save as **draft** (unsent, client-invisible, editable in the margin — `useCreateDecision` / `useUpdateDecision`); **publish** to the client (draft→pending, `usePublishDraftDecision`); **delete** (destructive). Editing an unsent draft re-opens the composer on it.

**The authoring side of the one-act invariant (§5):** publishing a *blocking* decision lights the `decision_due` stamp on its FF&E line the instant it goes pending — the mirror image of Track 5's resolve cascade (which clears the stamp and unblocks procurement). The clearing/resolve half is Track 5's `resolve_coordination_item`, unchanged; this ruling owns only the create→publish→light direction.

**The composer is the authoring front door for the generalized item, too.** A selection is the default decision; an RFI, submittal, sign-off, or punch (Track 5's coordination kinds) is *composed* through this same sheet — the composer writes the row, Track 5 resolves it. One create-surface, one resolve-path. Declined from scope: a full-page composer, a modal, a separate "+ New" picker route, decision *analytics* (P2), and internal-only designer notes surfaced in the client-visible margin.

### R56 · The enriched decision detail — the deep margin sheet — 2026-06-15

Resolves the dozen PARTIAL Decisions rows by deepening the read-only margin `DecisionBody` into an expandable sheet — in the **designer's** view, not only the client mirror. It adds: the **decision_kind** on the kind-line; the **rich context** (ported from the client mirror to the designer's view); **full option attributes** (price, quantity, imagery, designer note, the "Your pick" recommended badge — previously option names + badges only); the **status lifecycle** made legible (draft / pending / overdue / responded / resolved); **extend + nudge** controls when pending or overdue; and the **full resolution audit trail** (choice, recorded-by, consent method, evidence, timestamp — previously a quiet "Resolved · date" line only).

The two FULL flows are **preserved verbatim**: apply **designer override** (`useApplyDecisionOverride` — option select → consent-method radio verbal/written/text/email → evidence → Record) and **send reminder** (`useSendDecisionReminder`). Both keep the one-act-many-surfaces invariant (§5): a record updates the margin item, the Desk need-line, and the FF&E line stamp in a single act. Discussion stays **transformed** into the project comms thread (R27) and the one-thread-per-item model (R50, Track 5) — never a per-decision feed. Decision analytics (P2) and internal designer notes stay out of the Document.

### I37 · Track A — the decision composer built (R55) — 2026-06-15

The audit confirmed what the handoff predicted: R55's "front door for Track 5" was **already built**. Track 5's `ItemComposer` + `useCreateCoordinationItem` already compose all five kinds, draft/publish, materialize Library options, and — crucially — already set `project_ffe_items.blocked=true` + `blocked_by_decision_id` on gated lines (the exact write that lights `decision_due` once status flips to pending). So R55 = **generalize-and-extend the existing composer + give it a margin home**, not a rebuild. One create-surface, one resolve-path, literally.

**Built (additive, NO migration — new sheet surfaces + 3 hooks over the existing data layer):**

- **`ItemComposer` generalized** (`components/document/coordination/item-composer.tsx`): added the **FF&E-line gate** picker (the missing R55 piece — selecting FF&E lines sets `blocksKind='ffe'` + `blockedFfeItemIds`, which lights the stamp on publish), the **subject-matter taxonomy** chips, a **separate client-facing context** field (R55 lists title *and* context), the **phase link** (`phase_id`, hidden when a project has no phases), and **edit mode** (hydrate a draft → update → optionally publish; "EDIT DRAFT" header). The blocks-kind ladder is a tested pure helper `deriveBlocksKind` (ffe > phase > task > none).
- **Margin "+ New"** (`margin-rail.tsx`): a "+ New" affordance beside "+ Note" opens the composer as a `DocSheet` (document stays mounted, D1; zero shadow, D4), gated on a resolved `designer_clients.id` (the band's `useDesignerClientForClientUser` pattern — the historical RLS-bug guard). A **"Drafts · N"** disclosure lists unsent drafts (read from `useCoordinationItems` filtered to `status='draft'`); clicking one re-opens the composer in edit mode. Threaded `clientUserId` from `doc/[id]/page.tsx`. The band's "+ New open item" gets the same enriched composer.
- **Three lifecycle hooks** (`use-coordination.ts`): `useUpdateCoordinationItem` (patch + option-replace + FF&E/task re-tag), `usePublishCoordinationItem` (draft→pending with the §5 invalidation set the legacy `usePublishDraftDecision` omits), `useDeleteCoordinationItem` (clears the dependency web first so no line is stranded blocked, then deletes). `CreateCoordinationItemInput` gained `decisionType` + `phaseId`.

**Reconciliations (implementation-authority calls; surfaced here per the workstream):**
1. The handoff's *"decision_kind taxonomy (Material/Color/Product/Layout/Finish)"* maps to the **`decision_type`** column (00084), **not** the literal `decision_kind` column (00202: choice|approval, the section-gate axis — left at 'choice', untouched). "Finish" folds into the existing seven values (no CHECK-redefine migration).
2. **Light-on-publish**: a draft sets `blocked=true` at create but the stamp stays dark (status='draft'); publishing flips status→pending and the stamp lights — no new stamp logic, just the two ends of `project_ffe_items.blocked` (R55 owns the light; Track 5's `resolve_coordination_item` owns the clear).
3. Phase link writes the real FK `phase_id`, not the legacy free-text `linked_phase`.

**Verified:** designer + supabase type-checks clean (Track-A files zero errors; only the pre-existing `packages/email` React-18/19 noise remains); `deriveBlocksKind` unit 25/25; a self-rolling-back **SQL smoke** proving draft(dark)→publish(lit)→`resolve_coordination_item`(cleared); and a **LIVE CHROME WALK GREEN end-to-end** on Olsen Lake House (`b65803e7-…`, designer@patina.dev): margin "+ New" → compose a blocking selection gating *Cloud Pendant Cluster 19* → **Publish lights the `DECISION DUE` stamp** + the court bar, the open item, and a margin decision all update in one act → **record the pick → the stamp clears to SHIPPED, the court empties, FF&E returns to 3-of-3, the margin folds to Settled** (one act); plus save-as-draft → "Drafts · 1" (client-invisible) → re-open hydrated → delete (inline two-tap confirm). Demo aid: `scripts/the-document-decision-composer-demo.sql` (wires Olsen a client so the composer resolves).

⚠ **Owed / notes:** screenshots-to-disk + the ~390px mobile fold (the `save_to_disk` no-file env constraint, as Track 5 — captured in-conversation only); during the walk two **local-only** infra artifacts surfaced and were cleared by a PostgREST restart (a stale schema cache blocking writes, and the Track-5 `project_parties` RLS-recursion noise — both fixed on `main`, not code); **Track B (R56)** — the enriched margin `DecisionBody` — is the next PR.

### I38 · Track B — the enriched decision detail built (R56) — 2026-06-15

Deepened the read-only margin `DecisionBody` (`components/document/margin-bodies.tsx`) into the enriched detail, in the **designer's** view (not only the client mirror). **No migration** — the body already reads the full `client_decisions` row via `useDecision` (`select('*, options(*)')`) and the trail via `useDecisionOverrides`; nothing in the schema was missing.

**Added** (the dozen PARTIAL Decisions rows): a **kind-line** (the subject `decision_type` · the shape+court when not a plain client selection · an approval-gate note · the lifecycle word); the **rich context** (the `decision.context` paragraph, the client-mirror pattern ported to the designer view); **full option attributes** (image swatch · name · `fmtUsd(price·qty)` · ×qty · designer note · the "your pick"/"chosen" badges — was option names + badges only); **status lifecycle** made legible (pending / overdue / resolved / expired); and the **full resolution audit trail** — chosen option + value + responded-at + response time + each override-consent record (who recorded it · consent method · evidence · timestamp), replacing the date-only "Resolved · date" line. The four non-selection Track-5 shapes (rfi/submittal/signoff/punch) render **read-only** in the margin (they resolve in coordination; `apply_decision` is selection-only) — a small branch on `coordination_kind`.

**Preserved verbatim** (R56 mandate): `useApplyDecisionOverride` (the option→method→evidence→Record consent flow), `useSendDecisionReminder` (nudge), and `useUpdateDecision` (extend) — same params, same `onSuccess → invalidateMarginSurfaces`. The "expandable sheet" is realized as the margin item's **inline unfold** (its existing expand), which keeps the one-act controls in the margin where §5 wants them rather than behind a separate overlay. One §5 tightening: `invalidateMarginSurfaces` now also invalidates `['coordination-items', projectId]`, so a decision recorded from the margin keeps the coordination band in sync in the same act (it reads the same widened row).

**Verified:** designer type-check clean (Track-B files zero errors); **LIVE CHROME WALK GREEN** on Olsen Lake House — a seeded pending blocking selection with imagery/price/qty/notes rendered the full enriched body (kind-line, context, swatched options, nudge/extend); recording the client's pick through the preserved **override-consent** strip (option · email-excerpt · evidence) resolved it in one act (FF&E `DECISION DUE` → SHIPPED, margin → Settled) and the settled body showed the complete **Resolution** trail ("Chosen: Glazed stoneware lamp · $3,780 · same day to decide" + "YOU RECORDED · email excerpt · …" + the evidence). ⚠ Owed: screenshots-to-disk + the ~390px mobile fold (the `save_to_disk` env constraint).

### I39 · The spec v1.5 fold — Tracks 3–5 + the Decision Composer (R54's owed cut) — 2026-06-16

`the-document-spec-v1.5.md` written, **superseding v1.4** and discharging R54's owed "spec fold." A self-contained "supersedes" cut on the v1.4 structure: header bumped (status, authority order `I1–I38 · R1–R56 · L1–L4`, migrations through **00220**, the three new prototypes added); the §2 ratified-decisions table extended **R41–R56**; the existing sections folded in place (§3 the Rooms-shell physics now reusable; §4 the Drafting Room doorway + the Coordination band + the enriched detail; §5 the Decision margin's authoring half + coordination-as-decisions + the band joining the §5 invalidation set; §6 `blocks_kind`↔`blocking_status` + the `decision_due` light/clear hinge; §8/§16 **Track 3 SHIPPED**; §10 zero-shadow across the new surfaces; §11 schema through 00220; §12/§13 the gap-matrix #1/#2 P0 clusters CLOSED). **Three new sections** added (numbers permanent, as §16 was): **§17 Proposal Authoring — the Drafting Room** (R42–R45) · **§18 Project Coordination — the ball-in-court** (R46–R54) · **§19 The Decision Composer** (R55–R56). **§14 open questions** carries §14.15 (Via-Patina rate) and adds §14.16–§14.19 (the Track-4 provisional thresholds + facet order; the sign→project two-step; GC/vendor logins + deferred cycle/PO links; the `decision_type` "Finish" taxonomy call) — all flagged for Leah. The **gap matrix** (`portal-vs-desk-feature-gap-matrix.md`) gains a dated **PARITY UPDATE banner** recording the two closed clusters (the source-verified per-row baseline is left intact, not rewritten). v1.4 is retained as history (the spec is versioned cuts). ⚠ Designer-visible calls flagged in §14.16–§14.19 still route to the design session per the standing protocol.

## Rulings — design session, 2026-06-14 (The People Room)

> Source: `docs/design/the-document/people/patina-people-room-prototype.html` +
> `…/the-document-people-room-package.md`, against the Feature Gap Matrix
> CRM/People zone (17 gaps — the placeholder book). Renumbered from the package's
> R50–R53 to the true next-R (the live repo was at R56 after the Decision
> Composer; the package's "assume R49" snapshot was stale). Resolves the
> People-placeholder dependency that the decision ball-in-court (R46–R54) needed:
> GCs/vendors are first-class via project_parties (00212).

### R57 · The People Room — the unified party directory, as a Room — 2026-06-14 (pkg R50)

The People book opens as a **walk-in Room** (D14 — full-bleed paper, put-down
returns to the origin stash), NOT a Studio Drawer sheet like Orders/Accounts. Its
spine is a **unified directory of every party Patina works with — clients,
makers/vendors, GCs, studio team, and open leads — in one roster**, role-filterable
(All/Clients/Makers/GCs/Team/Leads), each row carrying a role badge + a
role-appropriate relationship line + a status dot. A left rail switches between
six **views** (Strata-ruled, not tabs): Directory · Threads · Nurture · Reviews ·
Portfolio · Outreach. An **ask bar** queries over people + history (derivation-
backed v1 — keyword routing + the nurture-derived Engine nudge; semantic people-
search deferred). New leads enter the directory; lead detail cross-links to the
Brief. Declined: a clients-only CRM; a sheet form; a separate per-zone contacts
page.

### R58 · The relationship journey — the role-adaptive profile — 2026-06-14 (pkg R51)

Opening a person opens a **role-adaptive Person Profile** whose heart is the
**Relationship Journey** — a single woven timeline (inquiry → proposal → project →
messages → decisions → touchpoints → install → care). **The journey is a
DERIVATION, not a stored activity log** (`deriveRelationshipJourney`) — woven from
the person's document history (projects, proposals, decisions), their threads,
their nurture touchpoints, and their reviews, the same way sections/Desk/margin
are derived. The pre-existing `client_activity_log` is NOT extended. For
**clients** the profile also shows **Style DNA — the Engine's read** (taste tags +
palette + narrative, from `designer_clients.style_tags/style_preferences/
inspiration_quote` + the `styles` taxonomy; no parallel store), plus Projects,
Trust & history, Nurture, and a private note. For **makers/GCs/team** the profile
adapts: makers/GCs cross-link to the Orders book + the coordination view; team
links to document margin visibility (the colophon).

### R59 · Relationship operations — threads, nurture, reviews, portfolio — 2026-06-14 (pkg R52)

Four operating views over the directory. **Threads** is a unified inbox — every
conversation in one list, scope-filterable (all/direct/project/vendor), opening to
a conversation (read + reply) — reusing the `use-comms` shared model: a thread is
**one conversation surfaced everywhere** (it lives on the person AND on their
document margin, R27), never duplicated. **Nurture** is the touchpoint queue —
relationships ranked by dormancy + trust (`deriveNurtureQueue`, a derivation), the
proposal-hesitating/dormant-high-trust ties floating to "reconnect now". **Reviews**
is three-state collection (pending/collected/queued). **Portfolio** is the
finished-rooms gallery (completed projects).

### R60 · Outreach + People on the Desk + the cross-link contract — 2026-06-14 (pkg R53)

**Outreach** is the marketing-ops view: **campaigns** (list/compose/send/stats), an
**email template library** (browse/author/edit/delete), and **audience segments**
which **draw from the same directory** (segment by role/status/history/trust).
**People on the Desk:** nurture-due / reconnect surfaces as a Desk **need-line** (a
`desk-derivation` extension — a dormant high-trust tie is a need); the inbox
*notifications* tab + the Sales Pipeline stay TRANSFORMED into the Desk/margin
model (not rebuilt). **Cross-link contract (not rebuilt here):** maker/GC
terms+orders live in the Orders book; GC open-items in the coordination view; team
invite/management stays /portal/team (the colophon handles margin-visibility);
lead detail cross-links to the Brief. The People Room is the *people* layer over
those, not a re-home of them.

### I40 · The People Room — Wave 0 architect foundation built (R57–R60) — 2026-06-16

The blocking foundation the four build tracks plug into. **Migration 00221** —
`public.people_directory`, an **additive security_invoker VIEW** (D7) that
`UNION ALL`s clients (`designer_clients`) + open leads (`leads`) + makers
(`vendors` saved via `saved_vendors` or engaged via `project_parties.vendor_id`) +
GCs (`project_parties` party_kind='gc') + team (`project_team_members`, de-duped to
one row per teammate) into one roster: `(person_id, role, display_name, email,
phone, profile_id, project_id, designer_id, status_raw, last_touch_at, meta)`. RLS
is inherited (security_invoker) + explicit `auth.uid()`/project-ownership filters;
verified scoping (a designer sees only their own roster). **`people-derivation.ts`**
freezes the contracts: `DirectoryPerson`, `JourneyEvent`, `NurtureEntry`,
`JourneyInputs`, tunable thresholds (NURTURE_DUE_DAYS=240, DORMANT=180,
LEAD_RESPOND_HOURS=24, MAKER_WARM_DAYS=75), the implemented directory helpers
(`deriveStatusDot`/`deriveRelationshipLine`/`isNurtureDue`/`roleLabel`) + a working
`deriveNurtureQueue`, and the **stubbed `deriveRelationshipJourney`** (Track B fills
the body; the input contract is frozen). Key model call: the directory **status
dot** and the nurture **"due" accent** are SEPARATE signals — a proposal-stage
client reads a warm dot but is nurture-due (David Chen). **`use-people.ts`**
(`usePeopleDirectory`/`usePerson`) + barrel + the view added to `database.types.ts`.
**The Room skeleton:** `(document)/people/page.tsx` + `people-room.tsx` (RoomShell +
ask bar + Strata-ruled left rail + the live Engine nudge from the nurture queue) +
the frozen view contract (`types.ts`) + shared primitives (`person-bits.tsx`
avatar/badge/dot, `view-shell.tsx`) + the minimal-real **Directory** view + stub
slots for B/C/D. **Drawer flip:** People `weight:'sheet'`→`'room'` in
`studio-drawer.tsx` + `mobile-sheets.tsx` (the dead generic-sheet placeholder
removed). **Verified:** view applies + scopes correctly against the live schema;
supabase pkg tsc clean; designer-portal People files tsc-clean (0 new errors);
15/15 `people-derivation` Jest tests green. ⚠ Wave 1 (Tracks A–D) builds the view
bodies + the journey/nurture/desk derivations against these frozen contracts;
spec-fold of R57–R60 + the gap-matrix CRM parity update are owed post-review (Wave 3).

### R61 · Lead intake triage on the Desk — Accept→Discovery, Nurture, Pass (Track 6 / G1) — 2026-06-18

Closes gap-analysis **G1** (lead intake has no in-Document home). The data layer is
already complete: `document_state` (00211) unions Shape **C** `lead` (Brief active,
`leads.status in ('new','viewed','contacted')`) and Shape **D** `relationship`
(Discovery active, `designer_clients.status='lead'` AND no live proposal/project).
So a captured lead **already** surfaces as a Brief folder; triage is the missing act.

**The three triage verbs (prototype P0 §G1):**
- **Accept → Discovery.** New mutation **`useBeginDiscovery`** (`@patina/supabase`,
  Wave 0): sets `leads.status='accepted'` + upserts `designer_clients.status='lead'`
  → the folder flips Brief→Discovery ("Schedule the discovery call"). **Conflict
  found + SQL-verified:** the old-portal `useAcceptLead` sets `status='active'`,
  which is **invisible** in `document_state` (no project → not Shape A; not 'lead' →
  not Shape D). Empirically 3 active/no-project rows → 0 visible; flipped to 'lead'
  → 1 Discovery row. `useAcceptLead` is **left untouched** (D7 — old zone keeps
  working); the Document uses `useBeginDiscovery`.
- **Nurture → People (off the Desk).** `useUpdateLeadStatus('contacted')`. Because
  Shape C still includes `'contacted'`, `desk-derivation` must **gate the `new_lead`
  needs-hand folder to `status in ('new','viewed')`** so a nurtured lead leaves the
  needs-hand band and lives in People's nurture/reconnect queue. Additive, no migration.
- **Pass → declined.** Existing `useDeclineLead` (`status='declined'`) — drops Shape C,
  stays in People as declined. Works as-is.

**One-act-many-surfaces:** the triage component invalidates the Desk/document-state
query keys in its own onSuccess (the desk key lives in the app) so the folder
re-derives without reload. ⚠ Provisional (flag to design): whether Nurture also
schedules a concrete touchpoint vs. only marks 'contacted'; the post-accept need
verb ("Schedule the discovery call").

### R62 · The Capture front door + people in ⌘K (Track 6 / G1 capture, G3) — 2026-06-18

A **"＋ Capture a lead"** CTA on the Desk header and a ⌘K **"new lead"** command
both open a `CaptureLeadSheet` (DocSheet overlay, D1/D4) collecting name · contact ·
project one-line · source → `useCreateLead`. Set a default `response_deadline`
(**+1 day**, per R10's "respond within a day" lead window) so the new lead rises as a
`new_lead` need on the Desk (Shape C already surfaces it). ⌘K filter is **alias-aware**
("new lead"/"new client"/"capture" all match the command, not only "Ask the Engine").
**G3:** ⌘K also returns **"jump to [person] →"** rows from `usePeopleDirectory` — the
missing noun beside documents + ledgers. ⚠ Provisional: the capture source list +
whether capture routes to `/doc/{leadId}` or stays on the Desk with optimistic insert.

### R63 · The proposal action — expired-state instruments + stage-consistent letterhead (Track 6 / G2) — 2026-06-18

Closes **G2** (the proposal stage is read-only). Root cause: `proposal-instruments.tsx`
gates its actionable row to `isLive = sent|viewed|accepted|revised` — an **expired**
(or declined) proposal matches neither `isDraft` nor `isLive`, so **no instrument
renders**, even though the Desk advertises "Proposal expired — revise or follow up."
**Close it:** expired/declined offer **Preview · Resend · Revise** (reuse the existing
`SendSheet`→`send_proposal` and `ReviseSheet`→`clone_proposal`). Make the **letterhead
instruments stage-consistent** (View as the client · Send a note) across Brief→Care
instead of project-only. **Follow-up needs no migration:** route "Send a note" through
the existing **`rpc_start_direct_thread(counterpart)`** (00103) — a designer↔client 1:1
thread that needs no `project_id` — using the proposal's/relationship's `client_id`.
(`rpc_start_project_thread` is project-keyed and can't serve a pre-project proposal.)

### R64 · The runaway-timer bound (Track 6 / G4) — 2026-06-18

Closes **G4** (a 36h, ~2,187-quiet-minute timer was offered as a loggable close-out).
`time-derivation.ts` has `idleSecondsFromPings`/`IDLE_THRESHOLD_SECONDS=60` and
`LogOffer.idleSeconds`, but **idle is annotation-only (D10) with no runaway bound** —
`closeOutTimer` proposes the full elapsed regardless. **Extend D10 with an abandonment
guard** (does NOT reverse it — normal short idle still annotates, never trims): a
**contiguous idle gap ≥ a runaway threshold** (provisional **30 min**) marks the timer
abandoned; on abandonment the close-out proposes the **active** duration
(elapsed − idle), idle annotated, not summed; and `document-time-provider` **auto-pauses
accumulation** at last-activity (+grace) on long idle / session end so raw seconds can't
balloon while a tab is closed. ⚠ Provisional + Leah-facing (flag to design): the 30-min
runaway number and the auto-pause behavior — mirror the IDLE_THRESHOLD "watch with data"
posture.

---

## Rulings — design session, 2026-06-18 (Track 6 provisionals resolved)

### R65 · Track 6 provisionals resolved — intake, capture, the proposal act, the timer bound (resolves the R61–R64 ⚠ flags) — 2026-06-18

Resolves the four "flag to design" provisionals carried in R61–R64, from a design interview. Track 6 is fully specified for build after this.

**R61 — Nurture schedules a touchpoint (not merely 'contacted').** Tapping **Nurture** on a lead captures a **reconnect date**; the lead leaves the Desk's needs-hand band immediately (`useUpdateLeadStatus('contacted')` + the R61 gate to `status in ('new','viewed')`) and **rises again as a Desk need when that date is due** — a dated thing earns a return (R22); an undated nurture is only a hope. A skipped date falls back to shelve-to-People (the Engine's "worth reconnecting" still covers it). Build it as a nurture/touchpoint row `desk-derivation` surfaces on/after its due date. The **post-accept need verb stays "Schedule the discovery call"** (confirmed, not reopened).

**R62 — capture opens the new Brief; the source field is free-text with suggestion chips.** After `useCreateLead`, **route to `/doc/{leadId}`** — the captured lead opens as its Brief document so the designer continues filling it immediately (the sheet is the ≤5s front door; depth continues in the doc). The **"Where from" field is free-text with the common sources as quick chips** (Referral · Website / style quiz · Instagram · Past client · …), flexible for odd channels. **Build note:** store a canonical `source` when a chip is chosen (free text otherwise) so People's pipeline-conversion and referral-rate stats stay clean despite the free entry.

**R63 — confirmed as written; Revise is the primary expired/declined act.** For an expired or declined proposal, **Revise** (a superseding new version via `clone_proposal`) is the prominent instrument; **Preview** and **Resend** are secondary; there is **no distinct "Follow up" button** — follow-up is the letterhead's **"Send a note"** (the 1:1 `rpc_start_direct_thread`, R63). The Desk's "revise or follow up" maps to Revise + Send-a-note. Letterhead instruments stay stage-consistent Brief→Care (R63 stands).

**R64 — confirmed as written.** A **contiguous idle gap ≥ 30 min** marks the timer abandoned; the close-out then proposes the **active** duration (idle annotated, never summed — D10 upheld); `document-time-provider` **auto-pauses accumulation at last-activity (+grace)** on long idle / session end so raw seconds can't balloon while a tab is closed. The 30-min number and the auto-pause both carry the IDLE_THRESHOLD "watch with data" posture — revisit if week-one data shows false pauses.

The spec fold for Track 6 (R61–R65) rides the next cut (v1.7); the prototype `patina-p0-intake-and-proposal-prototype.html` is the look/feel reference for the intake + proposal-action surfaces.

---

## Rulings — design session, 2026-06-18 (Track 6 addendum — the Discovery section)

### R66 · The Discovery section — structured capture between intake and the proposal (Track 6 / the lead→proposal gap) — 2026-06-18

Closes the hole between Track 6 intake (lead→Discovery, R61) and the proposal (Track 4): the Discovery section's body — previously an inert spine bar ("Brief/Discovery/Direction bars are inert until their unfolds are designed") — now has a capture method. Grounded in discovery best practice (the written intake captures facts; the call captures hesitation, tone, priorities, decision-making style) and ruled to the Document's grammar in a design interview.

**Discovery is a self-composing section (R40 grammar), designer-captured.** No client-facing questionnaire in v1 — the designer captures Discovery from the intake + the discovery call, one source of truth. The section fills **in any order**, shows its own completion, is usable at any percent, and the **Strata mark is the only progress device** — the anti-wizard pattern, never a SaaS form.

**Structured essentials, unstructured margin — the load-bearing split.** The Discovery blocks capture **structured data**, typed fields rather than freeform prose: project **type** (enum) + a **room list** · a **budget range** · **target / hard dates** · **style tags** (the Aesthete vocabulary) · per-room **lifestyle**. Structured on purpose — the readiness check must be real, and the data must seed the proposal cleanly (field → field). The **margin holds only unstructured notes** — the call's tone, hesitations, the designer's hand (a Note, R14) — and **never** structured discovery facts. Facts live in the blocks; the human read lives in the margin.

**The blocks — five essentials + deepening.** Essentials (structured; they open the proposal): **Scope & rooms · Budget · Timeline · Style & inspiration · How they live** (the per-room lifestyle that makes a proposal specific). Deepening (structured where it helps, not gating): **Keep & avoid · Decision-makers · The site & scan**. The room scan (R27 iOS RoomPlan) and the inspiration board clip into the **folio** (R24).

**The discovery call writes into the structured blocks.** R61's "Schedule the discovery call" need leads to a **call checklist** (scope · how-they-live · budget · timeline · style · keep/avoid · deciders) that records facts into the structured fields; the call's tone and hesitations land in the **margin** as a Note (unstructured).

**"Successful discovery" = essentials filled → ready (soft gate).** When the five structured essentials are captured, Discovery reads **"ready for Direction,"** the spine stamp settles, and Direction/the proposal opens. The fill-state is the Document's native "done" — no sign-off ceremony, no hard block on authoring (R23 gates are reserved for client-granted approvals; discovery is not one).

**Auto-seed (interview ruling).** On readiness, the **structured essentials auto-seed the Direction and the proposal Drafting Room** — type, rooms, budget range, style tags, and the keep-list map field → field into the concept and the proposal draft (clean precisely because they're structured). Not reference-only.

**Internal (interview ruling).** Discovery stays **fully internal in v1** — no client-confirm summary step; the Direction begins on the designer's readiness. A client-facing discovery questionnaire / confirmation can return later if pilots ask for it (flag, not built).

Look/feel: `patina-discovery-section-prototype.html`. Builds onto Track 6 intake (R61–R62), feeds Track 4 (the Drafting Room). **Additive** — the Discovery body is a structured-capture + presentation layer over the existing `leads` / `designer_clients` / engagement shapes (Shape D, R61); the structured essentials map to existing project/proposal fields the auto-seed populates. **Audit-first:** confirm where type / rooms / budget / style / dates already persist before adding columns.

---

## Implementation — The Document, Track 6, Slice 5 (the Discovery section, R66) — 2026-06-19

### I41 · The Discovery section is live — structured capture → seeded draft proposal

Built R66 as `the-document: track6 5 — the Discovery section`, additive, behind
`the-document-pilot`. The inert `DiscoverySection` stub (quiet-sections.tsx) is replaced
by a self-composing structured-capture body (`components/document/discovery/`). The data
layer was genuinely missing (audit-first): the five essentials had no Discovery-stage home.

**Migration `00224_client_discovery.sql` (additive, D7):**
- `client_discovery` — a 1:1 structured table keyed on `designer_clients.id` (Shape D),
  NOT enriching the hot `designer_clients` row. Typed scalars (project_type, budget_min/max,
  target/hard dates, style_tag_ids) + jsonb for the list-shaped fields (rooms, lifestyle,
  keep/avoid, decision_makers). Designer-scoped RLS via a denormalized `designer_id`.
- **`begin_direction_from_discovery(designer_client_id)`** — the readiness act: validates the
  five essentials, creates a seeded DRAFT `proposals` row (+ `proposal_scope_rooms` field→field,
  a `vision` style section, the budget range on the description), stamps the discovery row.
  Idempotent. After it commits, the engagement leaves `document_state` Shape D (a proposal now
  exists) and enters Shape B with `active_section='direction'` (00211) — **the Drafting Room
  opens pre-seeded**, no view change. Verified live: "Begin the Direction" → the Direction body
  showed "Seeded from Discovery · budget 60,000–80,000" + PER-ROOM BUDGETS Living/Dining.

**Design rulings resolved (the audit's C1–C4, ratified with Kody):**
- **C1 / margin at Discovery.** R66's load-bearing split (structured facts in the blocks; the
  call's tone as an unstructured Note in the margin) needs the margin to work pre-project.
  `margin_notes` gains a nullable `designer_client_id` (relaxed `chk_margin_notes_engagement`).
  Since the Note is the *only* margin kind possible at Discovery (no project/proposal → the
  project/proposal-keyed `margin_items` view can't reach it), the Discovery margin reads
  relationship-keyed notes **directly** from `margin_notes` (`use-discovery-margin.ts`, mapped to
  the view's note-branch shape). The rail can only write a Note (no structured-upsert access), so
  the "margin never holds structured facts" invariant holds by construction.
- **C2 / folio at Discovery.** `project_documents` gains a nullable `designer_client_id`
  (`project_id` NOT NULL relaxed; storage policies gain the relationship leg). The inspiration
  board clips here (`useDiscoveryFolioFiles`/`useUploadDiscoveryFolioFile`, folder = the
  designer_client_id); the room scan plugs into the existing `room_scans` (no new table).
- **C3 / the call checklist material.** Added `DocPaperSheet` (centered cream paper, ink
  hairline, zero shadow) alongside `DocSheet` — the prototype's checklist is paper, not the
  charcoal bottom-ledger. Same Esc/backdrop/focus semantics (D1).
- **C4 / style vocabulary.** Style tags read the global `styles` table via `useStyles()` and
  store `style_tag_ids uuid[]` (matches `product_styles` grain).

**v1-pragmatic seed (flag to design if a richer seed is wanted):** rooms map field→field to
`proposal_scope_rooms`; the budget range + style read seed the proposal envelope (description +
a `vision` narrative). Per-room budget allocation and style→palette swatches stay for the
designer in the Drafting Room.

**Readiness is a soft gate (R66/R23):** authoring the blocks is never blocked; only the
Begin-the-Direction CTA + the seed RPC require all five essentials. No client sign-off.

**Verification:** SQL smoke 8/8 (`scripts/the-document-discovery-smoke.sql` — Shape D→B flip,
2 scope rooms, idempotent, not-ready raise); 24 unit tests (`discovery-readiness` + `discovery-seed`);
designer-portal tsc at the 260 baseline (0 new); **live Chrome walk GREEN** (designer@patina.dev,
:3000): section renders (0 console errors), blocks open in-place with typed editors, a UI edit
persists via the debounced upsert, 5 essentials → "Ready for Direction" (StrataMark fills, ticks
fill, CTA enables), Begin the Direction → Direction opens pre-seeded, and a margin Note persists
notes-only at Discovery. Migrations now **00191–00224**.

⚠ Owed / provisional: ~390px mobile screenshots; a standalone `next build` was deferred to avoid
clobbering the live dev server (the dev runtime compiled every new surface — same SWC/webpack
path — with zero errors); the folio upload couldn't be driven under the env's file-upload
constraint (schema + RLS + UI in place, verified by construction). NOT yet on prod (prod owes
00221–00224 + apps).

---

## Rulings — design review, 2026-06-22 (Account visibility in the Desk)

### R67 · The maker's nameplate + the Account sheet — account visibility in the Desk — 2026-06-22

Closes a review finding: the Desk (now the default landing surface) gave the designer **zero account visibility**. You could not tell *what account you were logged into*, and there was **no path** to settings, profile, security, devices, or sign-out from inside the Document model — that machinery existed only on the dissolving `/portal` zone shell (its `AccountMenu` + `/portal/settings/*` pages were never reachable from `/desk`, and ⌘K had no account actions). Ruled in a design review with Kody.

**Account enters the Document vocabulary, not a new top bar (D1).** No utility bar, no header. Identity lives on the one chrome D1 already sanctions — the **Studio Drawer** — and its actions live in a **Drawer-weight sheet** (D14, like Orders/Accounts/Hours). "Date + ⌘K are the only chrome" is a statement about the **Desk page**; the drawer is already-accepted persistent chrome, so the nameplate is consistent with it.

**The maker's nameplate (persistent).** The plain "Studio" micro-label on the drawer becomes the designer's **signature**: monogram (or avatar) + **display name** + the **active studio** + a declared-availability dot. Always visible — it is the at-a-glance answer to "what account is this." Click opens the Account sheet.

**Identity shown = person + studio (the literal question).** Name · email · **studio/org name + role** (the first `design_studio` membership, graceful person-only fallback when there's no org). Structured to carry a multi-studio switcher later; single active studio in v1.

**The Account sheet — settings re-skinned into the language, not linked-out.** A charcoal `DocSheet` with an identity front-matter (person + studio + the availability selector, the same declared-status model as the old AccountMenu) and **R28 page links** (DM-mono, never tabs): **Profile · Notifications · Security · Devices**, plus **Sign out** at the foot. Each page is the *same data layer* as the corresponding `/portal/settings` page — only the presentation moves to charcoal/paper. No bounce back to the old light-theme zone shell.

**Disambiguation (load-bearing).** The drawer's **"Accounts" book is the studio's MONEY ledger** (R36); this is the designer's **LOGIN account**. They never share a label — the login account is reached **only through the nameplate / ⌘K**, never as a drawer book.

**Reachable three ways, one surface.** The sheet is opened by the desktop nameplate, the mobile drawer sheet's identity header (D13), and ⌘K (`Settings`, `Sign out`) — all via a single `document:open-account` event (the InterruptionSettings pattern). The identity is answered by the persistent nameplate; ⌘K carries the *actions*.

**Additive, no migration (D7).** Every data layer already exists (`profiles` incl. `availability_status` 00183, `user_settings`/`notification_preferences` via `/api/user/preferences`, Supabase MFA, `organizations`). The old `/portal/settings/*` routes + portal `AccountMenu` stay untouched during the phase-in; a later dissolve slice can redirect/remove them. **Leah-facing** (a new interaction pattern) — logged here for the spec fold.

---

## Implementation — The Document (Account visibility, R67) — 2026-06-22

### I42 · The maker's nameplate + the Account sheet are live

Built R67 on branch `the-document/account-visibility`, additive, zero migrations. New `components/document/account/`:
- **`account-sheet.tsx`** — the always-mounted sheet (in `(document)/layout.tsx` beside `InterruptionSettings`); owns `open` state + the `document:open-account` listener and exports `openAccount()`. Identity front-matter + availability selector (reuses `useAvailability`/`useSetAvailability`; the **sole** `useAvailabilityRealtime` subscriber so the channel isn't double-bound) + R28 page links + Sign out.
- **`account-profile-page.tsx`** — display name/bio (`useUpdateProfile`), avatar (`useUploadAvatar`), password (`useUpdatePassword`).
- **`account-notifications-page.tsx`** — the four email toggles via the canonical `/api/user/preferences` fetch/PATCH (same endpoint as the old settings + the public preferences page).
- **`account-security-page.tsx`** — 2FA enroll→scan→verify→unenroll (`useMfaFactors`/`useEnrollMfa`/`useVerifyMfaEnrollment`/`useUnenrollMfa`), charcoal re-skin.
- **`account-devices-page.tsx`** — reuses `PairDeviceQR` unchanged on a paper card.
- **`account-nameplate.tsx`** (desktop drawer) + **`mobile-account-header.tsx`** (mobile drawer sheet) — read the shared availability query; the nameplate replaces the drawer's "Studio" label.
- Shared helper `lib/document/account-identity.ts` (`monogramOf`, `activeStudio`).

Modified: `studio-drawer.tsx` (nameplate + divider in place of the "Studio" span), `mobile/mobile-sheets.tsx` (identity header atop the drawer sheet), `command-bar.tsx` (`Settings` + `Sign out` actions, alias-aware), `(document)/layout.tsx` (mount), and `@patina/supabase` `use-settings.ts` `UserProfile` gained the real `display_name`/`business_name` columns (the old settings page had been casting to `any` to dodge the missing fields).

**Verification:** designer-portal `tsc` clean for every touched file (the only remaining errors are the pre-existing `packages/email` React-email JSX mismatch, untouched here); full monorepo `next build` GREEN (exit 0, `/desk` + `/doc/[id]` compiled); D4 zero-shadow confirmed across the new files. **Live Chrome walk GREEN** (designer@patina.dev = Leah Hartwell · Local Dev Studio · owner, :3000, flag `the-document-pilot:true`): the drawer nameplate renders name + studio + status dot; click → the Account sheet slides over the Desk without unmounting it; front-matter reads "Leah Hartwell · designer@patina.dev · LOCAL DEV STUDIO · OWNER"; availability Busy→Online flips the monogram dot; Profile/Notifications/Security/Devices all render in-language; **2FA enroll fired live** (real QR + secret, Cancel unenrolled the pending factor); the iOS pairing QR rendered; ⌘K `Settings` opened the sheet and `Sign out` showed (not executed); `dialog "Account"` + named radios/links expose cleanly; zero console errors from the new code (only the pre-existing PostHog surveys-script error).

⚠ Owed / provisional: ~390px mobile drawer-sheet walk + desktop ≥1280 / ~390px screenshots to disk (the env's `save_to_disk` yields no file — captures are in-conversation only, as prior tracks); spec fold of R67; org/studio **switcher** deferred (front-matter is switcher-ready); the old `/portal/settings/*` + portal `AccountMenu` left in place for the phase-in. NOT on prod.

---

*Entries: D1–D14 · O1–O7 (resolved) · I1–I42 · R1–R67 · L1–L4 · THE GO · FLIP CONFIRMED · last id = R67*
