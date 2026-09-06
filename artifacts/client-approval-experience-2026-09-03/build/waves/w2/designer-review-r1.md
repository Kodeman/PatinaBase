# Wave 2 — designer lane, adversarial review R1

Reviewer: separate context, did not write the code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-designer`
(`git rev-parse --show-toplevel` → same path).
Branch `approvals/w2-designer`, three commits over base `107549568`:

```
1861df5d1 docs(approvals): the W2 designer lane log
1ce452104 fix(approvals): SIGNED comes home to mocha on the designer's ground (P-17, R13)
ec16e1145 feat(approvals): the designer's one-line why, first on the composer's paper (P-13)
```

14 files, +737 / −7. Working tree clean apart from the sandbox's `.env*` EPERM noise.
No migration minted, no production mutation, nothing outside `apps/designer-portal`,
`packages/supabase` and the program's own `build/` log.

**Verdict: fix.** Both briefed items are delivered and every gate but a pre-existing
lint failure is green. Two majors: the frozen why is signed with the *reading*
designer's name rather than its author's, and R13 is only half-landed on the
designer's ground — a `SIGNED` stamp in sage survives on the Desk.

---

## Items traced

### P-13 — the designer's one-line why · DELIVERED

- **First field, above everything else.** `project-approval-document.tsx:765-786` — the
  textarea sits between the composer's `<h3>` and `<GateCeremony label="Gate anatomy">`.
  Deliberately outside the six gate parts (the suite asserts exactly six fieldsets);
  the placement still satisfies "first on the paper". Pinned by
  `compareDocumentPosition` against the first `[data-gate-part]`.
- **Copy is exact.** Label `What would you tell her about this?`; helper
  `One line. She reads it under the question.` Both byte-for-byte the brief.
- **Optional, capped at 200**, enforced twice (`maxLength` + a `slice(0, 200)` in the
  change handler, so a paste cannot overrun). Backend 00569's CHECK is
  `char_length(btrim(why)) BETWEEN 1 AND 200` — the composer trims before sending, so
  the constraint cannot be tripped from this surface.
- **Live count in words.** `whyRemainingLine()` (`project-approval-model.ts:186-193`)
  stays silent until twenty characters remain, then `Twenty…/One character left./No
  characters left.` Never a figure. Unit-tested at the boundaries and past the cap.
- **`p_why` on the wire.** `use-project-approvals.ts:573-597` spreads `p_why` as a
  top-level RPC argument only when non-empty, so the pre-migration 3-arg signature
  still takes a why-less call. Checked against the backend lane's
  `00569_approval_why_viewer_role_and_receipt.sql`: it DROPs
  `create_project_approval_decision(uuid, jsonb, text)` at line 120 and recreates it as
  `(uuid, jsonb, text, text)` with `p_why text DEFAULT NULL`. No overload ever coexists,
  so PostgREST cannot go ambiguous in either direction. The projection emits
  `'why', artifact.why` (00569:564). The contract holds on both sides.
- **Frozen why on the reading view.** New `GateWhy` in `gate-anatomy.tsx:146-171`,
  rendered inside `GatePartBlock part="question"` under `GateQuestion`
  (`project-approval-document.tsx:1081-1085`), signed `— {given name}`.
- **Tests:** hook passes `p_why` and omits it for `undefined | null | '   '`; form
  renders first, counts in words, carries the trimmed line, sends `null` untouched,
  prints and omits the frozen why. Six new composer tests, three model tests, two hook
  tests.

### P-17 — the stamp on the designer's ground · DELIVERED

- `SignedSeal` no longer draws `<Stamp color="var(--color-sage)">` on a sage plate;
  the `bg-[rgba(168,181,160,0.12)]` wash is gone with it (proposal-watch.tsx:427-431).
- New local `signed-stamp.tsx`: doubled rule (1.5px outer + `inset-[2.5px]` inner),
  mocha border at 88% / inner at 42%, mocha word at full strength, `-rotate-[1.1deg]`,
  `bg-transparent`, no shadow. `--color-mocha` is defined (`globals.css:14` → `#5C4A3C`).
  `color-mix` has 18 existing call sites in this portal; `border-[color:var(--x)]` is
  correct Tailwind 3.4 syntax for an untypable custom property, and the file is inside
  the config's `./src/components/**` glob.
