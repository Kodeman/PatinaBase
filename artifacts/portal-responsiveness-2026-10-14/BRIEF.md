# US-33 — Brief (story contract)

Copied verbatim from the US-33 story contract, revision 1 (sha256 `32f90db224a91de07b66cadbf63539a29de1ba95e5eb0d80ce908c72e8317657`), on 2026-10-14. The board's contract stays the authority; this copy travels with the artifacts.

---

US-33 EXECUTION CONTRACT (BRIEF). Full plan: /Users/kody/.claude/plans/we-are-starting-to-harmonic-ladybug.md. Read it first, especially "What the code sweeps already show". Treat those as HYPOTHESES to measure, confirm or refute.

OUTCOME: one long-form HTML findings document for Kody. It covers the baseline, findings by discipline, paired engineering×design proposals, mockups, three tracks (Fix now / Next / Structural), budgets, and founder questions PQ1…. Nothing in apps/, packages/, supabase/ or infra/ changes. NON-GOALS: implementing any fix; deploying; changing prod data.

ROOT: every output goes under artifacts/portal-responsiveness-2026-10-14/:
- baseline/
- review/
- synthesis/
- specimens/
- doc/

SCENARIOS:
- P1 cold sign-in → Desk
- P2 Desk → a job's Document (/doc/[id])
- P3 Document → build room (/doc/[id]/pieces)
- P4 Document → People
- P5 Library search
- P6 tick a task (work-block.tsx:314)
- P7 advance a phase
- P8 add a room or piece
- P9 approve or send a draft (draft-first, V23)
- P10 return to the Desk

PROPOSED BUDGETS (Kody to ratify):
- B1: visible change ≤100ms after any click
- B2: shaped placeholder ≤200ms after navigation
- B3: usable content ≤1.5s p75 at 4× CPU and Fast 4G
- B4: middleware adds ≤100ms

WAIVED: the design canon (Kody, 2026-10-14). Designers may propose shimmer, spinners, toasts, a progress bar, or retiring or replacing the US-14 arrival hold. Any departure from canon (paper, no shadows, ink-word state, StrataSweep, arrival) is named as a PQ ruling.

NOT WAIVED:
- The studio promise: never optimise for engagement.
- "Never AI" in copy.
- 44px targets.
- Accessibility: aria-busy, prefers-reduced-motion, contrast.
- Honesty: optimistic UI NEVER claims a client or vendor send, a payment, or a delete without Undo before the server confirms.
- Neutral pronouns for Leah and the hire. Simulated studio impressions are labelled simulated.

EVIDENCE RULES:
- Every number cites a file under baseline/ or a file:line.
- Local Supabase only for seeding (reuse artifacts/designer-portal-uplift-2026-10-09/walk/seed_uplift_walk.sql). Before seeding, check that NEXT_PUBLIC_SUPABASE_URL is 127.0.0.1.
- Prod is a READ-ONLY signed-in timing walk on app.patina.cloud (Kody approved, 2026-10-14):
  - navigation and observation only;
  - no clicks that write;
  - never open the spec book (it writes via ensure_project_spec_book);
  - no client data in screenshots beyond what the timing needs.
- PostHog: read-only queries only.

WORKTREE RULES:
- Absolute worktree paths. No Serena: it writes to the main checkout.
- Never git add -A; stage explicit paths.
- Stay inside your declared files.
- Compress PNGs (sips -Z 1600).
- DISK IS TIGHT: do not pnpm install in your worktree unless your ticket says so; read code from your worktree's tracked files.

SEATS (one ticket each), in dependency order:
- BASELINE
- then, in parallel: E1 data & writes; E2 page architecture; E3 edge & bundle; D1 loading language; D2 action feedback; R field patterns
- then SYNTHESIS (pairing + plan)
- then MOCKUPS
- then DOCUMENT
- then ADVERSARIAL (cross-provider)
- then FIX + RENDER

Each seat works alone from this contract, the plan, and upstream outputs. It does not edit another seat's files.
