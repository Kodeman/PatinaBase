# Authcheck positive probe

Closes the last owed Phase-1 verification row: a documented, repeatable way
to confirm `GET /v1/_authcheck` on the edge-api-worker returns a genuine
`200` for a real, valid Supabase access token — not just a `404` for every
input, which is trivially true and proves nothing on its own.

Script: `scripts/probe-authcheck.sh`. Read-only against prod — it makes one
GET request and prints the result; it performs no mutation anywhere.

## The contract (from `infra/edge-api-worker/src/index.ts`)

Route: `GET /v1/_authcheck`, handled by `handleAuthCheck` (index.ts:316-339).

1. The worker calls `verifyAuthenticated` (`withVerifiedSupabaseTransaction`,
   `src/auth.ts`), which:
   - Reads the token from the `Authorization: Bearer <token>` header.
   - Verifies it as a JWT against `env.SUPABASE_JWKS_URL`, requiring
     `RS256`/`ES256`, the configured issuer (`env.SUPABASE_JWT_ISSUER`) and
     audience (`env.SUPABASE_JWT_AUDIENCE`, normally `authenticated`), a
     present `sub` claim, and `payload.role === 'authenticated'` (an
     `anon`-role token is rejected here even if otherwise well-formed).
   - On success, opens a database transaction as the `authenticated` role
     with the verified claims applied (`SET ROLE authenticated` +
     `set_config('request.jwt.claims', ...)`), then runs one data-free
     query: `SELECT current_user, current_setting('request.jwt.claims', true)`.
     The row is discarded — nothing from the database is ever returned to
     the caller. This exercises the full verified-JWT -> RLS-scoped-login
     chain without touching any application table.
2. **Success** (source: `index.ts:338`): `200`, JSON body `{"ok": true}`.
3. **Any failure** (source: `index.ts:331-337`) — missing token, invalid
   signature, expired token, wrong issuer, wrong audience, wrong role (e.g.
   an anon-key token), or the RLS login being unavailable — **all of these
   collapse to the exact same response**: `404`, JSON body
   `{"error": "not_found"}`. This is deliberate and non-enumerating: the
   worker never returns a `500` from this path, and it never reveals which
   check failed or any claim/user detail behind a token that didn't pass.
   A `404` from this endpoint is therefore consistent with several different
   root causes (bad token, expired token, misconfigured worker) — it does
   not by itself prove the endpoint is broken.

Both responses carry `cache-control: private, no-store` and an
`x-patina-trace-id` header (`privateJson`, `index.ts:73-81`) — no shared
cache should ever retain either response.

**Why a positive probe matters**: the ladder can look "done" by proving the
404 path (any garbage token) without ever proving the 200 path (a real,
currently-valid token actually clears JWKS verification, issuer/audience
match, and the RLS-scoped DB round trip on production). This script and doc
close that gap.

## How to get a token

1. Sign into any Patina portal as a normal user (designer, admin, or client
   portal at `app.patina.cloud` / `admin.patina.cloud` — any portal backed by
   Supabase Auth against prod works, since the token is a plain Supabase
   session token, not portal-specific).
2. app.patina.cloud stores the session in a **cookie**, not localStorage
   (`@supabase/ssr` cookie-based storage). Open browser DevTools →
   **Application** tab (Chrome) or **Storage** tab (Firefox) → **Cookies** →
   the site's origin (e.g. `https://app.patina.cloud`).
3. Find the cookie named **`sb-bkvcixdmuyejfzcijpdg-auth-token`**
   (`bkvcixdmuyejfzcijpdg` is the Strata/prod Supabase project ref — do not
   use a cookie with a different ref, that would be a local or staging
   session). This project's session is a single, unchunked cookie — there is
   no `.0`/`.1`-suffixed pair to reassemble here.
4. Copy the cookie's value. It is `base64-`-prefixed base64url-encoded JSON
   — decode it and pull the `access_token` field out of the result. That is
   the JWT to use, NOT the raw cookie value and NOT the `refresh_token`
   field. Pasting `document.cookie` into the console and hand-picking the
   field is messy (the string is URL-encoded and shares the line with every
   other cookie); the reliable path is: DevTools copy the single cookie
   value, then decode it in a terminal:
   ```bash
   node -e '
   const raw = "PASTE_COOKIE_VALUE_HERE";
   const json = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8"));
   console.log(json.access_token);
   '
   ```
   The decoded JSON has the same shape Supabase has always used:
   ```json
   {
     "access_token": "eyJhbGciOiJSUzI1NiIs...",
     "token_type": "bearer",
     "expires_in": 3600,
     "expires_at": 1755555555,
     "refresh_token": "...",
     "user": { "...": "..." }
   }
   ```
5. The token is short-lived (`expires_in` is typically 3600s) — grab it
   right before running the probe, not from an old copy.

Treat this token like a password while it's live: it authenticates as your
real signed-in user. Don't paste it anywhere outside your own terminal/env
var, don't commit it, and don't put it in `argv` (the script deliberately
only reads it from an environment variable so it never appears in shell
history or `ps aux`).

## Running the probe

`/v1/_authcheck` deliberately serves no CORS headers and returns a `404` for
an `OPTIONS` preflight — a browser-origin `fetch()` against it (from the
DevTools console or any page JS) can never succeed, by design. This is not a
gap to route around by finding the right headers; it means the probe is
terminal-only, always run outside the browser:

```bash
PATINA_PROBE_JWT='eyJhbGciOiJSUzI1NiIs...' ./scripts/probe-authcheck.sh
```

Expected output on success:

```
Probing: GET https://api.patina.cloud/v1/_authcheck
--- response headers ---
HTTP/2 200
cache-control: private, no-store
x-patina-trace-id: <uuid>
content-type: application/json; charset=utf-8
...
--- status ---
200
--- body ---
{"ok":true}

PASS: 200 — token verified end to end (JWKS verify -> SET ROLE authenticated -> RLS-scoped SELECT).
```

The script exits `0` on a `200` and `1` on anything else, so it's safe to
use in a quick pass/fail check.

## If it doesn't come back 200

Per the contract above, a `404` here is non-enumerating by design — the
worker will not tell you why. Work through these in order rather than
guessing from the response body:

1. **Token expired** — re-copy `access_token` from localStorage; it may have
   rotated since you copied it (grab it again right before running).
2. **Wrong project/ref** — confirm the cookie was
   `sb-bkvcixdmuyejfzcijpdg-auth-token` (prod), not a local
   (`sb-127...`/`sb-localhost...`) or staging-ref cookie.
3. **Copied the wrong field** — must be `access_token`, not `refresh_token`
   or the raw decoded JSON blob.
4. **Worker-side**: the RLS login (`DB_FRESH` Hyperdrive binding) could be
   unavailable — this collapses to the same 404, so a genuinely valid token
   still won't clear if that binding is down. Check
   `GET /_internal/health` (Access-gated — see `isHealthAuthorized` in
   `src/auth.ts`) or worker logs (`patina-prod-ops` skill) rather than
   retrying the probe blind.

## What this does and does not verify

Verifies (positive case): JWKS-based signature verification against prod's
issuer/audience is reachable and correct, an `authenticated`-role Supabase
session token is accepted, and the worker can open an RLS-scoped DB
transaction as that role and run a query against prod — the full chain the
Phase-1 router relies on.

Does not verify: the catalog-serving paths (`/v1/catalog/products`), the
proxy/compatibility paths, or any specific application data access — this
probe is deliberately data-free by the endpoint's own design.
