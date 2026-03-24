#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Idswyft Community Edition — Install Script
# ─────────────────────────────────────────────────
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft/main/install.sh | bash
#   or:
#   git clone https://github.com/team-idswyft/idswyft.git && cd idswyft && ./install.sh
# ─────────────────────────────────────────────────

REPO_URL="https://github.com/team-idswyft/idswyft.git"

# ── Colors & formatting ──────────────────────────
BOLD="\033[1m"
DIM="\033[2m"
ITALIC="\033[3m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[34m"
MAGENTA="\033[35m"
WHITE="\033[97m"
GRAY="\033[90m"
RESET="\033[0m"
BG_CYAN="\033[46m"
BG_GREEN="\033[42m"
BG_RED="\033[41m"

SPINNER_CHARS='⣾⣽⣻⢿⡿⣟⣯⣷'
SPINNER_PID=""
STEP_CURRENT=0
STEP_TOTAL=5
START_TIME=$(date +%s)

# ── Banner ────────────────────────────────────────
banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "    ╭──────────────────────────────────────────╮"
  echo "    │                                          │"
  echo "    │    ◆  Idswyft Community Edition          │"
  echo "    │       Identity Verification Platform     │"
  echo "    │                                          │"
  echo "    ╰──────────────────────────────────────────╯"
  echo -e "${RESET}"
}

# ── Formatting helpers ────────────────────────────
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

step() {
  STEP_CURRENT=$((STEP_CURRENT + 1))
  echo ""
  echo -e "  ${CYAN}${BOLD}━━━ Step ${STEP_CURRENT}/${STEP_TOTAL}: $1 ━━━${RESET}"
}

info()    { echo -e "  ${GRAY}│${RESET}  ${DIM}$1${RESET}"; }
ok()      { echo -e "  ${GREEN}│${RESET}  ${GREEN}✓${RESET}  $1"; }
warn()    { echo -e "  ${YELLOW}│${RESET}  ${YELLOW}⚠${RESET}  $1"; }
fail()    { echo -e "  ${RED}│${RESET}  ${RED}✗  $1${RESET}"; exit 1; }
detail()  { echo -e "  ${GRAY}│${RESET}     ${GRAY}$1${RESET}"; }

# ── Progress bar ──────────────────────────────────
# Usage: progress_bar "message" current total
progress_bar() {
  local msg="$1" current="$2" total="$3"
  local width=30
  local pct=$((current * 100 / total))
  local filled=$((current * width / total))
  local empty=$((width - filled))
  local bar=""

  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done

  printf "\r  ${GRAY}│${RESET}  ${CYAN}%s${RESET} ${GRAY}%3d%%${RESET} ${DIM}%s${RESET}  " "$bar" "$pct" "$msg"
}

# ── Spinner ───────────────────────────────────────
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

# ── Section separator ─────────────────────────────
divider() {
  echo -e "  ${GRAY}│${RESET}"
}

# ─────────────────────────────────────────
# Step 1: Pre-flight checks
# ─────────────────────────────────────────
check_dependencies() {
  step "Checking dependencies"
  divider

  local docker_ver compose_ver

  if ! command -v docker &>/dev/null; then
    fail "Docker is not installed"
    detail "Install from: https://docs.docker.com/get-docker/"
  fi
  docker_ver=$(docker --version 2>/dev/null | head -1)
  ok "Docker found"
  detail "$docker_ver"

  if ! docker compose version &>/dev/null; then
    fail "Docker Compose V2 is required"
    detail "Update Docker or install the compose plugin"
  fi
  compose_ver=$(docker compose version 2>/dev/null | head -1)
  ok "Docker Compose found"
  detail "$compose_ver"

  if ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon is not running"
    detail "Start Docker Desktop and try again"
  fi
  ok "Docker daemon running"
  divider
}

# ─────────────────────────────────────────
# Step 2: Clone repo if running via curl pipe
# ─────────────────────────────────────────
ensure_repo() {
  step "Getting source code"
  divider

  if [ ! -f "docker-compose.yml" ]; then
    if ! command -v git &>/dev/null; then
      fail "Git is not installed. Install from https://git-scm.com/"
    fi
    start_spinner "Cloning repository"
    git clone --depth 1 "$REPO_URL" idswyft 2>/dev/null
    stop_spinner
    cd idswyft
    ok "Repository cloned"
    detail "github.com/team-idswyft/idswyft"
  else
    ok "Already in Idswyft directory"
  fi
  divider
}

