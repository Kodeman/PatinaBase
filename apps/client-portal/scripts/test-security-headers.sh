#!/bin/bash

# Security Headers Testing Script for Patina Client Portal
# Tests CSP, CORS, and other security headers in development and production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
BASE_URL=""

# Set base URL based on environment
case $ENVIRONMENT in
  dev|development)
    BASE_URL="http://localhost:3002"
    echo -e "${BLUE}Testing DEVELOPMENT environment: $BASE_URL${NC}"
    ;;
  prod|production)
    BASE_URL="https://client.patina.cloud"
    echo -e "${BLUE}Testing PRODUCTION environment: $BASE_URL${NC}"
    ;;
  *)
    echo -e "${RED}Invalid environment: $ENVIRONMENT${NC}"
    echo "Usage: $0 [dev|prod]"
    exit 1
    ;;
esac

echo "=========================================="
echo "Security Headers Test Suite"
echo "=========================================="
echo ""

# Function to test a specific header
test_header() {
  local header_name="$1"
  local expected_pattern="$2"
  local description="$3"

  echo -e "${YELLOW}Testing: $description${NC}"

  # Fetch the header value
  local header_value=$(curl -s -I "$BASE_URL" 2>/dev/null | grep -i "^$header_name:" | cut -d' ' -f2- | tr -d '\r\n')

  if [ -z "$header_value" ]; then
    echo -e "${RED}✗ FAIL: $header_name header not found${NC}"
    return 1
  fi

  # Check if header matches expected pattern
  if echo "$header_value" | grep -q "$expected_pattern"; then
    echo -e "${GREEN}✓ PASS: $header_name = $header_value${NC}"
    return 0
  else
    echo -e "${RED}✗ FAIL: $header_name = $header_value (expected: $expected_pattern)${NC}"
    return 1
  fi
}

# Function to check if CSP includes a directive
test_csp_directive() {
  local directive="$1"
  local expected="$2"
  local description="$3"

  echo -e "${YELLOW}Testing CSP: $description${NC}"

  # Fetch CSP header
  local csp=$(curl -s -I "$BASE_URL" 2>/dev/null | grep -i "^content-security-policy:" | cut -d' ' -f2- | tr -d '\r\n')

  if [ -z "$csp" ]; then
    echo -e "${RED}✗ FAIL: Content-Security-Policy header not found${NC}"
    return 1
  fi

  # Check if directive exists with expected value
  if echo "$csp" | grep -q "$directive.*$expected"; then
    echo -e "${GREEN}✓ PASS: $directive includes '$expected'${NC}"
    return 0
  else
    echo -e "${RED}✗ FAIL: $directive does not include '$expected'${NC}"
    echo -e "  Current CSP: $csp"
    return 1
  fi
}

# Function to test CORS
test_cors() {
  local origin="$1"
  local should_allow="$2"

  echo -e "${YELLOW}Testing CORS from origin: $origin${NC}"

  local cors_origin=$(curl -s -I \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: POST" \
    "$BASE_URL" 2>/dev/null | grep -i "^access-control-allow-origin:" | cut -d' ' -f2- | tr -d '\r\n')

  if [ "$should_allow" = "true" ]; then
    if [ -n "$cors_origin" ]; then
      echo -e "${GREEN}✓ PASS: CORS allowed for $origin${NC}"
      return 0
    else
      echo -e "${RED}✗ FAIL: CORS not allowed for $origin (expected to allow)${NC}"
      return 1
    fi
  else
    if [ -z "$cors_origin" ] || [ "$cors_origin" != "$origin" ]; then
      echo -e "${GREEN}✓ PASS: CORS correctly restricted for $origin${NC}"
      return 0
    else
      echo -e "${RED}✗ FAIL: CORS incorrectly allowed for $origin${NC}"
      return 1
    fi
  fi
}

# Track test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
  TESTS_RUN=$((TESTS_RUN + 1))
  if "$@"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  echo ""
}

# Wait for server to be ready (development only)
if [ "$ENVIRONMENT" = "dev" ]; then
  echo "Checking if development server is running..."
  for i in {1..30}; do
    if curl -s "$BASE_URL" > /dev/null 2>&1; then
      echo -e "${GREEN}Server is ready!${NC}"
      echo ""
      break
    fi
    if [ $i -eq 30 ]; then
      echo -e "${RED}Server not responding. Please start the development server:${NC}"
      echo "  cd apps/client-portal && pnpm dev"
      exit 1
    fi
    echo "Waiting for server... ($i/30)"
    sleep 1
  done
fi

# Test basic security headers
echo "=========================================="
echo "Basic Security Headers"
echo "=========================================="
echo ""

run_test test_header "X-Content-Type-Options" "nosniff" "X-Content-Type-Options header"
run_test test_header "X-Frame-Options" "DENY" "X-Frame-Options header"
run_test test_header "X-XSS-Protection" "1; mode=block" "X-XSS-Protection header"
run_test test_header "Referrer-Policy" "strict-origin-when-cross-origin" "Referrer-Policy header"
run_test test_header "Permissions-Policy" "camera" "Permissions-Policy header"

# Test HSTS (production only)
if [ "$ENVIRONMENT" = "prod" ]; then
  run_test test_header "Strict-Transport-Security" "max-age=31536000" "HSTS header"
fi

# Test CSP directives
echo "=========================================="
echo "Content Security Policy (CSP)"
echo "=========================================="
echo ""

run_test test_csp_directive "default-src" "'self'" "default-src includes 'self'"
run_test test_csp_directive "script-src" "'self'" "script-src includes 'self'"
run_test test_csp_directive "script-src" "static.cloudflareinsights.com" "script-src allows Cloudflare Insights"
run_test test_csp_directive "connect-src" "cloudflareinsights.com" "connect-src allows Cloudflare Insights"
run_test test_csp_directive "object-src" "'none'" "object-src blocks plugins"
run_test test_csp_directive "frame-ancestors" "'none'" "frame-ancestors prevents clickjacking"

if [ "$ENVIRONMENT" = "prod" ]; then
  run_test test_csp_directive "connect-src" "api.patina.cloud" "connect-src allows API in production"
  run_test test_csp_directive "" "upgrade-insecure-requests" "upgrade-insecure-requests enabled"
fi

# Test CORS
echo "=========================================="
echo "CORS Configuration"
echo "=========================================="
echo ""

if [ "$ENVIRONMENT" = "dev" ]; then
  run_test test_cors "http://localhost:3000" "true" "CORS allows localhost in dev"
  run_test test_cors "https://attacker.com" "true" "CORS allows all in dev (expected)"
else
  run_test test_cors "https://designer.patina.cloud" "true" "CORS allows Patina domains"
  run_test test_cors "https://attacker.com" "false" "CORS blocks external domains"
fi

# Test Cloudflare Insights specifically
echo "=========================================="
echo "Cloudflare Insights Integration"
echo "=========================================="
echo ""

echo -e "${YELLOW}Checking if Cloudflare Insights beacon can load...${NC}"
BEACON_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://static.cloudflareinsights.com/beacon.min.js")
if [ "$BEACON_STATUS" = "200" ]; then
  echo -e "${GREEN}✓ PASS: Cloudflare Insights beacon is accessible${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "${RED}✗ FAIL: Cloudflare Insights beacon returned status $BEACON_STATUS${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed! ✓${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. Please review the configuration.${NC}"
  exit 1
fi
