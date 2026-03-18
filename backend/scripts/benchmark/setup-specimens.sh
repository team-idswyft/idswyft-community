#!/bin/bash
# setup-specimens.sh
#
# Extracts MIDV-500 source images + ground truth from downloaded zips,
# converts TIF→JPEG, creates mapped ground truth files for our schema,
# and organizes into the specimens/ directory layout.
#
# Usage: bash backend/scripts/benchmark/setup-specimens.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPECIMENS_DIR="$SCRIPT_DIR/specimens"
RAW_DIR="$SPECIMENS_DIR/_raw"

echo "=== MIDV-500 Specimen Setup ==="
echo "Specimens dir: $SPECIMENS_DIR"
echo ""

# Check for required tools
if ! command -v convert &>/dev/null && ! command -v magick &>/dev/null; then
  echo "Warning: ImageMagick not found. TIF files will not be converted to JPEG."
  echo "Install with: winget install ImageMagick.ImageMagick  (or choco install imagemagick)"
  CONVERT_CMD=""
elif command -v magick &>/dev/null; then
  CONVERT_CMD="magick"
else
  CONVERT_CMD="convert"
fi

# Document type mappings: zip_name -> country_code
declare -A DOC_COUNTRY=(
  ["01_alb_id"]="AL"
  ["12_deu_drvlic_new"]="DE"
  ["48_usa_passportcard"]="US"
  ["02_aut_drvlic_new"]="AT"
  ["14_deu_id_new"]="DE"
  ["20_esp_id_new"]="ES"
  ["16_deu_passport_new"]="DE"
)

declare -A DOC_TYPE=(
  ["01_alb_id"]="national_id"
  ["12_deu_drvlic_new"]="drivers_license"
  ["48_usa_passportcard"]="passport"
  ["02_aut_drvlic_new"]="drivers_license"
  ["14_deu_id_new"]="national_id"
  ["20_esp_id_new"]="national_id"
  ["16_deu_passport_new"]="passport"
)

process_zip() {
  local zip_name="$1"
  local zip_path="$RAW_DIR/${zip_name}.zip"

  if [ ! -f "$zip_path" ]; then
    echo "  Skipping $zip_name (zip not found)"
    return
  fi

  local country="${DOC_COUNTRY[$zip_name]:-XX}"
  local doc_type="${DOC_TYPE[$zip_name]:-national_id}"
  local country_dir="$SPECIMENS_DIR/$country"
  mkdir -p "$country_dir"

  echo "Processing $zip_name -> $country ($doc_type)..."

  # Find the specimen number (avoid collision with existing specimens)
  local num=1
  while [ -f "$country_dir/front_$(printf '%02d' $num).jpg" ] || [ -f "$country_dir/front_$(printf '%02d' $num).tif" ]; do
    num=$((num + 1))
  done
  local id=$(printf '%02d' $num)

  # Extract source image (the clean reference image)
  local src_image=$(unzip -l "$zip_path" | grep -E "images/${zip_name}\.(tif|png|jpg)" | awk '{print $4}' | head -1)
  if [ -z "$src_image" ]; then
    echo "  Warning: No source image found in $zip_name"
    # Try extracting a frame instead
    src_image=$(unzip -l "$zip_path" | grep -E "images/TA/${zip_name//_*/}.*_01\.(tif|png|jpg)" | awk '{print $4}' | head -1)
  fi

  if [ -n "$src_image" ]; then
    unzip -o -j "$zip_path" "$src_image" -d "$country_dir/" 2>/dev/null
    local extracted_name=$(basename "$src_image")

    # Convert TIF to JPEG if possible
    if [[ "$extracted_name" == *.tif ]] && [ -n "$CONVERT_CMD" ]; then
      $CONVERT_CMD "$country_dir/$extracted_name" "$country_dir/front_${id}.jpg"
      rm -f "$country_dir/$extracted_name"
      echo "  Extracted + converted: front_${id}.jpg"
    elif [[ "$extracted_name" == *.tif ]]; then
      mv "$country_dir/$extracted_name" "$country_dir/front_${id}.tif"
      echo "  Extracted (TIF): front_${id}.tif"
    else
      mv "$country_dir/$extracted_name" "$country_dir/front_${id}.${extracted_name##*.}"
      echo "  Extracted: front_${id}.${extracted_name##*.}"
    fi
  fi

  # Also extract a few video frames for more test data
  local frame_files=$(unzip -l "$zip_path" | grep -E "images/TA/TA${zip_name:0:2}_(01|05|10)\.(tif|png|jpg)" | awk '{print $4}')
  local frame_num=$((num + 1))
  for frame in $frame_files; do
    local fid=$(printf '%02d' $frame_num)
    unzip -o -j "$zip_path" "$frame" -d "$country_dir/" 2>/dev/null
    local frame_name=$(basename "$frame")

    if [[ "$frame_name" == *.tif ]] && [ -n "$CONVERT_CMD" ]; then
      $CONVERT_CMD "$country_dir/$frame_name" "$country_dir/front_${fid}.jpg"
      rm -f "$country_dir/$frame_name"
      echo "  Extracted frame: front_${fid}.jpg"
    else
      mv "$country_dir/$frame_name" "$country_dir/front_${fid}.${frame_name##*.}"
      echo "  Extracted frame: front_${fid}.${frame_name##*.}"
    fi
    frame_num=$((frame_num + 1))
  done

  # Extract ground truth JSON
  local gt_file=$(unzip -l "$zip_path" | grep -E "ground_truth/${zip_name}\.json" | awk '{print $4}' | head -1)
  if [ -n "$gt_file" ]; then
    unzip -o -j "$zip_path" "$gt_file" -d "$country_dir/" 2>/dev/null
    local gt_name=$(basename "$gt_file")
    # Keep original for reference
    mv "$country_dir/$gt_name" "$country_dir/midv500_ground_truth_${id}.json"
    echo "  Ground truth: midv500_ground_truth_${id}.json"
    echo "  Note: Run the Node.js mapper to create ground_truth_${id}.json"
  fi

  echo "  Done ($country/$id)"
}

# Process all downloaded zips
for zip_file in "$RAW_DIR"/*.zip; do
  [ -f "$zip_file" ] || continue
  zip_name=$(basename "$zip_file" .zip)
  process_zip "$zip_name"
done

echo ""
echo "=== Extraction complete ==="
echo ""
echo "Next steps:"
echo "  1. Check $SPECIMENS_DIR/<COUNTRY>/ for extracted images"
echo "  2. Run the ground truth mapper: npx tsx backend/scripts/benchmark/map-ground-truth.ts"
echo "  3. Run benchmark: npx tsx backend/scripts/benchmark/benchmark-ocr.ts --specimens-dir $SPECIMENS_DIR"
echo ""
echo "Tip: You can delete the _raw/ directory to free ~2GB of space:"
echo "  rm -rf $RAW_DIR"
