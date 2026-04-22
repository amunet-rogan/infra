#!/usr/bin/env bash
# Sync infra/amunet/ to Amunet NAS and reload nginx.
#
# Uses tar over ssh instead of rsync because Synology's setuid /usr/bin/rsync
# requires a TTY, which corrupts rsync's binary protocol stream.
#
# COPYFILE_DISABLE=1 suppresses macOS's AppleDouble metadata files (._*).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AMUNET_HOST="${AMUNET_HOST:-amunet.tail49d1b.ts.net}"
REMOTE_BASE="/volume1/docker/amunet-rogan"
NGINX_CONF_PATH="/etc/nginx/conf.d/http.amunet-rogan.conf"

export COPYFILE_DISABLE=1

echo "→ Target: $AMUNET_HOST"
echo "→ Remote base: $REMOTE_BASE"
echo ""

# Make sure remote dirs exist
ssh "$AMUNET_HOST" "mkdir -p $REMOTE_BASE/tools $REMOTE_BASE/runner/data" \
  2>&1 | grep -v "post-quantum\|See https://openssh" || true

# -----------------------------------------------------------------------------
# Sync tools/  — atomic full replace (tools/ contains only tracked config.env
# files; tool runtime state lives in tools/<user>/<tool>/.env which is NOT here)
# -----------------------------------------------------------------------------
echo "→ Syncing tools/ (atomic full replace)"
(
  cd "$REPO_ROOT/amunet/tools"
  tar --exclude='.gitkeep' -cf - .
) | ssh "$AMUNET_HOST" "
  set -e
  rm -rf $REMOTE_BASE/tools.new
  mkdir -p $REMOTE_BASE/tools.new
  tar -xf - -C $REMOTE_BASE/tools.new

  # Preserve any existing .env files from tools.old that match a current tool
  if [ -d $REMOTE_BASE/tools ]; then
    find $REMOTE_BASE/tools -name '.env' 2>/dev/null | while read envfile; do
      rel=\"\${envfile#$REMOTE_BASE/tools/}\"
      new_dir=\"$REMOTE_BASE/tools.new/\$(dirname \"\$rel\")\"
      if [ -d \"\$new_dir\" ]; then
        cp -p \"\$envfile\" \"\$new_dir/.env\"
      fi
    done
    rm -rf $REMOTE_BASE/tools.old
    mv $REMOTE_BASE/tools $REMOTE_BASE/tools.old
  fi
  mv $REMOTE_BASE/tools.new $REMOTE_BASE/tools
  rm -rf $REMOTE_BASE/tools.old
" 2>&1 | grep -v "post-quantum\|See https://openssh" || true

# -----------------------------------------------------------------------------
# Sync runner/  — only compose + .env.example; NEVER touch .env or data/
# -----------------------------------------------------------------------------
echo "→ Syncing runner/ (compose + .env.example only, preserves .env)"
scp -O -q "$REPO_ROOT/amunet/runner/docker-compose.yml" \
       "$AMUNET_HOST:$REMOTE_BASE/runner/docker-compose.yml"
scp -O -q "$REPO_ROOT/amunet/runner/.env.example" \
       "$AMUNET_HOST:$REMOTE_BASE/runner/.env.example"

# -----------------------------------------------------------------------------
# Nginx config — needs sudo to install + reload
# -----------------------------------------------------------------------------
echo "→ Copying nginx config to /tmp and installing (sudo password needed — prompt will appear after pressing Enter, even if not visible)"
scp -O -q "$REPO_ROOT/amunet/nginx/http.amunet-rogan.conf" \
       "$AMUNET_HOST:/tmp/http.amunet-rogan.conf"

ssh -t "$AMUNET_HOST" "
  set -e
  sudo cp /tmp/http.amunet-rogan.conf $NGINX_CONF_PATH
  sudo chmod 644 $NGINX_CONF_PATH
  sudo nginx -t
  sudo /usr/syno/bin/synosystemctl reload nginx
  rm /tmp/http.amunet-rogan.conf
  echo '✓ nginx reloaded successfully'
" 2>&1 | grep -v "post-quantum\|See https://openssh" || true

echo ""
echo "✓ Sync complete."
