# Wave 2 · WEB lane, stage B — adversarial review, round 1

Reviewer context, separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`, branch `approvals/w2-web`.
`git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`.

Stage boundary: `9e76a3c74` (stage A's round-3 review commit), per `web-notes.md`. Reviewed
range `9e76a3c74..HEAD` = five commits:

```
1a298b9d1 docs(approvals): W2 web lane notes, stage B
01d649560 feat(client): the docked act clears the four answers on the leaf (P-18)
824ed9367 feat(client): every terminal act is signed and held (P-18)
58107758a feat(client): the typed name reaches the response it was typed for (P-18)
2c1eac399 feat(client): the act is held, and the name goes on a rule (P-18)
```

20 files, +1760/−156. Commits are per-item, pathspec-clean, Conventional, no trailers, no stray
files, nothing pushed, no production mutation.

## Gates, run by the reviewer

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > tsc --noEmit        (clean, no output)

pnpm --dir <wt> --filter @patina/client-portal test
  Test Suites: 119 passed, 119 total
  Tests:       1650 passed, 1650 total

pnpm --dir <wt> --filter @patina/supabase test
  Test Files  84 passed (84)
  Tests  997 passed | 12 skipped (1009)
```

All green. Tree clean after the review probe was removed (`git status --short` reports only the
sandbox's `.env.example: Operation not permitted` read denials).

## The migration, checked against the bodies

The lane's central finding is **confirmed**, and it is the right call:

- `00464:811` `respond_project_approval` allowlists `p_payload - ARRAY['outcome','optionId']` and
  calls `_respond_project_approval_checked(..., NULL, NULL)`. Pasted and read.
- `00569:1376` (backend lane worktree) re-issues that wrapper **verbatim** — same allowlist, same
  two hard-coded NULLs. Confirmed by reading the backend worktree.
- `00569:993` re-issues `_respond_project_approval_checked` with the **same 7-argument signature**
  and the same consent validation (`:1055-1070`) and column writes (`:1242-1245`), so 00570's call
  resolves correctly.
- `00464:374-381` puts `client_consent_method / client_consented_at / client_signature` inside the
  Stage-2 guard's mutable allowlist, so the write is not refused by the edge trigger.
- 00570's body is 00569's wrapper plus two allowlist entries and two reads. `{"outcome":"approved"}`
  produces byte-identical behaviour. It would apply on Strata.

So the brief's premise ("send them, no migration") was half wrong and the lane caught it. What
remains is an ownership and ordering problem, below.

## Findings

### BLOCKER

**W2B-R1-01 — a held act has no assistive-technology path, and actively blocks the one AT uses.**
`scored-action.tsx` `HoldAction` takes the act only from `start()`, reached by `onPointerDown` or
`onKeyDown`, and adds `onClick={(event) => event.preventDefault()}`. A synthetic `click` — what
NVDA/JAWS dispatch in browse mode, what Voice Control ("click Sign") dispatches, what a switch
device dispatches, and what a mobile screen-reader double-tap resolves to — reaches no act path at
all. Proven with a rendered probe in this worktree (deleted after the run):

```
REVIEW PROBE — assistive activation
  ✓ a programmatic .click() … never takes the act (510 ms)
  ✓ a double-tap shaped pointer press (100ms) never takes the act either (112 ms)
Tests: 2 passed
```

This is a Wave-1 regression: all four acts were plain clicks before this commit. It now makes
signing a commercial document, accepting finished work, approving a scope change and recording an
approval outcome unreachable for those readers, with nothing said about why. The program source
says this explicitly twice: `ux/02:325` — "`HoldableModifier` already ships the correct fallback: a
VoiceOver-visible `accessibilityAction(named: "Activate")` and a tap path that completes
immediately… **That is the pattern; the new component must not lose it**" — and the build sheet's
P-18 file note, "already ships a VoiceOver `Activate` fallback — must not be lost". `ux/02:416`
specifies "`Enter`/`Space` complete immediately (a keyboard user cannot hold meaningfully)" for the
same reason; the lane brief overrode the *keyboard* half deliberately, but nothing overrode the AT
half.

Fix: let an **untrusted** click take the act (`if (!event.isTrusted) { take it }`) while a trusted
click stays inert, or expose a second explicit activation for AT. The physical-keyboard hold can
stay as briefed.

### MAJOR

**W2B-R1-02 — a legal signature is now demanded to say "let's talk".** `approval-ask.tsx:1103-1107`
disables the submit on `!signatureIsComplete(signature)` for **all three** outcomes, and
`:812-814` always sends `clientConsentMethod: 'electronic_signature'`. So Hold (`needs_discussion`)
and Return (`changes_requested`) now write an electronic signature into `client_signature` /
`client_consent_method` / `client_consented_at` for an answer that consented to nothing.
`ux/02:308` rules the opposite for this exact rail: "**Asking a homeowner to type her name to say
'needs discussion' would be theatre.** The choice is the act; the hold is the commitment." R1 says
"every surface", not "every outcome". Needs an orchestrator ruling: either scope the signature to
`approved`, or record the ruling that overrides ux/02.

**W2B-R1-03 — the portal now hard-requires a migration this lane does not own.** `00570` is minted
by the web lane in a wave where the backend lane owns `supabase/migrations` (it minted 00569), and
`supabase/migrations` is not in this lane's FILES YOU OWN list. The coupling is hard, not soft:
the hook's "send the pair only when a method is given" guard (`use-project-approvals.ts:685-693`)
gives graceful degradation to callers that don't sign — but the one caller that matters, the
doorstep, always sends the method, so against a pre-00570 database **every outcome submit raises
`unsupported project response payload keys`** and the client sees the refusal sentence. The deploy
set for this wave now carries a web-lane migration that must land before the client portal. There
is also no SQL test (the lane acknowledges: `supabase/tests/` has no neighbouring suite over this
RPC, and only the backend lane may reset the local stack).

**W2B-R1-04 — the wall is the only act that lets her hold for nothing.** `wall-gate.tsx:256-267`
passes no `disabled` to `HoldAction`, so with an empty or one-character name the client presses,
waits out the full 900 ms, and is then refused with "Type your full name to accept the finished
work." (`:155-158`). The other three acts arm on `signatureIsComplete` and simply stay unlit
(`door-gate.tsx:186-187`, `approval-ask.tsx:1104`, `scope-change-ask.tsx:571`). The refusal
sentence itself is pre-existing and pinned by "refuses to accept without a typed name", but the
900 ms of ceremony spent to reach it is new. Make the wall's act `disabled={!signatureIsComplete(signedName)}`
and keep the sentence as the same-tick backstop.

### MINOR

**W2B-R1-05 — "Press and hold to hold."** `approval-ask.tsx:1100` sets `verb={chosenAct.label.toLowerCase()}`
and the three labels are Approve / Return / Hold (`:100`, `:107`, `:114`), so the sr-only sentence
for the third outcome reads "Press and hold to hold." `ux/02:416` asks for the outcome in the
label ("Record your answer, approved"), not a bare verb.

**W2B-R1-06 — the reduced-motion promise leaks on the retreat.** In `globals.css`,
`.da-hold[data-hold-state='idle'] .da-pool` (0,3,0, line 524) outranks both
`.da-hold-still .da-pool` (0,2,0, line 533) and the in-media `.da-hold .da-pool` (0,2,0, line 539),
so the ink's 180 ms retreat still animates for a stilled reader. The **fill** is correctly instant
(during a hold the state is `holding`, so the idle rule does not match) — only the release moves.

**W2B-R1-07 — the fill is the ink block, not the score.** `.da-hold .da-pool` clips
`.da-pool` (`inset: 8px 2px`, the flood behind the word) left-to-right. `ux/02:321` names something
narrower: "the 1.5px charcoal rule fills left-to-right as the hold advances, so the act is
literally being scored under the word." The lane brief's "the existing ink-origin grammar" supports
the pool, so this may be intended — but at `--hold-fill: 1` a primary act is a word on a solid ink
block, which is the shape `scored-action.tsx`'s own header refuses ("never a filled button").
jsdom evaluates no `clip-path`; this needs a browser look before ship.

**W2B-R1-08 — sub-item (4) is delivered as "not covered", not as "reachable without scrolling".**
`door-acts.tsx:225` takes `max-[600px]:pb-16` so the docked Sign never paints over the three
answers, and the test pins exactly that. On a long paper the three still sit at the bottom of the
leaf and still require scrolling. `threshold-remap.md:220` says the ranking half is "arguably
delivered by construction", so the lane's reading is defensible — flagging for a ruling rather than
asserting a miss.

**W2B-R1-09 — the act vanishes mid-swing.** `door-gate.tsx:558` wraps the act in `{!signedAt && …}`,
but the leaf survives until `doorState === 'open'` (`:362`), so for the 520 ms swing the leaf shows
a name rule and a hint with no act under them. Previously a disabled `ScoredAction` stayed in
place inside the gate slot.

**W2B-R1-10 — `onPointerCancel` is wired but untested.** The brief lists "pointer cancel on
scroll"; `hold-action.test.tsx` pins pointerup, pointerleave and scroll, not `pointercancel`.

**W2B-R1-11 — a rejected `onHold` becomes an unhandled rejection.**
`scored-action.tsx` `void Promise.resolve(onHold()).finally(…)` has no `.catch`. All four current
handlers catch internally, so nothing is broken today; the next one that does not will log an
unhandled rejection.

**W2B-R1-12 — `signedOnLabel`'s test is timezone-fragile.** `signature-line.test.tsx` asserts
`signedOnLabel(new Date('2026-01-09T12:00:00Z'))` is `'9 January 2026'`; the module-level
`Intl.DateTimeFormat` formats in the runner's zone, so a UTC±12 runner flips the day. Production
reads `new Date()` (local), so only the test is exposed.

**W2B-R1-13 — a stray blank line.** `scope-change-ask.tsx:29-30` — removing the `SIGNATURE_NOTICE`
import left two blank lines before the doc block.

### NIT

**W2B-R1-14 — `stilled()` is sampled once on mount**, so a reader toggling the OS motion
preference mid-session keeps a stale `da-hold-still` class. The CSS media query still covers the
visual, so this is only the JS class.

**W2B-R1-15 — `SignatureLine` drops `minLength`.** `ux/02:414` asks for `autoComplete="name"`,
`required`, `minLength=2`. Only `autoComplete` is on the element; the 2-character floor is JS
(`signatureIsComplete`). Deliberate and right — `required` would summon the browser's own
validation voice, which the vision refuses — but worth recording that the spec line is not met
literally.

## What I checked and found clean

- **Copy against the refusals.** Grepped every added line for `gate|task|overdue|dashboard|AI|
  Declined|sage|green|red|checkmark|badge|shadow|confetti|celebrat`. Every hit is a code
  identifier (`regionKey="gate"`, `spine-gate-act`, filenames) or a comment. No new homeowner-facing
  string breaks a refusal; no numbers where words would do; no red, no fill, no shadow.
- **The legal line is byte-identical.** `SIGNATURE_NOTICE` in `consent-copy.ts:63` is untouched and
  still guarded by `__tests__/consent-copy.test.ts:37`. It now prints from `SignatureLine` instead
  of the door's hint, and `door-gate.test.tsx` asserts it appears exactly once on the paper.
  `consentLineFor` / `signLabelFor` / `summaryLineFor` unchanged. The wall gains the same sentence
  (flagged by the lane, correct by definition — a typed name releasing a draw is a signature).
- **The review leg stays `portal_clickthrough`.** `approval-ask.tsx:962-977` — a hold, no signature,
  no migration. Test asserts `confirmMutate` carries no `clientSignature`.
- **The hold contract.** 900 ms, completion only at length, early release / pointer leave / scroll
  cancel with no failure register, Enter and Space at the same length with `repeat` not restarting,
  `aria-describedby` sentence, keyboard-only visible hint via a shared modality tracker, instant
  fill when stilled, `mobile_dock` sticky classes, no `progress` element and no `role="progressbar"`.
  All pinned by 15 tests in `hold-action.test.tsx`.
- **Stage A untouched.** The plate, weighing sentence, three doors, stamp, note latch and refusal
  copy are unchanged; `approval-ask.tsx`'s diff is confined to the submit/confirm wiring and the
  new rule.
- **The sticky rationale.** `door-gate.tsx:364` really does carry `[perspective:1800px]`, which
  would have made a `fixed` dock pin to the doorway. The reasoning recorded in the lane notes holds.

## Verdict

**fix.** One blocker (AT activation), three majors (signature scope on non-consent outcomes, the
lane-minted migration's ownership and deploy coupling, the wall's unarmed hold). Everything else is
minor or a ruling to make. Gates are green and the migration would apply.
