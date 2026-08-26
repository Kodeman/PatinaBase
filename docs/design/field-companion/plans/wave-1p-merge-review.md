# Wave 1P — merge-readiness review

**Branch** `feat/field-companion-w1p` @ `566bfe9c0` · **merge-base** `a72d59f32` · 18 commits, 35 files
**Reviewer** independent context, read-only (no edits, no git mutations outside this file)
**Date** 2026-08-24
**Scope** merge to `main` + unflagged production deploy of the designer portal

---

## Verdict

> ### MERGE-WITH-FIXES

The engineering is unusually disciplined. Every new test exercises real code, every ruling I checked
is implemented as stated, the four gates reproduce **exactly** as claimed, and the ledger is the most
self-critical I have read on this repo — it caught three vacuous-test recurrences and a false central
claim in its own final review, and said so in writing.

Two things stop it being a clean MERGE:

1. **The merge cannot be a fast-forward, and the gates were measured 19 commits behind `main`.**
2. **The FC-R10 posture — "a project with no field data renders exactly as before" — is false on
   production for two of the five surfaces**, and neither case is escalated anywhere. I proved both
   against live Strata data, not against the tests.

Neither is a correctness bug in the code. Both are *decisions Kody has not been given a chance to
make*, on an unflagged deploy where the ruling text says the no-flag posture rests on exactly this
property.

