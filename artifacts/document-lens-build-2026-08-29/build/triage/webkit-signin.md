# webkit sign-in triage — W4-int PROD run

## Verdict: (c), with a real (a)-shaped mechanism that does not reach production

WebKit against the production standalone server on `http://localhost:3000` never
hydrates the sign-in page at all, because **every static asset request — every
JS chunk, the CSS, the fonts — gets rewritten by WebKit from `http://localhost:3000/...`
to `https://localhost:3000/...` and then fails with a TLS error**, since nothing
listens on TLS at `:3000`. Chromium does not rewrite these requests and loads
everything over plain HTTP as served. **`app.patina.cloud` is unaffected** — it is
already HTTPS, so the same CSP directive that trips this up locally is a no-op
there, and WebKit renders and would sign in normally.

## Evidence

Four probes (`build/triage/*.png`, raw JSON in the fork's scratch — reproducible
via the script logged in `e2e-baseline.md` under "Commands run unsandboxed
(triage-webkit-auth)"):

| engine | target | title loads | buttons found | failed requests | `main` innerHTML |
|---|---|---|---|---|---|
| chromium | local :3000 | yes | "Email me a one-time code", "Continue with Apple", "Use email and password instead" | 0 | 16123 chars |
| **webkit** | **local :3000** | yes (SSR shell) | **none** | **41**, all `A TLS error caused the secure connection to fail` at `https://localhost:3000/_next/static/...` | **12066 chars** (SSR only, unhydrated) |
| chromium | app.patina.cloud (signed-out) | yes | same three buttons | 0 (1 unrelated CSP block, see below) | 16123 chars |
| webkit | app.patina.cloud (signed-out) | yes | same three buttons | 0 | 16123 chars |

The 41 webkit-local failures are a complete list of every asset the page
requests — `webpack-*.js`, `main-app-*.js`, every numbered chunk, `app/layout-*.js`,
`app/auth/signin/page-*.js`, all three CSS bundles, all six font files. None of
them loaded, so the client bundle (including the auth-page component) never
ran, so `PortalLogin`'s buttons never mounted. This is not a slow load the
fixture's 15s timeout was merely too short for — a fifth probe waiting a full
30s idle after `networkidle` shows nothing changes; the requests are already
terminally failed, not pending.

`curl -sD - -o /dev/null http://localhost:3000/auth/signin` shows the response
header:

```
Content-Security-Policy: default-src 'self'; ...; upgrade-insecure-requests
```

`next.config.js:138-140`:

```js
// Only upgrade insecure requests in production
if (!isDevelopment) {
  cspDirectives.push('upgrade-insecure-requests');
}
```

`upgrade-insecure-requests` is deliberately dev-gated — `next dev` never sends
it, which is exactly why "webkit signs in fine against `next dev`" (per the
finding) and only breaks against a production build. Per the CSP spec,
`upgrade-insecure-requests` should not apply to requests whose target is
already a *potentially trustworthy origin* — and `localhost`/`127.0.0.1` are
defined as potentially trustworthy regardless of scheme (the same rule that
lets browsers treat `http://localhost` as a secure context for other APIs).
Chromium honors that exemption here; **WebKit does not** — it upgrades the
`localhost` subresource requests to HTTPS anyway. `curl -sk https://localhost:3000/`
confirms there is no TLS listener at all on `:3000` (connection failure, exit
`000`), so every one of those upgraded requests is a guaranteed, total failure,
not something flaky or timing-dependent.

## The fixture's wait, confirmed

`apps/designer-portal/e2e/fixtures/auth.ts` waits for
`page.getByRole('button', { name: /sign in with email|use email and password instead/i })`
after `page.goto('/auth/signin?callbackUrl=%2Fdesk', { waitUntil: 'networkidle' })`.
That button is `PortalAuth.tsx`'s "Use email and password instead" disclosure
(`packages/patina-design-system/src/components/PortalAuth/PortalAuth.tsx:575`),
rendered unconditionally by `PortalLogin` whenever `state !== 'code'` — there is
no hydration gate, PostHog-flag gate, or `matchMedia` gate on it at all. It is
absent from the DOM only because the whole client bundle that would render it
never executed. The fixture's selector and 15s wait are correct; there is
nothing for it to find.

## The one unrelated, pre-existing finding

Both engines also log a CSP block of
`https://static.cloudflareinsights.com/beacon.min.js/...` on `app.patina.cloud`
only (`script-src` lacks that host — Cloudflare's own RUM beacon, not
PostHog). It fires identically on chromium and webkit and does not affect
sign-in or button rendering; noted for completeness, out of scope here.

## Smallest fix

Not a product bug — `PortalAuth.tsx` and the dev-gated CSP in
`next.config.js` are both behaving as designed, and real Safari users at
`app.patina.cloud` are not affected (confirmed above: webkit against the real
HTTPS origin renders and would sign in normally). The defect is in the
**local production-parity serving recipe** used for this harness run: it
serves a CSP that promises HTTPS (`upgrade-insecure-requests`) over a server
that only speaks plain HTTP, which WebKit — alone among the two engines this
suite runs — takes literally for `localhost` too.

Two fixes, in order of effort:

1. **Cheapest — strip the directive for this local recipe only.** When
   serving `.next/standalone` locally for a webkit e2e pass, drop
   `upgrade-insecure-requests` from the response (a tiny proxy in front of
   `node server.js`, or an env flag the CSP builder already has a branch for
   `isDevelopment` to key off of) so the header matches what the plain-HTTP
   local server can actually deliver. Does not touch product code paths that
   ship.
2. **More faithful — serve the local production build over real TLS**
   (self-signed cert via `mkcert`, or a local reverse proxy terminating TLS in
   front of `node server.js`), matching production's actual scheme. This also
   closes the gap for any other scheme-sensitive behavior (mixed content,
   Secure cookies, `Strict-Transport-Security`) the plain-HTTP recipe is
   currently blind to.

Either way: **this is a test-harness gap, not a Wave 4 lens defect, and not a
production sign-in defect** — `app.patina.cloud` signs in fine on WebKit today.
The W4-int PROD run's webkit basket should be recorded as blocked by this
harness gap (not "no webkit signal") and re-run once the local recipe serves a
CSP it can actually satisfy.
