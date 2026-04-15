#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Idswyft Community Edition — Update Script
# ─────────────────────────────────────────────────
# Safely pulls the latest Docker images and restarts
# containers. Never touches .env or database volumes.
#
# Usage:
#   cd idswyft-community && bash update.sh
#
# Options:
#   --yes    Skip confirmation prompt
# ─────────────────────────────────────────────────

SKIP_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --yes) SKIP_CONFIRM=true ;;
  esac
done

# ── Colors & formatting ──────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
GRAY="\033[90m"
RESET="\033[0m"

SPINNER_CHARS='⣾⣽⣻⢿⡿⣟⣯⣷'
SPINNER_PID=""
START_TIME=$(date +%s)

info()   { echo -e "  ${GRAY}│${RESET}  ${DIM}$1${RESET}"; }
ok()     { echo -e "  ${GREEN}│${RESET}  ${GREEN}✓${RESET}  $1"; }
warn()   { echo -e "  ${YELLOW}│${RESET}  ${YELLOW}⚠${RESET}  $1"; }
fail()   { echo -e "  ${RED}│${RESET}  ${RED}✗  $1${RESET}"; exit 1; }
detail() { echo -e "  ${GRAY}│${RESET}     ${GRAY}$1${RESET}"; }
divider(){ echo -e "  ${GRAY}│${RESET}"; }

elapsed() {
  local now diff mins secs
  now=$(date +%s)
  diff=$((now - START_TIME))
  mins=$((diff / 60))
  secs=$((diff % 60))
  if [ "$mins" -gt 0 ]; then
    printf "%dm %02ds" "$mins" "$secs"
  else
    printf "%ds" "$secs"
  fi
}

