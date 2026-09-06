# Wave 3 — integration lane notes

Steward: 2026-09-05. Branch `approvals/w3-integration`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`.
`git rev-parse --show-toplevel` on the first command returned that same path.

No product code was written in this lane. The only non-doc edits are the two conflict
resolutions recorded below, both of them minimal reconciliations between a lane and main.

## What merged

Order backend → web → iose, each `--no-ff`:

| Commit | Subject |
|---|---|
| `a61e16dbf` | `chore(approvals): merge w3-backend` |
| `8d956eac5` | `chore(approvals): merge w3-web` |
| `d54b6fac8` | `chore(approvals): merge w3-iose` |
| `9c38a2645` | `chore(approvals): merge main — studio invoices landed` |
| `ca57c899f` | `chore(approvals): merge main — studio invoices deploy report` |

`origin/main` moved twice while Wave 3 built (the `studio-invoices` program shipped). Both
were merged in so the tip is a descendant of `origin/main` at `fd064e56e`.

### Conflicts resolved — two, both from main's studio-invoices merge

1. `supabase/seed/00-legacy-grants.sql` — both sides appended their own migration's grant
   block. Kept both, 00571's ahead of 00572's, and closed the `DO $g$` block the conflict
   markers had truncated. `DO`/`END` counts balance at 2196 each.
2. `apps/client-portal/src/components/threshold/house-ledger.tsx` (`owedWords`) — kept main's
   studio-invoice arms and applied P-24's `countInWords` speller to all three, then moved the
   four figure-spelled expectations in `house-ledger.test.tsx` / `threshold.test.tsx` onto
   words to match.

## Migrations — no renumbering

The branch carries two new files, both already above main's highest:

- `supabase/migrations/00572_she_sets_the_pace.sql` (backend lane)
- `supabase/migrations/00573_approval_record_typed_name.sql` (web lane)

Main's ledger tops out at `00571_studio_invoices.sql` (the peer program, now merged). 00570 was
never landed — it lives only on the unmerged `approvals/w2-web` tip, folded into 00569 at Wave 2
integration. Nothing collides, so **our files were left where the lanes minted them**. Main's
migrations were not touched.

## Open findings merged as advisories

Both lane verdicts were *fix* with one open major each. Neither is a BLOCKER; both ride onto the
branch and are owed to a later round.

- **backend M-R3-01** — `decisionsMailedDirect` uses the whole digest window instead of a
  24-hour floor, so an approval whose direct letter left early in a stretched window can be
  suppressed from a later summary it should still appear in. Under-sends; never over-sends, and
  never suppresses an overdue notice. Merged as an advisory.
- **iose R3-M1** — the "Don't remind me" confirmation promises an end condition nothing
  implements. A copy/behaviour mismatch on the quietest cadence, in the safe direction (it goes
  quieter than the sentence claims, not louder). Merged as an advisory.

## The shared local stack

Reset by this lane only, per `stack-reset-notice.md`, after the orchestrator's handshake and
after main was merged in — so the replay carries main's ledger through 00571 plus 00572/00573
and drops nothing the peer program needs. Ledger after the reset, read back from
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`: `00573, 00572, 00571, 00569, 00568`.
No prod endpoint was touched at any point in this lane.