- Not a shared package component, per the brief. Reusing the portal's `Stamp` would
  have moved a dozen unrelated surfaces (FF&E, orders, procurement trail).
- `deriveStamp`'s `accepted` case now mints `SIGNED` in mocha, border and ink
  (`proposal-watch-derivation.ts:137`).
- **Tests:** five new assertions pinning all four dials plus the two refusals (no fill,
  no shadow), and a derivation test asserting mocha and `not.toBe(sage)`.
- No green check exists on the surfaces this lane touched (verified independently).

---

## Findings

| # | Sev | Conf | Where |
|---|---|---|---|
| D1 | major | 0.9 | `project-approval-document.tsx:519` — the why is signed with the reader's name |
| D2 | major | 0.85 | `desk-derivation.ts:639` — a `SIGNED` stamp in sage survives R13 |
| D3 | minor | 0.95 | `designer-notes.md` — a false grep count in the program record |
| D4 | minor | 0.8 | `proposal-watch.tsx:192` vs `signed-stamp.tsx` — two SIGNED grammars, one page |
| D5 | minor | 0.75 | `project-approval-document.tsx:783` — the whole helper is a live region |
| D6 | minor | 0.7 | `signed-stamp.tsx:40` — −1.1deg against ux/02 and the mock's −2deg |
| D7 | minor | 0.8 | the composer accepts newlines in a field whose copy says "one line" |
| D8 | minor | 0.85 | supersede silently drops the why on edition 2 |
| D9 | minor | 1.0 | `pnpm --filter @patina/designer-portal lint` is red (pre-existing) |
| D10 | nit | 0.9 | `SIGNED_STAMP_INK` exported but the class hard-codes the token |
| D11 | nit | 0.9 | `why?: string \| null` optional though the parser always sets it |

### D1 · major · The frozen why is signed with the READER's given name

```ts
// project-approval-document.tsx:515-519
// The frozen why is signed with the studio hand reading it. There is no
// author on the projection yet, so a co-member reading a peer's approval
// sees her own given name here; widen when the projection carries one.
const designerGivenName = givenName(user?.name);
```

