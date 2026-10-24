#!/usr/bin/env bash
set -euo pipefail
URL="${1:?Usage: bash verify-hr-browser-gateway.sh https://SERVICE-...run.app}"
URL="${URL%/}"
[[ "$URL" =~ ^https://[a-zA-Z0-9.-]+\.run\.app$ ]] || { echo "Invalid HTTPS Cloud Run URL"; exit 2; }
status() { curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}' "$@"; }
# No staff IDs or private reasons in this smoke test.
A="$(status "$URL/internal/hr/entry")"
B="$(status -X OPTIONS -H 'Origin: https://untrusted.example' "$URL/internal/hr/entry")"
C="$(status -X OPTIONS -H 'Origin: https://harrisho1234-spec.github.io' -H 'Access-Control-Request-Method: GET' "$URL/internal/hr/entry")"
printf 'Anonymous request: %s (expected 401)\nUntrusted origin: %s (expected 403)\nApproved CORS preflight: %s (expected 204)\n' "$A" "$B" "$C"
[[ "$A" == 401 && "$B" == 403 && "$C" == 204 ]] || { echo 'SECURITY SMOKE TEST FAILED: do not enable frontend'; exit 1; }
echo 'Anonymous/CORS smoke tests passed. Approved Firebase user read and unauthorized Firebase user denial STILL need live verification.'
