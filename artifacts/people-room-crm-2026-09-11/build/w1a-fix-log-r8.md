# W1a — fix log, round 8 (R-AQ, R-AR)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local stack only — no `supabase db
push`, no `functions deploy`, nothing touched on Strata.

Scope: the two ROUND-8 rulings, and nothing else. The r8 minors (R8-m1..R8-m4)
and the 27 minors carried from r6/r7 are untouched — no ruling covers them.

---

## R-AQ (r8 R8-M1) — a wordless refusal wipes the seat's four evidence columns

**The finding.** `mirror_channel_consent_to_parties()` COALESCEd each evidence
column over what the seat already held. R-AN's "never NULL over non-null" is
right for a verdict that simply does not restate its evidence — but a refusal
carrying no source of its own is a refusal whose evidence is *known absent*, and
`project_parties` has ONE evidence set. The seat NEXT DOOR, in the same studio
on the same number, routinely holds the GRANT's evidence. So on the sourceless
refusal the shipped portal and the fold really write, the COALESCE left that
sibling seat reading `(opted_out, written, 'Signed consent form at kickoff',
2 Jan 2026)` — R-Q's sentence, composed off the seat, printing "Opted out in
writing, 2 Jan 2026": the studio's own consent document named as the refusal,
dated to the day of the grant.

**What changed** — `supabase/migrations/00594_studio_channel_consent.sql`:

* new local `v_refusal_wordless boolean`, set in the refusal branch:
  `v_refusal_wordless := NEW.opt_out_source IS NULL;`
* the four evidence columns in the mirror's `UPDATE` — `sms_consent_source`,
  `sms_consent_evidence`, `sms_consent_recorded_at`, `sms_consent_recorded_by` —
  became `CASE WHEN v_refusal_wordless THEN NULL ELSE COALESCE(v_seat_*,
  pp.*) END`, and the same CASE went into the `IS DISTINCT FROM` tuple that
  guards the write (otherwise the wipe would be suppressed as "no change").
* `sms_consent_disclosure_version` is NOT in the set — it belongs to the
  disclosure the person was shown, not to how they refused, and keeps coming
  from the record (R-AQ says four).
* `sms_consented_at` / `sms_opt_out_at` are not evidence and are untouched.
* the branch comment and the `COMMENT ON FUNCTION` now state the rule and say
  R-AN still governs every other transition.

**Test** — `supabase/tests/people/w1a_identity_channels_consent_test.sql`,
block 27: a SIBLING seat (`e0…aa`, 'Nils Ek', same number `612-555-0433`,
`granted` + `written` + 'Signed consent form at kickoff' + recorded 2 Jan 2026)
was added beside the sourceless refusal, and new assertions 27i6–27i8 check that
the fold's mirror leaves it `opted_out` with all four columns NULL while
`sms_consented_at` survives.

**Evidence** —
`artifacts/people-room-crm-2026-09-11/build/probe15-r8-negative-controls.sql`,
run against the reset stack. Shipped mirror (A1), then the pre-fix mirror
restored by pinning one token (A2 — with `v_refusal_wordless := false` every
CASE takes its ELSE branch, which IS the old COALESCE body):

```
=== A1. SHIPPED mirror (R-AQ): the fold, then both seats ===
 folded = 1
  status   | refusal_unanswered | opt_out_source | source
 opted_out | t                  |                |

 display_name  | sms_consent_status | sms_consent_source | sms_consent_evidence | sms_consent_recorded_at
 Granted Seat  | opted_out          |                    |                      |
 Refusing Seat | opted_out          |                    |                      |

=== A2. NEGATIVE CONTROL: the pre-R-AQ mirror (every CASE falls to COALESCE) ===
 display_name  | sms_consent_status | sms_consent_source |      sms_consent_evidence      | sms_consent_recorded_at
 Granted Seat  | opted_out          | written            | Signed consent form at kickoff | 2026-01-02 00:00:00+00
 Refusing Seat | opted_out          |                    |                                |