# ─────────────────────────────────────────
# Generate secrets
# ─────────────────────────────────────────
generate_secret() {
  if command -v openssl &>/dev/null; then
    openssl rand -hex 16
  else
    head -c 16 /dev/urandom | xxd -p 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 32
  fi
}

# ─────────────────────────────────────────
# Step 3: Create .env file
# ─────────────────────────────────────────
setup_env() {
  step "Configuring environment"
  divider

  if [ -f ".env" ]; then
    warn ".env file already exists"
    read -rp "       Overwrite? (y/N): " overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
      ok "Keeping existing .env"
      divider
      return
    fi
  fi

  info "Generating secure secrets..."

  local db_password jwt_secret api_key_secret encryption_key service_token
  db_password=$(generate_secret)
  jwt_secret=$(generate_secret)
  api_key_secret=$(generate_secret)
  encryption_key=$(generate_secret)
  service_token=$(generate_secret)

  cat > .env <<EOF
# ─────────────────────────────────────────
# Idswyft Community Edition Configuration
# Generated by install.sh on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# ─────────────────────────────────────────

# Database
DB_PASSWORD=${db_password}

# Authentication secrets (auto-generated, keep private)
JWT_SECRET=${jwt_secret}
API_KEY_SECRET=${api_key_secret}
ENCRYPTION_KEY=${encryption_key}
SERVICE_TOKEN=${service_token}

# Port to expose the frontend (default: 80)
PORT=80

# Set to true to enable sandbox/mock verification mode
SANDBOX_MODE=false
EOF

  ok "Created .env with secure secrets"
  detail "DB_PASSWORD, JWT_SECRET, API_KEY_SECRET, ENCRYPTION_KEY, SERVICE_TOKEN"
  divider
}

# ─────────────────────────────────────────
# Step 4: Build and start
# ─────────────────────────────────────────
start_services() {
  step "Building containers"
  divider
  info "First run downloads base images + compiles the app"
  info "Subsequent builds use cache and are much faster"
  echo -e "  ${GRAY}│${RESET}"

  local build_log line_count
  build_log=$(mktemp)
  line_count=0

  set +e
  docker compose build 2>&1 | tee "$build_log" | while IFS= read -r line; do
    line_count=$((line_count + 1))

    case "$line" in
      *"Pulling"*|*"pulling"*)
        echo -e "  ${GRAY}│${RESET}  ${BLUE}⬇${RESET}  ${line}"
        ;;
      *"Downloaded"*|*"Pull complete"*|*"Already exists"*)
        echo -e "  ${GRAY}│${RESET}  ${GREEN}⬇${RESET}  ${DIM}${line}${RESET}"
        ;;
      *"STEP"*|*"Step"*)
        echo -e "  ${GRAY}│${RESET}  ${MAGENTA}▸${RESET}  ${WHITE}${line}${RESET}"
        ;;
      *"CACHED"*)
        echo -e "  ${GRAY}│${RESET}  ${GREEN}◆${RESET}  ${DIM}${line}${RESET}"
        ;;
      *"DONE"*)
        echo -e "  ${GRAY}│${RESET}  ${GREEN}●${RESET}  ${GREEN}${line}${RESET}"
        ;;
      *"RUN"*|*"COPY"*|*"FROM"*|*"WORKDIR"*|*"ARG"*|*"EXPOSE"*|*"CMD"*)
        echo -e "  ${GRAY}│${RESET}  ${CYAN}▸${RESET}  ${DIM}${line}${RESET}"
        ;;
      *"npm"*install*|*"npm"*build*|*"npm"*prune*)
        echo -e "  ${GRAY}│${RESET}  ${YELLOW}▸${RESET}  ${line}"
        ;;
      *"error"*|*"Error"*|*"ERROR"*|*"failed"*)
        echo -e "  ${GRAY}│${RESET}  ${RED}✗${RESET}  ${RED}${line}${RESET}"
        ;;
      *"exporting"*|*"writing"*|*"naming"*)
        echo -e "  ${GRAY}│${RESET}  ${CYAN}◇${RESET}  ${DIM}${line}${RESET}"
        ;;
      *"#"[0-9]*)
        echo -e "  ${GRAY}│${RESET}     ${GRAY}${line}${RESET}"
        ;;
    esac
  done
  local build_exit=${PIPESTATUS[0]}
  set -e

  if [ "$build_exit" -ne 0 ]; then
    echo ""
    echo -e "  ${RED}│${RESET}"
    echo -e "  ${RED}│${RESET}  Build failed. Full log: ${BOLD}$build_log${RESET}"
    echo -e "  ${RED}│${RESET}  Last 10 lines:"
    tail -10 "$build_log" | while IFS= read -r errline; do
      echo -e "  ${RED}│${RESET}    ${DIM}${errline}${RESET}"
    done
    fail "Docker build failed — see above for details"
  fi
  rm -f "$build_log"

  echo -e "  ${GRAY}│${RESET}"
  ok "Containers built ${GREEN}${BOLD}$(elapsed)${RESET}"

  step "Starting services"
  divider

  docker compose up -d 2>&1 | while IFS= read -r line; do
    case "$line" in
      *"Created"*|*"Started"*)
        echo -e "  ${GRAY}│${RESET}  ${GREEN}▸${RESET}  ${line}"
        ;;
      *"Running"*)
        echo -e "  ${GRAY}│${RESET}  ${CYAN}▸${RESET}  ${DIM}${line}${RESET}"
        ;;
      *)
        echo -e "  ${GRAY}│${RESET}     ${DIM}${line}${RESET}"
        ;;
    esac
  done
  ok "Containers started"

  echo -e "  ${GRAY}│${RESET}"

  # Wait for health check with spinner
  start_spinner "Waiting for API health check"
  local retries=0
  local max_retries=30
  while [ $retries -lt $max_retries ]; do
    if docker compose exec -T api wget -qO- http://localhost:3001/health &>/dev/null 2>&1; then
      break
    fi
    retries=$((retries + 1))
    sleep 2
  done
  stop_spinner

  if [ $retries -eq $max_retries ]; then
    warn "API health check timed out — it may still be starting up"
    detail "Check logs: docker compose logs api"
  else
    ok "API is healthy"
  fi
  divider
}

