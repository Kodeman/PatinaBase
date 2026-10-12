# US-26 — The Desk, re-envisioned · BRIEF

Story US-26, opened 2026-10-12. This is design and review work only: no product code, migrations, flags or prod data.

## 1. The ask (Kody, 2026-10-12, verbatim)

> Lets work on the desk for the designer portal. This top bar should be more concise, the actions with the tip below seems sloppy. Then everything kind of bleeds together, Lets look at bring back the cards with little color tags and tighting up the Desk to a true place to look at and operate your day from. Have a team of mixed agents work with UI/UX designers to re-invision what the desk page looks like. Propose 3 directions in an hhtml presenation with Mockups to the founding team for feedback and advice on direcion

Kody's screenshot is `walk/kody-desk-2026-10-12.png`: the shipped US-25 Desk on prod, signed in as Kody, studio scope, one line on the sheet. What it shows, top to bottom:
- **Header.** "Good morning, *Kody*" with "MONDAY · 12 OCTOBER" under it. Two "+" acts, each with a mono tip under it: "RECORD AN INQUIRY" / "CREATE AN INQUIRY BRIEF" and "CREATE A PROJECT FILE" / "DIRECT PROJECT SETUP". Then "FIND ANYTHING ⌘K".
- **Day Sheet.** "*This morning, these need you.*" with "Mine · The studio's".
- **One line.** "Sunny — Issued 7 October · not yet viewed", with "CONTACT THE CLIENT" and "NOT TODAY".
- "*The rest are on their projects.*"
- "STUDIO WORKLOAD", with "BY TEAM MEMBER".

What Kody objects to:
1. **The top bar is not concise.** The tip under each action reads as sloppy.
2. **Everything bleeds together.** Head, sheet, footer and workload are all ink on cream, with no edges between them.
3. **He wants the cards back, with little colour tags,** and the Desk tightened into a true place to look at, and operate, the day from.

## 2. The deliverable

Three distinct directions for the Desk page (`/desk` in `apps/designer-portal`). They are presented to the founding team as one HTML deck with mockups at 1440 and 390, before/after against today, plus a recommendation and founder questions.

- **All three directions bring back cards with colour tags.** That is Kody's ask.
- They differ in structure, and in what the colour tag means.

## 3. Personas

- **Leah, the principal.** Runs Hartwell Studio, about 16 live jobs, and has just added her first hire while the workload doubles. She opens the Desk at 8am with coffee and wants the day in five seconds. She is in and out all day between site visits.
- **Jordan, the first hire, week two.** Picks up hand-offs. Needs to know what is theirs, what is Leah's, and what to do next without asking.
- Homeowners and makers are the studio's clients and vendors, not Patina's users here.

## 4. Day moments (the scenarios every direction is scored on)

| # | Moment |
|---|---|
| M1 | **Monday 8am open:** what needs me today, and what can wait? |
| M2 | **A client approved or declined a proposal:** see it, act on it. |
| M3 | **A vendor PO acknowledgement is overdue:** chase it. |
| M4 | **An invoice is unpaid past due:** remind, or record a payment. |
| M5 | **Jordan picks up a hand-off from Leah:** whose is what. |
| M6 | **Midday "what's next on this job":** from the Desk into the job and back. |
| M7 | **A new inquiry arrives:** record it, and see it land. |
| M8 | **Close of day:** what moved, what's waiting on others, what comes back tomorrow. |

## 5. Success test

- **Calm.** Count marks on screen at rest, colour marks included. Every section has a clear edge. Nothing pulses, counts up or nags. The VISION.md promise binds: the studio won't notice Patina, and never optimise the studio surface for engagement.
- **Operable.** Clicks and seconds to act on each moment from the Desk itself.
- **Glanceable.** Can the whole day be read in about 5 seconds at 1440? At 390?
- **Concise header.** One line at 1440. No tip-under-action.

## 6. Canon this exploration reopens (waived for the exploration; the deck must name each reversal)

Kody's ask deliberately reverses rulings made two days ago. Each direction must list exactly which of these it reverses, so the founders rule knowingly.
- **V18** (`docs/vision/VISION-DECISIONS.md` ~493–523, 2026-10-10).
  - **Q1 guards:** no dots, no badges, no overflow count; the Desk is monochrome.
  - **Q7:** stage plates demoted to ink words in every direction.
  - **Direction C** supersedes R143 D3/D5/D6/D7: the claim grid, custody words and the day line.
