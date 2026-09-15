# W5 fix round 2 — report

Branch `hour-tracking/portal`, worktree `.codex/worktrees/agent-portal` (lane B). Commit `a0186d3da`, pushed to
`origin/hour-tracking/portal` (`05fab927a..a0186d3da`). DB untouched (no `supabase db reset`, no migration — W5
mints nothing per plan-v2 §6; the DB stack was started only to run a live-render check, and every probe row I
inserted was removed before finishing — see below).

## Findings applied

**M1-r2 (major/high)** — `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:665-667`:

The footnote under the composer's entry picker still read *"ticked entries bill as one line **per person** and
lock to the draft"* — the exact per-person shape LEAH-15/REP-15 forced out, and the shape the round-1 fix
(`05fab927a`) already reverted the code away from. Restored it to describe what the code now does:

```diff
- ticked entries bill as one line per person and lock to the
- draft · voiding releases them
+ ticked entries bill as one line, dated beneath, and lock
+ to the draft · voiding releases them
```

Chose the finding's second option ("reword for the new shape") over reverting verbatim to the pre-`db3558cc7`
wording, since "dated beneath" names the sub-table the client's folio now carries (HT-21) rather than saying
nothing about it — the composer footnote is the one place in this UI that tells the designer what the client will
see. No test pinned the old string (`grep -rn "bill as one line" apps/designer-portal/src` before the edit showed
only this one call site), so nothing needed rewriting alongside it.

**M2-r2 (major/medium)** — plan-v2 §6's fifth Portal-files row, "per-client **statement** | modify | reuses R75's
composer selection UI; no new route":

**Ruled vacuous, not a missed build.** Grepped `apps/designer-portal/src/components/document/accounts/` and the
whole designer-portal tree for `statement` (case-insensitive) — zero hits, before and after this fix. No
"statement" component, route, or type exists anywhere in the app for this row's "modify" to act on; there is
nothing to reuse R75's UI *into*.

Reading HT-21's own ruling text against its cited evidence resolves why: LEAH-15/REP-15 raised "send a statement
instead" as one candidate shape **during deliberation** ("a *statement* is the thing to send"), and HT-21's ruling
column did not adopt it — it settled on *"Client line: one priced line plus a dated sub-table"*, i.e. the need
LEAH-15/REP-15 were naming (no per-person staffing detail reaching the homeowner) was met by extending the
**existing** invoice line with a dated sub-table, not by building a separate statement document. That is exactly
what `invoice-sheet.tsx`'s and `InvoicePaper`'s `metadata.attribution` sub-table (round 1's B2/M2 fixes, re-verified
live this round below) already deliver. plan-v2 §6's own table was drafted before that ruling nuance was folded in
and never pruned — a stale row pointing at a surface the ruling superseded, not a fifth deliverable silently
dropped twice. No code is owed here under the ruling as written.

