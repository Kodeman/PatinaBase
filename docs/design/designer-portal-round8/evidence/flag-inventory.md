# WP-00.3 Flag inventory and renderer-latch policy (P10)

Ticket SQ-1810. Base `0fabcadf2` (`redesign/designer-portal-round8`). Recorded 2026-10-23.
This is evidence and a recommendation only. No application code, flag or PostHog setting was changed.

The policy below lets WP-01.2 build `use-paper-renderer.ts` for the new renderer flag
**`designer-paper-round8`** without guessing.

## 1. How a flag resolves today

| Layer | Behaviour (source) |
|---|---|
| Hooks | `useFeatureFlag(name)` (`apps/designer-portal/src/hooks/use-feature-flag.ts`) and `useFeatureFlags(names)` (`use-feature-flags.ts`) share the same rules. `isTeachingNotesEnabled()` is the one synchronous non-React read. |
| Initial state | `{ value: false, isLoading: true }`. SSR returns the same, so server HTML is always fail-closed. |
| Build-time override | `NEXT_PUBLIC_FLAG_OVERRIDES="a:true,b:false"`. Entries are trimmed, and only the literal string `true` gives `true`; any other value gives `false`. A listed flag resolves on the first render with `isLoading: false` and never consults PostHog, which means `name:false` is a deterministic *off* rather than "unset". The value is inlined at build or dev start, so changing it needs a rebuild or redeploy. |
| Analytics impossible | Applies when there is no `NEXT_PUBLIC_POSTHOG_KEY`, or in `NODE_ENV=development` without `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true`. `isAnalyticsPossible()` is false and the hook settles `{false, false}` immediately. This covers local dev, staging (key is `""`) and the e2e configs. |
| Init race | `initPostHog()` runs in the top provider's effect, after child effects. Hooks that mount before it wait on `onAnalyticsInit` (the fixed 2026-08 race). |
| After init | The hook reads `posthog.isFeatureEnabled(name)` synchronously; persisted flags give an immediate answer. It then subscribes to `onFeatureFlags` and sets `value` and `isLoading:false` on **every** callback, so `value` can change at any later time. |
| PostHog init | `posthog-js` `^1.359.1` (installed 1.359.1), `respect_dnt: true`, `persistence: 'localStorage+cookie'`, `capture_pageview:false`, `ip:false`. **No flag timeout or bootstrap is configured in app code.** |
| Prod config | `apps/designer-portal/wrangler.jsonc` top-level `vars`: the PostHog key and host are set, and there is **no `NEXT_PUBLIC_FLAG_OVERRIDES`**. The `staging` env has `NEXT_PUBLIC_POSTHOG_KEY: ""` and `NEXT_PUBLIC_FLAG_OVERRIDES: "room-file:true"`, so every other flag is off in staging. |
| Remote control | PostHog project 326191. Remote values below were read-only via the PostHog MCP on 2026-10-23. No flag was disabled at read time. |

## 2. Flag inventory (designer portal, Document group)

How the counts were taken:
- Call sites are non-test `useFeatureFlag`/`useFeatureFlags` calls under `apps/designer-portal/src`, counted by a scratch script that resolves the named constants.
- "Doc" counts sites under `app/(document*)/`, `components/document/` and `components/loading/`.
- "Loading" says whether any site reads `isLoading`. "value-only" means the site renders `false` first and changes when PostHog answers.