# ─────────────────────────────────────────
# Success screen
# ─────────────────────────────────────────
print_success() {
  local port
  port=$(grep -E "^PORT=" .env 2>/dev/null | cut -d= -f2 || echo "80")

  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "    ╭──────────────────────────────────────────╮"
  echo "    │                                          │"
  echo "    │    ✓  Idswyft is running!                │"
  echo "    │       Installed in $(elapsed)                │"
  echo "    │                                          │"
  echo "    ╰──────────────────────────────────────────╯"
  echo -e "${RESET}"
  echo -e "    ${CYAN}${BOLD}URLs${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    ${BOLD}Dev Portal${RESET}   ${CYAN}http://localhost:${port}${RESET}"
  echo -e "    ${BOLD}API${RESET}          ${CYAN}http://localhost:${port}/api${RESET}"
  echo -e "    ${BOLD}Docs${RESET}         ${CYAN}http://localhost:${port}/docs${RESET}"
  echo -e "    ${BOLD}Demo${RESET}         ${CYAN}http://localhost:${port}/demo${RESET}"
  echo ""
  echo -e "    ${CYAN}${BOLD}Commands${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    ${DIM}docker compose logs -f${RESET}        ${GRAY}# View logs${RESET}"
  echo -e "    ${DIM}docker compose stop${RESET}          ${GRAY}# Stop${RESET}"
  echo -e "    ${DIM}docker compose up -d${RESET}         ${GRAY}# Start${RESET}"
  echo -e "    ${DIM}docker compose down${RESET}          ${GRAY}# Remove${RESET}"
  echo -e "    ${DIM}docker compose down -v${RESET}       ${GRAY}# Remove + delete data${RESET}"
  echo ""
  echo -e "    ${GRAY}Documentation:${RESET} ${CYAN}https://idswyft.app/docs${RESET}"
  echo -e "    ${GRAY}GitHub:${RESET}        ${CYAN}https://github.com/team-idswyft/idswyft${RESET}"
  echo ""
}

# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────
cleanup() { stop_spinner; }
trap cleanup EXIT

main() {
  banner
  check_dependencies
  ensure_repo
  setup_env
  start_services
  print_success
}

main "$@"
