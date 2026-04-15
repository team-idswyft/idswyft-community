#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Idswyft Community Edition — Install Script
# ─────────────────────────────────────────────────
# Usage (recommended — verify before running):
#   curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft-community/main/install.sh -o install.sh
#   sha256sum install.sh   # compare with published checksum in RELEASES
#   bash install.sh
#
# Quick (less secure):
#   curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft-community/main/install.sh | bash
#
# Or clone and run locally:
#   git clone https://github.com/team-idswyft/idswyft-community.git && cd idswyft-community && ./install.sh
#
# Options:
#   --build    Build images from source instead of pulling pre-built images
# ─────────────────────────────────────────────────

REPO_URL="https://github.com/team-idswyft/idswyft-community.git"
BUILD_FROM_SOURCE=false
ENABLE_HTTPS=false
ENABLE_AUTOUPDATE=false
USE_EXTERNAL_DB=false
USE_S3_STORAGE=false

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
STEP_TOTAL=8
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
    git clone --depth 1 "$REPO_URL" idswyft-community 2>/dev/null
    stop_spinner
    cd idswyft-community
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

# ── Set or update a key=value in .env ────────────
_set_env_var() {
  local key="$1" value="$2"
  # Delete-then-append avoids sed metacharacter issues with passwords/secrets
  if [ -f .env ] && grep -q "^${key}=" .env; then
    grep -v "^${key}=" .env > .env.tmp && mv .env.tmp .env
  fi
  printf '%s=%s\n' "$key" "$value" >> .env
}

_remove_env_var() {
  local key="$1"
  if [ -f .env ] && grep -q "^${key}=" .env; then
    grep -v "^${key}=" .env > .env.tmp && mv .env.tmp .env
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
    # New secrets will be generated — remove stale postgres volume so
    # the database reinitializes with the new DB_PASSWORD.
    # (PostgreSQL only reads POSTGRES_PASSWORD on first volume init.)
    local project_name
    project_name=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')
    local vol="${project_name}_pgdata"
    if docker volume inspect "$vol" &>/dev/null; then
      warn "Removing old database volume (credentials will be regenerated)"
      docker compose down 2>/dev/null || true
      docker volume rm "$vol" 2>/dev/null || true
    fi
    # Remove any external-DB override from a previous run so the fresh .env
    # doesn't conflict with a stale override that references DATABASE_URL.
    rm -f docker-compose.override.yml
  fi

  info "Generating secure secrets..."

  local db_password jwt_secret api_key_secret encryption_key service_token watchtower_token
  db_password=$(generate_secret)
  jwt_secret=$(generate_secret)
  api_key_secret=$(generate_secret)
  encryption_key=$(generate_secret)
  service_token=$(generate_secret)
  watchtower_token=$(generate_secret)

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

# Auto-update (configured by install.sh)
ENABLE_AUTOUPDATE=false
WATCHTOWER_API_TOKEN=${watchtower_token}
# WATCHTOWER_SCHEDULE=0 0 4 * * *   (6-field cron: sec min hour day month weekday)
EOF

  ok "Created .env with secure secrets"
  detail "DB_PASSWORD, JWT_SECRET, API_KEY_SECRET, ENCRYPTION_KEY, SERVICE_TOKEN"
  divider
}

