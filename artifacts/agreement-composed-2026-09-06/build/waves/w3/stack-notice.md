# Stack ownership — agreement-w3

**As of 2026-09-07**, the program `agreement-composed` Wave 3 ("The Agreement, Composed" — turnkey) owns the shared local Supabase stack (`supabase status --workdir /Users/kody/Code/patina-merged`).

- Verified up at start of Wave 3 steward setup. `supabase_edge_runtime_supabase` and `supabase_pooler_supabase` show as "Stopped services" in `supabase status` output — DB/API/Studio/Auth/Storage/Realtime are running; this matches the state left by the Wave 2 steward and is not a Wave 3 change.
- `supabase_migrations.schema_migrations` head at start of Wave 3: `00577` (`00575_agreement_parts`, `00576_agreement_library`, `00577_agreement_fee_schedules` — the top three by version), i.e. exactly Wave 2's shipped head. No reset was performed to get here.
- Wave 3 lanes (backend, designer, client, edge, sub) do **NOT** reset or seed this shared stack during the build. Each lane validates its own migration/RLS/RPC work against a **scratch database** (see `env.md` → "Scratch-DB recipe"), not against this shared instance.
- Only the **integration steward** for Wave 3 resets or re-seeds the shared local stack, at merge/integration time.
- Do not run `supabase db reset`, `supabase stop`, or any destructive command against this stack from a lane worktree during the build phase.

Next owner: the Wave 3 integration steward, at integration time.

---

## Handover — the Wave 3 integration steward now owns this stack (2026-09-07)

The build phase is over. The **Wave 3 integration steward** has taken the shared
local Supabase stack (`supabase status --workdir /Users/kody/Code/patina-merged`)
and is about to `supabase db reset` it against the integration worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
(branch `agreement/w3-integration`), which carries all five lanes merged plus
migrations `00578_design_build_kind.sql` and `00579_trade_agreements.sql`.

- Ledger head **before** this reset: `00577` (Wave 2's shipped head — unchanged
  since the Wave 3 steward-setup reading recorded above).
- Ledger head **after** this reset: `00579`.
- The reset replays every migration from zero plus the seeds wired into
  `[db.seed]`, so **any un-migrated local state on this stack is destroyed**.
  Nothing in the Wave 3 build depended on such state: every lane validated on a
  scratch database per `env.md`.
- `project_id = "supabase"` is identical in the main checkout's `config.toml` and
  the integration worktree's, so a reset run with
  `--workdir <integration worktree>` targets these same containers while
  replaying the **integration branch's** migration tree. That is deliberate.

**Do not** run `supabase db reset`, `supabase stop`, or any destructive command
against this stack from a lane worktree from here on. Ask the integration
steward, or take the stack over explicitly by appending to this file.

Next owner: whoever runs the Wave 3 walk. The walk boot recipe (both portals,
the two-flag override, seeded accounts) is in `walk-env.md` beside this file.

---

## Reset — close-out fixes R40–R47 (2026-09-07, close-out agent)

The close-out pass (rulings R40–R47) edited `00578_design_build_kind.sql` in
place — `compose_agreement_consent` (R40), `_agreement_schedule_of_values` /
`_validate_pricing_basis_payload` / `send_commercial_document` (R43), and a
pinned `search_path` on nine functions (R45). Both migrations are still
unapplied on Strata, so editing in place is the correct remediation.

**`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration` was run once, after those edits, and this stack now carries them.**

- Ledger head after the reset: `00579` (probed:
  `select version from supabase_migrations.schema_migrations order by version desc limit 3` →
  `00579, 00578, 00577`).
- Probed after the reset, not inferred: no `public._agreement*` or
  `public._validate*` function has a null `proconfig` (R45 landed).
- `supabase/seed/00-legacy-grants.sql` was regenerated with
  `python3 scripts/generate-legacy-grants.py` **before** the reset —
  "baseline + 2568 replayed statements", `git diff --stat` empty, so no grant
  moved in this pass — and it replayed clean as the first seed of that reset.
- Iteration before the reset used a **scratch clone** (`patina_w3fix`) made with
  `pg_dump --no-owner -Fc` + serial `pg_restore --no-owner` per the round-3
  correction to `env.md`'s recipe (818 public FKs on the clone; the piped
  `pg_dump | psql` recipe silently drops every constraint under libpq 18.4).
  The scratch DB was dropped before the reset.
- A `pnpm dev` client-portal server was started on :3002 to run the two
  Playwright specs the rulings name, and stopped afterwards. Nothing else was
  left running.

Next owner: unchanged — whoever runs the Wave 3 walk.

---

## Reset — re-gate 2 (2026-09-07, independent re-gate reviewer)

The re-gate reviewer took the stack and ran
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
**twice**. No migration and no seed file was edited in this pass — both resets
replay the same tree the close-out left; the second exists only to hand the walk
a clean stack.

