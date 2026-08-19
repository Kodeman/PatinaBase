#!/usr/bin/env bash
#
# run-sql-tests.sh — bulk runner for supabase/tests/**/*.sql
#
# Runs every SQL test file under supabase/tests/ against the local Supabase
# Postgres instance (default 127.0.0.1:54322), collects a per-file exit code,
# and prints a pass/fail table. Files listed in supabase/tests/KNOWN_FAILURES.md
# are treated as expected-fail (their exit code does not affect the script's
# overall exit code) as long as a reason is recorded for them.
#
# Written for bash 3.2 (macOS system bash) compatibility: no associative
# arrays, no mapfile/readarray, no `read -d ''`.
#
# Usage:
#   scripts/run-sql-tests.sh [options]
#
# Options:
#   -d, --dir DIR         Root directory to search for *.sql files
#                          (default: supabase/tests)
#   -k, --known FILE       KNOWN_FAILURES allowlist file
#                          (default: <dir>/KNOWN_FAILURES.md)
#   -H, --host HOST        Postgres host, also passed to psql as -v HOST=
#                          (default: 127.0.0.1, or $PGHOST if set)
#   -p, --port PORT        Postgres port, also passed to psql as -v PORT=
#                          (default: 54322, or $PGPORT if set)
#   -f, --filter PATTERN   Only run files whose path matches this substring
#   -v, --verbose          On failure, print the full psql output (not just tail)
#   -h, --help             Show this help and exit
#
# Environment:
#   PGURL   Full connection string. Overrides host/port-derived URL if set.
#
# Exit status:
#   0  every file passed, or failed only in ways documented in KNOWN_FAILURES.md
#   1  at least one file failed unexpectedly (not in KNOWN_FAILURES.md)
#   2  usage / environment error (e.g. psql not found, test dir missing)

set -u
set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd -P)"

TEST_DIR="${REPO_ROOT}/supabase/tests"
KNOWN_FAILURES_FILE=""
HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-54322}"
FILTER=""
VERBOSE=0

usage() {
  sed -n '2,36p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dir)
      TEST_DIR="$2"; shift 2 ;;
    -k|--known)
      KNOWN_FAILURES_FILE="$2"; shift 2 ;;
    -H|--host)
      HOST="$2"; shift 2 ;;
    -p|--port)
      PORT="$2"; shift 2 ;;
    -f|--filter)
      FILTER="$2"; shift 2 ;;
    -v|--verbose)
      VERBOSE=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2 ;;
  esac
done

if [[ -z "${KNOWN_FAILURES_FILE}" ]]; then
  KNOWN_FAILURES_FILE="${TEST_DIR}/KNOWN_FAILURES.md"
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found on PATH" >&2
  exit 2
fi

if [[ ! -d "${TEST_DIR}" ]]; then
  echo "error: test directory not found: ${TEST_DIR}" >&2
  exit 2
fi

PGURL="${PGURL:-postgresql://postgres:postgres@${HOST}:${PORT}/postgres}"

LOG_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t run-sql-tests)"
trap 'rm -rf "${LOG_DIR}"' EXIT

# ---------------------------------------------------------------------------
# Parse KNOWN_FAILURES.md into a normalized "path<TAB>reason" file.
# Recognized line format (one entry per file):
#   - `relative/path/to/file.sql` — reason text
# The dash before the reason may be an em dash (—) or a plain hyphen (-). A
# reason is required (non-empty after trimming) — the header promises one,
# so a line with nothing after the dash is NOT treated as allowlisted.
# Fenced code blocks (``` ... ```) are skipped entirely, so the format
# example the header shows inside its own fence is never read as an entry.
# Lines that don't match are ignored (headings, prose, blank lines).
# bash 3.2 has no associative arrays, so membership/reason lookup is done by
# grepping this normalized file instead of an in-memory map.
# ---------------------------------------------------------------------------
KNOWN_NORMALIZED="${LOG_DIR}/known_failures.normalized"
: > "${KNOWN_NORMALIZED}"

