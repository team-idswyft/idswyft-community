#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Idswyft Community Edition — Install Script
# ─────────────────────────────────────────────────
# Usage (recommended — verify before running):
#   curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft/main/install.sh -o install.sh
#   sha256sum install.sh   # compare with published checksum in RELEASES
#   bash install.sh
#
# Quick (less secure):
#   curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft/main/install.sh | bash
#
# Or clone and run locally:
#   git clone https://github.com/team-idswyft/idswyft-community.git && cd idswyft && ./install.sh
#
# Options:
#   --build    Build images from source instead of pulling pre-built images
# ─────────────────────────────────────────────────

REPO_URL="https://github.com/team-idswyft/idswyft-community.git"
BUILD_FROM_SOURCE=false
ENABLE_HTTPS=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FROM_SOURCE=true ;;
  esac
done

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
STEP_TOTAL=6
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
    detail "github.com/team-idswyft/idswyft-community"
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
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | xxd -p 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64
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
DB_NAME=idswyft
DB_USER=idswyft
DB_PASSWORD=${db_password}

# Authentication secrets (auto-generated, keep private)
JWT_SECRET=${jwt_secret}
API_KEY_SECRET=${api_key_secret}
ENCRYPTION_KEY=${encryption_key}
SERVICE_TOKEN=${service_token}

# Port to expose the frontend (default: 80)
# In HTTPS mode this is set to 127.0.0.1:8080 so only Caddy serves external traffic
IDSWYFT_PORT=80

# Set to true to enable sandbox/mock verification mode
SANDBOX_MODE=false

# HTTPS / TLS (configured by install.sh — leave empty to disable)
ENABLE_HTTPS=false
DOMAIN=
CORS_ORIGINS=
EOF

  ok "Created .env with secure secrets"
  detail "DB_PASSWORD, JWT_SECRET, API_KEY_SECRET, ENCRYPTION_KEY, SERVICE_TOKEN"
  divider
}

# ─────────────────────────────────────────
# Step 4: Configure HTTPS (optional)
# ─────────────────────────────────────────
setup_https() {
  step "HTTPS / TLS configuration"
  divider

  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}Enable automatic HTTPS with TLS certificates?${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${DIM}Required for public-facing deployments. Skippable for localhost/LAN.${RESET}"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Enable HTTPS? (y/N): " want_https

  if [[ ! "$want_https" =~ ^[Yy]$ ]]; then
    ok "Skipping HTTPS — HTTP-only mode"
    detail "You can re-run install.sh later to enable HTTPS"
    divider
    return
  fi

  ENABLE_HTTPS=true

  # Collect domain
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Enter your domain (e.g. verify.example.com): " user_domain
  if [ -z "$user_domain" ]; then
    warn "No domain entered — disabling HTTPS"
    ENABLE_HTTPS=false
    divider
    return
  fi

  # Choose certificate mode
  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}Certificate mode:${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${CYAN}1)${RESET} Let's Encrypt (automatic — recommended)"
  echo -e "  ${GRAY}│${RESET}  ${CYAN}2)${RESET} Manual certificate (provide your own cert + key)"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Choose [1/2] (default: 1): " cert_mode
  cert_mode="${cert_mode:-1}"

  # Copy appropriate Caddyfile template
  if [ "$cert_mode" = "2" ]; then
    cp caddy/Caddyfile.manual caddy/Caddyfile
    ok "Using manual certificate mode"
    detail "Place your files at: caddy/certs/cert.pem and caddy/certs/key.pem"
  else
    cp caddy/Caddyfile.acme caddy/Caddyfile
    ok "Using Let's Encrypt (automatic TLS)"
    detail "Ensure ports 80 + 443 are open and DNS points to this server"
  fi

  # Update .env with HTTPS settings (sed for existing keys, append if missing)
  sed -i "s|^ENABLE_HTTPS=.*|ENABLE_HTTPS=true|" .env
  sed -i "s|^DOMAIN=.*|DOMAIN=${user_domain}|" .env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${user_domain}|" .env

  # Handle IDSWYFT_PORT — also covers legacy .env files that used PORT= instead
  if grep -q "^IDSWYFT_PORT=" .env; then
    sed -i "s|^IDSWYFT_PORT=.*|IDSWYFT_PORT=127.0.0.1:8080|" .env
  elif grep -q "^PORT=" .env; then
    sed -i "s|^PORT=.*|IDSWYFT_PORT=127.0.0.1:8080|" .env
  else
    echo "IDSWYFT_PORT=127.0.0.1:8080" >> .env
  fi

  # Ensure all HTTPS vars exist (may be missing from older .env files)
  grep -q "^ENABLE_HTTPS=" .env || echo "ENABLE_HTTPS=true" >> .env
  grep -q "^DOMAIN=" .env || echo "DOMAIN=${user_domain}" >> .env
  grep -q "^CORS_ORIGINS=" .env || echo "CORS_ORIGINS=https://${user_domain}" >> .env

  ok "HTTPS configured for ${CYAN}${user_domain}${RESET}"
  divider
}