| Flag | Code default | Remote (prod PostHog) | Sites (doc / files) | Loading behaviour | Controls |
|---|---|---|---|---|---|
| `one-voice` | false | 100% everyone | 50 (48 / 46) — plus `FlagProbe` in `ffe-section.tsx` | value-only | the plain-voice copy and act set across desk, doc page, money, approvals, schedule, buying, people, ceremony, mobile bar, command bar |
| `optimistic-ink` | false | 3 `distinct_id`s (Middle West) | 10 (9 / 10) | value-only | optimistic save ink in ffe-section, work-block, account-band, coordination, feedback, outbound, piece-folio, add-line, rooms-rail |
| `ask-the-paper` | false | 100% | 5 (5 / 5) — plus `FlagProbe` | value-only | command-bar ask, money-region, ask-maker / record-a-change sheets, studio drawer |
| `teaching-notes` | false | 100% | 5 + 2 derived (`use-changes-list`, `use-teaching-note`) | loading-aware (help/changes, changes list) | teaching notes, help changes, notifications |
| `client-invite-letter` | false | not read | 5 (4 / 5) | loading-aware (2 sites) | household sheet, send sheet, people directory client letter |
| `onboarding-teammate-persona` | false | not read | 5 (4 / 4) | loading-aware (walkthrough gate) | desk walkthrough, studio invite, accept-invite |
| `agreement-library` | false | 100% | 3 (3 / 3) | value-only | account studio page, services addendum action, agreement composer |
| `arrival-arc` | false | 100% | 3 (3 / 3) | value-only | ceremony surface, open-requests strip, triage bar |
| `room-file` | false | person `email_domain` ∈ {kochaver.com, middlewest.studio} | 3 (2 / 3) | value-only | Room View / rooms index / room-file view (staging overrides it on) |
| `studio-workspaces` | false | 100% | 2 (2 / 2) | loading-aware (whisper) | account sheet Studio tab, studio-setup whisper |
| `agreement-parts` | false | 100% | 2 (2 / 2) | value-only | account studio page, services addendum action |
| `design-build` | false | 100% | 2 (2 / 2) | value-only | account studio page, agreement composer |
| `worktable` | false | **does not exist** (always false in prod) | 1 (1 / 1): `doc/[id]/page.tsx:1001` | value-only | the speccing-table spread (`TableFrame`, `RoomsRail`, `Scheme`, `BoardsStrip`, `FinalizeHead`, seal turn, release lift); it changes which spread's regions are on the paper |
| `loading-register` | false | 3 `distinct_id`s (Middle West) | 1 (`components/loading/register.tsx`) | loading-aware | the loading register vs. the plain arrival skeleton (`doc/[id]/page.tsx:3401–3408`) |
| `procurement-workspace-pilot` | false | 100% | **0 live** (tests and comments only; `/portal/procurement` no longer exists) | n/a | none; it survives only as the override example in `playwright.config.ts` and the hook docs |
| `the-document-pilot` | — | 100% (still defined) | 0 | n/a | retired. Do **not** revive it (ROLLOUT §2). |
| `threshold` | false | deleted remotely | 2 (2 / 1) | value-only | client-note composer; resolves false in prod |
| `outbound-review`, `studio-invoice` | false | 100% | 1 each | value-only | account studio page; invoice composer |
| `field-line-trades`, `field-line-time-reports`, `design-request-pool`, `room-view-refined-path`, `tester-notes` | false | not read | 1–2 each | value-only, except `tester-notes` | people / field desk / open requests / room view / tester widget |
| `designer-paper-round8` | — | **does not exist yet** | 0 | — | the new renderer flag (this policy) |

Also called from outside the Document group: `board-deck-import`, `board-photo-match`, `board-web-match` and `capture-producer-idempotency`.

Consequences for round 8:
- Every value-only site renders the flag-off variant first, then re-renders when flags arrive. A cold load with no persisted flags therefore *already* shifts layout on `one-voice` and on `worktable`, if it were defined.
- The renderer flag must not behave this way (ROLLOUT §2: "Avoid mounting both large renderers", "no swap that loses drafts").

## 3. Probe evidence

The probe ran the real `posthog-js` 1.359.1 `dist/module.js` (the entry the portal bundles), initialised with the app's exact `posthog.init` options:
- bundled with esbuild into an IIFE;
- driven by Playwright `chromium` (playwright-core 1.58.2) against a route-served page;
- every `*.posthog.com` request intercepted, so nothing left the machine.

Times are measured from `posthog.init()`. Probe code and raw output, kept out of the repo:
`~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1810/probe/` (`entry.js`, `run-probe.js`, `results.json`, `results.log`, `latency.sh`, `latency.log`).

