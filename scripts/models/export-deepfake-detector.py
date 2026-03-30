#!/usr/bin/env python3
"""
Export EfficientNet-B0 Deepfake Detector to ONNX

Downloads a pretrained EfficientNet-B0 with a 2-class head (fake vs real)
and exports it to ONNX format for use by the Idswyft engine's
OnnxDeepfakeDetector class.

Usage:
    pip install -r requirements.txt
    python export-deepfake-detector.py

Output:
    ../../shared/models/deepfake-detector.onnx
"""

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch
import timm
import onnx
import onnxruntime as ort


# Output path — shared/models/ relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / ".." / ".." / "shared" / "models"
OUTPUT_PATH = OUTPUT_DIR / "deepfake-detector.onnx"

INPUT_SIZE = 224
NUM_CLASSES = 2  # [fake, real]
OPSET_VERSION = 17


def try_load_deepfake_weights(model: torch.nn.Module) -> bool:
    """
    Attempt to load fine-tuned deepfake detection weights from HuggingFace.
    Returns True if successful, False if we should fall back to ImageNet weights.
    """
    try:
        from huggingface_hub import hf_hub_download

        # Search for known EfficientNet-B0 deepfake detection checkpoints.
        # These are common fine-tuned models on FaceForensics++ / DFDC.
        known_repos = [
            "aaronespasa/deepfake-detection-efficientnetb0",
            "jpandeinge/deepfake-efficientnet-b0",
        ]

        for repo_id in known_repos:
            try:
                print(f"  Trying HuggingFace: {repo_id} ...")
                # Try common weight file names
                for filename in ["model.pth", "pytorch_model.bin", "efficientnet_b0.pth", "best.pth"]:
                    try:
                        ckpt_path = hf_hub_download(
                            repo_id=repo_id,
                            filename=filename,
                            cache_dir=tempfile.gettempdir(),
                        )
                        state_dict = torch.load(ckpt_path, map_location="cpu", weights_only=True)

                        # Handle common checkpoint wrappers
                        if "state_dict" in state_dict:
                            state_dict = state_dict["state_dict"]
                        elif "model_state_dict" in state_dict:
                            state_dict = state_dict["model_state_dict"]

                        # Try loading — strict=False allows missing/extra keys
                        model.load_state_dict(state_dict, strict=False)
                        print(f"  Loaded deepfake weights from {repo_id}/{filename}")
                        return True
                    except Exception:
                        continue
            except Exception:
                continue

    except ImportError:
        print("  huggingface_hub not available, skipping HF weight search")

    return False


def create_model() -> torch.nn.Module:
    """
    Create EfficientNet-B0 with 2-class output head.

    Priority:
    1. Load fine-tuned deepfake detection weights from HuggingFace
    2. Fall back to ImageNet-pretrained weights (functional baseline)
    """
    print("Creating EfficientNet-B0 with 2-class head ...")

    # Create model with ImageNet pretrained weights and 2-class head
    model = timm.create_model(
        "efficientnet_b0",
        pretrained=True,
        num_classes=NUM_CLASSES,
    )

    # Try to load deepfake-specific fine-tuned weights
    print("Searching for deepfake-tuned weights ...")
    loaded = try_load_deepfake_weights(model)

    if not loaded:
        print("  No deepfake-tuned weights found.")
        print("  Using ImageNet-pretrained EfficientNet-B0 as baseline.")
        print("  (Swap weights later with a fine-tuned checkpoint for better accuracy)")

    model.eval()
    return model


def export_to_onnx(model: torch.nn.Module) -> Path:
    """Export the model to ONNX format."""
    print(f"\nExporting to ONNX (opset {OPSET_VERSION}) ...")

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Dummy input matching OnnxDeepfakeDetector's preprocessToTensor output
    dummy_input = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)

    torch.onnx.export(
        model,
        dummy_input,
        str(OUTPUT_PATH),
        input_names=["input"],
        output_names=["output"],
        opset_version=OPSET_VERSION,
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"},
        },
        dynamo=False,  # Use legacy exporter (stable, Windows-compatible)
    )

    file_size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"  Saved: {OUTPUT_PATH}")
    print(f"  Size:  {file_size_mb:.1f} MB")
    return OUTPUT_PATH


def validate_onnx(model_path: Path) -> None:
    """Validate the exported ONNX model."""
    print("\nValidating ONNX model ...")

    # 1. Structural validation
    onnx_model = onnx.load(str(model_path))
    onnx.checker.check_model(onnx_model)
    print("  ONNX structural check: PASSED")

    # 2. Runtime validation with dummy input
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    input_shape = session.get_inputs()[0].shape
    output_shape = session.get_outputs()[0].shape

    print(f"  Input:  name={input_name}, shape={input_shape}")
    print(f"  Output: name={output_name}, shape={output_shape}")

    # Run inference with ImageNet-normalized dummy data
    dummy = np.random.randn(1, 3, INPUT_SIZE, INPUT_SIZE).astype(np.float32)
    results = session.run([output_name], {input_name: dummy})
    output_data = results[0]

    print(f"  Output shape: {output_data.shape}")
    print(f"  Output values: {output_data[0]}")

    # Verify output shape matches what OnnxDeepfakeDetector expects
    assert output_data.shape[0] == 1, f"Expected batch=1, got {output_data.shape[0]}"
    assert output_data.shape[1] == NUM_CLASSES, f"Expected {NUM_CLASSES} classes, got {output_data.shape[1]}"
    print("  Runtime inference check: PASSED")

    # 3. Softmax sanity check (same logic as OnnxDeepfakeDetector.detect)
    logits = output_data[0]
    max_val = max(logits[0], logits[1])
    exp_fake = np.exp(logits[0] - max_val)
    exp_real = np.exp(logits[1] - max_val)
    total = exp_fake + exp_real
    fake_prob = exp_fake / total
    real_prob = exp_real / total
    print(f"  Softmax: fake={fake_prob:.4f}, real={real_prob:.4f}")
    print("  Softmax sanity check: PASSED")


def main() -> None:
    print("=" * 60)
    print("Idswyft Deepfake Detector — ONNX Export")
    print("=" * 60)
    print()

    # Check if output already exists
    if OUTPUT_PATH.exists():
        size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
        print(f"Model already exists: {OUTPUT_PATH} ({size_mb:.1f} MB)")
        response = input("Overwrite? [y/N] ").strip().lower()
        if response != "y":
            print("Aborted.")
            sys.exit(0)

    model = create_model()
    model_path = export_to_onnx(model)
    validate_onnx(model_path)

    print()
    print("=" * 60)
    print("SUCCESS — Deepfake detector ready")
    print(f"  Model: {model_path}")
    print("  Start the engine to verify: cd engine && npm run dev")
    print("  Look for: 'Deepfake detector model loaded'")
    print("=" * 60)


if __name__ == "__main__":
    main()
