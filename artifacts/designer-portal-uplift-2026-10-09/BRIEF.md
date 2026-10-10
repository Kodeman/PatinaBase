# US-24 BRIEF: Designer portal UI uplift

The story contract for US-24, copied from the Sidequest board (contract revision 1). The only change is that the persona text uses neutral pronouns.

Root folder (R): `artifacts/designer-portal-uplift-2026-10-09/`. Every output of this story lives under R. Nothing outside R changes: no product code, migrations, flags, seeds in supabase/, or config.

## 1. The ask (Kody, 2026-10-09, verbatim intent)

"Assemble a team to review the designer portal design elements and overall UI and UX. Ignoring all of the design rules and constraints, have them craft a proposed UI uplift to make the designer portal more user friendly so that designers still feel the calm but can also easily find actionable moments in their projects. Present a proposal of a UI uplift in an HTML presentation including mockups for the founding partners to bring in their opinion."

Kody's rulings:
- **Scope.** Review the WHOLE designer portal. The uplift and its mockups centre on the daily path: Desk → a project (the Document, `/doc/[id]`) → acting on what needs you. Other rooms (Build room `/doc/[id]/pieces`, Boards/Library, People, Rooms, Compose, Drafting, Ceremony, Invoices, Preferences) are reviewed. They appear in the uplift only where a direction changes them.
- **Directions.** Three distinct directions, A, B and C, run from light-touch to structural. One is recommended. Founder questions go with them.
- **Mockups.** Static, self-contained HTML at 1440 and 390 wide, shown as before/after pairs. "Before" means a walk screenshot of today.

## 2. What is waived and what is not

- **WAIVED.** The design canon may be ignored: paper stocks and beige, the type system, motion doctrine, the lexicon and voice rules, the canon rulings in docs/vision/VISION-DECISIONS.md, the "never a lens on the paper" rule, and similar. Wherever a proposal departs from canon, NAME the ruling it would need (as US-20 did). Do not let canon veto an idea.
- **NOT WAIVED.**
  - The product promise in docs/vision/VISION.md is the goal itself: "the studio won't notice Patina". The studio surface is NEVER optimised for engagement, so there are no streaks, no badges-for-badges' sake, no red-dot anxiety and no gamification.
  - "Designer-Taught Intelligence", never "AI", in any visible copy.
  - Accessibility: contrast, keyboard and screen-reader basics.
  - Honesty: no fabricated statistics, and no quotes attributed to real people.

## 3. People

- **Leah, studio principal.** About 16 live jobs at different phases. Leah dips in between client meetings and site visits, wants to know in seconds what needs them today, and hates software that shouts.
- **Leah's first hire, week two.** Learning the studio's way and handed jobs mid-flight. Needs "what's next on this job, and what's mine?" without asking Leah.
- **Homeowners and makers** are the studio's clients and vendors, not the user here. Their actions (approvals, payments, acks) are the signals the designer must notice.
- Persona seats speak as SIMULATED personas. Label them so, and never present their words as real quotes from Leah.

## 4. Scenarios S1–S8 (the actionable moments)

Every reviewer and every direction is scored on these:
- **S1 Monday "what needs me".** Open the portal and know, in under 10 seconds, the three to five things across all jobs that need action today.
- **S2 Client moved.** A client approved or declined a proposal or selection. Notice it and take the next step.
- **S3 Vendor quiet.** A purchase order was sent and the vendor ack is overdue. Notice it and chase it.
- **S4 Money.** An invoice is due or unpaid, or a deposit landed. Notice it and act.
- **S5 Hand-off.** The hire opens a job Leah handed them and finds what's theirs.
- **S6 What's next on this job.** Inside one project, find the single next step without scanning everything.
- **S7 New lead.** A new inquiry or lead arrives. Notice it and respond.
- **S8 Close the day.** Confirm nothing is left hanging, and leave.

## 5. Success test (applies to every direction and mockup)

- **Calm**, measured at rest: count the marks competing for attention on first paint (colour accents, badges, buttons, numbers). Lower or equal to today is the goal, unless the extra mark is an actionable moment.
- **Findable**, measured per scenario: clicks and estimated seconds from landing to the moment, and from the moment to done.
- Every direction states both numbers for S1–S8 against the walk's measured baseline.

## 6. Evidence rules

- Code claims cite `path:line`, and walk claims cite a screenshot file in R/walk/.
- Local Supabase ONLY. Before any DB write or portal run, confirm `NEXT_PUBLIC_SUPABASE_URL` resolves to 127.0.0.1 or localhost. Production (Strata, *.patina.cloud) is read-never for this story.
- The local Postgres is SHARED across sessions. Seeding is additive only, via a script kept in R/walk/, and never runs `supabase db reset`.
- Port 3000 (the designer portal dev server) is a shared runtime resource. Use a selective dev script, never `pnpm dev`, and stop what you started.
- Prior art to read, never to repeat:
  - artifacts/portal-polish-review-2026-09-08/synthesis.md, the last whole-portal panel; check which of its findings shipped;
  - artifacts/pieces-building-room-2026-10-08/README.md and artifacts/document-running-a-job-2026-10-07/, the latest founder decks;
  - docs/vision/VISION.md.

## 7. Folder layout (fixed)

- R/briefing/current-state.md
- R/walk/WALK.md, R/walk/*.jpg (named `<surface>-<step>-<width>.jpg`), R/walk/seed_uplift_walk.sql
- R/review/r1-visual.md, r2-ia-actionable.md, r3-heuristics.md, r4-patterns.md, r5-studio-seats.md, adversarial.md, triage.md
- R/synthesis/direction.md
- R/specimens/SPEC.md, R/specimens/check.mjs, R/specimens/proposed-{a,b,c}-{1440,390}.html
- R/deck/DECK.md, R/deck/src/index.html, R/deck/build.mjs. The built R/deck/index.html is NOT committed by tickets; the orchestrator builds and publishes it.
- R/deck/_renders/ (render-check screenshots)

## 8. Deck format decision (orchestrator)

Custom single-file HTML presentation, reusing the US-20 machinery. Copy artifacts/pieces-building-room-2026-10-08/deck/build.mjs and specimens/check.mjs and adapt them. The core Slides Artifact type was checked and rejected: it forbids data: URIs and limits live embeds to 16 KB, so it cannot carry 1440/390 live HTML mockups.

## 9. Git and board hygiene

- Commit only explicit pathspecs under R and never `git add -A`. Use Conventional Commits `docs(design): … (SQ-n)`.
- Images are compressed JPEGs: at most 1440 wide and quality about 75, or `sips -Z 1440`. Keep R/walk under about 6 MB in total.
- Specimens stay self-contained. They reference "before" screenshots by relative path `../walk/<file>.jpg` and never inline base64; only deck/build.mjs inlines.
