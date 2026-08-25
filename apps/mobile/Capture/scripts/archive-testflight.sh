#!/usr/bin/env bash
# archive-testflight.sh — Archive Patina Field (Release) and export an IPA
# ready for TestFlight / App Store Connect. Wave 0.5 distribution path
# (field-companion-plan.md §1.5, FC-R14).
#
# Usage:
#   scripts/archive-testflight.sh [options]
#
# Options:
#   --configuration NAME   Build configuration (default: Release)
#   --build-number N       Override CURRENT_PROJECT_VERSION for this archive
#                          only (ASC rejects a re-upload of a build number it
#                          has already seen — bump this per upload attempt).
#   --skip-regen           Skip `ruby scripts/generate_project.rb` before
#                          archiving. Default: regenerate, so the archived
#                          project always matches the checked-out source tree.
#   --skip-export          Archive only; do not run -exportArchive.
#   --app-id ID            App Store Connect app id. If set AND the `asc`
#                          CLI + a suitably-privileged API key are available,
#                          attempt `asc builds upload` after a successful
#                          export. Without this, the script stops at export.
#   -h, --help             Show this help.
#
# Requires (not created by this script):
#   - The `cloud.patina.field` App ID + a matching Automatic-signing
#     distribution provisioning profile. `-allowProvisioningUpdates` with an
#     Admin-role App Store Connect API key (see ASC_* env vars below) can
#     mint these non-interactively from an already-installed distribution
#     certificate; it does NOT create a new certificate, Apple ID, or API
#     key. If no such key is configured, signing falls back to whatever
#     Xcode/the keychain can already resolve.
#   - `Capture/App/Configuration/Secrets.swift` (gitignored) — copy from
#     `Secrets.example.swift`. Without it the build fails to compile.
#   - `Capture/App/Configuration/Secrets.xcconfig` (gitignored, optional) —
#     copy from `Secrets.xcconfig.example` and set POSTHOG_API_KEY, or the
#     archive ships with analytics as a no-op (never silently blank — see
#     README "Distribution").
#
# Env vars (all optional, only used for -allowProvisioningUpdates / upload):
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH
#
# Output: an .xcarchive under DerivedData and, unless --skip-export, an
# exported .ipa under the export directory. Both paths are printed at the end
# along with their sizes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPTURE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CONFIGURATION="Release"
BUILD_NUMBER=""
SKIP_REGEN=0
SKIP_EXPORT=0
APP_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration) CONFIGURATION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --skip-regen) SKIP_REGEN=1; shift ;;
    --skip-export) SKIP_EXPORT=1; shift ;;
    --app-id) APP_ID="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "archive-testflight.sh: unknown option $1" >&2; exit 1 ;;
  esac
done

cd "$CAPTURE_DIR"

SECRETS_SWIFT="Capture/App/Configuration/Secrets.swift"
if [[ ! -f "$SECRETS_SWIFT" ]]; then
  cat >&2 <<EOF
archive-testflight.sh: missing $SECRETS_SWIFT

Copy it from the template first (never commit the real file):
  cp Capture/App/Configuration/Secrets.example.swift $SECRETS_SWIFT
Then fill in supabaseAnonKey (and optionally postHogAPIKey — build-time
resolution below is preferred; see README "Distribution").
EOF
  exit 1
fi

SECRETS_XCCONFIG="Capture/App/Configuration/Secrets.xcconfig"
if [[ ! -f "$SECRETS_XCCONFIG" ]]; then
  cat >&2 <<EOF
archive-testflight.sh: WARNING — no $SECRETS_XCCONFIG.
POSTHOG_API_KEY will resolve empty in this archive's Info.plist and analytics
stays a no-op (fail-closed, not a build failure). To carry a real key:
  cp Capture/App/Configuration/Secrets.xcconfig.example $SECRETS_XCCONFIG
  # edit POSTHOG_API_KEY = phc_...
EOF
fi

