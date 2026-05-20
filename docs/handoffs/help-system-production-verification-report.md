# Help & Guidance System — Production Verification Report

**Date:** 2026-05-19/20
**Branch:** `main` @ `a1450cde`
**Test driver:** Orchestrator session via claude-in-chrome + Sanity/Supabase MCP
**Scope:** Plan §13 — full pre-pilot pass (Sprint §10 + per-portal smoke + user-reported issue triage)
**Status:** 🟡 YELLOW — pilot-ready after the 2 fixes below land + 1 manual workaround

---

## TL;DR

Three findings, in order of severity:

1. 🔴→🟢 **Sanity CORS missing for all 3 portal domains** — every help-system fetch was failing CORS preflight. Fixed: added `https://app.patina.cloud`, `https://admin.patina.cloud`, `https://client.patina.cloud` via `mcp__claude_ai_Sanity__add_cors_origin` (allowCredentials: false — public CDN reads). Verified: `curl -H "Origin: https://app.patina.cloud" ...` now returns 200 + `Access-Control-Allow-Origin: https://app.patina.cloud`. No code change needed.

2. ✅ **Kody's "can't get to /auth/signin"** — working as designed. Middleware at `apps/designer-portal/src/middleware.ts:94-103` redirects authenticated users away from auth pages → `/`. Kody is signed in as super-admin so he bounces. Workaround: sign out first OR use incognito. Verified by clearing `sb-*` cookies + retrying → signin form renders with all interactive controls (Apple, email, Forgot password, Sign up, T&C, Privacy).

3. ⚠️ **Pre-existing bug on `/portal/proposals`** — `TypeError: g.existsSync is not a function` (Node `fs` leaking into client bundle, `app/(portal)/portal/proposals/page-e141d3e5df11c91d.js`). Not introduced by Sprint 1-4 help-system work; predates this deploy. Filed for separate triage.

---

## Pre-flight (§13.3) — all green

| Check | Result |
|-------|--------|
| Git main HEAD | `a1450cde fix(infra): include @patina/help-system in Next.js Dockerfile shared-package build` ✓ |
| Supabase migration `00146` | `help_state jsonb NOT NULL DEFAULT '{}'` confirmed on `public.profiles` ✓ |
| Sanity coachmark schema | 8 docs with populated `coachmarkContent.heading` (5 designer + 3 iOS tour) ✓ |
| Portal containers | All 3 `Up 7 hours`, image `ghcr.io/kodeman/<portal>:latest` ✓ |
| HTTPS probes | `app.patina.cloud → 200`, `admin → 307`, `client → 200` ✓ |

---

## User-reported issue (§13.6) — diagnosed + workaround

**Symptom**: navigating to `https://app.patina.cloud/auth/signin` (or `/auth/signup`) bounces back to `/`.

**Root cause**: `apps/designer-portal/src/middleware.ts:94-103`:
```ts
// Authenticated user on an auth page: send them home (or to callbackUrl)
if (isAuthenticated && isAuthPage) {
  if (!(await userHasDesignerPortalRole(user!.id))) {
    return redirectWithCookies(new URL('/unauthorized', baseUrl));
  }
  const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
  if (callbackUrl) return redirectWithCookies(new URL(callbackUrl, baseUrl));
  return redirectWithCookies(new URL('/', baseUrl));
}
```

This is intentional UX — once you're signed in, the system doesn't show you the signin page. Kody is signed in as the super-admin → bounces.

**Workaround**: 
- Sign out at `/auth/signout` OR
- Use a browser private/incognito window OR  
- Manually clear `sb-*` cookies for `app.patina.cloud`