1. **First reset**, before any probe. Finished clean. Ledger head probed after:
   `00579, 00578, 00577` (533 rows). Everything in
   `integration-regate-2.md` §0–§3 was measured on this replay.
2. **Second reset**, after the gates. Finished clean, same head. It exists
   because the two client Playwright runs leave real fixture rows behind — after
   them the stack carried 4 `studio_trade_agreements` and 2 `design_build`
   proposals, which a walk should not meet. Probed after: both counts are `0`.

Other notes for the next owner:

- `python3 scripts/generate-legacy-grants.py` was re-run: "baseline + 2568
  replayed statements", `git diff` on `supabase/seed/00-legacy-grants.sql`
  **empty**. No grant moved in this pass either.
- Every probe transaction was `BEGIN … ROLLBACK`, so nothing this reviewer
  probed survives on the stack.
- A scratch clone `patina_regate2` was made with `pg_dump --no-owner -Fc` +
  `pg_restore --no-owner` (813 of the source's 818 public FKs restored; the five
  that did not are `engagement_events_user_id_fkey`, both `invoice_links_*`,
  `organization_members_user_id_fkey`, `user_roles_user_id_fkey` — all
  cross-schema references `pg_restore` skipped along with 57 default-privilege
  statements it lacked rights for). It was used only to confirm that
  `pg_stat_get_function_calls` is invisible inside an open transaction, and was
  **dropped** before the gates. Worth knowing: the corrected recipe in `env.md`
  is not a perfect clone either.
- A `pnpm dev` client-portal server ran on :3002 with the three-flag override
  for the e2e gate and was stopped; :3002 confirmed clear afterwards.

Next owner: unchanged — whoever runs the Wave 3 walk. The stack is at `00579`,
freshly reset, with no e2e or probe residue.

---

## The web walk, round 1 (2026-09-07, web walker) — NO RESET

The Wave 3 web walker took the stack and **did not reset it**. No migration, no
seed file, no grant and no product file was touched; `supabase db reset` was
never run. Ledger head probed before the first click and unchanged after:
`00579, 00578, 00577`.

The walk is a real walk, so it left real rows behind. They are walk data, not
seed data, and a
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
clears every one of them:

- proposal `17143662-9354-4f24-87ea-503f818d0bae` — the Halvorsen turnkey prime,
  composed, sent, client-signed and countersigned — and the project it created,
  `6bb8a8b7-6d1e-4913-a8ef-954a49528bec`, with its `project_billing_authorities`
  row (`per_draw`, NULL ceiling), its `agreement_execution_snapshots` row and
  its five `agreement_draw_invoices` rows.
- two further drafts on the same household: `a8efd3b8-bd86-4d18-ae05-8b8066bb1aa5`
  (turnkey, used for the axe pass and the flag-off captures) and
  `38ea6c93-dce8-45c8-bba8-3ea94d979c03` (design services).
- one `studio_license_attestations` row on studio
  `e7d0c2a3-8e35-4282-8b32-638b51be95d0` (WI Dwelling Contractor · 1234567 · WI
  · 2027-03-31).
- one `studio_contacts` row, `c0000000-0000-4000-8000-00000000ca01` (Marta
  Reyes / Reyes Cabinetry), and the `studio_trade_agreements` row signed
  through it, with its spent token. These were minted through
  `create_trade_agreement` / `send_trade_agreement` /
  `mint_trade_agreement_token` (`web-walk/mint-trade.sql`) because the studio
  surface that would create them is unreachable — finding W3R1-01 in
  `walk-web-r1.md`.
- one `invoices` row, `INV-0001`, "Deposit at signing", `$8,413.40`, unpaid.

Dev servers: designer :3000 and client :3002 were started with `nohup` from the
integration worktree three times (all flags on; `design-build:false`; all three
off) and **all were killed**; both ports were confirmed clear at the end.

Next owner: whoever runs Wave 3 round 2. Reset before a fresh walk, or expect
to meet the rows above.

---

## Reset — walk fixes, round 1 (2026-09-08, walk-fix agent)

