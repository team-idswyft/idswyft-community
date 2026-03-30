#!/usr/bin/env bash
#
# E2E Verification Pipeline Test
#
# Tests the full 5-step verification pipeline using specimen images:
#   initialize → front-document → back-document → live-capture → status
#
# Usage:
#   export IDSWYFT_API_KEY="ik_your_key_here"
#   bash scripts/test-e2e-pipeline.sh [--base-url http://localhost:3001]
#
# Specimens used: FL and TX (both have front + back images)
# Live capture: uses the front document face as selfie (same person → face match passes)
# Liveness: passive mode (no head-turn metadata from static images)

set -euo pipefail

# ── Config ─────────────────────────────────────────────────
API_KEY="${IDSWYFT_API_KEY:-}"
BASE_URL="${1:-http://localhost:3001}"
API_URL="$BASE_URL/api/v2/verify"
SPECIMENS_DIR="$(cd "$(dirname "$0")/../backend/scripts/benchmark/specimens/US_states" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Helpers ────────────────────────────────────────────────
log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
pass()  { echo -e "${GREEN}  ✓ $*${NC}"; }
fail()  { echo -e "${RED}  ✗ $*${NC}"; }
warn()  { echo -e "${YELLOW}  ⚠ $*${NC}"; }
header(){ echo -e "\n${BOLD}═══════════════════════════════════════════════════${NC}"; echo -e "${BOLD}  $*${NC}"; echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"; }

# Extract JSON field using node (works on all platforms)
json_field() {
  local json="$1" field="$2"
  echo "$json" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const o=JSON.parse(d);const v=('$field').split('.').reduce((a,k)=>a&&a[k],o);
      if(v!==undefined&&v!==null)process.stdout.write(String(v))}catch{}
    })"
}

# Pretty-print JSON
pp_json() {
  echo "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch{console.log(d)}})"
}

# ── Preflight checks ──────────────────────────────────────
if [ -z "$API_KEY" ]; then
  echo -e "${RED}Error: IDSWYFT_API_KEY not set${NC}"
  echo ""
  echo "Set your API key first:"
  echo "  export IDSWYFT_API_KEY=\"ik_your_key_here\""
  echo ""
  echo "You can find your key in the Developer Portal → API Keys"
  exit 1
fi

# Check API is reachable
if ! curl -sf "$BASE_URL/api/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: API not reachable at $BASE_URL${NC}"
  echo "Start the backend: cd backend && npm run dev"
  exit 1
fi
log "API reachable at $BASE_URL"

