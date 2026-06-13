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

*Entries: D1–D14 · O1–O7 (resolved) · I1–I28 · R1–R35 · L1–L3 · THE GO · FLIP CONFIRMED · last id = I28*
