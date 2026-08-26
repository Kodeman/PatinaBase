# Wave 1P — merge-review fix round, re-reviewed

**Branch** `feat/field-companion-w1p` · worktree `.claude/worktrees/field-companion-w1p` (read-only for
this pass — no edits, no git mutations, no pushes)
**Rebase target** `main` @ `31eede6a6`
**Pre-fix head** `69ea881d4` (rebased, 18 original commits) · **Fix head** `a69b449e0`
**Scope** `git -C <worktree> diff 69ea881d4..a69b449e0` (7 files) + a rebase-integrity check +
independent verification of the RLS claim the fix relies on
**Reviewer** independent context, read-only

---

## Verdict

> ### MERGE

The fix round closes all three blocking code/mechanics findings from
`wave-1p-merge-review.md` correctly, with mutation-provable tests, and introduces no new breakage
in the diff under review. The rebase is clean and verified independently, not just asserted. The two
"ledger" findings (admin-row correction, escalation amendments) live in the gitignored
`.superpowers/sdd/wave-1p-plan/progress.md`, not in tracked files, so they cannot appear in a git
diff — I read that file directly and both corrections are accurate, quoted-from-the-review, and
consistent with what I independently re-measured.

Two items from the original review remain genuinely open, but both are **deploy-time**, not
merge-time, per the original review's own categorization ("Blocking — do at or before deploy"):
flipping the `room-file` flag for the pilot cohort, and the FC-R10 browser walk. Neither is code and
neither belongs in this diff. See [§6](#6-still-open-not-blocking-merge).

---

## 1. Rebase integrity (finding 1 — `--ff-only` impossible)

Verified independently, not taken from the ledger's word:

```
git merge-base main a69b449e0  -> 31eede6a66d08b17ece80b3c91a8fc5a18740223
git rev-parse main             -> 31eede6a66d08b17ece80b3c91a8fc5a18740223
```

`main` **is** an ancestor of the branch head — this is a real linear rebase, not a merge commit
papering over a divergence.

```
git log --oneline origin/main..a69b449e0 | wc -l   -> 19
```

19 = 17 pre-existing commits + `69ea881d4` (the last of the original 18, itself a fix from the prior
whole-branch review) + `a69b449e0` (this merge-review's own fix commit). All 18 original commit
subjects are present and in original order (`9121ba9c7` … `69ea881d4`), with `a69b449e0` appended.
**Verdict: ADDRESSED.**

The predicted collision file, `packages/supabase/src/hooks/index.ts`, was checked directly: `main`'s
`useCommitProposalCapture` sits at line 1114, this branch's `useCaptureMediaUrls` /
`useCaptureVenueLabels` exports sit at 1859–1864, no duplication, no leftover conflict markers.
`pnpm turbo run type-check --force` → **30 successful, 30 total, 0 cached** (I re-ran it; matches the
ledger's post-rebase number exactly).

---

## 2. Finding-by-finding verdicts

### Finding 2 — letterhead designer leg unscoped (review P1)

**ADDRESSED.** `apps/designer-portal/src/components/document/letterhead-instruments.tsx`:

- `useClientScans` now takes `projectId: string | null` (signature at :95) and threads it into
  `readScansFor(ownerId, readyOnly, scopedProjectId)` (:118–134), which does
  `.eq('project_id', scopedProjectId)` on the designer leg only, when `scopedProjectId` is truthy.
- The designer leg only runs at all when **both** `designerId && projectId` are truthy (:135–137):
  `designerId && projectId ? readScansFor(designerId, true, projectId) : Promise.resolve([])`. A
  lead/proposal/relationship document (no `projectId`) runs no designer leg — pre-union behaviour,
  byte-for-byte.
- Ruling 4-B (client scan wins) is untouched: the dedupe still writes client rows first, designer
  rows last into the same `Map` (:190–193), and the door-selection logic at the bottom of the file
  (`withImage.find(owner_kind === 'client') ?? withImage[0]`) is unmodified by this diff.
- Caller wiring: `page.tsx:1137` already passed `projectId={row.project_id}` into
  `LetterheadInstruments` before this fix (pre-existing, used by `useSendDocumentNote`); the fix only
  had to route it into `useClientScans(clientProfileId, projectId)` at line 377 of the diff — done.

Two new test cases in `letterhead-scan-union.test.tsx` pin exactly the two ways this could regress:
a designer scan on a *different* project (`project_id: 'proj-2'`) and an *unlinked* scan
(`project_id: null`) — both assert **no** "Your scan" door appears. I ran this suite directly
(below) and it passes. The mock's `eq()` handler records filters per-builder-instance (fresh `let`s
inside each `from()` call), so the client leg and designer leg cannot cross-contaminate the assertion
— this is not a shared-mutable-state footgun.

### Finding 3 — Discovery picker client leg dead (review P2)

**ADDRESSED**, and correctly diagnosed as a resolve-by-wrong-key bug rather than a scoping bug.
`packages/supabase/src/hooks/use-room-scans.ts` (`useClientRoomScans`, :219–270):

- The `designer_clients.id → client_id` hop is deleted outright. The client leg now reads
  `room_scans.user_id = clientProfileId` directly (:246–248), where `clientProfileId` is documented
  and used as an **auth uid** — exactly what every real caller already passes
  (`discovery-section.tsx:151`: `clientProfileId ?? ''`, sourced from `document_state.client_profile_id`
  = `projects.client_id | proposals.client_id | leads.homeowner_id` per 00191/00192).
- The designer leg is scoped identically to the letterhead fix:
  `designerId && projectId ? readScansFor(designerId, projectId) : Promise.resolve([])` (:257–259).
- `discovery-section.tsx` gained an optional `projectId` prop (default `null`, :135–139), passed from
  `page.tsx:1270` as `projectId={row.project_id ?? null}` — wired only on the Discovery spread mount
  (`spreadSection === 'discovery' && row.engagement_id && row.designer_id`, :1262), which is correct:
  Discovery is the only consumer of `useClientRoomScans` in the app (confirmed by grep — no other
  caller exists).
- Query key now carries the project (`['client-room-scans', clientProfileId, projectId ?? null]`),
  so a project switch invalidates the cache correctly.

The test suite was honestly rewritten rather than patched to keep passing: the old flagship case
("leaves a client-only picker byte-identical to before the wave") is **replaced** — not
kept-and-ignored — with three cases matched to what production can now actually reach: a client's
scans list plainly with no suffix, an empty-both-sides picker renders the single placeholder option
(the actual pre-wave production state, now reachable and pinned), and a suffix appears only once a
project-scoped designer scan joins. `use-client-room-scans-union.test.ts` adds direct assertions that
no `designer_clients` table read happens at all, and that the project filter rides the designer leg
only, never the client leg. Both are real regression pins, not restatements of the implementation.

### RLS claim — verified against migrations, not asserted

The diff's own comment (`use-room-scans.ts:210-212`) and the ledger both claim: *"00020's 'Designers
can view authorized room scans' admits this read on the `designer_clients.client_id =
room_scans.user_id` leg, so no junction hop is needed."* I read the migration directly:

`supabase/migrations/00020_room_scan_associations.sql:138-155` —

```sql
CREATE POLICY "Designers can view authorized room scans" ON room_scans
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = room_scans.user_id
    )
    OR EXISTS ( ... room_scan_associations ... )
  );