# ─────────────────────────────────────────
# Step 4: Database & storage configuration
# ─────────────────────────────────────────
setup_infrastructure() {
  step "Database & storage"
  divider

  # ── Database ─────────────────────────────────
  # Detect existing external DB on re-runs
  local existing_external_db=false
  if [ -f ".env" ] && grep -q "^DATABASE_URL=" .env; then
    local existing_url
    existing_url=$(grep "^DATABASE_URL=" .env | cut -d= -f2-)
    if [[ "$existing_url" != *"@postgres:"* ]]; then
      existing_external_db=true
    fi
  fi

  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}Database${RESET}"
  if [ "$existing_external_db" = true ]; then
    echo -e "  ${GRAY}│${RESET}  ${DIM}Currently using an external database.${RESET}"
  fi
  echo -e "  ${GRAY}│${RESET}  ${CYAN}1)${RESET} Built-in PostgreSQL (default)"
  echo -e "  ${GRAY}│${RESET}  ${CYAN}2)${RESET} External PostgreSQL"
  echo -e "  ${GRAY}│${RESET}"
  local db_default="1"
  if [ "$existing_external_db" = true ]; then
    db_default="2"
  fi
  read -rp "       Choose [1/2] (default: ${db_default}): " db_choice
  db_choice="${db_choice:-$db_default}"

  if [ "$db_choice" = "2" ]; then
    USE_EXTERNAL_DB=true

    echo -e "  ${GRAY}│${RESET}"
    if [ "$existing_external_db" = true ]; then
      local masked_url
      masked_url=$(echo "$existing_url" | sed -E 's|://([^:]+):[^@]+@|://\1:****@|')
      echo -e "  ${GRAY}│${RESET}  ${DIM}Current: ${masked_url}${RESET}"
    fi
    read -rsp "       PostgreSQL connection URL: " db_url
    echo ""
    if [ -n "$db_url" ]; then
      local input_masked
      input_masked=$(echo "$db_url" | sed -E 's|://([^:]+):[^@]+@|://\1:****@|')
      detail "Entered: $input_masked"
    fi

    # Allow keeping existing URL by pressing Enter on re-run
    if [ -z "$db_url" ] && [ "$existing_external_db" = true ]; then
      db_url="$existing_url"
      ok "Keeping existing database URL"
    elif [ -z "$db_url" ]; then
      warn "No URL entered — falling back to built-in PostgreSQL"
      USE_EXTERNAL_DB=false
    fi

    if [ "$USE_EXTERNAL_DB" = true ]; then
      # Validate URL scheme
      if [[ "$db_url" != postgresql://* ]] && [[ "$db_url" != postgres://* ]]; then
        warn "URL must start with postgresql:// or postgres://"
        warn "Falling back to built-in PostgreSQL"
        USE_EXTERNAL_DB=false
      fi
    fi

    if [ "$USE_EXTERNAL_DB" = true ]; then
      _set_env_var "DATABASE_URL" "$db_url"

      # Ask about SSL
      echo -e "  ${GRAY}│${RESET}"
      read -rp "       Require SSL for database connection? (y/N): " want_ssl
      if [[ "$want_ssl" =~ ^[Yy]$ ]]; then
        _set_env_var "DATABASE_SSL" "true"
        _set_env_var "DATABASE_SSL_REJECT_UNAUTHORIZED" "true"
        detail "SSL enabled (set DATABASE_SSL_REJECT_UNAUTHORIZED=false in .env for self-signed certs)"
      else
        _remove_env_var "DATABASE_SSL"
        _remove_env_var "DATABASE_SSL_REJECT_UNAUTHORIZED"
      fi

      # Generate docker-compose.override.yml with busybox stub
      cat > docker-compose.override.yml <<'OVERRIDE_EOF'
# Generated by install.sh — external database mode
# This replaces the local postgres container with a lightweight stub.
# Docker Compose auto-merges this file with docker-compose.yml.
services:
  postgres:
    image: busybox:1.36
    entrypoint: ["sh", "-c", "sleep infinity"]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "true"]
      interval: 30s
      timeout: 5s
      retries: 1
    volumes: []
    environment:
      STUB: "true"
  api:
    environment:
      DATABASE_URL: ${DATABASE_URL}
OVERRIDE_EOF

      local masked
      masked=$(echo "$db_url" | sed -E 's|://([^:]+):[^@]+@|://\1:****@|')
      ok "External PostgreSQL configured"
      detail "$masked"
    fi
  else
    # Switching back to local DB — clean up external config
    if [ "$existing_external_db" = true ]; then
      rm -f docker-compose.override.yml
      _remove_env_var "DATABASE_URL"
      _remove_env_var "DATABASE_SSL"
      _remove_env_var "DATABASE_SSL_REJECT_UNAUTHORIZED"
      ok "Switched back to built-in PostgreSQL"
    else
      ok "Using built-in PostgreSQL"
    fi
  fi

  # ── Storage ──────────────────────────────────
  local existing_s3=false
  if [ -f ".env" ] && grep -q "^STORAGE_PROVIDER=s3" .env; then
    existing_s3=true
  fi

  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}File Storage${RESET}"
  if [ "$existing_s3" = true ]; then
    echo -e "  ${GRAY}│${RESET}  ${DIM}Currently using S3-compatible storage.${RESET}"
  fi
  echo -e "  ${GRAY}│${RESET}  ${CYAN}1)${RESET} Local filesystem (default)"
  echo -e "  ${GRAY}│${RESET}  ${CYAN}2)${RESET} S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces)"
  echo -e "  ${GRAY}│${RESET}"
  local storage_default="1"
  if [ "$existing_s3" = true ]; then
    storage_default="2"
  fi
  read -rp "       Choose [1/2] (default: ${storage_default}): " storage_choice
  storage_choice="${storage_choice:-$storage_default}"

  if [ "$storage_choice" = "2" ]; then
    USE_S3_STORAGE=true

    echo -e "  ${GRAY}│${RESET}"
    if [ "$existing_s3" = true ]; then
      local existing_bucket existing_region
      existing_bucket=$(grep "^AWS_S3_BUCKET=" .env 2>/dev/null | cut -d= -f2- || echo "")
      existing_region=$(grep "^AWS_REGION=" .env 2>/dev/null | cut -d= -f2- || echo "us-east-1")
      detail "Current bucket: ${existing_bucket} (${existing_region})"
    fi

    read -rp "       S3 bucket name: " s3_bucket
    if [ -z "$s3_bucket" ] && [ "$existing_s3" = true ]; then
      s3_bucket="$existing_bucket"
    fi
    if [ -z "$s3_bucket" ]; then
      warn "No bucket name entered — falling back to local storage"
      USE_S3_STORAGE=false
    fi

    if [ "$USE_S3_STORAGE" = true ]; then
      read -rp "       AWS region (default: us-east-1): " s3_region
      s3_region="${s3_region:-us-east-1}"

      read -rp "       Access key ID: " s3_key
      if [ -z "$s3_key" ] && [ "$existing_s3" = true ]; then
        s3_key=$(grep "^AWS_ACCESS_KEY_ID=" .env 2>/dev/null | cut -d= -f2- || echo "")
        [ -n "$s3_key" ] && detail "Keeping existing access key"
      fi
      read -rsp "       Secret access key: " s3_secret
      echo ""
      if [ -z "$s3_secret" ] && [ "$existing_s3" = true ]; then
        s3_secret=$(grep "^AWS_SECRET_ACCESS_KEY=" .env 2>/dev/null | cut -d= -f2- || echo "")
        [ -n "$s3_secret" ] && detail "Keeping existing secret key"
      fi

      if [ -z "$s3_key" ] || [ -z "$s3_secret" ]; then
        warn "Missing credentials — falling back to local storage"
        USE_S3_STORAGE=false
      fi
    fi

    if [ "$USE_S3_STORAGE" = true ]; then
      _set_env_var "STORAGE_PROVIDER" "s3"
      _set_env_var "AWS_S3_BUCKET" "$s3_bucket"
      _set_env_var "AWS_REGION" "$s3_region"
      _set_env_var "AWS_ACCESS_KEY_ID" "$s3_key"
      _set_env_var "AWS_SECRET_ACCESS_KEY" "$s3_secret"

      ok "S3 storage configured"
      detail "Bucket: ${s3_bucket} (${s3_region})"
    fi
  else
    # Switching back to local storage
    if [ "$existing_s3" = true ]; then
      _set_env_var "STORAGE_PROVIDER" "local"
      _remove_env_var "AWS_ACCESS_KEY_ID"
      _remove_env_var "AWS_SECRET_ACCESS_KEY"
      _remove_env_var "AWS_S3_BUCKET"
      _remove_env_var "AWS_REGION"
      ok "Switched back to local filesystem storage"
    else
      ok "Using local filesystem storage"
    fi
  fi

  divider
}

