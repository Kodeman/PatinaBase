# W3 (P2) — round 19 QA, against a local production build

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod touched, no
migration minted, no `supabase db push`, no `supabase functions deploy`, no portal deploy.

## Procedure run

1. **Port rule** — `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` came back empty both times (start
   and after teardown); no orphan to reconcile, no conflict to report.
2. `supabase db reset --workdir …` — `rc=0`, every migration through `00633` applied, every
   seed file replayed, ending `people_crm_dev.sql`. "Finished supabase db reset on branch main."
3. Inline-env build: `pnpm --dir … --filter designer-portal build` (workspace root), with
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the anon/service keys from
   `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
   `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, and the service/app URLs
   `.env.example` lists — build succeeded, full route table printed.
4. `npx next start -p 3000` (same inline env) from `apps/designer-portal` — chosen over
   `pnpm --filter designer-portal start` because pnpm's own arg-forwarding mangled `-p 3000`
   into a bogus project-directory argument (`next start "--" "-p" "3000"`). Server answered
   `200` on `/` within 6s. (`next start` logs one warning about `output: standalone` not being
   the way to run this build — cosmetic; the server served correctly throughout the session.)
5. `npx playwright test e2e/people/bring-forward.spec.ts e2e/people/merge.spec.ts --project=chromium`
   against the running server — **3 passed in 8.4s**, chromium only, no retries.
6. Manual walk (below), signed in as `designer@patina.dev` via Inbucket
   (`http://127.0.0.1:54324`) — the sign-in code read from the inbox each time, never guessed.
7. Server stopped (`kill`), `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty after 5s — port confirmed
   free before this report was written. (The server was restarted once, mid-round, to chase
   the eyebrow finding down to certainty via DOM inspection rather than a screenshot guess;
   stopped again afterward, same free-port confirmation.)

## Prior findings (r18 fix log) — re-checked, all fixed

| Finding | Re-check | Result |
|---|---|---|
| BLOCKING — a bid-outcome correction erased a hand-closed seat | `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **43/43 passed**, including the r18 case (`previous: {stage:"off_job"}`, patch `bidOutcome:"declined"` → `off_job_at`/`off_job_reason` untouched) |
| MAJOR — merge left one human holding two open seats of one kind on one job | Re-ran `probe-r18-g-fix-seat-collision.sql` verbatim, one transaction, rolled back | G-a: refused `merge_seat_collision`, DETAIL `Okonkwo residence · client_rep`, 0 merge rows, 2 seats still open on the person. G-c: same refusal for a plain trade pair. G-d: a **closed** survivor seat still lets the fold through. All three match the fix log |
| MAJOR — "Add to the household" was a native `disabled` button | Live, both as owner and as a plain member (below) | `aria-disabled="true"`, `disabled: false`, `aria-describedby="household-person-held"` — confirmed by direct DOM query, not a screenshot guess |
| MAJOR — the report stated a money write the RPC cannot make | Read `w3-room-report.md` §5/§9 at HEAD | Both sites now read "writes exactly one row, scope `money`" with the r18 attribution; the old `money` + `change_order` claim is gone |
| Full SQL suite | `psql -f supabase/tests/people/w3_merge_sweep_household_test.sql` | "W3 SQL suite: all blocks passed", block 13d (the r18 pin) last, ends `ROLLBACK` |

None of the four r18 findings reopened.

## Task 5 — Bring forward (SPEC §5.7)

Opened Okonkwo's Call Sheet → **From the rolodex** → searched `Lindqvist`.

- **R-BP's six-person pool confirmed live**, not five: Ben Ostrom, Claire Bissett, Dana
  Kowalski, Erin Sato, Ingrid Halvorsen, Pete Rusk, alphabetical, exactly matching
  `bring-forward.spec.ts`'s own list. "0 OF 6 FROM THE LINDQVIST KITCHEN SELECTED" before any
  tick, "4 OF 6…SELECTED" after ticking Dana, Pete, Ingrid, Claire — both at 1440 and at 390
  (screenshots `qa-w3-r19/task5-bring-forward-1440-already-seated.jpg`,
  `…-390-put-back.jpg`). Erin Sato and Ben Ostrom stayed unticked throughout. **Settled per
  rulings.md §3 R-BP — the reference screenshots
  (`shots/people-room-1440-state-pick-1440.png`, `…-390…`) still show the pre-R-BP five-row,
  "4 of 5" specimen; the six-row, "4 of 6" shape on screen is the ruled current state, not a
  drift. Not a finding.**