```

Confirmed: the `EXISTS` clause inlines the exact relationship the deleted `designer_clients.id →
client_id` round-trip was walking — a designer reading `room_scans` where `user_id` is one of her
clients is admitted directly by RLS, no application-side junction lookup required. The new
`.eq('user_id', clientProfileId)` read is legitimate under this policy when the querying session is
the designer (`auth.uid()` matches `designer_clients.designer_id`).

I checked for a later policy that might have replaced or narrowed 00020, since the task specifically
asked about 00287:

- `supabase/migrations/00287_scan_artifacts_designer_read_fix.sql` — this is a **`storage.objects`**
  policy fix (fixes a segment-index bug in "Designers can read shared scan artifacts" for the
  `room-scans` bucket). It does **not** touch the `room_scans` table policy at all. Not a replacement.
- `supabase/migrations/00316_studio_shared_workspace_rls.sql:83` adds
  `"room_scans_studio_designer_read"` — an **additional** SELECT policy (studio co-member read), which
  the review's own Appendix lists alongside 00020 as a third, coexisting policy. It does not drop or
  replace 00020's policy.

No migration between 00020 and the branch's rebase target supersedes the designer_clients EXISTS
clause. **The RLS claim in the diff and the ledger is accurate.**

### Findings 4 & 5 — "ledger admin row corrected" / "escalations corrected"

**ADDRESSED, but outside the git diff by design** — these are not code changes and were never going
to appear in `git diff 69ea881d4..a69b449e0`. Both live in
`.claude/worktrees/field-companion-w1p/.superpowers/sdd/wave-1p-plan/progress.md`, which is
gitignored (the plan's own conventions call this "the SDD ledger" and say explicitly "no commit —
`.superpowers/` is gitignored"). I read it directly (not from any summary):

- **Admin row**: the A4 gate table's admin-portal row is corrected in place to
  `26 failed / 35 passed (61 suites) · 204 failed / 509 passed (713 tests)`, with the review's own
  sentence — *"the pre-existing claim below rests on construction, not on a measured before/after"*
  — quoted verbatim beside it. This exactly matches the review's re-measured numbers in §6 of
  `wave-1p-merge-review.md`.
- **Escalations**: two corrections recorded, both matching the review's §10 findings — (1) the
  browser walk is reclassified from a follow-up to an FC-R10 acceptance criterion; (2) the "PUSH
  BLOCKED" escalation is marked stale (the branch reached `origin` at `566bfe9c0`; the residual live
  issue is the proxy blocking `main`'s eventual push, correctly distinguished from the stale claim).

Both read as accurate corrections against the review text, not as a rubber stamp — no rewritten
numbers, no softened language.

---

## 3. Spot-run of the three touched test files

Per the task's instruction, I did not re-run full suites; I ran only the files this diff touches.

```
pnpm --filter @patina/designer-portal test -- letterhead-scan-union discovery-scan-options
  -> 2 suites passed, 11 tests passed

