# Wave 2 — designer lane notes

Lane: designer portal (`approvals/w2-designer`).
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` confirmed).
Base sha: `107549568c23b321fe413284de75164bde5852c9` — matches `env.md`.

Items: **P-13 (composer half)** and **P-17 (designer half)**. Nothing else was touched.

---

## P-13 — the designer's one-line why

### Where it lives

The Stage-2 composer is `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
(`submitDraft` → `useCreateProjectApproval`); the hook is
`packages/supabase/src/hooks/use-project-approvals.ts:553`. Confirmed by the brief's grep — the
only two call sites are that composer and the supersede form in the same file.

### What was built

**The field.** First on the paper, above the gate anatomy, labelled
`What would you tell her about this?` with the help line
`One line. She reads it under the question.` Optional (no `required`), `maxLength={200}` with the
change handler also slicing at 200 so a paste cannot overrun it.

It sits **outside** `GateCeremony`, deliberately. A gate has six parts and no more (R2 · M2, the
`gate-anatomy.tsx` header comment, and the suite's own
`stages the authoring flow as the six named gate parts` test which asserts the fieldset list
exactly). Making the why a seventh fieldset would have broken that contract; putting it above the
ceremony satisfies "above everything else" and leaves the six intact.

**The live count.** `whyRemainingLine()` in `project-approval-model.ts` — silent until twenty
characters remain, then words only: `Twenty characters left.` … `One character left.` …
`No characters left.` Never a figure, on purpose (VISION: words where words will do); a counter
running from the first keystroke is a meter on a sentence she is still writing, so it stays quiet
until the cap is actually close. The help paragraph carries `aria-live="polite"` and is the field's
`aria-describedby` target, so the count is announced without a second live region duplicating
visible text.

**The wire.** `ProjectApprovalCreatePayload` gains `why?: string | null`.
`useCreateProjectApproval` trims it and spreads `p_why` into the RPC args **only when non-empty**:

```ts
const why = input.payload.why?.trim() ?? '';
…
...(why ? { p_why: why } : {}),
```

So until the backend lane's migration merges, every existing call shape is byte-for-byte what it
was and the old signature still takes it. `p_why` is a top-level RPC argument, not a `p_payload`
key — that is what the brief specified; **if the backend lane instead freezes the why inside
`p_payload`, this one spread is the only line that changes.** Flagged as an advisory.

**The reading view.** `ProjectApprovalReview` gains `why`, parsed with `nullableString` (absent →
null, so artifacts minted before the column read as no-why rather than throwing). It renders under
the question in the unfolded gate as a new `GateWhy` block in `gate-anatomy.tsx` — her sentence in
the reading face, signed `— {given name}`.

### Two decisions worth the orchestrator's eye

1. **`why` is OPTIONAL on the `ProjectApprovalReview` interface** (`why?: string | null`), not
   required. Making it required broke every fixture in the client portal that is typed
   `: ProjectApprovalReview` (`approval-ask.test.tsx`, `client-attention.test.ts`,
   `threshold.tsx:251`) — the web lane's files, mid-wave. `parseProjectApprovalReview` always sets
   the key, so nothing reads `undefined` off a parsed row; the optionality exists only so the
   other lane's literals still compile. The web lane can consume `review.why` today.

2. **Attribution resolves the VIEWER's given name, not the author's.** The projection carries no
   author id or name (`parseProjectApprovalReview` — there is no `createdBy`), so the given name
   comes from `useAuth().user.name` through a pure `givenName()` helper (first word, or null — an
   empty name signs nothing rather than guessing). For Leah's studio, viewer == composer and the
   line is correct. **A studio co-member reading a peer's approval would see her own given name
   under someone else's sentence.** Closing that needs an author field on the projection — a
   backend change nobody in Wave 2 was briefed for. Recorded, not invented.

### What could not be verified

No rendered check — worktrees carry no `.env`, so no dev server. Owed at integration: open the
composer on a real project, confirm the field is first on the paper, type past 180 characters and
watch the words appear, submit and read the frozen why under the question. Also unverified end to
end: `p_why` actually landing in `project_approval_artifacts`, which needs the backend lane's
migration.

---

## P-17 — the stamp on the designer's ground

### What was wrong

`proposal-watch.tsx`'s `SignedSeal` drew `<Stamp label="SIGNED" color="var(--color-sage)" />` on a
sage plate (`bg-[rgba(168,181,160,0.12)]`). Sage is a green, and a green mark on the single most
consequential state is exactly the read VISION §6 refuses. `deriveStamp` in
`proposal-watch-derivation.ts` minted the same sage SIGNED.

### What was built

A small **local** component, `apps/designer-portal/src/components/document/signed-stamp.tsx` — no
shared package component this wave, per the brief. It implements the eleven-state grammar's four
dials for the Signed row:

