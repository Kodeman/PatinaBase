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
#
# D-repoint carve-out: the ONE sanctioned divergence is the deliberate
# browser-traffic repoint to the edge API, api.patina.cloud, for the
# DESIGNER portal's PRODUCTION build only — Storage is kept pinned to the
# direct host by packages/supabase/src/client.ts's pinStorageDirect() (see
# that file), so this is not the same failure mode as an accidental
# divergence. A staging build (a DIFFERENT Supabase project) pointed at the
# prod edge API is exactly the cross-project hazard this guard exists to
# catch, so the carve-out must NOT extend to staging or to any other portal
# — anything else still fails CLOSED.
# ---------------------------------------------------------------------------
ALLOWED_RUNTIME_ORIGIN="https://api.patina.cloud"
PREFLIGHT_ORIGIN_RUNTIME="$(resolve_next_public_var SUPABASE_ORIGIN_RUNTIME)"

CARVEOUT_APPLIES=false
if [ "$TARGET_ENV" = "production" ] && [ "$PORTAL" = "designer" ]; then
  CARVEOUT_APPLIES=true
fi

ORIGIN_RUNTIME_OK=false
if [ -z "$PREFLIGHT_ORIGIN_RUNTIME" ] || [ "$PREFLIGHT_ORIGIN_RUNTIME" = "$PREFLIGHT_URL" ]; then
  ORIGIN_RUNTIME_OK=true
elif [ "$CARVEOUT_APPLIES" = "true" ] && [ "$PREFLIGHT_ORIGIN_RUNTIME" = "$ALLOWED_RUNTIME_ORIGIN" ]; then
  ORIGIN_RUNTIME_OK=true
fi

if [ "$ORIGIN_RUNTIME_OK" != "true" ]; then
  echo "ERROR: refusing to build ${PORTAL} portal — SUPABASE_ORIGIN_RUNTIME=" >&2
  echo "       ${PREFLIGHT_ORIGIN_RUNTIME} diverges from the build-time" >&2
  echo "       NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL} this bundle is" >&2
  echo "       compiled against, and it isn't the sanctioned repoint target" >&2
  echo "       for this portal/env. The carve-out (${ALLOWED_RUNTIME_ORIGIN})" >&2
  echo "       applies ONLY to the designer portal's production build" >&2
  echo "       (PORTAL=designer, TARGET_ENV=production) — here PORTAL=${PORTAL}," >&2
  echo "       TARGET_ENV=${TARGET_ENV}. packages/supabase/src/client.ts" >&2
  echo "       resolves the runtime origin FIRST, so this build's client" >&2
  echo "       would silently target a different Supabase project than its" >&2
  echo "       anon key/storage key were compiled for. Align" >&2
  echo "       SUPABASE_ORIGIN_RUNTIME with NEXT_PUBLIC_SUPABASE_URL, or" >&2
  echo "       unset it to inherit the build-time value, before deploying." >&2
  exit 1
fi

if [ -n "$PREFLIGHT_ORIGIN_RUNTIME" ] && [ "$CARVEOUT_APPLIES" = "true" ] && [ "$PREFLIGHT_ORIGIN_RUNTIME" = "$ALLOWED_RUNTIME_ORIGIN" ]; then
  echo "==> [0/3] Preflight OK: RUNTIME REPOINT ACTIVE → ${ALLOWED_RUNTIME_ORIGIN} (storage pinned direct)"
fi

echo "==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=${PREFLIGHT_URL}"
echo "==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=${PREFLIGHT_ORIGIN_RUNTIME:-<unset, inherits build-time URL>})"
echo

