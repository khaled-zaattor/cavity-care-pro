#!/usr/bin/env bash
# Quick checks that the site, the /api mount and the session cookies work.
#   deploy/smoke.sh https://staging.example.com
set -uo pipefail
BASE="${1:?usage: deploy/smoke.sh <site url>}"
BASE="${BASE%/}"
FAIL=0
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "  ok    $1"; else echo "  FAIL  $1 (expected $2, got $3)"; FAIL=1; fi
}

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check "site home page"                 200 "$(code "$BASE/")"
check "SPA deep link (/patients)"      200 "$(code "$BASE/patients")"
check "API health (/api/up)"           200 "$(code "$BASE/api/up")"
check "CSRF cookie endpoint"           204 "$(code -c "$JAR" -H "Referer: $BASE/" "$BASE/api/sanctum/csrf-cookie")"
grep -q XSRF-TOKEN "$JAR"; check "XSRF-TOKEN cookie set" 0 $?
check "guest /api/auth/me is 401"      401 "$(code -H 'Accept: application/json' "$BASE/api/auth/me")"

# Full login path (session + CSRF + rate limiter) with wrong credentials:
# must be a 422 "wrong password", never a 500.
XSRF="$(awk '$6=="XSRF-TOKEN"{print $7}' "$JAR" | python -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))' 2>/dev/null || true)"
check "login path works (wrong password → 422)" 422 "$(code -b "$JAR" -c "$JAR" -X POST \
  -H 'Accept: application/json' -H 'Content-Type: application/json' -H "Referer: $BASE/" -H "Origin: $BASE" \
  -H "X-XSRF-TOKEN: $XSRF" -d '{"email":"smoke-test@invalid.test","password":"not-a-real-password"}' \
  "$BASE/api/auth/login")"

if curl -s "$BASE/api/auth/me" -H 'Accept: application/json' | grep -q '"message"'; then
  echo "  ok    API answers JSON"
else
  echo "  FAIL  API did not answer JSON (is /api routed to Laravel?)"; FAIL=1
fi

[ "$FAIL" = 0 ] && echo "Smoke test passed." || { echo "Smoke test FAILED."; exit 1; }
