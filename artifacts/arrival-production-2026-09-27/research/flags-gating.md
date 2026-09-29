# Flag gating + analytics recon for the project-arrival cinematic

Angle: feature-flag gating and analytics for shipping the cinematic "project
arrival" mockup (`artifacts/designer-portal-motion-2026-09-25/design/cinematic`)
behind a flag, ON only for Kody, OFF for everyone else.

## (a) The hook API, fail-closed behaviour, flash-avoidance, override parsing

Two hooks, same rules, in `apps/designer-portal/src/hooks/`:

- **`useFeatureFlag(flagName: string): { value: boolean; isLoading: boolean }`**
  — `use-feature-flag.ts:114-178`. Single flag.
- **`useFeatureFlags(names: readonly string[]): Record<string, FeatureFlagState>`**
  — `use-feature-flags.ts:46-116`. Batched, same semantics, stable identity
  until a value actually changes (`sameStates`, `use-feature-flags.ts:26-32`).
- **`isTeachingNotesEnabled(): boolean`** — `use-feature-flags.ts:118-132`, a
  synchronous non-React escape hatch for code outside a component (a
  QueryClient `MutationCache` subscriber). Same override→PostHog fallback,
  collapsed to a single boolean (loading counts as off). Worth copying this
  pattern if the arrival needs a flag read from outside React (e.g. inside a
  route loader or the ceremony/desk assembly logic before first paint).

**Resolution order (both hooks), `use-feature-flag.ts:114-175`:**
1. `parseFlagOverride(flagName)` (`use-feature-flag.ts:49-63`) — parses
   `process.env.NEXT_PUBLIC_FLAG_OVERRIDES`, format `flag-a:true,flag-b:false`,
   comma-separated, trimmed. If the flag is listed, that value is final —
   `isLoading: false` immediately, PostHog is never consulted.
2. If not overridden: `isAnalyticsEnabled()` (PostHog already initialized) →
   read `posthog.isFeatureEnabled(flagName)` immediately (may resolve from a
   cached previous-session value), then subscribe to `posthog.onFeatureFlags`.
3. If not yet initialized but `isAnalyticsPossible()` is true (key present,
   and either prod or `NEXT_PUBLIC_POSTHOG_ENABLE_IN_DEV=true` in dev) → wait
   on `onAnalyticsInit()` (queues until `initPostHog()` runs, then does step 2)
   — this is the fix for the effect-order race documented at
   `use-feature-flag.ts:88-112`.
4. If `isAnalyticsPossible()` is false (no key, or dev without the opt-in) →
   settle `{ value: false, isLoading: false }` immediately. **Terminal
   fail-closed state**, not a hang.

**Default / fail-closed:** initial state is `{ value: false, isLoading: true }`
unless overridden (`use-feature-flag.ts:119-120`). An unknown, deleted, or
unreadable flag resolves to `false`, never `true` — there is no fail-open path
anywhere in this hook.

**Flash-avoidance pattern** (`use-feature-flag.ts:11-29,76-79`): consumers must
render a skeleton/`null` while `isLoading` is true and only branch on `value`
once loading has resolved, so a pilot user deep-linking into a gated route
doesn't see a "flag off" flash before PostHog answers. Canonical examples:
`components/document/ceremony/ceremony-surface.tsx:62-63` (own flag,
`arrival-arc` — see collision note in (d)) and
`components/document/rooms/room-view/room-view.tsx:151` (`room-file`).

**Override parsing detail:** `parseFlagOverride` (`use-feature-flag.ts:49-63`)
splits on `,`, then on the *first* `:` in each entry (`entry.indexOf(':')`),
trims both sides, and does `value === 'true'` (anything else, including
`'false'` or garbage, becomes `false`). It must stay a literal
`process.env.NEXT_PUBLIC_FLAG_OVERRIDES` member expression (comment,
`use-feature-flag.ts:50-51`) — Next.js only inlines that exact static form,
so it cannot be read via a variable or `process.env[x]`.

## (b) Per-user evaluation mechanisms that exist today, without PostHog

I found four independent, already-shipped mechanisms in this codebase for
gating something to one person or role, none of which touch PostHog:

1. **`NEXT_PUBLIC_FLAG_OVERRIDES` (build-time, environment-wide, not
   per-user).** Set in `wrangler.jsonc` `vars` (prod: absent at top level,
   present in the `staging` env block, `wrangler.jsonc:111`,
   `"room-file:true"`) or in `playwright.config.ts:104-105` for CI. This flips
   the flag for **every visitor of that deployed environment**, not one
   account — it is an environment escape hatch (CI, staging), not a
   per-designer one. Not usable as-is for "Kody only in prod."

