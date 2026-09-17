# R2b — components, instruments, chrome

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-r2b`
- Branch: `client-page-2/r2b` (from `origin/client-page-2/integration` @ `98e36a9eb`)
- Head: `f1bfe7c0f` — pushed to `origin/client-page-2/r2b`
- Diff: **124 files changed, 186 insertions, 13,624 deletions** (76 deletions, 9 renames)

---

## 1. Instruments moved

`making/{scored-action, spine-gate, spine-toll, tracking-row, standing-sentence, making-spine}`
→ `components/threshold/instruments/`, with their three suites
(`making-spine.test.tsx`, `standing-sentence.test.ts`, `open-chapter.test.tsx`)
→ `components/threshold/instruments/__tests__/`. All moved with `git mv`, so the
renames are recorded as renames.

- 31 files rewrote their `@/components/making/<instrument>` specifier to
  `@/components/threshold/instruments/<instrument>`.
- `tracking-row.tsx`'s one relative import (`../commercial/journey-stepper`)
  became `@/components/commercial/journey-stepper` — the only content edit any
  instrument received.
- `standing-sentence.test.ts` is byte-identical apart from nothing: it was moved
  and not edited (`git show --stat` records it as a pure rename).

Grep proof: `grep -rn "components/making" src tests e2e` returns **one** line, and
it is not mine — see §7.

## 2. Deleted (76 files)

Every deletion was preceded by a resolver-accurate reverse-import map (a node
script that resolves `@/`, relative and index specifiers across `src`, `tests`
and `e2e`, including `jest.mock(...)` specifiers), not a substring grep — several
inventory "dead" rows turned out to have live threshold importers (§3).

**layout chrome (7)** — `client-header.tsx`, `mobile-nav-drawer.tsx`,
`nav-config.ts`, `project-switcher.tsx`, `threshold-chrome-gate.tsx`, and the
`client-header` / `threshold-chrome-gate` suites.

**The Making v1 (6)** — `the-making.tsx`, `making-masthead.tsx`,
`project-surface-switch.tsx` + their three suites. `making/` is gone.

**ProjectViewWrapper tree (19)** — `project-view-wrapper`, `project-overview`,
`project-scope-details`, `project-commercial-summary`, `project-invoices-summary`,
`budget-overview`, `ffe-status`, `project/{FFEPipelinePanel, ProjectActivityFeed,
ProjectDocumentsPanel, ProjectTeamPanel}`, `commercial/{awaiting-signature-cards,
client-plan-grid, client-selections}`, `timeline/enhanced-timeline` and the five
`__tests__` files that covered them.

**Whole directories (17)** — `today/` (3), `timeline/` (6 + 2 suites),
`approvals/` (3 + 2 suites), `decisions/` (2) + `decision-card-client.tsx`,
`messages/` (3), `notifications/` (2 + 1 suite), `proposals/` (3 dialogs).

**Already dead before this wave (3)** — `auth/QRLoginDisplay.tsx`,
`error-fallback.tsx`, `approvals/gate-stamp.tsx` (chained off
project-approval-review).

**Died with the routes R2a deletes (8)** — `account/ProfileForm.tsx` (`/account`
folds to `#mat`; the details sheet absorbed it), `project/ProjectReviewEdition.tsx`
+ suite (its page is now a `?review=` redirect shim that no longer imports it),
`scans/{RoomScanList, ClientRoomScanViewer, RoomScanShareStatus, ShareScanDialog,
ClientViewerToolbar}.tsx`, `commercial-notification-recovery.tsx` + suite.