# ── Run a single specimen through the pipeline ─────────────
run_specimen() {
  local state="$1"
  local front_img="$2"
  local back_img="$3"
  local selfie_img="$4"  # We reuse front image as selfie

  header "Testing: $state Driver's License"

  # ── Step 1: Initialize ──────────────────────────────────
  log "Step 1/5: Initialize verification session"
  local init_resp
  init_resp=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/initialize" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"$(node -e 'console.log(require("crypto").randomUUID())')\", \"document_type\":\"drivers_license\", \"issuing_country\":\"US\"}")

  local init_http="${init_resp##*$'\n'}"
  local init_body="${init_resp%$'\n'*}"

  if [ "$init_http" = "201" ]; then
    pass "Session created (HTTP $init_http)"
  else
    fail "Initialize failed (HTTP $init_http)"
    pp_json "$init_body"
    return 1
  fi

  local vid
  vid=$(json_field "$init_body" "verification_id")
  log "  verification_id: $vid"

  # ── Step 2: Front document ──────────────────────────────
  log "Step 2/5: Upload front document"
  local front_resp
  front_resp=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/$vid/front-document" \
    -H "X-API-Key: $API_KEY" \
    -F "document=@$front_img" \
    -F "document_type=drivers_license" \
    -F "issuing_country=US")

  local front_http="${front_resp##*$'\n'}"
  local front_body="${front_resp%$'\n'*}"

  if [ "$front_http" = "200" ]; then
    local front_status
    front_status=$(json_field "$front_body" "status")
    local ocr_name
    ocr_name=$(json_field "$front_body" "ocr_data.full_name" 2>/dev/null || echo "?")
    pass "Front processed (HTTP $front_http) → status: $front_status"
    local ocr_dob ocr_docnum
    ocr_name=$(json_field "$front_body" "ocr_data.full_name")
    ocr_dob=$(json_field "$front_body" "ocr_data.date_of_birth")
    ocr_docnum=$(json_field "$front_body" "ocr_data.id_number")
    echo -e "    OCR: name=${ocr_name:-?}, dob=${ocr_dob:-?}, doc#=${ocr_docnum:-?}"
  else
    fail "Front document failed (HTTP $front_http)"
    pp_json "$front_body"
    return 1
  fi

  # ── Step 3: Back document (triggers cross-validation) ───
  log "Step 3/5: Upload back document + cross-validation"
  local back_resp
  back_resp=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/$vid/back-document" \
    -H "X-API-Key: $API_KEY" \
    -F "document=@$back_img" \
    -F "document_type=drivers_license" \
    -F "issuing_country=US")

  local back_http="${back_resp##*$'\n'}"
  local back_body="${back_resp%$'\n'*}"

  if [ "$back_http" = "200" ]; then
    local back_status cv_verdict cv_score
    back_status=$(json_field "$back_body" "status")
    cv_verdict=$(json_field "$back_body" "cross_validation_results.verdict")
    cv_score=$(json_field "$back_body" "cross_validation_results.score")
    pass "Back processed (HTTP $back_http) → status: $back_status"
    echo -e "    Cross-validation: verdict=$cv_verdict, score=$cv_score"
  else
    fail "Back document failed (HTTP $back_http)"
    pp_json "$back_body"
    return 1
  fi

  # ── Step 4: Live capture (selfie = front image) ─────────
  log "Step 4/5: Upload live capture (using front image as selfie)"
  local live_resp
  live_resp=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/$vid/live-capture" \
    -H "X-API-Key: $API_KEY" \
    -F "selfie=@$selfie_img")

  local live_http="${live_resp##*$'\n'}"
  local live_body="${live_resp%$'\n'*}"

  if [ "$live_http" = "200" ]; then
    local live_status final_result
    live_status=$(json_field "$live_body" "status")
    final_result=$(json_field "$live_body" "final_result")
    pass "Live capture processed (HTTP $live_http) → status: $live_status"
    local fm_passed fm_score liveness_score
    fm_passed=$(json_field "$live_body" "face_match_results.passed")
    fm_score=$(json_field "$live_body" "face_match_results.similarity_score")
    liveness_score=$(json_field "$live_body" "liveness_results.liveness_score")
    echo -e "    Face match: passed=${fm_passed:-?}, similarity=${fm_score:-?}"
    echo -e "    Liveness: score=${liveness_score:-?}"
    echo -e "    Final result: ${BOLD}${final_result:-?}${NC}"
  else
    fail "Live capture failed (HTTP $live_http)"
    pp_json "$live_body"
    return 1
  fi

  # ── Step 5: Poll status ─────────────────────────────────
  log "Step 5/5: Poll final status"
  local status_resp
  status_resp=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/$vid/status" \
    -H "X-API-Key: $API_KEY")

  local status_http="${status_resp##*$'\n'}"
  local status_body="${status_resp%$'\n'*}"

  if [ "$status_http" = "200" ]; then
    local final
    final=$(json_field "$status_body" "final_result")
    local risk_level deepfake_real
    risk_level=$(json_field "$status_body" "risk_score.risk_level")
    deepfake_real=$(json_field "$status_body" "deepfake_check.realProbability")
    echo -e "    Risk level: ${risk_level:-N/A}"
    if [ -n "$deepfake_real" ]; then
      echo -e "    Deepfake check: realProbability=$deepfake_real"
    fi
    if [ "$final" = "verified" ]; then
      pass "VERIFIED ✓ (risk: ${risk_level:-?})"
    elif [ "$final" = "manual_review" ]; then
      warn "MANUAL REVIEW (risk: ${risk_level:-?})"
    else
      fail "FAILED: $final"
    fi
  else
    fail "Status poll failed (HTTP $status_http)"
  fi

  echo ""
  return 0
}

# ── Main ───────────────────────────────────────────────────
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Idswyft E2E Verification Pipeline Test          ║"
echo "║     Testing full 5-step flow with specimen images   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
log "API: $BASE_URL"
log "Key: ${API_KEY:0:12}..."
log "Specimens: $SPECIMENS_DIR"
echo ""

PASSED=0
FAILED=0

# ── Specimen 1: Florida ────────────────────────────────────
if run_specimen "FL" \
  "$SPECIMENS_DIR/FL/front_01.png" \
  "$SPECIMENS_DIR/FL/back_01.png" \
  "$SPECIMENS_DIR/FL/front_01.png"; then
  ((PASSED++))
else
  ((FAILED++))
fi

# ── Specimen 2: Texas ──────────────────────────────────────
if run_specimen "TX" \
  "$SPECIMENS_DIR/TX/front_01.png" \
  "$SPECIMENS_DIR/TX/back_01.png" \
  "$SPECIMENS_DIR/TX/front_01.png"; then
  ((PASSED++))
else
  ((FAILED++))
fi

# ── Summary ────────────────────────────────────────────────
header "Summary"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
