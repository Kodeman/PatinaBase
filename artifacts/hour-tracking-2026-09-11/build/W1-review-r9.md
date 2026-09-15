# W1 — adversarial review, round 9

**clean = false** — 0 new blockers, 2 majors, 5 minors, 9 notes, plus one carried
**blocker-class governance item that the implementer cannot discharge (owed ruling HT-3-b)**.

Round 8's blocker (`W1-R8-01`) was **pinned, not fixed**, and that is the correct disposition: it
is a consequence of HT-3-a *as ruled*, the brief for this round restates HT-3-a unamended
(ownership, `status = 'active'`, the two ruled preferences, "00603 stays unused"), and every
code-only widening is manufacturable. I re-read the fix pass's evidence, re-derived the shape
independently, and confirm the ruling is the only fix. It is therefore **carried to Kody as
HT-3-b, not charged to lane A** — but it is live, so it is named first below.

The ladder itself survived a fresh attack as a plain member: `projects.designer_id` and
`projects.studio_id` are both **refused** through RLS (measured), `project_team_members` admits
only the project's designer, `organizations` has no INSERT policy, and an owner seat cannot be
minted — so there is no key in HT-3-a's derivation a member can write. Five review rounds of
money-up exploits stay closed.

What this round found instead is **not about who prices the hour but about who can read the
price**: W1 lands a per-member studio rate on `project_time_entries`, and that table is already
readable in full by every active non-guest studio co-member (`time_entries_studio_read`, 00316).
Measured with a negative control in one fixture: a plain co-member who is refused the row on
`studio_member_rates` reads the identical `15000 / studio_member` off her colleague's hours row,
and a designer who is only a plain `member` of the studio **mints** a priced entry for any
colleague's `user_id` on her own project and reads a rate for a colleague who never logged at all.
That is the exact leak `W1-R2-03` closed at the RPC boundary, re-opened through the trigger path.

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server` @
`15744506d`, `git status --porcelain` **empty**, `supabase/config.toml` still skip-worktree'd
(`git ls-files -v` → `S`) and in **no** commit of the range. Every finding was measured against a
clean `npx supabase db reset --workdir <worktree>` run by this reviewer, with every write
performed **through RLS as the actor named** (`SET LOCAL ROLE authenticated` + a
`request.jwt.claims` sub), and with a negative control wherever an exploit is claimed. `00598`,
`00599`, `00600`, `00601` and `00602` were read line by line this round (`00601` for the first
time by this reviewer — r7/r8 carried it on a byte-identity argument).

Diff under review — `git log --oneline origin/hour-tracking/integration..hour-tracking/server`:

```
15744506d fix(time): W1 review round 8 — W1-R8-01 pinned, unwidened, owed ruling HT-3-b
57ac7a0d1 test(time): every rate case asserts the ruled ladder, and rounds 4-7's exploits become negative cases
8b5685c29 fix(time): W1-R7-03 — the open rate row's dates are frozen
7867b3088 feat(time): HT-3-a ruled — the project's studio prices the hour
090f4fd03 fix(time): W1 review round 6 …
d687c80d4 fix(time): W1 review round 5 …
0427f2c1e fix(time): W1 review round 4 …
fc65be3c2 fix(time): W1 review round 3 …
945e04796 fix(time): W1 review round 2 …
f0cf9a177 fix(time): W1 review round 1 …
906b94ab6 test(time): pin rate resolution, studio-rate authorization, and the rate-free insert
d048bad36 feat(time): studio-rate hooks, and rate provenance on the entry type
b39ba9ec2 feat(time): W1 rate truth — the server owns the rate on every project kind
```

16 files, +6118 / −11.

---

## Round 8's findings, re-probed from scratch

| finding | probe (this session) | result | verdict |
|---|---|---|---|
| **W1-R8-01** owner-only step 2 cannot price a non-owner-led studio's hours | re-derived from the code (`00599:329-347`, `00602:94-114`) and from `00563`'s own body, read this session; both legs byte-unchanged; case `(aa)` green on my clean reset; `rulings.md` carries HT-3-b with the measurement, three candidate answers and **OWED — not ruled** | correctly **PINNED**; the fix is a ruling, and the brief re-states HT-3-a unamended | **NOT DISCHARGED — carried as governance (§W1-R9-00)** |
| **W1-R8-02** `00598`'s three `created_by` rationales cite a key `00599` now forbids | `00598:71-83`, `:277-290`, `:450` unchanged; `00599:652-654` still **raises** if `arms_length` reappears | unchanged | **OPEN** (2nd round) — §W1-R9-06 |
| **W1-R8-03** the rate-preference tiebreak ignores the date span | **re-measured** (`probe_r9c.sql`): designer owns two studios, the older-seat one holds only a `CURRENT_DATE + 30` row, the other holds a live 19000 → the hour resolves `rate=NULL src=none amount=NULL state=authorized billable=t` | unchanged; the `$0` row is `authorized` + `billable`, i.e. claimable | **OPEN** (3rd round) — §W1-R9-02, raised to MAJOR |
| **W1-R8-04** delta 4 stamps a `rate_role` that did not price the hour | **re-measured** (`probe_r9d.sql`): one-card `Principal` 30000 authority, member picks `vendor` (a role she holds) → `rate=30000 src=authority rate_role=vendor`, card that priced = `Principal`; control (no pick) → `rate_role` NULL | unchanged | **OPEN** (4th round) — §W1-R9-04 |
| **W1-R8-05** a **bound** legacy row's NULL provenance is relabelled `'authority'` | **measured** this round (r8 carried it at MEDIUM, code-read): a bound row with `rate_source` NULL + a plain duration correction as the member → `rate_source = 'authority'`, snapshot 30000 preserved | unchanged; confidence now HIGH | **OPEN** (2nd round) — §W1-R9-05 |
| **W1-R8-06** `service_role` holds EXECUTE on the "trigger-path only" resolver | `pg_proc` measured: `anon = f`, `authenticated = f`, **`service_role = t`**; the three sibling DEFINER trigger functions in this wave are all `f` | unchanged | **OPEN** — §W1-R9-08 |
| **W1-R8-07** plan-v2 §2 stale in four places | re-read §2: still "**00602 — UNUSED**", still `GRANT EXECUTE … TO authenticated`, still the `commercial` invocation that cannot be green, still silent on HT-3-a's derivation | unchanged | **OPEN** — §W1-R9-09 |
| **W1-R8-08** whitespace-sensitive postcondition | `00598:460-463` still `!~ 'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` (three literal spaces) | unchanged | **OPEN** — §W1-R9-10 |
| **W1-R8-09** trigger-ordering postcondition compares two string literals | `00598:436` unchanged; `00602:147-167` does it correctly from `pg_trigger` | unchanged | **OPEN** (5th round) — §W1-R9-11 |
| **W1-R8-10** a mis-typed FUTURE `effective_from` can never be withdrawn | re-confirmed from the code, and **compounded**: see §W1-R9-03, where the same future row also bricks the blur-save for today | unchanged, worse than reported | **OPEN** — §W1-R9-03 / §W1-R9-12 |
| **W1-R8-11 / -12** what `00602` buys; the consent-free seating DoS | re-read; both still accurate | unchanged | carried notes — §W1-R9-13 |
| **W1-R7-01 … -05** (r8 marked DISCHARGED) | re-verified from the catalog: `studio.created_at` / `joined_at` / `peer.organization_id` / `employer.` / `arms_length` each refused **by name** by a `00599` postcondition; `authenticated` holds no EXECUTE; `effective_from`/`effective_to` frozen on the open row | still discharged | **DISCHARGED** |
| full case list (a)–(z) + (aa) | `supabase/tests/billing/time_rate_resolution_test.sql` | `case (aa) passed — W1-R8-01 pinned as built, owed ruling HT-3-b` … `All time_rate_resolution assertions passed.` | green |

