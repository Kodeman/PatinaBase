# W2 designer lane — adversarial review, round 3

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer` (branch
`approvals/w2-designer`), `git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`.
Range: `main..HEAD`, eleven commits, 22 files, `1700 insertions(+), 14 deletions(-)`.

**Verdict: fix.** One major carries over unclosed (P-13's attribution renders on no real row) and
one is escalated from round 2 (an interior newline freezes into an immutable, client-facing
sentence). Everything else is minor or below. No refusal violation, no red gate this lane owns.

---

## Gates, run by the reviewer

Bare `cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer` first, each
command in its own call.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --filter @patina/designer-portal type-check` | **PASS** — `TC_EXIT=0`, `tsc --noEmit` silent |
| 2 | `pnpm --filter @patina/designer-portal lint` | **EXIT 1** — `✖ 205 problems (2 errors, 203 warnings)`; both errors pre-exist on `main` (proved below) |
| 3 | `pnpm --filter @patina/designer-portal test -- <7 suites>` | **PASS** — `Test Suites: 7 passed, 7 total · Tests: 179 passed, 179 total` |
| 3b | `pnpm --filter @patina/designer-portal test -- 'src/app/\(document\)/doc/\[id\]/page.test.tsx'` | **PASS** — `Test Suites: 1 passed · Tests: 101 passed`. (The parenthesised route group must be escaped or jest silently matches nothing — the eight-suite run in the lane log is 179 + 101 = 280, confirmed.) |
| 4 | `pnpm --filter @patina/supabase type-check` | **PASS** — `SB_TC_EXIT=0` |
| 5 | `pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `Test Files 1 passed (1) · Tests 19 passed (19)` |
| 6 | `pnpm --filter @patina/admin-portal build` | **PASS** — `BUILD_EXIT=0`, `✓ Compiled successfully in 22.8s` |

Lint's two errors:

```
280:  159:1  error  Definition for rule 'import/first' was not found  import/first
370:  930:8  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …
```

`git show main:…piece-room-save-gate.test.tsx | sed -n '157,160p'` prints the same
`// eslint-disable-next-line import/first`; `git show main:…use-commercial-documents.test.ts |
sed -n '928,932p'` prints the same `mutationFnOf`. Neither file is in
`git diff main...HEAD --name-only`. **Main is red too.**

---

## Prior-round findings, verified one by one

| id | state |
|---|---|
| F-01 attribution key no producer emits | **NOT FIXED — deferred in writing.** Carried as G-01 (major). |
| F-02 Record's Signed/Approved in sage | **FIXED**, with tests. `grep -c "color-sage" 'src/app/(document)/doc/[id]/page.tsx'` → `0`. |
| F-03 aria-live wraps the static helper | **NOT FIXED.** Carried as G-03. |
| F-04 no newline normalization | **NOT FIXED.** Carried as G-02, escalated to major. |
| F-05 false supersede comment + dropped `why` | **NOT FIXED.** Carried as G-04. |
| F-06 lane log's false zero-hit grep | **FIXED** — withdrawn in the log rather than edited out ("The zero claim is withdrawn"). |
| F-07 two SIGNED grammars | **NOT FIXED**, and it is three, not two. Carried as G-05, restated. |
| F-08 red lint, pre-existing | **CONFIRMED** and re-proved. Carried as G-07. |
| F-09 deploy-order exposure | **NOT CLOSED** (needs a line in the wave report). Carried as G-08. |
| F-10 rotation −1.1° vs the source doc's −2° | **UNCHANGED.** Carried as G-09, plus the aging step. |
| F-11 dead `useAuth` mock | **NOT FIXED**, and its comment is now doubly false. Carried as G-06. |
| F-12 `SIGNED_STAMP_INK` exported and hard-coded | **UNCHANGED.** Carried as G-10. |
| F-13 optional `why` / `whyAuthorName` on the interface | **UNCHANGED.** Carried as G-11. |
| F-14 mocha is the body-ink token | **UNCHANGED**, rendered check still owed. Carried as G-12. |

No regression was introduced by the fix pass. `doc/[id]/page.test.tsx`'s `use-section-work` mock
moved from `gateState: jest.fn()` / `data: []` to lane-controlled variables reset in the outer
`beforeEach` to exactly the old values; all 101 cases in that suite still pass.

---

## Brief compliance

**P-13 composer half — delivered.** First field on the form (`project-approval-document.tsx:756-782`),
above the `GateCeremony` fieldsets; label `What would you tell her about this?`; helper
`One line. She reads it under the question.`; `maxLength={WHY_MAX_LENGTH}` = 200; optional
(`expect(why).not.toBeRequired()`); live count in words from twenty characters remaining
(`whyRemainingLine`, `REMAINING_WORDS`, never a figure — asserted `not.toMatch(/\d/)`).
Passed through the hook as `p_why`, key **omitted** when empty
(`use-project-approvals.ts:604-606`), so the pre-00569 signature still takes the call.
Both behaviours have tests (`carries the composer why to the RPC as p_why`, `omits p_why entirely
when no why was written…`).

Checked against the migration as built: `00569_approval_why_viewer_role_and_receipt.sql:475-484`
declares `create_project_approval_decision(p_project_id uuid, p_payload jsonb,
p_idempotency_key text, p_why text DEFAULT NULL)` and drops the three-argument signature first, so
there is no overload ambiguity. The hook does **not** put `why` inside `p_payload`, which matters:
`:193-200` raises `unsupported project approval payload keys` on any key outside the fixed list.

**P-13 reading half — half delivered.** See G-01.

**P-17 — delivered.** `signed-stamp.tsx` is a portal-local component (no shared package minted, as
briefed) with all four dials: `border-[1.5px]` outer at `color-mix(… var(--color-mocha) 88% …)`,
doubled inner rule at `inset-[2.5px]` / 42%, word `text-[var(--color-mocha)]`, `-rotate-[1.1deg]`,
`bg-transparent`, no shadow. Five unit cases pin all of it including the two refusals. Pigment now
travels the whole designer ground: `proposal-watch.tsx:431`, `proposal-watch-derivation.ts:137`,
`desk-derivation.ts:469,643`, `red-letter-zone.tsx:31`, and both stamps in `doc/[id]/page.tsx:3095-3110`.
The sage plate `bg-[rgba(168,181,160,0.12)]` is gone from `SignedSeal`.

Green-check retirement: `grep -nE "CheckCircle|<Check|checkmark|✓|✔"` over every file this lane
touched → **exit 1, zero hits**. Tree-wide in `components/document/` there are **35** hits; none is a
signed/approved status mark on a proposal or approval surface (spot-checked
`spec-book-workspace.tsx:1361`, `work-block.tsx:310` — both work-completion ticks).

**Refusal sweep.** Every added line grepped for `\bAI\b|overdue|dashboard|\btask\b|badge|confetti|
celebrat|emoji|shadow|checkmark|✓|✔|color-sage|green|Declined`: the only hits are comments and test
assertions *forbidding* those things. No homeowner-visible string is added by this lane at all —
the one string that reaches a homeowner is the designer's own typed sentence.

**Hygiene.** Eleven commits, each with an explicit pathspec list, Conventional subjects, no
`merge(...)`, no trailers, nothing pushed, no migration minted, no production mutation. Program docs
force-added under `build/`. `git status --porcelain` clean (the eight `.env*: Operation not
permitted` lines are the sandbox, not the tree).

---

## Findings

### G-01 · major · 0.95 — P-13's attribution renders on no real row; it is deferred, not built

`project-approval-document.tsx:1075` renders `<GateWhy attribution={givenName(review.whyAuthorName)}>`
and `use-project-approvals.ts:334` parses `whyAuthorName: nullableString(row, 'whyAuthorName')`.
Nothing emits that key. `00569`'s `get_project_decision_reviews` builds its row with
`'why', artifact.why` (`:874`) and `'viewerRole', …` and **no author of any kind**;
`project_approval_artifacts` (00463:128-155) has no author column either, so there is nothing to
join client-side. Every production row therefore renders the sentence unsigned.

The brief's P-13 sub-item is verbatim: *"Show the frozen why on the designer's own approval reading
view under the question with `— {given name}`."* Under this review's own rubric a missing sub-item is
a blocker; it is filed as a major because the lane took the round-2 finding's second, explicitly
sanctioned remedy (record it as deferred) and did so honestly, in the hook's doc comment, at the
render site, and in the lane log — the code no longer claims something it does not do.

What closes it: one line in 00569's `jsonb_build_object` under exactly the key `whyAuthorName`.
`client_decisions.designer_id` already exists (denormalised at 00064, used at 00174:235), so
`LEFT JOIN profiles ON profiles.id = decision.designer_id` and emitting the display name is a
one-line change in a migration that is still open in this wave. Otherwise the orchestrator must put
the deferral in the wave report — the wave cannot close with the brief item silently half-built.

### G-02 · major · 0.75 — a field that says "One line" accepts Enter, and the newline freezes forever

`project-approval-document.tsx:770` is `<textarea id="approval-why" rows={2} …>`; submit does
`why: form.why.trim() || null` (`:371`); the hook does `input.payload.why?.trim()` (`:586`). All three
trim ends only. `00569:152` is `v_why := NULLIF(btrim(COALESCE(p_why, '')), '')` — btrim, ends only —
and the column CHECK is length-only. So an interior `\n` survives into
`project_approval_artifacts.why`, a table that is immutable by design: it cannot be corrected
afterwards. From there it travels to the decision email, the client Threshold and the iOS row, each of
which will break the line differently. On the designer's own surface the fault is invisible, because
`GateWhy` prints it in a `<p>` and HTML collapses the whitespace.

Escalated from round 2's minor: two rounds have now passed it, a tester who presses Enter in a field
labelled "One line" hits it on the first try, and the artifact is append-only so there is no repair
path. Fix: `.replace(/\s+/gu, ' ')` at submit, or swallow Enter in the field.

### G-03 · minor · 0.85 — the count's live region re-announces the whole helper sentence

`project-approval-document.tsx:778`:

```
<p id="approval-why-help" aria-live="polite" className={META}>
  One line. She reads it under the question.{whyRemaining ? ` ${whyRemaining}` : ''}
