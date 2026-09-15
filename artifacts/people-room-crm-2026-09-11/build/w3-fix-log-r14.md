# W3 fix log — round 14

Three findings from `w3-review-r14-migrations.md` / `-qa.md` / `-code.md`, closed.
Nothing else touched. Five files in the working tree:
`supabase/migrations/00629_studio_contact_merges.sql`,
`supabase/tests/people/w3_merge_sweep_household_test.sql`,
`apps/designer-portal/e2e/helpers/psql.ts`,
`apps/designer-portal/e2e/people/bring-forward.spec.ts`,
`apps/designer-portal/e2e/people/merge.spec.ts`.

---

## r14-mig-blocking-1 + r14-blocking-1-sms-capable-corroborated (blocking) — one fix

**Both findings are the same defect**, filed independently by the migrations review
and by a corroborating live reproduction, so they are closed by one change.

`00629`'s channel reduction named six of `studio_contact_channels`' seven typed
columns. The seventh, `sms_capable` (NOT NULL boolean, written only by W2's
"This line takes texts" act), was not in the SET list, and `00629`'s dedupe
DELETE then removed the absorbed row — so the value left the table. R-BN says
a merge never deletes a typed fact.

**Fixed** in `00629_studio_contact_merges.sql`, in the reduction R-BN governs:

```
         preferred   = s.preferred OR u.merged_preferred,
         sms_capable = s.sms_capable OR u.merged_sms_capable,   -- added
         label       = COALESCE(s.label, u.merged_label)
```

with `mc.sms_capable AS merged_sms_capable` added to the inline `u` subquery.
It takes exactly the shape `verified` and `preferred` take, for the same reason:
one card was told the line takes texts, so the studio's book was told, and a fold
may not unlearn it. The banner above the reduction now says SEVEN, names
`sms_capable`, and records what the loss did to the face (the survivor's Reach row
reverting to "Patina has not been told this line takes texts…", taking
`channelConsentAxis()` and with it PR-m's manual opt-out — R-AY's only home for a
verbal STOP). `created_by` / `created_at` were left alone: the finding does not
open that question.

No portal change: `sms_capable` has no reader outside `reach-access.tsx`, and the
compare sheet does not enumerate channel columns.

### Pinned in the SQL suite

`supabase/tests/people/w3_merge_sweep_household_test.sql`, block 10, beside the r6
B-1 assertions — over **mobile** rows, because the r6 pin's own collision is an
EMAIL row where `sms_capable` is false on both sides by construction, which is why
eleven rounds passed over the column the fold was destroying. Three rows added to
the existing B-1 pair (`…0001` survivor / `…0002` absorbed), folded by the merge
already in that block:

| value | survivor | absorbed | asserted after the fold |
|---|---|---|---|
| `+16125559941` | false | true | **true** — the shipped shape: the older, blanker card PR-o pre-picks absorbs the confirmed one |
| `+16125559943` | true | false | **true** — the OR pinned the other way round; a straight copy would fail here |
| `+16125559942` | true | *(no counterpart)* | **true** — negative control: an ordinary uncollided row is untouched |

### Measured

- `pnpm supabase:reset` — clean replay, head `00633`.
- `w1a_identity_channels_consent_test.sql` → "All W1a assertions passed."
  `w1b_compliance_authority_directory_test.sql` → "All W1b assertions passed."
  `w3_merge_sweep_household_test.sql` → "W3 SQL suite: all blocks passed".
- `probe-r14-a-sms-capable.sql` (the review's own probe, unmodified, re-run on the
  fresh reset) now reads:
  `A-a BEFORE absorbed row sms_capable=t survivor row sms_capable=f` /
  `A-b AFTER survivor row sms_capable=t (rows left on folded card: 0)` /
  **`A-c sms_capable TRAVELLED`** — where it read `WAS DESTROYED`.
- `probe-r14-a2-pin-bites.sql` (new) — proves the pin is not decoration. In one
  ROLLBACKed transaction it reinstalls the **pre-fix six-column reduction** by
  rewriting the live `pg_get_functiondef` in place, replays block 10's fixture, and
  runs the three new assertions:
  `A2-b the r6 pin's own columns are unaffected: status=unsubscribed verified=t preferred=t label=Shop address`
  (why the old, email-shaped pin was blind) then
  **`A2-c PIN 1 FIRES: the fold destroyed sms_capable (survivor reads f)`**.
