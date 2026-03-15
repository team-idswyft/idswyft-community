#!/bin/sh
# Copy MediaPipe WASM assets + download face_landmarker model into public/mediapipe/
# Runs as postinstall or during Vercel build

set -e

MEDIAPIPE_DIR="public/mediapipe"
WASM_LOCAL="node_modules/@mediapipe/tasks-vision/wasm"
WASM_HOISTED="../node_modules/@mediapipe/tasks-vision/wasm"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"

mkdir -p "$MEDIAPIPE_DIR"

# Copy WASM runtime files (check local node_modules first, then hoisted workspace root)
WASM_SRC=""
if [ -d "$WASM_LOCAL" ]; then
  WASM_SRC="$WASM_LOCAL"
elif [ -d "$WASM_HOISTED" ]; then
  WASM_SRC="$WASM_HOISTED"
fi

if [ -n "$WASM_SRC" ]; then
  cp "$WASM_SRC/vision_wasm_internal.js" "$MEDIAPIPE_DIR/"
  cp "$WASM_SRC/vision_wasm_internal.wasm" "$MEDIAPIPE_DIR/"
  echo "Copied MediaPipe WASM files from $WASM_SRC to $MEDIAPIPE_DIR"
else
  echo "Warning: @mediapipe/tasks-vision WASM not found — skipping WASM copy"
fi

# Download face landmarker model if missing
if [ ! -f "$MEDIAPIPE_DIR/face_landmarker.task" ]; then
  echo "Downloading face_landmarker.task..."
  if command -v curl > /dev/null 2>&1; then
    curl -sL "$MODEL_URL" -o "$MEDIAPIPE_DIR/face_landmarker.task"
  elif command -v wget > /dev/null 2>&1; then
    wget -q "$MODEL_URL" -O "$MEDIAPIPE_DIR/face_landmarker.task"
  else
    echo "Warning: Neither curl nor wget available — skipping model download"
    exit 0
  fi
  echo "Downloaded face_landmarker.task"
else
  echo "face_landmarker.task already exists — skipping download"
fi