pnpm --filter @patina/supabase test -- use-client-room-scans-union
  -> 1 file passed, 9 tests passed
```

Both numbers are consistent with the ledger's claimed post-rebase gate
(`426 suites / 4487 tests` designer-portal, `874` supabase tests — up from 4484/868 pre-fix by
exactly the new cases added in this diff). I additionally ran the two `discovery-section.test.tsx`
files (not touched by this diff, but the closest consumers of the changed `DiscoverySection` prop
signature) as a cheap blast-radius check: **2 suites passed, 5 tests**, confirming the new optional
`projectId` prop (defaulting to `null`) does not break existing callers.

`pnpm turbo run type-check --force` → **30/30, 0 cached** (re-confirms the rebase didn't silently
break another workspace). `pnpm --filter @patina/designer-portal lint` → **202 problems (2 errors,
200 warnings)** — identical to the pre-fix and pre-rebase baseline; no lint regression.

---

## 4. New breakage in the fix diff — none found

I checked specifically for regressions the fix round itself could have introduced:

- **Barrel file** (`packages/supabase/src/hooks/index.ts`): not touched by this diff at all (only
  the rebase touched it, and cleanly — see §1). No risk here.
- **Other `useClientRoomScans` / `DiscoverySection` consumers**: grepped both `apps/` and `packages/`
  — the only non-test consumer of `useClientRoomScans` is `discovery-section.tsx`, and the only
  consumer of `<DiscoverySection>` is `page.tsx`. No other surface silently inherits the signature
  change.
- **`useClientScans` (letterhead, module-private)**: single internal consumer
  (`LetterheadInstruments`, same file), already updated in the same diff.
- **Type safety**: `type-check --force` is clean across all 30 workspaces, so the widened/renamed
  hook signatures did not silently produce an `any`-typed call site elsewhere.
- **Behavioral regression risk in the new project-scoping**: none identified. Scoping the designer
  leg to `project_id` only *narrows* what could previously appear (the P1 bug was over-broad
  exposure); it cannot cause a previously-safe case to now leak, because the new filter is
  additive (`AND project_id = X`) on top of the pre-existing `user_id`/`status` filters, never a
  replacement of an existing safety check.
- **Test-mock realism**: the `letterhead-scan-union.test.tsx` mock's `eq()` recorder allocates fresh
  `userId`/`readyOnly`/`projectId` locals per `from()` call (i.e., per query builder instance), so
  the client leg and designer leg genuinely cannot bleed filters into each other inside the test —
  the mutation-proof claims in the ledger (delete the `project_id` filter line → 2 new cases fail) are
  plausible on inspection, and I confirmed the tests currently pass with the real filter present.

No severity/confidence-worthy new finding surfaced in this diff.

---

## 5. Convention/hygiene spot-check on the fix diff

- Commit message (`fix(portal): scope designer scan legs to the project; resolve client scans by
  profile uid (w1p merge review)`) is Conventional Commits, single logical change, matches AGENTS.md.
- No `.env`, no secrets, no lockfile, no `package.json` touched.
- No `git add -A` artifact risk observable from the diff — all 7 files are exactly the ones the
  ledger's three rulings name.

---

## 6. Still open — not blocking merge

Carried forward from the original review, unchanged by this fix round (confirmed by re-checking, not
assumed):

- **`room-file` flag flip for the pilot cohort** and **the FC-R10 browser walk** (review items 4–5)
  remain outstanding. Both are explicitly "Blocking — do at or before deploy" in the original review,
  not "before merging" — they require a running environment / PostHog access this lane does not have,
  and the ledger does not claim otherwise.
- **C1** (the two untracked Field Companion spec files, `field-companion-plan.md` and
  `field-companion-rulings.md`) are still untracked in the worktree (`git status --porcelain` shows
  `??` for both) — non-blocking item #10 from the original review was not done in this round, and the
  ledger says so explicitly ("NOT DONE in this round").
- **Non-blocking items 6–9** (silent `errorSurface` on `useCaptureMediaUrls`, the `'|'`-joined query
  key, UTC timezone on the provenance chip, importing `RoomScanWithProvenance` instead of
  re-declaring it) are also explicitly not done in this round, per the ledger's own "NOT DONE" list.
  None of these affect the merge decision; all were already scored low-severity in the original review.

None of the above changes the verdict — they were never in the "blocking — do before merging" bucket,
and this re-review's scope is the fix diff, which correctly closes everything that was in that bucket.

---

## Summary table

| # | finding | verdict | evidence |
|---|---|---|---|
| 1 | `--ff-only` impossible → rebase | **ADDRESSED** | `merge-base(main, HEAD) == main`; 19 commits = 18 original + 1 fix; barrel file merged cleanly; type-check 30/30 |
| 2 | letterhead designer leg unscoped (P1) | **ADDRESSED** | `letterhead-instruments.tsx:118-137`; scoped to `project_id`, gated on `designerId && projectId`; 2 new mutation-proof tests, verified passing |
| 3 | Discovery picker client leg dead (P2) | **ADDRESSED** | `use-room-scans.ts:219-270` resolves by profile uid directly; RLS claim (00020) independently verified, not superseded by 00287/00316; suite rewritten to match reachable prod states, verified passing |
| 4 | ledger admin row corrected | **ADDRESSED** (in gitignored ledger, not git diff) | `.superpowers/sdd/wave-1p-plan/progress.md:518-520`, matches review §6 exactly |
| 5 | escalations corrected | **ADDRESSED** (in gitignored ledger, not git diff) | `.superpowers/sdd/wave-1p-plan/progress.md:522-530`, matches review §10 exactly |

**New breakage in the fix diff:** none found (severity n/a).

**Verdict: MERGE.** Deploy-time items (flag flip, browser walk) remain owed per the original review's
own sequencing and should be done at/before the unflagged production deploy, not before the merge.