# ─────────────────────────────────────────
# Step 5: Pull images (or build from source)
# ─────────────────────────────────────────
start_services() {
  if [ "$BUILD_FROM_SOURCE" = true ]; then
    step "Building containers from source"
    divider
    info "Building locally — this may take 15-30 minutes on first run"
    info "Tip: next time, omit --build to pull pre-built images (~2 min)"
    echo -e "  ${GRAY}│${RESET}"

    local build_log
    build_log=$(mktemp)

    set +e
    docker compose -f docker-compose.yml -f docker-compose.build.yml build 2>&1 | tee "$build_log" | while IFS= read -r line; do
      case "$line" in
        *"STEP"*|*"Step"*)
          echo -e "  ${GRAY}│${RESET}  ${MAGENTA}▸${RESET}  ${WHITE}${line}${RESET}" ;;
        *"CACHED"*)
          echo -e "  ${GRAY}│${RESET}  ${GREEN}◆${RESET}  ${DIM}${line}${RESET}" ;;
        *"DONE"*)
          echo -e "  ${GRAY}│${RESET}  ${GREEN}●${RESET}  ${GREEN}${line}${RESET}" ;;
        *"error"*|*"Error"*|*"ERROR"*|*"failed"*)
          echo -e "  ${GRAY}│${RESET}  ${RED}✗${RESET}  ${RED}${line}${RESET}" ;;
        *"#"[0-9]*)
          echo -e "  ${GRAY}│${RESET}     ${GRAY}${line}${RESET}" ;;
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
  else
    step "Pulling pre-built images"
    divider
    info "Downloading from GitHub Container Registry"
    echo -e "  ${GRAY}│${RESET}"

    set +e
    docker compose pull 2>&1 | while IFS= read -r line; do
      case "$line" in
        *"Pulling"*|*"pulling"*)
          echo -e "  ${GRAY}│${RESET}  ${BLUE}⬇${RESET}  ${line}" ;;
        *"Downloaded"*|*"Pull complete"*|*"Already exists"*)
          echo -e "  ${GRAY}│${RESET}  ${GREEN}⬇${RESET}  ${DIM}${line}${RESET}" ;;
        *"done"*|*"Downloaded newer"*|*"up to date"*)
          echo -e "  ${GRAY}│${RESET}  ${GREEN}●${RESET}  ${GREEN}${line}${RESET}" ;;
        *"error"*|*"Error"*|*"ERROR"*)
          echo -e "  ${GRAY}│${RESET}  ${RED}✗${RESET}  ${RED}${line}${RESET}" ;;
        *)
          echo -e "  ${GRAY}│${RESET}     ${DIM}${line}${RESET}" ;;
      esac
    done
    local pull_exit=${PIPESTATUS[0]}
    set -e

    if [ "$pull_exit" -ne 0 ]; then
      echo ""
      warn "Failed to pull pre-built images — falling back to building from source"
      info "This will take longer on first run (~15-30 minutes)"
      echo -e "  ${GRAY}│${RESET}"

      set +e
      docker compose -f docker-compose.yml -f docker-compose.build.yml build 2>&1 | while IFS= read -r line; do
        case "$line" in
          *"DONE"*) echo -e "  ${GRAY}│${RESET}  ${GREEN}●${RESET}  ${GREEN}${line}${RESET}" ;;
          *"error"*|*"Error"*|*"ERROR"*) echo -e "  ${GRAY}│${RESET}  ${RED}✗${RESET}  ${RED}${line}${RESET}" ;;
          *"#"[0-9]*) echo -e "  ${GRAY}│${RESET}     ${GRAY}${line}${RESET}" ;;
        esac
      done
      local fallback_exit=${PIPESTATUS[0]}
      set -e

      if [ "$fallback_exit" -ne 0 ]; then
        fail "Docker build failed — check the output above for details"
      fi
      ok "Containers built from source ${GREEN}${BOLD}$(elapsed)${RESET}"
      # Mark that we need to use build override for up -d
      BUILD_FROM_SOURCE=true
    else
      echo -e "  ${GRAY}│${RESET}"
      ok "Images pulled ${GREEN}${BOLD}$(elapsed)${RESET}"
    fi
  fi

  step "Starting services"
  divider

  local compose_cmd="docker compose"
  if [ "$BUILD_FROM_SOURCE" = true ]; then
    compose_cmd="docker compose -f docker-compose.yml -f docker-compose.build.yml"
  fi

  # Add HTTPS profile if enabled
  if [ "$ENABLE_HTTPS" = true ]; then
    compose_cmd="$compose_cmd --profile https"
  fi

  # Start containers in background (--no-deps avoids blocking on health checks)
  info "Creating containers..."
  $compose_cmd up -d --no-deps postgres 2>/dev/null
  ok "postgres"

  $compose_cmd up -d --no-deps engine 2>/dev/null
  ok "engine"

  $compose_cmd up -d --no-deps frontend 2>/dev/null
  ok "frontend"

  echo -e "  ${GRAY}│${RESET}"

  # Wait for postgres health
  start_spinner "Waiting for database"
  local retries=0
  while [ $retries -lt 30 ]; do
    if docker compose exec -T postgres pg_isready -U "${DB_USER:-idswyft}" &>/dev/null 2>&1; then
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

  # Wait for engine health (ML models take time to load)
  start_spinner "Waiting for engine (loading ML models — may take 1-2 minutes)"
  retries=0
  local max_engine_retries=60
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

  # Now start API (depends on postgres + engine)
  $compose_cmd up -d --no-deps api 2>/dev/null
  ok "api"

  echo -e "  ${GRAY}│${RESET}"

  # Wait for API health
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
    warn "API health check timed out — it may still be starting up"
    detail "Check logs: docker compose logs api"
  else
    ok "API is healthy"
  fi

  # Start Caddy if HTTPS is enabled
  if [ "$ENABLE_HTTPS" = true ]; then
    echo -e "  ${GRAY}│${RESET}"
    $compose_cmd up -d --no-deps caddy 2>/dev/null
    ok "caddy (HTTPS reverse proxy)"

    start_spinner "Waiting for Caddy to start serving HTTPS"
    retries=0
    while [ $retries -lt 30 ]; do
      if $compose_cmd exec -T caddy wget -qO /dev/null --no-check-certificate "https://localhost/" &>/dev/null 2>&1; then
        break
      fi
      retries=$((retries + 1))
      sleep 2
    done
    stop_spinner

    if [ $retries -ge 30 ]; then
      warn "Caddy may still be provisioning the TLS certificate"
      detail "Check logs: $compose_cmd logs caddy"
    else
      ok "Caddy is running"
    fi
  fi
  divider
}

