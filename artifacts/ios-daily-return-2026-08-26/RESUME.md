# RESUME — The Daily Return (Patina iOS client app), review DONE · build program DONE (2026-08-28)

## The ask (Kody, verbatim)
"Assemble a team of interior designers, home owners and UX UI designers. Review the Patina iOS
application and create a presentation outlining how the UI and UX flow could be updated to make the
application more sticky and make users want to return and use it everyday. And eventually purchase
through the app. The presentation should be an html presentation including mockups and UI Screen
details." — then (2026-08-27): "interview me on the outstanding questions then assemble a team to
deliver on the defined program of change."

## Review — DONE (2026-08-27)
Deck `presentation.html` published at https://claude.ai/code/artifact/518e0ed6-9a11-404a-b8b9-cb96055789c1
(v2 carries "Twelve questions, twelve answers"). Evidence, panel, directions, judges, synthesis:
see `source/` and `research/` (index in the previous RESUME text, preserved in git history at
`5c89b9feb`). Kody's twelve rulings: `source/rulings-2026-08-27.md`.

## Build program — plan `source/build-plan.md` (v2 after the P0 critique)
| Wave | State | Main commit | Record |
|---|---|---|---|
| W0 foundation (stack restart, re-walk, hotfix SP-01, deck answers, plan critique) | DONE | `0b7f2291d` hotfix | `research/04-*.md`, `05-rewalk.md`, `waves/w0/` |
| W1a prerequisites (FeatureFlags, SP-07, DesignerRelationship + liveLead, SP-13 threads, one attention count, gate hygiene) | DONE | `57e9b4462` | `waves/w1a/` |
| W1b planks SP-02…SP-20 (4 lanes, 00533–00536, client-portal AASA + /piece page, delete-account) | DONE | `e9da02569` | `waves/w1b/` (walk PASS after two fix rounds) |
| W2 the Record (ruling R1 "now": Record card, designer seat, house rail, NEW THIS WEEK, July rail retired, 00537–00538) | DONE | `09ec2f4b5` | `waves/w2/` (walk PASS; XXL orb overlap ruled to W3) |
| W3 tab bar behind `house-first` (B-1/B-2/B-7/B-8; `AppRoute.studio`; tour on the bar) | DONE | `1cb71c346` | `waves/w3/` (re-walk PASS; Sanity tour copy OWED to Kody before the flag flips) |
| W4 house on Today (rooms + budgets, saved date/room/note, decays removed, timeline, seat project rule, guest-session durability, 00539) | DONE (four fix rounds; rulings in `waves/w4/rulings-fable.md`) | `2fffd48b3` | `waves/w4/` (walk 4 PASS on the wave's items; two Companion-at-AX-size defects → W5 A11Y lane) |
| W5 purchase (`direct-orders`; R3 pre-emption; 00540 attribution + fulfillment intake; A11Y carry-overs) | DONE (walk PASS; Checkout hand-off BLOCKED by the local placeholder Stripe key) | see git log `chore(daily-return): integrate W5` | `waves/w5/` |
| W6 widget + deep links + due reminder + session isolation (`house-widget`) | DONE (1523 tests; widget-on-Home-Screen pixel proof is a device claim) | see git log `chore(daily-return): integrate W6` | `waves/w6/` |

## How a wave runs (the pattern that works)
Each wave = one Workflow script in `source/workflows/`: steward (worktrees `.codex/worktrees/agent-dr-<wave>-<lane>`,
Secrets.swift copied in, simulator clones — shut the review device down for a minute to clone it)
→ lanes with OWNED FILE SETS (task list first, tests first, whole PatinaTests tier on the lane's
clone, pathspec commits, integration notes for cross-lane needs) → separate-context reviews → fix
rounds → steward integration on `daily-return/integration` (D first; `ios-gate.sh all`/lint-delta
steward-only; `supabase db reset` + SQL tests; signed .app) → walker on the review simulator
`973D1724-90BF-4A0A-B02D-481D561547B3` → Fable merges to main (`git merge --no-ff`; read the merge
log, not `tail -1`; clear untracked shot duplicates first; the ledger conflict resolves "ours" =
superset), pushes unsandboxed, retires worktrees/branches/clones, commits `waves/<wave>/`.
If an agent dies mid-lane (API errors happen): resume the run, or re-dispatch the lane rebased onto
the integration tip (`w2-r2-resume.js` is the template).

## Standing facts every agent needs
`-DeploymentTarget local` on every simulator launch; `-PatinaFlags house-first,direct-orders,house-widget`
turns flags on locally (FeatureFlags resolves once at launch from the arg, else PostHog's cached
payload, else false); password sign-in `password123` (client@patina.dev activeProject,
james.okafor@example.com engaged); the local stack is seeded from main (INV-2026-0142 in
`supabase/seed/invoices.sql`); every local edge function boots; Stripe locally is a placeholder key
(Checkout never opens until Kody supplies a real `sk_test`); `git worktree add`/`merge`, simctl,
xcodebuild, osascript, sips, docker and the supabase CLI need `dangerouslyDisableSandbox`; the first
xcodebuild in a fresh worktree fails on `GitCommit.swift` (run twice); `ios-gate.sh build` writes to
the shared DerivedData (transient failures = contention).

## OWED (Kody)
- Rulings: `designer_clients.client_name/email` retention on closure; erasure policy default
  (anonymize-and-detach, `waves/w1b/rulings-fable.md` #2); "· due Sep 1" wording; Stripe Tax /
  shipping registration; a real `sk_test` in the local functions env before W5's walk; PostHog flags
  `house-first`, `direct-orders`, `house-widget` targeting client UUIDs; the client-portal deploy that
  makes the AASA + `/piece/<id>` page live; App ID associated-domains + App Group + widget bundle id
  (device claims); the Sanity tour copy (`waves/w3/n3-sanity-copy.md` once W3 lands).
- Device pass + TestFlight archive (Apple Pay in Checkout, push round trip, universal links, App Group).

## Resume prompt
"Read `artifacts/ios-daily-return-2026-08-26/RESUME.md` and the memory file. Every scripted wave is
on main. Work through the OWED list with Kody (flags, Sanity copy, Stripe key + tax ruling,
client-portal deploy, App ID capabilities, TestFlight + device pass), then the per-wave backlog rows
in `source/build-plan.md`."