The walk-fix agent took the stack and ran
`supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
**twice**, because this pass edited `00578_design_build_kind.sql` in place
(W3R1-06 — the seeded `patina.notice_of_cancellation` leaf is now
`clientVisible: false`, and `send_commercial_document` refuses any
client-visible attachment that asks to be acknowledged and carries no body).
Both migrations are still unapplied on Strata, so editing in place remains the
correct remediation.

1. **First reset**, immediately after the migration edit and before any gate.
   Finished clean. Everything measured afterwards — the SQL suites, the types
   regen, the two Playwright specs — ran on that replay.
2. **Second reset**, after the gates, so the next walk meets a clean stack: the
   two client Playwright runs leave real fixture rows behind, and the walk
   rows listed in the section above were still on the stack when this pass
   started.

Probed after the second reset, not inferred:

- ledger head `00579, 00578, 00577`;
- `studio_trade_agreements` count `0`; `proposals` with
  `document_kind='design_build'` count `0` — every walk row from round 1 is
  gone;
- the seeded turnkey template carries
  `{"partKey":"patina.notice_of_cancellation","clientVisible":false}` — the
  migration edit is on this stack, verified by containment on
  `agreement_templates.parts`, not by reading the file.

Other notes for the next owner:

- `python3 scripts/generate-legacy-grants.py` was re-run: "baseline + 2568
  replayed statements", `git diff` on `supabase/seed/00-legacy-grants.sql`
  **empty**. No grant moved in this pass.
- `SUPABASE_DB_URL=… pnpm db:generate` was run and
  `git diff --exit-code packages/supabase/src/database.types.ts` was clean —
  this pass changed function bodies and a seeded template row, not schema. The
  file is 1.2 MB (not truncated).
- A `pnpm dev` client-portal server ran on :3002 with the three-flag override
  for the two e2e specs the close-out rulings name, and was stopped; :3002 and
  :3000 were both confirmed clear afterwards. The dev server needs
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` exported from
  `supabase status -o env` — that command's own names are `API_URL` /
  `ANON_KEY`, and exporting them unrenamed gives "Your project's URL and Key
  are required to create a Supabase client!" on every route.
- No scratch database was made or dropped in this pass.

Next owner: whoever runs Wave 3 round 2. The stack is at `00579`, freshly
reset, with no walk, e2e or probe residue.

---

## The web walk, round 2 (2026-09-08, web walker) — NO RESET

The round-2 web walker took the stack and **did not reset it**. No migration, no
seed file, no grant and no product file was touched; `supabase db reset` was
never run. Ledger head probed before the first click and unchanged after:
`00579, 00578, 00577`.

Docker and every Supabase container were **down** when this walk started (all
`Exited … 6 hours ago`). `supabase start --workdir
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-integration`
brought them back from the existing volumes ("Starting database from backup"),
so round 1's rows and the earlier round-2 attempt's rows were all still present
and this walk ran on top of them.

**One row was deleted, deliberately**: the `studio_license_attestations` row on
studio `fdd04b99-143f-410b-8be3-c18b5e2077cf`, left by the earlier round-2
attempt, so that walk step 1 could be walked honestly (the design-build template
must be *disabled* before the attestation exists). It was re-created through the
Account → Studio card in step 3 and is on the stack again, identical:
`WI Dwelling Contractor · 1234567 · WI · 2027-03-31`.

What this walk left behind (all of it walk data, all of it cleared by a
`supabase db reset --workdir <integration worktree>`):

- proposal `95390bd8-86e4-4a0b-9595-9dd5657cc51e` — the Halvorsen turnkey prime,
  composed, sent, client-signed, countersigned; its project
  `f3fec788-c74f-44ae-bd32-cc2fc0642fdd`, one `project_billing_authorities` row
  (`per_draw`, NULL ceiling), one `agreement_execution_snapshots` row, five
  `agreement_draw_invoices` rows.
- proposal `de3970a0-de56-4e0f-9c02-421e870d9dcf` — **sent, awaiting signature,
  with its pricing basis hidden from the client**. This is the live reproduction
  of finding W3R2-01; leave it if you want to see it, reset if you don't.
- proposal `fa5842b5-ad38-4464-8cfc-ec960c62ca4e` — a fresh turnkey draft, never
  sent, used for the three flag-off captures.
- invoices INV-0003 (deposit, `paid` — settled through `record_invoice_payment`,
  not Stripe, which is unconfigured locally) and INV-0004 (Rough-in, `sent`,
  with a live pay token), plus the `designer_earnings` `design_fee` row.
- trade agreement `7e1c1d96-4e05-4607-b5a3-2cd419bfd420` (Reyes Cabinetry,
  `signed`), its spent token, a second token minted and then set `revoked`
  without being spent (the R46 probe), and one `record_agreement_draw_lien_waiver`
  row against draw 2.
- one `comms_threads` `direct` row from the R47 "Ask a question" probe.
- the rows round 1 and the earlier round-2 attempt left, untouched (proposals
  `280f1dfc…`/`277e058d…`, project `03e6a36d…`, INV-0001/0002, trade agreement
  `455b1296…`, the `studio_contacts` row for Marta Reyes).

Dev servers: designer :3000 and client :3002 were started with `nohup` from the
integration worktree four times (all flags on, `design-build:false`, all three
off, all flags on again) and **all were killed**; both ports confirmed clear at
the end. Nothing else was left running. The Supabase containers were left
**up**.

Next owner: whoever runs the Wave 3 fixes for round 2. Reset before a fresh
walk, or expect to meet the rows above.
