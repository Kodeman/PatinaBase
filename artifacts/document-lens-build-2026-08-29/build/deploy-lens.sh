#!/usr/bin/env bash
#
# deploy-lens.sh — designer-portal PRODUCTION deploy for "The Smart Lens"
# (R127: the declared 56px band, the ladder rail, the density line, the
# quiet/full fold voice, the retired job-ticket/seam-height plumbing).
# Mirrors the structure, preflight, wrangler-vars resolution, before/after
# version capture, probe idiom, and rollback line of
# artifacts/document-life-directions-2026-08-28/build/deploy-life.sh — in
# particular the incident that script was built to never repeat:
#
#   2026-08-26T19:49:14Z — a hand-pasted `export NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
#   command carried literal placeholder text into a production build (version
#   0d66c4a2-0c2b-472c-a2fe-e57ae6014068). infra/deploy-portal.sh's preflight only
#   checks non-empty/non-local, so the placeholder sailed through; it shipped to
#   app.patina.cloud and was rolled back one minute later (19:50:51Z) to
#   d9a307bd-11ee-4c32-99a3-268e6cb11388. See docs/design/the-document/DECISIONS.md
#   entry I150-deploy and artifacts/document-wayfinding-directions-2026-08-25/build/deploy-1.md
#   for the full record.
#
# RULE THIS SCRIPT ENFORCES: no value in this deploy is ever hand-pasted or
# left as a placeholder. Every NEXT_PUBLIC_* value is resolved by parsing the
# committed, reviewed apps/designer-portal/wrangler.jsonc top-level "vars"
# block (never an env.*.vars sub-block), then shape-checked before export.
#
# THIS SCRIPT IS FOR KODY TO RUN HIMSELF. A repo hook blocks agents from
# running it (and from running any command that names it or invokes
# `wrangler` directly) — that is intentional, not a bug to route around.
#
# Usage (from the repo root, on `main`, after the PR merges):
#   bash artifacts/document-lens-build-2026-08-29/build/deploy-lens.sh
#
# Two environment switches exist, both OFF by default and both for
# rehearsal/testing only — neither is ever the right way to ship:
#
#   LENS_DRY_RUN=1   Run phases 0-3 (preflight, vars, gates, before-version)
#                     and stop before phase 4 (the actual deploy). Prints
#                     "DRY RUN OK" and exits 0. This is the Wave-6 rehearsal
#                     Kody runs from a clean `main` before the real deploy.
#
#   LENS_PHASES=a,b   Run ONLY the listed phase numbers (comma-separated,
#                     e.g. "1,2"). Exists so a lane can prove phase 1
#                     (wrangler.jsonc var resolution) and phase 2 (gates,
#                     tripwires) work from an unmerged worktree, where phase
#                     0's git preflight (branch=main, clean, in sync) would
#                     correctly refuse to run. Phase 4 (the real deploy)
#                     REFUSES to run under LENS_PHASES unless phase 0 is
#                     also in the same invocation's phase list — see the
#                     guard below. LENS_PHASES is never the right way to
#                     ship either.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Phase selection. Default: every phase, in order. LENS_PHASES restricts to
# a comma-separated subset for rehearsal of a single phase in isolation —
# see the header comment above.
# ---------------------------------------------------------------------------
DEFAULT_PHASES="0,1,2,3,4,5,6"
PHASES_TO_RUN="${LENS_PHASES:-$DEFAULT_PHASES}"