```

A2 reproduces the review's row verbatim; A1 is the same population under the
shipped function.

---

## R-AR (r8 R8-M2) — a held card cannot change what it is, or whose it is

**The finding.** The three card guards this wave adds all fire on the
REFERENCING row. Nothing fired when the card being pointed AT changed its
`entity_kind` or its `organization_id`, so one ordinary `UPDATE studio_contacts`
undid all three at once.

**What changed** — `supabase/migrations/00593_studio_contact_channels.sql`
(at the foot of the file; it lives in 00593 rather than 00592 because it reads
`studio_contact_channels`, which 00592 has not created yet — noted in the banner
and in the function's own comment):

* `assert_studio_contact_identity_stable()` — SECURITY DEFINER,
  `SET search_path TO 'public'`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`,
  `COMMENT ON FUNCTION`, in the shape of the three existing guards.
* trigger `assert_studio_contact_identity_stable_trg`,
  `BEFORE UPDATE OF entity_kind, organization_id ON public.studio_contacts`,
  `DROP TRIGGER IF EXISTS` first (idempotent).
* It returns NEW immediately when both columns are `IS NOT DISTINCT FROM` their
  OLD values: `UPDATE OF` fires on a restatement too, and the shipped hook
  (`use-studio-contacts.ts`) writes `entity_kind` on every edit that passes one.
  A change is refused; a restatement writes.
* Otherwise it counts the four kinds of holder — reach channels on the card,
  designations naming it (`paperwork_contact_person_id` / `signer_person_id` /
  `site_contact_person_id` on any card), contact rules routing to it,
  affiliations standing on it as `person_id` OR `company_id` — and raises
  `studio_contact_identity_held` with a HINT naming what holds it.

**Test** — new block 29 (`29a`–`29f`): a card nothing points at is free to
change; hang all four holders on it and the kind flip and the studio move are
both refused; the firm the affiliation names is held too; a restatement of the
same kind and studio still writes the edit; detaching the four opens the door.

`29d` clears the company card's designation before attempting the move, because
`assert_studio_contact_designations_trg` also fires on an `organization_id`
change, sorts before this trigger by name, and correctly answers first with
`designated_person_other_studio`. `29f` uses the kind flip rather than a studio
move because `studio_contacts`' own member RLS `WITH CHECK` refuses a move into
a studio the acting member does not belong to — which would prove nothing about
this guard.

**Evidence** — same probe file, parts B1/B2:

```
=== B1. SHIPPED guard: the flip is refused, with a hint naming the holders ===
NOTICE:  raised: studio_contact_identity_held
NOTICE:  hint:   This card cannot change its entity_kind or its studio while something
         still points at it: 1 reach channel(s) on this card, 1 designation(s) naming it
         on other cards, 1 contact rule(s) routing to it. Detach or move those first — …

=== B2. NEGATIVE CONTROL: drop the guard, flip the card, count the wreckage ===
DROP TRIGGER
UPDATE 1
 channels_owner_type_wrong | designation_names_a_firm | route_to_a_firm
                         1 |                        1 |               1
```

B2 reproduces the review's three broken states exactly; B1 is the same UPDATE
with the trigger in place.

---

## Gates

```
$ pnpm --dir …/agent-people-build supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), … and a sourceless
         refusal is never given the studio's consent as its words (r6 R6-M1) — nor left
         standing on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the refusal
         keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ psql … -f $TMPDIR/rerun_r9.sql        # all three migrations replayed in ONE txn
       result
 rerun all three ok
ROLLBACK

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff supabase/seed/00-legacy-grants.sql
+-- 00593_studio_contact_channels.sql
+  REVOKE ALL ON FUNCTION public.assert_studio_contact_identity_stable() FROM PUBLIC, anon, authenticated;
   (6 insertions, nothing else)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty — no table or column changed; a trigger function is not in the generated surface)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (125ms)
```

Migration numbering unchanged (00592–00594, head 00591). No edge-function file
was touched this round.
