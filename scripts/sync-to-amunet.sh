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

# The remote script preserves .env and docker-compose.yml from any existing
# tool dir, then atomically swaps tools.new → tools. Each preservation cp is
# best-effort: if a file can't be read (e.g. root-owned with chmod 600),
# we WARN and continue — the runner will regenerate it on the next deploy.
(
  cd "$REPO_ROOT/amunet/tools"
  tar --exclude=.gitkeep -cf - .
) | ssh "$AMUNET_HOST" '
  set -eu
  REMOTE_BASE="'"$REMOTE_BASE"'"

  # Clean staging
  rm -rf "$REMOTE_BASE/tools.new"
  mkdir -p "$REMOTE_BASE/tools.new"
  tar -xf - -C "$REMOTE_BASE/tools.new"

  # Best-effort preserve runtime files from current tools/ to tools.new/
  if [ -d "$REMOTE_BASE/tools" ]; then
    preserve_count=0
    skip_count=0
    while IFS= read -r srcfile; do
      rel="${srcfile#$REMOTE_BASE/tools/}"
      new_dir="$REMOTE_BASE/tools.new/$(dirname "$rel")"
      if [ -d "$new_dir" ]; then
        if cp -p "$srcfile" "$new_dir/$(basename "$srcfile")" 2>/dev/null; then
          preserve_count=$((preserve_count + 1))
        else
          echo "  ⚠ skipped (not readable): $rel — will be regenerated on next deploy" >&2
          skip_count=$((skip_count + 1))
        fi
      fi
    done < <(find "$REMOTE_BASE/tools" \( -name ".env" -o -name "docker-compose.yml" \) 2>/dev/null)
    echo "  preserved $preserve_count file(s); skipped $skip_count"
  fi

  # Atomic swap
  rm -rf "$REMOTE_BASE/tools.old"
  [ -d "$REMOTE_BASE/tools" ] && mv "$REMOTE_BASE/tools" "$REMOTE_BASE/tools.old"
  mv "$REMOTE_BASE/tools.new" "$REMOTE_BASE/tools"
  rm -rf "$REMOTE_BASE/tools.old"

  echo "  ✓ tools/ swap complete"
'

echo "→ Syncing runner/ (compose + .env.example only, preserves .env)"
scp -O -q "$REPO_ROOT/amunet/runner/docker-compose.yml" \
       "$AMUNET_HOST:$REMOTE_BASE/runner/docker-compose.yml"
scp -O -q "$REPO_ROOT/amunet/runner/.env.example" \
       "$AMUNET_HOST:$REMOTE_BASE/runner/.env.example"

# -----------------------------------------------------------------------------
# Nginx config — needs sudo to install + reload
# -----------------------------------------------------------------------------
echo "→ Copying nginx config to Amunet"
scp -O -q "$REPO_ROOT/amunet/nginx/http.amunet-rogan.conf" \
       "$AMUNET_HOST:/tmp/http.amunet-rogan.conf"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Sudo password needed on Amunet to reload nginx."
echo "  Type it when prompted below (will not echo):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ssh -t "$AMUNET_HOST" "
  set -e
  sudo -p '  Amunet sudo password: ' cp /tmp/http.amunet-rogan.conf $NGINX_CONF_PATH
  sudo chmod 644 $NGINX_CONF_PATH
  sudo nginx -t
  sudo /usr/syno/bin/synosystemctl reload nginx
  rm /tmp/http.amunet-rogan.conf
  echo '✓ nginx reloaded successfully'
" 2>&1 | grep -v "post-quantum\|See https://openssh" || true

echo ""
echo "✓ Sync complete."
