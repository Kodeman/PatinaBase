# US-27: the portal uplift, Direction A on the Desk and card separation across the portal · BRIEF

Story US-27, opened 2026-10-12. This is design and review work only: no product code, migrations, flags or prod data. The founders weigh in on the proposal before it goes to the deployment team.

## 1. The ask (Kody, 2026-10-12, verbatim)

> The team unanamously agrees with direciton A. Assemble a team of UI / UX designers to pull together a full design uplift to impliment direction A on the desk and also bring elements of this card seperation and depth to the remainder of the portal. Propose the changes in an HTML presentaion including mockups for each area of implmentation. The founders will weigh in on these design prop[osal before handing to the deployment team.

What this asks for:
1. **The Desk, at build-ready detail.** US-26 Direction A, worked into an implementation-ready design: the founders adopted A, recorded as V19 in `docs/vision/VISION-DECISIONS.md`.
2. **Card separation and depth across the portal.** Every other area of the designer portal takes on the parts of A that made the Desk stop bleeding together:
   - a unit has its own edge;
   - sections close on clear rules;
   - colour orients and never grades;
   - paper stocks layer.
3. **One HTML deck** with mockups for **each area of implementation**, at 1440 and 390, before and after.
4. **A hand-off the deployment team can build from**: per-area changes, a shared component and token spec, slices, and the founder questions still open.

## 2. Ruled, and binding on this work

- **V19 (2026-10-12):** the Desk takes Direction A. Under it:
  - US-26 Q1: colour on the Desk orients, never grades, counts or nags; every other V18 Q1 guard stands.
  - Q2: the tag means stage.
  - Q3: stage returns as a 3 px edge rule, never a plate.
  - Q4: a card stands for a job, holding today's lines.
- **Source of truth for A.** `artifacts/desk-redesign-2026-10-12/`, which holds:
  - `synthesis/direction.md` (§3 A, §5 the fix-now list F1–F8, §6 slices, §7 Q5–Q15);
  - `specimens/SPEC.md` and `proposed-a-{1440,390}.html`;
  - `review/triage.md`, with the R1/R2 fixes. A job in Today never appears in the ledger, and settled lines stay put until the next morning.
- **Still open, and carried to the founders:** US-26 Q5–Q15. Design against their **recommended** answers, and mark each such dependency so the founders can see what changes if they rule differently.
- **Still binding:**
  - **Zero shadows** (house sheet A4; `box-shadow` appears in no specimen). See §4 on "depth".
  - Wrap, never truncate.
  - The three paper stocks and the existing pigment tokens. A new token is allowed only when it is named and justified.
  - Playfair / Inter / DM Mono.
  - The three action tiers (house sheet A5).
  - V18 Q8: one filled act per view.
  - Direction C labeling vocabulary (V18).
  - Copy never says "AI".
  - The VISION promise: the studio won't notice Patina, and the studio surface is never optimised for engagement.
  - VISION's surface ranking: The Document comes first.

## 3. The areas of implementation

These are the designer portal routes on `origin/main` 81b40e732, under `apps/designer-portal/src/app/`. The inventory ticket confirms them, adds the overlay sheets and shared chrome, and ranks them.

| Area | Routes |
|---|---|
| **1. The Desk** | `(document)/desk` |
| **2. The Document (a job)** | `(document)/doc/[id]`, plus `pieces`, `plans`, `spec-book`, `boards`, `pieces/finishes/print` |
| **3. Rooms** | `(document)/rooms`, `room/[id]`, `room/[id]/file` |
| **4. People** | `(document)/people` |
| **5. Library** | `(document)/library`, `library/[id]`, `library/judgments` |
| **6. Boards** | `(document)/boards`, `board/[boardId]` |
| **7. Making papers** | `(document)/drafting/[proposalId]` (proposal), `compose`, `ceremony/[leadId]` (a lead's first meeting) |
| **8. Money** | the accounts, invoice and procurement sheets and overlays, and `invoices/[invoiceId]/print` |
| **9. Shared chrome** | the header, the dock, ⌘K, overlays and sheets, empty states, help (`(document-help)/help/*`), `preferences` |

Out of scope: the auth screens and `(legal)`. They get the token pass only, and say so.

## 4. "Depth" without shadows

Kody asked for "card separation and depth". The house sheet bans shadows (A4). Every design seat must:
- **Build depth from what the system already allows:**
  - the three paper stocks: ground `--paper`, a document laid on it `--paper-doc`, and the rail;
  - edge weight (`--card-edge`, `--hairline-strong`);
  - inset rules and tonal steps;
  - a lifted stock for the focused unit;
  - spacing on the 24 px module.
- **Show a "depth ladder"**: which layer a unit sits on, and how the eye reads front-to-back, in light and dark.
- **Treat any shadow as a founder question only.** If a seat believes a shadow is needed, it may propose one, at most, as a named founder question with a side-by-side mockup. Nothing ships with a shadow unless the founders rule it.

## 5. Personas and moments

- **Leah, the principal.** Hartwell Studio, about 16 live jobs, her first hire just made.
- **Jordan, the hire, week two.** For Jordan, refer by name or "the hire".
- **US-26 M1–M8 still apply to the Desk.** For the rest of the portal, each area names its own two or three moments, for example:
  - the Document: "what's next on this job";
  - Money: "who owes us what";
  - Library: "find the piece I used on Holloway".
- **Fixture.** The Hartwell fixture is US-26 `specimens/SPEC.md` §3, extended per area. All names and dollars are realistic and invented. Never use real makers or people.

## 6. Success test, per area

- **Separated.** Every unit has an edge, and every section closes. Nothing bleeds into its neighbour at rest.
- **Depth reads.** The layer each element sits on is legible in light and in dark, with no shadow.
- **Calm.** Marks at rest are counted with US-26's counter, today against proposed. Colour orients and never grades.
- **Consistent.** The same card, section and ledger-row components recur across areas. A component reused is better than a variant.
- **Operable at 390.** No horizontal scroll, 44 px targets, wrap never truncate.

## 7. Evidence and environment rules

- **Local Supabase only.** Confirm `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1`.
  - The Postgres is shared: apply seeds with psql, and NEVER run `supabase db reset`.
  - Seeds: `artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk_v2.sql`. Leah is `designer@patina.dev`; Jordan is `hire@patina.dev`.
  - A test inquiry "Ainsley Moore" left by US-26 may exist. Leave it.
- **Dev server** on :3005, never :3000.
  - `NEXT_PUBLIC_FLAG_OVERRIDES` sets 13 flags `:true`: one-voice, ask-the-paper, agreement-parts, agreement-library, client-invite-letter, arrival-arc, studio-workspaces, design-build, threshold, procurement-workspace-pilot, room-file, tester-notes, onboarding-teammate-persona.
  - PostHog stays off.
- **Paths and tools.**
  - No Serena; absolute worktree paths only.
  - Never touch the main checkout `/Users/kody/Code/patina-merged`.
  - No `sleep`, and no `timeout`: use `perl -e 'alarm N; exec @ARGV'`.
- **Citations.** Code claims cite `file:line`; external claims cite a URL.
- **Tools to adapt:**
  - `tools/check.us26.mjs`, the specimen gate from US-26;
  - `tools/build.us26.mjs`, the deck builder from US-26.
- **Rendering.** Chrome automation cannot open `file://` or the deck's sandboxed srcdoc frames. Render checks run in headless Playwright.