- `db:generate` — no diff, no type drift. No GRANT/REVOKE changed, so
  `seed/00-legacy-grants.sql` is untouched.
- `pnpm --dir apps/designer-portal type-check` and `pnpm --dir packages/supabase
  type-check` — both clean.

---

## qa-r14-e2e-people-suite-0-for-3 (major) — three test-authoring defects

All three are defects in the safety net, not in the shipped feature; each is fixed
as the finding prescribes.

**1 · "Put back" strict-mode collision** (`bring-forward.spec.ts`). The DocSheet
header's universal dismiss ("Put back · Esc") and the act row's own "Put back" are
two real, correctly-behaving controls; Playwright's substring name-match conflated
them. Now addressed by the key SPEC §5.7 #6 gives the act row:
`page.locator('[data-action-key="bring-forward-put-back"]')`. No product change.

**2 · the folded name after a merge** (`merge.spec.ts`). The page-wide
`getByText(NEWER_NAME).toHaveCount(0)` contradicted the room's own designed
confirmation sentence, which the spec asserts three lines earlier. Replaced with a
DOM walk that removes `[data-people-announcer]` and asks whether the folded name
survives anywhere else — plus, because the act opens the SURVIVOR'S CARD (so
`[data-directory-list]` is off the page at that moment), a return to
`/people?role=all&scope=studio` where the Directory is asserted to hold the
survivor and not the folded card. The merge's promise is now tested where the
studio actually reads it.

**3 · `people_directory_seats.consent_status` read as the service role**
(`bring-forward.spec.ts`). Root cause confirmed independently on the local stack:
the view is `security_invoker = true` and `consent_status` is gated through
`auth.uid()`, which is NULL for `adminDb` (a bare service-role client with no
acting user) — so the view emits **zero rows for any project**, and the poll could
never read anything but `null`.

```
-- as plain postgres, no claims (the adminDb read path):
(0 rows)

-- wrapped in the designer's own claims:
{"sub" : "a0000000-…-004", "role" : "authenticated"}
opted_out
```

The poll now goes through the suite's existing impersonation door,
`psqlAsUserRow(DESIGNER, …)` (`SET LOCAL ROLE authenticated` +
`request.jwt.claims`), so the test reads the view as the designer the fixture
signs in as.

`psqlAsUserRow` had a latent bug of its own that this is the first caller to hit:
the impersonation preamble is itself a `SELECT set_config(...)`, so in tuples-only
mode psql prints the claims JSON as line 1 and the caller's result after it, and
the helper returned `[0]` — the claims blob. It now returns the LAST row, with the
measurement above quoted in the comment. It had no other callers.

### Measured

`e2e/people/merge.spec.ts` + `e2e/people/bring-forward.spec.ts`, chromium,
`--workers=1`, against a production build served on :3000 (env passed inline; the
worktree has no `.env.local`):

```
✓ bring-forward.spec.ts:117 › task 5 — search the prior job, tick four, one confirm (4.7s)
✓ bring-forward.spec.ts:264 › Put back clears the pick and writes nothing (4.4s)
✓ merge.spec.ts:81 › the duplicate band merges two cards into one (PR-o) (5.2s)
3 passed (15.6s)
```

0-for-3 → 3-for-3.

### Not fixed — out of this brief, reported to the orchestrator

The full `e2e/people` run is **14 passed / 8 failed**. The eight are in
`add-sheet.spec.ts` (3), `person-card.spec.ts` (2), `add-client-letter.spec.ts` (2)
and `call-sheet.spec.ts` (1) — all committed before this round, none named in any
r14 finding, none touched by these fixes. Several are the SAME authoring family as
finding 2 above (`strict mode violation: … resolved to 2 elements`, including
`getByRole('alert')` and a toast sentence duplicated by the room's announcer), so
they are likely cheap; one (`addSub`'s card never appearing after "Add to the
roster") is not characterised and could be a product defect. Flagged, not fixed.
