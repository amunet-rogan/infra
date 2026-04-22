#!/usr/bin/env bash
# Sync infra/amunet/ to Amunet NAS and reload nginx.
#
# Expects an SSH config entry for "amunet" that works passwordless or with a
# key in ssh-agent. Sudo password will be prompted interactively for the
# nginx steps.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AMUNET_HOST="${AMUNET_HOST:-amunet.tail49d1b.ts.net}"
AMUNET_USER="${AMUNET_USER:-$USER}"
REMOTE_BASE="/volume1/docker/amunet-rogan"
NGINX_CONF_PATH="/etc/nginx/conf.d/http.amunet-rogan.conf"

SSH_TARGET="${AMUNET_USER}@${AMUNET_HOST}"

echo "→ Target: $SSH_TARGET"
echo "→ Remote base: $REMOTE_BASE"
echo ""

# Make sure remote dirs exist (user-writable part; nginx handled separately)
ssh "$SSH_TARGET" "mkdir -p $REMOTE_BASE/tools $REMOTE_BASE/runner"

echo "→ Syncing tools/ (structure + config.env files only)"
rsync -avz --delete \
    --exclude='/.gitkeep' \
    "$REPO_ROOT/amunet/tools/" \
    "$SSH_TARGET:$REMOTE_BASE/tools/"

echo ""
echo "→ Syncing runner/ (compose + env.example; NOT .env or data/)"
rsync -avz \
    --exclude='.env' \
    --exclude='data/' \
    "$REPO_ROOT/amunet/runner/" \
    "$SSH_TARGET:$REMOTE_BASE/runner/"

echo ""
echo "→ Copying nginx config to /tmp and installing (requires sudo password)"
scp "$REPO_ROOT/amunet/nginx/http.amunet-rogan.conf" \
    "$SSH_TARGET:/tmp/http.amunet-rogan.conf"

ssh -t "$SSH_TARGET" "
    sudo cp /tmp/http.amunet-rogan.conf $NGINX_CONF_PATH &&
    sudo chmod 644 $NGINX_CONF_PATH &&
    sudo nginx -t &&
    sudo synosystemctl reload nginx &&
    rm /tmp/http.amunet-rogan.conf &&
    echo '✓ nginx reloaded successfully'
"

echo ""
echo "✓ Sync complete."
