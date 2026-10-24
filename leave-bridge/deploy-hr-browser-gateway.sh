#!/usr/bin/env bash
set -euo pipefail
# Separate browser-facing gateway. DO NOT deploy over the internal staging gateway.
PROJECT=attendance-leave-sync
REGION=asia-southeast1
SERVICE=leave-hr-browser-gateway
RUNTIME=leave-hr-gateway@attendance-leave-sync.iam.gserviceaccount.com
SHEET=1npvICjymicRohQ6G16Ys3Rm9kp7f3XwREIXsnpBz8tM
FIREBASE=daily-attendance-structure
APP_ID=1:321384539910:web:c81475cd6d4d8cedcea087
ORIGIN=https://harrisho1234-spec.github.io
HR_EMAILS=harris.ho1234@gmail.com
cd "$(dirname "$0")"
npm test
if [[ "${CONFIRM_BROWSER_GATEWAY_DEPLOYMENT:-}" != "yes" ]]; then
  echo "Dry-run safety stop. Only proceed after independent authorization review."
  echo "To deploy: CONFIRM_BROWSER_GATEWAY_DEPLOYMENT=yes bash deploy-hr-browser-gateway.sh"
  exit 2
fi
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cp package.json package-lock.json "$workdir/"
cp ./*.js "$workdir/"
cp Dockerfile.gateway "$workdir/Dockerfile"
# Publicly ROUTABLE Cloud Run, application authorization REQUIRED for each /internal/hr request.
# This intentionally does not touch leave-hr-gateway-staging.
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --source="$workdir" \
  --service-account="$RUNTIME" \
  --allow-unauthenticated --ingress=all \
  --set-env-vars="ENABLE_HR_GATEWAY=true,HR_PRIVATE_SHEET_ID=$SHEET,FIREBASE_PROJECT_ID=$FIREBASE,FIREBASE_APP_ID=$APP_ID,HR_APPROVED_EMAILS=$HR_EMAILS,HR_ALLOWED_ORIGIN=$ORIGIN" \
  --min-instances=0
echo "DEPLOYED browser gateway. Keep hr-leave-config.js empty until security smoke tests pass."