- **House sheet** (`docs/design/house-sheet/SPEC.md`).
  - **:1011, the Desk do-not list:** no badges or count chips, and no tinted band behind a stage group.
  - **:54,** `--card-edge` is for claim cards only.
  - **:592:** no pills, no status dots, no badges.
  - **:168:** no shadows. **This one stays**: D4 zero shadows is not reopened.

Still binding:
- zero shadows;
- wrap, never truncate;
- the three paper stocks, and the existing pigment tokens (no new hex unless a direction proposes and names a token);
- Playfair / Inter / DM Mono;
- copy never says "AI".

## 7. What exists (anchors, all on `origin/main` unless marked)

- **Today's Desk:**
  - `apps/designer-portal/src/app/(document)/desk/page.tsx`: the header is at 448–529; the hooks are at 83–104; the body order is DaySheet → DeskRoster → RecentBoardsStrip → DeskBoardsReactionRollup → DeskContents.
  - `components/document/day-sheet.tsx`, `desk-roster.tsx` and `desk-ledger-row.tsx`.
  - The CSS is at `globals.css` 575–644.
- **Header sub-labels:** `STUDIO_VERBS` in `lib/document/registry.tsx`, ~264 and ~277.
- **The old claim cards, at `818db6e55`** (`git show 818db6e55:<path>`), removed in `f2d65f64d`:
  - `components/document/desk-claim-card.tsx` had six registers: a stage plate in white mono on `--tab-*`; a custody word with a 7px dot (terracotta-ink urgent, mocha quiet); the Playfair 20px name; person · phase; the need sentence with the overdue clause in terracotta-ink; one act.
  - The card box was 1px `--card-edge`, 2px radius, no shadow.
  - `desk-claims.tsx` laid the cards out 3/2/1-up, with a stage-tinted hover wash (`row-wash.tsx`).
- **Colour sources:**
  - stage pigments `--tab-brief/discovery/direction/proposal/project/install` (globals.css ~157; house sheet :65–72);
  - state pigments clay, golden, terracotta and sage, each with an `-ink` (house sheet :59–63);
  - need class 1/2/3 (`lib/document/need-class.ts`);
  - the old urgent/quiet split (`URGENT_NEED_KINDS` at 818db6e55 `lib/document/desk-roster-derivation.ts`:60–77).
  - There is **no** project colour field in the DB.
- **Data model, reused:** `deriveDeskNeedList` → `deriveDaySheet` (`lib/document/day-sheet.ts`) and `deriveDeskRoster`; need states (`studio_need_states`, 00765: acted, waiting on, set aside, not today); Mine/studio scope.
- **Prior screenshots:**
  - The old card Desk (US-24 walk): `artifacts/designer-portal-uplift-2026-10-09/walk/desk-{fold,full}-{1440,390}.jpg`, `s5-step1-hire-desk-*.jpg` and `s7-step1-desk-new-lead-1440.jpg`.
  - Today's Desk (US-25 walk): `.../delivery/walk/s1-leah-{desk-full,sheet}-{1440,390}.jpg` and `s5-jordan-sheet-*.jpg`.
- **Prior thinking:** US-24 `synthesis/direction.md`, which explains why the cards were removed (Q3, Q7, :56, :132, :170), and US-24 `specimens/SPEC.md` §3, the Hartwell Studio fixture.
- **Tools to adapt:** `tools/check.us24.mjs` (the specimen gate) and `tools/build.us24.mjs` (the deck inliner), both copied from US-24.

## 8. Evidence and voice rules

- **Local Supabase only.** Confirm `NEXT_PUBLIC_SUPABASE_URL` is `127.0.0.1` before anything.
  - The local Postgres is shared with other sessions. Apply seeds with psql, and NEVER run `supabase db reset`.
  - Seeds: `artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk_v2.sql`. Leah is `designer@patina.dev`; Jordan is `hire@patina.dev`.
- **Dev server** on :3005, never :3000, which another session holds.
  - `NEXT_PUBLIC_FLAG_OVERRIDES` is the 13-flag set: one-voice, ask-the-paper, agreement-parts, agreement-library, client-invite-letter, arrival-arc, studio-workspaces, design-build, threshold, procurement-workspace-pilot, room-file, tester-notes, onboarding-teammate-persona, all `:true`.
  - PostHog stays off.
- **Paths and tools:** no Serena. Absolute worktree paths only. Never touch the main checkout `/Users/kody/Code/patina-merged`, which belongs to another session.
- **Citations:** every code claim cites `file:line`, and every external claim cites a URL.
- **Copy:** never write "AI". Mockups use Hartwell Studio fixture names and realistic dollars.