# ---------------------------------------------------------------------------
# Phase 0b — export EVERY NEXT_PUBLIC_* the target's wrangler.jsonc declares.
#
# WHY THIS EXISTS
# ---------------
# wrangler.jsonc `vars` are RUNTIME Worker bindings. NEXT_PUBLIC_* is inlined
# into the client bundle at BUILD time from process.env / the app's .env files —
# `next build` never reads wrangler.jsonc. Phase 0 above resolved only the
# Supabase trio, so every other NEXT_PUBLIC_* (PostHog key/host, edge API URL,
# client-portal URL, NEXT_PUBLIC_ENV, ...) was inlined as `undefined` whenever
# the deploy ran from a checkout without .env.local. A worktree deploy on
# 2026-09-11 shipped exactly that: the live bundle kept
# `a.env.NEXT_PUBLIC_POSTHOG_KEY` as a runtime property access, PostHog never
# initialized, and all 13 fail-closed flags went dark while the Supabase URL
# (trio-guarded) was a correct literal — so nothing looked broken.
#
# Values resolve through the SAME machinery/precedence as the trio
# (exported process.env > .env.production.local > .env.local > .env.production
# > .env), with the committed wrangler.jsonc literal as a final fallback so a
# checkout without .env.local builds the same bundle a main-checkout deploy
# would. The Supabase trio is deliberately EXCLUDED from that fallback: its
# fail-closed empty check above is what stops a worktree from shipping a
# white-screen build, and a wrangler fallback would silently defeat it.
# ---------------------------------------------------------------------------
echo "==> [0b/3] Preflight: exporting NEXT_PUBLIC_* declared in wrangler.jsonc"

WRANGLER_CONFIG="$APP_DIR/wrangler.jsonc"
if [ ! -f "$WRANGLER_CONFIG" ]; then
  echo "ERROR: wrangler config not found: $WRANGLER_CONFIG" >&2
  exit 1
fi

# The three NEXT_PUBLIC_* keys whose emptiness is silent in prod: PostHog going
# dark takes every fail-closed feature flag with it, and an empty edge API URL
# dead-ends the scan read path. Required ONLY when the portal's own vars block
# declares them — manufacturer declares none of them, admin declares no
# NEXT_PUBLIC_EDGE_API_URL.
REQUIRED_WRANGLER_NEXT_PUBLIC_KEYS=" NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST NEXT_PUBLIC_EDGE_API_URL "

read_wrangler_next_public_vars() {
  # $1 = wrangler.jsonc path, $2 = production|staging.
  # Emits KEY<NUL>VALUE<NUL> for every NEXT_PUBLIC_* var in the ACTIVE vars
  # block. Wrangler does not inherit `vars` into a named environment — an env
  # block that declares vars replaces the top-level block wholesale — so
  # staging reads env.staging.vars and nothing else.
  node - "$1" "$2" <<'NODE'
const fs = require('fs');
const [file, targetEnv] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');

// String-aware JSONC comment stripper. A naive /\/\/.*/ replace eats the `//`
// inside every "https://..." value and silently yields empty vars.
let out = '';
let i = 0;
while (i < src.length) {
  const c = src[i];
  if (c === '"') {
    out += c;
    i++;
    while (i < src.length) {
      if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      out += src[i];
      i++;
      if (src[i - 1] === '"') break;
    }
    continue;
  }
  if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
  if (c === '/' && src[i + 1] === '*') {
    i += 2;
    while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
    i += 2;
    continue;
  }
  out += c;
  i++;
}
out = out.replace(/,(\s*[}\]])/g, '$1');

const cfg = JSON.parse(out);
const vars = targetEnv === 'staging'
  ? ((cfg.env && cfg.env.staging && cfg.env.staging.vars) || {})
  : (cfg.vars || {});

let buf = '';
for (const key of Object.keys(vars)) {
  if (key.indexOf('NEXT_PUBLIC_') !== 0) continue;
  buf += key + '\0' + String(vars[key]) + '\0';
}
process.stdout.write(buf);
NODE
}

