# Wave 3 — WEB WALK lane notes (round 1)

The walker's own log: how the stack was reached, what was seeded and why, which harness traps
cost time, and what was left unwalked. The findings themselves live in `walk-web-r1.md`.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-integration`
(`git rev-parse --show-toplevel` returned exactly that on the first command), branch
`approvals/w3-integration`, HEAD `275f86ba6`. **No product code was written.** Nothing pushed.
No production mutation. No `.env` read or written.

## Boot

```
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/export NEXT_PUBLIC_SUPABASE_ANON_KEY=/p')"
eval "$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p')"
nohup pnpm --dir <worktree> --filter @patina/client-portal dev >> web-walk-dev.log 2>&1 &
```

Ready in well under a minute; `curl -o /dev/null -w %{http_code} http://localhost:3002/auth/signin`
→ `200`. **`localhost`, never `127.0.0.1`** — Wave 2's advisory 3 (Next 16 blocks its own dev
resources cross-origin at `127.0.0.1` and the page silently never hydrates) was taken as given
and not re-tested.

The stack was **not** reset, per the brief. Read before starting:
`supabase_migrations.schema_migrations` → `00573, 00572, 00571, 00569, 00568`. Both Wave 3
migrations live, so neither new act refuses.

## Seed, and why the fixture alone was not enough

`apps/designer-portal/e2e/helpers/workflow-gate-fixture.sql` lays down the eight G-rows Wave 1
and Wave 2 both used. It gives a settled approval (G3), a past-due one (G6), a returned one
(G8), a draft with its review outstanding (G1), a draft ready to publish (G7), and a
superseded pair (G4→G5).

**Its superseded pair is the wrong shape for P-27.** G4 is superseded while still `pending` —
she never answered it — so `successionLine()` and `whatChangedSince()` both correctly draw
nothing (they require the predecessor's row *and* her answer). The brief asks for
"predecessor approved, successor published with a different cost delta", which the fixture does
not contain, so `web-walk/seed-w3.sql` builds it through the same RPCs:

```
create_project_approval_decision(…, p_why)  → confirm_project_decision_review
  → publish_client_decision → respond_project_approval(outcome='approved',
      clientSignature='Client User', clientConsentMethod='electronic_signature')
  → supersede_project_approval_decision(…, cost 45000 vs the predecessor's 125000, p_why)
  → confirm_project_decision_review → publish_client_decision      (successor left pending)
```

`supersede_project_approval_decision` accepts a `responded` predecessor (`00465`'s guard is
`status NOT IN ('pending','responded')`), and it demands "a genuinely new immutable artifact",
so two fresh `plan_issues` rows (903, 904) were inserted in replica mode first — the same route
the fixture takes for its own two.

**One trap in that script.** `SELECT updated_at FROM client_decisions … \gset` returns no rows
while `SET LOCAL ROLE authenticated` is in force as the client — the homeowner has no direct
SELECT on the table, only the projections. `RESET ROLE` before reading back the expected
`updated_at` for the supersede call.

**The signature row.** A fresh seed carries **zero** `commercial_document_signatures`, so
`/proposals/<id>/record` answers "This paper has not been signed yet, so there is nothing to
keep." One row was inserted on the already-executed trade scope
`b0000000-…-0000000cd003`, deliberately carrying `signed_ip = '203.0.113.44'` so that the
"never the IP address" assertion has a real value to refuse rather than passing vacuously.
(`get_client_commercial_document_bundle` does not project `signed_ip` at all; the decision rail
has no IP column whatsoever.)

## Harness traps, in the order they cost time

1. **A fragment-only `page.goto` is a same-document navigation in Chromium.** `#approval-<a>` →
   `#approval-<b>` does not reload, so `ApprovalRecords`' `all` state survives, and my first
   fold table reported "6 records shown, no fold act" on all four probes — including the one
   whose whole point is that the fold should stay shut. Re-run with `goto('/')` between probes;
   the corrected table is in `walk-web-r1.md` §2.
2. **React Query retries a 403 three times.** The stranger's read of the paper record looks like
   a blank page at 3.5 s and only settles at ~5 s. Two readings were wrong for this and were
   re-taken. (The latency itself is finding `W3W-R1-04`.)
3. **The details sheet is a dialog over the doorstep.** `document.body.innerText` after opening
   it returns the *doorstep*, not the sheet. Read `radio.closest('[role="dialog"]')`.
4. **`supabase status` cannot run sandboxed** — the CLI opens `supabase/.env.local` and the
   sandbox denies it (`EPERM`), with an unhelpful Effect stack trace rather than a permission
   message. `psql` against `127.0.0.1:54322` is fine sandboxed; only the CLI needs the override.
5. **Playwright cannot launch chromium sandboxed** (Wave 2's advisory 5, unchanged).
6. **`timeout(1)` is not on PATH here.** Use node's own exit, or run in the background.

## What was not walked, and why

- **`door-keep-a-copy`.** The seed carries no unsigned commercial instrument, so no `DoorGate`
  mounts at all (`door-gate` count 0 even with `?proposal=<signed id>#door`), and the door's
  receipt — and therefore the act — is session state written by `onSigned`. Building a door by
  hand is what Wave 2 did; its `POST /api/proposals/<id>/sign` answered 500 on the hand-built
  scaffold, which is where that walk's `W1-02` came from. Judged not worth re-running for an
  act covered by `door-gate.test.tsx:390` and readable at `door-gate.tsx:404-418` in exactly
  the shape the two walked acts take. **If the door is to be walked again the seed needs a real
  signable instrument** — this is the third wave in a row to hit it.
- Wave 2's `W1-02`, `W1-03`, `W1-05`, `W1-06`, `W1-07` — outside this brief. `W1-01`, `W1-04`,
  `W1-08` and `W1-n4` were re-read because they sit on surfaces this brief walks; three of the
  four are closed.

## Files

```
web-walk/lib.mjs                     shared: launch, sign-in, settle, shot, hold
web-walk/seed-w3.sql                 the superseded pair + the signature row
web-walk/01-record-owner.mjs         the two sheets, as the owner
web-walk/02-record-stranger-print.mjs  the second homeowner, then print emulation
web-walk/03-stranger-proposal-deep.mjs the 403 retry window
web-walk/04-doorstep-recon.mjs       DOM recon
web-walk/05-successor-and-records.mjs P-27 + keep-a-copy inventory
web-walk/06-door-receipt.mjs         the door hunt
web-walk/07-pace.mjs · 08 · 09-details-sheet.mjs   the cadence sheet
web-walk/10-cadence-snooze.mjs       cadence write + snooze write + past due
web-walk/11-answer-and-fold.mjs      the browser-recorded Approve
web-walk/12 · 13-fold-anchor-fresh.mjs  the fold, four probes on fresh loads
web-walk/14-axe-vocab.mjs            axe + the vocabulary sweep
web-walk/15-contrast-landmark.mjs    the two axe violations, measured
web-walk/16-record-variants.mjs      returned / approved / unanswered / signed out
web-walk/17-snooze-reentry.mjs       the re-entry read-back
web-walk/18-final-shots.mjs          390 px
web-walk-shots-r1/                   34 shots
web-walk-dev.log                     the dev server
```

## Housekeeping

Local stack not reset. Local mutations only: the fixture's teardown/setup, two plan issues, the
superseded pair through the RPCs, one signature row, and the four acts the browser recorded
(one Approve, one cadence change, two snoozes). Dev server killed at the end.