2. **`useUserRoles()` + role-domain checks, from `@patina/supabase`** —
   `packages/supabase/src/hooks/use-permissions.ts`. Existing derived hooks:
   `useIsAdmin()` (`:393-402`, role domain `admin`), `useIsSuperAdmin()`
   (`:409-418`, role name `super_admin`), `useIsStudioOwner()` (`:420-451`,
   role name `studio_owner`). All follow the same shape: `{ isX: false,
   isLoading: true }` while `useUserRoles()` loads, else a `.some()` check
   over the loaded role rows. **This is a real per-user, DB-table-backed gate
   with no PostHog dependency** — it reads `user_roles`/`roles` (via
   whatever `useUserRoles()` queries; I did not open that query body this
   pass — not confirmed which table/RPC it hits). It fails closed while
   loading (`isLoading: true` → treat as off), matching the
   `useFeatureFlag` contract.
   Precedent for using it to gate a UI purely to Kody:
   `components/document/feedback/feedback-detail.tsx:1-9,48` — the
   status-triage controls render only for `useIsSuperAdmin()`, with the
   comment "render only for a super_admin (Kody) — that admin gate is the
   whole answer to 'where does Kody triage'." The RPCs also enforce this
   server-side (same file, comment), so the client check is UX-only, not the
   security boundary — same posture the arrival gate would need (nothing
   sensitive is protected, so a client-only check is fine here).

3. **A literal user-id/email allowlist checked against the session** — no
   existing helper does exactly this in the designer portal (I found no
   `ALLOWLIST`/`ALLOWED_USER` constant gating a feature to one hardcoded id),
   but the primitive it would need already exists and is used elsewhere:
   `useAuth()` (`src/hooks/use-auth.ts:7-45`) returns `session.user.{id,
   email}` from Supabase auth (`app_metadata`/`user_metadata` merge,
   `:26-29`). A one-line `session?.user?.id === KODY_USER_ID` check composed
   with `useFeatureFlag`'s existing `isLoading` semantics would be a new,
   trivial mechanism — not something to import, something to write.