| Scenario | Requests | `isFeatureEnabled` at init | `onFeatureFlags` callbacks | Hook outcome |
|---|---|---|---|---|
| normal (mocked 200, flag on) | config 1, flags 1 | `undefined` | 22 ms, ok, `true` | resolves true |
| `/flags` delayed 800 ms | 1 / 1 | `undefined` | 825 ms, ok, `true` | waits about 0.8 s |
| **DNT** (`navigator.doNotTrack='1'`) | 1 / 1 | `undefined` | 23 ms, ok, `true`; `has_opted_out_capturing()` = **true** | **flags still resolve under DNT.** Only capture is opted out. |
| all hosts aborted (ad-block style) | config 2, flags 1 | `undefined` | 23 ms, `errorsLoading: true`, value `undefined` | settles `{false,false}` fast |
| `/flags` 500 | 1 / 1 | `undefined` | 21 ms, `errorsLoading: true` | settles false fast |
| `/flags` never answers | 1 / 1 | `undefined` | **3012–3021 ms**, `errorsLoading: true` | settles false after the SDK's `feature_flag_request_timeout_ms` = 3000 |
| quota-limited response | 1 / 1 | `undefined` | **none** | **hangs `isLoading:true` forever** (the SDK returns early) |
| config script blackholed | config 1, **flags 0** | `undefined` | **none in 70 s** | **hangs forever.** `/flags` waits on remote config, and the script tag has no timeout. The JSON fallback uses the 60 s request default. |
| identify flip (anon false → identified true) | flags 2 | `undefined` | 43 ms `false`, then 1531 ms `true` (after `identify`) | **the value flips mid-load** |
| reload flip (true → false) | flags 2 | `undefined` | 21 ms `true`, then 1515 ms `false` (after `reloadFeatureFlags`) | **the value flips mid-session** |
| returning tab (persisted on), `/flags` hangs | 2 / 2 | **`true` (synchronous)** | 3012 ms, `errorsLoading:true`, value still `true` | cached value kept through errors |

