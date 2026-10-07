# Running a Job in The Document: shared brief for every seat

**Date:** 7 October 2026. **Commissioned by:** Kody. **Audience for the final deck:** the founding team (Kody, Leah), for their input.

## The ask
Designers running a project in the designer portal get lost. They can't tell which actions are available, which one is suggested next, or where something lives. This review looks at the overall UX of running a job in **The Document** (`/doc/[id]`), from inquiry to care. It identifies where the interface can make the available and suggested actions clearer, and proposes directions, with mockups, that help a designer find what they need when they need it.

This is review and design work only. Do not touch product code, migrations, flags, Sanity, or prod.

## What has already been tried (read before you form a view)
The same complaint was reviewed on 2026-08-25, and its fixes shipped. Designers are still lost. The question this review must answer is **why the earlier work didn't land, and what is still missing.**

- `artifacts/document-wayfinding-directions-2026-08-25/`: RESUME.md, presentation.html, research/31-verified-findings.md. Nine reviewers produced 92 findings, and two directions came out of it: A "Everything Prints" and B "The Shop Ticket". These were ruled R124/R125 and built.
- `artifacts/document-lens-proposal-2026-08-28/` (R127) deleted the job ticket and created the lens band. Its no-gos: NG1, one document at a time with no persistent global nav; NG2, the shadow budget.
- `artifacts/document-life-directions-2026-08-28/` (R126) and `artifacts/doc-ux-review-2026-08-13/03-ux-critique.md`. The latter found that the orienting devices contradict each other, that Install is not a real mode, that empty modules erode the document, and that the Document leaks its own machinery.
- `docs/design/the-document/discoverability-review-2026-07.html` and `designer-portal-action-visibility-study.html`.
- `artifacts/designer-onboarding-learning-2026-09-03/synthesis/proposal.md`. The ⌘K "Help…" panel is mostly placeholder articles, and the tour teaches nouns rather than acts.

## Canon (you may challenge it, but say so openly and name the ruling)
- `docs/vision/VISION.md` wins over every other doc:
  - §1: surfaces ranked: The Document, then iOS, then the marketplace.
  - §2: the customer is a studio adding its first hands. "The thing she cannot afford is a new system to learn."
  - §4: "you won't notice Patina … prompts and collects information when and where you need it, then gets out of the way". Never optimize for engagement.
  - §5/§6: one living Document; no dashboards, task managers, tab bars, zones, shadows, red/green status or badges.
- `docs/vision/VISION-DECISIONS.md`:
  - V9: act weight follows consequence. A filled terminal act is only for money or signature, with one consequence sentence above it. Use `aria-disabled` with a named reason. "absence is silence". The landmark ledger is a table of contents, not nav.
  - V11: no total without the rows beneath it; no progress bars or streaks.
  - V12: the Arrival.
- `docs/design/the-document/DECISIONS.md`, R124–R154.
- `docs/design/house-sheet/SPEC.md`: tokens, type steps, action tiers (§A5), consequence sentence (§A6), empty states (§A10).

A direction that breaks canon is allowed in this review, but only as a **named founder question** ("this needs V9's 'absence is silence' relaxed for X, because Y"), never silently.

## The surface today (starting map; verify against code, it may be stale)
All paths are under `apps/designer-portal/src/`.
- **Shell:** `app/(document)/layout.tsx` has no top nav.
  - `studio-drawer.tsx` is a 60px bottom bar with breadcrumb, three rooms, Ledgers and "Find anything (⌘K)".
  - `command-bar.tsx` is ⌘K.
  - The KeysSheet holds the `g`+letter shortcuts (`lib/document/registry.tsx`, `lib/help-system/keys-reference.ts`).
  - The Desk is `app/(document)/desk/page.tsx`.
- **Document:** `app/(document)/doc/[id]/page.tsx`. Top to bottom:
  - spine and lens ladder (`components/document/doc-spine.tsx`, `spine/lens-ladder.tsx`)
  - letterhead
  - **lens band** (`lens-band.tsx`; guide copy from `lib/document/document-guide.ts`)
  - `red-letter-zone.tsx`
  - schedule rule and `phase-advance-control.tsx`
  - exactly one active stage (Brief → Discovery → Direction → Proposal → Project → Install → Care; `lib/document/desk-derivation.ts`)
  - the Record (`previous-work.tsx`, `settled-bar.tsx`)
  - the margin rail (`margin-rail.tsx`), which is the notification model
  - shelves (`lib/document/shelves.ts`)
- **Where actions live:**
  - lens-band guide
  - handoff gates (`lib/document/workflow-gate.ts`)
  - `guided-empty-state.tsx`
  - FF&E line actions (`ffe-section.tsx`)
  - `overlays/*` sheets
  - ⌘K verbs and `g` keys
  - room and book pages (People, Library, Rooms, Orders, Accounts, Buying)
  - the Contract Room at `/drafting/[proposalId]`
- **Help:**
  - `help/document-help.tsx`, reached from ⌘K "Help…"
  - the Desk walkthrough
  - one-time `margin-note.tsx`
  - Workshop Notes (`lib/teaching/`). The Sanity drafts are unpublished, so no authored notes render.
- **Flags** fail closed (`hooks/use-feature-flag.ts`). `worktable` was reportedly never created, so judge the **non-Worktable** layout.

## Five task scenarios (used by the walk and by every reviewer)
1. **A new inquiry arrives.** What do I do first, and how do I know?
2. **The client asks for a change after signing.** Where do I record it, and what happens next?
3. **"Where is the PO for the sofa?"** Find it, and find what is blocking it.
4. **It's install week.** What's late, what's arriving, and what do I do about it?
5. **A new hire opens someone else's project cold.** Can they tell what stage it is in, what's waiting on them, and what to do next?

## Personas
- **Leah:** founder-designer, deep domain expertise, little patience for software.
- **The first hire:** a junior designer or design assistant, competent in the craft, new to the studio's way and to Patina, often working someone else's job.

## Output conventions
- The artifact root is `artifacts/document-running-a-job-2026-10-07/`. Write only to the paths your ticket names.
- Every finding cites evidence: a `file:line` or a walk screenshot path. Give each finding a **severity** (S1 blocks the job / S2 costs real time or causes errors / S3 friction / S4 polish) and a **confidence** (high / medium / low). Report every finding. Do not filter by severity.
- Separate **observation** (what is there) from **interpretation** (why designers get lost) from **proposal**.
- Voice follows `.claude/skills/patina-brand-voice/SKILL.md` and VISION:
  - Never say "AI", "algorithm", "engine" or "powered by".
  - No Pledge, and not the tagline "Where Time Adds Value".
  - Avoid "curated", "luxury", "bespoke", "elevated", "disrupt".
  - Use the product's own lexicon (Document, Desk, Contract Room, lens band, the Record, margin) when describing today.
