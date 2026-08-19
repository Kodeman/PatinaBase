#!/usr/bin/env bash
# probe-authcheck.sh — positive probe of the edge-api-worker's
# GET /v1/_authcheck contract against production (api.patina.cloud).
#
# Reads the JWT from the PATINA_PROBE_JWT environment variable ONLY — never
# from argv, so it never lands in shell history or `ps`. See
# docs/ops/authcheck-positive-probe.md for what this closes and where to get
# a token.
#
# Usage:
#   PATINA_PROBE_JWT='eyJ...' ./scripts/probe-authcheck.sh
#
# Optional overrides:
#   PATINA_PROBE_HOST — defaults to https://api.patina.cloud

set -euo pipefail

HOST="${PATINA_PROBE_HOST:-https://api.patina.cloud}"
URL="${HOST%/}/v1/_authcheck"

if [[ -z "${PATINA_PROBE_JWT:-}" ]]; then
  echo "error: PATINA_PROBE_JWT is not set." >&2
  echo "  Set it to a Supabase access token before running this script:" >&2
  echo "    PATINA_PROBE_JWT='eyJ...' $0" >&2
  echo "  See docs/ops/authcheck-positive-probe.md for where to get one." >&2
  exit 1
fi

echo "Probing: GET ${URL}" >&2

response="$(
  curl -sS -D - -o /tmp/patina-authcheck-body.$$ -w '\n%{http_code}\n' \
    -H "Authorization: Bearer ${PATINA_PROBE_JWT}" \
    "${URL}"
)"

status="$(printf '%s' "${response}" | tail -n1)"
headers="$(printf '%s' "${response}" | sed '$d')"
body="$(cat /tmp/patina-authcheck-body.$$ 2>/dev/null || true)"
rm -f "/tmp/patina-authcheck-body.$$"

echo "--- response headers ---"
echo "${headers}"
echo "--- status ---"
echo "${status}"
echo "--- body ---"
echo "${body}"

if [[ "${status}" == "200" ]]; then
  echo "" >&2
  echo "PASS: 200 — token verified end to end (JWKS verify -> SET ROLE authenticated -> RLS-scoped SELECT)." >&2
  exit 0
else
  echo "" >&2
  echo "FAIL: expected 200, got ${status}. Per the worker's contract, EVERY failure mode (missing/invalid/expired/wrong-issuer/wrong-audience/wrong-role token, or an unavailable RLS login) collapses to a non-enumerating {\"error\":\"not_found\"} 404 — the body will not say which check failed." >&2
  exit 1
fi
