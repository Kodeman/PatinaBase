# Memo — LEAH (working interior designer, the customer Patina is built for)

## 1 · Seat and stance

I'm Leah — two hires this year, three active houses, a phone in one hand and fabric in the other. I don't want software; I want Friday's invoice to be right and to know in under a minute whether my new hire is underwater. I distrust anything that asks either of us to remember a step, or that makes either of us feel clocked in.

## 2 · Findings

Walked from source: pick up the Okonkwo paper at 9 (timer auto-starts) → client call → drive to site → 2h site visit in Field → back at the desk → forgot to log the drive.

| ID | Crux | Severity | Confidence | Finding | Evidence | Recommendation | Challenges |
|---|---|---|---|---|---|---|---|
| LEAH-1 | i | blocker | high | Drive/travel time has no capture surface anywhere — not the document timer (tied to an open document), not Field (tied to a visit) — which is exactly why "forgot to log the drive" happens; there's nowhere it would have landed even if I'd remembered. | `activity` CHECK has `design\|sourcing\|client\|site_visit\|admin`, no travel value (current-state.md:33, source `00198:27-29`); Field flow is visit-open-to-close only, `V4VisitReviewScreen.swift:145-146` | Wave 4's manual `LogTimeSheet` + Wave 5's voice intent need a travel/drive activity value and must be reachable hands-free before I put the truck in gear, not after. | — |
| LEAH-2 | i | major | high | Field's one-tap time offer computes duration as non-editable wall-clock from visit-open to visit-close; a long lunch or a chatty homeowner mid-visit inflates the logged hours with a single confirm tap and no chance to correct. | `current-state.md:147` "never user-editable" | Extend D10's "adjustable capture" principle (already ratified for the desk timer) to the Field offer — let me nudge the minutes down before I confirm, same as the log strip. | — |
| LEAH-3 | i | minor | med | A single open-document session that mixes design work and a client call gets one activity tag, chosen only when I put the document down — I can't split it mid-session. | `document-time-provider.tsx` flow, current-state.md:82-86 (activity resolved at log-offer, not mid-session) | Low priority — most days I wouldn't bother splitting a 20-minute call out of a 2-hour block anyway; leave as-is. | — |
| LEAH-4 | i | note | high | The auto-start-on-pickup / zero-tap capture for ordinary design time genuinely works — I never think about starting a timer, which is the whole point. | `document-time-provider.tsx` `hold()`, current-state.md:82; R19 (`DECISIONS.md:668`) | Keep as designed — don't let anything below (rate fixes, scope lenses) add a tap to this path. | — |
| LEAH-5 | ii | blocker | high | My own non-billable studio time — bookkeeping, a hiring call, a team huddle — has nowhere to go today: every entry requires a project, even though "admin" already exists as an activity value. | `activity` CHECK includes `admin` (00198:27-29) but `project_id` is required on every row; architecture-draft.md:62 confirms the gap and proposes dropping the NOT NULL | Ship Wave 2's nullable `project_id` + `studio_id` backfill — my Monday-morning admin hour needs an honest home. | — |
| LEAH-6 | ii | blocker | high | A new hire on a services project with no matching authority role gets `hourly_rate_cents = NULL` — the hours exist, the cost doesn't. This is the exact question I need answered ("is she underwater") failing at the data layer. | architecture-draft.md:8 (`00412:2511-2571`) | Wave 0's resolver (authority → studio rate card → profile default → 0) has to ship before I can trust a single new-hire number. | — |
| LEAH-7 | ii | minor | high | Field-written entries send only id/project/user/started_at/duration/source/activity/notes — no `billable`, no `phase_key`. A warranty callback visit has no way to be marked non-billable from the field. | current-state.md:151 | Add a billable toggle to the Field time-offer sheet (Wave 4). | — |
| LEAH-8 | iii | blocker | high | "A teammate's hours" is not possible in the UI anywhere — the Hours ledger is hard-filtered to the signed-in user, no admin surface exists. Today I would have to ask my hire directly, or keep my own spreadsheet, to know how their week went. | current-state.md:13 (§0.7), :95, :131 | Wave 1's scope lens (mine / member / project / studio) is my single highest-priority ask in this whole program — it should not be gated behind the full rate-authority rewrite if that can be sequenced any other way. | — |
| LEAH-9 | iii | blocker | high | The studio's total hours are unviewable anywhere despite the aggregation logic already existing and working (`useStudioTimeReport`) — I have zero at-a-glance sense of the studio's week. | current-state.md:14, :102, :132 | Wire the existing logic (or its RPC replacement) into the Desk's "hours: time in hand" card for admins — this should be cheap since the hard part is already written. | — |
| LEAH-10 | iii | note | high | The admin portal having nothing for hours is fine by me — I don't open it daily. The fix belongs inside the Document, which is where the architecture puts it. | current-state.md:112; architecture-draft.md:53-56 (no new route) | Confirm the scope lens stays inside the existing ledger sheet, never a new page. | — |
| LEAH-11 | iv | major | med | Where a bill rate actually comes from is buried in the service-agreement drafting room — a place I visit once per contract, not a place I'd think to look when I'm asking "why is Maria's rate zero." | current-state.md:99, :61 | Wave 2's studio rate card, edited in the People Room member profile, is the right home — that's where I already manage a hire, not the contract room. | — |
| LEAH-12 | iv | major | high | On any non-services project, the browser sets `hourly_rate_cents` with no server check — a team member could self-report a rate on a non-services project and nothing stops it today. | architecture-draft.md:7 (`00412:2448-2453`) | Wave 0 has to close this before I can trust a single number on a non-services project on Friday. | — |
| LEAH-13 | v | major | med | There's no lightweight review checkpoint between "hours logged" and "Bill it" beyond my own eyeballing of the ledger — no way to spot-check a hire's ambiguous entries before they become an invoice line. | current-state.md:95-100; architecture-draft.md:103-105 ("Approval / lock — not in v1") | Accept "no formal approval workflow" for a 2–6 person studio — the Wave 1 admin scope lens is my compensating control (I can look at a hire's week before hitting Bill it), so it must ship alongside, not after, any expansion of who can bill whom. | — |
| LEAH-14 | v | minor | high | No CSV/QuickBooks export exists today — my bookkeeper gets nothing structured from Patina; I'd currently be retyping into a spreadsheet by hand. | current-state.md:67 (no edge functions/exports); architecture-draft.md:98 | Ship Wave 6's CSV from `time_entry_ledger`; the per-client statement reusing the R75 invoice composer is the right reuse. | — |
| LEAH-15 | v | note | high | The client seeing an opaque "Design services — 4h 30m" line instead of an hour-by-hour breakdown is correct — the homeowner doesn't need my staffing details, my bookkeeper does. | current-state.md:114-116 | No change. | — |
| LEAH-16 | vi | major | high | R19's auto-start was ratified on my own felt experience in one work block ("Leah: punch card — comfortable"). A new hire never had that gut-check moment — they just experience a timer starting the first time they open a document, with no equivalent record that it felt fine to them. | `DECISIONS.md:668` (R19); rulings-digest.md:11 | See ruling challenge below. | **CHALLENGES: R19** |
| LEAH-17 | vi | major | med | There's no visible, in-product disclosure anywhere that opening a document starts a paid timer — the only explanatory copy found is a drafted, unconfirmed-as-shipped help article. A new hire's first encounter with "surveillance" would be discovering it after the fact in the ledger, not being told upfront. | current-state.md:120 (drafted article, `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/15-hours.md`); no first-run copy in the §2 surfaces table | Ship a one-time, dismissible sentence on a new member's first document open ("Patina starts a quiet timer when you pick up a project — adjust or discard anytime"). Doesn't touch the mechanism, just its silence. | — |
| LEAH-18 | vi | major | high | Wave 1's proposed admin scope-lens gives owner/admin every entry **including per-entry notes** on every member by default. That's me reading my hire's free-text note-to-self the moment I open the lens — the exact surveillance tension Vision §4 warns against, just pointed at my team instead of at me. | architecture-draft.md:43, :49-51 ("every entry in the studio... per-entry notes") | See ruling challenge below. | **CHALLENGES: R77-amendment (Wave-1 scope-lens default)** |
| LEAH-19 | vi | note | high | Both Wave 6 nudges (quiet >8h Record row, no push; opt-in weekly unlogged-day digest) correctly avoid a daily engagement loop — this is the version of "reminding someone to log time" that doesn't violate "you won't notice Patina." | architecture-draft.md:99 | Keep exactly as scoped — do not let this drift toward a daily notification later. | — |
| LEAH-20 | vi | note | high | Folding the scope lens into the existing Hours ledger sheet rather than a new admin page correctly avoids the tab/dashboard prohibition. | architecture-draft.md:53-56; VISION.md:73 | Hold the line on this in implementation — no new route, ever, for this feature. | — |
| LEAH-21 | vii | minor | high | `useStudioTimeReport` is fully built, zero callers — dead code that will confuse whoever picks up Wave 1 next. | current-state.md:14, :102 | Delete once its logic is folded into the Wave 1 RPC. | — |
| LEAH-22 | vii | minor | high | `project_unbilled_time` has drifted from the 00412 authority model; the app already has to patch around it client-side (`rated_amount_cents ?? amount_cents`, re-filter by `isInvoiceEligibleTimeEntry`). This is exactly the kind of silent gap that makes Friday's invoice wrong without anyone noticing. | current-state.md:48; architecture-draft.md:97 | Fix per Wave 6 (COALESCE `rated_amount_cents` first, resolver-derived rate, LEFT JOIN profiles) — keep the name, three consumers depend on it. | — |
| LEAH-23 | vii | minor | med | `profiles.default_hourly_rate_cents` has zero TypeScript references today (nobody can edit it) yet the new design resurrects it as a fallback tier in the rate resolver rather than retiring it. | current-state.md:56; architecture-draft.md:25, :61 | Fine as a tier-3 safety net short-term; revisit removing it once `studio_member_rates` covers every active member. | — |
| LEAH-24 | vii | minor | low | `project_phases.estimated_hours` is orphaned and uneditable since a phases deletion — I'd actually want phase-level hour budgets (an old PRD intent), but right now it's dead weight nobody can touch. | current-state.md:55; rulings-digest.md:40 | Either wire it into the Wave 1 rollup's `group_by` options or drop the column — don't leave it silently stale. | — |
| LEAH-25 | vii | minor | high | Two stale-doc trip hazards: the onboarding drip copy links `/desk?sheet=hours` when the live doorway is `?book=hours`; the portal-vs-desk gap matrix is stale on an already-shipped item (BIL-04/R75). | rulings-digest.md:39; current-state.md:134 | Fix the drip-copy link before it ships to a real founding-cohort email; refresh the gap matrix. | — |

### Capture-path verdicts (architecture-draft.md, my seat's read)

| Path | Wave | Verdict | Reason |
|---|---|---|---|
| Command-bar "Log time" verb (typed, e.g. "90m Maple St design") | 3 | I'd use it | I already live in ⌘K for other things; typing beats opening a ledger row. |
| Ledger batch-add row + billable toggle | 3 | I'd use it | It's already how I backfill today; the toggle just saves a second step later. |
| `t` keyboard shortcut on an open document | 3 | I'd forget it | I don't have `g h` memorized either — I click. |
| Log strip / mobile timer sheet showing resolved rate | 3 | I'd use it | I'm already looking at the screen at that moment; seeing the rate answers "was that billable" without a second trip. |
| Field `LogTimeSheet` — two entry points, elapsed pre-fill, editable | 4 | I'd use it | This is the one that actually fixes today's forgotten-drive problem — if the pre-fill stays editable before I confirm. |
| Field "My hours this week" read-only rollup | 4 | I'd use it | A five-second glance in the truck beats wondering until I'm back at the desk. |
| Field never gets a running timer (v1 decision) | 4 | I'd resent not having it, but I get why | I don't want a phone tap in a driveway silently stealing my desk timer's one running slot. |
| Widget / App Intents / Siri ("log 30 min on Maple St") | 5 | I'd use it, conditionally | Exactly the drive-home moment I need hands-free — but I'd resent it if setting up the Shortcut is on me or my hire. |
| Live Activity for a running visit | 5 | I'd forget it | One more lock-screen thing I'll swipe away unread. |
| Quiet Record row for a >8h running timer, no push | 6a | I'd use it — meaning I'd never notice it | That's correct; I only find it if I go looking. |
| Opt-in weekly unlogged-day nudge | 6b | I'd use it | Once a week is honest, not nagging. I'd turn it on for myself and let a hire opt in for themselves. |
| CSV export / "Export week → Accounts" | 6 / R75 | I'd use it | This is literally what makes Friday's invoice right without a parallel spreadsheet. |
| Studio rate card in the People Room member profile | 2 | I'd use it | It's where I already go to manage a hire, not a settings maze. |
| Nullable `project_id` for internal/admin time | 2 | I'd use it | My admin hour has never had an honest home. |
| Admin scope-lens with full per-entry notes visible by default | 1 | I'd resent it as proposed | Reading a hire's raw note uninvited costs trust I can't buy back — see LEAH-18; I'd use an aggregate-only version instead. |

## 3 · Counts

| Action | Surface | Taps/keys today | Taps/keys proposed | What changes |
|---|---|---|---|---|
| Log a normal design-work session | Designer portal, open document | ~0 to start (auto), ~1 to log the close-out strip | Same (~1) | Strip additionally shows resolved rate/billable — no extra tap |
| Backfill a forgotten entry (e.g. the drive) | Portal / Field | Portal-only: ledger batch-add row (project + minutes + activity + Add, ~4 fields); Field: impossible (0 paths) | Portal: 1 typed command-bar line; Field: ~2 taps (open `LogTimeSheet`, confirm pre-fill) | Manual entry becomes possible in Field for the first time; portal path drops from 4 fields to 1 line |
| Log site-visit hours | Field, visit close | 1 tap, duration not editable | 1 tap, or +1 tap to adjust minutes (if LEAH-2 lands) | Editability, not tap count |
| View my hours | Portal | 1-2 actions (⌘K "Hours" / `g h`) | Unchanged | Nothing |
| View a member's hours | Portal | Impossible (0 paths) | ~3 actions (open ledger, switch scope, pick member), admin-gated | Impossible → possible |
| View the studio's hours | Portal | Impossible despite built-but-uncalled code | 0 extra taps for a glance (Desk card), 1 tap into ledger for detail, admin-gated | Impossible → passive glance |
| Log internal/admin time (no project) | Portal | Impossible (`project_id` required) | Same ~4 fields as any manual entry, project left blank | Impossible → same friction as normal manual entry |
| Export hours for the bookkeeper | Portal | Impossible (no export) | 1 action ("Export week → Accounts" / CSV) | Impossible → 1 tap |
| Set/see a new hire's bill rate | Portal | Opaque: only via service-agreement drafting room, or NULL if no role match | ~2 actions in the People Room member profile (open profile, type, blur-save) | Opaque/impossible → 2-action edit in the natural place |

## 4 · The four views

| View | Where it lives | Who sees it | What it shows | What it is NOT |
|---|---|---|---|---|
| My hours | Existing Hours ledger, `/desk?book=hours` | The signed-in member only | Week view, day totals, billable % | Not a separate timesheet page, not a dashboard |
| A member's hours | Same ledger, admin-gated scope lens ("mine / \<member\>") | Owner/admin only (`member_role`) | The member's week, day totals, billable split, resolved rate source — **aggregate by default** | Not a per-note surveillance feed by default (see LEAH-18) — no free-text notes without an explicit detail step; not a new admin page |
| A project's hours | Same ledger, existing `?projectId=` lens / project-authority band | Project team members (existing `is_project_team_member`) + admins | Entries across all rostered members on that project, rolled to a project total | Not a Gantt/progress-bar view; not phase burn-down unless `estimated_hours` (LEAH-24) is separately wired in |
| The studio's hours | Passive total on the existing Desk "hours: time in hand" card + ledger's "studio" scope for detail | Owner/admin only | Week total minutes/billable-split across the whole studio | Not a new dashboard route; no real-time/live-updating view; no per-second motion (R69 stands) |

## 5 · Ruling challenges

| Ruling | What I'd change | Cost of overturning | Compliant fallback |
|---|---|---|---|
| **R19** (auto-start ratified) | Keep auto-start as the default, but add a one-time, dismissible disclosure the first time each new studio member opens a document — not silent auto-start with zero acknowledgment, ever, for anyone but me. | Full overturn (manual-start for everyone) would reintroduce exactly the "remember to hit start" friction R19 was ratified to remove, and it takes away the win from the person it demonstrably worked for (me) to protect someone who was never asked. Product cost is real; code cost is near-zero since manual-start already exists as the fallback path (D11). | If a stricter reading is wanted: manual-start-only for members added *after* this ruling, until each has had their own gut-check moment — mirrors exactly how R19 was reached for me, just doesn't skip the step for the next person. |
| **R77-amendment (Wave-1 scope-lens default)** | Default the member scope lens to aggregate totals + billable split — no raw entries, no notes — with an explicit "view detail" action required before free-text notes render, even though it stays admin-gated either way. | Cheap to build either default — this is a query-shape flag, not new schema — so the real cost of *not* changing it is trust: full-detail-by-default is the version where "you won't notice Patina" becomes false for a new hire the first time their admin reads a stray note. | If aggregate-only is rejected: gate full detail behind a named reason (dispute/audit) rather than open browsing, so at minimum a hire knows detail access is exceptional, not routine. |

## 6 · What to delete

| Item | Why |
|---|---|
| `useStudioTimeReport` (`use-time-tracking.ts:689`) | Fully built, zero callers; superseded by the Wave 1 rollup RPC — leaving it live risks the next engineer debugging the wrong file. |
| `project_unbilled_time`'s drift-era client-side patch logic in `use-time-tracking.ts` | Once the view is fixed per Wave 6, the `rated_amount_cents ?? amount_cents` workaround and re-filter become dead weight. |
| `profiles.default_hourly_rate_cents` (long-term, not this program) | Zero TS references today; kept only as a tier-3 fallback in the new resolver — revisit removing once `studio_member_rates` covers every active member. |
| `project_phases.estimated_hours` | Orphaned since a phases deletion, uneditable — either wire into the rollup's `group_by` or drop it; don't leave it silently stale. |
| Stale copy: `docs/marketing/founding-onboarding/copy-deck.md:379,627` (`?sheet=hours` → should be `?book=hours`); `portal-vs-desk-feature-gap-matrix-v2.md` (stale on already-shipped BIL-04/R75) | Both are trip hazards for whoever touches this feature next, one of them customer-facing. |

## 7 · Return

See structured output.
