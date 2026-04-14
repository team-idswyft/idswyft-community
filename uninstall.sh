#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Idswyft Community Edition — Uninstall Script
# ─────────────────────────────────────────────────
# Cleanly removes Idswyft containers, volumes, images,
# and optionally the installation directory.
#
# Usage:
#   cd idswyft-community && bash uninstall.sh
#
# Options:
#   --yes    Skip confirmation prompts (non-interactive)
#   --keep-data   Remove containers but keep database volume
# ─────────────────────────────────────────────────

SKIP_CONFIRM=false
KEEP_DATA=false

for arg in "$@"; do
  case "$arg" in
    --yes) SKIP_CONFIRM=true ;;
    --keep-data) KEEP_DATA=true ;;
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

info()   { echo -e "  ${GRAY}│${RESET}  ${DIM}$1${RESET}"; }
ok()     { echo -e "  ${GREEN}│${RESET}  ${GREEN}✓${RESET}  $1"; }
warn()   { echo -e "  ${YELLOW}│${RESET}  ${YELLOW}⚠${RESET}  $1"; }
fail()   { echo -e "  ${RED}│${RESET}  ${RED}✗  $1${RESET}"; exit 1; }
detail() { echo -e "  ${GRAY}│${RESET}     ${GRAY}$1${RESET}"; }
divider(){ echo -e "  ${GRAY}│${RESET}"; }

# ── Banner ────────────────────────────────────────
echo ""
echo -e "${RED}${BOLD}"
echo "    ╭──────────────────────────────────────────╮"
echo "    │                                          │"
echo "    │    ◆  Idswyft Community Edition          │"
echo "    │       Uninstall                          │"
echo "    │                                          │"
echo "    ╰──────────────────────────────────────────╯"
echo -e "${RESET}"

# ── Locate installation ──────────────────────────
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
divider

# ── Show what will be removed ────────────────────
echo -e "  ${GRAY}│${RESET}  ${BOLD}The following will be removed:${RESET}"
echo -e "  ${GRAY}│${RESET}"
echo -e "  ${GRAY}│${RESET}    ${RED}●${RESET}  All Idswyft containers (api, engine, frontend, postgres, caddy)"
if [ "$KEEP_DATA" = true ]; then
  echo -e "  ${GRAY}│${RESET}    ${GREEN}●${RESET}  Database volume will be ${GREEN}kept${RESET}"
else
  echo -e "  ${GRAY}│${RESET}    ${RED}●${RESET}  Database volume (all verification data)"
fi
echo -e "  ${GRAY}│${RESET}    ${RED}●${RESET}  Docker images (ghcr.io/team-idswyft/*)"
echo -e "  ${GRAY}│${RESET}    ${RED}●${RESET}  Generated config files (.env, Caddyfile)"
echo -e "  ${GRAY}│${RESET}"

# ── Confirmation ─────────────────────────────────
if [ "$SKIP_CONFIRM" = false ]; then
  echo -e "  ${YELLOW}│${RESET}  ${YELLOW}${BOLD}This action is irreversible.${RESET}"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Continue with uninstall? (y/N): " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "    ${DIM}Uninstall cancelled.${RESET}"
    echo ""
    exit 0
  fi
fi

divider

# ── Step 1: Stop and remove containers + networks ─
echo -e "  ${CYAN}${BOLD}━━━ Step 1/4: Stopping containers ━━━${RESET}"
divider

compose_cmd="docker compose"
# Include HTTPS profile if caddy was running
if docker compose --profile https ps --format '{{.Name}}' 2>/dev/null | grep -q caddy; then
  compose_cmd="docker compose --profile https"
fi

if [ "$KEEP_DATA" = true ]; then
  $compose_cmd down 2>/dev/null || true
  ok "Containers and networks removed (volumes kept)"
else
  $compose_cmd down -v 2>/dev/null || true
  ok "Containers, networks, and volumes removed"
fi
divider

# ── Step 2: Remove Docker images ─────────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 2/4: Removing Docker images ━━━${RESET}"
divider

images=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E "team-idswyft/idswyft" || true)
if [ -n "$images" ]; then
  echo "$images" | while read -r img; do
    docker rmi "$img" 2>/dev/null && ok "Removed ${DIM}${img}${RESET}" || warn "Could not remove ${img}"
  done
else
  info "No Idswyft images found"
fi

# Also remove postgres and caddy images if they were only used by idswyft
divider

# ── Step 3: Clean up generated files ─────────────
echo -e "  ${CYAN}${BOLD}━━━ Step 3/4: Cleaning up config files ━━━${RESET}"
divider

for f in .env caddy/Caddyfile; do
  if [ -f "$f" ]; then
    rm -f "$f"
    ok "Removed $f"
  fi
done

# Clean Caddy cert directory if it exists
if [ -d "caddy/certs" ]; then
  rm -rf caddy/certs/*.pem 2>/dev/null || true
  ok "Cleaned caddy/certs/"
fi
divider

# ── Step 4: Optionally remove installation directory ─
echo -e "  ${CYAN}${BOLD}━━━ Step 4/4: Installation directory ━━━${RESET}"
divider

remove_dir=false
if [ "$SKIP_CONFIRM" = true ]; then
  remove_dir=true
else
  echo -e "  ${GRAY}│${RESET}  ${BOLD}Remove the installation directory?${RESET}"
  echo -e "  ${GRAY}│${RESET}  ${DIM}${INSTALL_DIR}${RESET}"
  echo -e "  ${GRAY}│${RESET}"
  read -rp "       Delete directory? (y/N): " del_dir
  if [[ "$del_dir" =~ ^[Yy]$ ]]; then
    remove_dir=true
  fi
fi

if [ "$remove_dir" = true ]; then
  # Move out of the directory before removing it
  cd /
  rm -rf "$INSTALL_DIR"
  ok "Removed ${INSTALL_DIR}"
else
  ok "Kept ${INSTALL_DIR}"
  detail "You can manually delete it later: rm -rf ${INSTALL_DIR}"
fi

# ── Done ─────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "    ╭──────────────────────────────────────────╮"
echo "    │                                          │"
echo "    │    ✓  Idswyft has been uninstalled        │"
echo "    │                                          │"
echo "    ╰──────────────────────────────────────────╯"
echo -e "${RESET}"
echo -e "    ${DIM}To reinstall:${RESET}"
echo -e "    ${CYAN}curl -fsSL https://raw.githubusercontent.com/team-idswyft/idswyft-community/main/install.sh | bash${RESET}"
echo ""
