#!/usr/bin/env bash
# =====================================================================
# Point the site back to the previous release (backend + frontend).
#
#   deploy/rollback.sh staging
#   deploy/rollback.sh production
#
# Database migrations are NOT undone automatically. Releases so far only
# add tables/columns, so the previous code keeps working with the newer
# schema. If a release ever changes data destructively, restore the
# backup taken before it instead (see deploy/README.md).
# =====================================================================
set -euo pipefail
TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: deploy/rollback.sh <staging|production>"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1090
source "$ROOT/deploy/targets/$TARGET.env"
SSH_PORT="${SSH_PORT:-22}"
REMOTE_PHP="${REMOTE_PHP:-php}"

ssh -p "$SSH_PORT" -o BatchMode=yes "$SSH_USER@$SSH_HOST" bash -s <<EOF
set -euo pipefail
cd '$APP_DIR'
CUR=\$(readlink current)
PREV=\$(ls -1dt releases/* | grep -v "\$(basename "\$CUR")\$" | head -1 || true)
[ -n "\$PREV" ] || { echo "No previous release to roll back to."; exit 1; }
ln -sfn "\$(pwd)/\$PREV" current.tmp && mv -Tf current.tmp current
cd current && '$REMOTE_PHP' artisan config:cache && '$REMOTE_PHP' artisan route:cache
( cd frontend && find . -mindepth 1 -maxdepth 1 ! -name index.html -exec cp -R {} '$WEB_DIR/' \; )
cp frontend/index.html '$WEB_DIR/index.html'
echo "Rolled back: \$(basename "\$CUR") -> \$(basename "\$PREV")"
EOF

"$ROOT/deploy/smoke.sh" "$SITE_URL"