# ─────────────────────────────────────────
# Step 5: Configure HTTPS (optional)
# ─────────────────────────────────────────
setup_https() {
  step "HTTPS / TLS"
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

  # Update .env with HTTPS settings
  _set_env_var "ENABLE_HTTPS" "true"
  _set_env_var "DOMAIN" "$user_domain"
  _set_env_var "CORS_ORIGINS" "https://${user_domain}"

  # Handle IDSWYFT_PORT — also covers legacy .env files that used PORT= instead
  _remove_env_var "PORT"
  _set_env_var "IDSWYFT_PORT" "127.0.0.1:8080"

  ok "HTTPS configured for ${CYAN}${user_domain}${RESET}"
  divider
}

# ─────────────────────────────────────────
# Step 6: Configure auto-updates (optional)
# ─────────────────────────────────────────
setup_autoupdate() {
  step "Auto-update configuration"
  divider

  echo -e "  ${GRAY}│${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${BOLD}Enable automatic container updates?${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${DIM}Uses Watchtower to check for new images daily at 4 AM.${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${DIM}Only updates engine, API, and frontend — never the database.${RESET}"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Enable auto-updates? (y/N): " want_autoupdate

  if [[ ! "$want_autoupdate" =~ ^[Yy]$ ]]; then
    ok "Skipping auto-updates — manual updates via update.sh"
    detail "You can enable this later by re-running install.sh"
    divider
    return
  fi

  ENABLE_AUTOUPDATE=true

  # Update .env
  _set_env_var "ENABLE_AUTOUPDATE" "true"

  # Ensure WATCHTOWER_API_TOKEN exists (may be missing from older .env files)
  if ! grep -q "^WATCHTOWER_API_TOKEN=" .env; then
    local wt_token
    wt_token=$(generate_secret)
    echo "WATCHTOWER_API_TOKEN=${wt_token}" >> .env
  fi

  ok "Auto-updates enabled (daily at 4:00 AM UTC)"
  detail "Customize schedule: set WATCHTOWER_SCHEDULE in .env"
  divider
}

