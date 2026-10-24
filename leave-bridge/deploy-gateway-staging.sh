#!/usr/bin/env bash
set -euo pipefail

# Deploy a PRIVATE staging gateway only. This does not enable browser access.
PROJECT="attendance-leave-sync"
REGION="asia-southeast1"
SERVICE="leave-hr-gateway-staging"
RUNTIME="leave-hr-gateway@attendance-leave-sync.iam.gserviceaccount.com"
BRIDGE="https://leave-bridge-916969515475.asia-southeast1.run.app"
FIREBASE="daily-attendance-structure"
APP_ID="1:321384539910:web:c81475cd6d4d8cedcea087"
HR_EMAIL="harris.ho1234@gmail.com"
ORIGIN="https://harrisho1234-spec.github.io"

cd "$(dirname "$0")"
if [[ ! -f package-lock.json ]]; then
  echo "ERROR: Missing tested package-lock.json. Run npm install first." >&2
  exit 1
fi
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
cp package.json package-lock.json "$workdir/"
cp ./*.js "$workdir/"
cp Dockerfile.gateway "$workdir/Dockerfile"

# No service account JSON keys, personal tokens, or leave data are copied.
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source="$workdir" \
  --service-account="$RUNTIME" \
  --no-allow-unauthenticated \
  --ingress=internal \
  --set-env-vars="ENABLE_HR_GATEWAY=true,LEAVE_BRIDGE_URL=$BRIDGE,FIREBASE_PROJECT_ID=$FIREBASE,FIREBASE_APP_ID=$APP_ID,HR_APPROVED_EMAILS=$HR_EMAIL,HR_ALLOWED_ORIGIN=$ORIGIN" \
  --min-instances=0

echo "Staging gateway deployed with Cloud Run IAM required and internal ingress."
echo "No public endpoint or GitHub Pages integration has been enabled."
