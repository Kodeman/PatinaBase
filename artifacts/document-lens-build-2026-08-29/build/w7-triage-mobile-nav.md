# W7 triage — "no navigation at all on mobile, just the document"

Reported on prod (designer portal, Worker `55907643` from `main@fab79cdd3`, docs tip
`646aa98d5`). Read-only on prod; diagnosed by full local reproduction against a
production build. **Diagnosis only — nothing fixed.**

---

## The cause, in one sentence

`MobileBar` yields the thumb edge to the log-time offer with a bare
`if (offer) return null`, but `LogStrip` — the thing that is supposed to take the
edge — refuses to render when the offer belongs to a *different* project than the
one in hand (`if (crossProject) return null`), so whenever a designer opens a
document while a timer is running on another project, **both** components return
null and the phone is left with no bottom chrome at all.

## The gate

Nothing viewport-, flag-, UA- or context-driven gates the bar. It is not
`useMediaMatch`, not `useMobileActiveDoc`, not `useFeatureFlag`, not
`data-lens-state`, not SSR/hydration. The only two gates are:

`apps/designer-portal/src/components/document/mobile/mobile-bar.tsx`

```tsx
100:  const { inHandToday, running, paused, elapsedSeconds, offer } =
101:    useDocumentTime();
...
219:  const barRendered = !offer;
...
249:  // The log offer becomes the edge owner while it is actionable.
250:  if (offer) return null;
...
292:      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[72px] … min-[1180px]:hidden"
```

The CSS gate (`min-[1180px]:hidden`) is correct and compiles — the class is
present in the built stylesheet (`.next/static/css/d681ef8f7c2501b4.css`). The
`call-sheet` `useFeatureFlag` read on line 106 only decorates a More-menu row; it
gates nothing structural. So the only way the bar disappears below 1180px is
`offer`.

Its counterpart, `apps/designer-portal/src/components/document/log-strip.tsx`:

```tsx
51:  if (!offer) return null;
...
56:  const crossProject = Boolean(heldProjectId && heldProjectId !== offer.projectId);
57:
58:  // A chained-out entry is already saved. Keep its adjustment offer in the
59:  // provider, but do not lay an unrelated project's controls over the
60:  // document currently in hand. It can surface again once no other project is
61:  // held (for example, back at the Desk).
64:  if (crossProject) return null;
```

Line 249's comment ("while it is **actionable**") states the intended contract
exactly. `crossProject` is what actionability means — and the bar never reads it.

## How the state arises (why prod, and why persistently)

`apps/designer-portal/src/hooks/document-time-provider.tsx` — `hold(doc)` runs on
every document pick-up:

```
301:          await closeOut(timer, { offerStrip: true });
```

i.e. opening document B while a timer runs on project A chains A out and sets
`offer = { projectId: A, … }` while `heldProjectId = B`. A running timer is a DB
row (`project_time_entries` with `duration_minutes IS NULL`) and therefore
survives reloads and sessions, so a stale timer left on any earlier project makes
this fire on the *first* load of any other document — and from then on every
document-to-document move re-arms it, because `hold()` starts a fresh timer for
each document it picks up.

Desktop is unaffected: the 60px Studio Drawer owns the edge there, and above
1180px the bar is `display:none` anyway. So the failure is mobile-only, which is
exactly how it was reported.

## Runtime values in reproduction

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-triage`
(detached at `646aa98d5`), `next build --webpack` → standalone on `:3030`,
local Supabase, seeded via `scripts/the-document-lens-seed.sql`
(`/doc/b0000000-0000-0000-0000-0000000000d5`, "Aspen Loft — the long paper"),
signed in as `designer@patina.dev`, Playwright chromium at 390×844 with
`isMobile: true`, touch, `deviceScaleFactor: 3` and a real iPhone 17.5 Safari UA.

Controlled A/B/C over the one variable — the running-timer row:

| # | DB state before load | `[data-testid="mobile-bar"]` | log strip | `[data-mobile-edge-owner]` |
|---|---|---|---|---|
| A | no running timer | **present** | absent | `["document-bar"]` |
| B | running timer on **another** project (`…d1`) | **ABSENT** | absent | `[]` |
| C | running timer on **this** project (`…d5`) | **present** | absent | `["document-bar"]` |

Case B is Kody's screen: no fixed element at `bottom: 0` with height > 20px
anywhere in the document, `--doc-mobile-bar-height` unset, paper scrolling under
nothing. Screenshot: `/tmp/claude/lens-probe/crossproject-doc.png`.

Healthy-case DOM probe (A), for contrast — the bar is mounted, visible and
correctly positioned, with no containing-block ancestor and nothing painted over
it:

```json
{ "innerWidth": 390, "matches1180": false, "lensState": "mobile",
  "barPresent": true, "barHeightVar": "93px",
  "bar": { "display": "flex", "visibility": "visible", "opacity": "1",
           "position": "fixed", "zIndex": "40", "transform": "none",
           "bottom": "0px", "rect": { "x": 0, "y": 751, "w": 390, "h": 93 },
           "text": "IN THIS DOCUMENT Client User AT CLIENT APPROVALS MESSAGE CLIENT USER MORE" },
  "containingBlockAncestors": [] }