| Dial | Value |
|---|---|
| Border weight | **doubled** — 1.5px outer plus an inset rule at `inset-[2.5px]` |
| Border pigment | mocha at the settled border opacity (`color-mix(… 88%)`); inner rule at 42% |
| Word ink | `var(--color-mocha)` at full strength — legibility never degrades |
| Rotation | `-1.1deg` |

No fill (`bg-transparent`), no shadow. The sage plate behind the seal is gone with it — a mocha
stamp on a green wash would have moved the refusal three inches to the left rather than closing it.
`deriveStamp`'s `accepted` case now mints `SIGNED` in mocha, border and ink.

**Why not reuse the portal's `Stamp`.** `stamp.tsx` is a single-rule mark at `-1.5deg` that a dozen
non-approval surfaces already draw (FF&E, orders, procurement trail). Changing it would have moved
every one of them; the grammar's doubled rule has no expression there at all.

**The pigments travel as CSS custom properties**, not as an inline `borderColor`. jsdom's CSSOM
drops `color-mix(...)` on a typed colour property — the first cut of the stamp set `borderColor`
inline and the test read back `""`. Custom properties survive `setProperty`, so the value is both
correct in a browser and readable in a test.

**No green check to retire on the surfaces touched.** Grepped the whole
`components/document` tree for `CheckCircle`, `<Check`, `checkmark`, `✓` and `✔`: zero hits. The
green check P-17 names lives on the CLIENT portal's `commercial-document-shell.tsx` — the web
lane's ground, per the Wave 1 report's own row 17.

### Left alone, on purpose (advisories, not scope)

- `red-letter-zone.tsx:31` maps `proposal_signed: 'var(--color-sage)'` — a sage pigment for a signed
  state on the Desk's need lines. Same family as this refusal, outside the brief's named files.
- `deriveStamp`'s `viewed` → `VIEWED` in sage is a reading state, not an approval outcome; sage
  stays a material pigment there per ux/02 §5, so it was not moved.
- No aging step (30-day border 0.88→0.74 / rule 0.42→0.26) was built. The brief named four dials
  and aging is not one of them; the grammar's aging rule is unimplemented on this surface.

---

## Gates

Run from a bare `cd` into the worktree, per the brief.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output, exit 0 |
| 2 | `pnpm --filter @patina/designer-portal lint` | **2 errors, both pre-existing and in files this lane never opened** — `piece-room-save-gate.test.tsx:159` (`Definition for rule 'import/first' was not found`) and `use-commercial-documents.test.ts:930` (`rules-of-hooks`). Neither appears in `git status`. `npx eslint` over the eleven files this lane changed: **0 errors, 2 warnings**, both pre-existing (`project-approval-document.tsx:228` exhaustive-deps on `approvals`, which predates this change; `proposal-watch.tsx:146` an unused eslint-disable that was already there). |
| 3 | `pnpm --filter @patina/designer-portal test -- <9 suites>` | **PASS** — `Test Suites: 9 passed, 9 total · Tests: 100 passed, 100 total` |
| 4 | `pnpm --filter @patina/supabase type-check` | **PASS** — exit 0 |
| 5 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `18 passed (18)` |
| 6 | `pnpm --filter @patina/admin-portal build` (the strictest gate) | **PASS** — exit 0, full route table emitted. Needed `pnpm turbo build --filter=@patina/admin-portal^...` first: the worktree bootstrap only built the designer portal's upstream deps, so `@patina/api-client`'s dist was absent and the first attempt failed `Module not found: Can't resolve '@patina/api-client'`. Not a code defect — a cold worktree. |

Courtesy check (not a briefed gate): `pnpm --filter @patina/client-portal type-check` fails with 9
pre-existing errors, all from an unbuilt `@patina/aesthete-quiz` dist in this cold worktree. **None
mention `why` or `ProjectApprovalReview`** — the optional-field decision above holds.

## Files

- `packages/supabase/src/hooks/use-project-approvals.ts`
- `packages/supabase/src/hooks/__tests__/use-project-approvals.test.ts`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-document.test.tsx`
- `apps/designer-portal/src/components/document/approvals/project-approval-model.ts`
- `apps/designer-portal/src/components/document/approvals/project-approval-model.test.ts`
- `apps/designer-portal/src/components/document/approvals/gate-anatomy.tsx`
- `apps/designer-portal/src/components/document/approvals/approvals-region-head.test.tsx`
- `apps/designer-portal/src/components/document/signed-stamp.tsx` (new)
- `apps/designer-portal/src/components/document/__tests__/signed-stamp.test.tsx` (new)
- `apps/designer-portal/src/components/document/proposal-watch.tsx`
- `apps/designer-portal/src/lib/document/proposal-watch-derivation.ts`
- `apps/designer-portal/src/lib/document/__tests__/proposal-watch-derivation.test.ts`

No migration was minted by this lane. No production mutation was run.
