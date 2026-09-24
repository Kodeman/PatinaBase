#!/usr/bin/env bash
# archive-testflight.sh — Archive Patina (Release) and export, or upload, a
# build for TestFlight / App Store Connect.
#
# The counterpart of ../../Capture/scripts/archive-testflight.sh and modelled
# on it; read that one too when changing either. Two deliberate differences are
# called out under "Divergences from Capture" below.
#
# Usage:
#   scripts/archive-testflight.sh --build-number N [options]
#
# Options:
#   --build-number N       REQUIRED to archive; --dry-run may omit it and
#                          prints N as a placeholder. CURRENT_PROJECT_VERSION
#                          for this archive, passed on the xcodebuild command
#                          line, which outranks Config/Version.xcconfig for
#                          every target, so the app and PatinaWidget resolve
#                          the SAME number (a mismatch is ITMS-90473).
#   --configuration NAME   Build configuration (default: Release)
#   --skip-export          Archive only; do not run -exportArchive.
#   --upload               Export straight to App Store Connect instead of
#                          writing an .ipa: runs -exportArchive against a copy
#                          of ExportOptions.plist with `destination` flipped to
#                          `upload`. Needs the three ASC_* env vars below.
#   --dry-run              Print the exact commands this run would execute and
#                          exit, without archiving, exporting or uploading.
#   -h, --help             Show this help.
#
# Why --build-number has no default:
#   App Store Connect rejects an upload whose build number it has already seen,
#   and it does so AFTER the archive and the upload, so the cost is paid before
#   the error appears. Config/Version.xcconfig holds the last number someone
#   set, not the next free one, and nothing in this checkout can tell which
#   numbers ASC holds. So the script refuses to guess: pass the number you
#   intend, having checked the builds ASC already lists for cloud.patina.app.
#
# Divergences from Capture/scripts/archive-testflight.sh:
#   - No --skip-regen. Patina.xcodeproj is checked in; there is no
#     generate_project.rb to run first.
#   - --upload replaces Capture's --app-id/`asc builds upload` step. The `asc`
#     CLI is an x86_64 binary and will not run on this arm64 host without
#     Rosetta; `destination: upload` gets the same result from xcodebuild
#     itself, with no external CLI.
#
# Requires (not created by this script):
#   - The cloud.patina.app and cloud.patina.app.widget App IDs plus matching
#     App Store distribution provisioning profiles. Both targets sign
#     automatically against team VP22LXHT7L, so -allowProvisioningUpdates with
#     an Admin-role App Store Connect API key (ASC_* below) can mint the
#     profiles non-interactively from an already-installed distribution
#     certificate; it does NOT create a certificate, Apple ID or API key.
#     Without such a key, signing falls back to whatever Xcode and the keychain
#     can already resolve.
#   - Patina/App/Configuration/Secrets.swift (gitignored) holding the REAL anon
#     key. scripts/bootstrap-worktree.sh makes one with an empty key; fill it in.
#
# Env vars (optional for export, REQUIRED for --upload):
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH
#
# Output: an .xcarchive under .build/archives and, unless --skip-export, either
# an exported .ipa under .build/export (default) or a build handed to App Store
# Connect (--upload). Paths and sizes are printed at the end.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CONFIGURATION="Release"
BUILD_NUMBER=""
SKIP_EXPORT=0
UPLOAD=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration) CONFIGURATION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --skip-export) SKIP_EXPORT=1; shift ;;
    --upload) UPLOAD=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,61p' "$0"; exit 0 ;;
    *) echo "archive-testflight.sh: unknown option $1" >&2; exit 1 ;;
  esac
done

cd "$PROJECT_DIR"

# Shell-quoted echo of a command, so --dry-run output is copy-pasteable.
print_cmd() { printf '    '; printf '%q ' "$@"; printf '\n'; }

# The refusal guards the ARCHIVE, not --dry-run: a dry run builds nothing and
# uploads nothing, so it is allowed to print the shape of the command with a
# placeholder build number.
if [[ -z "$BUILD_NUMBER" && "$DRY_RUN" -eq 0 ]]; then
  XCCONFIG_VERSION="$(sed -n 's/^[[:space:]]*CURRENT_PROJECT_VERSION[[:space:]]*=[[:space:]]*//p' \
    Config/Version.xcconfig | tail -1)"
  cat >&2 <<EOF
archive-testflight.sh: --build-number is required.

Config/Version.xcconfig currently says CURRENT_PROJECT_VERSION = ${XCCONFIG_VERSION:-<unset>},
which is the last number someone set, not necessarily one App Store Connect
will still accept. Check the builds ASC already holds for cloud.patina.app,
then pass a number greater than all of them:

  scripts/archive-testflight.sh --build-number <n>
