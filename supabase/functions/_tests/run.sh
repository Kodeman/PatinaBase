#!/usr/bin/env bash
# Runs the payable_type edge-function harness against the LOCAL stack.
#
# Assumes `supabase functions serve --env-file supabase/functions/_tests/test.env
# --no-verify-jwt` is already running (start it in another terminal / background).
# This script pulls the local anon/service-role keys + URL from `supabase status`
# and invokes the Deno test. It never runs `supabase db reset` — the local stack
# is shared across sessions and fixtures are marker-tagged + cleaned up.
set -euo pipefail
cd "$(dirname "$0")/../../.."

# Deterministic local-dev keys (this repo's `supabase start` project). Non-secret.
# Override by exporting SUPABASE_* before invoking if your local keys differ.
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwOTg4MjM1OTZ9.pWrQFT2kIo3efz4V-7bUG7jvvle2Slb6sihaBgA8VbMZireoIgN5fyfhAjJieEoZzhuH6XTwzR4qczoi_t60yw}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjA5ODgyMzU5Nn0.-5uhMs5Ma_MKEPuj5i4W1mz8aJAiM0afjEVtnhTz2IN95q_iuHX9XijERfWToQUp4qY4jLdFViDH8lPh8xUzXg}"
export STRIPE_WEBHOOK_SECRET="whsec_test123"

exec deno test --no-check -A supabase/functions/_tests/stripe-rail.test.ts