- Every §5.7 string checked present at both widths: the checkbox rows (no tick glyph, square
  mark), the 34px circle + name + firm/trade + history line, Pete's opt-out note ("Opted out by
  text, 3 Dec 2025, on the Lindqvist kitchen."), Ingrid's rule clause, Dana's lapsed paper word,
  the "What travels" / "What stays behind" pane (identical six/three items), and the act row
  ahead of the consequence sentence at both widths (§5.7 #9's 390 order: rows, pane, act +
  sentence, all in flow — confirmed).
- **On the real Okonkwo residence, all four of Leah's task-5 names are already seated** (the
  seed's own point, per the room report §10 item 1) — so the live act correctly refused to
  double-seat them: the act row reads "ADD TO THE ROSTER" (no count, because the true add-count
  is zero) and the consequence sentence names exactly who: "Adds no seats to the Okonkwo
  residence. Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are already on the call
  sheet." Pressed it: no seat was written (`project_parties` unchanged, 1 row each, verified by
  `select … order by studio_contact_id` before and after), no console error. This is the
  documented, honest behavior for the seeded fixture, not a bug — the mechanic itself (four
  net-new adds) is what `bring-forward.spec.ts` exercises against its own throwaway project, and
  that suite is green (see above). "PUT BACK" cleared all four ticks back to 0 of 6, at both
  widths.
- **One finding, below (MAJOR-1): the picker's eyebrow project name is missing.**

## Compare & merge

The seeded studio carries no duplicate phone pair (checked directly:
`select value, count(distinct owner_id) … having count(distinct owner_id) > 1` on
`studio_contact_channels` returned zero rows), so — mirroring `merge.spec.ts`'s own approach —
inserted a disposable pair sharing one number (`QA Older Card` / `QA Newer Card`, phone
`+16125559931`, `created_at` 2024 vs 2026) directly in Postgres, walked the room, then deleted
both rows afterward (confirmed 0 rows remain).

- Directory duplicate band read exactly: "These two cards share a phone. QA Newer Card QA Older
  Card COMPARE THESE TWO."
- The sheet pre-picked the **older** card as survivor (PR-o), both column heads live
  `aria-pressed` toggles.
- Consequence sentence matched the report's own template verbatim, substituting the two names
  (screenshot `qa-w3-r19/task-merge-sheet-consequence.jpg`).
- Pressed "Merge into QA Older Card": people count dropped 42→41, landed on the survivor's own
  card. `studio_contacts.merged_into` set on the folded card, `studio_contact_merges` wrote one
  row (`matched_on: phone`, `merged_by` the seeded designer), `resolve_merged_contact(newer)` →
  survivor. No console error.

## A bid outcome, edited

Okonkwo Call Sheet → Bidding band → **Rivera Finishes** (seeded `no_response`) → "Change what
came back" → the seven-field editor (asked/owed/how it came back/number came back/chose
them/holds until/who priced it) — confirmed present exactly as the room report describes.
Changed "How it came back" to **Selected**; the consequence sentence read "Recording this moves
Rivera Finishes to Awarded. A bidder who did not win never reads as crew." (screenshot
`qa-w3-r19/task-bid-editor-consequence.jpg`). "Who priced it" offered person cards only (checked
the `<select>`'s option list directly — 28 named people, zero firms). Pressed "Write the bid":
`project_parties.bid_outcome='selected'`, `stage='awarded'`, row left the Bidding band. Reverted
by hand afterward (`bid_outcome`/`stage` back to `no_response`) to leave the seed as found.

## The household — as principal, then as a plain member

Task read: "add a household member with a threshold as the principal and confirm a member
cannot." In this room "principal" is a **studio** role (owner/admin), not a household role — the
household-threshold trigger (`assert_household_threshold_principal`, `00632:225-245`) gates on
`is_org_admin_or_owner`, so the check needs a genuine non-owner/admin studio member. The seeded
studio carries only an owner (`designer@patina.dev`) and an admin (`studio_manager@patina.dev`)
— no plain `member` — so `organization_members.role` for `studio_manager@patina.dev` was
temporarily set to `member`, the check run, then restored to `admin` (confirmed restored).

**As Leah (owner):**
- Okonkwo's Client side band read "No household is on file for this client yet… OPEN A
  HOUSEHOLD." Pressed it — a household opened (seeded from the existing client-side seats;
  `client_households.member_person_ids` came back holding both Chidi and Adaeze without a
  second act).
