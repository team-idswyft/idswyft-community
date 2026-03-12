#!/usr/bin/env python3
"""
Integration tests for Idswyft Python SDK (v3 — v2 API)
Tests against actual running API server
"""

import os
import sys
import base64
import hmac
import hashlib

# Add parent directory to path so we can import the SDK
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import idswyft
from idswyft import IdswyftClient
from idswyft.exceptions import IdswyftError, IdswyftAPIError

# Test configuration
API_BASE_URL = 'http://localhost:3001'
TEST_API_KEY = 'test-api-key-12345'


def create_test_image_bytes():
    """Create a simple test image as bytes"""
    # Create minimal PNG file (1x1 pixel transparent PNG)
    png_data = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    )
    return png_data


def test_health_check():
    """Test API health check"""
    print('\n=== Testing Health Check ===')

    client = IdswyftClient(
        api_key=TEST_API_KEY,
        base_url=API_BASE_URL,
        sandbox=True
    )

    try:
        result = client.health_check()
        print('  Health check passed:', result)
        return True
    except Exception as error:
        print('  Health check failed:', str(error))
        return False


def test_verification_flow():
    """Test the complete v2 verification flow"""
    print('\n=== Testing V2 Verification Flow ===')

    client = IdswyftClient(
        api_key=TEST_API_KEY,
        base_url=API_BASE_URL,
        sandbox=True
    )

    try:
        # Step 1: Initialize verification session
        print('Step 1: Initializing verification session...')
        session = client.start_verification(
            user_id='test-user-123',
            document_type='drivers_license',
        )

        print('  Session created')
        print('  Verification ID:', session['verification_id'])
        print('  Status:', session['status'])

        verification_id = session['verification_id']

        # Step 2: Upload front document
        print('\nStep 2: Uploading front document...')
        test_image = create_test_image_bytes()

        front_result = client.upload_front_document(
            verification_id=verification_id,
            document_file=test_image,
            document_type='drivers_license',
        )

        print('  Front document uploaded')
        print('  Status:', front_result['status'])

        if front_result.get('ocr_data'):
            print('  OCR data received')
            ocr = front_result['ocr_data']
            if ocr.get('full_name'):
                print('  Name:', ocr['full_name'])

        # Step 3: Upload back document
        print('\nStep 3: Uploading back document...')
        back_result = client.upload_back_document(
            verification_id=verification_id,
            document_file=test_image,
            document_type='drivers_license',
        )

        print('  Back document uploaded')
        print('  Status:', back_result['status'])
        if back_result.get('documents_match') is not None:
            print('  Documents match:', back_result['documents_match'])
        if back_result.get('cross_validation_results'):
            cv = back_result['cross_validation_results']
            print('  Cross-validation:', cv.get('verdict'), '(score:', cv.get('score'), ')')

        # Step 3.5: Check cross-validation separately
        print('\nStep 3.5: Checking cross-validation...')
        cv_result = client.get_cross_validation(verification_id)
        print('  Cross-validation status:', cv_result['status'])

        # Step 4: Upload selfie
        print('\nStep 4: Uploading selfie...')
        selfie_result = client.upload_selfie(
            verification_id=verification_id,
            selfie_file=test_image,
        )

        print('  Selfie uploaded')
        print('  Status:', selfie_result['status'])
        if selfie_result.get('face_match_results'):
            fm = selfie_result['face_match_results']
            print('  Face match:', 'PASS' if fm.get('passed') else 'FAIL')
        if selfie_result.get('final_result'):
            print('  Final result:', selfie_result['final_result'])

        # Step 5: Get full status
        print('\nStep 5: Getting verification status...')
        status = client.get_verification_status(verification_id)
        print('  Status:', status['status'])
        print('  Step:', status.get('current_step'), '/', status.get('total_steps'))
        print('  Front uploaded:', status.get('front_document_uploaded'))
        print('  Back uploaded:', status.get('back_document_uploaded'))
        print('  Selfie uploaded:', status.get('live_capture_uploaded'))
        if status.get('final_result'):
            print('  Final result:', status['final_result'])

        return {
            'session': session,
            'front_result': front_result,
            'back_result': back_result,
            'selfie_result': selfie_result,
            'status': status,
        }

    except Exception as error:
        print('  Verification flow failed:', str(error))
        if isinstance(error, IdswyftError):
            print(f'  Error type: {error.__class__.__name__}')
        return None