```

**The UA is not the variable.** The same page in the same run at a plain 390×844
viewport with the default desktop UA and no `isMobile` produced a byte-identical
bar probe (`y: 751, h: 93`, visible). And on prod, signed-out
`https://app.patina.cloud/auth/signin` returns byte-identical markup (27,980 B)
under an iPhone UA and a desktop Chrome UA. Nothing in the chain reads the UA.

## The smallest fix

Make the bar's yield read the same actionability rule the strip enforces —
`mobile-bar.tsx`, one derived boolean replacing the two bare `offer` reads
(lines 219 and 250):

```tsx
const { inHandToday, running, paused, elapsedSeconds, offer, heldProjectId } =
  useDocumentTime();

// The offer only takes the edge when the strip will actually paint it — the
// same cross-project rule log-strip.tsx enforces. Otherwise nothing owns the
// thumb edge and the phone has no navigation at all.
const offerOwnsEdge =
  offer !== null && !(heldProjectId && heldProjectId !== offer.projectId);
```

then `const barRendered = !offerOwnsEdge;` and `if (offerOwnsEdge) return null;`.
(Line 207's `if (sheet || offer) setMoreOpen(false)` can stay as-is; closing the
More menu on a chain-out is harmless.)

Structurally better, if the fix lane wants it: publish the single boolean from
`document-time-provider.tsx` (e.g. `offerOwnsEdge`) so the two components cannot
drift apart again — the drift is the whole defect. `crossProject` was added to
the strip alone in `180d50aee fix(document): suppress unrelated time offers`,
which never touched `mobile-bar.tsx`.

Whatever the shape, the fix needs a falsifier that asserts exactly one
`[data-mobile-edge-owner]` at 390 **with a cross-project offer standing** — today
every such assertion runs with `offer: null`.

Gate for the change: `pnpm --filter @patina/designer-portal test` plus the
targeted e2e (`e2e/document/quiet-responsive-shell.spec.ts`,
`e2e/document/action-visibility.spec.ts`).

## Why 153/0 missed it

Both layers pin `offer` to the one value that cannot trigger the bug.

- **Unit** — `src/components/document/mobile/mobile-bar.test.tsx:69` mocks the
  time context with `offer: null` for the whole file. The `if (offer) return null`
  branch is never rendered, cross-project or otherwise.
- **E2E** — every mobile-edge assertion
  (`quiet-responsive-shell.spec.ts:284-285`, `action-visibility.spec.ts:139-142`,
  `quiet-focus.spec.ts:59`, `quiet-release-contracts.spec.ts:84-92`) signs in on a
  fresh context and opens **one** document. With no prior running timer, `hold()`
  either finds nothing or adopts this document's own timer — cases A and C above,
  both of which print the bar. No spec opens a second document belonging to a
  different project, and none seeds a running timer on another project first, so
  the suite has never once executed the state the designer is in the moment he
  has been working.

The suite measured "the bar renders at 390 on a cold, single-document session".
The defect lives in "the bar renders at 390 on the *second* document" — a
dimension no gate crosses.

## Not the cause (ruled out with evidence)

- A width tier / `useMediaMatch` — no such hook is in the chain; the only tier
  read (`useLensTier`, `page.tsx:367`) drives the band's measure, not the bar.
- `useMobileActiveDoc` being null — the bar renders on the Desk too and only
  swaps its left zone on `activeDoc`; it is not a render gate.
- A feature flag failing closed in prod — the only `useFeatureFlag` in the chain
  is `call-sheet`, which gates a More-menu row.
- `data-lens-state='mobile'` — present and correct in the repro (`"mobile"`).
- SSR/hydration with `matchMedia` starting false — the bar's visibility is pure
  CSS (`min-[1180px]:hidden`), which needs no client read.
- Tailwind not emitting the arbitrary breakpoint — `min-\[1180px\]\:hidden` is in
  the built CSS, and a missing rule would show the bar at every width, not hide it.
- A transformed/contained ancestor breaking `position: fixed`, or something
  painting over the bar — `containingBlockAncestors: []`, and
  `elementsFromPoint` at the bar's centre returns the bar's own subtree.
- User-agent sniffing anywhere — see above; the markup and the DOM are identical
  under both UAs.

---

Repro assets: worktree left in place at
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-lens-triage`
(`apps/designer-portal/probe-lens.mjs`, `probe-crossproject.mjs`, `probe-ab.mjs`;
`.env.local` points at local Supabase). The `:3030` server has been stopped and
the local running-timer row removed.