# ─────────────────────────────────────────
# Step 7: Pull images (or build from source)
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

  # Include override file when using explicit -f flags (auto-merge is disabled with -f)
  if [ "$USE_EXTERNAL_DB" = true ] && [ -f "docker-compose.override.yml" ]; then
    if [ "$BUILD_FROM_SOURCE" = true ]; then
      compose_cmd="docker compose -f docker-compose.yml -f docker-compose.build.yml -f docker-compose.override.yml"
    fi
  fi

  # Add HTTPS profile if enabled
  if [ "$ENABLE_HTTPS" = true ]; then
    compose_cmd="$compose_cmd --profile https"
  fi

  # Add autoupdate profile if enabled
  if [ "$ENABLE_AUTOUPDATE" = true ]; then
    compose_cmd="$compose_cmd --profile autoupdate"
  fi

  # Start containers in background (--no-deps avoids blocking on health checks)
  info "Creating containers..."
  $compose_cmd up -d --no-deps postgres 2>/dev/null
  if [ "$USE_EXTERNAL_DB" = true ]; then
    ok "postgres (stub — using external database)"
  else
    ok "postgres"
  fi

  $compose_cmd up -d --no-deps engine 2>/dev/null
  ok "engine"

  $compose_cmd up -d --no-deps frontend 2>/dev/null
  ok "frontend"

  echo -e "  ${GRAY}│${RESET}"

  # Wait for postgres health (skip for external DB — stub passes instantly)
  if [ "$USE_EXTERNAL_DB" = true ]; then
    ok "Database ready (external PostgreSQL)"
  else
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

  # Start Watchtower if auto-updates are enabled
  if [ "$ENABLE_AUTOUPDATE" = true ]; then
    echo -e "  ${GRAY}│${RESET}"
    $compose_cmd up -d --no-deps watchtower 2>/dev/null
    ok "watchtower (auto-update sidecar)"
  fi
  divider
}

# ─────────────────────────────────────────
# Success screen
# ─────────────────────────────────────────
print_success() {
  local domain base_url compose_profile_flag
  domain=$(grep -E "^DOMAIN=" .env 2>/dev/null | cut -d= -f2 || echo "")

  compose_profile_flag=""

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
  fi

  if [ "$ENABLE_AUTOUPDATE" = true ]; then
    compose_profile_flag="${compose_profile_flag} --profile autoupdate"
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
  if [ "$USE_EXTERNAL_DB" = true ]; then
    local db_url_display
    db_url_display=$(grep "^DATABASE_URL=" .env 2>/dev/null | cut -d= -f2- || echo "")
    db_url_display=$(echo "$db_url_display" | sed -E 's|://([^:]+):[^@]+@|://\1:****@|')
    echo -e "    ${BOLD}database${RESET}     ${GRAY}External PostgreSQL${RESET}"
    echo -e "                 ${GRAY}${db_url_display}${RESET}"
  else
    echo -e "    ${BOLD}postgres${RESET}     ${GRAY}Built-in PostgreSQL database${RESET}"
  fi
  echo -e "    ${BOLD}engine${RESET}       ${GRAY}ML verification engine (OCR, face detection)${RESET}"
  echo -e "    ${BOLD}api${RESET}          ${GRAY}Core API (lightweight orchestrator)${RESET}"
  echo -e "    ${BOLD}frontend${RESET}     ${GRAY}Dev Portal UI${RESET}"
  if [ "$USE_S3_STORAGE" = true ]; then
    local s3_bucket_display s3_region_display
    s3_bucket_display=$(grep "^AWS_S3_BUCKET=" .env 2>/dev/null | cut -d= -f2 || echo "")
    s3_region_display=$(grep "^AWS_REGION=" .env 2>/dev/null | cut -d= -f2 || echo "us-east-1")
    echo -e "    ${BOLD}storage${RESET}      ${GRAY}S3-compatible (${s3_bucket_display} / ${s3_region_display})${RESET}"
  else
    echo -e "    ${BOLD}storage${RESET}      ${GRAY}Local filesystem (Docker volume)${RESET}"
  fi
  if [ "$ENABLE_HTTPS" = true ]; then
    echo -e "    ${BOLD}caddy${RESET}        ${GRAY}HTTPS reverse proxy (TLS termination)${RESET}"
  fi
  if [ "$ENABLE_AUTOUPDATE" = true ]; then
    echo -e "    ${BOLD}watchtower${RESET}   ${GRAY}Auto-update sidecar (daily at 4 AM UTC)${RESET}"
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
  setup_infrastructure
  setup_https
  setup_autoupdate
  start_services
  print_success
}

main "$@"
