#!/usr/bin/env bash
# One-command deploy for the Relay rendezvous Worker.
#   Usage:  cd rendezvous && ./deploy.sh
# Non-interactive (CI): set CLOUDFLARE_API_TOKEN and it skips the login step.
set -euo pipefail
cd "$(dirname "$0")"

APP_ORIGIN="${APP_ORIGIN:-https://relay.polecat.live}"
ROOM="${ROOM:-polecat}"

command -v npx >/dev/null 2>&1 || { echo "✗ Node/npx not found. Install Node 18+ first."; exit 1; }

echo "▸ Deploying Relay rendezvous to Cloudflare Workers…"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  # ensure we're logged in (opens a browser once)
  npx --yes wrangler whoami >/dev/null 2>&1 || npx --yes wrangler login
elif [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  # A scoped API token can't read /memberships, so wrangler can't auto-detect
  # the account. Require the account id up front to avoid a confusing 9106.
  echo "✗ CLOUDFLARE_API_TOKEN is set but CLOUDFLARE_ACCOUNT_ID is not."
  echo "  A scoped token can't look up your account, so set it explicitly:"
  echo "    export CLOUDFLARE_ACCOUNT_ID=<your account id>   # dashboard → Workers & Pages → Account ID"
  echo "  then re-run ./deploy.sh"
  exit 1
fi

# deploy and capture output
out="$(npx --yes wrangler deploy 2>&1 | tee /dev/stderr)"
url="$(printf '%s\n' "$out" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)"
if [ -z "$url" ]; then
  echo ""
  echo "✗ Deployed, but couldn't auto-detect the URL from the output above."
  echo "  Look for a https://<name>.workers.dev line and use it as wss://<name>.workers.dev"
  exit 1
fi
wss="${url/https:/wss:}"

# health check
if curl -fsS "$url/health" >/dev/null 2>&1; then echo "✓ Health check passed ($url/health)"; fi

# build a ready setup link (URL-encoded via node, which we already require)
link="$(node -e "console.log(process.argv[1]+'/app/?rdv='+encodeURIComponent(process.argv[2])+'&room='+encodeURIComponent(process.argv[3]))" "$APP_ORIGIN" "$wss" "$ROOM")"

cat <<EOF

──────────────────────────────────────────────────────────────
✓ Rendezvous is live.

  Relay URL (Settings → Advanced):
    $wss

  Room:
    $ROOM

  One-click setup link (open it in the app to auto-configure):
    $link

Pick ONE way to use it:
  • Paste the URL + room in Settings → Advanced → Connect, or
  • Open the setup link above, or
  • Mint an invite with "include auto-connect" in the Admin area, or
  • Make it the default for everyone: set DEFAULT_RENDEZVOUS.url in
    js/config.js to "$wss" and redeploy the app once.
──────────────────────────────────────────────────────────────
EOF