# ─────────────────────────────────────────
# Success screen
# ─────────────────────────────────────────
print_success() {
  local domain base_url compose_profile_flag
  domain=$(grep -E "^DOMAIN=" .env 2>/dev/null | cut -d= -f2 || echo "")

  if [ "$ENABLE_HTTPS" = true ] && [ -n "$domain" ]; then
    base_url="https://${domain}"
    compose_profile_flag=" --profile https"
  else
    local port
    port=$(grep -E "^IDSWYFT_PORT=" .env 2>/dev/null | cut -d= -f2 || echo "80")
    if [ "$port" = "80" ]; then
      base_url="http://localhost"
    else
      base_url="http://localhost:${port}"
    fi
    compose_profile_flag=""
  fi

  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "    ╭──────────────────────────────────────────╮"
  echo "    │                                          │"
  echo "    │    ✓  Idswyft is running!                │"
  echo "    │       Installed in $(elapsed)                │"
  echo "    │                                          │"
  echo "    ╰──────────────────────────────────────────╯"
  echo -e "${RESET}"
  echo -e "    ${CYAN}${BOLD}Getting Started${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    1. Open ${CYAN}${base_url}${RESET}"
  echo -e "    2. Complete the first-time setup wizard"
  echo -e "    3. Save your API key and start integrating"
  echo ""
  echo -e "    ${CYAN}${BOLD}URLs${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    ${BOLD}Dev Portal${RESET}   ${CYAN}${base_url}${RESET}"
  echo -e "    ${BOLD}API${RESET}          ${CYAN}${base_url}/api${RESET}"
  echo -e "    ${BOLD}Docs${RESET}         ${CYAN}${base_url}/docs${RESET}"
  echo -e "    ${BOLD}Demo${RESET}         ${CYAN}${base_url}/demo${RESET}"
  echo ""
  echo -e "    ${CYAN}${BOLD}Services${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    ${BOLD}postgres${RESET}     ${GRAY}PostgreSQL database${RESET}"
  echo -e "    ${BOLD}engine${RESET}       ${GRAY}ML verification engine (OCR, face detection)${RESET}"
  echo -e "    ${BOLD}api${RESET}          ${GRAY}Core API (lightweight orchestrator)${RESET}"
  echo -e "    ${BOLD}frontend${RESET}     ${GRAY}Dev Portal UI${RESET}"
  if [ "$ENABLE_HTTPS" = true ]; then
    echo -e "    ${BOLD}caddy${RESET}        ${GRAY}HTTPS reverse proxy (TLS termination)${RESET}"
  fi
  echo ""
  echo -e "    ${CYAN}${BOLD}Commands${RESET}"
  echo -e "    ${GRAY}────────────────────────────────────${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} logs -f${RESET}        ${GRAY}# View logs${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} logs engine${RESET}    ${GRAY}# Engine logs${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} stop${RESET}          ${GRAY}# Stop${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} up -d${RESET}         ${GRAY}# Start${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} down${RESET}          ${GRAY}# Remove${RESET}"
  echo -e "    ${DIM}docker compose${compose_profile_flag} down -v${RESET}       ${GRAY}# Remove + delete data${RESET}"
  echo ""
  echo -e "    ${GRAY}Documentation:${RESET} ${CYAN}https://idswyft.app/docs${RESET}"
  echo -e "    ${GRAY}GitHub:${RESET}        ${CYAN}https://github.com/team-idswyft/idswyft-community${RESET}"
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
  setup_https
  start_services
  print_success
}

main "$@"