---

## §W1-R9-00 · CARRIED · blocker-class · governance, OWED RULING HT-3-b — not charged to lane A

**Where.** `supabase/migrations/00599_resolve_time_rate_cents.sql:329-347` (step 2's
`owner_seat.role = 'owner'` leg) and `00602_projects_studio_id_on_insert.sql:94-114` (the same leg
in the stamp).

**State.** Shipped exactly as HT-3-a reads. A studio whose lead designer is not its **owner** —
the program's own target customer, and the default shape the moment a studio adds its first
designer — prices nothing on that designer's projects: her own hour prices at the number she set
about herself in her auto-provisioned workspace (`$1,998.00` into `project_unbilled_time`), and her
teammate's resolves `'none'` / `$0` although the employing studio priced him.

**Verified this round, rather than taken on report.** The two legs are byte-unchanged; `00599`'s
banner (`:186-245`) and `00602`'s banner (`:55-74`) both state the consequence and name HT-3-b;
`rulings.md` row HT-3-b carries the full measurement, its negative control, three candidate
answers with what each re-opens, and `Ruling` cell **OWED — not ruled**; case `(aa)` of
`time_rate_resolution_test.sql` pins all of it with failure messages that name HT-3-b and state
the value each assert takes when the ruling lands. I independently re-derived why no code-only
widening works: `Org owners can insert members` carries `role <> 'owner'` in its `with_check` and
needs **no consent from the invitee**, so every "prefer a studio she does not run / with ≥ 2
members / whose rate she did not author" key is purchasable with one seat, and narrowing keys on
the member's own memberships, which HT-3-a forbids.

**What is owed, and to whom.** Kody rules HT-3-b. Nothing in lane A can close it. Two interim
items from the finding's own list are still outstanding and are **not** W1 work: telling Leah's
studio in words, and W2's composer refusing to claim `rate_source = 'none'` rows. A third —
a read-only count on Strata of live projects whose lead designer is not an owner of the project's
studio — should be taken before the ruling, because it sizes the exposure and nobody has taken it.

---

## Findings

### W1-R9-01 · MAJOR · confidence HIGH (measured 2 legs, negative control in the same fixture) · W1 puts each member's confidential studio rate onto a table the whole studio can read — and a plain-member designer can MINT a priced row for any colleague and read a rate for someone who never logged

**Where.** `00599:509-530` (tier 2) + `00601:255-266, 312-317, 405-410` (the classifier stamping
`NEW.hourly_rate_cents` from tier 2) against two **pre-existing** policies:
`time_entries_studio_read` (00316:237-240 — `is_studio_comember(p.designer_id)`, no `user_id` leg)
and `Designers manage their project time entries` (00177:136-137 — `ALL`, `with_check` NULL, so
the INSERT check is `projects.designer_id = auth.uid()` with **no `user_id` leg**).