EOF
  exit 1
fi

if [[ -n "$BUILD_NUMBER" && ! "$BUILD_NUMBER" =~ ^[0-9]+(\.[0-9]+)*$ ]]; then
  echo "archive-testflight.sh: --build-number must be numeric (got '$BUILD_NUMBER')" >&2
  exit 1
fi

# Only ever a placeholder under --dry-run; the guard above means a real run
# always has the number the caller passed.
BUILD_NUMBER_DISPLAY="${BUILD_NUMBER:-N}"

EXPORT_OPTIONS="$SCRIPT_DIR/ExportOptions.plist"
if [[ ! -f "$EXPORT_OPTIONS" ]]; then
  echo "archive-testflight.sh: missing $EXPORT_OPTIONS" >&2
  exit 1
fi

# Only pass explicit API-key auth if all three are set — otherwise let
# xcodebuild fall back to whatever Xcode/keychain auth it can already resolve
# (e.g. an Xcode-signed-in Apple ID), same as a normal archive.
HAVE_ASC_KEY=0
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_PRIVATE_KEY_PATH:-}" ]]; then
  HAVE_ASC_KEY=1
fi

if [[ "$UPLOAD" -eq 1 ]]; then
  if [[ "$SKIP_EXPORT" -eq 1 ]]; then
    echo "archive-testflight.sh: --upload and --skip-export are mutually exclusive" >&2
    exit 1
  fi
  if [[ "$HAVE_ASC_KEY" -eq 0 ]]; then
    cat >&2 <<EOF
archive-testflight.sh: --upload needs all three of ASC_KEY_ID, ASC_ISSUER_ID
and ASC_PRIVATE_KEY_PATH. xcodebuild uploads with -authenticationKeyID /
-authenticationKeyIssuerID / -authenticationKeyPath; there is no keychain
fallback for the upload leg.
EOF
    exit 1
  fi
fi

# Reuse ios-gate.sh's DerivedData so archives share its warm SPM checkouts.
# It is already per-worktree: .build/ lives inside this checkout.
DERIVED_DATA="$PROJECT_DIR/.build/DerivedData"
ARCHIVE_DIR="$PROJECT_DIR/.build/archives"
EXPORT_DIR="$PROJECT_DIR/.build/export"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="$ARCHIVE_DIR/Patina-$TIMESTAMP.xcarchive"
EXPORT_PATH="$EXPORT_DIR/$TIMESTAMP"

XCODEBUILD_ARGS=(
  -project Patina.xcodeproj
  -scheme Patina
  -configuration "$CONFIGURATION"
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
  -derivedDataPath "$DERIVED_DATA"
  -allowProvisioningUpdates
  archive
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER_DISPLAY"
)
if [[ "$HAVE_ASC_KEY" -eq 1 ]]; then
  XCODEBUILD_ARGS+=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_PRIVATE_KEY_PATH"
  )
fi

# In --upload mode the export runs against a copy of ExportOptions.plist with
# `destination` set to `upload`, so the committed plist stays the one source of
# method/teamID/signing and only the one key differs per run.
EFFECTIVE_EXPORT_OPTIONS="$EXPORT_OPTIONS"
if [[ "$UPLOAD" -eq 1 ]]; then
  EFFECTIVE_EXPORT_OPTIONS="$EXPORT_DIR/ExportOptions-upload-$TIMESTAMP.plist"
fi

EXPORT_ARGS=(
  -exportArchive
  -archivePath "$ARCHIVE_PATH"
  -exportPath "$EXPORT_PATH"
  -exportOptionsPlist "$EFFECTIVE_EXPORT_OPTIONS"
  -allowProvisioningUpdates
)
if [[ "$HAVE_ASC_KEY" -eq 1 ]]; then
  EXPORT_ARGS+=(
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
    -authenticationKeyPath "$ASC_PRIVATE_KEY_PATH"
  )
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> --dry-run: nothing is archived, exported or uploaded."
  if [[ -n "$BUILD_NUMBER" ]]; then
    echo "    build number : $BUILD_NUMBER (overrides Config/Version.xcconfig for every target)"
  else
    echo "    build number : N — PLACEHOLDER. A real archive refuses without --build-number."
  fi
  echo "    archive path : $ARCHIVE_PATH"
  echo "    ASC API key  : $([[ "$HAVE_ASC_KEY" -eq 1 ]] && echo "yes (ASC_* set)" || echo "no (keychain/Xcode auth)")"
  echo
  echo "1. archive:"
  print_cmd xcodebuild "${XCODEBUILD_ARGS[@]}"
  if [[ "$SKIP_EXPORT" -eq 1 ]]; then
    echo
    echo "2. export: skipped (--skip-export)"
    exit 0
  fi
  echo
  if [[ "$UPLOAD" -eq 1 ]]; then
    echo "2. write $EFFECTIVE_EXPORT_OPTIONS"
    echo "   (a copy of $EXPORT_OPTIONS with destination = upload)"
    echo
    echo "3. upload:"
  else
    echo "2. export:"
  fi
  print_cmd xcodebuild "${EXPORT_ARGS[@]}"
  exit 0
