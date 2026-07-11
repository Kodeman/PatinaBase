#!/usr/bin/env bash
#
# deploy-portal.sh — build a portal's workspace dependencies, then build and
# deploy that portal to Cloudflare Workers via OpenNext.
#
# Usage: ./infra/deploy-portal.sh <client|designer|admin|manufacturer>
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
case "$PORTAL" in
  client|designer|admin|manufacturer) ;;
  *)
    echo "Usage: $0 <client|designer|admin|manufacturer>" >&2
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

echo "==> Deploying portal '${PORTAL}'  (workspace package: ${PKG_NAME})"
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
CLOUDFLARE_ACCOUNT_ID=be3aaeed18a81b5d90ee2263b62219ea npx wrangler deploy

echo
echo "==> Done: ${PORTAL} portal deployed."
