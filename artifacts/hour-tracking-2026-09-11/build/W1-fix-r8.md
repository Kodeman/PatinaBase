# W1 — fix pass, round 8

**Commit** `15744506d` on `hour-tracking/server` (pushed; `57ac7a0d1..15744506d`).
3 files, +334 / −0: `supabase/migrations/00599_resolve_time_rate_cents.sql`,
`supabase/migrations/00602_projects_studio_id_on_insert.sql`,
`supabase/tests/billing/time_rate_resolution_test.sql`.
No migration was added (`00603` stays unused, as HT-3-a directs). No schema change, so
`packages/supabase/src/database.types.ts` and `supabase/seed/00-legacy-grants.sql` are
byte-unchanged — both regenerated and verified clean rather than assumed.
`supabase/config.toml` untouched, still `S` (skip-worktree), absent from the commit.

---

## The one finding handed to me

### W1-R8-01 · blocker · **CONFIRMED, re-measured from scratch this pass — PINNED, NOT FIXED**

The finding is correct in every particular, and it is a **consequence of HT-3-a as ruled**,
not a deviation from it. I reproduced both arms *and* its negative control in **one** fixture,
through RLS as the actor named, on the program's own stack (`127.0.0.1:54422`):

```
hire owns workspace: 89aea828-…            | control hire owns: NONE
project stamped:     89aea828-…            (= the hire's own workspace, NOT studio S)
control project stamped: …90a1             (= studio S)

entry 90b1  hire's own hour       99900  studio_member  199800  authorized   (Leah priced her 20000 in S)
entry 90b2  assistant's hour       NULL  none              NULL  authorized   (Leah priced him 12000 in S)
entry 90b3  CONTROL hire's hour   20000  studio_member   40000  authorized   ← the employing studio prices it

project_unbilled_time for the stamped project:
  hire       120 min  resolved_rate_cents=99900  amount_cents=199800   ($1,998.00 to the composer)
  assistant  120 min  resolved_rate_cents=0      amount_cents=0        ($0, not "rate pending")
```

Two details I pinned down that sharpen the finding:

- **The discriminator is the order of two ordinary acts**, and it is exactly one act apart:
  the designer's `user_roles` grant in the `designer` domain fires
  `fc_sync_is_designer_from_role` → `is_designer` → `00295`'s
  `fc_provision_studio_on_designer`. Granted **before** she is seated (the self-signup order)
  she owns a one-person workspace and the defect fires; seated **first** (the invite order)
  `00295`'s early exit leaves her owning nothing and `00563`'s one-candidate discovery stamps
  the employer. Nothing else in the fixture differs — same studio, same rates, same `admin`
  seat, same project shape.
- **The live path agrees, and no portal call rescues it.** `useCreateProject`
  (`packages/supabase/src/hooks/use-projects.ts:62-67`) sends `name`, `notes`, `status`,
  `created_by` — **no `studio_id`** — so the column is always server-derived. For a designer
  who owns a workspace *and* holds an employer seat, `00563`'s discovery sees two candidates:
  a direct authenticated INSERT fails closed, and the activation bridge's tiebreak
  (`… (membership.role = 'owner') DESC, membership.joined_at …`, `00563`) prefers the same
  personal workspace. `00602` is therefore not what introduces this; it reproduces `00563`'s
  own answer in migration/seed context.

**What I did NOT do, and why.** The finding's own exact fix says it needs a ruling (HT-3-b),
and it does. I shipped no widening and no narrowing; `00599`'s step-2 leg and `00602`'s stamp
are byte-unchanged:

- HT-3-a, ruled by Kody **today**, fixes step 2 as ownership in its own text and says
  *"00603 stays unused"*. Widening step 2 is an amendment to a ruling made hours ago, not an
  implementation choice.
