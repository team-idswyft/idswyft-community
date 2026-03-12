#!/usr/bin/env python3
"""
Basic usage examples for the Idswyft Python SDK (v3 — v2 API)

The v2 verification flow is step-based:
  1. start_verification()       → get verification_id
  2. upload_front_document()    → OCR + quality gate
  3. upload_back_document()     → barcode + cross-validation
  4. upload_selfie()            → liveness + face match → auto-finalize
  5. get_verification_status()  → check progress at any point
"""

import os
import sys
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import idswyft
from idswyft import IdswyftError, IdswyftAuthenticationError


def full_verification_flow():
    """Example 1: Complete verification flow (v2 API)"""
    print("=== Example 1: Full Verification Flow ===")

    client = idswyft.IdswyftClient(
        api_key=os.getenv("IDSWYFT_API_KEY", "your-api-key"),
        sandbox=True,
    )

    try:
        # Step 1: Initialize verification session
        print("Step 1: Initializing verification session...")
        session = client.start_verification(
            user_id="user-12345",
            document_type="drivers_license",
        )
        vid = session["verification_id"]
        print(f"  Session created: {vid}")
        print(f"  Status: {session['status']}")

        # Step 2: Upload front of ID
        print("Step 2: Uploading front document...")
        front_result = client.upload_front_document(
            verification_id=vid,
            document_file="examples/sample-license-front.jpg",
            document_type="drivers_license",
        )
        print(f"  Status: {front_result['status']}")
        if front_result.get("ocr_data"):
            ocr = front_result["ocr_data"]
            if ocr.get("full_name"):
                print(f"  Name: {ocr['full_name']}")
            if ocr.get("id_number"):
                print(f"  ID: {ocr['id_number']}")

        # Step 3: Upload back of ID
        print("Step 3: Uploading back document...")
        back_result = client.upload_back_document(
            verification_id=vid,
            document_file="examples/sample-license-back.jpg",
        )
        print(f"  Status: {back_result['status']}")
        if back_result.get("documents_match") is not None:
            print(f"  Documents match: {back_result['documents_match']}")
        if back_result.get("cross_validation_results"):
            cv = back_result["cross_validation_results"]
            print(f"  Cross-validation: {cv['verdict']} (score: {cv['score']})")

        # Step 4: Upload selfie
        print("Step 4: Uploading selfie...")
        selfie_result = client.upload_selfie(
            verification_id=vid,
            selfie_file="examples/sample-selfie.jpg",
        )
        print(f"  Status: {selfie_result['status']}")
        if selfie_result.get("face_match_results"):
            fm = selfie_result["face_match_results"]
            print(f"  Face match: {'PASS' if fm['passed'] else 'FAIL'} (score: {fm['score']:.3f})")
        if selfie_result.get("final_result"):
            print(f"  Final result: {selfie_result['final_result']}")

        return selfie_result

    except IdswyftError as e:
        print(f"  Verification failed: {e.message}")
        return None


def check_status_example():
    """Example 2: Check verification status"""
    print("\n=== Example 2: Check Verification Status ===")

    client = idswyft.IdswyftClient(
        api_key=os.getenv("IDSWYFT_API_KEY", "your-api-key"),
        sandbox=True,
    )

    verification_id = os.getenv("IDSWYFT_VERIFICATION_ID", "your-verification-id")

    try:
        result = client.get_verification_status(verification_id)
        print(f"  Status: {result['status']}")
        print(f"  Step: {result['current_step']}/{result.get('total_steps', 5)}")
        print(f"  Front uploaded: {result.get('front_document_uploaded', False)}")
        print(f"  Back uploaded: {result.get('back_document_uploaded', False)}")
        print(f"  Selfie uploaded: {result.get('live_capture_uploaded', False)}")
        if result.get("final_result"):
            print(f"  Final result: {result['final_result']}")
        return result
    except IdswyftError as e:
        print(f"  Status check failed: {e.message}")
        return None


def usage_statistics_example():
    """Example 3: Get usage statistics"""
    print("\n=== Example 3: Usage Statistics ===")

    client = idswyft.IdswyftClient(
        api_key=os.getenv("IDSWYFT_API_KEY", "your-api-key"),
        sandbox=True,
    )

    try:
        stats = client.get_usage_stats()
        print(f"  Period: {stats['period']}")
        print(f"  Total Requests: {stats['total_requests']}")
        print(f"  Success Rate: {stats['success_rate']}")
        print(f"  Monthly Usage: {stats['monthly_usage']}/{stats['monthly_limit']}")
        print(f"  Remaining Quota: {stats['remaining_quota']}")
        return stats
    except IdswyftError as e:
        print(f"  Failed to get usage stats: {e.message}")
        return None


def webhook_verification_example():
    """Example 4: Webhook signature verification"""
    print("\n=== Example 4: Webhook Signature Verification ===")

    webhook_payload = '{"verification_id":"verif_123","status":"COMPLETE","final_result":"verified"}'
    webhook_signature = "sha256=abcd1234..."
    webhook_secret = "your-webhook-secret"

    is_valid = idswyft.IdswyftClient.verify_webhook_signature(
        payload=webhook_payload,
        signature=webhook_signature,
        secret=webhook_secret,
    )

    print(f"  Signature valid: {is_valid}")
    return is_valid


def main():
    """Run all examples"""
    print("Idswyft Python SDK v3 Examples")
    print("=" * 50)

    if not os.getenv("IDSWYFT_API_KEY"):
        print("Set IDSWYFT_API_KEY environment variable to run examples")
        print("export IDSWYFT_API_KEY='your-api-key-here'")
        return

    try:
        full_verification_flow()
        check_status_example()
        usage_statistics_example()
        webhook_verification_example()

        print(f"\n{'=' * 50}")
        print("All examples completed!")

    except KeyboardInterrupt:
        print("\nExamples interrupted by user")
    except Exception as e:
        print(f"\nExample execution failed: {e}")


if __name__ == "__main__":
    main()
