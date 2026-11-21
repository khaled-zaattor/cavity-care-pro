#!/usr/bin/env bash
# =====================================================================
# Deploy Cavity Care Pro to the shared host (run from Git Bash).
#
#   deploy/deploy.sh staging          # build + upload + release
#   deploy/deploy.sh production
#
# Settings per target: deploy/targets/<target>.env (git-ignored; copy
# deploy/targets/example.env). Authentication is your SSH key — no
# passwords are stored or typed by this script.
#
# What it does:
#   1. refuses to run with uncommitted changes (a release = a git commit)
#   2. builds the React app (dist/) and packs backend/ from git HEAD
#   3. uploads both + deploy/remote-release.sh over SSH
#   4. runs remote-release.sh (composer, migrate, caches, switch, frontend)
#   5. runs deploy/smoke.sh against the site
# =====================================================================
set -euo pipefail

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: deploy/deploy.sh <staging|production>"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/deploy/targets/$TARGET.env"
[ -f "$CONF" ] || { echo "Missing $CONF — copy deploy/targets/example.env and fill it in."; exit 1; }
# shellcheck disable=SC1090
source "$CONF"
: "${SSH_HOST:?set in $CONF}" "${SSH_USER:?}" "${APP_DIR:?}" "${WEB_DIR:?}" "${SITE_URL:?}"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_PHP="${REMOTE_PHP:-php}"
REMOTE_COMPOSER="${REMOTE_COMPOSER:-composer}"
MAINTENANCE="${MAINTENANCE:-0}"

if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "Uncommitted changes. Commit first — the release is built from git HEAD."
  exit 1
fi

REV="$(git -C "$ROOT" rev-parse --short HEAD)"
RELEASE="$(date -u +%Y%m%d-%H%M%S)-$REV"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ "$TARGET" = "production" ]; then
  read -r -p "Deploy $REV to PRODUCTION ($SITE_URL)? Type 'yes': " answer
  [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
fi

echo "==> Building frontend ($REV)"
(cd "$ROOT" && npm run build --silent)
tar -czf "$WORK/frontend.tgz" -C "$ROOT/dist" .

echo "==> Packing backend from git HEAD"
git -C "$ROOT" archive --format=tar HEAD backend | tar -x -C "$WORK"
rm -rf "$WORK/backend/tests" "$WORK/backend/node_modules" "$WORK/backend/database/database.sqlite"
tar -czf "$WORK/backend.tgz" -C "$WORK/backend" .

SSH=(ssh -p "$SSH_PORT" -o BatchMode=yes "$SSH_USER@$SSH_HOST")

echo "==> Uploading to $SSH_HOST:$APP_DIR/incoming"
"${SSH[@]}" "mkdir -p '$APP_DIR/incoming'"
scp -P "$SSH_PORT" -o BatchMode=yes -q \
  "$WORK/backend.tgz" "$WORK/frontend.tgz" "$ROOT/deploy/remote-release.sh" \
  "$SSH_USER@$SSH_HOST:$APP_DIR/incoming/"

echo "==> Releasing $RELEASE"
"${SSH[@]}" "APP_DIR='$APP_DIR' WEB_DIR='$WEB_DIR' RELEASE='$RELEASE' PHP='$REMOTE_PHP' COMPOSER='$REMOTE_COMPOSER' MAINTENANCE='$MAINTENANCE' bash '$APP_DIR/incoming/remote-release.sh'"

echo "==> Smoke test"
"$ROOT/deploy/smoke.sh" "$SITE_URL"

echo "Done: $RELEASE is live on $SITE_URL"