fi

# Deliberately NOT bootstrapped: scripts/bootstrap-worktree.sh would happily
# create this file with the template's EMPTY anon key, and an archive that
# reaches TestFlight with no anon key is worse than one that never builds. A
# shipping build gets the real key or it stops here.
SECRETS_SWIFT="Patina/App/Configuration/Secrets.swift"
if [[ ! -f "$SECRETS_SWIFT" ]]; then
  cat >&2 <<EOF
archive-testflight.sh: missing $SECRETS_SWIFT

Copy it from the template first (never commit the real file):
  cp Patina/App/Configuration/Secrets.example.swift $SECRETS_SWIFT
Then fill in supabaseAnonKey (and optionally postHogAPIKey).
EOF
  exit 1
fi

# Runs AFTER the guard above, so it can only ever restore the other gitignored
# compile-time file, Patina/Generated/GitCommit.swift. Without it a fresh
# checkout fails to compile — see scripts/bootstrap-worktree.sh.
"$SCRIPT_DIR/bootstrap-worktree.sh"

mkdir -p "$ARCHIVE_DIR" "$EXPORT_DIR"

echo "==> Archiving ($CONFIGURATION, build $BUILD_NUMBER) -> $ARCHIVE_PATH"
xcodebuild "${XCODEBUILD_ARGS[@]}"

if [[ ! -d "$ARCHIVE_PATH" ]]; then
  echo "archive-testflight.sh: archive step reported success but $ARCHIVE_PATH is missing" >&2
  exit 1
fi
ARCHIVE_SIZE="$(du -sh "$ARCHIVE_PATH" | cut -f1)"
echo "==> Archive OK: $ARCHIVE_PATH ($ARCHIVE_SIZE)"

# Export compliance. Patina/Info.plist sets ITSAppUsesNonExemptEncryption so
# TestFlight does not park each build on "Missing Compliance"; check it
# survived into the archive rather than finding out in App Store Connect.
ARCHIVED_APP="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' | head -1)"
if [[ -z "$ARCHIVED_APP" ]]; then
  echo "archive-testflight.sh: no .app under $ARCHIVE_PATH/Products/Applications" >&2
  exit 1
fi
if ! /usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' \
     "$ARCHIVED_APP/Info.plist" >/dev/null 2>&1; then
  cat >&2 <<EOF
archive-testflight.sh: the archived app has no ITSAppUsesNonExemptEncryption.

Patina/Info.plist carries this key; something dropped it on the way into the
archive. Uploading now parks the build on "Missing Compliance" in TestFlight
until someone answers the export-compliance question by hand. Restore the key
and re-archive.
  archived app: $ARCHIVED_APP
EOF
  exit 1
fi
echo "==> Export compliance OK: ITSAppUsesNonExemptEncryption present"

if [[ "$SKIP_EXPORT" -eq 1 ]]; then
  echo "==> --skip-export set; stopping after archive."
  exit 0
fi

if [[ "$UPLOAD" -eq 1 ]]; then
  cp "$EXPORT_OPTIONS" "$EFFECTIVE_EXPORT_OPTIONS"
  plutil -replace destination -string upload "$EFFECTIVE_EXPORT_OPTIONS"
  echo "==> Uploading to App Store Connect -> $EXPORT_PATH"
else
  echo "==> Exporting -> $EXPORT_PATH"
fi

xcodebuild "${EXPORT_ARGS[@]}"

if [[ "$UPLOAD" -eq 1 ]]; then
  echo "==> Upload OK: build $BUILD_NUMBER handed to App Store Connect."
  echo "    It still has to finish processing before it reaches TestFlight."
  exit 0
fi

IPA_PATH="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' | head -1)"
if [[ -z "$IPA_PATH" ]]; then
  echo "archive-testflight.sh: export step reported success but no .ipa found under $EXPORT_PATH" >&2
  exit 1
fi
IPA_SIZE="$(du -sh "$IPA_PATH" | cut -f1)"
echo "==> Export OK: $IPA_PATH ($IPA_SIZE)"
echo "==> Not uploaded. Re-run with --upload to hand it to App Store Connect."