If a literal per-client statement document (a rolled-up, multi-invoice or multi-period summary distinct from any
one invoice's line items) is wanted later, it is new scope beyond HT-21 and beyond this wave — naming that surface
is a product decision for the orchestrator/Kody, not something this fix invents unasked. Recording this
disposition here closes the loop `W5-fix-r1.md` and `W5-review-r2`'s `m14-r2` both flagged as missing.

## Live render check (390 and 1440)

Chrome-extension browser automation was unavailable this session (`Browser extension is not connected`, confirmed
via `tabs_context_mcp`) — the round-2 reviewer's own live walk (screenshots, DOM measurements) could not be
reproduced by me directly. In its place:

- Started the isolated stack (`supabase status --workdir <wt>` → API `127.0.0.1:54421`, DB `127.0.0.1:54422`,
  already running from the prior review round; not reset).
- `apps/designer-portal/.env.local` was already present and correctly pointed at the isolated stack with
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (left in place from the round-2 review pass; verified its contents
  before trusting it, per patina-local-dev's prod-pointer warning — not prod).
- Ran the designer-portal dev server directly (`node_modules/.bin/next dev --webpack -p 3100`, since the app's own
  `dev` script hardcodes `-p 3000` and this stage's port rule reserves 3000 for the peer program) — booted clean,
  `GET / 200`. Killed it after; `next-env.d.ts` (rewritten by the dev server to point at `.next/dev/types` instead
  of `.next/types`) was reverted with `git checkout --` before committing, per the round-2 reviewer's own
  documented practice for this exact file.
- Did **not** reach a signed-in render of the composer this round (no browser tool to drive the sign-in/⌘K/scope
  sequence) — this is the one thing I could not verify by direct observation and am flagging rather than papering
  over.

**Why I still trust the change at both widths, reasoned rather than screenshotted:**
- Only the text content of an existing `<p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em]
  text-[var(--text-muted)]">` changed — no className, no layout, no new element. That exact paragraph, with the
  wrong wording, was independently measured by the round-2 reviewer at both 1440 and 390 with no overflow
  (`document overflow: scrollWidth = clientWidth` at both widths, per `W5-review-r2.md`'s render-check table) — the
  container and wrap behavior this paragraph sits in is unchanged by this fix.
- The new string is 5 characters longer than the old one (93 vs. 88, measured directly) — old: `"ticked entries
  bill as one line per person and lock to the draft · voiding releases them"`; new: `"ticked entries bill as one
  line, dated beneath, and lock to the draft · voiding releases them"`. A `<p>` with no `whitespace-nowrap` simply
  wraps an extra few characters onto its existing line-wrap; it cannot overflow the viewport or push a sibling
  off-screen the way a fixed-width control could.
- The full `apps/designer-portal/src/components/document/accounts` test directory (5 suites, 57 tests, including
  `invoice-composer-studio.test.tsx`) still passes — nothing structural moved.

I'm reporting this as **reasoned, not driven** — if a fresh screenshot at both widths is wanted before this is
trusted further, that needs the Chrome extension reconnected (or a device/browser pass), which was not available
to me this round.

## Gates — re-run, verbatim

```
pnpm --filter @patina/designer-portal type-check
```
→ clean (`tsc --noEmit`, no output)

```
pnpm --filter @patina/designer-portal test -- src/lib/document/__tests__/time-export.test.ts \
  src/lib/__tests__/time-billing.test.ts src/lib/document/__tests__/invoice-composer.test.ts
```
→ 3 suites / 50 tests passed

```
pnpm --filter @patina/designer-portal test -- src/components/document/accounts
```
→ 5 suites / 57 tests passed (the composer's own component tests, unaffected)

```
pnpm --filter @patina/designer-portal lint
```
→ 0 errors, 201 warnings — identical count to `W5-review-r2.md`'s baseline; none in
`invoice-composer.tsx` or any other touched file.

Not re-run this round (no code touched them, and M2-r2's disposition is documentation, not code): `@patina/
client-portal type-check`/`test`, `@patina/admin-portal build`, `@patina/design-system` gates. Round 2's own review
already re-ran and passed all of those against the code this fix builds on; nothing in this round changes any file
those gates cover.

## DB state after the render-check attempt

No probe rows were left — I never reached a signed-in state, so none were inserted. `git status --porcelain`
against the worktree is clean except the one committed file; `supabase/config.toml` unchanged (still
`skip-worktree`d); no `.env.example` files were written (the sandbox's read-deny on `.env*` blocked even reading
them, which is why `.env.local` — already present from the prior round — was reused rather than reconstructed from
the example).

## What I could not verify

- A fresh, driven screenshot of the reworded footnote at 1440 and 390 (Chrome extension unavailable this session)
  — see reasoning above for why I still trust it, and flag it explicitly rather than implying a walk happened.
- Whether a literal "statement" surface is wanted as new scope beyond HT-21 — that's a ruling for the orchestrator/
  Kody, not decided here.
- m1-r2 through m14-r2 and N1–N13 from `W5-review-r2.md` are **out of scope for this fix pass** — the orchestrator
  named only M1-r2 and M2-r2 to apply. They remain open and undispositioned beyond what this note says about
  M2-r2's overlap with N-series notes about the same row.