phase_enabled() {
  case ",${PHASES_TO_RUN}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "${LENS_PHASES:-}" != "" ]; then
  echo "==> WARNING: LENS_PHASES='${LENS_PHASES}' set — running a phase subset." >&2
  echo "             This is a rehearsal/testing shortcut, never a real deploy path." >&2
fi

# Safety guard: phase 4 (the real deploy) may never run under a restricted
# phase list unless phase 0 (git preflight: on main, clean, in sync with
# origin) ran in the SAME invocation. Without this guard, LENS_PHASES could
# be misused to skip every safety check and still ship.
if phase_enabled 4 && ! phase_enabled 0; then
  echo "ERROR: refusing — phase 4 (deploy) is selected but phase 0 (git preflight)" >&2
  echo "       is not in LENS_PHASES='${PHASES_TO_RUN}'. Phase 4 never runs without" >&2
  echo "       phase 0 in the same invocation. Run the script with no LENS_PHASES" >&2
  echo "       override to deploy for real." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Phase 0 — preflight: not a worktree, on main, clean, in sync with origin.
# Captures DEPLOY_SHA (what we're about to ship) and PARENT_SHA (the merge's
# first parent — the rollback target at the source level) into
# deploy-lens-before.txt.
# ---------------------------------------------------------------------------
if phase_enabled 0; then
  echo "==> [0/6] Preflight: git state"

  # Primary check per spec: the common git dir of a worktree checkout is
  # NOT its own `.git` directory (it points at the main checkout's `.git`).
  # A canonical checkout's common dir IS `.git`.
  GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
  if [ "$GIT_COMMON_DIR" != ".git" ]; then
    echo "ERROR: refusing to run from a worktree checkout (git-common-dir='${GIT_COMMON_DIR}', expected '.git')." >&2
    echo "       Deploys must run from the canonical repo checkout only." >&2
    exit 1
  fi
  # Belt-and-suspenders path check (mirrors deploy-life.sh) in case a future
  # worktree layout ever satisfies the git-common-dir check by accident.
  case "$REPO_ROOT" in
    *.codex/worktrees*|*worktrees/*)
      echo "ERROR: refusing to run from a worktree checkout ($REPO_ROOT)." >&2
      exit 1
      ;;
  esac
  case "$PWD" in
    *.codex/worktrees*|*worktrees/*)
      echo "ERROR: refusing to run from a worktree checkout ($PWD)." >&2
      exit 1
      ;;
  esac

  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "ERROR: refusing to deploy — currently on branch '${CURRENT_BRANCH}', not 'main'." >&2
    echo "       Merge the PR, checkout main, and re-run this script." >&2
    exit 1
  fi

  if ! git diff --cached --quiet; then
    echo "ERROR: refusing to deploy — the index has staged changes:" >&2
    git diff --cached --stat >&2
    echo "       Commit, unstage, or discard them before deploying." >&2
    exit 1
  fi

  # Broader dirty-tree guard: a stale/uncommitted source tree is exactly how
  # a previous incident shipped a build from the wrong source. Ignores
  # untracked files but not modifications to tracked apps/ or packages/
  # sources.
  DIRTY_LINES="$(git status --porcelain apps packages 2>&1 | grep -v '^??' | grep -v 'Operation not permitted' || true)"
  if [ -n "$DIRTY_LINES" ]; then
    echo "ERROR: refusing to deploy — apps/ or packages/ has uncommitted changes:" >&2
    echo "$DIRTY_LINES" >&2
    echo "       Commit, stash, or discard these before deploying." >&2
    exit 1
  fi

  echo "==> [0/6] Fetching origin and checking main is not ahead/behind"
  git fetch origin
  STATUS_LINE="$(git status -sb | head -n 1)"
  if [ "$STATUS_LINE" != "## main...origin/main" ]; then
    echo "ERROR: refusing to deploy — 'git status -sb' reports '${STATUS_LINE}'," >&2
    echo "       expected exactly '## main...origin/main' (not ahead, not behind)." >&2
    echo "       Fast-forward local main to match origin/main before deploying." >&2
    exit 1
  fi

  DEPLOY_SHA="$(git rev-parse HEAD)"
  # First parent of the merge commit — the pre-merge tip of main, and the
  # rollback target at the source level if this deploy needs reverting.
  PARENT_SHA="$(git rev-parse HEAD^1 2>/dev/null || echo '<no parent — HEAD is the first commit>')"

  {
    echo "DEPLOY_SHA=${DEPLOY_SHA}"
    echo "PARENT_SHA=${PARENT_SHA}"
  } > "$BUILD_DIR/deploy-lens-before.txt"

  echo "==> [0/6] Preflight OK: on main, in sync with origin/main, deploying commit ${DEPLOY_SHA}"
  echo "    Parent SHA (rollback target): ${PARENT_SHA}"
  echo
else
  echo "==> [0/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
fi

# ---------------------------------------------------------------------------
# Phase 1 — resolve NEXT_PUBLIC_* env from wrangler.jsonc's top-level "vars"
# block. No hand-pasting, ever — see the incident note above.
# ---------------------------------------------------------------------------
if phase_enabled 1; then
  echo "==> [1/6] Resolving NEXT_PUBLIC_* vars from apps/designer-portal/wrangler.jsonc"

  WRANGLER_JSONC="$REPO_ROOT/apps/designer-portal/wrangler.jsonc"
  if [ ! -f "$WRANGLER_JSONC" ]; then
    echo "ERROR: $WRANGLER_JSONC not found." >&2
    exit 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is required to parse wrangler.jsonc." >&2
    exit 1
  fi

  # Explicit template (not bare `mktemp`): honors $TMPDIR when the caller's
  # shell has one set, rather than always falling back to the OS default.
  PARSE_TMP="$(mktemp "${TMPDIR:-/tmp}/deploy-lens-wrangler-vars.XXXXXX")"
  cleanup() { rm -f "$PARSE_TMP"; }
  trap cleanup EXIT

  # Strips // and /* */ comments (JSONC) while respecting string literals (so
  # a value like "https://..." is never mistaken for a comment), parses the
  # TOP-LEVEL "vars" object only (never env.*.vars — that would risk leaking
  # a staging Supabase project's values into a production export), and
  # prints `export NAME='value'` lines for every NEXT_PUBLIC_* key found
  # there.
  cat > "$PARSE_TMP" <<'NODE_EOF'
const fs = require('node:fs');

const target = process.argv[2];
let raw;
try {
  raw = fs.readFileSync(target, 'utf8');
} catch (err) {
  console.error(`ERROR: could not read ${target}: ${err.message}`);
  process.exit(1);
}

function stripJsonComments(str) {
  let out = '';
  let i = 0;
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  while (i < str.length) {
    const c = str[i];
    const n = str[i + 1];

    if (inLineComment) {
      if (c === '\n') { inLineComment = false; out += c; }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === stringChar) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { inLineComment = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlockComment = true; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

let parsed;
try {
  parsed = JSON.parse(stripJsonComments(raw));
} catch (err) {
  console.error(`ERROR: failed to parse ${target} as JSONC after comment-stripping: ${err.message}`);
  process.exit(1);
}

const vars = parsed && typeof parsed === 'object' ? parsed.vars : undefined;
if (typeof vars !== 'object' || vars === null || Array.isArray(vars)) {
  console.error(`ERROR: top-level "vars" in ${target} is missing or not an object.`);
  process.exit(1);
}

for (const [key, value] of Object.entries(vars)) {
  if (!key.startsWith('NEXT_PUBLIC_')) continue;
  const val = value === null || value === undefined ? '' : String(value);
  const escaped = val.replace(/'/g, `'\\''`);
  process.stdout.write(`export ${key}='${escaped}'\n`);
}
NODE_EOF

  EXPORT_SCRIPT="$(node "$PARSE_TMP" "$WRANGLER_JSONC")"
  if [ -z "$EXPORT_SCRIPT" ]; then
    echo "ERROR: no NEXT_PUBLIC_* keys found in $WRANGLER_JSONC's top-level vars block." >&2
    exit 1
  fi
  eval "$EXPORT_SCRIPT"

  RESOLVED_NAMES=()
  while IFS= read -r line; do
    case "$line" in
      export\ *)
        name="${line#export }"
        name="${name%%=*}"
        RESOLVED_NAMES+=("$name")
        ;;
    esac
  done <<< "$EXPORT_SCRIPT"

  echo "==> [1/6] Validating resolved values are real, not placeholders/empty/local"

  : "${NEXT_PUBLIC_SUPABASE_URL:?ERROR: NEXT_PUBLIC_SUPABASE_URL not exported by wrangler.jsonc}"
  : "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY not exported by wrangler.jsonc}"

  case "$NEXT_PUBLIC_SUPABASE_URL" in
    *127.0.0.1*|*localhost*)
      echo "ERROR: NEXT_PUBLIC_SUPABASE_URL='${NEXT_PUBLIC_SUPABASE_URL}' points at a local host." >&2
      echo "       Refusing to ship a local-pointed build to production." >&2
      exit 1
      ;;
  esac

  # Placeholder-marker check across every resolved NEXT_PUBLIC_* value — the
  # exact check that would have caught the 2026-08-26 incident. A
  # placeholder like `<value>` is non-empty and non-local, so those checks
  # alone are not enough.
  for name in "${RESOLVED_NAMES[@]+"${RESOLVED_NAMES[@]}"}"; do
    val="${!name}"
    if [ -z "$val" ]; then
      echo "ERROR: exported ${name} is EMPTY." >&2
      exit 1
    fi
    case "$val" in
      *'<'*)
        echo "ERROR: exported ${name} contains '<' — looks like an unresolved placeholder." >&2
        exit 1
        ;;
      *'value>'*)
        echo "ERROR: exported ${name} contains 'value>' — looks like an unresolved placeholder." >&2
        exit 1
        ;;
    esac
  done

  echo "==> [1/6] Resolved NEXT_PUBLIC_* vars (source: wrangler.jsonc top-level vars):"
  for name in "${RESOLVED_NAMES[@]+"${RESOLVED_NAMES[@]}"}"; do
    val="${!name}"
    case "$name" in
      *KEY*|*SECRET*|*TOKEN*)
        # Never echo a full secret — anon key is client-side by design, but
        # print only enough to eyeball-confirm it's the real one.
        echo "    ${name} = ${val:0:8}...  (${#val} chars total)"
        ;;
      *)
        echo "    ${name} = ${val}"
        ;;
    esac
  done
  echo
else
  echo "==> [1/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
fi

# ---------------------------------------------------------------------------
# Phase 2 — gates: type-check, the five Document jest suites this program
# added/touched, and the source tripwires that prove the retired job-ticket
# / seam-height plumbing is gone and the new band/ladder/density surface is
# in place.
# ---------------------------------------------------------------------------
if phase_enabled 2; then
  echo "==> [2/6] Gate: type-check"
  pnpm --filter @patina/designer-portal type-check

  echo
  echo "==> [2/6] Gate: the five Document jest suites"
  pnpm --filter @patina/designer-portal test -- \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/lens-band.test.tsx \
    src/hooks/__tests__/use-lens-density.test.tsx \
    src/components/document/region/__tests__/use-region-fold.test.tsx

  echo
  echo "==> [2/6] Gate: source tripwires"

  # The retired job-ticket / seam-height plumbing must be entirely gone from
  # designer-portal PRODUCT source. `git grep` exits 0 when it FINDS a match,
  # so a match here is the failure case. Test files are excluded via
  # pathspec magic (`:!...`, not `-e` on test dirs): a sanctioned NEGATIVE
  # assertion is allowed to name these strings while proving them gone —
  # e.g. lens-band.test.tsx's "`--doc-seam-height` reads `''`" check and the
  # e2e `quiet-responsive-shell.spec.ts` computed-`''` check. Product code
  # naming these strings still fails the gate.
  if git grep -n 'data-job-ticket\|doc-seam-height\|SEAM_HEIGHT_VAR' -- apps/designer-portal/src ':!*.test.ts' ':!*.test.tsx' ':!**/__tests__/**'; then
    echo "ERROR: retired job-ticket/seam-height plumbing still present in apps/designer-portal/src (above, test files excluded)." >&2
    exit 1
  fi
  echo "    OK: no data-job-ticket / doc-seam-height / SEAM_HEIGHT_VAR in apps/designer-portal/src (test files excluded)"

  if ! git grep -q -- '--doc-band-height' apps/designer-portal/src/app/globals.css; then
    echo "ERROR: --doc-band-height not found in apps/designer-portal/src/app/globals.css." >&2
    exit 1
  fi
  echo "    OK: --doc-band-height declared in globals.css"

  if ! git grep -q -- '--doc-region-gap' apps/designer-portal/src/app/globals.css; then
    echo "ERROR: --doc-region-gap not found in apps/designer-portal/src/app/globals.css." >&2
    exit 1
  fi
  echo "    OK: --doc-region-gap declared in globals.css"

  if ! git grep -q 'useLensDensity(' apps/designer-portal/src/app; then
    echo "ERROR: useLensDensity( not called anywhere under apps/designer-portal/src/app — the density hook is not mounted." >&2
    exit 1
  fi
  echo "    OK: useLensDensity( called under apps/designer-portal/src/app"

  echo "==> [2/6] Gates passed."
  echo
else
  echo "==> [2/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
fi

# ---------------------------------------------------------------------------
# Phase 3 — record the rollback target BEFORE deploying. Bottom row of
# `wrangler deployments list` is the CURRENT live version (list is
# oldest-first) — see AGENTS.md / deploy-life.sh's own note.
# ---------------------------------------------------------------------------
EXPECTED_PRE_DEPLOY_VERSION="9c0c2cdd-2041-4848-a193-93d9e8fb0b71"

if phase_enabled 3; then
  echo "==> [3/6] Capturing pre-deploy version (rollback target)"
  cd "$REPO_ROOT/apps/designer-portal"
  PRE_DEPLOY_LIST="$(npx wrangler deployments list --name patina-designer-portal 2>&1 || true)"
  cd "$REPO_ROOT"
  {
    echo
    echo "--- wrangler deployments list (pre-deploy, tail) ---"
    printf '%s\n' "$PRE_DEPLOY_LIST" | tail -n 25
  } >> "$BUILD_DIR/deploy-lens-before.txt"

  PREV_VERSION_ID="$(printf '%s\n' "$PRE_DEPLOY_LIST" | tail -n 25 | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -n 1 || true)"
  if [ -z "$PREV_VERSION_ID" ]; then
    echo "WARN: could not auto-parse a previous version id — read it manually from" >&2
    echo "      $BUILD_DIR/deploy-lens-before.txt (bottom row) before rolling back." >&2
  elif [ "$PREV_VERSION_ID" != "$EXPECTED_PRE_DEPLOY_VERSION" ]; then
    echo "WARN: pre-deploy live version is ${PREV_VERSION_ID}, expected ${EXPECTED_PRE_DEPLOY_VERSION}." >&2
    echo "      Something else deployed the designer portal since this expectation was" >&2
    echo "      recorded — not fatal, but confirm this is expected before proceeding." >&2
  else
    echo "==> [3/6] Pre-deploy live version matches expectation: ${PREV_VERSION_ID}"
  fi
  echo "==> [3/6] Rollback target recorded: ${PREV_VERSION_ID:-<see $BUILD_DIR/deploy-lens-before.txt>}  (see $BUILD_DIR/deploy-lens-before.txt)"
  echo

  if [ "${LENS_DRY_RUN:-}" = "1" ]; then
    echo "==> LENS_DRY_RUN=1 — stopping before phase 4 (the real deploy)."
    echo "DRY RUN OK"
    exit 0
  fi
else
  echo "==> [3/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
  if [ "${LENS_PHASES:-}" != "" ] && [ "${LENS_DRY_RUN:-}" = "1" ]; then
    echo "DRY RUN OK"
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Phase 4 — deploy. THE ONLY correct path: ./infra/deploy-portal.sh.
# ---------------------------------------------------------------------------
if phase_enabled 4; then
  echo "==> [4/6] Deploying: ./infra/deploy-portal.sh designer"
  ./infra/deploy-portal.sh designer
  # set -e means we only reach here if that exited 0.
  echo
  echo "==> [4/6] deploy-portal.sh completed. Waiting briefly for edge propagation..."
  sleep 8
  echo
else
  echo "==> [4/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
fi

# ---------------------------------------------------------------------------
# Phase 5 — capture the post-deploy version.
# ---------------------------------------------------------------------------
if phase_enabled 5; then
  echo "==> [5/6] Capturing post-deploy version"
  cd "$REPO_ROOT/apps/designer-portal"
  npx wrangler deployments list --name patina-designer-portal 2>&1 | tail -n 8 > "$BUILD_DIR/deploy-lens-after.txt"
  cd "$REPO_ROOT"
  NEW_VERSION_ID="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$BUILD_DIR/deploy-lens-after.txt" | tail -n 1 || true)"
  echo "    New live version: ${NEW_VERSION_ID:-<could not auto-parse; read $BUILD_DIR/deploy-lens-after.txt>}"
  echo "    (see $BUILD_DIR/deploy-lens-after.txt)"
  echo
else
  echo "==> [5/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
  echo
fi

# ---------------------------------------------------------------------------
# Phase 6 — verify against the LIVE site, signed-out-capable. Print
# PASS/FAIL per probe; exit non-zero and print the rollback instruction on
# any FAIL.
# ---------------------------------------------------------------------------
if phase_enabled 6; then
  echo "==> [6/6] Verifying production"

  OVERALL_PASS=true

  probe_pass() { echo "    PASS: $1"; }
  probe_fail() { echo "    FAIL: $1"; OVERALL_PASS=false; }
  probe_warn() { echo "    WARN: $1"; }

  # Probe 1 — /desk, unauthenticated, must redirect (307). No redirect-follow.
  DESK_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 'https://app.patina.cloud/desk' || echo '000')"
  if [ "$DESK_CODE" = "307" ]; then
    probe_pass "GET /desk -> 307 (expected 307)"
  else
    probe_fail "GET /desk -> ${DESK_CODE} (expected 307)"
  fi

  # Probe 2 — /auth/signin, signed-out-servable, must be 200. Its served HTML
  # is also where we discover the CSS/JS chunk manifest — /desk itself never
  # returns a body (it 307s), so this is the one page we can rely on being
  # servable with no session.
  SIGNIN_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 'https://app.patina.cloud/auth/signin' || echo '000')"
  if [ "$SIGNIN_CODE" = "200" ]; then
    probe_pass "GET /auth/signin -> 200 (expected 200)"
  else
    probe_fail "GET /auth/signin -> ${SIGNIN_CODE} (expected 200)"
  fi

  SIGNIN_HTML=""
  if ! SIGNIN_HTML="$(curl -fsSL --max-time 20 'https://app.patina.cloud/auth/signin')"; then
    probe_fail "could not fetch https://app.patina.cloud/auth/signin body"
  fi

  CSS_URLS="$(printf '%s' "$SIGNIN_HTML" | grep -oE '/_next/static/css/[A-Za-z0-9_.-]+\.css' | sort -u || true)"
  if [ -z "$CSS_URLS" ]; then
    probe_fail "no /_next/static/css/*.css references found on /auth/signin"
  else
    probe_pass "found $(printf '%s\n' "$CSS_URLS" | wc -l | tr -d ' ') served CSS chunk(s)"
  fi

  CSS_BLOB=""
  while IFS= read -r css_path; do
    [ -n "$css_path" ] || continue
    css_url="https://app.patina.cloud${css_path}"
    if chunk_body="$(curl -fsSL --max-time 20 "$css_url" 2>/dev/null)"; then
      CSS_BLOB="${CSS_BLOB}
${chunk_body}"
    else
      echo "    WARN: could not fetch ${css_url}" >&2
    fi
  done <<< "$CSS_URLS"

  # Probe 3 — the new lens tokens/attribute must be present (proves the new
  # bundle is live, not a stale/cached one).
  for token in '--doc-band-height' '--doc-region-gap' '--doc-landing-clear' 'data-density'; do
    if printf '%s' "$CSS_BLOB" | grep -qF -- "$token"; then
      probe_pass "${token} found in served CSS"
    else
      probe_fail "${token} NOT found in served CSS"
    fi
  done

  # Probe 4 — the retired seam-height token must be ABSENT.
  if printf '%s' "$CSS_BLOB" | grep -qF -- 'doc-seam-height'; then
    probe_fail "doc-seam-height STILL present in served CSS (expected removed)"
  else
    probe_pass "doc-seam-height absent from served CSS"
  fi

  # Probe 5 — /api/version liveness only (per AGENTS.md: version strings
  # prove nothing on the live path — this just confirms the route responds).
  VERSION_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 'https://app.patina.cloud/api/version' || echo '000')"
  case "$VERSION_CODE" in
    2??) probe_pass "GET /api/version -> ${VERSION_CODE} (liveness only)" ;;
    *)   probe_fail "GET /api/version -> ${VERSION_CODE} (expected 2xx liveness)" ;;
  esac

  # Probe 6 — retired job-ticket marker must be absent from JS chunks.
  # WARN-only: the JS chunk set is large and a miss here is not proof of
  # absence, only a corroborating signal alongside the source tripwire in
  # phase 2 (which IS authoritative and already ran pre-deploy).
  JS_URLS="$(printf '%s' "$SIGNIN_HTML" | grep -oE '/_next/static/chunks/[A-Za-z0-9_.-]+\.js' | sort -u || true)"
  JS_CHUNK_COUNT=0
  JOB_TICKET_SEEN=false
  while IFS= read -r js_path; do
    [ -n "$js_path" ] || continue
    js_url="https://app.patina.cloud${js_path}"
    if chunk_body="$(curl -fsSL --max-time 20 "$js_url" 2>/dev/null)"; then
      JS_CHUNK_COUNT=$((JS_CHUNK_COUNT + 1))
      if printf '%s' "$chunk_body" | grep -qF -- 'data-job-ticket'; then
        JOB_TICKET_SEEN=true
      fi
    fi
  done <<< "$JS_URLS"
  echo "    Fetched ${JS_CHUNK_COUNT} JS chunk(s) from /auth/signin's manifest."
  if [ "$JOB_TICKET_SEEN" = "true" ]; then
    probe_warn "data-job-ticket found in a fetched JS chunk (WARN only — chunks are many; the phase-2 source tripwire is authoritative)"
  else
    probe_pass "data-job-ticket not found in ${JS_CHUNK_COUNT} fetched JS chunk(s)"
  fi

  echo
  if [ "$OVERALL_PASS" = "true" ]; then
    echo "==> RESULT: PASS — production looks correct."
    echo "    Live version: ${NEW_VERSION_ID:-<see $BUILD_DIR/deploy-lens-after.txt>}"
    exit 0
  else
    echo "==> RESULT: FAIL — one or more probes failed. ROLL BACK NOW:" >&2
    echo >&2
    echo "    npx wrangler rollback ${EXPECTED_PRE_DEPLOY_VERSION} --name patina-designer-portal --yes" >&2
    echo >&2
    echo "    (run from apps/designer-portal, or with --name as above from anywhere)" >&2
    echo "    Then checkout the pre-deploy commit and re-verify source:" >&2
    echo "    parent SHA (pre-merge tip of main): ${PARENT_SHA:-<see $BUILD_DIR/deploy-lens-before.txt>}" >&2
    echo >&2
    echo "    Recorded before-version: ${PREV_VERSION_ID:-<see $BUILD_DIR/deploy-lens-before.txt>}" >&2
    echo "    Recorded after-version:  ${NEW_VERSION_ID:-<see $BUILD_DIR/deploy-lens-after.txt>}" >&2
    exit 1
  fi
else
  echo "==> [6/6] SKIPPED (LENS_PHASES='${PHASES_TO_RUN}')"
fi