4. **`app_metadata.roles` / `user_metadata.roles`, `.role` claims already on
   the Supabase JWT** — read in three places: `use-auth.ts:26-27` (roles
   array, designer-portal auth shape), `lib/auth.ts:40` (same, NextAuth-shim
   file — **do not model new gating on this file**, this app's auth is
   Supabase-only per repo policy; `lib/auth.ts` looks like a leftover/adapter
   and this pass did not confirm it's live), and
   `lib/analytics/PostHogProvider.tsx:66` (`user_metadata?.role` fed into
   `identifyUser` as the PostHog person property, not used for gating). A
   `user_metadata.role === 'designer'` check would not distinguish Kody from
   any other designer — not useful alone for a single-account gate.

5. **`middleware.ts:10-32`** — a server-side (Edge middleware) precedent for
   role-domain gating with an explicit fail-open comment ("Fails open on
   missing service-role key or transient errors so a misconfigured shell or
   DB blip doesn't lock users out," `:24-25`). This is the one fail-open
   example in the portal and is **not** the pattern to copy for the arrival —
   the arrival should fail closed like every `useFeatureFlag` consumer.

**Kody's identity, for building option 3 or 4** (found in repo docs, not
verified live against Strata this pass — flag as **not confirmed** against
the live DB):
- User id `74056c2a-866d-42b0-9e2a-d473c2484316`, email `kody@kochaver.com`
  — `artifacts/invoice-standalone-2026-09-06/delivery/ship/deploy-report-part1.md:147`.
- **Correction to the task's premise:** that same line states Kody is *not*
  a member of Middle West Studio (`7ba72774-fcdb-48cd-9135-b02a5d432628`,
  Leah's real production studio) — he is the owner of a separate studio,
  "Middle Studio" (`bb1d4d5a-67bb-4446-8e75-709e34dc0a4c`). The angle brief
  says "studio Middle West / designer role" for Kody; the one file:line I
  found in the repo says the opposite. **Not confirmed** which is current —
  worth a direct question to Kody rather than assuming either.

## (c) State of PostHog API access on this machine

`ls -la ~/.config/patina/` (names only, no values read):
```
env/                    (directory, mode 700)
sanity-tokens.env       (file, mode 600)
```
**No PostHog personal-API-key file exists under `~/.config/patina/`.**

MEMORY.md (this session's auto-memory, not repo-verified) states the most
recent attempt to touch PostHog flags programmatically — SQ-318, widening the
`teaching-notes` rollout — is **BLOCKED**: "admin-portal personal key has no
scopes," and the owed follow-up is "widen/mint PostHog key (feature_flag:read
+write, person:read) then re-dispatch SQ-318." I could not find a repo file
corroborating the specific missing scopes (searched `artifacts/` for
`SQ-318`/`feature_flag:read`; no hit in `return-teaching-2026-09-25`). Treat
the scope detail as **not confirmed** by this recon, though the absence of
any key file under `~/.config/patina/` is consistent with "no working
personal key."

`artifacts/return-teaching-2026-09-25/build/ship-notes.md:58-61` (the most
recent gated-feature ship) instructs a **human, UI-side** PostHog step:
> "Create the feature flag `teaching-notes` **off**, then release it to Kody
> only."
This confirms creating/targeting a flag was done by hand in the PostHog
dashboard for the most recent precedent, not via API — consistent with no
working write-scoped key existing in this environment right now.

## (d) Recommended gating design — Kody-only, OFF for everyone else, instant kill, no PostHog write access needed

**Do not reuse the flag name `arrival-arc`.** It already exists and gates an
unrelated, already-shipped feature — the Match Ceremony / lead-to-Document
onboarding flow (`components/document/ceremony/ceremony-surface.tsx:5-21`,
`components/document/triage-bar.tsx:88`,
`components/document/open-requests-strip.tsx:242`). Reusing it would either
turn on the wrong feature for existing arrival-arc users, or accidentally gate
the new arrival on the ceremony's rollout state. Pick a distinct name —
something like `project-arrival` or `desk-arrival-cinematic`.

**Recommended shape**, composing existing primitives, zero new PostHog
dependency:

```ts
// e.g. src/hooks/use-project-arrival-enabled.ts
const KODY_USER_ID = '74056c2a-866d-42b0-9e2a-d473c2484316'; // confirm before shipping

export function useProjectArrivalEnabled(): { value: boolean; isLoading: boolean } {
  const override = parseFlagOverride('project-arrival');   // kill switch (see below)
  const { session, isLoading } = useSession();              // @patina/supabase
  if (override !== undefined) return { value: override, isLoading: false };
  if (isLoading) return { value: false, isLoading: true };  // fail-closed while resolving
  return { value: session?.user?.id === KODY_USER_ID, isLoading: false };
}
```

This mirrors `useFeatureFlag`'s exact contract (`{value, isLoading}`,
fail-closed default, override checked first) so every existing consumer
pattern (skeleton-while-loading, `.value` branch) transfers unchanged, and it
needs neither a PostHog flag nor a working PostHog key.

- **Instant fail-closed lever, without a redeploy:** none exists purely
  client-side without a rebuild, because `NEXT_PUBLIC_*` is inlined at build
  time (`AGENTS.md` "Environment" section; confirmed by the wrangler.jsonc
  comments at `wrangler.jsonc:44-50,95-100`: "a wrangler-vars-only value is
  INVISIBLE to `next build`"). The two real levers, both already-used
  patterns:
  - **Env-var override kill switch** — add `project-arrival:false` to
    `NEXT_PUBLIC_FLAG_OVERRIDES` in the prod `vars` block of
    `wrangler.jsonc` and run `./infra/deploy-portal.sh designer` (the
    documented rollback drill for `SUPABASE_ORIGIN_RUNTIME`,
    `wrangler.jsonc:65-66`, took "36s wall including propagation +
    verification" for a comparable var flip — same mechanism, same order of
    magnitude). This is a deploy, not instant, but it is the standing pattern
    (`NEXT_PUBLIC_FLAG_OVERRIDES` is not currently set at all in the prod
    top-level `vars` block — only in the `staging` env block,
    `wrangler.jsonc:111` — so adding it there is new, not an edit).
  - **Delete the user-id check** (revert the one-line `KODY_USER_ID`
    comparison to `false`) and redeploy — equally a deploy, not instant.
  - **True zero-deploy instant kill** requires either (i) a PostHog flag
    (client polls PostHog on an interval / next `onFeatureFlags` — PostHog
    flags do NOT need a rebuild, they're read at runtime, unlike
    `NEXT_PUBLIC_*`), or (ii) a DB-backed check (a `studio_settings`-style
    row or a `user_roles`-style table read via Supabase, which *is* runtime
    and requires no rebuild — same category as `useIsSuperAdmin()`). If an
    instant, no-redeploy kill matters more than avoiding PostHog write
    access, a DB-row gate (read-only, e.g. a boolean on the designer's
    profile row, flipped via SQL) beats the hardcoded-id approach on that
    one axis while still needing no PostHog scope.

**If a PostHog flag is preferred instead** (steps, matching the
`teaching-notes` precedent at `ship-notes.md:58-61` exactly):
1. In the PostHog dashboard (human step — no working write-scoped key exists
   here per (c)), create flag `project-arrival`, default **off**.
2. Add a release condition targeting Kody only — by `distinct_id`/person
   property. Since `identifyUser()` (`posthog.ts:202-213`) calls
   `posthog.identify(userId, {...})` with the Supabase `user.id` as the
   PostHog distinct_id, the release condition can target
   `distinct_id = 74056c2a-866d-42b0-9e2a-d473c2484316` directly, no custom
   property needed.
3. Ship the component behind `useFeatureFlag('project-arrival')` (or
   `useFeatureFlags` if bundled with other new flags) exactly like every
   other gated surface — no code changes beyond the flag name.
4. Rollback is "turn the flag off" in the dashboard — but note the same lag
   documented for `teaching-notes` (`ship-notes.md:113-116`): PostHog
   persists flag values across page loads, so an open tab that already
   evaluated `true` keeps that value until its next load; this is inherent
   to `useFeatureFlag`'s caching, not something to fix per-flag.
5. Widening later to a rollout cohort is then a dashboard-only change
   (percentage rollout / additional person-property condition) — this is the
   main advantage over the hardcoded-id approach, which requires a code
   change + redeploy to add a second user.

## (e) Analytics event naming convention, for arrival_shown / arrival_advanced / arrival_skipped

Two competing conventions coexist in the codebase; pick per how personal the
event is.

**Convention 1 — flat snake_case, `domain_verb`, general product events**
(`lib/analytics/events.ts:4-49`): `product_view`, `product_search`,
`client_create`, `field_connect_open`. Properties are snake_case too:
`product_id`, `query_length`, `result_count`, `filter_type`. A `track()`
helper (`events.ts:4-7`) wraps `posthog.capture` and no-ops when
`!isAnalyticsEnabled()` — every domain-events file in
`lib/analytics/*-events.ts` (studio, procurement, spec-book, people, schedule,
room, nomination, ffe, mood-board, library-configuration,
capture-extension, plan-room, document) follows this shape.

**Convention 2 — dotted namespace, for the teaching/help system**
(`lib/analytics/teaching-events.ts:33-39`): `help.teaching_note.shown`,
`help.teaching_note.dismissed`, `help.teaching_note.acted`,
`help.teaching_note.receded`, `help.teaching_changes.opened`. This namespace
is reserved for events that must go through the **person-less named PostHog
instance** (`teaching-events.ts:1-26` — `person_profiles: 'never'`,
`'memory'` persistence, a `teaching-anon-<uuid>` bootstrap id, a denylist of
SDK autocapture properties at `:64-100+`) because teaching content must never
be tied to an identified designer. **This constraint does not apply to the
arrival** — it is not personless content, so Convention 1 is the right model.

**Recommendation for the three requested events**, matching Convention 1 and
the existing `reason` enum pattern already used at
`teaching-events.ts:41-49` (`reason?: "closed" | "retired_max" |
"superseded" | "expired"`) and the `_ms`-suffixed numeric property style used
elsewhere for durations (e.g. `SETTLE_MS`, `held_ms` as named in the task is
consistent with that suffix convention, not confirmed as an existing property
key anywhere — this would be a new but idiomatic name):

```ts
// lib/analytics/arrival-events.ts
export const arrivalEvents = {
  shown: (properties?: Record<string, unknown>) => track('arrival_shown', properties),
  advanced: (reason: 'input' | 'timeout', heldMs: number) =>
    track('arrival_advanced', { reason, held_ms: heldMs }),
  skipped: (properties?: Record<string, unknown>) => track('arrival_skipped', properties),
};
```

Call `track()` from `events.ts:4-7` (or add a same-shaped local helper) —
these events carry nothing sensitive (no project id needed if `project_view`
already logs that on the surface the arrival lands in), so they need none of
`teaching-events.ts`'s person-less machinery or `posthog.ts`'s bearer-path
redaction (`posthog.ts:70-133`) — that redaction is a `before_send` hook on
the shared instance and applies automatically to every `posthog.capture`
call regardless of which file issues it, so no arrival-specific work is
needed there either.

## Gaps / not confirmed

- Which table/RPC `useUserRoles()` (`packages/supabase/src/hooks/
  use-permissions.ts`) actually queries — did not open its body this pass.
- The PostHog personal-key missing-scopes detail from MEMORY.md
  (`feature_flag:read+write`) — asserted by session memory, not found in any
  repo file this pass.
- Whether Kody's designer account is currently a member of Middle West
  Studio or "Middle Studio" — one repo doc (2026-09-06) says Middle Studio;
  the task brief says Middle West. Contradiction not resolved here.
- Whether `lib/auth.ts` (the file using `user_metadata.roles` with a
  NextAuth-shaped return) is dead code or still imported anywhere live in
  the designer portal — not checked this pass.