if [[ -f "${KNOWN_FAILURES_FILE}" ]]; then
  in_fence=0
  while IFS= read -r line; do
    if [[ "${line}" =~ ^\`\`\` ]]; then
      in_fence=$((1 - in_fence))
      continue
    fi
    [[ ${in_fence} -eq 1 ]] && continue
    if [[ "${line}" =~ ^-\ \`([^\`]+)\`[[:space:]]*[—-][[:space:]]*(.*)$ ]]; then
      rel_path="${BASH_REMATCH[1]}"
      reason="${BASH_REMATCH[2]}"
      # trim trailing/leading whitespace before requiring non-empty
      reason="${reason#"${reason%%[![:space:]]*}"}"
      reason="${reason%"${reason##*[![:space:]]}"}"
      [[ -z "${reason}" ]] && continue
      printf '%s\t%s\n' "${rel_path}" "${reason}" >> "${KNOWN_NORMALIZED}"
    fi
  done < "${KNOWN_FAILURES_FILE}"
fi

known_reason_for() {
  # Prints the reason and returns 0 if $1 is a known-failure path, else returns 1.
  local rel="$1"
  local hit
  hit="$(grep -F -m1 -- "$(printf '%s\t' "${rel}")" "${KNOWN_NORMALIZED}" 2>/dev/null || true)"
  if [[ -z "${hit}" ]]; then
    return 1
  fi
  printf '%s' "${hit#*$'\t'}"
  return 0
}

# ---------------------------------------------------------------------------
# Collect test files (newline-delimited; no filenames in this tree contain
# newlines, so a plain read loop is safe and avoids bash4-only mapfile/-d '').
# ---------------------------------------------------------------------------
FILES_LIST="${LOG_DIR}/files.list"
find "${TEST_DIR}" -type f -name '*.sql' | sort > "${FILES_LIST}"

if [[ ! -s "${FILES_LIST}" ]]; then
  echo "error: no .sql files found under ${TEST_DIR}" >&2
  exit 2
fi

RUN_LIST="${LOG_DIR}/run.list"
if [[ -n "${FILTER}" ]]; then
  grep -F -- "${FILTER}" "${FILES_LIST}" > "${RUN_LIST}" || true
else
  cp "${FILES_LIST}" "${RUN_LIST}"
fi

FILE_COUNT=$(wc -l < "${RUN_LIST}" | tr -d ' ')

# ---------------------------------------------------------------------------
# Run each file
# ---------------------------------------------------------------------------
RESULTS_FILE="${LOG_DIR}/results.tsv"
: > "${RESULTS_FILE}"

TOTAL=0
GREEN=0
EXPECTED_FAIL=0
UNEXPECTED_FAIL=0
UNEXPECTED_PASS_IN_KNOWN=0

printf 'running %s SQL test file(s) against %s\n\n' "${FILE_COUNT}" "${PGURL}"

while IFS= read -r f; do
  [[ -z "${f}" ]] && continue
  rel="${f#"${REPO_ROOT}"/}"
  TOTAL=$((TOTAL + 1))

  log_file="${LOG_DIR}/$(echo "${rel}" | tr '/' '_').log"
  start_ts=$(date +%s)
  psql "${PGURL}" -X -v ON_ERROR_STOP=1 -v HOST="${HOST}" -v PORT="${PORT}" -f "${f}" \
    > "${log_file}" 2>&1
  rc=$?
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))

  reason=""
  is_known=0
  if reason="$(known_reason_for "${rel}")"; then
    is_known=1
  fi

  if [[ ${rc} -eq 0 ]]; then
    if [[ ${is_known} -eq 1 ]]; then
      status="PASS (known-failure now green)"
      UNEXPECTED_PASS_IN_KNOWN=$((UNEXPECTED_PASS_IN_KNOWN + 1))
    else
      status="PASS"
    fi
    GREEN=$((GREEN + 1))
  else
    if [[ ${is_known} -eq 1 ]]; then
      status="EXPECTED-FAIL (exit ${rc})"
      EXPECTED_FAIL=$((EXPECTED_FAIL + 1))
    else
      status="FAIL (exit ${rc})"
      UNEXPECTED_FAIL=$((UNEXPECTED_FAIL + 1))
    fi
  fi

  printf '%s\t%s\t%ss\t%s\n' "${status}" "${rel}" "${duration}" "${reason}" >> "${RESULTS_FILE}"
  printf '%-32s %-70s %4ss\n' "${status}" "${rel}" "${duration}"

  if [[ ${rc} -ne 0 && ${is_known} -eq 0 ]]; then
    echo "  --- tail of output (${log_file}) ---"
    tail -n 20 "${log_file}" | sed 's/^/  /'
    echo "  -------------------------------------"
  elif [[ ${rc} -ne 0 && ${VERBOSE} -eq 1 ]]; then
    echo "  --- full output (${log_file}) ---"
    sed 's/^/  /' "${log_file}"
    echo "  ----------------------------------"
  fi
done < "${RUN_LIST}"

echo
echo "================ summary ================"
printf 'total:             %s\n' "${TOTAL}"
printf 'green:              %s\n' "${GREEN}"
printf 'expected-fail:      %s  (documented in %s)\n' "${EXPECTED_FAIL}" "${KNOWN_FAILURES_FILE#"${REPO_ROOT}"/}"
printf 'unexpected-fail:    %s\n' "${UNEXPECTED_FAIL}"
if [[ ${UNEXPECTED_PASS_IN_KNOWN} -gt 0 ]]; then
  printf 'note: %s known-failure file(s) now pass — consider removing from KNOWN_FAILURES.md\n' "${UNEXPECTED_PASS_IN_KNOWN}"
fi
printf 'effective-green:    %s / %s  (green + expected-fail)\n' "$((GREEN + EXPECTED_FAIL))" "${TOTAL}"
echo "==========================================="

if [[ ${UNEXPECTED_FAIL} -gt 0 ]]; then
  echo
  echo "unexpected failures:"
  while IFS=$'\t' read -r status rel _dur _reason; do
    case "${status}" in
      FAIL*) echo "  - ${rel}" ;;
    esac
  done < "${RESULTS_FILE}"
  exit 1
fi

exit 0