**Why it is W1's.** Before this wave a non-services row's `hourly_rate_cents` was whatever the
browser sent and a services row's was a **client-facing card rate**, which is project-level and
not about any one person. Tier 2 is the first thing that writes a *per-person* rate onto
`project_time_entries`. The implementer's own threat model calls that number confidential — `00599`'s
`W1-R2-03` comment (`:380-385`) describes reading a colleague's studio rate as "a confidential-pay
leak … a number RLS gives her nothing of", and `00598`'s `studio_member_rates_read_self_or_admin`
is written precisely to deny it. Both statements are true of the rate table and false of the
entries table.

**Measured** (`probe_r9f.sql`, one fixture, every write and read through RLS as the actor named):

```
F1 CONTROL  the snoop (a plain `member` of the studio) on studio_member_rates
            rows of the subject's rate visible = 0                     ← RLS denies her
F2 PASSIVE  the same snoop on the subject's own hours row
            user=…002  rate=15000  src=studio_member  amount=15000     ← the identical number
F4 ACTIVE   a designer who is ONLY a plain `member` of the studio inserts an entry for the
            subject's user_id on her own studio-stamped project:        ALLOWED
            she then reads it:  rate=15000  src=studio_member           ← for a colleague who
                                                                          logged nothing
```

F2 needs no manoeuvre: any active non-guest co-member reads every tier-2-priced row of every
studio project. F4 is an **enumeration primitive** — one insert per `user_id`, read, then DELETE
(the same `ALL` policy permits the delete, and `guard_invoiced_time_entry` only blocks invoiced
rows), so it leaves nothing behind. `useCreateTimeEntry` always writes `user_id = auth.uid()`
(`use-time-tracking.ts:364`), so **no shipped caller needs the insert-for-another-user path** —
which is what makes the narrow fix free.

**Not shipped to prod yet**, because P-3 ships the program once after W7. That is the only reason
this is MAJOR rather than blocker: the read half is W2's file to narrow. It must not be left to be
discovered there.

