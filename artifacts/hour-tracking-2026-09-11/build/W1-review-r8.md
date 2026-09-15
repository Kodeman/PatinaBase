# W1 — adversarial review, round 8

**clean = false** — 1 blocker, 0 majors, 5 minors, 7 notes.

HT-3-a's ruled ladder is implemented exactly as ruled, and it **closes every manoeuvre the
brief names**: re-probed from scratch this session, a plain member who owns her
auto-provisioned workspace, seats collaborators, authors her own rate, backdates
`organizations.created_at`, holds rates in several studios and is rostered on several
projects can no longer price a client's hour at her own number — every one of rounds 3–7's
fixtures now returns the employing studio's rate or `'none'`. `projects.studio_id` is not
aimable by a non-owner (measured: repoint refused, project-for-another-designer refused,
a squat on a designer's only membership fails closed). The resolver's door is shut
(`authenticated` has no EXECUTE; a signed-in direct call raises). W1-R7-03 is discharged
and measured.

The blocker is in the other direction, and it needs **no manoeuvre at all**: under HT-3-a as
ruled (step 2 admits only studios the project's designer **OWNS**), a studio whose lead
designer is not its owner — Leah's studio the moment it adds its first designer, the program's
own target customer — cannot price any hour on that designer's projects. Measured 3/3 with a
2/2 negative control: the hire's own hour on the studio's client project priced at the
**99900 she set about herself** (`rate_source='studio_member'`, `billing_state='authorized'`,
`$1,998.00` in `project_unbilled_time`) while Leah's 20000 for her was ignored, and her
assistant's hour on the same project resolved **`'none'` / $0** while Leah's 12000 for him sat
in the studio. That is HT-1 defeated in both directions on the default shape, and the fix is a
ruling, not a patch — so it is charged against W1 rather than left for W2's composer.

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`
@ `57ac7a0d1`. DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres
54422); the shared 54321/54322 stack was never touched. `supabase/config.toml` untouched,
still skip-worktree'd (`git ls-files -v` → `S`) and in **no** commit of the range. Every
finding below was measured against a clean `npx supabase db reset --workdir <worktree>` run by
this reviewer, with every write performed **through RLS as the actor named**
(`SET LOCAL ROLE authenticated` + a `request.jwt.claims` sub), and with a negative control
wherever an exploit is claimed. `00599` and `00602` were read line by line; `00598`'s delta
and the test file's new cases were read in full.

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
57ac7a0d1 test(time): every rate case asserts the ruled ladder, and rounds 4-7's exploits become negative cases
8b5685c29 fix(time): W1-R7-03 — the open rate row's dates are frozen
7867b3088 feat(time): HT-3-a ruled — the project's studio prices the hour
090f4fd03 fix(time): W1 review round 6 — no pricing tiebreak the seating caller can write
d687c80d4 fix(time): W1 review round 5 …
0427f2c1e fix(time): W1 review round 4 …
fc65be3c2 fix(time): W1 review round 3 …
945e04796 fix(time): W1 review round 2 …
f0cf9a177 fix(time): W1 review round 1 …
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

16 files, +5784 / −11.

---

## The round-7 findings, re-probed from scratch

| finding | probe (this session) | result | verdict |
|---|---|---|---|
| **W1-R7-01** `organizations.created_at` backdate prices the hour | the backdate is still **permitted** (1 row, 9 years) and the hour is still **15000 / studio_member / 30000** before and after it (`probe_r8b.sql` C, H, I); `pg_get_functiondef` ~ `'studio\.created_at'` = **f**; a postcondition refuses its return by name | the key is **deleted, not patched**; the column is no longer read | **DISCHARGED** |
| **W1-R7-02** HT-3-a recorded OWED | `rulings.md` HT-3-a now reads **RULED 2026-09-12**, dated, with both drafted answers recorded as not-taken-as-drafted and the measured-false premise replaced by a CORRECTED note | ruled | **DISCHARGED** (but see §W1-R8-01 — the ruled rule has a second edge) |
| **W1-R7-03** open-row dates caller-writable | measured as the studio's **owner**: hand-close → `studio member rate identity is immutable`; `effective_from` move → same; the blur-save upsert still writes (16500); a new dated row still closes the prior one (1 open row); DELETE still `permission denied` (`probe_r8d.sql`) | fixed, blur-save intact | **DISCHARGED** |
| **W1-R7-04** resolver GRANTed with no caller | `has_function_privilege('authenticated', …)` = **f**, `anon` = **f**; a signed-in direct call → `permission denied for function resolve_time_rate_cents` (`probe_r8b.sql` K, L); the REVOKE is in the regenerated ACL seed (`00-legacy-grants.sql:15689`) | fixed | **DISCHARGED** |
| **W1-R7-05** ASSERT 2 reads the ladder's winner | `v_studio_id` is now the project's studio (step 1) or a studio the **project's designer** owns (step 2); there is no studio in that variable the project does not name | dissolved by the ruling | **DISCHARGED** |
| **W1-R7-06** delta 4 stamps a role that did not price the hour | `00601` is **byte-identical** in this round (absent from `git diff 090f4fd03..HEAD --stat`); r7's measurement (`rate=30000 src=authority rate_role=vendor` on a one-card `Principal` authority, control `rate_role=NULL`) therefore still stands | unchanged | **OPEN** (3rd round) — §W1-R8-04 |
| W1-R7-07 two-string-literal ordering postcondition | `00598:422-424` unchanged | unchanged | **OPEN** (4th round) — §W1-R8-09 |
| W1-R7-08 the plan's `commercial` invocation cannot be green | re-measured identically: the brief's form → 10 green / 6 unexpected-fail; `-k` from inside the worktree → 16/16, 0 unexpected | unchanged | **OPEN** — §W1-R8-07 |
| W1-R7-09 / -10 / -11 / -12 | re-read; -12 (`Members can leave`) is genuinely dissolved by the ruling (no pricing key reads the member's seats) | unchanged | -11 carried as §W1-R8-05; -09/-10 as notes |
| full case list (a)–(z), 28 cases | `supabase/tests/billing/time_rate_resolution_test.sql` | `All time_rate_resolution assertions passed.` | green |

---

## Findings

### W1-R8-01 · BLOCKER · confidence HIGH (measured 3/3, negative control 2/2) · HT-3-a's owner-only step 2 means a studio cannot price ANY hour on a project whose lead designer is not its owner: the designer prices her own client-billed hour at a number she set about herself, and her teammate's hour bills $0 although the studio priced him

**Where.** `supabase/migrations/00599_resolve_time_rate_cents.sql:256-274` (the candidate query's
`owner_seat.role = 'owner'` leg) and `supabase/migrations/00602_projects_studio_id_on_insert.sql:77-93`
(the same leg in the stamp), i.e. HT-3-a step 2 as ruled. Not a deviation from the ruling —
**a consequence of it** that the ruling's text does not contemplate, so the fix is an amendment.

**The shape. No attacker, no manoeuvre, no extra signup.** A studio adds its first designer.
Leah owns the studio `S`; the new designer `D` is seated `admin` there; an assistant `A` is
seated `member`. `D`, like every profile that flips `is_designer`, owns the one-person workspace
`00295`'s `fc_provision_studio_on_designer` provisions for her. `D` leads a client project for
`S`. Leah prices both of them **in `S`**, through RLS, on the surface HT-3 ruled
(`studio_member_rates_admin_insert`). Nothing unusual happens.

**Measured** (`probe_r8c.sql`, every write through RLS as the actor named, 3 runs, identical):

```
the hire's own auto-provisioned workspace = deaeef7c-… ; the project was stamped deaeef7c-… (r8c-hire-designer)
A the HIRE's own hour on the studio's project: rate=99900 src=studio_member amount=199800 state=authorized   (Leah's rate for her is 20000)
B the ASSISTANT's hour on the same project:    rate=<NULL> src=none amount=<NULL> state=authorized            (Leah's rate for him is 12000)

project_unbilled_time for that project:
  hire       120 min  resolved_rate_cents=99900  amount_cents=199800
  assistant  120 min  resolved_rate_cents=0      amount_cents=0
```

Both rows are `billable`, `authorized`, un-invoiced, and sit in `project_unbilled_time` — the
exact feed the invoice composer claims from and `claim_time_entries` invoice-locks. `$1,998.00`
is the same figure rounds 3, 4, 5, 6 and 7 each reported closed; this time it arrives with no
puppet, no seat, no backdate, and no forged column — only the default provisioning shape plus
`D` typing a number on her own studio-rates surface, where she is the owner and
`is_org_admin_or_owner` therefore admits her.

**Negative control** (`probe_r8c_ctrl.sql`, 2 runs, identical): the byte-identical fixture
except `D`'s seat in `S` is written **before** her `is_designer` flip, so
`fc_provision_studio_on_designer`'s early exit (`IF EXISTS (… organization_members … user_id =
NEW.id) THEN RETURN NEW`) leaves her owning **no** workspace:

```
CTRL hire owner-seats=0 ; project stamped e2200000-…-0000000000a1 (R8cc Hartwell Studio)
CTRL A hire's own hour:      rate=20000 src=studio_member amount=40000
CTRL B assistant's hour:     rate=12000 src=studio_member amount=24000
```

So the whole defect is "does the lead designer own a workspace of her own" — i.e. the order in
which she signed up and was seated. Both arms are isolated to that one difference.

**Why the ladder lands there.** Step 2's candidate set is studios the designer holds with
`role = 'owner'`; `S` is excluded because an `admin`/`member` seat is not an owner seat, and
`Org owners can insert members` (`with_check … AND role <> 'owner'`) means a second owner seat
cannot be created for her in `S` at all. Her personal workspace is the only candidate, so it is
also what `00602` stamps, so step 1 reads it for ever after. HT-3-a's own preference key ("prefer
the studio holding a `studio_member_rates` row for the member") can never rescue `A`, because the
preference only ranks **within** the designer's owned studios and `S` is not in that set.

**The live-path variant I did not stage.** The measurement above runs the project INSERT in
migration/seed context, where `00602` does the stamping. On the authenticated path
`set_project_studio_id` (head `00563`) fails closed for an ambiguous designer, so `D` cannot
create a project directly at all (measured separately: `probe_r8b.sql` G →
`studio_id_not_designer_studio`); the path that works is the activation bridge, whose own
tiebreak is `… (membership.role = 'owner') DESC, membership.joined_at …` (`00563`, read this
session) — which prefers the same personal workspace. So the outcome is the same with or without
`00602`; `00602` is not what introduces it. Code-read, not staged.

**Why this is charged against W1 and not deferred to W2's composer.** W2 can refuse to invoice a
`'none'` row (arm B), but arm A is not a `'none'` row: it is an `authorized`, `studio_member`,
$1,998.00 row that looks exactly like a legitimately priced hour, and the only party who could
have authorized that number is the person being paid for it. That is HT-1 ("the server owns
`hourly_rate_cents`") and HT-3 ("owner/admin of the studio sets it") defeated for every studio
with more than one designer.

**Exact fix.** It needs a ruling (**HT-3-b**), because every code-only widening I could construct
re-opens rounds 4–6. Recorded so round 9 does not re-spend them:

- widening step 2 to *active non-guest membership* → the attacker can seat the **project's
  designer** in a workspace she controls (`Org owners can insert members` needs no consent from
  the invitee), so her own workspace re-enters the candidate set and her rate wins the
  rate-preference key. Measured door, not hypothetical: that INSERT is what rounds 4 and 6 used.
- "prefer a studio with ≥ 2 active members", "prefer a studio she does not run", "prefer a rate
  she did not author" → all three are satisfiable by one extra signup seating the designer, which
  rounds 5 and 6 already rated blocker-grade.
- The one door under all of it is that **`organization_members` INSERT requires no consent from
  the person being seated**. Close that — seats land `status = 'invited'` and only the named user
  may flip their own seat to `'active'` (a `BEFORE INSERT` guard plus a narrowed
  `Org admins can update members`) — and step 2 can safely widen to active non-guest membership
  with HT-3-a's two ruled preferences, which fixes both arms. That is a new migration
  (`00603` is free) plus a ruling, and it is the only fix I can construct that does not trade one
  arm for the other.
- Interim, if the ruling must wait: (i) tell Leah that a project led by anyone but the studio's
  owner prices from that designer's own workspace; (ii) make W2's composer refuse to claim
  `rate_source = 'none'` rows outright (arm B becomes visible instead of $0); (iii) add a case to
  `time_rate_resolution_test.sql` shaped like `probe_r8c.sql` asserting today's behaviour with a
  failure message naming HT-3-b, so the ruling moves the assert and nothing else.

---

### W1-R8-02 · MINOR · confidence HIGH (code-read) · `00598` still justifies its live `created_by` actor-check by a key round 8 deleted from `00599`

`supabase/migrations/00598_studio_member_rates.sql:71-83`, `:277-290`, and the postcondition
message at `:450`. All three say `created_by` is *"the key `00599`'s studio ladder ranks first
on ('a rate this studio holds for her that she did NOT write')"* / *"it is `00599`'s arm's-length
key (W1-R5-01)"*. `00599`'s arm's-length key is gone — its own postcondition now **raises** if
`arms_length` reappears (`00599:579-581`). The guard itself is still worth keeping (authorship
provenance on a money row), but a later hand who reads `00598`, greps `00599` for the key it
names, and finds a postcondition forbidding it will reasonably conclude the check is vestigial
and delete it.

**Exact fix:** rewrite the three rationales to stand on authorship alone (*"`created_by` records
who set this rate; a re-stamp to a third party's id would misattribute a money row and is
refused"*), keep the check, and change the postcondition message to drop
*"it is `00599`'s arm's-length key"*. Same for the round-5 paragraph's last sentence about
"disarming the employing studio's rate".

---

### W1-R8-03 · MINOR · confidence HIGH (measured) · HT-3-a's rate-preference tiebreak ignores the date span, so a studio that cannot price today outranks one that can, and the hour resolves `'none'` / $0

`00599:266-270` (`EXISTS (SELECT 1 FROM studio_member_rates priced WHERE priced.studio_id =
studio.id AND priced.user_id = p_user_id)`) — no `effective_from` / `effective_to` legs, while
tier 2 at `:437-451` correctly requires the span to cover `p_at`. Same shape in `00602:86-90`.

**Measured** (`probe_r8f.sql`): a designer owns two studios; the one with the **older owner seat**
holds only a rate for the member starting `CURRENT_DATE + 30` (a scheduled raise — accepted by
`00598`, which only refuses a hand-set `effective_to`), the other holds the live 19000.

```
future-dated row in the older owned studio, LIVE 19000 in the other: rate=<NULL> src=none   (expected 19000/studio_member)
```

Not attacker-manufacturable (both studios are the designer's and the member cannot write in
either), but it turns a perfectly ordinary act — pre-dating a raise — into a $0 hour.

**Exact fix:** give the preference the same span the tier-2 read uses —

```sql
ORDER BY EXISTS (
           SELECT 1 FROM public.studio_member_rates AS priced
           WHERE priced.studio_id = studio.id
             AND priced.user_id   = p_user_id
             AND priced.effective_from <= (p_at AT TIME ZONE 'UTC')::date
             AND (priced.effective_to IS NULL
                  OR priced.effective_to >= (p_at AT TIME ZONE 'UTC')::date)
         ) DESC,
```

and the `CURRENT_DATE` form of the same in `00602`; add the fixture above as a case.

---

### W1-R8-04 · MINOR · confidence HIGH (measured in round 7; code byte-identical this round) · third round unchanged — delta 4 stamps a `rate_role` that did not price the hour

`00601:198-207` with `00599:409-411` and `:429-431` (the single-card fallback returns `v_role`,
the caller's pick, while a differently-named card supplies the cents). `00601` is absent from
this round's diff, so r7's measurement stands verbatim: on a one-card `Principal` authority a
member who picks `vendor` gets `rate=30000 src=authority rate_role=vendor`, control (no pick)
`rate_role=NULL`. Done-when #5 is satisfied in the one way delta 4's own rationale ("the row must
record the role that priced it") forbids. No money moves on a one-card authority.

**Exact fix:** on both single-card fallback returns, return the card's `role_name` normalized to
a `rate_role` value, or `NULL` — never `v_role`; add a case pairing a pick with a one-card
authority (r7's fixture is ready-made).

---

### W1-R8-05 · MINOR · confidence MEDIUM (not measured) · carried — a pre-`00600` **bound** row's NULL provenance is relabelled `'authority'` on any edit while its legacy cents snapshot is preserved

`00601:239` (`NEW.rate_source := 'authority';`, outside the `IF NOT v_is_bound` block) against
delta 5's stated purpose at `:211-227`. Unchanged from r7; neither case (i) nor case (o) covers a
**bound** legacy row. The label is defensible and no money moves, but `rate_source IS NULL` stops
identifying a legacy snapshot, which is the distinction `00600`'s column comment introduces.

**Exact fix:** set `'authority'` only when `v_is_bound` is false or `OLD.rate_source IS NOT NULL`;
add a bound-legacy-row case.

---

### W1-R8-06 · NOTE · confidence HIGH (measured) · `service_role` still holds EXECUTE on `resolve_time_rate_cents`, which the file now calls "trigger-path only"

`00599:479-480` revokes from `PUBLIC, anon, authenticated`; measured in `pg_proc`:
`anon = f`, `authenticated = f`, **`service_role = t`**. The two sibling DEFINER trigger functions
in this same wave (`time_entry_auto_roster`, `set_project_studio_id_owned`) revoke from
`service_role` as well, and `00599`'s own postconditions assert only the first two. No escalation
(`service_role` bypasses RLS anyway), but the contract the banner states is not the contract the
catalog holds.

**Exact fix:** add `service_role` to the REVOKE and to the postcondition, or state in the banner
why `service_role` keeps it.

---

### W1-R8-07 · NOTE · confidence HIGH (measured) · `plan-v2 §2` is now stale in four places, including the one the brief calls "the exact signature"

- `§2`'s migration table says **`00602` — UNUSED**; the shipped `00602` is the projects trigger
  the brief directed.
- `§2`'s signature block still carries `GRANT EXECUTE … TO authenticated` for
  `resolve_time_rate_cents`; shipped code revokes it (W1-R7-04, correctly) and `00599:508-514`
  says the plan must move with it.
- `§2`'s gate block still carries the `commercial` invocation that cannot be green
  (W1-R7-08, re-measured identically: 10 green / 6 unexpected-fail without
  `-k supabase/tests/KNOWN_FAILURES.md` from inside the worktree, 16/16 with it).
- `§2`'s resolver order ("signed authority → `studio_member_rates` → none") is still right, but
  nothing in `§2` states HT-3-a's studio derivation or `00602`.

Also worth one line in the plan's gate block, verified this session: the three whole-tree
failures the implementer reported are pre-existing and outside this wave —
`proposals/proposal_copy_immutability_test.sql` fails on a `proposals` column census that has not
been told about `subject` (added by `00590`, already on main; I read the drift message: the only
difference is `subject`), and the other two have zero references to anything this wave touches.

---

### W1-R8-08 · NOTE · confidence HIGH (code-read) · `00598`'s new W1-R7-03 postcondition is whitespace-sensitive

`00598:459-463`: `!~ 'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` — three literal
spaces, matching the aligned source. A reformat of the guard body (the kind a later graft does
routinely) fails a postcondition whose subject has not changed. Use `\s+` between the operands,
as the sibling assert for `created_by` effectively does.

---

### W1-R8-09 · NOTE · confidence HIGH · fourth round unchanged — `00598`'s trigger-ordering postcondition compares two string literals

`00598:422-424`. Constant-folded at parse time. `00602:140-146` now does it the right way (both
`tgname`s read from `pg_trigger`) and case (y5)/(y6) mirror it — copy that shape into `00598`.

---

### W1-R8-10 · NOTE · confidence HIGH (measured) · after the W1-R7-03 freeze a mis-typed FUTURE `effective_from` can never be cancelled, only re-priced

`probe_r8g.sql`: an owner types `CURRENT_DATE + 365`. A later row for today is accepted and the
ladder closes it correctly (so today's money is fine), but the future row itself cannot be
removed — `effective_from` / `effective_to` are frozen (the round-8 fix), there is no DELETE
policy (by design), and the only way to touch it is a same-date upsert that edits its cents. The
studio therefore carries a scheduled rate change it cannot cancel. Worth one sentence in `00598`'s
banner, or a ruling on whether a future-dated open row may be withdrawn by its author.

---

### W1-R8-11 · NOTE · confidence HIGH (measured) · what `00602` actually buys, so nobody believes it is load-bearing on the live path

`set_project_studio_id` (head `00563`) raises `studio_id_not_designer_studio` rather than leaving
`studio_id` NULL for **every** user-context insert, and `00602`'s trigger is deliberately ordered
**after** it, so on the live path `00602` can only ever fire for a row whose `studio_id` is
already non-NULL (no-op) or for a migration/seed/`postgres`-context insert. The fix report's
"1 of 6 → 6 of 6 seeded projects" is exactly that. The ordering decision is right (ordered first
it breaks `00563`'s section-5a contract, which I confirmed is green as shipped), and the stamp is
worth having for seeds and future writers — but "so step 1 becomes the normal path" is delivered
by `00563`, not by `00602`.

---

### W1-R8-12 · NOTE · confidence HIGH (measured) · a pre-existing denial-of-service that HT-3-a makes pricing-relevant

Any org owner can seat **any** existing user (no consent, `Org owners can insert members`). Seat a
designer who holds one studio seat and she now holds two, which makes `00563`'s direct-INSERT path
fail closed: measured, `probe_r8a_squat.sql` / `probe_r8b.sql` G both end in
`studio_id_not_designer_studio`. Pre-existing and not this wave's, but it is the same door as
§W1-R8-01's fix, and it is now a pricing door as well as a creation one — worth naming in the
HT-3-b ruling.

---

### W1-R4-03 — deferred, phase 2 (not counted against clean)

Lane B's surfaces and the PostHog emitters remain absent (re-confirmed: `account-studio-page.tsx`,
`studio-rate-rows.tsx`, `hours-ledger.tsx`, `authority-hours.ts`, `document-events.ts` — no diff).
Consequence recorded, not charged: Done-when #3's live-mode render half and Done-when #5's printed
role stay unverifiable at this commit.

---

## Hypotheses tested and REFUTED this round (recorded so round 9 does not re-spend them)

1. **The brief's whole attack surface, re-run as the member** (`probe_r8b.sql`, every write through
   RLS as her): `organizations.created_at` backdate **succeeds and is inert**; her own seat's
   `joined_at`/`created_at` UPDATE touches **0 rows** (`Org admins can update members` excludes
   `role = 'owner'`, i.e. her own owner seat); `projects.studio_id` repoint → **refused**
   (`studio_id_not_designer_studio`); inserting a project for another designer → **refused**;
   the hour on the studio's project → **15000 / studio_member / 30000** before and after every
   manoeuvre, with a browser-supplied `hourly_rate_cents = 99999` discarded; the `studio_id`-NULL
   sibling project (step 2) → **15000** too.
2. **Squatting a designer's only membership** (`probe_r8a_squat.sql`): seating a designer in the
   attacker's workspace so that workspace becomes her only candidate does **not** aim her
   project — every such designer already owns an auto-provisioned workspace, so the count is 2 and
   `00563` fails closed. (The residual, where she owns none, is §W1-R8-01's control, and there the
   employing studio is what gets stamped.)
3. **Is an owner seat manufacturable?** `pg_policies`: `Org owners can insert members` carries
   `role <> 'owner'` in its `with_check`; `Org admins can update members` carries it in both
   `qual` and `with_check`; `Org admins can delete members` cannot delete an owner row;
   `organizations` has no INSERT policy for `authenticated`. So `owner_seat.created_at` — the
   ruled tiebreak — is not writable through RLS at all, which is what makes step 2's ordering
   sound where six earlier ladders were not.
4. **Does stamping `studio_id` widen visibility?** Refuted, independently: the two policies keyed
   on `projects.studio_id` (`project_parties_studio_comember_select`,
   `project_team_members_studio_comember_select`) are
   `is_studio_comember(p.designer_id) OR (p.studio_id IS NOT NULL AND is_active_studio_member(p.studio_id))`,
   and `is_studio_comember`'s body (read from the catalog) admits every active non-guest member of
   any active org in which the designer is an active non-guest member — which is a superset of the
   members of any studio `00602` can stamp (it stamps only where she is an active **owner**). The
   second leg adds nobody.
5. **Program rules, grep- and catalog-verified across the wave's seven migrations and twelve
   commits.** No flag (0 `useFeatureFlag` / `posthog` / `ComingSoon` / `feature_flag` additions in
   the diff). No backfill (the only `UPDATE … project_time_entries` in the range is inside
   `claim_time_entries`' body; `00603` absent from disk; `00602`'s trigger carries no UPDATE bit —
   asserted from `tgtype` both in the migration and in case (y4)). No rollup in W1, so no `notes`
   in one. `project_time_entries` changed only by `ADD COLUMN IF NOT EXISTS rate_source, rate_role`
   plus two named CHECKs — additive. The guard's list extended in **both** places, read from the
   live catalog: `aab_…` is `BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id,
   hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role` and the
   `IS DISTINCT FROM` chain carries the same eight; `aac_…` carries `rate_role` too; the
   non-services early exit is gone from the guard body. `guard_invoiced_time_entry` installed,
   `prosecdef = f`, and `00177` is **not** in the diff. The running slot verbatim:
   `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON public.project_time_entries
   USING btree (user_id) WHERE (duration_minutes IS NULL)`. One BEFORE INSERT trigger on the guard
   function, not two (n9 honoured). No new policy keyed on `projects.studio_id`.
6. **§0.16 / 00484 contract, measured in `pg_proc`.** `resolve_time_rate_cents` `prosecdef = t`,
   `proconfig = {search_path=public, pg_temp}`, three caller asserts present,
   `anon`/`authenticated` EXECUTE = `f` (see §W1-R8-06 for `service_role`);
   `set_project_studio_id_owned` DEFINER, pinned, **no role holds EXECUTE**;
   `close_prior_studio_member_rate` DEFINER with no role holding EXECUTE; the three guards INVOKER
   with pinned `search_path` and revoked from everyone. `extensions.`/`pg_catalog.`-qualified
   extension calls (the `00282` 42883 trap) unchanged.
7. **§0.17's 00484 quartet, measured in `pg_policies`.** All four present with the exact names;
   `time_entries_studio_read` still present (W2's `00606` narrows it, not W1);
   `studio_member_rates` carries exactly **3** policies, no DELETE policy, and a DELETE as the
   studio's owner raises `permission denied for table studio_member_rates`.
8. **`00563`'s own contract.** `supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql`
   is **green** as shipped (its section-2 fixture now clears `studio_id` for the designer–client
   pair, with a comment naming `00602`; the trigger is INSERT-only so the clear sticks). Ordered
   first instead, the implementer reports it breaks — I did not re-stage that, I verified the
   shipped ordering from `pg_trigger` (`set_project_studio_id` < `zzz_set_project_studio_id_owned_trg`)
   and that no other BEFORE INSERT trigger on `projects` reads `studio_id`
   (`ae_dispatch_project_created` is AFTER and contains no `studio` reference at all).

---

## Gates re-run (this reviewer, clean stack)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `00595`…`00602` + `20260910152111` applied, every postcondition replayed, 22 seeds loaded |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the brief's/plan's invocation (§W1-R8-07) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — all six documented pre-existing |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(z), `All time_rate_resolution assertions passed.` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `./scripts/run-sql-tests.sh -d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md …` (whole dir, beyond the brief — `00602` is a `projects` trigger) | **24 green + 2 expected-fail = 26 / 26**, 0 unexpected (the two are the documented pre-existing `design_requests` / `studio_titles` fails) |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed. §0.20's grep re-run: `00595, 00597, 00598, 00599, 00600, 00601, 00602` all carry GRANT/REVOKE and all appear in the seed; the resolver's `REVOKE … FROM PUBLIC, anon, authenticated` is at `:15689` and `00602`'s at `:15707` |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **green** (exit 0) — the one portal whose build enforces types |
| `git status --porcelain` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S`; `git log --name-only … -- supabase/config.toml` over the range → empty |
| `git show --stat` ×3 round-8 commits | only W1 paths (`00598`, `00599`, `00602`, the ACL seed, the two billing tests, the `00563` rls test); conventional-commit subjects (`feat(time)` / `fix(time)` / `test(time)`); `database.types.ts` not hand-edited |

## Done-when, SQL-probed as the named roles

| Done-when | probe | result |
|---|---|---|
| #1 `commercial` unchanged; `billing` + `rls` green | above | ✅ (commercial via the `-k` invocation; §W1-R8-07) |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | `probe_r8b.sql` A — as the member through RLS: stored `15000 / studio_member / 30000`, not 99999 | ✅ |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | `probe_r8b.sql` (employer writes 15000 through `studio_member_rates_admin_insert`, member logs) and `probe_r8d.sql` (the blur-save upsert path) | ✅ in SQL; ❌ the live-mode render half (W1-R4-03, deferred) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | suite case (c) + the (c4) non-promotability assert (HT-6-b, owed), green on this reviewer's clean reset | ✅ |
| #5 a two-role member's row records the role she picked | cases (e)/(f) green | ✅ as a stored `rate_role`; ❌ nothing prints it (deferred); §W1-R8-04 measures one shape where the stored role is not the one that priced |
| **contra** — the member's own number never prices a client's hour (HT-1 / HT-3) | `probe_r8b.sql` (every manoeuvre the brief names) | ✅ **for every manoeuvre** — and ❌ **without any manoeuvre**, on the default non-owner-designer shape (§W1-R8-01) |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe; everything above is the isolated
  `patina-hours` stack. No measurement of how many live Strata projects have a non-owner lead
  designer (that number sizes §W1-R8-01's exposure and should be taken read-only before the
  ruling).
- **Lane B's surfaces.** They do not exist (deferred, phase 2), so no live-mode render check, no
  `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **The activation-bridge variant of §W1-R8-01** — reasoned from `00563`'s `ORDER BY …
  (membership.role = 'owner') DESC …`, not staged as a fixture.
- **`designer-portal lint`, `designer-portal test`, `@patina/supabase test`.** Outside the brief's
  gate list; this round's diff is SQL + tests only.
- **`client-portal`, `manufacturer-portal`, the three services.** Outside this wave's diff;
  `admin-portal build` is the shared-package gate and it is green.
- **§W1-R8-04 and §W1-R8-05** were not re-measured this round (`00601` is byte-identical since r7,
  which measured -06 and code-read -11).
- **Concurrency.** No two-session race of `00602` against `set_project_studio_id`, and no race of
  the close ladder under simultaneous blur-saves on the same `(studio_id, user_id)`.
- **The `studio.id` terminal tiebreak** in both the resolver and `00602` — a determinism backstop,
  reached only on identical `owner_seat.created_at` with the rate preference also tied; not staged.

## Probe scripts (re-derivable)

`/private/tmp/claude-501/-Users-kody-Code-patina-merged/e257acb8-387e-4b1d-8426-8827597413f6/scratchpad/r8/`
— `probe_r8b.sql` (the brief's adversary, end to end, with the backdates and the repoint
attempts), `probe_r8c.sql` (§W1-R8-01, the default non-owner-designer shape, with the
`project_unbilled_time` read), `probe_r8c_ctrl.sql` (its negative control — the identical fixture
with the seat written before the `is_designer` flip), `probe_r8a_squat.sql` / `probe_r8a2.sql`
(the refuted squat), `probe_r8d.sql` (W1-R7-03's freeze and the blur-save), `probe_r8f.sql`
(§W1-R8-03, the date-less preference), `probe_r8g.sql` (§W1-R8-10). Nothing on the stack was
modified outside a rolled-back transaction; `resolve_time_rate_cents`,
`guard_studio_member_rate_history` and `guard_organization_admin_columns` were never patched by
this reviewer.
