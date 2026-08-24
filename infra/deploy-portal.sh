#!/usr/bin/env bash
#
# deploy-portal.sh — build a portal's workspace dependencies, then build and
# deploy that portal to Cloudflare Workers via OpenNext.
#
# Usage: ./infra/deploy-portal.sh <client|designer|admin|manufacturer> [production|staging]
#
# WHY THIS SCRIPT EXISTS
# ----------------------
# Portals used to be deployed by running `opennextjs-cloudflare build` directly
# in the app directory. That bypasses Turborepo's `^build` dependency graph, so
# a STALE workspace package dist (e.g. packages/utils/dist compiled before a new
# source file was added) could be bundled into the worker. That is exactly how
# `TypeError: proposalTierVisibility is not a function` reached production: the
# client portal shipped a @patina/utils dist that predated proposal-visibility.ts.
#
# This script rebuilds ONLY the target app's workspace dependencies first
# (`turbo build --filter=<pkg>^...`), so the package dists bundled into the
# worker are always fresh. Deploy portals THROUGH this script — never via a raw
# `opennextjs-cloudflare build`.

set -euo pipefail

PORTAL="${1:-}"
TARGET_ENV="${2:-production}"
case "$PORTAL" in
  client|designer|admin|manufacturer) ;;
  *)
    echo "Usage: $0 <client|designer|admin|manufacturer>" >&2
    exit 2
    ;;
esac

case "$TARGET_ENV" in
  production) WRANGLER_ENV_ARGS=() ;;
  staging) WRANGLER_ENV_ARGS=(--env staging) ;;
  *)
    echo "Usage: $0 <client|designer|admin|manufacturer> [production|staging]" >&2
    exit 2
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_DIR="$REPO_ROOT/apps/${PORTAL}-portal"

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: app directory not found: $APP_DIR" >&2
  exit 1
fi

# Read the app's REAL workspace package name from its package.json — never guess.
PKG_NAME="$(node -e "process.stdout.write(require('$APP_DIR/package.json').name)")"
if [ -z "$PKG_NAME" ]; then
  echo "ERROR: could not read package name from $APP_DIR/package.json" >&2
  exit 1
fi

echo "==> Deploying portal '${PORTAL}' to '${TARGET_ENV}'  (workspace package: ${PKG_NAME})"
echo

# ---------------------------------------------------------------------------
# Phase 0 — preflight: fail closed on a broken client Supabase env.
#
# WHY THIS GUARD EXISTS
# ---------------------
# Deploy d8f8f1be was built in a git worktree that had no apps/<portal>/.env.local,
# so `next build` inlined EMPTY NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
# into the client bundle. createBrowserClient() then threw "URL and API key are
# required" on every route and app.patina.cloud served a white-screen "This page
# couldn't load". This guard refuses to build unless BOTH values resolve non-empty
# AND the URL is not local-pointed — so a worktree/local build can never ship again.
#
# Resolution mirrors what `next build` actually sees: an already-exported
# process.env value wins (that is precisely the environment the child build
# inherits, and Next never overrides a value already in process.env); otherwise
# the highest-precedence app env file that defines the var, in Next order
# .env.production.local > .env.local > .env.production > .env.
# ---------------------------------------------------------------------------
echo "==> [0/3] Preflight: resolving client Supabase env the way next build will"

