#!/usr/bin/env bash
#
# service-key.sh — convenience wrapper around mint-service-key.ts
#
# Pulls IDSWYFT_PLATFORM_SERVICE_TOKEN from Railway for the given environment,
# then execs the TypeScript CLI with the right token + API base URL set.
#
# The token is never echoed to stdout, written to disk, or logged.
#
# Usage:
#   ./service-key.sh --env <staging|production> <command> [args...]
#
# Or shorter via -e:
#   ./service-key.sh -e staging list
#   ./service-key.sh -e production mint gatepass production "GatePass production"
#   ./service-key.sh -e staging rotate 06d621d9-720f-4c46-b140-c955dd992a63
#   ./service-key.sh -e staging revoke 06d621d9-720f-4c46-b140-c955dd992a63
#   ./service-key.sh -e production launch-gatepass
#
# Cloud-only. Stripped from community mirror via .community-ignore.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: service-key.sh --env <staging|production> <command> [args...]

Pulls the platform service token from Railway for the given environment,
then runs mint-service-key.ts with that token and the matching API base URL.

Flags:
  -e, --env <env>        Railway environment to pull token from. Required.
                         Valid: staging, production
  -h, --help             Show this message
                         (For the TS CLI's own help, run with --env <env> help.)

Commands (forwarded to mint-service-key.ts):
  list [--all]           List service keys (active by default)
  mint <product> <env> <label>
                         Mint a new service key
  rotate <id>            Rotate (mint fresh + revoke old)
  revoke <id>            Revoke a key (sets is_active=false)
  launch-gatepass        One-shot mint of dev + staging + prod GatePass keys
  help                   Show the TS CLI's help

Examples:
  service-key.sh -e staging list
  service-key.sh -e staging mint gatepass staging "GatePass staging $(date +%F)"
  service-key.sh -e production launch-gatepass

API base URL is derived from --env:
  staging    → https://staging.api.idswyft.app
  production → https://api.idswyft.app

Note: --env controls TWO things:
  1. Which Railway environment to pull the platform service token from.
  2. Which API base URL the TS CLI talks to.
That's intentional — staging tokens shouldn't reach production endpoints.

Note on `mint`: the TS CLI's <env> argument (the THIRD arg to mint) is the
service-key's service_environment, NOT the Railway env. They're often the
same but don't have to be — e.g. "mint a gatepass-development key from the
staging Railway env" is a valid pattern for testing dev-flavored keys
against staging infrastructure.
EOF
}

# ───────────────────────────────────────────────────────────────
# Parse the wrapper's own flags (--env / -e). Pass everything else through.
# ───────────────────────────────────────────────────────────────

RAILWAY_ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env)
      [[ $# -lt 2 ]] && { echo "✗ --env requires a value (staging or production)" >&2; exit 1; }
      RAILWAY_ENV="$2"
      shift 2
      ;;
    --env=*)
      RAILWAY_ENV="${1#--env=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      # First non-flag arg → start of the TS CLI command
      break
      ;;
  esac
done

if [[ -z "$RAILWAY_ENV" ]]; then
  echo "✗ --env is required (staging or production)" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# Validate environment + derive API base URL
# ───────────────────────────────────────────────────────────────

case "$RAILWAY_ENV" in
  staging)
    API_BASE="https://staging.api.idswyft.app"
    ;;
  production)
    API_BASE="https://api.idswyft.app"
    ;;
  *)
    echo "✗ --env must be 'staging' or 'production' (got: $RAILWAY_ENV)" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# Resolve the TS CLI's path (works regardless of cwd)
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_SCRIPT="$SCRIPT_DIR/mint-service-key.ts"

if [[ ! -f "$TS_SCRIPT" ]]; then
  echo "✗ mint-service-key.ts not found at $TS_SCRIPT" >&2
  echo "  Expected wrapper to live next to the TS CLI." >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# Verify the railway CLI is on PATH
# ───────────────────────────────────────────────────────────────

if ! command -v railway >/dev/null 2>&1; then
  echo "✗ railway CLI not found in PATH" >&2
  echo "  Install: bash <(curl -fsSL cli.new) | brew install railway | npm i -g @railway/cli" >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# Pull the token from Railway. Never echoed.
# ───────────────────────────────────────────────────────────────

echo "Fetching IDSWYFT_PLATFORM_SERVICE_TOKEN from Railway (idswyfts-main-api / $RAILWAY_ENV)..."

# `railway variables --json` returns full env as a JSON object. Pipe through
# python to extract just the one key without exposing the rest. Captured into
# a local variable; never written to a file or printed.
TOKEN="$(railway variables --service idswyfts-main-api --environment "$RAILWAY_ENV" --json 2>/dev/null \
  | python -c 'import json, sys; d = json.load(sys.stdin); print(d.get("IDSWYFT_PLATFORM_SERVICE_TOKEN", ""), end="")')"

if [[ -z "$TOKEN" ]]; then
  echo "✗ Could not fetch IDSWYFT_PLATFORM_SERVICE_TOKEN from Railway $RAILWAY_ENV." >&2
  echo "  Possible causes:" >&2
  echo "    - Variable not set on idswyfts-main-api ($RAILWAY_ENV)" >&2
  echo "    - Variable name has whitespace (check with: railway variables --service idswyfts-main-api --environment $RAILWAY_ENV --json | grep PLATFORM)" >&2
  echo "    - Not authenticated to Railway (try: railway whoami)" >&2
  exit 1
fi

if [[ ${#TOKEN} -lt 32 ]]; then
  echo "⚠ Token from Railway is suspiciously short (${#TOKEN} chars). Expected 64-char hex." >&2
  echo "  Continuing anyway, but check for paste-error in the variable value." >&2
fi

# ───────────────────────────────────────────────────────────────
# Confirmation banner before any production operation.
# The TS CLI also prompts for production *operations* (mint/rotate/revoke
# on a production key), but this banner shows what env we're acting against
# regardless of the operation type.
# ───────────────────────────────────────────────────────────────

if [[ "$RAILWAY_ENV" == "production" ]]; then
  echo ""
  echo "  ╔════════════════════════════════════════════════════╗"
  echo "  ║  ⚠️  Acting against PRODUCTION                      ║"
  echo "  ║  API base: $API_BASE                  ║"
  echo "  ╚════════════════════════════════════════════════════╝"
  echo ""
fi

# ───────────────────────────────────────────────────────────────
# Run the TS CLI. Pass through all remaining args.
# ───────────────────────────────────────────────────────────────

IDSWYFT_PLATFORM_SERVICE_TOKEN="$TOKEN" \
IDSWYFT_API_BASE="$API_BASE" \
  exec npx tsx "$TS_SCRIPT" "$@"