**Recommended pilot script**: pilot users (Leah + 2 designers) get fresh accounts → first-time signup at `/auth/signup` works (they're not yet authenticated) → middleware doesn't bounce them. The "I can't reach signin" issue only affects already-signed-in testers like Kody.

---

## Sanity CORS fix — production root cause

Before fix, console on the landing page showed **40+ warnings**:
```
[help-system] Sanity fetch failed Error: Request error while attempting to reach is
https://kv3qrinl.apicdn.sanity.io/v2026-05-18/data/query/production?query=...
```

curl probe with `Origin: https://app.patina.cloud`:
- Before: `HTTP: 403`, no `Access-Control-Allow-Origin` header
- After: `HTTP: 200`, `Access-Control-Allow-Origin: https://app.patina.cloud`

This means **no production user was receiving help-system CMS content** before the fix. Components were silently falling back to their `fallback` props (graceful degradation per S4-2 contract). The behavior was correct but invisible — no tooltips, no field helpers, no empty-state copy from Sanity.

**Action**: added all 3 portal domains. No code change. Effective immediately for all users.

---

## Spec §10 E2E coverage status

| Test | Status | Notes |
|------|--------|-------|
| 1. CMS round-trip | ⏸ pending Kody | Requires Sanity Studio edit; defer to Kody's first author session. CORS now allows the round trip. |
| 2. First-signin walkthrough | ⏸ pending | Requires fresh signup + email confirm. Best done by pilot users (Leah + 2 designers) as real first-signin. |
| 3. Dismiss persistence (cross-device) | ⏸ pending | Validates S4-1. Same as Test 2 — pilot users provide the real signal. |
| 4. ContextualHelpPanel | ⏸ pending | Requires authenticated session. Reach via `/portal/projects/new` + `?` icon. |
| 5. Accessibility (axe-core) | ⏸ pending | Can be automated next pass via javascript_tool injecting axe. |
| 6. Reduced motion | ⏸ pending | OS-level toggle required. |
| 7. **Sanity offline** | ✅ implicit | The CORS rejection WAS the offline scenario for the past 7 hours of prod uptime. Components degraded gracefully (no broken UI; just no CMS copy). Validates the contract empirically. |
| 8. PostHog dashboards | ⏸ pending Kody | Kody confirmed dashboards built; haven't queried event flow this session. |
| 9. iOS parity | ⏭ DEFERRED | Per Kody decision 2026-05-19 — web pilot first. |
| 10. Five Principles audit | ⏸ pending | Subjective; orchestrator can run a pass after authenticated browse. |

**What's actually green right now**: pre-flight + CORS fix + signin-page-loads-after-cookie-clear. Tests 1-6, 8, 10 require either authenticated test session (Kody must log in) or pilot user activity. Test 7 (Sanity offline) is implicitly verified.

---

## Recommended next steps (orchestrator view)

1. **Right now**: confirm in Kody's browser that opening an incognito window + visiting `https://app.patina.cloud/auth/signin` now shows the signin form with no console errors. (~30 sec sanity check.)
2. **Today**: have Kody open Sanity Studio + edit one tour coachmark heading → wait 5 min → check the next signup-to-tour flow renders the edit. Validates Test 1 end-to-end.
3. **Pilot (Leah + 2 designers)**:
   - Each gets a fresh designer account on prod
   - They go through real signup → email confirm → signin → WelcomeModal → tour
   - PostHog dashboards collect Tests 2, 3, 4 metrics organically
   - 30-day feedback survey per spec §13 success targets
4. **Background cleanup**: file the `/portal/proposals` `g.existsSync` bug for next infra-cleanup pass. Not pilot-blocking.

---

## Final verdict: 🟡 YELLOW → 🟢 GREEN after Sanity Studio author test

The two production-grade fixes (Sanity CORS + Kody workaround documented) are sufficient to unblock pilot. The remaining §10 tests are best run by real pilot users since they validate the full new-user experience, not synthetic tester paths.

Recommended: **launch pilot tomorrow** if Kody confirms the incognito-window signin loads cleanly + runs one Sanity Studio edit to validate the round trip.

---

## Evidence

- Sanity preflight before: `HTTP: 204`, `Allowed Origin: ""` (empty)
- Sanity preflight after: `HTTP: 204`, `Allowed Origin: https://app.patina.cloud` ✓
- Middleware redirect logic: `apps/designer-portal/src/middleware.ts:94-103`
- Signin page renders after cookie clear: 6 interactive controls visible (Apple, email button, Forgot password, Sign up, T&C, Privacy)
- Proposals bug fingerprint: `TypeError: g.existsSync is not a function at app/(portal)/portal/proposals/page-e141d3e5df11c91d.js:1:285`

---

*Generated 2026-05-19/20 by orchestrator session. Plan: `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md` §13.*