resolve_next_public_var() {
  # $1 = variable name. Prints the resolved value (possibly empty) to stdout.
  var_name="$1"

  # 1) An exported process.env value wins. printenv reports ONLY exported vars,
  #    which is exactly the environment a spawned `next build` inherits; if the
  #    var is exported (even to an empty string), Next uses it and never lets an
  #    env file override it.
  if exported_val="$(printenv "$var_name")"; then
    printf '%s' "$exported_val"
    return 0
  fi

  # 2) Otherwise walk the app's env files in Next precedence order; the first
  #    file that defines the var wins.
  for env_file in \
    "$APP_DIR/.env.production.local" \
    "$APP_DIR/.env.local" \
    "$APP_DIR/.env.production" \
    "$APP_DIR/.env"; do
    [ -f "$env_file" ] || continue
    # Take the last assignment in the file (dotenv last-wins). Match an optional
    # leading `export ` and require `=` immediately after the name so we never
    # match a longer key. Split on the FIRST `=` only, so values that themselves
    # contain `=` (e.g. JWT-style anon keys) survive intact.
    line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${var_name}=" "$env_file" | tail -n 1 || true)"
    [ -n "$line" ] || continue
    val="${line#*${var_name}=}"
    # Strip one layer of matching surrounding quotes, mirroring dotenv.
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    printf '%s' "$val"
    return 0
  done

  # Defined nowhere → empty.
  printf '%s' ''
  return 0
}

PREFLIGHT_URL="$(resolve_next_public_var NEXT_PUBLIC_SUPABASE_URL)"
PREFLIGHT_ANON="$(resolve_next_public_var NEXT_PUBLIC_SUPABASE_ANON_KEY)"
# D-B1 (docs/engineering/repoint-b0-audit.md §5): the pinned auth-cookie
# storage key. Same var as the client.ts/extension pin — resolved here too
# because NEXT_PUBLIC_* is build-time-inlined, so a wrangler.jsonc-only value
# is invisible to `next build`; see the fail-closed check below.
PREFLIGHT_STORAGE_KEY="$(resolve_next_public_var NEXT_PUBLIC_SUPABASE_STORAGE_KEY)"

if [ -z "$PREFLIGHT_URL" ] || [ -z "$PREFLIGHT_ANON" ]; then
  echo "ERROR: refusing to build ${PORTAL} portal — NEXT_PUBLIC_SUPABASE_URL and/or" >&2
  echo "       NEXT_PUBLIC_SUPABASE_ANON_KEY resolved EMPTY for ${APP_DIR}." >&2
  echo "       next build would inline empty values and createBrowserClient() would" >&2
  echo "       throw 'URL and API key are required' on every route (white-screen)." >&2
  echo "       Likely cause: building in a worktree without .env.local. Build from a" >&2
  echo "       checkout that has apps/${PORTAL}-portal/.env.local (prod Supabase values)." >&2
  exit 1
fi

case "$PREFLIGHT_URL" in
  *localhost*|*127.0.0.1*)
    echo "ERROR: refusing to build ${PORTAL} portal — resolved NEXT_PUBLIC_SUPABASE_URL" >&2
    echo "       points at a local host (${PREFLIGHT_URL}). Refusing to ship a" >&2
    echo "       local-pointed build to production. Check apps/${PORTAL}-portal/.env.local." >&2
    exit 1
    ;;
esac

# A staging build must be compiled against the Strata staging branch. Portal
# env files have historically pointed at production, and NEXT_PUBLIC_* values
# are baked into the bundle, so Wrangler's staging vars cannot repair a build
# that was compiled against the wrong Supabase project.
if [ "$TARGET_ENV" = "staging" ]; then
  EXPECTED_STAGING_SUPABASE_URL="https://vuesoyhfrjabfxbrzekd.supabase.co"
  if [ "$PREFLIGHT_URL" != "$EXPECTED_STAGING_SUPABASE_URL" ]; then
    echo "ERROR: refusing to build ${PORTAL} portal for staging — resolved" >&2
    echo "       NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL}" >&2
    echo "       Expected the Strata staging branch at" >&2
    echo "       ${EXPECTED_STAGING_SUPABASE_URL}." >&2
    echo "       Export the staging NEXT_PUBLIC_SUPABASE_URL and anon key before" >&2
    echo "       invoking this script; do not rely on a production .env.local." >&2
    exit 1
  fi
fi