start_spinner() {
  local msg="$1"
  (
    local i=0
    while true; do
      local char="${SPINNER_CHARS:$i:1}"
      printf "\r  ${GRAY}│${RESET}  ${CYAN}${BOLD}%s${RESET}  %s ${GRAY}(%s)${RESET}  " "$char" "$msg" "$(elapsed)"
      i=$(( (i + 1) % ${#SPINNER_CHARS} ))
      sleep 0.08
    done
  ) &
  SPINNER_PID=$!
}

stop_spinner() {
  if [ -n "$SPINNER_PID" ] && kill -0 "$SPINNER_PID" 2>/dev/null; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null || true
    printf "\r\033[K"
  fi
  SPINNER_PID=""
}

cleanup() { stop_spinner; }
trap cleanup EXIT

# ── Banner ────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "    ╭──────────────────────────────────────────╮"
echo "    │                                          │"
echo "    │    ◆  Idswyft Community Edition          │"
echo "    │       Update                             │"
echo "    │                                          │"
echo "    ╰──────────────────────────────────────────╯"
echo -e "${RESET}"

# ─────────────────────────────────────────
# Step 1: Pre-flight checks
# ─────────────────────────────────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 1/4: Pre-flight checks ━━━${RESET}"
divider

# Check Docker
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed"
fi
ok "Docker found"

if ! docker compose version &>/dev/null; then
  fail "Docker Compose V2 is required"
fi
ok "Docker Compose found"

if ! docker info &>/dev/null 2>&1; then
  fail "Docker daemon is not running"
fi
ok "Docker daemon running"

# Locate installation directory
INSTALL_DIR=""
if [ -f "docker-compose.yml" ] && grep -q "idswyft" docker-compose.yml 2>/dev/null; then
  INSTALL_DIR="$(pwd)"
elif [ -f "/root/idswyft-community/docker-compose.yml" ]; then
  INSTALL_DIR="/root/idswyft-community"
elif [ -f "/opt/idswyft/docker-compose.yml" ]; then
  INSTALL_DIR="/opt/idswyft"
else
  fail "Cannot find Idswyft installation. Run this from the idswyft-community directory."
fi

cd "$INSTALL_DIR"
ok "Found installation at ${CYAN}${INSTALL_DIR}${RESET}"

# Verify .env exists (we never touch it, but it must be present)
if [ ! -f ".env" ]; then
  fail ".env file not found — run install.sh first"
fi
ok ".env file present (will not be modified)"

# Detect external database (override file with busybox stub)
USE_EXTERNAL_DB=false
if [ -f "docker-compose.override.yml" ] && grep -q "busybox" docker-compose.override.yml 2>/dev/null; then
  USE_EXTERNAL_DB=true
  ok "External database detected"
fi
divider

# ── Confirmation ─────────────────────────────────
if [ "$SKIP_CONFIRM" = false ]; then
  echo -e "  ${GRAY}│${RESET}  ${BOLD}This will:${RESET}"
  echo -e "  ${GRAY}│${RESET}    ${GREEN}●${RESET}  Pull latest Docker images"
  echo -e "  ${GRAY}│${RESET}    ${GREEN}●${RESET}  Recreate containers with new images"
  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}This will NOT:${RESET}"
  echo -e "  ${GRAY}│${RESET}    ${CYAN}●${RESET}  Touch your .env file or secrets"
  echo -e "  ${GRAY}│${RESET}    ${CYAN}●${RESET}  Remove database data or uploads"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Continue with update? (Y/n): " confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    echo ""
    echo -e "    ${DIM}Update cancelled.${RESET}"
    echo ""
    exit 0
  fi
fi
divider

# ─────────────────────────────────────────
# Step 2: Record current images
# ─────────────────────────────────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 2/4: Recording current images ━━━${RESET}"
divider

BEFORE_IMAGES=$(docker compose images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true)
if [ -n "$BEFORE_IMAGES" ]; then
  echo "$BEFORE_IMAGES" | while IFS= read -r img; do
    detail "$img"
  done
  ok "Current image info recorded"
else
  info "No running images found (clean start)"
fi
divider

# ─────────────────────────────────────────
# Step 3: Pull latest images & recreate
# ─────────────────────────────────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 3/4: Pulling latest images ━━━${RESET}"
divider

# Detect active profiles
compose_cmd="docker compose"
if docker compose --profile https ps --format '{{.Name}}' 2>/dev/null | grep -q caddy; then
  compose_cmd="$compose_cmd --profile https"
  ok "HTTPS profile detected — including Caddy"
fi
if docker compose --profile autoupdate ps --format '{{.Name}}' 2>/dev/null | grep -q watchtower; then
  compose_cmd="$compose_cmd --profile autoupdate"
  ok "Auto-update profile detected — including Watchtower"
fi

start_spinner "Pulling latest images"
set +e
pull_output=$($compose_cmd pull 2>&1)
pull_exit=$?
set -e
stop_spinner

if [ "$pull_exit" -ne 0 ]; then
  echo "$pull_output"
  fail "Failed to pull images — check your internet connection"
fi
ok "Images pulled"

# Recreate containers with new images
start_spinner "Recreating containers"
set +e
up_output=$($compose_cmd up -d --force-recreate 2>&1)
up_exit=$?
set -e
stop_spinner

if [ "$up_exit" -ne 0 ]; then
  echo "$up_output"
  fail "Failed to recreate containers"
fi
ok "Containers recreated"
divider

# ─────────────────────────────────────────
# Step 4: Health checks
# ─────────────────────────────────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 4/4: Health checks ━━━${RESET}"
divider

# Wait for postgres (skip for external DB)
if [ "$USE_EXTERNAL_DB" = true ]; then
  ok "Database: external PostgreSQL"
else
  start_spinner "Waiting for database"
  retries=0
  while [ $retries -lt 30 ]; do
    if docker compose exec -T postgres pg_isready &>/dev/null 2>&1; then
      break
    fi
    retries=$((retries + 1))
    sleep 2
  done
  stop_spinner
  if [ $retries -ge 30 ]; then
    warn "Database health check timed out"
    detail "Check logs: docker compose logs postgres"
  else
    ok "Database ready"
  fi
fi

# Wait for engine (ML models take time to load)
start_spinner "Waiting for engine (loading ML models)"
retries=0
max_engine_retries=60
while [ $retries -lt $max_engine_retries ]; do
  if docker compose exec -T engine wget -qO- http://localhost:3002/health &>/dev/null 2>&1; then
    break
  fi
  retries=$((retries + 1))
  sleep 3
done
stop_spinner
if [ $retries -ge $max_engine_retries ]; then
  warn "Engine health check timed out — it may still be loading"
  detail "Check logs: docker compose logs engine"
else
  ok "Engine ready"
fi

# Wait for API
start_spinner "Waiting for API"
retries=0
while [ $retries -lt 30 ]; do
  if docker compose exec -T api wget -qO- http://localhost:3001/health &>/dev/null 2>&1; then
    break
  fi
  retries=$((retries + 1))
  sleep 2
done
stop_spinner
if [ $retries -ge 30 ]; then
  warn "API health check timed out"
  detail "Check logs: docker compose logs api"
else
  ok "API is healthy"
fi

# Check Caddy if HTTPS
if echo "$compose_cmd" | grep -q "https"; then
  start_spinner "Waiting for Caddy"
  retries=0
  while [ $retries -lt 15 ]; do
    if $compose_cmd exec -T caddy wget -qO /dev/null --no-check-certificate "https://localhost/" &>/dev/null 2>&1; then
      break
    fi
    retries=$((retries + 1))
    sleep 2
  done
  stop_spinner
  if [ $retries -ge 15 ]; then
    warn "Caddy may still be provisioning"
    detail "Check logs: $compose_cmd logs caddy"
  else
    ok "Caddy is running"
  fi
fi
divider

# ── Success ──────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "    ╭──────────────────────────────────────────╮"
echo "    │                                          │"
echo "    │    ✓  Idswyft updated successfully!      │"
printf "    │       Completed in %-16s │\n" "$(elapsed)"
echo "    │                                          │"
echo "    ╰──────────────────────────────────────────╯"
echo -e "${RESET}"
echo -e "    ${DIM}Your .env, database, and uploads are untouched.${RESET}"
echo -e "    ${DIM}View logs:${RESET} ${CYAN}$compose_cmd logs -f${RESET}"
if echo "$compose_cmd" | grep -q "autoupdate"; then
  echo ""
  echo -e "    ${CYAN}Note:${RESET} Watchtower is active — future updates will be applied automatically."
fi
echo ""