Required fixes are in [§8](#8-required-fixes). Deploy note in [§9](#9-deploy-note).

---

## 1. Merge mechanics — read this first

### M1 · A fast-forward merge is impossible · **severity high · confidence certain**

`main` is **19 commits ahead** of this branch's merge-base.

```
git merge-base main 566bfe9c0      -> a72d59f326064feef159148ef9ee174434222156
git rev-list --count 566bfe9c0..main -> 19
```

`a72d59f32` is the head of `merge/splat-quality-union`, which *is* an ancestor of `main`
(`git merge-base --is-ancestor` → true), so the branch is mergeable — but `--ff-only` will refuse.

The 19 commits are not inert. They include:

| commit | why it matters here |
|---|---|
| `33069e3e8` | `test(designer-portal): pin jest timezone so date assertions are deterministic in CI` |
| `1e6ef5ba1`, `e0f5791c3` | CI turbo routing for portal type-check/build (`verify-affected`) |
| `db2128934` + lane | capture-producer-idempotency: new `@patina/supabase` hook, `database.types.ts` regen, designer-portal `product-picker-modal`, migration 00516 |
| `f2d1ce954` | `fix(designer-portal): restore AddFromUrl draft+vendor behind a rollout flag` |

**Every number in [§6](#6-baseline-claims--re-measured) was measured on the branch *without* those 19
commits.** They must be re-measured after the rebase/merge before anything is deployed.

**Conflict surface is small.** Exactly one file is touched by both sides:

```
comm -12 <(git diff --name-only a72d59f32..main) <(git diff --name-only a72d59f32...566bfe9c0)
  -> packages/supabase/src/hooks/index.ts
```

Both append barrel exports; `main` adds `useCommitProposalCapture`, this branch appends
`useCaptureMediaUrls` / `useCaptureVenueLabels` at the tail (`index.ts:1853-1859`) plus one line at
`:615`. Expect a trivial tail conflict or none.

I checked the four new tests for timezone sensitivity against `33069e3e8`: `fieldProvenanceLabel`
asserts on `2026-03-14` (safe at any offset), the Discovery label uses `created_at.slice(0,10)` (a
string slice, TZ-independent), and the rest assert no dates. No new test should break on the pin.

### M2 · The push escalation is stale — the branch **is** pushed · **severity low · confidence high**

The conductor's report escalates "PUSH BLOCKED … origin/feat/field-companion-w1p is at 53cc51394,
three commits unpushed". That is no longer true:

```
git reflog show refs/remotes/origin/feat/field-companion-w1p
  566bfe9c0 ...@{0}: update by push     <- the head, pushed
  53cc51394 ...@{1}: update by push
```

Git only advances a remote-tracking ref on a *successful* push. The whole branch, Task 7 included,
reached `origin`.

The **underlying proxy failure is still live**, though — right now:

```
git ls-remote --heads origin feat/field-companion-w1p
  Received disconnect from UNKNOWN port 65535:1: This proxy requires authentication...
```

So the *branch* is safe, but **pushing `main` after the merge will fail from this environment** until
the proxy is sorted. Plan for that; do not discover it mid-merge.

---

## 2. Prod safety of the unflagged surfaces (FC-R10)

FC-R10 (rulings:41) makes *"renders nothing on a field-less project"* a **browser-verified acceptance
criterion**. I verified it from code and from live Strata, per surface.

### P1 · The letterhead gains a "Your scan" door on 13 of 20 existing prod documents · **severity medium-high · confidence high**

`letterhead-instruments.tsx:120-135` adds a designer leg to `useClientScans`, and `:277-281` picks the
door's target:

```ts
const withImage = (scans ?? []).filter((s) => s.image_url);
return withImage.find((s) => s.owner_kind === 'client') ?? withImage[0] ?? null;
```

Ruling 4-B is honoured — the client's scan still wins. But when the client has **no** scan with a
cover photo, `withImage[0]` now resolves to *the designer's own most recent ready scan*, and a
`Your scan` action (`:341`) appears where **no action existed before**.

Designer-owned `room_scans` are ordinary scans. They are **not field data**. So this fires on projects
with no Field build anywhere near them. Measured on prod:

| fact (Strata, `74056c2a-…` = kody@kochaver.com) | count |
|---|---|
| her ready scans carrying at least one image | **5** |
| her projects with a client | 20 |
| …that show "The scan" today (client scan exists) — unchanged | 7 |
| …that will gain a **new** "Your scan" door | **13** |

Worse, the designer leg is **unscoped**: `.eq('user_id', designerId).eq('status','ready').limit(5)` —
no `project_id`, no relation to the document being read. On document *C* the door can open a scan
taken in client *B*'s house.

The comment shipped at `page.tsx:1361-1365` says the mount is safe because a field-less project
"renders exactly as it did before this line existed". That is true of `RoomFilesSection` and **only**
of `RoomFilesSection`. The plan and the ledger repeat the claim wave-wide.

FC-R10's own text did anticipate the union and asked that provenance stay visible — which the code
does ("yours" vs "The scan"). What it did **not** rule is the *scoping*. That is the open decision.

### P2 · The Discovery scan picker flips from permanently-empty to "her scans only" · **severity medium · confidence high**

`useClientRoomScans(clientId)` resolves the client through
`from('designer_clients').select('client_id').eq('id', clientId)` (`use-room-scans.ts:220-222`) — i.e.
it expects a **`designer_clients.id`**.

Its one non-test consumer passes an **auth user id**:

```
discovery-section.tsx:146   useClientRoomScans(clientProfileId ?? '')
page.tsx:1268               clientProfileId={row.client_profile_id}
00191/00192                 client_profile_id := projects.client_id | proposals.client_id | leads.homeowner_id
```

On prod those two are never the same value:

```sql
projects with a client                                  20
…whose client_id matches a designer_clients.id           0     <- the lookup can never hit
…whose client_id matches an auth.users.id               20
designer_clients rows where id = client_id               0
```

**Consequences.** Before this branch: `if (!designerClient) return []` → the picker was **always
empty on production**. After it: `clientUserId` is null, the client leg returns nothing, and the
designer leg returns her own ready scans — so `hasOwnScan` is always true and **every option carries
"· yours"**. The `"· from your client"` branch is dead code in the field.

This is a pre-existing latent bug (not introduced here) that this wave converts from *invisible* into
*a populated, unflagged picker*. It also means the new suite's flagship FC-R10 case — *"leaves a
client-only picker byte-identical to before the wave"* — pins a state production cannot reach.

Note `discovery-section.tsx:135` documents `engagementId` as *"the designer_clients.id (Shape D)"* —
the argument the hook actually wants. But `00192:23` shows `engagement_id` is the **project** id on a
project document, so no single existing prop is correct across all four document shapes. This needs a
ruling, not a one-word patch.

### P3 · `RoomFilesSection` mount — genuinely safe · **severity none · confidence high**

Verified from the code, not the tests:

- `room-files-section.tsx:37` — `if (!isReal || !scans || !byScan) return null;`
- `:40` — `if (rows.length === 0) return null;`
- Both are bare `return null` with **zero** wrapper markup, so no empty chrome, no stray spacing.
- Loading and error both present as `data === undefined` → the same null path (React Query does not
  throw without `throwOnError`/suspense; neither is set — `lib/react-query.ts` sets no such default).
- `useProjectRoomScans` is **project-scoped** (`use-room-scans.ts:449-454`: `.eq('project_id', …)`,
  `.eq('status','ready')`), so it cannot pull another project's rows.
- `useGeneratedRoomFilesByScan` is `enabled: ids.length > 0` (`use-room-files.ts:307`) — a
  scan-less project issues **one** extra request, not two.
- The mount sits inside `spreadSection === 'project' && row.project_id` (`page.tsx:1340`), so it never
  renders on lead / proposal / relationship documents.
- Only **one** `RoomFilesSection` exists in `page.tsx`; the install and care `FFESection` mounts are untouched.

On prod exactly **one** project (`b8b20d16-29d1-460b-b42a-37e085d2d96d`) has a ready scan with a
generated Room File, so exactly one document gains a one-row "Room Files" block.

### P4 · That one visible row leads to a fail-closed page · **severity medium · confidence high**

`room-files-section.tsx` links each row to `/room/<scanId>/file`, and `room-file-view.tsx:63` is
`useFeatureFlag("room-file")`, fail-closed. Flag-off the destination is a styled *"Room File isn't
available yet."* page — not a 404, not a crash. Correctly escalated (E4). It is a **payoff** problem,
not a safety one, and today it costs exactly one project.

### P5 · New queries can raise the global destructive toast · **severity low · confidence medium**

`lib/react-query.ts`'s `QueryCache.onError` shows `showErrorToast` for **any** query error that is not
auth-shaped and not a network error, unless the query declares `meta: { errorSurface: 'silent' }`.

None of the new/newly-mounted queries declare it: `useCaptureMediaUrls`, `useCaptureVenueLabels`
(cannot throw — see S4), `useProjectRoomScans`, `useGeneratedRoomFilesByScan`.

Tempering this: only **one** hook in the whole package opts out today (`use-clients.ts:226`), so this
is the house norm, not a regression. And Supabase Storage returns RLS denials as *per-entry* errors,
which `use-capture-media.ts:74-79` swallows correctly. The mismatch is narrower: the hook's own
docstring promises *"an honest 'no image' rather than a 400"*, which holds for entry-level failures
but not for a whole-request failure, where `if (error) throw error` (`:70`) reaches the red toast.

Cheap, optional hardening: add `meta: { errorSurface: 'silent' }` to `useCaptureMediaUrls`.

### P6 · No new environment variables, no shared-component blast radius · **severity none · confidence high**

- No `.env*`, no `wrangler.jsonc`, no `next.config`, no `package.json`, no lockfile in the diff.
- No new `process.env` reference anywhere in the branch.
- The only shared-component edits are `library-card.tsx` (three **optional** fields on `LibraryItem`,
  one conditional `<div>`) and `library-shelf.tsx` (three pass-through fields). Both are additive;
  every existing caller compiles and renders unchanged.
- `packages/supabase` edits are additive: two new hook modules, three optional fields on
  `LayerProductRow`, one optional field on `DamageClaim['inspection']`, a widened return type on
  `useClientRoomScans`. `apps/admin-portal` and `apps/client-portal` import **none** of the eight
  affected hooks (grep across both `src` trees returns nothing).

### P7 · The provenance chip's month can be off by one · **severity low · confidence medium**

`library-card.tsx:475-487` formats a UTC `captured_at` with `toLocaleDateString('en-US', …)` in the
**viewer's** zone. A capture at `2026-03-01T02:00:00Z` reads "Feb 2026" in US/Pacific. Zero rows
affected today (0 products on prod carry `capture_source='field_capture'`). Fix is one option:
`{ month:'short', year:'numeric', timeZone:'UTC' }`.

---

## 3. Signing + RLS

### S1 · `useCaptureMediaUrls` — clean · **confidence high**

| property | evidence | verdict |
|---|---|---|
| bucket | `CAPTURE_MEDIA_BUCKET = 'capture-media'` (`use-capture-media.ts:23`) | ✅ |
| bucket is private | prod `storage.buckets.public = false` | ✅ |
| RLS scope | prod has exactly four `capture-media` object policies, all owner-scoped (read/insert/update/delete), gating on the uid folder (00234) | ✅ per-designer, matches FC-R8 |
| TTL | `3600s` default, caller-overridable (`:26`) | ✅ |
| refresh margin | `staleTime = max(0, (ttl-60)*1000)` (`:87`) — floored, so a short TTL cannot go negative | ✅ |
| batching | one `createSignedUrls(wanted, ttl)` per distinct path set (`:91-94`) | ✅ |
| no service role | only `createBrowserClient` from `../client` (`:18`) | ✅ |
| no public URLs | `getPublicUrl` appears nowhere in the diff | ✅ |
| partial failure | entries with `error` or no `signedUrl` are **omitted**, never emitted broken (`:97-101`) | ✅ |

**Reachability note for the deploy:** the hook's *only* consumer is `CaptureContextSection`, which is
rendered *only* by `room-file-view.tsx:176,188` — behind the fail-closed `room-file` flag. **All of
Task 1 and Task 2 ship dark until that flag flips.**

### S2 · A co-member's silent failure — acceptable, but unpinned · **severity low · confidence medium**

Storage policies are per-uploader, so a studio co-member opening a colleague's Room File gets the
count placeholder (`1◻`) with no explanation. Fail-closed, consistent with FC-R8's per-designer
ruling, no leak. The ledger recorded it (F12); no test pins it. I agree it is acceptable for v1 — it
should be a named line in the wave-2 backlog rather than an unrecorded behaviour.

### S3 · Query-key delimiter collision · **severity low · confidence high**

`captureMediaUrlsKey` joins sorted paths with an unescaped `'|'` (`use-capture-media.ts:33-35`), so
`['a|b']` and `['a','b']` share a cache entry. Paths are machine-generated `<uid>/<captureId>/<artifact>`.
The ledger parked this; I concur it is not a merge blocker, but the fix is free — put the sorted
**array** in the key and let TanStack hash it deeply.

### S4 · The venue query — correct, and correctly isolated · **confidence high**

`use-capture-venues.ts:53` — `if (error) return {};` — the query **cannot throw into a render**, and
`library-shelf.tsx:57` never destructures `isError`/`isLoading`. So a `field_captures` failure costs
the chip its place name and nothing else. This is Ruling 5-A honoured properly, and it is the reason
the widened `useLayerProducts` select is safe to be an embed-free plain-column change.

`enabled: wanted.length > 0` means a shelf with no field-captured piece issues **no** extra request.

**RLS behaviour (confirmed on prod).** `field_captures` policies: owner
`designer_id = auth.uid()`, plus an org-inbox read restricted to `status='inbox'` (00233:159-175).
`commit_field_capture` sets `status='saved'` (00235). So a teammate viewing a piece promoted to the
Studio or Catalog shelf sees `Field · Mar 2026` and **never** the place name — permanently, not as a
loading state. That is consistent with FC-R8 and correctly flagged by the ledger as a product call
for Kody. I'd add: it is a *silent* asymmetry — two people looking at the same card see different
text with no indication why.

### S5 · Schema preconditions verified against **production**, not migrations · **confidence high**

Both new PostgREST select strings would 400 the whole query if any column were missing. I checked
Strata directly:

| object | prod |
|---|---|
| `products.capture_source` / `.captured_at` / `.field_capture_id` | all present |
| `field_captures` table + `.venue_label` | present |
| `receiving_inspections.photo_asset_ids` | present |
| `room_files`, `room_scans` tables | present |
| `products_field_capture_id_fkey` | present |
| FKs `damage_claims → receiving_inspections` | **exactly one** (`damage_claims_receiving_inspection_id_fkey`) → no PGRST201 ambiguity risk on the widened embed |

No migration is required by this branch, and none is included. ✅

---

## 4. Scan-union correctness

### U1 · The union cannot surface a third party's scans · **confidence high**

Both implementations read the designer leg as `.eq('user_id', <own uid from auth.getUser()>)`
(`use-room-scans.ts:232`, `letterhead-instruments.tsx:134`). A self-read is already permitted by
00014's *"Users can manage their room scans"* (prod-confirmed: `Users can manage their room scans
[ALL]`). The only other rows reachable are the client's, through the **pre-existing** client leg
(00020's *"Designers can view authorized room scans"*). There is no path by which another designer's
scan enters either list. ✅ matches FC-R8.

`auth.getUser()` failure degrades to `designerId = null` → the designer leg short-circuits to `[]`. No throw.

### U2 · "The door prefers the client's scan" — implemented as ruled · **confidence high**

`letterhead-instruments.tsx:278-280`, quoted in P1. Dedupe order is client-then-designer
(`:137-140`), so a self-scan reads as hers. Both properties are pinned by a suite that renders the
**real** component against a per-leg mock of the PostgREST builder
(`letterhead-scan-union.test.tsx:135-175`).

### U3 · Ruling 7-B — ready-only on the designer leg only · **confidence high**

`letterhead-instruments.tsx:120-135`: `readScansFor(clientProfileId, false)` /
`readScansFor(designerId, true)`. The client leg's pre-union behaviour is byte-for-byte (no status
filter), so no scan that showed yesterday disappears. The test asserts the filter *directly* —
`expect(readyFilteredUsers).toEqual(['designer-uid'])` — rather than inferring it from rendering.
That is the right shape of assertion.

### U4 · The two unions remain two implementations · **severity low · confidence high**

They now agree on provenance and on ready-only-for-the-designer, but still differ: `useClientRoomScans`
filters `status='ready'` on **both** legs and has no `limit`; `useClientScans` filters the designer leg
only and caps each side at 5. Deliberate (Ruling 7-B keeps the client leg frozen), but it is a lasting
divergence that the next person will have to re-derive.

### U5 · `owner_kind` is now an overloaded key · **severity low · confidence high**

Mood-board owns `'project'|'proposal'` on the same key name; this wave adds `'designer'|'client'`.
Disjoint vocabularies, one app. Ledger F10. Cosmetic today.

### U6 · The exported provenance types have no consumer · **severity low · confidence high**

`RoomScanOwnerKind` / `RoomScanWithProvenance` reach the public barrel (`index.ts:615`) with no
importer; `discovery-section.tsx:146-155` re-declares the shape inline as a structural cast, so the
two can drift silently. Same for `captureMediaUrlsKey` / `CAPTURE_MEDIA_BUCKET` /
`CAPTURE_MEDIA_TTL_SECONDS`. Ledger F9. Import the type at the cast site and this closes for free.

---

## 5. Test honesty

I audited all **nine** new test files line by line, plus the five edits to existing suites.

### T1 · No vacuous tests remain · **confidence high**

- **Six component suites render the real component tree** and mock only the data hooks:
  `room-files-section`, `capture-context-section`, `discovery-scan-options`,
  `library-shelf-provenance`, `receiving-photo-line-render`, `letterhead-scan-union`. None of them
  stubs the component under test.
- **Three hook suites** (`use-capture-media`, `use-capture-venues`, `use-client-room-scans-union`)
  mock only the two boundaries every sibling suite mocks — `@supabase/ssr` and `@tanstack/react-query`
  — and then **invoke the real `queryFn`**. Because the `useQuery` mock never auto-runs the function,
  `queryKey` / `enabled` / `staleTime` / the whole function body are all real code under test.
- **No snapshot-only tests.** The one snapshot in the designer suite is pre-existing.
- I found **no assertion that cannot fail**. The nearest thing is T4 below.

### T2 · The "renders NOTHING" tests exercise the real tree · **confidence high**

Five of them, and they are honest:

| test | file:line | what it renders |
|---|---|---|
| no Room File on any scan | `room-files-section.test.tsx:36` | real `RoomFilesSection`, `toBeEmptyDOMElement()` |
| no scans at all | `:43` | ditto |
| queries still in flight | `:49` | ditto (both hooks `undefined`) |
| non-UUID project id | `:54` | ditto — with data present, so the `isReal` guard is the only thing that can make it pass |
| no captures | `capture-context-section.test.tsx:112` | real `CaptureContextSection`, asserts the empty line |

The mocks replace `useProjectRoomScans` / `useGeneratedRoomFilesByScan` — the **data sources**, not
the guard. The component still mounts and evaluates `if (!isReal || !scans || !byScan) return null`.
Positive control present: the sixth case (`:61`) proves the same tree *does* render rows and a
`/room/scan-1/file` link, so an always-null component could not pass the file.

### T3 · The three admitted recurrences are genuinely closed · **confidence high**

The ledger records mutation proofs for 4b (remove the client preference → case 1 fails), 5b (delete
the three pass-through lines → cases 1 and 2 fail — with the implementer honestly correcting the
orchestrator's prediction of "1, 2 and 4"), 6b (remove the call from either site → that site's case
fails), and 7 (drop the `hasOwnScan` guard → 2 of 3 fail). I re-verified the two **select-string pins**
from finding F3 exist and are real:

- `use-layer-products.test.ts:106-115` — asserts the select contains all three new columns
- `use-procurement.test.ts:2925-2937` — asserts the damage-claims embed contains `photo_asset_ids`

Deleting a column from either PostgREST string now fails a test. That was the single most
silently-revertible thing in the branch, and it is closed.

### T4 · One near-vacuous addition · **severity low · confidence medium**

`letterhead-instruments-scan-door.test.tsx:103-108` asserts only that a **signed-out** read still
says "The scan" — a state where the designer leg cannot run at all. The union suite's fourth case
already covers it. Ledger F16, honestly recorded. Harmless, adds no coverage.

### T5 · One suite pins an unreachable state · **severity low · confidence high**

`discovery-scan-options.test.tsx:64` — *"leaves a client-only picker byte-identical to before the
wave (FC-R10)"* — is the wave's headline safety property, and per **P2** production can never enter
that state. The test is correct about the code; it is testing a branch the field never takes.

### T6 · The seven route-suite mock patches are not a false green · **confidence high**

Each adds `useProjectRoomScans: () => ({ data: [] })` and
`useGeneratedRoomFilesByScan: () => ({ data: new Map() })` to an already-closed `@patina/supabase`
mock. The shapes match the real hooks' returns, and `RoomFilesSection` still mounts and evaluates its
guard — it is not stubbed out. Necessary, minimal, correct.

---

## 6. Baseline claims — re-measured

Run by me, inside `.claude/worktrees/field-companion-w1p`, at `566bfe9c0`.

| gate | conductor claimed | **I measured** | |
|---|---|---|---|
| `pnpm turbo run type-check --force` | 30/30 | **30 successful, 30 total · 0 cached · 28.79s** | ✅ |
| `pnpm --filter @patina/designer-portal test` | 426 suites / 4484 tests | **Test Suites: 426 passed, 426 total · Tests: 4484 passed, 4484 total · Snapshots: 1 passed** | ✅ exact |
| `pnpm --filter @patina/supabase test` | 72 files pass, 868 pass, 12 skipped, same 2 pre-existing | **Test Files 2 failed \| 72 passed (74) · Tests 868 passed \| 12 skipped (880)** | ✅ exact |
| `pnpm --filter @patina/designer-portal lint` | 202 problems (2 errors, 200 warnings) | **✖ 202 problems (2 errors, 200 warnings)** | ✅ exact |

> ⚠ **`pnpm type-check` alone is a lie detector failure waiting to happen here** — my first run
> returned `Cached: 30 cached, 30 total >>> FULL TURBO` in 420ms, i.e. it re-served the conductor's
> own result. The number above is from `--force`, `0 cached`. Anyone re-running the gate after the
> rebase must use `--force` or clear `.turbo`.

**The two `@patina/supabase` failures are environmental and collect-time**, not assertion failures:

```
FAIL src/hooks/__tests__/use-ambient-qr-auth.test.ts
FAIL src/hooks/__tests__/use-portal-qr-auth.strict-mode.test.ts
Error: Incompatible React versions: react 19.2.4 / react-dom 19.2.8
```

The branch changes no `package.json` and no lockfile, so it cannot have caused this. ✅ as claimed.

### Admin / client red — **strong, but not the A/B the brief asked for** · confidence medium-high

| suite | conductor claimed | **I measured** |
|---|---|---|
| admin-portal `test` | "22 suites / 232 tests FAIL" | **26 failed / 35 passed (61 suites) · 204 failed / 509 passed (713 tests)** |
| client-portal `test` | "2 suites FAIL" | **2 failed / 104 passed (106) · 1 failed / 967 passed (968)** |

**The ledger's admin numbers do not reproduce** (22 vs 26 suites, 232 vs 204 tests). Not evidence of a
regression — just evidence that those two figures were not measured the way the row implies. Flagging
it because the whole "pre-existing" argument leans on that row.

**I could not run the merge-base suites.** The only worktree parked at `a72d59f32`
(`.claude/worktrees/agent-a04b455d404bc4159`, branch `merge/splat-quality-union`) has **no
`node_modules`** — `sh: jest: command not found` — and installing them would mutate another lane's
state. `git stash` is forbidden. **So the pre-existing claim below rests on construction, not on a
measured before/after. Saying so is part of the finding.**

What *is* proven:

1. `git diff a72d59f32...HEAD --name-only -- apps/admin-portal apps/client-portal` → **0 files**.
2. Neither app imports **any** of the eight hooks this wave adds or changes (grep for
   `useCaptureMediaUrls|useClientRoomScans|useLayerProducts|useCaptureVenueLabels|useDamageClaims|useReceivingInspections|useProjectRoomScans|useGeneratedRoomFilesByScan`
   across both `src` trees → nothing).
3. The failures are unrelated in character. Admin: `api-client`, `utils`, `sanitize`,
   `bulk-operations`, `catalog` services/hooks, `button`, `error-boundary`, `accessibility`,
   `media-uploader`, and a Playwright spec being picked up by jest. Client:
   `src/lib/data/__tests__/orders.test.ts` → `Cannot find module '../orders'` — a missing source
   module, nothing to do with this wave.
4. `pnpm --filter @patina/admin-portal build` — the **type-enforcing** gate for shared
   `@patina/supabase` edits — I re-ran it: **exit 0, full route manifest emitted**. A widened
   `LayerProductRow` / `DamageClaim` that broke admin's types would fail here, and does not.

That is convincing. It is not conclusive, and the honest phrasing is *"no mechanism by which this
branch could have caused them"*, not *"proven pre-existing"*.

---

## 7. Conventions and hygiene

| check | result |
|---|---|
| `@patina/supabase` hooks for all Supabase data | ✅ no ad-hoc `fetch`, no new proxy route, no new NestJS service |
| `@patina/types` | ✅ untouched; the two new types are DB-row-shaped and sit beside `RoomScan`, matching the existing pattern |
| design-system / `ui/controls` | ✅ the chip is a token-styled `div` matching the `sub` line directly above it in the same card; `RoomFilesSection` follows its file's existing inline-style idiom |
| Conventional Commits | ✅ all 18 (`feat:`/`fix:`/`test:`/`docs:`), single author `Kodeman <kody@middlewest.studio>` |
| no `git add -A` artifacts | ✅ 35 files, every one either in the plan's File Structure table or in the plan's own appended Tasks 4b/5b/6b/7 |
| no `.env`, no secrets | ✅ full-diff scan for `sb_secret\|service_role\|sbp_\|eyJhbGciOi\|sk_live\|sk_test\|whsec_\|password=\|api_key` → **zero hits** |
| scope outside the plan | ✅ every extra file has a ledger ruling; the plan doc itself carries Tasks 4b–7 |

**C1 · The committed plan cites files that exist on no branch · severity low · confidence high.**
`docs/design/field-companion/plans/wave-1p-plan.md` argues from `field-companion-plan.md` and
`field-companion-rulings.md`, both **untracked** in every checkout (`git ls-files
docs/design/field-companion/` returns only the new plan). Disclosed at plan line 14 and in the ledger.
The merge lands a document whose `Spec:` reference does not resolve. Whoever owns those files should
commit them in the same push.

**C2 · Cosmetic · severity low.** `use-capture-media.ts` uses single quotes where its sibling
`use-capture-venues.ts` uses double. No `quotes` rule is enabled anywhere that lints these files, so
it cannot fail a gate. `packages/supabase` has **no ESLint config at all** — `pnpm --filter
@patina/supabase lint` hard-fails with "couldn't find eslint.config.js". Pre-existing, per AGENTS.md.

---

## 8. Required fixes

**Blocking — do before merging:**

1. **Rebase onto `main` (or merge `main` in), then re-run all four gates with `--force`.** One
   expected conflict, `packages/supabase/src/hooks/index.ts` (tail append). Non-negotiable: `main`
   has moved 19 commits, including a jest timezone pin, CI turbo routing changes, and
   designer-portal + `@patina/supabase` edits from the capture-producer-idempotency lane.

2. **Rule on P1 before deploying unflagged.** Three options:
   - (a) accept it — 13 of 20 prod documents gain a "Your scan" door onto an unrelated room;
   - (b) **scope the designer leg to this project** (`.eq('project_id', projectId)`, or
     `project_id IS NULL OR = projectId`) so the door only ever offers a scan that belongs here — my
     recommendation;
   - (c) hold Task 4 behind `room-file` until wave 2.
   Whichever is chosen, **delete or correct the "renders exactly as it did before" comment at
   `page.tsx:1361-1365` and the matching claim in the plan** — it is only true of `RoomFilesSection`.

3. **Rule on P2.** Either pass an argument the hook can actually resolve (and accept that lighting the
   client leg for the first time is itself a visible change), or resolve the `designer_clients` row
   inside the hook from `(designer_id, client_id)`, or knowingly ship the "· yours"-only picker. Do
   not ship it *without knowing that is what it is*.

**Blocking — do at or before deploy:**

4. **Flip `room-file` for the pilot cohort** (FC-R10's own amendment; escalation E4). Otherwise the
   single project that gains a Room Files block leads to a fail-closed page.

5. **Do the browser walk.** FC-R10 makes "renders nothing on a field-less project" a *browser-verified*
   acceptance criterion (rulings:41), and P1/P2 are precisely what a walk would have caught. Walk both
   states: a project with field data (`b8b20d16-…`) and one without.

**Non-blocking, cheap, do them while you're in there:**

6. `meta: { errorSurface: 'silent' }` on `useCaptureMediaUrls` (P5).
7. Sorted **array** rather than a `'|'`-joined string in `captureMediaUrlsKey` (S3).
8. `timeZone: 'UTC'` in `fieldProvenanceLabel`'s date format (P7).
9. Import `RoomScanWithProvenance` at `discovery-section.tsx:146` instead of re-declaring it (U6).
10. Commit the two untracked Field Companion spec files alongside, so the plan's citations resolve (C1).

---

## 9. Deploy note

**A designer opening a project with no field data** — 19 of Kody's 20 client projects today — sees a
document that is *almost* unchanged. `RoomFilesSection` renders literally nothing: no heading, no
spacing, no empty state, at every stage of loading. The Library shelves look identical (no piece on
prod carries `capture_source='field_capture'`, so no chip renders anywhere). Receiving is identical
(no inspection on prod carries a photo id). The Room File thumbnails are unreachable — that whole
surface sits behind the still-closed `room-file` flag. What *does* change, on **13 of 20** of those
documents, is a new tertiary **"Your scan"** action in the letterhead, opening one of her own five
most recent scans — a room that may have nothing to do with the project she is reading. And if she
opens a Discovery spread, the scan picker — empty on production since it shipped — is suddenly a list
of her own scans, every one suffixed "· yours".

**A designer opening a project *with* field data** — exactly one on prod today,
`b8b20d16-29d1-460b-b42a-37e085d2d96d` — sees all of the above plus a "Room Files" heading above the
FF&E section, `1 room`, one row naming the scan with its date and sheet count, hover-revealing a door.
Clicking that door, **with `room-file` still off**, lands her on *"Room File isn't available yet."*
That is the whole payoff of the wave, and it is dark until the flag flips. Flip it in the same change
window or the one designer who can see the new block is the one designer it disappoints.

---

## 10. The five escalations, audited

| # | escalation | verdict |
|---|---|---|
| 1 | **push failure** | **STALE — now false.** `git reflog show refs/remotes/origin/feat/field-companion-w1p` → `566bfe9c0 … update by push`. The whole branch is on origin. The proxy failure is still live and will block pushing `main` after the merge — that is the real residual issue, and it is not the one that was escalated. |
| 2 | **receiving bytes need NestJS** | **CORRECT, independently verified.** `services/media/src/modules/media/media.service.ts:188-201` — `getDownloadUrl` returns `downloadUrl: asset.rawKey`, a bare storage key, alongside an `expiresAt` that signs nothing. Ruling 6-B holds; the task was not under-scoped. |
| 3 | **browser walk owed** | **CORRECT, and understated.** FC-R10 makes it an acceptance criterion, not a follow-up. See fix 5. |
| 4 | **`room-file` flag flip** | **CORRECT and correctly scoped** as sequencing rather than safety — flag-off is a designed page, not a dead link. Affects exactly one prod project today. |
| 5 | **audio consumer absent** | **CORRECT and honest.** `useCaptureMediaUrls` is path-generic and its test asserts an `.m4a`, but the sole consumer signs `primary_photo_path` only. §11.1's audio half is open, and the report says so rather than claiming the section closed. |

**Two escalations are missing.** Neither **P1** (13 existing documents gain a "Your scan" door onto an
unrelated room) nor **P2** (`useClientRoomScans` is called with an argument its own query can never
resolve, so the Discovery picker flips from empty to designer-only) appears in the report, the ledger,
or the plan. Both are visible, unflagged, prod-facing changes on projects with no field data — the
exact category FC-R10's no-flag posture depends on being empty.

---

## Appendix · Production facts used in this review

Read-only queries against Strata (`bkvcixdmuyejfzcijpdg`), 2026-08-24:

```
capture-media bucket public ......................... false
capture-media object policies ....................... 4, all owner-scoped (00234)
room_scans SELECT policies .......................... "Users can manage their room scans" [ALL],
                                                      "Designers can view authorized room scans" [SELECT],
                                                      "room_scans_studio_designer_read" [SELECT]
FKs damage_claims -> receiving_inspections .......... exactly 1
products with capture_source='field_capture' ........ 0
receiving_inspections with photo_asset_ids .......... 0
field_captures rows ................................. 8
room_scans (status='ready') ......................... 10
room_files (status='generated') ..................... 6
projects with a client .............................. 20
  ...client_id matching a designer_clients.id ....... 0
  ...client_id matching an auth.users.id ............ 20
kody ready scans / with images ...................... 6 / 5
kody projects showing a Room Files block ............ 1
kody client projects keeping "The scan" ............. 7
kody client projects gaining "Your scan" ............ 13
```

Commands re-run in the branch worktree: `pnpm turbo run type-check --force`,
`pnpm --filter @patina/designer-portal test`, `pnpm --filter @patina/supabase test`,
`pnpm --filter @patina/designer-portal lint`, `pnpm --filter @patina/admin-portal test`,
`pnpm --filter @patina/client-portal test`, `pnpm --filter @patina/admin-portal build`.
