# Wave 2 · WEB lane, stage B — adversarial review, round 2

Reviewer context, separate from the implementer and from round 1. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web`, branch `approvals/w2-web`.

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-web
```

Stage boundary `9e76a3c74` (stage A's round-3 review commit). Round 1 reviewed through
`1a298b9d1`; this round adds the fix pass:

```
08f0504a9 docs(approvals): W2 web lane fix pass, round 1
144268d7c fix(client): the wall's act stays unlit until a name is on the rule (W2B-R1-04)
841d39ee7 fix(client): only the approval is signed; a return and a hold consent to nothing (W2B-R1-02)
530a6db6c fix(client): a hand holds the act, a screen reader clicks it (W2B-R1-01)
```

9 files, +314/−64. Conventional subjects, no trailers, no `merge(...)`, explicit pathspecs,
nothing pushed, no production mutation, no stack reset. `git status --short` reports only the
sandbox's `.env*` "Operation not permitted" read denials — the tree is clean.

**Verdict: fix.** Two blockers. One is the AT fix itself, which I read as inverted and therefore
still shutting real assistive technology out of all four terminal acts. The other is not new —
stage A's round-3 review raised it as its single major, nothing dispatched it, and I have now
*proved* that it turns integration red. Everything else is minor or a ruling.

## Gates, run by the reviewer

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > tsc --noEmit          (no output, exit 0)

pnpm --dir <wt> --filter @patina/client-portal test
  Test Suites: 119 passed, 119 total
  Tests:       1654 passed, 1654 total

pnpm --dir <wt> --filter @patina/supabase test        (the lane edits this workspace too)
  Test Files  84 passed (84)
  Tests  997 passed | 12 skipped (1009)
```

All green, and the counts match the lane's own report exactly.

## Round-1 findings: what was actually dispatched

| # | Finding | State |
|---|---|---|
| W2B-R1-01 | blocker · no assistive path | **Attempted, and I believe wrong — see W2B-R2-02** |
| W2B-R1-02 | major · signature demanded for Hold and Return | **FIXED**, and it matches the mid-Wave-2 ruling exactly |
| W2B-R1-03 | major · 00570 minted outside the lane | Left in place; **ruled** at orchestration (folded into 00569 at integration) — not a finding |
| W2B-R1-04 | major · the wall held 900 ms to be refused | **FIXED** |
| W2B-R1-05 … 15 | minor / nit | **none dispatched** — all eleven verified still live below |

W2B-R1-02, verified line by line: `approval-ask.tsx:790` sets `const signing = chosen === 'approved'`;
`:820-821` sends `clientSignature`/`clientConsentMethod` only when `signing`; `:1092` draws the
`SignatureLine` only for `approved`; `:1114-1118` arms the submit on the signature only for
`approved`, on the note only for `changes_requested`. Two tests assert
`clientSignature: undefined, clientConsentMethod: undefined` on the recorded call for both
`changes_requested` and `needs_discussion`. The hook's guard
(`use-project-approvals.ts:682-690`) then sends `{ outcome }` alone. This is the ruled shape.

W2B-R1-04, verified: `wall-gate.tsx:271` `disabled={!signatureIsComplete(signedName)}`; the test
pins unlit at zero characters, unlit at one, armed at "Harper Vale".

## Findings

### BLOCKER

**W2B-R2-01 — merging this branch beside the designer lane's produces a duplicate `why` and
integration goes red. Proven.**
`packages/supabase/src/hooks/use-project-approvals.ts` is owned by no Wave-2 lane, and two lanes
edited the same two regions of it: the web lane adds `why: string | null` (**required**, `:60-65`)
plus `viewerRole` after `context`, and the designer lane adds `why?: string | null` (**optional**)
plus `whyAuthorName?` *before* `context`. Different insertion points, so git merges both without a
conflict marker and nothing warns anyone:

```
$ git merge-tree --write-tree approvals/w2-web approvals/w2-designer
a785624a3f13634df409ca84a950d57edec875d6          # clean, no conflict

$ git show a785624a3:packages/supabase/src/hooks/use-project-approvals.ts | grep -n 'why:'
66:  why?: string | null;      # designer's
86:  why: string | null;       # web's
353:    why: nullableString(row, 'why'),        # designer's, in the parse literal
358:    why: nullableString(row, 'why'),        # web's, same literal

$ ./node_modules/.bin/tsc --noEmit --skipLibCheck --target es2020 --moduleResolution node <that file>
(66,3): error TS2300: Duplicate identifier 'why'.
(66,3): error TS2687: All declarations of 'why' must have identical modifiers.
(86,3): error TS2300: Duplicate identifier 'why'.
(86,3): error TS2687: All declarations of 'why' must have identical modifiers.
(358,5): error TS1117: An object literal cannot have multiple properties with the same name.
```

Stage A's round-3 review called this exactly ("the merge produces a duplicate `why` in both the
interface and the parser literal, and integration goes red"); the round-3 fix pass did not
dispatch it and round 1 of stage B did not re-raise it, so it is still live at the end of the
lane. It is a red gate on the integration branch, which is the definition of a blocker here.

Fix, whoever owns it: one declaration survives. The designer lane's is the wider one (it also
carries `whyAuthorName`, which the mid-Wave-2 ruling requires) — so the web lane should drop its
`why` from both the interface and the parse literal and keep only `viewerRole`, or the steward
resolves it in one hand at integration. Whichever way, the optionality must be settled too:
web declares it required, designer optional, and a required field will break any caller that
builds a `ProjectApprovalReview` literal without one.

**W2B-R2-02 — the assistive-technology fix looks inverted: it refuses the click real AT
dispatches and accepts the one only a script dispatches.**
`scored-action.tsx:~575` (the `HoldAction` `onClick`):

```ts
onClick={(event) => {
  event.preventDefault();
  if (unavailable || running.current) return;
  if (event.isTrusted) return;                                    // ← here
  if (Date.now() - pointerAt.current < POINTER_TAIL_MS) return;
  take();
}}
```

The premise is stated in the comment and in the lane notes: "Assistive technology's click is
untrusted." That is the case for `HTMLElement.click()` from script — the HTML spec's synthetic
click activation steps set the not-trusted flag — but it is *not* how a screen reader, Voice
Control or switch access activates a control. Those go through the platform accessibility API
(`AXPress` / `kDoDefault` / `IAccessible2::doAction`), and the browser then dispatches the click
itself, from the user agent, with `isTrusted === true` — which is why activating a button with
NVDA, JAWS, VoiceOver or Voice Control counts as user activation at all (it can open a window,
enter fullscreen, start media). If that reading holds, then every real AT activation hits
`if (event.isTrusted) return;` and W2B-R1-01 is unfixed: signing a commercial document, accepting
finished work, approving a scope change and recording an approval outcome remain unreachable, and
the only thing the new branch admits is a scripted `element.click()` — which is what the lane's
own new test dispatches, so the suite is green on the one case that does not occur in the field.

The lane says as much itself: "jsdom marks EVERY dispatched event untrusted, so the 'a trusted
click stays inert' half of the guard is provable only by reading." Round 1's own premise about
untrusted AT clicks was the same guess. Neither round has evidence; the difference is that the
code now *depends* on the guess being right.

The safe shape needs no guess: **delete the `isTrusted` test and keep the pointer-tail guard
alone.** A hand always leaves a `pointerdown`/`pointerup` on this control within
`POINTER_TAIL_MS` before its click, so a real tap is still refused; a physical-keyboard hold
produces no click at all (both `keydown` and `keyup` are `preventDefault`ed); and an activation
that arrives with no pointer history is, by construction, not a hand — trusted or not. That
covers AT under either reading of `isTrusted` and loses nothing the ceremony was protecting.

Before ship this needs a real walk: one desktop screen reader (NVDA or VoiceOver) and macOS Voice
Control ("click Sign") against the four acts. It cannot be settled in jsdom either way.

### MAJOR

**W2B-R2-03 — the ruled `whyAuthorName` attribution is unbuilt on web; the line under the why is
signed by the live designer, not by the hand that wrote it.**
Mid-Wave-2 ruling: "The why is attributed to its author. 00569's projection emits `whyAuthorName`
… every surface renders '— {whyAuthorName}' only when present." On this branch,
`approval-ask.tsx:898-905` draws `— ${designer}` where `designer = designerGivenName?.trim()`
(`:733`) — the *current* project designer passed down from `threshold.tsx:896`, not a frozen
author — and it draws it whether or not a why exists. `grep -rn whyAuthorName apps/client-portal
packages/supabase` on this branch returns nothing.

Cross-lane note the steward needs: the designer lane already declares `whyAuthorName?: string |
null` and parses it, with its own comment saying it is "NOT YET PRODUCED" — and backend's
`00569:874` confirms it: the projection emits `'why', artifact.why` and no author key of any
kind. So the ruling is currently unmet on all three of type, projection and render. On a
multi-designer studio this is the exact failure the ruling names: an immutable, client-facing
sentence signed by whoever happens to hold the project today.

**W2B-R2-04 — `viewerRole` is projected, typed and parsed, and then read by nothing.**
`use-project-approvals.ts:333` parses it; `approval-ask.tsx:718-722` computes `canRespond` from
lifecycle, disposition, review count and outcome only. So a studio co-member reading the client
app still gets the eyebrow "Your approval · your answer is needed" (`:871`), the three doors, the
ruled signature line, and a hold that ends in the RPC's refusal sentence — which is precisely the
Wave-1-close ruling that minted the field ("Studio co-member in the client app sees studio-wide
approvals as 'waiting on you' … the viewer-role field is a Wave 2 migration item"). The migration
half landed; nothing consumes it. Whether that consumption belongs to this lane or to a Wave-3
item is the orchestrator's call, but as the wave stands the defect the field was minted to close
is still open on the client surface.

### MINOR

All eleven of round 1's undispatched findings are re-verified as live. I am not restating their
reasoning; each line below is the check I ran.

**W2B-R2-05 (was W2B-R1-05) — "Press and hold to hold."** `approval-ask.tsx:1111`
`verb={chosenAct.label.toLowerCase()}`, labels Approve / Return / Hold (`:100`, `:107`, `:114`).

**W2B-R2-06 (was W2B-R1-06) — the reduced-motion promise still leaks on the retreat.**
`globals.css:524` `.da-hold[data-hold-state='idle'] .da-pool` is (0,3,0); `.da-hold-still
.da-pool` (:533) and the in-media `.da-hold .da-pool` (:539) are both (0,2,0). The idle rule wins
on specificity, so a stilled reader still watches the ink retreat over 180 ms.

**W2B-R2-07 (was W2B-R1-07) — the fill is the ink block, not the score, and at full fill a
keyboard hold may black the word out.** `.da-pool` is `inset: 8px 2px` with
`.da-primary .da-pool { background-color: var(--color-charcoal) }`; at `--hold-fill: 1` the clip
is `inset(0 0 0 0)`, i.e. a solid charcoal plate behind the word — the shape `scored-action.tsx`'s
own header refuses ("never a filled button"). The word stays legible during a *pointer* hold only
because `.da-primary:active` recolours it to off-white. A physical-keyboard hold does not
reliably set `:active` (Firefox does not apply it for a held Enter), so for that path the label
is charcoal on charcoal for the length of the hold. jsdom evaluates no `clip-path` and no
`:active`; this needs the same browser walk as W2B-R2-02.

**W2B-R2-08 (was W2B-R1-08) — the dock arguably worsens the sub-item it answers.**
P-18's risk note is explicit: "Decline must stay reachable without scrolling." The Sign act is now
permanently docked at the bottom edge under 600px (`door-gate.tsx:566-575`) while Ask a question /
Request a change / Decline sit at the very end of the leaf behind `max-[600px]:pb-16`
(`door-acts.tsx:225`). The primary is always on screen; the three alternatives are always at the
bottom of a long paper. Defensible under `threshold-remap.md:220` ("the ranking half is arguably
delivered by construction") — flagged for a ruling, not asserted as a miss.

**W2B-R2-09 (was W2B-R1-09) — the act vanishes mid-swing.** `door-gate.tsx:558` `{!signedAt && …}`
while the leaf survives to `doorState === 'open'` (`:362`): for the 520 ms swing the leaf shows a
consent line, a ruled name and a hint with no act beneath them.

**W2B-R2-10 (was W2B-R1-10) — `onPointerCancel` still untested.**
`grep -n 'pointerCancel\|pointercancel' instruments/__tests__/hold-action.test.tsx` → no hits,
though the handler is wired and the brief names "pointer cancel on scroll".

**W2B-R2-11 (was W2B-R1-11) — a rejected `onHold` is still an unhandled rejection.**
`scored-action.tsx` `take()`: `void Promise.resolve(onHold()).finally(…)`, no `.catch`.

**W2B-R2-12 (was W2B-R1-12) — `signedOnLabel`'s test is still timezone-fragile.**
`signature-line.test.tsx:87` asserts `'9 January 2026'` for `2026-01-09T12:00:00Z` through a
module-level `Intl.DateTimeFormat` in the runner's zone.

**W2B-R2-13 — Return and Hold now record no consent method at all.** The mid-Wave-2 ruling reads
"Return and Hold are press-and-hold only, no name, consent method stays `portal_clickthrough` on
web". The branch sends neither key, so `client_consent_method` lands NULL on those two rows and
the record cannot tell a portal answer from a legacy one. The DB would accept
`'click_through'` with no signature (`00569:1063` only demands a signature for
`electronic_signature`), so the ruling's literal reading is buildable. Against it: sending it would
hard-require the widened wrapper for all three outcomes and lose the graceful degradation the hook
was shaped for (`use-project-approvals.ts:658-661`). The lane's reading is defensible; the
divergence from the ruling's words should be recorded either way.

**W2B-R2-14 — two homeowner-facing refusal sentences are now unreachable, and one lost its
test.** `wall-gate.tsx:157` ("Type your full name to accept the finished work.") and
`scope-change-ask.tsx:490` ("Type your full name to approve.") can no longer be reached through
the UI: both acts are `disabled` until `signatureIsComplete`. The wall's assertion was deleted in
this pass — round 1's "refuses to accept without a typed name" became "stays unlit until a name is
on the rule" — so a string a client could read is now both dead code and unpinned copy. Keeping
the backstop is right; it should keep a test, or the sentence should go.

**W2B-R2-15 — the new assistive path is open to any scripted click.** As written, any
`element.click()` from any script with no pointer history on that control takes a terminal,
legally-consequential act with no hold and no confirmation — an injected extension, a mis-fired
`fireEvent.click` in a future test, a stray automation. That is a direct consequence of the shape
chosen in W2B-R1-01 and it disappears under the fix proposed in W2B-R2-02 only in the sense that
the same door stays open to trusted clicks too. Worth recording as the cost of the chosen
mechanism.

### NIT

**W2B-R2-16 (was W2B-R1-13) — the stray blank line survives.** `scope-change-ask.tsx:28-30`: two
blank lines where the `SIGNATURE_NOTICE` import was removed.

**W2B-R2-17 (was W2B-R1-14) — `stilled()` is still sampled once on mount**, so a reader toggling
the OS motion preference mid-session keeps a stale `da-hold-still` class. The media query still
covers the visual.

**W2B-R2-18 (was W2B-R1-15) — `SignatureLine` still drops `minLength`.** Deliberate and right;
recorded because ux/02:414 asks for it literally.

**W2B-R2-19 — `HoldAction` chains some of the caller's handlers and silently swallows others.**
`onPointerUp`, `onPointerLeave`, `onPointerCancel`, `onBlur` and `onFocus` all call
`rest.onX?.(event)`; `onPointerDown`, `onKeyDown` and `onKeyUp` do not, and they are spread from
`rest` first, so a caller's version is overridden without a word. No caller passes one today.

## What I checked and found clean

- **The mid-Wave-2 signature ruling** — verified line by line above. The client sends
  `clientConsentMethod` + `clientSignature` for Approve only. This is the specific thing the brief
  asked me to check, and it is correct.
- **00570's presence** — ruled (folded into 00569, file deleted at integration), so not a finding.
  Its body is still read-verified against `approvals/w2-backend:00569`: same DECLARE block, same
  seven-argument call into `_respond_project_approval_checked` (`00569:993`, `:1370-1378`), the
  allowlist grown by exactly two keys, both `NULLIF(btrim(…))`'d, both NULL when absent, so
  `{"outcome":"approved"}` is byte-identical to the pre-00570 call. It would apply on Strata.
- **Consent-method vocabulary** — `ProjectApprovalConsentMethod = 'electronic_signature' |
  'click_through'` matches `00569:1055-1058` exactly.
- **Copy against the refusals.** Every added line in the stage-B diff grepped for
  `gate|task|overdue|dashboard|AI|Declined|badge|shadow|checkmark|confetti|red-|green-|✓`. Every
  hit is an identifier (`regionKey="gate"`, `spine-gate-act`, a filename) or a comment. The new
  homeowner-visible strings are "Press and hold to {verb}.", "or press and hold Enter", "Type your
  full name", the dateline, and the untouched `SIGNATURE_NOTICE`. No numbers where words would do,
  no red, no fill on a stamp, no shadow, no outcome word out of the APPROVED / RETURNED / HELD
  family.
- **`SIGNATURE_NOTICE` is byte-identical and printed once per paper** — `consent-copy.ts`
  untouched, drift guard intact, door-gate's hint correctly stripped of its trailing copy, one
  test asserting a single occurrence on the door.
- **The review-confirmation leg stays unsigned and `portal_clickthrough`** —
  `approval-ask.tsx:978` holds with `verb="confirm this exact edition"` and sends no consent pair.
- **The four signature surfaces are all converted** — `grep -rln 'autoComplete="name"'` over
  `apps/client-portal/src` returns only `signature-line.tsx` and `details-sheet.tsx` (a profile
  field, not a signature). No raw name-entry act survives.
- **The retired route** — `apps/client-portal/src/app/proposals` does not exist, so P-18's
  `proposals/[id]/page.tsx` file references are correctly remapped to `door-gate` + `door-acts`.
- **Sticky's mechanics** — no `overflow` declaration on any ancestor in `threshold.tsx`,
  `door-gate.tsx` or `spine-gate.tsx`, and the leaf carries a transform only while
  `doorState === 'swinging'`, so the dock's containing block is sound at rest. The lane's stated
  reason for not using `fixed` (`[perspective:1800px]` at `door-gate.tsx:364`) is real.
- **Commit hygiene** — four commits, explicit pathspecs, Conventional subjects, no bodies, no
  trailers, no `merge(...)`, nothing outside `apps/client-portal`, `packages/supabase` and the
  gitignored `build/` log.

## Verdict

**fix.** Two blockers: the duplicate-`why` merge (proved red, and older than this stage), and the
assistive-click guard, which I read as inverted and which no test in this repo can settle. Two
majors from the mid-Wave-2 rulings that no lane has built (`whyAuthorName`, `viewerRole`'s
consumer). Fifteen minors and nits, eleven of them carried unchanged from round 1. The two fixes
that were dispatched — the signature scope and the wall's arming — are both correct.
