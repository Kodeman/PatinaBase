# L3 — Door acts · adversarial review

Reviewer: fresh context, did not write the lane. Branch `client-page-2/l3` @ `301b62e2b`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3` (read-only).
Diff base `origin/main` (`26b15145e`). 10 files, +1034/−9.

## Gate output (run by the reviewer, verbatim tails)

`pnpm --dir …/apps/client-portal type-check`
```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l3/apps/client-portal
> tsc --noEmit
```
(no diagnostics; the workspace dists were already built in this worktree — no pre-build needed)

`pnpm --dir …/apps/client-portal test -- threshold making`
```
Test Suites: 32 passed, 32 total
Tests:       588 passed, 588 total
Snapshots:   0 total
Time:        7.271 s, estimated 11 s
Ran all test suites matching /threshold|making/i.
```

`npx eslint src/components/threshold` (from `apps/client-portal`) → `exit=0`, no output.

Both gates reproduce the lane's reported result exactly. Coverage thresholds were not run (out of
this lane's gate), and neither was any browser/e2e pass.

## Absorb list — act by act

| Old-route act (`/proposals/[id]`, inventory §85/§479) | Now | Verdict |
|---|---|---|
| **Decline** (`ProposalDeclineDialog` / `CommercialDeclineDialog`) | `door-acts.tsx:127-152`, both rails kept, branch on `kind` | works in place — see #1, #2, #6 |
| **Request a change** (`ProposalRequestChangeDialog`) | `door-acts.tsx:110-125`, same `{proposalId, feedback}` payload | works in place — see #6 |
| **Ask a question / clarify** (`ProposalClarifyButton`) | `door-acts.tsx:87-108`, same `rpc_start_project_thread`, then posts in place instead of navigating | works in place — see #7, #13 |
| **Read the instrument in full** (`CommercialDocumentShell`, page.tsx:254) | `instrument-reading.tsx`, same hook + same shell | works in place for non-legacy with a non-null bundle — see #3, #5 |
| Notification replay | already `door-gate.tsx:227` (pre-existing) | in place |
| Legacy read view (`ProposalDocument`, page.tsx:257-270) + per-line feedback loop (`feedbackEnabled`, page.tsx:136-138) | nowhere | not absorbed — see #5 |
| Download PDF (`window.print()`, page.tsx:172-179) | nowhere | not absorbed — see #20 |
| `/proposals` list — archived papers (declined/expired/superseded + "this edition was replaced" guidance) | nowhere | not absorbed — see #15 |

Payload/copy fidelity was diffed line-by-line against `src/app/proposals/[id]/page.tsx`,
`components/proposals/{ProposalDeclineDialog,ProposalRequestChangeDialog,ProposalClarifyButton}.tsx`
and `components/commercial-document-shell.tsx:639-732`. Every dialog title, description, field
label, placeholder, validation sentence, error fallback, the 1000-char caps and the `n / 1000`
counters match byte-for-byte, including the `’` in "What’s holding you back?". Payloads match:
`{proposalId, feedback}`, `{proposalId, reason: undefined}`, `mutateAsync(trimmed|undefined)`,
`mutateAsync(projectId)` → `{threadId, body}`. Only the confirm *loading* labels differ (#13).

Security: no path exposes another client's data. `get_client_commercial_document_bundle`
(00422:1912-1935) is SECURITY DEFINER and refuses unless `proposal.client_id = auth.uid()`;
`decline_proposal` / `request_proposal_change` are `authenticated`-only and authorize from
`auth.uid()`; the only `proposalId` reaching `InstrumentReading` is minted server-side by
`threshold.tsx:316`. The authorization concerns below (#1, #6) are about *which* guarded path is
taken and *when* an act is offered, not about the client reading someone else's paper.

Shared-file discipline is good: `door-gate.tsx` +9 lines / 2 hunks, `previously.tsx` 3 hunks all
inside one map body, `threshold.test.tsx` +8 lines beside the sibling `jest.mock` calls. No edits
to `threshold.tsx`, `mat.tsx` or `derive.ts`. Expect a merge conflict with L4 in
`previously.tsx` (L4 adds thread letters into the same entry loop) — flagged for integration, not a
defect here.

VISION §6: no shadow, no badge, no tab, no header, no route change; acts are `ScoredAction`
tertiary with `aria-expanded`/`aria-controls`, matching the mock's `.acts` / `si ter` idiom
(`path-b-the-threshold.html:86,405,606`). Error ink is `--color-error` (#C77B6E), the same ruling
`door-gate.tsx:497-501` already recorded. No red/green state colour, no "AI", third-person voice
throughout, the client's own words never quoted back at her. Money is untouched by this lane.

---

## Findings

1. **major · medium** · `apps/client-portal/src/components/threshold/door-acts.tsx:76` (with
   `door-gate.tsx:147-148`) — the decline rail is chosen from the `kind` prop, and the door resolves
   `kind` as `proposal.kind ?? bundle.data?.document?.kind ?? 'legacy'`. An **unresolved** kind
   therefore reads as legacy and declines through `useDeclineProposal` → `decline_proposal`
   directly, skipping `POST /api/proposals/[id]/decline`, whose whole purpose is to resolve the kind
   fail-closed before declining (route comment, `decline/route.ts:20-41`). Latent today only because
   `threshold.tsx:293-307` always sets `kind`; `DoorProposal.kind` is optional and the bundle can
   error. *Fix:* treat only a positively-resolved `'legacy'` as legacy — pass the resolved kind as
   `CommercialDocumentKind | null` and hold the Decline act while it is null.

2. **major · high** · `door-acts.tsx:216` / `door-gate.tsx:518` — after the decline stamps in place,
   the signature block on the same leaf stays fully armed: `DoorActs` keeps `declinedAt` in local
   state and `DoorGate` is never told (it does not pass the `onDeclined` prop it is offered), so the
   page still says "it opens on your name" and offers Sign on a paper the client just declined,
   until the `['proposals']` refetch unmounts the door. That is exactly the "copy that later
   reverses" the global constraints forbid. *Fix:* pass `onDeclined` from `DoorGate` and disarm the
   consent/name/sign block (and its hint) on that signal.

3. **major · medium** · `door-acts.tsx:180` and `previously.tsx:133-137` — "Read it in full" is
   offered for every non-legacy paper, but `instrument-reading.tsx:52` returns `null` when the
   bundle read resolves to `null`. The act then unfolds into an empty region with
   `aria-expanded="true"` and nothing revealed — an offer that leads nowhere, and in Previously
   every instrument line is now a control whether or not it has anything behind it. *Fix:* in the
   null case print the door's own refusal sentence (or don't offer/foldable-ise the line until the
   bundle has data).

4. **major · medium** · `door-acts.tsx:233` and `door-acts.tsx:352` — focus is dropped whenever a
   panel closes. "Never mind", and every successful send/decline, unmount the focused button and
   nothing returns focus to the act that opened the panel, so a keyboard or screen-reader user lands
   on `<body>`. `ScoredAction` carries `restoreFocusRef` for precisely this and it is unused.
   *Fix:* hold a ref on the acts row's toggling button and pass it as `restoreFocusRef` on the
   panel's confirm and dismiss acts.

5. **major · medium** · absorb gap — the old route's **legacy** read view (`ProposalDocument` with
   sections, payment milestones, phases, exclusions, scope rooms and resolved boards,
   `page.tsx:257-270`) and the C3 per-line verdict loop (`feedbackEnabled`, `page.tsx:136-138`) have
   no home after `/proposals/[id]` dies. The lane omits the reading for legacy entirely and the
   report treats it as "unreachable from the Threshold today", but `threshold.tsx:294/315` drops
   legacy from *both* the doors and Previously, so a legacy proposal becomes invisible to the client
   the moment the route is retired. *Fix:* record the ruling explicitly in the retirement plan
   (legacy papers and per-line feedback are retired, not absorbed) or absorb the legacy reader.

6. **major · medium** · `door-acts.tsx:127-133` (offer) vs `page.tsx:124-133` (old gate) — the old
   page gated *every* act on `isActionable = state === 'sent' && !isPassedExpiry`, treating a passed
   `valid_until` as expired even before the expiry cron ran. The Threshold's doors apply no expiry
   gate, and neither `decline_proposal` nor `request_proposal_change` checks `valid_until` (only
   `sign_proposal` does, 00210:107). So ask / request-a-change / decline now succeed on a paper the
   old surface refused to act on at all. *Fix:* carry `validUntil` onto `DoorProposal` and withhold
   the acts (as the old page did) once it has passed.

7. **minor · high** · `door-acts.tsx:89-97` — `onAsk` validates the empty question *before* it
   checks `projectId`, so a client whose paper is filed under no project is invited to open the
   panel, type a question, press Send, and only then told "This paper is not filed under a project,
   so there is no thread to ask in." An act that cannot complete should not be offered. *Fix:* drop
   `'question'` from the acts array when `projectId` is null.

8. **minor · medium** · `door-acts.tsx:87,110,127` — no in-flight latch. Two clicks landing in the
   same tick both read `isPending === false` (state is render-time), so a double click sends two
   questions, two change notes, or fires two decline calls. `DoorGate` solved this exact hole with
   an `inFlight` ref and left a comment saying the shipped route still has it (`door-gate.tsx:131-133`).
   *Fix:* mirror the `useRef` latch in each of the three handlers.

9. **minor · medium** · `door-acts.tsx:82-85` — `toggle()` clears `error` but not `receipt`, so
   "Your question was sent." keeps standing above the Decline panel the client opens next; the
   receipt only disappears once a decline stamps. *Fix:* `setReceipt(null)` in `toggle()`.

10. **minor · medium** · `previously.tsx:133-146` — for an instrument entry the unfold now renders
    the reading *instead of* the full label. An instrument label is `${kindLabel} · ${title}`
    (`threshold.tsx:314`) and can exceed the 58-char `ONE_LINE` cut, so a truncated instrument line's
    own words become unreachable — the one thing the unfold used to be for. *Fix:* print the full
    label above the reading when `isTruncated(entry.label)`.

11. **minor · medium** · `door-acts.tsx:203-210` — the declined stamp is a plain `<p>`; the
    receipt line four lines below carries `role="status"`. The single confirmation that a decline
    landed is therefore never announced. *Fix:* add `role="status"` to the stamp.

12. **minor · medium** · tests, `__tests__/door-acts.test.tsx` — behaviour-shaped and the mocks match
    the `making/__tests__` idiom (module-path mocks, `jest.fn()` factories, `resetMocks` re-armed in
    `beforeEach`), but six reachable behaviours have no case: "Never mind" closing a panel; the
    pending/disabled state and its loading label; the stale receipt (#9); the ask panel's new
    description copy; the null-bundle dead read (#3); and an instrument entry whose id does *not*
    match `instrument:<id>` falling back to the label unfold — a behaviour the report explicitly
    claims. *Fix:* add those cases, the last one in `previously.test.tsx`.

13. **minor · medium** · `door-acts.tsx:99-101,117-119` — the question is posted into the project
    thread as a bare body with no reference to the paper it is about. The old flow put the client
    *in* the thread holding the proposal, so she supplied the context herself; the studio now
    receives "Can the sconces come in an aged brass?" with no instrument named, and on a page with
    two open doors nothing distinguishes them. *Fix:* name the document in the letter (a prefixed
    line, or a `decisionId`-style reference) — worth a copy ruling before merging with L4.

14. **minor · low** · `door-acts.tsx:47` — `onDeclined` is declared on `DoorActsProps` and called at
    line 145, but no caller passes it (see #2). Dead surface until `DoorGate` uses it.

15. **minor · low** · absorb gap — archived papers (`partitionProposals.archived`: declined,
    expired, superseded, plus the old page's "This edition was replaced… Open the current edition"
    guidance, `page.tsx:229-252`) have no home on the Threshold: doors take only `sent`, Previously
    only `accepted`. Once `/proposals` is retired a declined or superseded paper vanishes from the
    client's house entirely. Arguably the plan's business more than this lane's, but L3 owns
    `/proposals`. *Fix:* raise it as a plan-level ruling for integration.

16. **nit · high** · `door-acts.tsx:264,290,317` — the confirm loading labels drop the old dialogs'
    ellipsis ("Declining…" → "Declining", "Sending…" → "Sending"). House-consistent with
    `door-gate.tsx:477`'s "Signing", so probably right — but the report claims byte-copy, and this
    is the one place it is not. *Fix:* say so in the report's copy table.

17. **nit · medium** · `door-acts.tsx:340-349` — the decline confirm is `variant="secondary"` where
    the old dialog used a `destructive` button; `ScoredAction` has a `danger` variant that carries
    the weight without a colour. *Fix:* use `variant="danger"` for the decline confirm.

18. **nit · medium** · `door-acts.tsx:298` — the panel title is a `<p>`; the old `DialogTitle` gave
    it heading semantics, so a screen-reader user can no longer jump to the panel by heading.
    *Fix:* make it an `<h3>` styled as it is.

19. **nit · low** · `door-acts.tsx:188-190` — all four acts point `aria-controls` at the same
    `panelId`, so a collapsed act advertises a region holding another act's content. *Fix:* one
    panel id per act, or drop `aria-controls` from the acts that are not open.

20. **nit · low** · absorb gap — "Download PDF" (`window.print()`, `page.tsx:172-179`) is not
    absorbed and is not listed among the report's omissions. The inventory does not count it as an
    act (§85 lists decline / request change / clarify / replay), so this is very likely intentional.
    *Fix:* one line in the report saying print is retired for proposals (invoices keep theirs via L2).

21. **nit · low** · `previously.tsx:83` — `bodyId` for an instrument is now always
    `previously-body-instrument:<uuid>`; a colon in an id is legal HTML5 and fine for `aria-controls`,
    but any future `querySelector('#…')` on it needs escaping, and the rest of this component tree
    strips colons out of `useId()` for exactly that reason. *Fix:* `entry.id.replace(/:/g, '-')` in
    the id only.

---

VERDICT: MERGEABLE_WITH_FIXES — 21 findings (0 blockers, 6 major, 9 minor, 6 nit); fix #1, #2, #3,
#4 and #6 before integration, and get rulings on #5 and #15.
