#!/usr/bin/env python3
"""
Unit tests for Idswyft Python SDK (v3 — v2 API)
"""

import os
import sys
import pytest
import json
from unittest.mock import Mock, patch, MagicMock
import hmac
import hashlib

# Add parent directory to path so we can import the SDK
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import idswyft
from idswyft import IdswyftClient
from idswyft.exceptions import (
    IdswyftError, IdswyftAPIError, IdswyftAuthenticationError,
    IdswyftValidationError, IdswyftNotFoundError, IdswyftRateLimitError,
    IdswyftServerError, IdswyftNetworkError
)

class TestIdswyftClient:
    """Test cases for IdswyftClient class"""

    def setup_method(self):
        """Setup test client"""
        self.client = IdswyftClient(
            api_key='test-api-key',
            base_url='https://api.test.idswyft.app',
            sandbox=True
        )

    def test_client_initialization(self):
        """Test client initialization with provided config"""
        assert self.client.api_key == 'test-api-key'
        assert self.client.base_url == 'https://api.test.idswyft.app'
        assert self.client.sandbox == True
        assert self.client.timeout == 30

        # Test default values
        default_client = IdswyftClient(api_key='test-key')
        assert default_client.base_url == 'https://api.idswyft.app'
        assert default_client.timeout == 30
        assert default_client.sandbox == False

    def test_client_initialization_requires_api_key(self):
        """Test that client initialization requires API key"""
        with pytest.raises(ValueError, match="API key is required"):
            IdswyftClient(api_key='')

    @patch('idswyft.client.requests.Session')
    def test_start_verification(self, mock_session_class):
        """Test start verification initializes session via v2 API"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'AWAITING_FRONT',
            'current_step': 1,
            'total_steps': 5,
            'message': 'Verification initialized successfully'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.start_verification(
            user_id='user-123',
            document_type='drivers_license',
            sandbox=True
        )

        # Verify the API call uses v2 endpoint
        mock_session.request.assert_called_once_with(
            method='POST',
            url='https://api.idswyft.app/api/v2/verify/initialize',
            data=None,
            json={'user_id': 'user-123', 'document_type': 'drivers_license', 'sandbox': True},
            files=None,
            params=None,
            timeout=30
        )

        assert result['verification_id'] == 'verif_123'
        assert result['status'] == 'AWAITING_FRONT'

    @patch('idswyft.client.requests.Session')
    def test_upload_front_document(self, mock_session_class):
        """Test front document upload with verification_id in URL path"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'AWAITING_BACK',
            'current_step': 2,
            'document_id': 'doc_front_456',
            'ocr_data': {
                'full_name': 'JOHN DOE',
                'date_of_birth': '1990-01-15',
                'id_number': 'D1234567',
            },
            'message': 'Front document processed'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        test_bytes = b'fake image data'
        result = client.upload_front_document(
            verification_id='verif_123',
            document_file=test_bytes,
            document_type='drivers_license'
        )

        assert result['verification_id'] == 'verif_123'
        assert result['status'] == 'AWAITING_BACK'
        assert result['ocr_data']['full_name'] == 'JOHN DOE'

        # Verify URL path contains verification_id
        call_args = mock_session.request.call_args
        assert '/api/v2/verify/verif_123/front-document' in call_args[1]['url'] or \
               '/api/v2/verify/verif_123/front-document' in call_args.kwargs.get('url', '')

    @patch('idswyft.client.requests.Session')
    def test_upload_back_document(self, mock_session_class):
        """Test back document upload with cross-validation results"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'AWAITING_LIVE',
            'current_step': 3,
            'barcode_data': {
                'first_name': 'JOHN',
                'last_name': 'DOE',
                'date_of_birth': '19900115',
            },
            'documents_match': True,
            'cross_validation_results': {
                'verdict': 'PASS',
                'has_critical_failure': False,
                'score': 0.95,
                'failures': [],
            },
            'message': 'Back document processed'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        test_bytes = b'fake back image data'
        result = client.upload_back_document(
            verification_id='verif_123',
            document_file=test_bytes,
            document_type='drivers_license'
        )

        assert result['verification_id'] == 'verif_123'
        assert result['documents_match'] == True
        assert result['cross_validation_results']['verdict'] == 'PASS'
        assert result['cross_validation_results']['score'] == 0.95

    @patch('idswyft.client.requests.Session')
    def test_upload_selfie(self, mock_session_class):
        """Test selfie upload with face match and liveness results"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'COMPLETE',
            'current_step': 5,
            'selfie_id': 'selfie_abc',
            'face_match_results': {
                'passed': True,
                'score': 0.92,
                'distance': 0.35,
            },
            'liveness_results': {
                'liveness_passed': True,
                'liveness_score': 0.94,
            },
            'final_result': 'verified',
            'message': 'Verification complete'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.upload_selfie(
            verification_id='verif_123',
            selfie_file=b'fake selfie data'
        )

        assert result['status'] == 'COMPLETE'
        assert result['face_match_results']['passed'] == True
        assert result['face_match_results']['score'] == 0.92
        assert result['liveness_results']['liveness_passed'] == True
        assert result['final_result'] == 'verified'

    @patch('idswyft.client.requests.Session')
    def test_get_cross_validation(self, mock_session_class):
        """Test cross-validation retrieval"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'AWAITING_LIVE',
            'documents_match': True,
            'cross_validation_results': {
                'verdict': 'PASS',
                'has_critical_failure': False,
                'score': 0.95,
                'failures': [],
            }
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.get_cross_validation('verif_123')

        assert result['cross_validation_results']['verdict'] == 'PASS'

    @patch('idswyft.client.requests.Session')
    def test_get_verification_status(self, mock_session_class):
        """Test verification status retrieval"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'verification_id': 'verif_123',
            'status': 'COMPLETE',
            'current_step': 5,
            'total_steps': 5,
            'front_document_uploaded': True,
            'back_document_uploaded': True,
            'live_capture_uploaded': True,
            'final_result': 'verified',
            'created_at': '2024-01-01T12:00:00Z',
            'updated_at': '2024-01-01T12:05:00Z',
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.get_verification_status('verif_123')

        assert result['status'] == 'COMPLETE'
        assert result['final_result'] == 'verified'
        assert result['front_document_uploaded'] == True
        assert result['back_document_uploaded'] == True
        assert result['live_capture_uploaded'] == True

    @patch('idswyft.client.requests.Session')
    def test_create_api_key(self, mock_session_class):
        """Test API key creation"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'api_key': 'sk_test_123456789abcdef',
            'key_id': 'key_abc123'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.create_api_key(
            name='Test Key',
            environment='sandbox'
        )

        assert result['api_key'] == 'sk_test_123456789abcdef'
        assert result['key_id'] == 'key_abc123'

    @patch('idswyft.client.requests.Session')
    def test_register_webhook(self, mock_session_class):
        """Test webhook registration"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'webhook': {
                'id': 'hook_123',
                'url': 'https://example.com/webhook',
                'events': ['verification.completed'],
                'is_active': True,
                'secret': 'webhook_secret'
            }
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        result = client.register_webhook(
            url='https://example.com/webhook',
            events=['verification.completed'],
            secret='webhook_secret'
        )

        webhook = result['webhook']
        assert webhook['id'] == 'hook_123'
        assert webhook['url'] == 'https://example.com/webhook'
        assert webhook['events'] == ['verification.completed']
        assert webhook['is_active'] == True

    def test_webhook_signature_verification(self):
        """Test webhook signature verification"""
        payload = '{"verification_id":"test","status":"COMPLETE"}'
        secret = 'webhook-secret'

        # Create valid signature
        valid_signature = 'sha256=' + hmac.new(
            secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # Test valid signature
        is_valid = IdswyftClient.verify_webhook_signature(payload, valid_signature, secret)
        assert is_valid == True

        # Test invalid signature
        is_invalid = IdswyftClient.verify_webhook_signature(payload, 'invalid-signature', secret)
        assert is_invalid == False

        # Test empty inputs
        is_empty = IdswyftClient.verify_webhook_signature('', '', '')
        assert is_empty == False

    @patch('idswyft.client.requests.Session')
    def test_error_handling_400(self, mock_session_class):
        """Test handling of 400 validation errors"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 400
        mock_response.json.return_value = {
            'message': 'Validation failed',
            'field': 'document_type',
            'details': ['Invalid document type']
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        with pytest.raises(IdswyftValidationError) as exc_info:
            client.upload_front_document(
                verification_id='verif_123',
                document_file=b'test',
                document_type='invalid'
            )

        assert 'Validation failed' in str(exc_info.value)

    @patch('idswyft.client.requests.Session')
    def test_error_handling_401(self, mock_session_class):
        """Test handling of 401 authentication errors"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.json.return_value = {
            'message': 'Invalid API key'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='invalid-key')

        with pytest.raises(IdswyftAuthenticationError) as exc_info:
            client.health_check()

        assert 'Invalid API key' in str(exc_info.value)

    @patch('idswyft.client.requests.Session')
    def test_error_handling_404(self, mock_session_class):
        """Test handling of 404 not found errors"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.json.return_value = {
            'message': 'Verification not found',
            'resource': 'Verification'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        with pytest.raises(IdswyftNotFoundError) as exc_info:
            client.get_verification_status('invalid-id')

        assert 'Verification' in str(exc_info.value)

    @patch('idswyft.client.requests.Session')
    def test_error_handling_409(self, mock_session_class):
        """Test handling of 409 conflict errors (hard-rejected sessions)"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 409
        mock_response.json.return_value = {
            'message': 'Session has been hard-rejected',
            'code': 'SESSION_REJECTED'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        with pytest.raises(IdswyftAPIError) as exc_info:
            client.upload_back_document(
                verification_id='rejected-session',
                document_file=b'test'
            )

        assert 'hard-rejected' in str(exc_info.value)

    @patch('idswyft.client.requests.Session')
    def test_error_handling_429(self, mock_session_class):
        """Test handling of 429 rate limit errors"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.json.return_value = {
            'message': 'Rate limit exceeded',
            'retry_after': 60
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        with pytest.raises(IdswyftRateLimitError) as exc_info:
            client.upload_front_document(
                verification_id='verif_123',
                document_file=b'test'
            )

        assert 'Rate limit exceeded' in str(exc_info.value)
        assert exc_info.value.retry_after == 60

    @patch('idswyft.client.requests.Session')
    def test_error_handling_500(self, mock_session_class):
        """Test handling of 500 server errors"""
        mock_session = Mock()
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.json.return_value = {
            'message': 'Internal server error'
        }

        mock_session.request.return_value = mock_response
        mock_session_class.return_value = mock_session

        client = IdswyftClient(api_key='test-key')

        with pytest.raises(IdswyftServerError) as exc_info:
            client.health_check()

        assert 'Internal server error' in str(exc_info.value)

    def test_file_preparation_bytes(self):
        """Test file preparation with bytes"""
        test_bytes = b'test image data'
        result = self.client._prepare_file(test_bytes, 'test_field')

        assert result[0] == 'test_field'
        assert result[1] == test_bytes
        assert result[2] == 'application/octet-stream'

    def test_file_preparation_string_path(self):
        """Test file preparation with file path"""
        import tempfile

        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            tmp_file.write(b'test file content')
            tmp_file_path = tmp_file.name

        try:
            result = self.client._prepare_file(tmp_file_path, 'test_field')

            assert result[0] == 'test_field'
            assert result[1] == b'test file content'
            assert result[2] == 'application/octet-stream'
        finally:
            os.unlink(tmp_file_path)

    def test_file_preparation_invalid_type(self):
        """Test file preparation with invalid type"""
        with pytest.raises(ValueError, match="Invalid file data type"):
            self.client._prepare_file(12345, 'test_field')

    def test_context_manager(self):
        """Test client as context manager"""
        with IdswyftClient(api_key='test-key') as client:
            assert client.api_key == 'test-key'
            assert client.session is not None

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
