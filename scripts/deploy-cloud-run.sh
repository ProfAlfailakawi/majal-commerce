#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${CLOUD_RUN_SERVICE_NAME:-majal-app}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
PROJECT_ID="${CLOUD_RUN_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI (gcloud) is required." >&2
  exit 1
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "No Google Cloud project is selected. Set CLOUD_RUN_PROJECT_ID or run: gcloud config set project PROJECT_ID" >&2
  exit 1
fi

echo "Deploying MAJAL -> project=$PROJECT_ID region=$REGION service=$SERVICE_NAME"
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --quiet

URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
if [[ -z "$URL" ]]; then
  echo "Deployment completed, but the Cloud Run URL could not be resolved." >&2
  exit 1
fi

# AI Studio normally injects APP_URL; manual Cloud Run deployment needs to pin it explicitly.
gcloud run services update "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "APP_URL=$URL" \
  --quiet >/dev/null

printf '\nMAJAL Cloud Run service: %s\nURL: %s\n' "$SERVICE_NAME" "$URL"