# D-B1 (docs/engineering/repoint-b0-audit.md §5): the auth-cookie storage key
# must be pinned, not left to derive from NEXT_PUBLIC_SUPABASE_URL's host —
# otherwise a URL repoint (or a bad wrangler.jsonc edit) silently renames the
# cookie every client/worker expects and mass-logs-out every session. Refuse
# to ship a build whose resolved storage key doesn't match EITHER what
# @supabase/ssr would derive from the resolved URL today (the un-repointed
# default) OR the canonical pinned literal (the value that must survive a
# future repoint) — anything else is an unexplained divergence between what
# this build's client bundle will use and what every other portal/the
# extension expects.
CANONICAL_STORAGE_KEY="sb-bkvcixdmuyejfzcijpdg-auth-token"
url_host="${PREFLIGHT_URL#*://}"
url_host="${url_host%%/*}"
url_host="${url_host%%:*}"
DERIVED_STORAGE_KEY="sb-${url_host%%.*}-auth-token"

if [ -z "$PREFLIGHT_STORAGE_KEY" ]; then
  echo "ERROR: refusing to build ${PORTAL} portal — NEXT_PUBLIC_SUPABASE_STORAGE_KEY" >&2
  echo "       resolved EMPTY for ${APP_DIR}. next build would inline an empty" >&2
  echo "       storage key and packages/supabase/src/client.ts's in-code fallback" >&2
  echo "       (${CANONICAL_STORAGE_KEY}) would silently take over instead — set it" >&2
  echo "       explicitly in wrangler.jsonc's vars (or apps/${PORTAL}-portal/.env.local" >&2
  echo "       for a local build) so it stays visible and greppable." >&2
  exit 1
elif [ "$PREFLIGHT_STORAGE_KEY" != "$DERIVED_STORAGE_KEY" ] && [ "$PREFLIGHT_STORAGE_KEY" != "$CANONICAL_STORAGE_KEY" ]; then
  echo "ERROR: refusing to build ${PORTAL} portal — resolved" >&2
  echo "       NEXT_PUBLIC_SUPABASE_STORAGE_KEY=${PREFLIGHT_STORAGE_KEY}" >&2
  echo "       matches neither the URL-derived default for the resolved URL" >&2
  echo "       (${DERIVED_STORAGE_KEY}, from NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL})" >&2
  echo "       nor the canonical pinned literal (${CANONICAL_STORAGE_KEY})." >&2
  echo "       This looks like an unintentional client/worker divergence — the" >&2
  echo "       cookie name this build's client bundle uses would not match what" >&2
  echo "       every other portal and the extension expect. Fix" >&2
  echo "       apps/${PORTAL}-portal/wrangler.jsonc's NEXT_PUBLIC_SUPABASE_STORAGE_KEY." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# D-B2 (docs/engineering/repoint-b0-audit.md): runtime-resolved origin check.
#
# apps/*/src/app/layout.tsx emits globalThis.__PATINA_SUPABASE_ORIGIN from a
# server-read SUPABASE_ORIGIN_RUNTIME env var (falling back to the same
# build-time NEXT_PUBLIC_SUPABASE_URL already validated above).
# packages/supabase/src/client.ts resolves that global AT
# CLIENT-CONSTRUCTION TIME, ahead of NEXT_PUBLIC_SUPABASE_URL — so if
# SUPABASE_ORIGIN_RUNTIME is ever set to something other than the build-time
# URL, every browser Supabase call in this build would silently target a
# DIFFERENT project than the one the bundle's anon key/storage key were
# compiled against. That's a broken-auth failure mode as bad as the
# empty-env white-screen this preflight already guards, so it must fail
# CLOSED rather than ship a cross-project client. SUPABASE_ORIGIN_RUNTIME is
# unset everywhere today (this wave changes no value), so this check is inert
# until a future repoint sets it.
# ---------------------------------------------------------------------------
PREFLIGHT_ORIGIN_RUNTIME="$(resolve_next_public_var SUPABASE_ORIGIN_RUNTIME)"
if [ -n "$PREFLIGHT_ORIGIN_RUNTIME" ] && [ "$PREFLIGHT_ORIGIN_RUNTIME" != "$PREFLIGHT_URL" ]; then
  echo "ERROR: refusing to build ${PORTAL} portal — SUPABASE_ORIGIN_RUNTIME=" >&2
  echo "       ${PREFLIGHT_ORIGIN_RUNTIME} diverges from the build-time" >&2
  echo "       NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL} this bundle is" >&2
  echo "       compiled against. packages/supabase/src/client.ts resolves the" >&2
  echo "       runtime origin FIRST, so this build's client would silently" >&2
  echo "       target a different Supabase project than its anon key/storage" >&2
  echo "       key were compiled for. Align SUPABASE_ORIGIN_RUNTIME with" >&2
  echo "       NEXT_PUBLIC_SUPABASE_URL, or unset it to inherit the" >&2
  echo "       build-time value, before deploying." >&2
  exit 1