`src/components/demo/` does not exist — the three demo pages are self-contained
under `src/app/demo/` (R2a's).

## 3. KEPT because a surviving importer was found

The inventory marks these dead-at-cutover; the completion wave's absorbs gave
them live threshold importers, so they stay:

| Kept | Surviving importer |
|---|---|
| `commercial/journey-stepper.tsx` (+ suite) | `threshold/{room-band, the-road, road-orders}`, `lib/threshold/{derive, road-orders}` |
| `commercial-document-shell.tsx` (+ suite) | `threshold/instrument-reading.tsx` |
| `reviews/{ReviewsIndex, PastReviewCard, SubmitReviewDialog, StarRatingInput}` (+ suite) | `threshold/review-ask.tsx` |
| `scans/{ViewerErrorBoundary, ClientViewerCanvas, ClientViewerLoadingOverlay, scene/RoomModel, scene/SceneSetup}` | `threshold/room-capture.tsx` |
| `account/AvatarUploadField.tsx` | `threshold/details-sheet.tsx` |
| `projects/ProjectsEmptyState.tsx` | `src/app/page.tsx` (the front door's no-house state) |
| `query-failure.tsx` | `reviews/ReviewsIndex.tsx`, `app/invoices/[id]/print` (a KEEP route) |
| `strata-mark.tsx` | `threshold/doorplate.tsx` |
| `proposal-document.tsx`, `board-block.tsx`, `proposal-line-feedback.tsx` (+ suites) | `app/share/[token]` — the public guest page |
| `help/help-state-setup.tsx` | `app/providers.tsx` |
| `auth/*` (3), `layout/app-chrome.tsx` | auth routes / root layout |

## 4. Both pages render `<Threshold>` directly

`src/app/page.tsx` and `src/app/projects/[projectId]/page.tsx` — import line +
element name only, no other change (the one edit outside this lane's dirs the
brief authorised).

`ProjectSurfaceSwitch` carried two things besides the render; both moved into
`Threshold` itself rather than being dropped:

- the caller-global `useMyProjectApprovalReviews()` read, filtered to this house
  (the props `projectApprovals` / `projectApprovalsLoading` /
  `projectApprovalsError` are gone; `viewSource` replaces them);
- the `client_project_view` emitter, now a mount effect keyed on `projectId`,
  so the event still fires **exactly once per project** and still carries
  `source` (`front-door` vs `named`).

`threshold.test.tsx` was adapted: `useMyProjectApprovalReviews` joins the
`@patina/supabase` mock factory with a `{ data: [], isLoading: false,
isError: false }` default, and `renderWithApprovals` sets the mock instead of
passing props. Every existing assertion is unchanged.

## 5. AppChrome

No header, no drawer, no switcher, no approvals/unread counting — the house
carries its own doorplate, details sheet, way out and other houses. What remains
is the public/authenticated split (the portal's record of which routes a visitor
reaches with no session), expressed as `data-portal-shell` on a
`display: contents` wrapper so it costs the page no box. `projects` stays in the
props (optional, unread) so the root layout keeps type-checking — **R2a should
drop `fetchClientProjects()` from `src/app/layout.tsx` and the prop with it.**
`app-chrome.test.tsx` rewritten to that contract (11 cases).

## 6. INK RULING (Kody, 2026-09-04)

`grep -rn -- "--color-error|text-red|bg-red|border-red|text-green|bg-green|
--color-success|--color-danger|emerald|rose-N|red-N|green-N" src/components`
found **17 hits, all `var(--color-error)`, all inside `components/threshold/**`**
(no Tailwind red/green anywhere in the portal's components). One was a test
assertion; the other 16 were refusal/failure notices in
`instrument-reading, scope-change-ask ×3, door-acts, correspondence
(REFUSAL_CLASS), details-sheet ×3, wall-gate, door-gate, review-ask,
approval-ask ×4`.

All 16 now read `border-t border-[var(--border-subtle)] pt-2 …
text-[var(--text-body)]` — body ink under a hairline, matching the treatment
`threshold.tsx` already used for its own failed-read notice. **Every sentence is
unchanged**; only the ink and the rule moved. Post-change grep for red/green ink
across `src/components`: none.

## 7. Config

- `wrangler.jsonc`: `NEXT_PUBLIC_FLAG_OVERRIDES: "threshold:false"` and its
  comment block deleted. Nothing else in the file touched.
- `playwright.config.ts`: **already collapsed** on the integration branch — one
  `webServer`, one `chromium` project, no `:3102`, no `.next-threshold`, no flag
  env. No edit needed.
- `next.config.js`: **already free** of `NEXT_DIST_DIR` / `distDir`. No edit
  needed.

## 8. consent-copy drift guard

`threshold/__tests__/consent-copy.test.ts` read three files off disk; two of them
retire (`app/proposals/[id]/sign/page.tsx`, R2a's; and
`commercial/awaiting-signature-cards.tsx`, this lane's). The guard now asserts
only against the source that survives — `app/api/proposals/[id]/sign/route.ts`'s
refusal tokens, which the door still posts to — and the guard-only exports
`CONSENT_LINES`, `SIGN_LABELS`, `SUMMARY_FRAGMENTS` are deleted from
`consent-copy.ts` (nothing else imported them). `SIGNATURE_NOTICE`, `KIND_LABEL`,
`REFUSAL_TOKENS` and every `*For()` branch stay, pinned by the untouched
"branch structure mirrors the route" and "refusalSentence" describes.

---

## Gates

| Gate | Result |
|---|---|
| `pnpm --dir <wt>/apps/client-portal type-check` | **clean** with R2a's six route trees stubbed out (`src/app/{account,decisions,messages,proposals,scans,today}` moved aside, tsc exits 0, then restored). Unstubbed: 16 errors, all `TS2307` in those same six trees — see below. |
| `npx jest src/components` (threshold, instruments, layout and everything else) | **46 suites / 747 tests passed, 0 failed** |
| `npx jest src/components/threshold src/components/layout` | **37 suites / 680 tests passed** |
| `npx eslint src/components` | **2 errors, both pre-existing** — `auth/ClientPortalLogin.tsx:120 react-hooks/set-state-in-effect` and `proposal-document.tsx:109 react-hooks/preserve-manual-memoization`. `git diff --name-only HEAD` confirms this lane modified neither file; both rules are file-local. **0 errors introduced.** |
| grep: `useFeatureFlag('threshold'\|'single-pane')` | none — the only `useFeatureFlag` in the tree is its own definition in `hooks/use-feature-flag.ts` |
| grep: `threshold:false` | none anywhere (`src`, `tests`, `e2e`, `wrangler.jsonc`, `next.config.js`, `playwright.config.ts`, `public/`) |
| grep: `@/components/making/` | one line, R2a's — see hand-offs |

### The 16 remaining type errors (all R2a's)

```
src/app/account/page.tsx            → @/components/account/ProfileForm
src/app/decisions/[id]/page.tsx     → decision-card-client, approvals/project-approval-review
src/app/decisions/page.tsx          → decision-card-client, approvals/project-approval-summary
src/app/messages/page.tsx           → messages/{ReadReceipt,ThreadSettingsMenu,MessageAttachmentUploader}
src/app/proposals/[id]/page.tsx     → proposals/{Decline,RequestChange,Clarify}, commercial-notification-recovery
src/app/scans/[scanId]/page.tsx     → scans/{ClientRoomScanViewer,RoomScanShareStatus}
src/app/scans/page.tsx              → scans/RoomScanList
src/app/today/page.tsx              → today/TodayPage
```

Each names a page R2a deletes. Neither lane type-checks alone; the pair does.

## Hand-offs to R2a (files this lane may not touch)

1. **`src/app/__tests__/page.test.tsx:26`** still calls
   `jest.mock('@/components/making/project-surface-switch', …)` and asserts the
   props handed to that component. The module is gone; the mock will throw
   "Cannot find module". Retarget it at `@/components/threshold/threshold` — the
   props are identical (`projectId`, `project`, `milestones`, `otherHouses`,
   `viewSource`).
2. **`src/app/layout.tsx`** — `AppChrome` no longer reads `projects`. Drop the
   `await fetchClientProjects().catch(() => [])` and the prop.
3. The six route trees above must land in the same integration step as this
   branch.
4. Prose-only stale references (not blockers): `hooks/use-commercial-client.ts:115`
   and `lib/analytics/events.ts:92` still name the `single-pane` flag in comments;
   `apps/designer-portal/src/components/document/client-note-composer.tsx:19`
   cites `client-portal/src/components/making/the-making.tsx:561-567`, a file that
   no longer exists.

## Note

`git commit` reported Prettier formatting drift on 47 staged files (advisory,
non-blocking locally). It is pre-existing: the list includes files where this
lane changed a single import line.
