#!/usr/bin/env bash
#
# Trigger a production deploy of the dashboard to Google Cloud Run and
# watch it through to completion. Always builds from whatever is
# currently pushed to origin/prod on GitHub — local uncommitted changes
# are never included, since this runs the "Deploy Production to Google
# Cloud" GitHub Actions workflow against the prod ref, not a local build.
#
# Usage:
#   ./scripts/deploy-prod.sh ["<change reference>"]
#
# The change reference is optional — if omitted, one is auto-generated
# from the current origin/prod commit.
#
set -euo pipefail

REPO="Juise-Mobility-Inc/juise-rider-admin-dashboard"
WORKFLOW="Deploy Production to Google Cloud"

CHANGE_REFERENCE="${1:-}"
if [ -z "${CHANGE_REFERENCE}" ]; then
  git fetch origin prod --quiet
  COMMIT_SUBJECT="$(git log origin/prod -1 --format=%s)"
  COMMIT_SHA="$(git log origin/prod -1 --format=%h)"
  CHANGE_REFERENCE="Deploy ${COMMIT_SHA}: ${COMMIT_SUBJECT}"
fi

echo "==> Deploying ${REPO} (workflow: \"${WORKFLOW}\")"
echo "    change_reference: ${CHANGE_REFERENCE}"

BEFORE_ID="$(gh run list --repo "${REPO}" --workflow "${WORKFLOW}" --limit 1 --json databaseId -q '.[0].databaseId // empty')"

gh workflow run "${WORKFLOW}" --repo "${REPO}" --ref prod -f "change_reference=${CHANGE_REFERENCE}"

echo "==> Waiting for the new run to appear..."
RUN_ID=""
for _ in $(seq 1 30); do
  sleep 2
  CANDIDATE="$(gh run list --repo "${REPO}" --workflow "${WORKFLOW}" --limit 1 --json databaseId -q '.[0].databaseId // empty')"
  if [ -n "${CANDIDATE}" ] && [ "${CANDIDATE}" != "${BEFORE_ID}" ]; then
    RUN_ID="${CANDIDATE}"
    break
  fi
done

if [ -z "${RUN_ID}" ]; then
  echo "Could not find the new run — check manually: https://github.com/${REPO}/actions" >&2
  exit 1
fi

echo "==> Watching run ${RUN_ID}: https://github.com/${REPO}/actions/runs/${RUN_ID}"
gh run watch "${RUN_ID}" --repo "${REPO}" --exit-status