Other refresh triggers, read from the SDK source map:
- `remote-config.ts` refreshes flags every **5 minutes** while the tab is visible.
- `identify()` to a new id reloads flags.
- `identify()` to the same id with person properties (the app's `AuthTracker` does this on every cold load) calls `setPersonProperties` → `setPersonPropertiesForFlags`, which reloads by default.
- So on an identified cold load `onFeatureFlags` normally fires **twice**. Every reload can change the value.

Real network latency was measured with curl, 6 samples, an anonymous probe id and the public prod key from `wrangler.jsonc`, each request on a cold TLS connection, from the dev machine on broadband. These are the two sequential requests that come before the first callback:
- `config.js`: 0.15–0.28 s;
- `/flags`: 0.14–0.27 s;
- so the chain takes **about 0.30–0.47 s** after init.

Cellular and real-device numbers are **not measured**.

DNT, consent and blocked SDK:
- DNT is not a flag-blocking condition in this SDK version.
- The app has no consent banner or opt-in path; `grep` found no `opt_in_capturing`/`opt_out_capturing` call in app code.
- A blocked SDK either fails fast (abort or 500 gives `errorsLoading`) or never settles (blackhole, quota).
- **The renderer cannot rely on the hook's `isLoading` ever turning false.** It needs its own timeout.

## 4. Recommended latch specification (for WP-01.2)

### Inputs
- `override`: `parseFlagOverride('designer-paper-round8')`. Reuse the existing parser; do not add a second one.
- The PostHog answer, read through the existing `posthog` and `onAnalyticsInit` exports in `@/lib/analytics/posthog`:
  - the synchronous `isFeatureEnabled` value after init;
  - `onFeatureFlags` callbacks with `errorsLoading`;
  - `posthog.on('featureFlagsReloading', …)` (public in 1.359.1);
  - `posthog.get_distinct_id()`.
- `isAnalyticsPossible()`.
- The session user id from `useSessionUserId()`, the same source `AuthTracker` uses.
- The tab latch from `sessionStorage`.

### Decision precedence, made once per full page load (module-scope latch)

1. **Override present** → that renderer, decided at first render with no skeleton. `designer-paper-round8:true` gives round 8; `:false` gives legacy. Never written to storage.
2. **Analytics impossible** (no key, or dev without opt-in) → tab latch if present, else **legacy**, immediately.
3. **Cached identified answer.** At analytics init, if `isFeatureEnabled` is not `undefined` *and* `get_distinct_id()` equals the session user id, **latch that value** (`true` → round 8, `false` → legacy). This is the returning-tab path with zero network wait. A cohort change made since then applies on the next full load, because this load's `/flags` refreshes the cache.
4. **Fresh answer.** Otherwise wait for `onFeatureFlags`:
   - `errorsLoading:false` with value `true` → **latch round 8** immediately.
   - `errorsLoading:false` with value `false` → final only once no reload is pending. Concretely, final when the callback arrives after the last `featureFlagsReloading` event, *and* the distinct id equals the session user. Otherwise it stays provisional and waiting continues. This avoids latching the anonymous answer that comes before `identify()` (probe: false at 43 ms, true at 1531 ms).
   - `errorsLoading:true` → step 5 immediately; no need to wait out the timer.
5. **Timeout or failure** → tab latch if present, else **legacy**. **Timeout = 1500 ms**, measured from the renderer hook's first client effect.
   - Why 1500 ms: it is about 3× the measured cold network chain (0.30–0.47 s); it sits under the SDK's own 3000 ms `/flags` timeout, so a hung `/flags` does not hold the paper for 3 s; and it bounds the quota and blackhole cases, which never settle otherwise.
   - Revisit with pilot telemetry from real devices before widening the cohort.

Once decided, the renderer **never changes within this document**. Later callbacks, the 5-minute refresh and identify reloads are ignored for rendering. Client-side navigations between `/desk` and `/doc/[id]` reuse the module latch. Any new answer that differs is only observed; it shows up on the next full load through step 3.

### States the hook returns

`{ renderer: 'pending' | 'legacy' | 'round8', source: 'override' | 'unavailable' | 'cached' | 'flag' | 'error' | 'timeout' | 'tab' }`

- SSR and the first client render return `'pending'`. The page keeps the existing arrival skeleton or loading register up (`doc/[id]/page.tsx` arrival hold; desk `data-arrival`), reserving the settled-paper layout.
- `'pending'` lasts at most 1500 ms. **Neither frame mounts while pending**, and the two frames never mount together.
- Data hooks start during `pending`, because the page builds its slots once (story contract: one data path).

### Storage

- `sessionStorage['patina:paper-renderer:v1']` = `{ renderer, source, userId, decidedAt }`.
- It is written on every non-override decision.
- It is read **only** as the fallback in steps 2 and 5, and only when `userId` matches. This keeps a pilot user on round 8 through a later network blip in the same tab, and keeps a timed-out tab on legacy across reloads.
- A fresh or cached identified answer (steps 3–4) always beats the tab latch, which keeps the kill switch effective.
- All access goes through `try`/`catch`; storage failure means "no tab latch". Never use `localStorage` (no cross-tab or domain state; story contract).

### Kill-switch latency (ROLLOUT §2: record, do not call it instantaneous)

- An open document **never** switches.
- A full load picks up the new value once that tab's PostHog cache has seen it. The cache refreshes on every load's `/flags` and every 5 min while the tab is visible.
- **Worst case:** the second full load after the change, or the first full load more than about 5 min after the change on a visible tab.
- The server-side delay before PostHog serves an edited flag definition is **not measured** here.
- `NEXT_PUBLIC_FLAG_OVERRIDES` changes need a rebuild and redeploy.

### Fallbacks named

| Case | Renderer |
|---|---|
| DNT on | treated like any other user; flags resolve (measured) |
| SDK blocked fast (abort or 500) | tab latch, else legacy, at about 20 ms |
| SDK blackholed, `/flags` hung, or quota-limited | tab latch, else legacy, at 1500 ms |
| Staging, local dev, e2e (no key) | override if set, else legacy |

### Test cases WP-01.2 must cover

Use jest with `@/lib/analytics/posthog` mocked, following the pattern in `src/hooks/__tests__/use-feature-flag.test.tsx`, plus one Playwright route-block spec under `playwright.round8.config.ts`.

1. Override `:true` gives round 8 on the first render, with no PostHog read and no storage write. Override `:false` gives legacy the same way. A non-literal value such as `TRUE` or `1` gives legacy.
2. With analytics impossible, the hook returns legacy immediately; with a stored tab latch for the same user it returns the tab latch.
3. With a cached identified `true`, round 8 latches at init with no timer. With a cached `false`, legacy latches at init.
4. A cached answer for a *different* distinct id is ignored, and the hook waits for a fresh answer (account switch or shared device).
5. A fresh `true` latches round 8 before the timeout.
6. An anonymous `false`, then `featureFlagsReloading`, then `true` latches round 8 and never shows legacy (the identify flip).
7. `errorsLoading:true` falls back immediately, before 1500 ms.
8. With no callback at all (quota or blackhole), the hook latches legacy at exactly 1500 ms using fake timers.
9. After the latch, a later callback with the opposite value, a reload event or the 5-minute refresh leaves the rendered renderer unchanged, and the frame is not remounted.
10. Client navigation desk → doc → desk keeps the latch with no second pending phase.
11. Storage: write on decision; read only on fallback; a `sessionStorage` throw is tolerated; a mismatched `userId` is ignored.
12. SSR and first render return `pending`, neither frame is mounted, and there is no hydration mismatch.
13. Playwright: abort all PostHog hosts and assert legacy; hold `/flags` and assert legacy at about 1.5 s with no swap afterwards. This needs a build with a non-empty key and the dev opt-in, or the analytics-impossible path short-circuits it.

## 5. Pinned supported combination

**`one-voice` ON, `worktable` OFF**, for the round-8 renderer and its e2e config. The proposal is confirmed by the remote state: one-voice is 100% in prod, and worktable is undefined, so it is always off.

- **`one-voice` on.** Round-8 chapters may assume one-voice copy and acts and need not carry the pre-one-voice variants. The legacy frame keeps reading the flag unchanged. 48 Document-group sites stay as they are; round 8 wraps them and does not fork them.
- **`worktable` off.** The speccing-table spread is not part of the round-8 frame:
  - `TableFrame`, `RoomsRail`, `Scheme`, `BoardsStrip`, `LibraryReachIn`, `FinalizeHead`, `OfferFacets`, `IntakeSpreadHeader`, the seal turn and the release lift.
  - Round 8 should not mount those components or rely on `tablePin.composition`.
  - If worktable is ever defined remotely, round 8 must ignore it rather than render a half-supported spread. The unsupported combination is round 8 with `worktable` on.
- **Other flags stay live** and round 8 must work in both states:
  - `optimistic-ink` and `loading-register` (3 users);
  - `room-file` (email domain);
  - the 100% flags (`agreement-parts`, `agreement-library`, `design-build`, `studio-workspaces`, `ask-the-paper`, `teaching-notes`, `arrival-arc`, `outbound-review`, `studio-invoice`).

  Their sites are value-only, so the round-8 frame inherits their flag-off-then-on render after the latch. That is unchanged behaviour, not something this latch should fix.
- **E2E pin for `playwright.round8.config.ts`.** It is the integration lead's file, so this is a recommendation:

  `NEXT_PUBLIC_FLAG_OVERRIDES=designer-paper-round8:true,one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true`

  The legacy G3 runs set `designer-paper-round8:false`.
- **Create the PostHog flag before pilot** (not in this ticket; a production mutation):
  - key `designer-paper-round8`, boolean;
  - targeted by person `distinct_id` (the `optimistic-ink` pattern) or by `email_domain`;
  - default off for everyone else.

  The client flag is presentation only and never authorizes a server write (ROLLOUT §3).

## 6. What this did not establish

- Real-device and cellular latency. Use pilot telemetry before widening the cohort.
- PostHog's server-side propagation time for a flag edit.
- Behaviour of `posthog-js` versions other than 1.359.1. The `^` range allows upgrades, so re-run the probe on a bump.
- No jest or app Playwright suite was run. The probe exercised the SDK in isolation with the app's init options; the hook's reaction to each callback is read from its source (`setValue` / `setIsLoading(false)` on every callback).