mask_value() {
  # $1 = value. Prints a non-recoverable preview: the prefix up to and
  # including the first `_` (when that prefix is short enough to be a real
  # tag like `phc_`) plus 4 more characters.
  mv_value="$1"
  if [ -z "$mv_value" ]; then
    printf '<empty>'
    return 0
  fi
  mv_head=""
  case "$mv_value" in
    *_*)
      mv_candidate="${mv_value%%_*}_"
      if [ ${#mv_candidate} -le 8 ] && [ ${#mv_candidate} -lt ${#mv_value} ]; then
        mv_head="$mv_candidate"
      fi
      ;;
  esac
  mv_rest="${mv_value#"$mv_head"}"
  printf '%s%s…(%d chars)' "$mv_head" "$(printf '%s' "$mv_rest" | cut -c1-4)" "${#mv_value}"
}

WRANGLER_VAR_NAMES=()
WRANGLER_VAR_VALUES=()
# Read straight from the process substitution — no temp file to leak or to be
# denied. `set -e` cannot see a failure inside a process substitution, so the
# empty-result guard below is what makes a parse failure fail CLOSED.
while IFS= read -r -d '' wv_name && IFS= read -r -d '' wv_value; do
  WRANGLER_VAR_NAMES+=("$wv_name")
  WRANGLER_VAR_VALUES+=("$wv_value")
done < <(read_wrangler_next_public_vars "$WRANGLER_CONFIG" "$TARGET_ENV")

if [ "${#WRANGLER_VAR_NAMES[@]}" -eq 0 ]; then
  echo "ERROR: no NEXT_PUBLIC_* vars found in ${WRANGLER_CONFIG} for env '${TARGET_ENV}'." >&2
  echo "       Every portal declares at least NEXT_PUBLIC_SUPABASE_URL — this almost" >&2
  echo "       certainly means the JSONC parse produced an empty vars block." >&2
  exit 1
fi

# Captured for the post-build chunk gate (Phase 2.6).
PREFLIGHT_POSTHOG_KEY=""
MISSING_REQUIRED_KEYS=""

wv_index=0
while [ "$wv_index" -lt "${#WRANGLER_VAR_NAMES[@]}" ]; do
  wv_name="${WRANGLER_VAR_NAMES[$wv_index]}"
  wv_literal="${WRANGLER_VAR_VALUES[$wv_index]}"
  wv_index=$((wv_index + 1))

  case "$wv_name" in
    NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_STORAGE_KEY)
      wv_allow_fallback=false
      ;;
    *)
      wv_allow_fallback=true
      ;;
  esac

  wv_resolved="$(resolve_next_public_var "$wv_name")"
  wv_source="env"
  if [ -z "$wv_resolved" ] && [ "$wv_allow_fallback" = "true" ]; then
    wv_resolved="$wv_literal"
    wv_source="wrangler.jsonc"
  fi

  export "$wv_name=$wv_resolved"

  if [ "$wv_name" = "NEXT_PUBLIC_POSTHOG_KEY" ]; then
    PREFLIGHT_POSTHOG_KEY="$wv_resolved"
  fi

  case "$REQUIRED_WRANGLER_NEXT_PUBLIC_KEYS" in
    *" $wv_name "*)
      if [ -z "$wv_resolved" ]; then
        MISSING_REQUIRED_KEYS="$MISSING_REQUIRED_KEYS $wv_name"
      fi
      ;;
  esac

  case "$wv_name" in
    *KEY|*TOKEN|*SECRET) wv_display="$(mask_value "$wv_resolved")" ;;
    *) wv_display="${wv_resolved:-<empty>}" ;;
  esac
  printf '    %-46s = %-24s [%s]\n' "$wv_name" "$wv_display" "$wv_source"
done

if [ -n "$MISSING_REQUIRED_KEYS" ]; then
  if [ "$TARGET_ENV" = "staging" ]; then
    # Staging deliberately ships an empty NEXT_PUBLIC_POSTHOG_KEY (PostHog is
    # off there; NEXT_PUBLIC_FLAG_OVERRIDES compensates) — see the comment on
    # that var in wrangler.jsonc. Requiring it would block every staging deploy.
    echo "==> [0b/3] NOTE: staging leaves these intentionally empty:${MISSING_REQUIRED_KEYS}"
  else
    echo "ERROR: refusing to build ${PORTAL} portal — these NEXT_PUBLIC_* vars are" >&2
    echo "       declared in ${WRANGLER_CONFIG} (env '${TARGET_ENV}') but resolved EMPTY:" >&2
    echo "      ${MISSING_REQUIRED_KEYS}" >&2
    echo "       next build would inline them as undefined. An empty PostHog key" >&2
    echo "       means PostHog never initializes and every fail-closed feature flag" >&2
    echo "       goes dark; an empty NEXT_PUBLIC_EDGE_API_URL dead-ends the scan" >&2
    echo "       read path. Give them real values in wrangler.jsonc's vars block" >&2
    echo "       (or export them) before deploying." >&2
    exit 1
  fi