- Every widening I could construct is manufacturable, which rounds 4–6 already measured:
  `Org owners can insert members` needs **no consent from the invitee**, so an attacker seats
  the **project's designer** in a workspace the attacker controls and the attacker's rate wins
  the preference key. "≥ 2 active members", "a studio she does not run", "a rate she did not
  author" each fall to one extra signup. I also tested the opposite direction rather than only
  re-reading the review's list: *narrowing* step 2 to `'none'` when the member also holds a
  seat in a studio she does not own keys on the member's own memberships (HT-3-a forbids it)
  **and** turns the same consent-free INSERT into a $0 denial-of-service on any designer's
  hours (W1-R8-12's door). It trades a money-up bug for a remote money-down one.
- The single door is consent on seating, and closing it is product-wide: `00295`'s
  provisioning (a self-seat), studio invites and `accept_workspace_invitation`, the admin
  portal's seat adds, and every policy/helper reading `organization_members.status`
  (`is_active_studio_member`, `is_studio_comember`, `is_org_admin_or_owner`) have to be read
  against it, plus a surface where an invited person accepts. That is a ruling with a cost,
  not a patch inside an hour-tracking wave.

**What I shipped instead** — the finding's own interim path (iii), plus the two places a later
hand would otherwise re-derive the defect as news:

1. **Case (aa)** in `supabase/tests/billing/time_rate_resolution_test.sql` (+240 lines), the
   only case in the file that asserts a defect rather than a contract. `aa0` is the
   precondition (one owns a workspace, the control owns none); `aa1` pins the stamp; `aa2` pins
   arm A (99900/199800/authorized); `aa3` pins arm B (`'none'`); `aa4a`/`aa4b` pin what
   `project_unbilled_time` hands the composer ($1,998.00 and $0); `aa5`/`aa6` are the control
   and are the only asserts that **survive** HT-3-b (20000/40000 from the employing studio).
   Every "pins today" message names **HT-3-b** and states the value it takes when the ruling
   lands — so the ruling moves those asserts and nothing else in the file.
2. **`00599`'s banner** gains a round-8 fix-pass section: the measurement, both arms, the
   control, the three refuted widenings *and* the refuted narrowing, the consent door with its
   cost, and a pointer to case (aa). A six-line in-body comment sits at the step-2 leg so the
   code itself names HT-3-b. (Checked against `00599`'s own postconditions: the new text
   introduces none of the forbidden key names — `employer.`, `arms_length`,
   `peer.organization_id`, `joined_at`, `studio.created_at` — and the single
   `public.organization_members` reference count is unchanged at 1.)
3. **`00602`'s banner** gains the same statement scoped to the stamp (aa1 is its assert), so
   the trigger is not read as load-bearing-and-safe in isolation.
4. **`rulings.md` gains the `HT-3-b` row** (main checkout — that tree is where this program's
   artifacts live; it is untracked there and I ran no git in it): the question with the full
   measurement and control, three candidate answers for Kody — (a) accept and say so,
   (b) widen step 2, (c) close the consent door then widen — each with what it costs and what
   it re-opens, `Ruling` cell **OWED — not ruled**, and the shipped-as-pinned note.

**Still owed to Kody, from the finding's own interim list** (not mine to do here):

- **(i)** tell Leah's studio that a project led by anyone but the studio's owner prices from
  that designer's personal workspace.
- **(ii)** W2's composer must refuse to claim `rate_source = 'none'` rows, so arm B is visible
  instead of invoiced at $0. That is a W2 brief item; nothing in W1 can make the view lie less.
- **Sizing before the ruling:** a read-only count on Strata of live projects whose lead
  designer is not an owner of the project's studio. Not taken — no prod access was used in
  this pass.

## Findings I did not touch

The brief handed me the blocker only. `W1-R8-02` (00598's three stale `created_by` rationales),
`W1-R8-03` (the rate-preference tiebreak ignores `effective_from`/`effective_to`, measured: a
pre-dated raise turns an hour into `'none'`), `W1-R8-04` (delta 4 stamps a `rate_role` that did
not price the hour, third round), `W1-R8-05` (a bound legacy row relabelled `'authority'`) and
the notes `-06`…`-12` are **open and unaddressed**. `W1-R8-03` is the one I would take next:
it is a money bug on an ordinary act, and its fix is four lines plus a case.

## Gates (all run after the change, on a clean reset of the program's own stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean** — `00595`…`00602` + `20260910152111` applied, every postcondition replayed, all seeds loaded |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(z) **+ (aa)**; `case (aa) passed — W1-R8-01 pinned as built, owed ruling HT-3-b` then `All time_rate_resolution assertions passed.` |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — the six are the documented pre-existing ones (the brief's/plan's invocation without `-k` still reports them as unexpected; W1-R8-07 stands) |
| `python3 scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical |
| `SUPABASE_DB_URL=…:54422 pnpm --dir …/agent-server db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **green** |
| `git show --stat HEAD` | the 3 W1 paths only; conventional-commit subject |

`git push` printed `Affected verification has advisory failures.` — the pre-push hook's
advisory line, non-blocking; the ref moved (`57ac7a0d1..15744506d`).

## Not verified

- **Nothing on Strata.** No `db push`, no prod probe, no count of how many live projects have a
  non-owner lead designer (that number sizes this blocker and should be taken read-only before
  HT-3-b is ruled).
- **Lane B's surfaces** still do not exist (W1-R4-03, phase 2), so Done-when #3's live-mode
  render half and Done-when #5's printed role remain unverifiable at this commit.
- **`designer-portal lint` / `test`, `@patina/supabase test`** — outside the brief's gate list;
  this pass is SQL + SQL-test + comments only.
- **The consent-gate migration** was neither written nor staged — only reasoned about, and its
  blast radius enumerated from the policies and helpers named above.

## Probe (re-derivable)

`/private/tmp/claude-501/-Users-kody-Code-patina-merged/e257acb8-387e-4b1d-8426-8827597413f6/scratchpad/probe_r8_fix_aa.sql`
— the two arms and the control in one transaction-wrapped, rolled-back fixture; case (aa) is
that probe turned into asserts. Nothing on the stack was modified outside a rolled-back
transaction, and no shipped function was patched by hand.
