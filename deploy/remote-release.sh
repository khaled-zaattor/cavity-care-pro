#!/usr/bin/env bash
# =====================================================================
# Runs ON THE SERVER (called by deploy/deploy.sh). Layout:
#
#   $APP_DIR/releases/<release>/   backend code (+ frontend/ copy for rollback)
#   $APP_DIR/shared/.env           server settings (created on first deploy)
#   $APP_DIR/shared/storage/       logs, backups, patient files (kept across releases)
#   $APP_DIR/current -> releases/<release>
#   $WEB_DIR/                      React build (the site's document root)
#   $WEB_DIR/api -> $APP_DIR/current/public
#
# Env: APP_DIR, WEB_DIR, RELEASE, PHP (default php), COMPOSER (default composer),
#      MAINTENANCE=1 to put the API in maintenance mode while migrating.
# =====================================================================
set -euo pipefail
: "${APP_DIR:?}" "${WEB_DIR:?}" "${RELEASE:?}"
PHP="${PHP:-php}"
COMPOSER="${COMPOSER:-composer}"
MAINTENANCE="${MAINTENANCE:-0}"
# Set when the API has its own subdomain: that domain's document root becomes a link to current/public.
BACKEND_WEB_DIR="${BACKEND_WEB_DIR:-}"
IN="$APP_DIR/incoming"
REL="$APP_DIR/releases/$RELEASE"
SHARED="$APP_DIR/shared"
KEEP=5

log() { echo "    [remote] $*"; }

mkdir -p "$REL" "$SHARED/storage"
tar -xzf "$IN/backend.tgz" -C "$REL"

# ---- shared storage ---------------------------------------------------
if [ ! -d "$SHARED/storage/framework" ]; then
  log "first deploy: creating shared storage"
  cp -R "$REL/storage/." "$SHARED/storage/"
fi
mkdir -p "$SHARED/storage/framework/"{cache/data,sessions,views,testing} "$SHARED/storage/logs" "$SHARED/storage/app/private"
rm -rf "$REL/storage"
ln -s "$SHARED/storage" "$REL/storage"

# ---- .env ---------------------------------------------------------------
if [ ! -f "$SHARED/.env" ]; then
  cp "$REL/.env.production.example" "$SHARED/.env"
  chmod 600 "$SHARED/.env"
  log "FIRST DEPLOY: created $SHARED/.env from the template."
  log "Fill in APP_URL, DB_*, SANCTUM_STATEFUL_DOMAINS, then run deploy again."
  rm -rf "$REL"
  exit 2
fi
ln -sfn "$SHARED/.env" "$REL/.env"

cd "$REL"
log "composer install"
$COMPOSER install --no-dev --optimize-autoloader --no-interaction --no-progress --quiet

if ! grep -q '^APP_KEY=base64:' "$SHARED/.env"; then
  log "generating APP_KEY"
  $PHP artisan key:generate --force --no-interaction
fi

DOWN=0
if [ "$MAINTENANCE" = "1" ] && [ -e "$APP_DIR/current/artisan" ]; then
  log "maintenance mode on"
  $PHP "$APP_DIR/current/artisan" down --retry=15 || true
  DOWN=1
fi

log "migrate"
$PHP artisan migrate --force --no-interaction
$PHP artisan db:seed --force --no-interaction   # reference data only (idempotent)

log "caches"
$PHP artisan config:cache
$PHP artisan route:cache
$PHP artisan event:cache

# ---- switch backend (atomic symlink swap) ------------------------------
ln -sfn "$REL" "$APP_DIR/current.tmp"
mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
log "backend now on $RELEASE"

if [ -n "$BACKEND_WEB_DIR" ]; then
  # Separate API subdomain: its public_html -> current/public
  if [ ! -L "$BACKEND_WEB_DIR" ]; then
    if [ -e "$BACKEND_WEB_DIR" ]; then
      mv "$BACKEND_WEB_DIR" "$BACKEND_WEB_DIR.orig-$(date +%Y%m%d%H%M%S)"
      log "moved the original $BACKEND_WEB_DIR aside"
    fi
    ln -s "$APP_DIR/current/public" "$BACKEND_WEB_DIR"
    log "linked $BACKEND_WEB_DIR -> current/public"
  fi
elif [ ! -L "$WEB_DIR/api" ]; then
  if [ -e "$WEB_DIR/api" ]; then
    log "ERROR: $WEB_DIR/api exists and is not a symlink — move it away and redeploy."
    exit 1
  fi
  ln -s "$APP_DIR/current/public" "$WEB_DIR/api"
  log "linked $WEB_DIR/api -> current/public"
fi

# ---- frontend --------------------------------------------------------------
# Keep a copy inside the release (rollback restores it), then publish:
# assets first (new hashed names), index.html last.
mkdir -p "$REL/frontend"
tar -xzf "$IN/frontend.tgz" -C "$REL/frontend"
mkdir -p "$WEB_DIR"
( cd "$REL/frontend" && find . -mindepth 1 -maxdepth 1 ! -name index.html -exec cp -R {} "$WEB_DIR/" \; )
cp "$REL/frontend/index.html" "$WEB_DIR/index.html"
log "frontend published to $WEB_DIR"

if [ "$DOWN" = "1" ]; then
  $PHP artisan up
  log "maintenance mode off"
fi

# ---- prune old releases ------------------------------------------------
ls -1dt "$APP_DIR"/releases/* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf
rm -f "$IN/backend.tgz" "$IN/frontend.tgz"
log "ok"