- "ADD A HOUSEHOLD MEMBER" → chose Adaeze Okonkwo, role "Signs for the household" → consequence
  sentence named exactly what would happen, nothing more → pressed "Add to the household" →
  succeeded. (This opened a **second, `client_rep`-kind** seat for Adaeze rather than reusing
  her existing plain `client` seat — correct: a household role is tracked per party-kind, and
  her existing seat is a different kind. Not a defect; noted only because it changed the
  client-side seat count and needed its own cleanup, done below.)
- "SET THE FIGURE" → 5000 → consequence sentence named the household member who already signs
  money moving to the new figure → pressed "Write the figure" → `client_households
  .co_threshold_cents = 500000`. The band correctly then offered "RECORD THE AUTHORITY" for
  Adaeze specifically ("…signs for the household but has no figure of their own… Nothing
  defaulted from the agreement"), R-BQ's per-member act — not pressed, left as an open act.

**As Studio Manager, downgraded to `member`:**
- Opening a household is **not** principal-gated — succeeded (a fresh `client_households` row).
- "SET THE FIGURE" rendered **already held**: `aria-disabled="true"`, `disabled: false`,
  `aria-describedby="household-figure-held"`, the reason **always on the face**: "The
  change-order figure is the principal's to set. An owner or an admin of the studio can write
  it." — this is the R18 fix pattern (never a native `disabled`), confirmed by direct property
  read, not appearance alone.
- **Pressed it anyway** (aria-disabled buttons stay clickable unless explicitly guarded) — the
  press announced a second line, the RLS-refusal sentence verbatim: "A change-order figure is
  the principal's to set. Ask an owner or an admin of the studio." (screenshot
  `qa-w3-r19/task-household-member-cannot-set-figure.jpg`). `client_households
  .co_threshold_cents` confirmed **still NULL** afterward — nothing was written, both at the
  client-side pre-check and (redundantly, correctly) at the trigger.
- Console clean on a cold reload as this user (checked immediately after navigation, not after
  interaction — zero messages).

Cleanup: the second household (`client_households`), Adaeze's extra `client_rep` seat, and the
role downgrade were all reversed by hand afterward; the Client side band was re-checked and
reads "No household is on file for this client yet… OPEN A HOUSEHOLD," matching the pre-test
state, and `project_parties` for Okonkwo's client side is back to exactly the two seeded rows.

## Close this seat, with a reason

Call Sheet → **Joe Wozniak** (Cedar & Iron Framing, seeded `active`) → "CLOSE THIS SEAT" →
confirm sentence "Close Joe Wozniak's seat? The seat stays on the job with the day it closed,
and everything it carries stays with it." → "WHY IT CLOSED" filled → **CLOSE THE SEAT**. Row
left the "this week" band. `project_parties`: `stage='off_job'`, `off_job_at` = today,
`off_job_reason` = the typed text. "ADDED BY MISTAKE" sat beside it, held with the reason "This
number has a texting record behind it. Close the seat instead…" — the surviving hard-delete
path, correctly refused here. Reverted by hand (`stage='active'`, matching the seed's own value
at `people_crm_dev.sql:723`, `off_job_at`/`off_job_reason` cleared) afterward.

## Archive / restore, as owner

Created a disposable person card (`QA Archive Card`, no channels) rather than archive a seeded
identity. R1 → "PUT THIS CARD AWAY" → "This card was put away 15 September 2026. It stays out of
the book until it is brought back." + toast "QA Archive Card is put away." → "BRING THIS CARD
BACK" → toast "QA Archive Card is back in the book." Console clean. Card deleted afterward.

## Console

Checked after every write this round (merge, bid edit, seat close, household add/threshold,
archive/restore, the member-role refusal, and a cold reload as the member-role user) — **zero
console errors or exceptions** at any point.