fi

echo "==> [0b/3] Preflight OK: ${#WRANGLER_VAR_NAMES[@]} NEXT_PUBLIC_* vars exported into the build env"
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
# Phase 2.6 — client-chunk gate: prove NEXT_PUBLIC_* actually got inlined.
#
# The served-chunk grep was previously a manual post-deploy step (the
# 2026-08-26 placeholder incident: a literal "<wrangler.jsonc value>" reached
# three prod chunks and broke sign-in for ~14 minutes). Doing it BEFORE the
# deploy is the whole point — a bundle that still carries the env var's NAME
# instead of its value never reaches Cloudflare.
# ---------------------------------------------------------------------------
CHUNKS_DIR="$APP_DIR/.open-next/assets/_next/static/chunks"
if [ ! -d "$CHUNKS_DIR" ]; then
  echo "ERROR: built client chunks not found: $CHUNKS_DIR" >&2
  exit 1
fi

CHUNK_TOTAL="$(find "$CHUNKS_DIR" -name '*.js' -type f | wc -l | tr -d ' ')"
# `grep -rl` exits 1 on no match; under `set -e`/pipefail that would abort the
# script before we can report the (good) zero count.
POSTHOG_NAME_HITS="$(grep -rl 'NEXT_PUBLIC_POSTHOG_KEY' "$CHUNKS_DIR" 2>/dev/null | wc -l | tr -d ' ' || true)"
echo "==> [2.6/3] Chunk gate: ${CHUNK_TOTAL} client chunks; NEXT_PUBLIC_POSTHOG_KEY name survives in ${POSTHOG_NAME_HITS}"

if [ "$POSTHOG_NAME_HITS" -ne 0 ]; then
  echo "ERROR: refusing to deploy ${PORTAL} portal — ${POSTHOG_NAME_HITS} client chunk(s)" >&2
  echo "       still contain the literal text NEXT_PUBLIC_POSTHOG_KEY, i.e. the build" >&2
  echo "       left it as a runtime property access (a.env.NEXT_PUBLIC_POSTHOG_KEY)" >&2
  echo "       instead of inlining a value. PostHog would never initialize and every" >&2
  echo "       fail-closed feature flag would be dark. Offending chunks:" >&2
  grep -rl 'NEXT_PUBLIC_POSTHOG_KEY' "$CHUNKS_DIR" 2>/dev/null | sed 's/^/         /' >&2 || true
  exit 1
fi

if [ -n "$PREFLIGHT_POSTHOG_KEY" ]; then
  POSTHOG_VALUE_HITS="$(grep -rlF "$PREFLIGHT_POSTHOG_KEY" "$CHUNKS_DIR" 2>/dev/null | wc -l | tr -d ' ' || true)"
  echo "==> [2.6/3] Chunk gate: resolved PostHog key literal present in ${POSTHOG_VALUE_HITS} chunk(s)"
  if [ "$POSTHOG_VALUE_HITS" -eq 0 ]; then
    echo "ERROR: refusing to deploy ${PORTAL} portal — the resolved PostHog key" >&2
    echo "       ($(mask_value "$PREFLIGHT_POSTHOG_KEY")) appears in ZERO client chunks." >&2
    echo "       The value never made it into the bundle, so PostHog is dark in this" >&2
    echo "       build. Check that Phase 0b exported it before the OpenNext build." >&2
    exit 1
  fi
else
  echo "==> [2.6/3] Chunk gate: PostHog key intentionally empty for '${TARGET_ENV}' — value check skipped"
fi
echo

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