if [[ "$SKIP_REGEN" -eq 0 ]]; then
  echo "==> Regenerating Capture.xcodeproj"
  ruby scripts/generate_project.rb
fi

# Per-worktree DerivedData: keyed off this checkout's own absolute path so
# two worktrees archiving concurrently never collide or share stale state.
WORKTREE_HASH="$(echo -n "$CAPTURE_DIR" | shasum -a 256 | cut -c1-12)"
DERIVED_DATA="$CAPTURE_DIR/.build/archive-derived-data-$WORKTREE_HASH"
ARCHIVE_DIR="$CAPTURE_DIR/.build/archives"
EXPORT_DIR="$CAPTURE_DIR/.build/export"
mkdir -p "$ARCHIVE_DIR" "$EXPORT_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="$ARCHIVE_DIR/PatinaField-$TIMESTAMP.xcarchive"

XCODEBUILD_ARGS=(
  -project Capture.xcodeproj
  -scheme Capture
  -configuration "$CONFIGURATION"
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
  -derivedDataPath "$DERIVED_DATA"
  -allowProvisioningUpdates
  archive
)

if [[ -n "$BUILD_NUMBER" ]]; then
  XCODEBUILD_ARGS+=(CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
fi

# Only pass explicit API-key auth if all three are set — otherwise let
# xcodebuild fall back to whatever Xcode/keychain auth it can already
# resolve (e.g. an Xcode-signed-in Apple ID), same as a normal archive.
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY_PATH:-}" ]]; then
  XCODEBUILD_ARGS+=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_PRIVATE_KEY_PATH"
  )
fi

echo "==> Archiving ($CONFIGURATION) -> $ARCHIVE_PATH"
xcodebuild "${XCODEBUILD_ARGS[@]}"

if [[ ! -d "$ARCHIVE_PATH" ]]; then
  echo "archive-testflight.sh: archive step reported success but $ARCHIVE_PATH is missing" >&2
  exit 1
fi
ARCHIVE_SIZE="$(du -sh "$ARCHIVE_PATH" | cut -f1)"
echo "==> Archive OK: $ARCHIVE_PATH ($ARCHIVE_SIZE)"

if [[ "$SKIP_EXPORT" -eq 1 ]]; then
  echo "==> --skip-export set; stopping after archive."
  exit 0
fi

EXPORT_PATH="$EXPORT_DIR/$TIMESTAMP"
EXPORT_ARGS=(
  -exportArchive
  -archivePath "$ARCHIVE_PATH"
  -exportPath "$EXPORT_PATH"
  -exportOptionsPlist "$SCRIPT_DIR/ExportOptions.plist"
  -allowProvisioningUpdates
)
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY_PATH:-}" ]]; then
  EXPORT_ARGS+=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_PRIVATE_KEY_PATH"
  )
fi

echo "==> Exporting -> $EXPORT_PATH"
xcodebuild "${EXPORT_ARGS[@]}"

IPA_PATH="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' | head -1)"
if [[ -z "$IPA_PATH" ]]; then
  echo "archive-testflight.sh: export step reported success but no .ipa found under $EXPORT_PATH" >&2
  exit 1
fi
IPA_SIZE="$(du -sh "$IPA_PATH" | cut -f1)"
echo "==> Export OK: $IPA_PATH ($IPA_SIZE)"

if [[ -z "$APP_ID" ]]; then
  echo "==> No --app-id given; stopping after export. See README \"Distribution\" for the upload command."
  exit 0
fi

if ! command -v asc >/dev/null 2>&1; then
  echo "==> --app-id given but the \`asc\` CLI is not on PATH; stopping after export." >&2
  echo "    Upload manually: asc builds upload --app $APP_ID --ipa $IPA_PATH --wait" >&2
  exit 0
fi

echo "==> Uploading to App Store Connect (app $APP_ID)"
asc builds upload --app "$APP_ID" --ipa "$IPA_PATH" --wait