## Data hygiene

Everything this round wrote to the shared local Postgres was either reverted or deleted by hand
before this report was written, confirmed by direct query immediately before writing this
document:

- `client_households`: 0 rows.
- `studio_contacts` named `QA %`: 0 rows.
- `studio_contact_merges`: 0 rows.
- `project_parties` for Rivera Finishes / Joe Wozniak: back to seed (`no_response`/`active`,
  `off_job_at` NULL).
- `organization_members` for the studio: owner + admin, as seeded.
- Okonkwo's client-side seats: exactly the two seeded rows (Adaeze `client`, Chidi
  `client_rep`).

No migration was minted (highest on the branch stays `00633`). No `.env.local` was created or
touched — every build/start/test command carried the local values inline, sourced from
`supabase status … -o env` and never printed.

---

## Findings

### MAJOR-1 — the bring-forward picker's project eyebrow ("OKONKWO RESIDENCE") is missing

**File:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:849` (the
`<DocSheet … title="From the rolodex" icon={UserPlus}>` call carries no `pageLabel`) and
`apps/designer-portal/src/components/document/roster/call-sheet.tsx:280-289` (the `RolodexPicker`
is given `projectName={projectTitle}`, but that prop is used only to compose the consequence
sentence and the consent/expiry clauses inside the sheet — never forwarded to `DocSheet` as its
`pageLabel`).

**Claim:** SPEC §5.7 #2 (`specimens/SPEC.md:585-613`) is explicit: "the picker is a DocSheet
region titled 'From the rolodex' with the eyebrow 'OKONKWO RESIDENCE'." The room report
(`w3-room-report.md` §3) states "the picker now keeps all nine points that are the shipped
face's to keep" — a claim the shipped picker does not fully support.

**What's on screen instead:** opened the picker at both 1440 and 390 (via the Call Sheet's own
"From the rolodex" action), read the sheet's full text via direct DOM query
(`[role="dialog"]` → `.innerText`) rather than trusting a screenshot crop. The sheet's own text
begins "FROM THE ROLODEX\nCLOSE\nALL\nGENERAL CONTRACTOR…" — no eyebrow line anywhere before the
kind filters. The only place the string "OKONKWO" appears anywhere in the sheet's text is inside
the person name **"Adaeze Okonkwo"**, a search result row, confirmed by locating the exact string
index and printing 80 characters of context around it (`"…SUPPLIER · PLUMBING\nNever on a job
yet\n…ADD\nAO\nAdaeze Okonkwo\nCLIENT\n…"`). No eyebrow reading "OKONKWO RESIDENCE" exists in the
DOM.

**Why the code doesn't have it:** `DocSheetHead` (`overlays/doc-sheet.tsx:131-197`) only prints a
page segment when the caller passes `pageLabel`, and — even where a caller does pass one — that
segment's own class is `hidden … sm:inline`, meaning it would still not print at 390 without a
matching mobile-visible path. `RolodexPicker`'s `DocSheet` call passes no `pageLabel` at all, so
neither width gets the project name in the sheet's own head.

**Not a false claim about the underlying Call Sheet itself** — the Call Sheet's own heading
("Call sheet · Okonkwo residence") and its site-access summary line (R-U) both render correctly
underneath, and both dialogs are simultaneously present in the DOM (checked
`document.querySelectorAll('[role="dialog"]')` returned two entries while the picker was open),
so the "Call Sheet head remains visible behind/above" half of §5.7 #2 is genuinely met. The
missing piece is narrowly the picker's own eyebrow.

**Confidence:** high — verified by direct DOM text search for the literal required string at
both the 1440 and 390 renders of the live build, not inferred from a screenshot crop.

**Fix:** pass `pageLabel={projectName?.toUpperCase()}` (or the existing uppercase-via-CSS
convention the report describes elsewhere) to the `DocSheet` call in `rolodex-picker.tsx:849`,
and give `DocSheetHead`'s `pageLabel` span a narrow-width-visible path (or a second, mobile-only
line) so §5.7 #9's "identical facts both widths" holds for this string too — the same defect
would otherwise resurface at 390 even after a 1440-only fix.