</p>
```

The same element is the textarea's `aria-describedby` target and a polite live region. Past 180
characters every keystroke re-announces the description plus the count — twenty announcements of
"One line. She reads it under the question. Four characters left." running. Third round unfixed.
Fix: keep the description inert, put the count in its own `aria-live` span.

### G-04 · minor · 0.95 — the supersede comment is false against the migration, and the hook drops a `why` it accepts

`project-approval-document.tsx:95-96` still says *"`supersede_project_approval_decision` takes no
`p_why` this wave, so the superseding form does not offer one."* `00569:526-531` declares
`supersede_project_approval_decision(p_decision_id, p_payload, p_expected_updated_at,
p_idempotency_key, p_why text DEFAULT NULL)`, and `:702` is `v_why := COALESCE(v_why_given,
v_old_artifact.why)`. The backend's own comment (`:505-512`) says it added the parameter precisely so
*"the composer"* could re-ask on a revision — the normal sequel to a RETURNED approval.

Three consequences, none data-losing (silence inherits the predecessor's line): the comment misleads
the next reader; `useSupersedeProjectApproval`'s payload type is
`Omit<ProjectApprovalCreatePayload, 'phaseId' | 'sectionKey'>`, which still carries `why?`, while the
args it builds (`use-project-approvals.ts:724-739`) never forward it, so a caller can pass a value
that silently vanishes; and the re-ask the backend built for is not offered anywhere.

Fix: correct the comment, and either forward `why` to `p_why` on supersede or `Omit` it from that
payload type. Whether the supersede form gains the field is an orchestrator call.

### G-05 · minor · 0.9 — three SIGNED mark shapes on the designer's ground, and a fourth on the client's

Pigment is now unified; geometry is not. On the designer portal:

- `signed-stamp.tsx:44-47` — `-rotate-[1.1deg]`, no radius, `border-[1.5px]`, doubled rule at
  `inset-[2.5px]`, `tracking-[0.18em]`, `font-semibold`.
- `proposal-watch.tsx:192` — the watch row's `<Stamp label={w.stamp.label} …>`; the outline branch
  (`stamp.tsx:90-99`) is `-rotate-[1.5deg] rounded-[3px] border-[1.5px] tracking-[0.1em]`, single rule.
  For `status = 'accepted'` that label is `SIGNED` — so the same page can draw the mark twice, two ways.
- `settled-bar.tsx:46` — the Record's `Signed · {date}` and `Approved · {date}` go through the same
  generic `Stamp`, a third instance of the rounded, single-rule, −1.5° shape.

And on the client: `client-portal/src/components/threshold/instruments/stamp.tsx:287` draws SIGNED at
`border` (1px), `tracking-[0.1em]`, no semibold, with a thirty-day aging step
(`ages: true`, `:114-118`).

Worth noting which one is canon: ux/02 §1 measures `GateStamp` as *"doubled border, 1.5px outer and a
0.42-opacity inner rule at `inset-[2.5px]` … mono caps at `tracking-[0.18em]`, no fill"* — the
**designer's** new mark matches that exactly; the client's is the lighter one. A lockstep decision is
owed at integration (R14 makes the ceremony pieces shared components), or the split goes in the wave
report in writing.

### G-06 · nit · 0.95 — a dead `useAuth` mock whose comment describes a behaviour that was removed

`approvals-region-head.test.tsx:36-40` still carries

```
// The region head renders the full document, which signs a frozen why with the
// reading designer's given name (P-13); the real hook reaches Supabase auth.
jest.mock('@/hooks/use-auth', () => ({ useAuth: … }));
```

`grep -n useAuth project-approval-document.tsx` → no matches; there is no `approvals-region-head.tsx`
that imports it either. The comment is now false twice — the why is not signed with the reading
designer's name, and (G-01) it is not signed at all. Both lines were added by this branch. Delete them.

### G-07 · minor · 1.0 — the designer-portal lint gate is red, and it is red on `main`

Recorded so a red lint at merge is not read as a Wave 2 regression: `EXIT 1`,
`✖ 205 problems (2 errors, 203 warnings)`, both errors in files this branch never opens
(`piece-room-save-gate.test.tsx:159`, `use-commercial-documents.test.ts:930`), both present verbatim
in `git show main:<path>`. The only warnings on files this lane touched
(`project-approval-document.tsx:226` exhaustive-deps, `proposal-watch.tsx:146` unused disable) are
pre-existing lines. Fix separately or waive; do not charge it to this lane.

### G-08 · nit · 0.9 — a written why against a portal deployed ahead of 00569 fails outright

`use-project-approvals.ts:604-606` omits `p_why` only when the field is empty. A designer who writes
a line calls a signature that does not exist until 00569 lands, and 00569 DROPs the pre-`p_why`
signatures first (`:124-126`, `:521-523`), so the window is deploy-order only, not overload
ambiguity. One line in the wave report pinning the rulings' production order (migrations → edge
functions → portals) closes it.

### G-09 · nit · 0.9 — −1.1° and no aging step, against a source document that says −2° and ages

`signed-stamp.tsx:44` is `-rotate-[1.1deg]`, per the lane brief, and the web lane's `STAMP_DIALS`
carry `rotation: -1.1` for every stamped state. `ux/02-ceremony-and-visual-language.md` §1/§5 and
`proposal.html` both print −2°. Separately, ux/02 §5.2 requires one aging step at thirty days
(outer 0.88 → 0.74, inner 0.42 → 0.26, word ink unchanged); the client's stamp implements it
(`ages: true`), the designer's does not — the brief named four dials and aging is not one of them.
Record both re-rulings in the wave report so a later reader does not "correct" one surface back.

### G-10 · nit · 0.9 — `SIGNED_STAMP_INK` is exported, asserted, and hard-coded beside itself

`signed-stamp.tsx:33` `export const SIGNED_STAMP_INK = 'var(--color-mocha)';` sits beside the literal
`text-[var(--color-mocha)]` in the class string, because Tailwind cannot interpolate a constant. Only
`signed-stamp.test.tsx` consumes it — which does catch drift, so this is taste, not a defect.

### G-11 · nit · 0.9 — `why` and `whyAuthorName` are optional on an interface the parser always fills

`use-project-approvals.ts:57,71` mark both `?`, while `parseProjectApprovalReview:334-335`
unconditionally sets both (null when absent), so `undefined` is unreachable on a parsed row. The
markers exist so the other lanes' object literals keep compiling mid-wave. Tighten to `string | null`
once their fixtures carry the fields.

### G-12 · nit · 0.7 — mocha is the body-ink token, so the mark is drawn in the colour of the text around it

`globals.css:14` `--color-mocha: #5C4A3C;` and `:74` `--text-body: var(--color-mocha);`. `STAMP.mocha`
(`desk-derivation.ts:469`) sets border and ink to the same token, and the Record's two stamps now do
the same. R13 requires the move and the border carries an 88% mix, so it is not identical — but only
a rendered look can say whether the mark still reads as a mark. Fold into the rendered check already
owed at integration (ux/02's R-C2 asks for exactly this).

### G-13 · nit · 0.6 — nothing on the composer says the why is optional

Every neighbouring control in the form carries `required`; the why is the only optional field and
neither its label nor its helper says so. A designer will read the first field on the paper as
mandatory. The brief says optional and the test pins it; only the copy is silent.

### G-14 · nit · 0.35 — `.slice(0, 200)` can split a surrogate pair

`project-approval-document.tsx:775` slices by UTF-16 code unit. A pasted string whose 200th and 201st
units are a surrogate pair leaves a lone surrogate, which PostgREST/Postgres rejects as an
unsupported Unicode escape. Reachable only past the browser's own `maxLength` truncation, so barely
reachable at all; noted for completeness. (The same code-unit-vs-character mismatch is harmless in the
other direction: JS is stricter than Postgres's `char_length`, so the CHECK can never be the thing
that fails.)

### G-15 · nit · 0.5 — a `docs(...)` commit that edits two source files

`73f49aad6 docs(approvals): the why's attribution is deferred, and the code says so` touches
`project-approval-document.tsx` and `use-project-approvals.ts`. Verified comment-only
(`git show 73f49aad6 -U0` — every added non-comment line is a continuation of a block comment), so
harmless, but a `docs:` subject over `.tsx`/`.ts` paths misleads a later blame or changelog scan.

---

## Advisories (not blocking)

- `client-mirror.tsx:151` still marks an answered decision `answered · {date}` in
  `--color-sage-ink` — the last sage thing near this family on the designer's ground. Outside F-02's
  named scope; a ruling would close the sweep.
- `proposal-instruments.tsx:216-225` pairs `--color-sage` (`ok`) against `#C77B6E` (`err`) on a
  proposal surface — a sage/terracotta pair, which the visual refusals forbid. Designer-facing,
  transient feedback text, untouched by this lane, pre-existing. Worth a separate sweep.
- The backend now folds the why into the idempotency request hash (`00569:282-284`), guarded so a
  why-less create keeps its old hash. No exposure from this lane: the receipt is written inside the
  same transaction as the create, so a failed submit leaves no receipt and the composer's retained
  key is safe to reuse with an edited line.
- The W1 `client-note-composer.test.tsx` date-frozen failure the lane logged is unchanged and still
  owed to the integration steward.
- A rendered check on the designer portal is still owed at integration — no dev server runs in a
  worktree (no `.env`).