fi

echo "==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL}"
echo "==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=${PREFLIGHT_ORIGIN_RUNTIME:-<unset, inherits build-time URL>})"
echo

# ---------------------------------------------------------------------------
# Phase 1 — rebuild this app's workspace dependencies (the stale-dist guard).
# ---------------------------------------------------------------------------
echo "==> [1/3] Building workspace dependencies via Turborepo"
echo "    turbo build --filter=${PKG_NAME}^...  builds ONLY this app's"
echo "    dependencies (packages/utils, packages/patina-design-system, ...),"
echo "    guaranteeing fresh package dists so no stale dist is bundled into the"
echo "    worker. This is the guard against the stale-dist crash."
cd "$REPO_ROOT"
pnpm turbo build --filter="${PKG_NAME}^..."

# ---------------------------------------------------------------------------
# Phase 2 — build the OpenNext (Cloudflare Workers) bundle for the app.
# ---------------------------------------------------------------------------
echo
echo "==> [2/3] Building OpenNext bundle for the ${PORTAL} portal"
cd "$APP_DIR"
OPEN_NEXT=true NODE_ENV=production npx opennextjs-cloudflare build

# ---------------------------------------------------------------------------
# Phase 2.5 — bundle size gate (fail-closed backstop for the manifest dedupe;
# Cloudflare rejects workers >64MB uncompressed with error 10027).
# ---------------------------------------------------------------------------
HANDLER="$APP_DIR/.open-next/server-functions/default/apps/${PORTAL}-portal/handler.mjs"
if [ ! -f "$HANDLER" ]; then
  echo "ERROR: expected bundle not found: $HANDLER" >&2
  exit 1
fi
HANDLER_BYTES=$(wc -c < "$HANDLER" | tr -d ' ')
echo "==> [2.5/3] handler.mjs size: ${HANDLER_BYTES} bytes"
if [ "$HANDLER_BYTES" -gt $((55 * 1024 * 1024)) ]; then
  echo "ERROR: handler.mjs exceeds 55MiB — manifest dedupe likely regressed" >&2
  echo "       (see scripts/dedupe-client-reference-manifests.mjs)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Phase 3 — deploy the worker.
# ---------------------------------------------------------------------------
echo
echo "==> [3/3] Deploying the ${PORTAL} portal to Cloudflare Workers"
# The `[@]+` guard is required, not cosmetic: macOS ships bash 3.2, where
# expanding an EMPTY array as "${arr[@]}" under `set -u` aborts with
# "unbound variable". WRANGLER_ENV_ARGS is empty for production, so the
# unguarded form broke every production deploy while staging (non-empty)
# kept working.
CLOUDFLARE_ACCOUNT_ID=be3aaeed18a81b5d90ee2263b62219ea npx wrangler deploy ${WRANGLER_ENV_ARGS[@]+"${WRANGLER_ENV_ARGS[@]}"}

echo
echo "==> Done: ${PORTAL} portal deployed to ${TARGET_ENV}."
