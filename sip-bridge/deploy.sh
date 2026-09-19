#!/bin/bash
# Run ON THE VPS (by the GitHub Actions workflow, over SSH, as the
# dedicated deploy user) — the VPS-side equivalent of what Vercel does
# automatically for the Next.js app: pull the latest commit and restart.
set -euo pipefail

REPO_DIR="/opt/ai-call-agent"
BRANCH="main"

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

cd "$REPO_DIR/sip-bridge"
npm install --omit=dev

# Needs a narrowly-scoped sudoers NOPASSWD rule for exactly this command —
# see README.md's "Auto-deploy from GitHub" section.
sudo systemctl restart sip-bridge

echo "[deploy] sip-bridge redeployed at $(date -u +%FT%TZ) ($(git rev-parse --short HEAD))"
