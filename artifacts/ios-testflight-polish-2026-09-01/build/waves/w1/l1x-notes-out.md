# First Flight · W1 · L1-X — notes out

Every change this lane needs in another lane's file, with the exact final text. **There are none that
require an edit.** Two lanes get a "nothing owed" note so neither waits on L1-X, and both were also
appended to the target lanes' own notes files.

---

## → **L1-B** (`Features/Proposals/**`, ruled to L1-B by steward.md §5.9 S-3)

**Nothing owed. No file change, no task, no rebuild.**

`L07-01` is closed entirely in SQL (`supabase/migrations/00559_proposal_signing_multi_studio.sql`).
The client passes no studio identifier:
`apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:405-418` sends exactly
`{p_proposal_id, p_signed_name}` to `sign_proposal`. The RPC signature is unchanged and so is its
response shape (`status`, `signed_at`, `project_id`, `accepted_at`, `newly_signed`), so
`ProposalSignError.map` and `ProposalSignSheet` need no edit. `L07-01`'s own `codeNote` says the same:
"the client copy is correct and the error mapping is deliberate … the client is told the truth".

One thing to know if a walker signs a proposal on a device before Kody applies 00559 to Strata: the
sheet will still print *"We couldn't record your signature. Nothing has been signed."* That is the
server, not L1-B's screen. Liveness on production is Kody's read-only probe (runbook J1;
`build/waves/w1/l1x-notes.md` §3).

---

## → **L1-F** (notifications, messaging, widget, deep links)

**Nothing owed.** Recorded only because `L07-01` carries `alsoTouches: ["L1-E"]` and sits next to
`L07-02` on the same walk: 00559 changes no notification, no deep link and no widget payload. It
changes one trigger body on `public.projects` and nothing else.

---

## → **the steward / Fable**

Not a lane file, so these live in `build/waves/w1/l1x-notes.md` §2 in full. In one line each:

1. **N1** — `supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql` and
   `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` are **red until 00559 is applied**
   and go green on the wave's `pnpm supabase:reset`; neither belongs in `KNOWN_FAILURES.md`.
2. **N2** — this lane committed nothing to the shared local database; every proof rolled back, and the
   database still reads `00558` with the old function body.
3. **N4** — a latent sibling defect (a two-studio designer cannot create a project from the portal
   either, and their projects carry `studio_id = NULL`) is deliberately left alone and pinned as
   still-failing-closed by section 5 of the new test. It wants its own finding if it is to be fixed.