`user` is `useAuth().user` — the viewer. In a one-designer studio viewer == composer and
the line is right. The moment the studio adds its first hands — the exact customer
VISION names, and the case the Wave-1-close rulings already legislate for ("Studio
co-member … sees studio-wide approvals") — designer B opens designer A's approval and
reads A's sentence signed "— B". That is a false attribution on a frozen, immutable
record, printed under the question the client is being asked.

The lane recorded this honestly rather than hiding it, and the projection genuinely
carries no author (00569 adds `why` and `viewerRole`, no `createdBy`). But the fix is
cheap and the backend lane's migration is still in flight in the same wave: have 00569's
`jsonb_build_object` emit an author given name beside `'why'`, or — entirely in this
lane — suppress the attribution when it cannot be proved, e.g. render the em-dash line
only when `review.viewerRole === 'lead'` is not the discriminator it needs and otherwise
print the sentence unsigned. Unsigned is honest; wrongly signed is not.

**Fix:** coordinate one field onto 00569's projection (author given name) and read it,
or drop the attribution until Wave 3 rather than borrow the reader's name.

### D2 · major · R13 half-lands: a sage `SIGNED` survives on the designer's ground

```ts
// apps/designer-portal/src/lib/document/desk-derivation.ts:639
stamp: { label: 'SIGNED', ...STAMP.sage },   // STAMP.sage = { color: var(--color-sage), ink: var(--color-sage-ink) }
```

`red-letter-zone.tsx:31` paints the same need's folio dot `proposal_signed:
'var(--color-sage)'`. R13 is unqualified — "SIGNED moves to mocha" — and the review's own
binding palette line reads "SIGNED in mocha (not sage)". After this branch the designer
sees SIGNED in mocha on the proposal watch and SIGNED in sage on the Desk, which is
precisely the "two pigments for one meaning across the table" ux/02 §5 set out to close.

The lane's notes flag `red-letter-zone.tsx` as an advisory but **do not mention
`desk-derivation.ts:639` at all** — the actual stamp, and the more direct violation of
the two. Neither file is named in the lane brief, so not changing them was correct
discipline; not surfacing the stamp was not.

**Fix:** orchestrator's call. It is a two-token change plus
`desk-derivation.test.ts:363`'s neighbouring assertion. If it is deferred, it must be
deferred explicitly, not by omission — a wave that ships mocha on one designer surface
and sage on another has made the divergence worse than it found it.

### D3 · minor · The lane log states a grep result that is false

designer-notes.md: *"Grepped the whole `components/document` tree for `CheckCircle`,
`<Check`, `checkmark`, `✓` and `✔`: zero hits."*

```
$ grep -rnE "CheckCircle|<Check|checkmark|✓|✔" apps/designer-portal/src/components/document/ | wc -l
      35
```

including `spec-book-workspace.tsx:1361  <Check className="h-6 w-6 text-[#66765f]" />` —
a check drawn in a green hex. The lane's *conclusion* survives: none of the 35 is a
signed status on a proposal or approval surface this lane touched, so nothing was owed.
But the orchestrator reads these logs as evidence, and this one reports a count that
does not exist.

**Fix:** correct the sentence to what was actually established (no green check is used
as a signed status on the proposal/approval surfaces touched) and drop the zero-hit claim.

### D4 · minor · Two SIGNED grammars on the same page

`proposal-watch.tsx:192` renders each watch row's stamp through the shared `Stamp` —
single 1.5px rule, `rounded-[3px]`, `-rotate-[1.5deg]`, `tracking-[0.1em]`. `SignedSeal`,
in the same component, now draws the doubled, square-cornered, `-rotate-[1.1deg]`,
`tracking-[0.18em]` mark. Same word, same surface, two marks. The brief scoped the dials
to `SignedSeal`, so this is a deliberate limit rather than a miss — but the eleven-state
grammar is meant to be one family, and a designer will see both at once.

### D5 · minor · The count's live region re-announces the static helper

```tsx
<p id="approval-why-help" aria-live="polite" className={META}>
  One line. She reads it under the question.
  {whyRemaining ? ` ${whyRemaining}` : ''}
</p>
```

The element is both the field's `aria-describedby` target and a polite live region. Past
180 characters every keystroke re-announces the whole sentence — "One line. She reads it
under the question. Nineteen characters left." then "…Eighteen characters left." — twenty
times in a row. **Fix:** put the count in its own `aria-live` span and leave the
description inert.

### D6 · minor · Rotation is −1.1deg where the source draws −2deg

The brief names −1.1deg and the lane implemented it. But ux/02 §5's eleven-state table
gives **−2°** for every stamped state, and the mock renders `transform:rotate(-2deg)`
(proposal.html:424) — the same figure the client-side `GateStamp` the web lane is
aligning to already carries. Unless −1.1 is a deliberate re-ruling, the designer's stamp
and the client's stamp will tilt differently and the "lockstep or surfaces diverge"
risk note on P-17 fires. **Orchestrator: confirm −1.1 or correct both lanes to −2.**

### D7 · minor · A "one line" field that accepts line breaks

The control is a `<textarea rows={2}>`; Enter inserts a newline. `form.why.trim()` strips
only the ends, the hook trims again, and 00569's CHECK bounds length only — so a why with
interior `\n` freezes into the immutable artifact and travels to every client renderer.
The designer's own `GateWhy` renders it in a `<p>`, where HTML collapses it and the
problem is invisible from this surface; email and iOS may not. **Fix:** collapse
whitespace (`.replace(/\s+/gu, ' ')`) at submit, or block Enter.

### D8 · minor · Supersede drops the why on edition 2

`SupersedeState extends Omit<ApprovalFormState, 'phaseId' | 'why'>` — the superseding
composer offers no why and sends none, because `supersede_project_approval_decision`
takes no `p_why` this wave. Correct against the backend as built, and documented. The
consequence is client-facing though: a designer writes her line on edition 1, supersedes
with a corrected artifact, and edition 2 arrives with nothing under the question and no
UI anywhere saying the line was dropped. **Orchestrator: rule it for Wave 3, or carry
`p_why` onto the supersede RPC while 00569 is still open.**

### D9 · minor · The lint gate is red on this branch (pre-existing)

```
✖ 205 problems (2 errors, 203 warnings)
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @patina/designer-portal@0.1.0 lint: `eslint .`  Exit status 1
```

Both errors are in files this branch never opens and that do not appear in
`git diff main...HEAD --stat`:

- `src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159` — `Definition
  for rule 'import/first' was not found`
- `src/hooks/__tests__/use-commercial-documents.test.ts:930` — `react-hooks/rules-of-hooks`

The ESLint config is unchanged, so main is red too. Not this lane's defect; recorded so
the integration steward does not read a red lint at merge as a Wave 2 regression.

### D10 · nit · `SIGNED_STAMP_INK` is exported but not consumed

The component writes `text-[var(--color-mocha)]` literally while the constant lives
beside it and is only read by the test. Drift between the two is caught (the test
compares the class against the constant), which is why this is a nit and not a finding.

### D11 · nit · `why?: string | null` is looser than the parser

`parseProjectApprovalReview` always sets `why`, so `undefined` is unreachable on a parsed
row; the optional marker exists only so the web lane's `ProjectApprovalReview` literals
keep compiling mid-wave. Documented and defensible. Tighten to `why: string | null` once
the web lane's fixtures carry it.

---

## Gates — run by the reviewer, in the worktree

`cd` does not persist between this agent's Bash calls (cwd resets to the main checkout —
a first `pnpm --filter` attempt silently ran against `/Users/kody/Code/patina-merged`).
Every gate below was re-run with `pnpm --dir <worktree>`, and each log line confirms the
worktree path.

| # | Command | Result |
|---|---|---|
| 1 | `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **PASS**, `EXIT=0`, `tsc --noEmit` in `<wt>/apps/designer-portal`, no diagnostics |
| 2 | `pnpm --dir <wt> --filter @patina/designer-portal lint` | **FAIL, `EXIT=1`** — `205 problems (2 errors, 203 warnings)`; both errors pre-existing and in untouched files (D9) |
| 3 | `pnpm --dir <wt> --filter @patina/designer-portal test -- <6 touched suites>` | **PASS** — `Test Suites: 6 passed, 6 total · Tests: 91 passed, 91 total` |
| 4 | `… test -- <7 dependent suites not run by the lane>` | **PASS** — `7 passed, 7 total · 125 passed, 125 total` (incl. `project-approval-document-mount`, `contrast`, `dissolve-grammar-contract`, `stage2-approval-cutover-contract`) |
| 5 | `… test -- "src/app/(document)/doc/[id]"` | **PASS** — `7 passed, 7 total · 142 passed, 142 total` |
| 6 | `pnpm --dir <wt> --filter @patina/supabase type-check` | **PASS**, `EXIT=0` |
| 7 | `pnpm --dir <wt> --filter @patina/supabase test -- src/hooks/__tests__/use-project-approvals.test.ts` | **PASS** — `18 passed (18)` |
| 8 | `pnpm --dir <wt> exec turbo build --filter=@patina/admin-portal^...` | **PASS** — `Tasks: 7 successful, 7 total` (cold-worktree dists) |
| 9 | `pnpm --dir <wt> --filter @patina/admin-portal build` (strictest) | **PASS**, `EXIT=0`, full route table emitted |

Gate 4 matters: the lane ran nine suites, but `project-approval-document-mount.test.tsx`
mounts the composer and carries **no** `use-auth` mock. The new `useAuth()` call does not
break it (the real hook returns no user, `givenName(undefined)` → `null`, and the
attribution simply does not render) — confirmed green rather than assumed.

## Scope and hygiene

- Only `apps/designer-portal`, `packages/supabase` and the lane's own `build/` log are
  touched; no refactor, no new shared component, no migration, no `.claude/` or `.env`.
- Three commits, Conventional subjects, no `merge(...)`, no trailers, pathspec-clean —
  each commit's `--stat` contains only files named in its own message. Nothing pushed.
- Working tree clean; the `.env*` lines in `git status` are the sandbox's EPERM notice,
  not modifications.

## Owed at integration

A rendered check on both items (no dev server in a worktree, no `.env`): open the
composer on a real project and confirm the field is first on the paper and the words
appear past 180 characters; publish and read the frozen why under the question; look at
the mocha SIGNED against the designer-portal ground and on paper — R-C2 asks for Leah's
eye on exactly this mark.