def test_developer_management():
    """Test developer management features"""
    print('\n=== Testing Developer Management ===')

    client = IdswyftClient(
        api_key=TEST_API_KEY,
        base_url=API_BASE_URL,
        sandbox=True
    )

    try:
        # Test creating API key
        print('Creating new API key...')
        api_key_result = client.create_api_key(
            name='Python Test SDK Key',
            environment='sandbox'
        )
        print('  API key created:', api_key_result.get('key_id'))

        # Test listing API keys
        print('Listing API keys...')
        api_keys_list = client.list_api_keys()
        print('  Total keys:', len(api_keys_list.get('api_keys', [])))

        # Test getting API activity
        print('Getting API activity...')
        activity_result = client.get_api_activity(limit=5)
        print('  Total activities:', activity_result.get('total', 0))

        return True

    except Exception as error:
        print('  Developer management failed:', str(error))
        return False


def test_webhook_management():
    """Test webhook management features"""
    print('\n=== Testing Webhook Management ===')

    client = IdswyftClient(
        api_key=TEST_API_KEY,
        base_url=API_BASE_URL,
        sandbox=True
    )

    try:
        # Register webhook
        print('Registering webhook...')
        webhook_result = client.register_webhook(
            url='https://example.com/webhook',
            events=['verification.completed', 'verification.failed'],
            secret='test-webhook-secret'
        )
        print('  Webhook registered')

        # List webhooks
        print('Listing webhooks...')
        webhooks_list = client.list_webhooks()
        print('  Total webhooks:', len(webhooks_list.get('webhooks', [])))

        return True

    except Exception as error:
        print('  Webhook management failed:', str(error))
        return False


def test_usage_stats():
    """Test usage statistics retrieval"""
    print('\n=== Testing Usage Statistics ===')

    client = IdswyftClient(
        api_key=TEST_API_KEY,
        base_url=API_BASE_URL,
        sandbox=True
    )

    try:
        result = client.get_usage_stats()
        print('  Total requests:', result.get('total_requests'))
        print('  Success rate:', result.get('success_rate'))
        return True
    except Exception as error:
        print('  Usage stats failed:', str(error))
        return False


def test_webhook_signature_verification():
    """Test webhook signature verification"""
    print('\n=== Testing Webhook Signature Verification ===')

    payload = '{"verification_id":"test-123","status":"COMPLETE","final_result":"verified"}'
    secret = 'test-webhook-secret'

    # Test with valid signature
    valid_signature = 'sha256=' + hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    is_valid = IdswyftClient.verify_webhook_signature(payload, valid_signature, secret)

    if is_valid:
        print('  Valid signature correctly accepted')
    else:
        print('  Valid signature incorrectly rejected')

    # Test with invalid signature
    is_invalid = IdswyftClient.verify_webhook_signature(payload, 'invalid-signature', secret)

    if not is_invalid:
        print('  Invalid signature correctly rejected')
    else:
        print('  Invalid signature incorrectly accepted')

    return is_valid and not is_invalid


def run_all_tests():
    """Run all integration tests"""
    print('Idswyft Python SDK v3 Integration Tests')
    print('=' * 50)

    results = {
        'health_check': False,
        'verification_flow': False,
        'developer_management': False,
        'webhook_management': False,
        'usage_stats': False,
        'webhook_verification': False,
    }

    try:
        results['health_check'] = test_health_check()

        flow_result = test_verification_flow()
        results['verification_flow'] = flow_result is not None

        results['developer_management'] = test_developer_management()
        results['webhook_management'] = test_webhook_management()
        results['usage_stats'] = test_usage_stats()
        results['webhook_verification'] = test_webhook_signature_verification()

    except Exception as error:
        print('Unexpected error during testing:', str(error))

    # Print summary
    print('\nTest Results Summary')
    print('=' * 30)

    test_names = {
        'health_check': 'Health Check',
        'verification_flow': 'V2 Verification Flow (5 steps)',
        'developer_management': 'Developer Management',
        'webhook_management': 'Webhook Management',
        'usage_stats': 'Usage Statistics',
        'webhook_verification': 'Webhook Signature Verification',
    }

    for test, passed in results.items():
        status = 'PASS' if passed else 'FAIL'
        print(f'  [{status}] {test_names[test]}')

    passed_count = sum(results.values())
    total_count = len(results)
    print(f'\nOverall: {passed_count}/{total_count} tests passed')

    return passed_count == total_count


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