**Exact fix, two halves.**
- *W1 owns the write half.* In `00601`, before delta 2, refuse a non-postgres **INSERT** whose
  `NEW.user_id IS DISTINCT FROM auth.uid()` unless
  `public.is_org_admin_or_owner(<the project's studio>)`:
  ```sql
  IF TG_OP = 'INSERT' AND current_user IS DISTINCT FROM 'postgres'
     AND auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(public.is_org_admin_or_owner(
           (SELECT p.studio_id FROM public.projects p WHERE p.id = NEW.project_id)), false)
  THEN
    RAISE EXCEPTION 'a time entry is logged by the person who worked the hour'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  ```
  This keeps `W1-R1-05` intact (that finding is about **UPDATE** — a designer *correcting* a
  teammate's existing entry), costs no shipped caller, and closes F4. Add a case shaped like
  `probe_r9f.sql` F4 asserting the raise, with a control that the designer can still update a
  teammate's row.
- *W2 owns the read half, and its brief must say so.* `00606` must narrow
  **`time_entries_studio_read`** as well as the 00484 SELECT policy — HT-10-a's text names only the
  "00484-registered rostered read", and narrowing that one alone leaves `time_entries_studio_read`
  granting every co-member every row, notes and rate included. Record it as an HT-10-a amendment
  rather than leaving it to W2's reviewer.

---

### W1-R9-02 · MAJOR · confidence HIGH (re-measured, 3rd round open) · step 2's rate-preference key ignores the date span, so a studio that cannot price today outranks one that can and the hour bills $0 — and in `00602` the same key writes that answer into the project permanently

**Where.** `00599:339-343` — `EXISTS (SELECT 1 FROM studio_member_rates priced WHERE
priced.studio_id = studio.id AND priced.user_id = p_user_id)`, with **no `effective_from` /
`effective_to` legs**, while tier 2 at `:515-522` correctly requires the span to cover `p_at`. The
identical un-spanned `EXISTS` is `00602:107-111`.

**Measured** (`probe_r9c.sql`, all rate writes through RLS as the owner): a designer owns two
active studios; the **older** owner seat's studio holds only a `CURRENT_DATE + 30` row for the
member (an ordinary scheduled raise, which `00598` accepts — it refuses only a hand-set
`effective_to`); the other holds the live 19000. On her `studio_id`-NULL project:

```
hourly_rate_cents = <NULL>   rate_source = none   rated_amount_cents = <NULL>
billing_state = authorized   billable = t                  (expected 19000 / studio_member)
```

The row is `billable` and `authorized`, so it reaches `project_unbilled_time` at `$0` and
`claim_time_entries` will invoice-lock it there. r8 rated this MINOR on the grounds that it is not
attacker-manufacturable; I raise it to MAJOR for two reasons r8 did not weigh: the shipped
consequence is a **$0 invoice lock**, not a display nit; and the same key is in `00602`, where a
wrong answer is **written into `projects.studio_id` once and read by step 1 for ever** (no
backfill, no UPDATE trigger — P-4), so one mis-ordered preference at creation mis-prices every
hour on that project permanently.

**Exposure, stated plainly so it can be filtered:** it needs a designer holding **two** active
owner seats. `00295` provisions one per designer and `Org owners can insert members` cannot create
a second, so today that arises only through an ownership transfer or a second provisioning — narrow.
It is the third round this four-line fix has been deferred, and the fix carries no risk.

**Exact fix** (r8's, unchanged and still correct) — give the preference the tier-2 span:

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

and the `CURRENT_DATE` form of the same in `00602:107-111`. Add `probe_r9c.sql` as a case, and a
`00599` postcondition requiring `effective_from` inside the `ORDER BY EXISTS` so a later graft
cannot drop the span again.

---

### W1-R9-03 · MINOR · confidence HIGH (measured) · a scheduled future raise closes today's row, after which the shipped blur-save can never correct today's rate again — and the future row cannot be withdrawn either (compounds W1-R8-10)

**Where.** `00598:197-212` (the close ladder computes `effective_to` from the **later** row),
`00598:242-245` (a closed row is frozen outright), and
`packages/supabase/src/hooks/use-studio-member-rates.ts:100-111` (the blur-save upserts
`ON CONFLICT (studio_id, user_id, effective_from)` with `effective_from = today`).

**Measured** (`probe_r9e.sql`, every write as the studio's owner through RLS):

```
1. today's rate 15000                                → accepted
2. a scheduled raise 25000 from CURRENT_DATE + 30    → accepted; today's row is CLOSED at +29
3. the blur-save correction of TODAY (16000, same upsert the hook sends)
   → REFUSED: "a closed studio member rate row is history and cannot be edited — write a new row"
history after: 15000 [today .. +29]   25000 [+30 .. open]
```

The refusal tells the owner to do the thing she just did. Combined with `W1-R8-10` (the future row's
dates are frozen, there is no DELETE policy, and nothing can withdraw it) the pair is a **dead end
for that member's rate until the future date arrives**: the only writable days are the ones between,
and the shipped surface offers no date field at all.

Not silently wrong — it raises — and unreachable through the shipped hook, which never sends
`effectiveFrom`. It becomes reachable the moment lane B adds the dated field HT-3's
"dated, append-only history" implies, or through the data layer's own typed
`SetStudioMemberRateInput.effectiveFrom`.

**Exact fix:** either (a) let the blur-save target the row covering today rather than the row
*starting* today — make `useSetStudioMemberRate` send `effective_from = <the open or covering
row's start>` — or (b) rule that a future-dated row may be withdrawn by its author while
`effective_from > CURRENT_DATE` (one narrow arm in `guard_studio_member_rate_history` plus a
DELETE policy restricted to that predicate), which also closes `W1-R8-10`. Either way add a case;
today no test exercises a future `effective_from` at all.

---

### W1-R9-04 · MINOR · confidence HIGH (re-measured, 4th round open) · delta 4 stamps a `rate_role` that did not price the hour

**Where.** `00601:205-207` (`NEW.rate_role := v_rate_role`) with `00599:483` and `:503` — both
single-card fallback returns hand back `v_role`, the member's own pick, while a card of a
**different** name supplies the cents.

**Measured** (`probe_r9d.sql`): a one-card `Principal` 30000 authority; the member holds `vendor`
and `bookkeeper` on the roster and picks `vendor` →
`hourly_rate_cents = 30000, rate_source = authority, rate_role = vendor`, card that priced =
`Principal`. Control (no pick) → `rate_role` NULL, same 30000. Done-when #5 ("a two-role member's
row prints the role they picked") is satisfied in the one way delta 4's own rationale
(`00601:198-204` — "the row records the role that priced it") forbids. No money moves.

**Exact fix:** on both single-card fallback returns, return the card's `role_name` normalized to a
`rate_role` value, or `NULL` — never `v_role`; add the fixture above as a case.

---

### W1-R9-05 · MINOR · confidence HIGH (measured this round; r8 carried it at MEDIUM) · a pre-`00600` BOUND row's NULL provenance is relabelled `'authority'` by an ordinary duration correction

**Where.** `00601:419` — `NEW.rate_source := 'authority';` sits **outside** the `v_is_bound`
handling and outside delta 5's preservation block (`:221-227`).

**Measured** (`probe_r9d.sql`): a bound row (`billing_authority_id` + `authority_rate_id` set) with
`rate_source` NULL and a 30000 snapshot; the member corrects `duration_minutes` 120 → 90 through
RLS; afterwards `hourly_rate_cents = 30000` (correctly preserved) and **`rate_source = 'authority'`**.
`00600`'s own column comment defines NULL as "a row written before 00600 (a legacy rate snapshot of
unknown provenance)", so the row stops being identifiable as legacy while keeping a number no
current card need justify. Neither case (i) nor (o) nor (q) covers a **bound** legacy row.

**Exact fix:** `NEW.rate_source := 'authority'` only when `v_is_bound` is false **or**
`OLD.rate_source IS NOT NULL`; add a bound-legacy-row case.

---

### W1-R9-06 · MINOR · confidence HIGH (code-read, 2nd round open) · `00598` still justifies its live `created_by` actor-check by a key round 8 deleted from `00599`

`00598:71-83`, `:277-290` and the postcondition message at `:450` all say `created_by` is
*"00599's studio ladder['s] … arm's-length key"*. `00599` no longer has one and
`00599:652-654` **raises** if `arms_length` reappears. The check is still worth keeping — it is
authorship provenance on a money row — but a later hand who greps `00599` for the key `00598`
names will find a postcondition forbidding it and reasonably delete the check.

**Exact fix:** rewrite the three rationales to stand on authorship alone (*"`created_by` records
who set this rate; a re-stamp to a third party's id would misattribute a money row and is
refused"*), keep the check, and drop *"it is `00599`'s arm's-length key"* from the postcondition
message and the round-5 paragraph's closing sentence about "disarming the employing studio's rate".

---

### W1-R9-07 · MINOR · confidence HIGH (measured) · the member chooses which rate prices her hour by choosing the date, and an UNBOUND row is silently re-priced when its date moves

**Where.** `00599:452, :520-522` (both tiers anchor on `p_at` = `NEW.started_at`),
`00601:221-227` (delta 5 preserves only when the chain answers `'none'` **or** the row is
pre-`00600`), and `aac_…_trg`'s watched list, which includes `started_at`.

**Measured** (`probe_r9a.sql` / `probe_r9b.sql`, all writes as the member herself through RLS):

```
tier 2, history 40000 [-60 .. -6] then 10000 [-5 .. open], one plain project:
  started_at = today     → 10000 / studio_member / 20000   ($200 in project_unbilled_time)
  started_at = today-30  → 40000 / studio_member / 80000   ($800 in project_unbilled_time)
then, on the TODAY row, she edits only started_at → today-30:
                         → 40000 / studio_member / 80000   (silently re-priced 4×)

tier 1, one card per version, 30000 (v1) superseded by 10000 (v2) five days ago:
  started_at = today     → 10000 / authority / 20000   (card v2)
  started_at = today-10  → 30000 / authority / 60000   (card v1)
  the same date edit on a BOUND row → rate unchanged at 10000   ← W1-R1-02's protection holds
```

On the **insert** side this is correct dated-rate accounting: work done in a period should price at
that period's agreed rate, and she can only ever reach a number the studio (or the client, on
tier 1) actually set. The part that is not obviously intended is the **edit**: an unbound tier-2
row is re-priced by a date change alone, with no audit row and nothing on the row saying it moved
(`updated_at` aside), and `useUpdateTimeEntry`'s typed `updates` already accepts `started_at`
(`use-time-tracking.ts:393-394`) — no shipped UI passes it today, but the data layer's public API
does, and HT-13 makes a date field a W2/W3 certainty.

This matters because five rounds have been spent proving the member cannot choose her own number.
She cannot — but she can choose among the studio's historical numbers, and nothing in the suite
says so.

**Exact fix:** ask for a ruling (one line beside HT-13) on whether a date edit re-prices an unbound
row or keeps its snapshot the way delta 5 keeps a legacy one, and meanwhile pin today's behaviour:
add a case shaped like `probe_r9a.sql` A + C with failure messages naming the ruling, and one
sentence in `00599`'s banner that the anchor is a member-supplied fact. If the ruling goes the
other way, the code change is one extra leg in delta 5's condition
(`OR (TG_OP = 'UPDATE' AND NEW.started_at IS DISTINCT FROM OLD.started_at)`).

---

### W1-R9-08 · NOTE · confidence HIGH (measured) · `service_role` still holds EXECUTE on the resolver the banner calls "trigger-path only"

`00599:552-553` revokes from `PUBLIC, anon, authenticated`; `pg_proc` measured: `anon = f`,
`authenticated = f`, **`service_role = t`**. The three sibling DEFINER functions in this same wave
(`set_project_studio_id_owned`, `close_prior_studio_member_rate`, `time_entry_auto_roster`) are
`f` for every role, and `00599`'s own postconditions assert only `anon` and `authenticated`. No
escalation (`service_role` bypasses RLS anyway), but the contract the banner states is not the
contract the catalog holds, and a service-role caller would silently skip ASSERT 1/2 via the
`auth.uid() IS NULL` bypass.

**Exact fix:** add `service_role` to the REVOKE and to the postcondition, or state in the banner
why it keeps EXECUTE.

---

### W1-R9-09 · NOTE · confidence HIGH · `plan-v2 §2` is stale in four places, including the one the brief calls "the exact signature"

Unchanged from r8, re-read this round: §2's migration table still says **`00602` — UNUSED** (the
shipped `00602` is the projects trigger HT-3-a directs); §2's signature block still carries
`GRANT EXECUTE … TO authenticated` for `resolve_time_rate_cents`, which the shipped code revokes
(correctly, W1-R7-04); §2's gate block still carries the `commercial` invocation that **cannot** be
green (re-measured identically this round: 10 green / 6 unexpected-fail without
`-k supabase/tests/KNOWN_FAILURES.md`, 16/16 with it); and nothing in §2 states HT-3-a's studio
derivation, `00602`, or HT-3-b. A later wave briefed from §2 will contradict the shipped code.

---

### W1-R9-10 · NOTE · confidence HIGH · `00598`'s W1-R7-03 postcondition is whitespace-sensitive

`00598:460-463`: `!~ 'NEW\.effective_to   IS DISTINCT FROM OLD\.effective_to'` — three literal
spaces, matching the aligned source. A reformat of the guard body (what a later graft does
routinely) fails a postcondition whose subject has not changed. Use `\s+` between the operands.

---

### W1-R9-11 · NOTE · confidence HIGH (5th round) · `00598`'s trigger-ordering postcondition compares two string literals

`00598:436`: `IF 'aaa_guard_studio_member_rate_insert_trg' >= 'close_prior_studio_member_rate_trg'`
— constant-folded at parse time, so it can only fail when somebody edits the literals.
`00602:147-167` now does it the right way (both `tgname`s read from `pg_trigger`, with the names
reported in the message) and cases (y5)/(y6) mirror it. Copy that shape into `00598`.

---

### W1-R9-12 · NOTE · confidence HIGH · a future-dated open row can never be withdrawn (carried W1-R8-10)

Folded into §W1-R9-03's fix, where it is no longer only an inconvenience.

---

### W1-R9-13 · NOTE · confidence HIGH · carried, unchanged — what `00602` actually buys, and the consent-free seating DoS

`W1-R8-11`: on the live path `set_project_studio_id` (head `00563`) raises
`studio_id_not_designer_studio` rather than leaving `studio_id` NULL, and `00602` is deliberately
ordered after it, so `00602` can only fire for a row already non-NULL (no-op) or for a
migration/seed/`postgres`-context insert. Confirmed again this round as a by-product of
`probe_r9f.sql` F0: a project inserted in fixture context for a designer who owns **no** studio
came out with `studio_id = NULL`, i.e. the seed path `00602` exists to cover, and the ordering is
what keeps `00563`'s section-5a contract green. "So step 1 becomes the normal path" is delivered by
`00563`, not by `00602`.

`W1-R8-12`: any org owner may seat any existing user with no consent, which makes a designer
ambiguous to `00563` and fails her direct project INSERT closed. Pre-existing, and the same door
HT-3-b's answer (c) would close.

---

### W1-R9-14 · NOTE · confidence HIGH (measured) · plan-v2 §0.20's grep does not match this wave's own GRANT/REVOKE migrations

§0.20 says *"the rule is the grep, not a list — `grep -lE '^\s*(GRANT|REVOKE)'
supabase/migrations/006*.sql`"*. Run verbatim this round it returns **only** `00600`, `00601`,
`00602`: the glob `006*` cannot match `00595`–`00599`, which is most of this wave, `00598` and
`00599` included. The committed seed is nevertheless correct — `generate-legacy-grants.py` replays
the whole tree, and I verified the regenerated file is byte-identical with `00595`, `00597`,
`00598` (6 statements), `00599`, `00600`, `00601` and `00602` all present. But a later wave that
follows §0.20's instruction literally will conclude it owes no regeneration when it does.

**Exact fix:** change §0.20's grep to `supabase/migrations/005*.sql supabase/migrations/006*.sql`
(or `00[56]*.sql`), or state that the regeneration is unconditional per wave.

---

### W1-R9-15 · NOTE · confidence MEDIUM (code-read) · §0.12's invoiced-entry frozen list does not gain the two new derived columns

`guard_invoiced_time_entry` (read from the catalog, `prosecdef = f`, `00177` absent from the diff)
freezes `project_id, phase_key, task_id, user_id, started_at, duration_minutes, billable,
hourly_rate_cents` — not `rated_amount_cents` (pre-existing, `00177`) and not the new
`rate_source` / `rate_role`. I looked for an exposure and found none: `aab_` refuses both new
columns for **every** non-postgres caller regardless of invoice state, and the only postgres-side
writer (`aac_`) cannot fire on an invoiced row because every column in its watched list except
`rate_role` is frozen by the invoiced lock and `rate_role` itself is refused by `aab_`. Recorded so
a later wave that adds a postgres-side re-pricing rail knows the lock will not stop it.

---

### W1-R4-03 — deferred, phase 2 (not counted against clean)

Lane B's surfaces and the PostHog emitters remain absent, re-confirmed by `git diff --name-only`
over the range: `account-studio-page.tsx`, `hours-ledger.tsx`, `authority-hours.ts` and
`document-events.ts` exist on disk but are **untouched**, and `studio-rate-rows.tsx` does not
exist. Nothing in `apps/designer-portal/src` reads `rate_source` or `rate_role`. Consequence
recorded, not charged: Done-when #3's live-mode render half and Done-when #5's printed role stay
unverifiable at this commit.

---

## Hypotheses tested and REFUTED this round (recorded so round 10 does not re-spend them)

1. **Can a plain member aim HT-3-a's step 1 or step 2 at a studio she controls?** No, measured
   (`probe_r9a.sql` B): `UPDATE projects SET designer_id = <self>` → **REFUSED**, *"project lead
   may only change through reassign_project_lead"*; `UPDATE projects SET studio_id = NULL` →
   **REFUSED**, `studio_id_not_designer_studio`. Read from the catalog: `set_project_studio_id` is
   `BEFORE INSERT OR UPDATE OF id, studio_id, designer_id, client_id, proposal_id, created_by,
   created_at`, its UPDATE arm raises on any `designer_id` change that is not a `postgres`-context
   reassignment carrying the `app.project_reassignment_id` GUC, and its authenticated arm raises on
   **any** `TG_OP <> 'INSERT'`. `projects_studio_update` (which does let any co-member UPDATE, and
   whose `with_check` `is_studio_comember(designer_id)` is satisfied by pointing it at herself —
   `is_studio_comember`'s first branch is `p_owner = auth.uid()`) is therefore gated by the trigger,
   not by the policy.
2. **Is `reassign_project_lead` a pricing lever?** No (read this session): it requires
   `organization.id = v_project.studio_id` (so it is inert on the NULL-studio rows step 2 serves),
   requires both the outgoing and incoming designer to be active non-guest members of **that**
   studio, requires the actor to be the current designer or an owner/admin of it, and leaves
   `studio_id` unchanged — so step 1 answers identically before and after.
3. **Can a member manufacture a better-paying roster role to pick?** No: `project_team_members`
   carries exactly three policies and the only write policy is
   `Lead designers manage team members` (`ALL`, qualified on `projects.designer_id = auth.uid()`).
   A member's only seat is the one `00597` grants her (`support_designer`) or one the designer
   writes.
4. **Did removing the guard's non-services early exit break a shipped writer?** No. Every
   `project_time_entries` writer in the repo was enumerated: `useUpdateTimeEntry` sends only
   `started_at / duration_minutes / phase_key / task_id / notes / billable / activity`; the other
   five portal call sites are `select` only; iOS sends `project_id / user_id / started_at /
   duration_minutes` and no rate column (`FieldVisitCloseRecord.swift:166-174`); no edge function or
   NestJS service touches the table. So no caller's SET list mentions a column in `aab_`'s list.
5. **Program rules, grep- and catalog-verified across the wave's five migrations and thirteen
   commits.** No flag (0 `useFeatureFlag` / `posthog` / `feature_flag` / `ComingSoon` additions in
   the diff). No backfill — the only `UPDATE` added anywhere in the migrations is the close ladder
   inside `close_prior_studio_member_rate`, scoped to the `(studio_id, user_id)` pair the inserted
   row names; `00603` is absent from disk; `00602`'s trigger carries no UPDATE bit (asserted from
   `tgtype` in the migration and re-read by me from `pg_get_triggerdef`). No rollup in W1, so no
   `notes` in one (the single `notes` token added is a comment). `project_time_entries` changed only
   by `ADD COLUMN IF NOT EXISTS rate_source, rate_role` plus the two named CHECKs — additive; the
   live constraint census on the table is `…_rate_role_ck`, `…_rate_source_ck` beside the
   pre-existing two. The guard's list is extended in **both** places, read from the live catalog:
   `aab_` is `BEFORE UPDATE OF project_id, billing_authority_id, authority_rate_id,
   hourly_rate_cents, rated_amount_cents, billing_state, rate_source, rate_role` and the
   `IS DISTINCT FROM` chain carries the same eight; `aac_` carries `rate_role`; the non-services
   early exit (`_is_design_services_project`) is gone from the guard body and a postcondition
   refuses its return. `guard_invoiced_time_entry` installed, `prosecdef = f`, `00177` not in the
   diff. The running slot verbatim: `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON
   public.project_time_entries USING btree (user_id) WHERE (duration_minutes IS NULL)`. One BEFORE
   INSERT trigger on the guard function, not two (n9 honoured). **No RLS policy keyed on
   `projects.studio_id`** — the only `studio_id` policy references in the wave are
   `studio_member_rates`' own column.
6. **§0.16 / the 00484 contract, measured in `pg_proc`.** `resolve_time_rate_cents` `prosecdef = t`,
   `proconfig = {search_path=public, pg_temp}`, three caller asserts present (ASSERT 1 relationship,
   ASSERT 2 own-rate/owner-admin/designer-at-depth, ASSERT 3 role validation), `anon` and
   `authenticated` EXECUTE `f` (see §W1-R9-08 for `service_role`); `set_project_studio_id_owned`,
   `close_prior_studio_member_rate` and `time_entry_auto_roster` DEFINER, pinned, **no role holds
   EXECUTE**; the three guards INVOKER with pinned `search_path`, revoked from everyone;
   `claim_time_entries` INVOKER with `authenticated` EXECUTE, as §1 specifies. Extension calls are
   `extensions.`-qualified (`00598:94` uses `extensions.gen_random_uuid()` — the `00282` 42883 trap
   avoided). `is_org_admin_or_owner` is the only owner/admin helper called; `user_is_org_member`
   gains **0** new call sites in the diff.
7. **§0.17's 00484 quartet, measured in `pg_policies`.** All four present with the exact names and
   commands. I also read `00484:1712-1760` myself: its census is `FROM expected LEFT JOIN …`, so it
   asserts that the registered policies exist and match — it does **not** forbid additional
   policies, and it runs at `00484`'s own replay point, which is why W2's HT-10-a narrowing will not
   trip it (and why §0.17's warning that doing so "silently voids a signed authorization contract"
   is the real constraint). `studio_member_rates` carries exactly **3** policies and no DELETE
   policy.
8. **Is the insert-for-another-user path reachable by anyone but a project designer?** No: every
   other INSERT policy on `project_time_entries` (`Team can log their own time entries`,
   `time_entries_studio_insert_own`) carries a `user_id = auth.uid()` leg. §W1-R9-01's F4 is
   specifically the `Designers manage their project time entries` `ALL` policy with a NULL
   `with_check`.

---

## Gates re-run (this reviewer, clean stack, `127.0.0.1:54422`)

| command | result |
|---|---|
| `npx supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `00595`…`00602` + `20260910152111` applied, every postcondition replayed, all 22 seeds loaded, `Finished supabase db reset` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green, 6 unexpected-fail** — the brief's/plan's invocation (§W1-R9-09); all six abort in `_countersign_design_services_agreement_impl` with `design services agreement … not found or access denied` |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` (from the worktree) | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — all six documented there, dated 2026-09-11, i.e. the W0 integration baseline |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green** — cases (a)–(z) **+ (aa)**; `All time_rate_resolution assertions passed.` |
| `scripts/run-sql-tests.sh -d <worktree>/supabase/tests/rls -f studio_member_rates -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `python3 <worktree>/scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — baseline + 2610 replayed statements, byte-identical to the committed seed |
| `SUPABASE_DB_URL=…:54422 pnpm --dir <worktree> db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --dir <worktree> --filter @patina/admin-portal build` | **green** (exit 0) — the one portal whose build enforces types |
| *beyond the brief:* `pnpm --dir <worktree> --filter @patina/supabase test` | **101 files, 1251 passed, 12 skipped**, 0 failed |
| *beyond the brief:* `pnpm --dir <worktree> --filter @patina/designer-portal test -- use-time-tracking-authority` | **1 suite, 3 passed** (the only designer-portal test in the diff) |
| `git status --porcelain` (worktree) | **empty**; `git ls-files -v supabase/config.toml` → `S`; `git log --name-only … -- supabase/config.toml` over the range → empty |
| `git show --stat` ×13 commits | only W1 paths; conventional-commit subjects throughout (`feat(time)` / `fix(time)` / `test(time)`); `database.types.ts` appears only in the two commits where a schema change justifies it (`+3` then `+105`) and is never hand-shaped; no `git add -A` footprint (no stray artifact, lockfile or `.env`) |

## Done-when, SQL-probed as the roles the tests name

| Done-when | probe | result |
|---|---|---|
| #1 `commercial` unchanged; `billing` + `rls` green | above | ✅ (commercial via the `-k` invocation; §W1-R9-09) |
| #2 `INSERT … (hourly_rate_cents) VALUES (99999)` on a non-services project stores the resolver's value | case (a) green on my clean reset; independently, `probe_r9a.sql` A stored the resolver's 10000/40000 on rows where the member sent no rate at all | ✅ |
| #3 a rate typed by the owner appears on the next entry with `rate_source='studio_member'` | `probe_r9a.sql` (owner writes 40000/10000 through `studio_member_rates_admin_insert`, member logs → `studio_member`), `probe_r9f.sql` F2 (15000 → the entry) | ✅ in SQL; ❌ the live-mode render half (W1-R4-03, deferred) |
| #4 a new hire's services entry carries non-NULL rate + amount and `pending_authorization` | case (c) + the (c4) non-promotability assert (HT-6-b, owed), green on my clean reset | ✅ |
| #5 a two-role member's row records the role she picked | cases (e)/(f) green; `probe_r9d.sql` shows one shape where the stored role is **not** the one that priced (§W1-R9-04) | ⚠ as a stored `rate_role`; ❌ nothing prints it (deferred) |
| **contra** — the member's own number never prices a client's hour (HT-1 / HT-3) | `probe_r9a.sql` B (both aiming attempts refused), catalog reads 1–3 above | ✅ **for every manoeuvre a member can perform**; ❌ **without any manoeuvre** on the non-owner-designer shape (§W1-R9-00, HT-3-b) |
| **new contra** — the rate a studio sets about one member stays between them | `probe_r9f.sql` F1/F2/F4 | ❌ **no** — §W1-R9-01 |

## Not verified

- **Anything on Strata.** No `db push`, no prod probe. In particular nobody has yet counted, even
  read-only, how many live projects have a non-owner lead designer (sizes §W1-R9-00) or how many
  live studios have more than one member (sizes §W1-R9-01's passive leg).
- **Lane B's surfaces.** They do not exist (deferred, phase 2), so no live-mode render check, no
  `timeRateProvenance` behaviour, no PostHog emission was or could be exercised.
- **`designer-portal lint`** and the **full** `designer-portal test` suite — outside the brief's
  gate list; I ran only the one suite in the diff. `client-portal`, `manufacturer-portal` and the
  three services are outside this wave's diff; `admin-portal build` is the shared-package gate and
  it is green.
- **The six `commercial` failures were taken as pre-existing** on the strength of
  `supabase/tests/KNOWN_FAILURES.md`'s dated entries (2026-09-11, the W0 baseline) and the fact
  that each aborts before any authority-rate assert. I did not check out
  `origin/hour-tracking/integration` and re-reset to prove it empirically.
- **Concurrency.** No two-session race of `00602` against `set_project_studio_id`, and no race of
  the close ladder under simultaneous blur-saves on the same `(studio_id, user_id)`.
- **The `studio.id` terminal tiebreak** in both the resolver and `00602` — a determinism backstop
  reached only on identical `owner_seat.created_at` with the rate preference also tied; not staged.
- **§W1-R9-01's fix sketch** was not implemented or staged; the `ERRCODE` and the exact placement
  relative to delta 1 are a proposal, and the shipped-caller survey that makes it free is the
  enumeration in refutation 4 above.

## Probe scripts (re-derivable)

`/private/tmp/claude-501/-Users-kody-Code-patina-merged/e257acb8-387e-4b1d-8426-8827597413f6/scratchpad/r9/`
— `probe_r9a.sql` (the member's date lever on tier 2, the `project_unbilled_time` read, the
`designer_id` / `studio_id` repoint refusals, and the re-price-on-UPDATE), `probe_r9b.sql` (the
same lever on tier 1 across a rate-lowering addendum, and the bound-row control),
`probe_r9c.sql` (§W1-R9-02, the date-less preference), `probe_r9d.sql` (§W1-R9-04 and §W1-R9-05),
`probe_r9e.sql` (§W1-R9-03, the blur-save dead end), `probe_r9f.sql` (§W1-R9-01, the confidential
rate off the hours row and the minted-entry enumeration, with its negative control). Every script
is transaction-wrapped and ends in `ROLLBACK`; nothing on the stack was modified outside a
rolled-back transaction, and no shipped function, policy or trigger was patched by this reviewer.
