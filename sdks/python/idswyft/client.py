"""
Main client class for the Idswyft SDK (v3 — matches backend v2 API)
"""

import json
import hashlib
import hmac
import requests
from typing import Dict, Any, Optional, BinaryIO, Union
from urllib.parse import urljoin, urlencode

from .types import (
    VerificationResult,
    InitializeResponse,
    DocumentType,
    ApiKey,
    Webhook,
    UsageStats,
    FileData,
)
from .exceptions import (
    IdswyftError,
    IdswyftAPIError,
    IdswyftAuthenticationError,
    IdswyftValidationError,
    IdswyftNetworkError,
    IdswyftRateLimitError,
    IdswyftNotFoundError,
    IdswyftServerError,
)


class IdswyftClient:
    """
    Official Python client for the Idswyft identity verification API (v2)

    The verification flow follows these steps:
        1. start_verification()          — Initialize session, get verification_id
        2. upload_front_document()       — Upload front of ID (OCR + quality gate)
        3. upload_back_document()        — Upload back of ID (barcode + cross-validation)
        4. upload_selfie()               — Upload selfie (liveness + face match → auto-finalize)
        5. get_verification_status()     — Check status at any point

    Args:
        api_key: Your Idswyft API key
        base_url: API base URL (default: https://api.idswyft.com)
        timeout: Request timeout in seconds (default: 30)
        sandbox: Whether to use sandbox environment (default: False)

    Example:
        >>> import idswyft
        >>> client = idswyft.IdswyftClient(api_key="your-api-key")
        >>> session = client.start_verification(user_id="user-123")
        >>> vid = session["verification_id"]
        >>> client.upload_front_document(vid, open("front.jpg", "rb"))
        >>> client.upload_back_document(vid, open("back.jpg", "rb"))
        >>> result = client.upload_selfie(vid, open("selfie.jpg", "rb"))
        >>> print(result["final_result"])  # 'verified', 'manual_review', or 'failed'
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.idswyft.com",
        timeout: int = 30,
        sandbox: bool = False,
    ):
        if not api_key:
            raise ValueError("API key is required")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.sandbox = sandbox

        # Initialize session with default headers
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "User-Agent": "idswyft-python/3.0.0",
            "X-SDK-Version": "3.0.0",
            "X-SDK-Language": "python",
        })

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API"""
        url = f"{self.base_url}{endpoint}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                data=data,
                json=json_data,
                files=files,
                params=params,
                timeout=self.timeout,
            )

            # Handle different response status codes
            if response.status_code in (200, 201):
                try:
                    return response.json()
                except json.JSONDecodeError:
                    return {"message": "Success"}

            # Handle error responses
            try:
                error_data = response.json()
            except json.JSONDecodeError:
                error_data = {"error": "Unknown error", "message": response.text}

            self._raise_for_status(response.status_code, error_data)

        except requests.exceptions.Timeout:
            raise IdswyftNetworkError(f"Request timed out after {self.timeout} seconds")
        except requests.exceptions.ConnectionError:
            raise IdswyftNetworkError("Failed to connect to Idswyft API")
        except requests.exceptions.RequestException as e:
            raise IdswyftNetworkError(f"Network error: {str(e)}")

    def _raise_for_status(self, status_code: int, error_data: Dict[str, Any]) -> None:
        """Raise appropriate exception based on status code"""
        message = error_data.get("message", "API request failed")
        error_code = error_data.get("code")
        details = error_data.get("details")

        if status_code == 400:
            raise IdswyftValidationError(
                message,
                field=error_data.get("field"),
                validation_errors=details if isinstance(details, list) else None
            )
        elif status_code == 401:
            raise IdswyftAuthenticationError(message)
        elif status_code == 404:
            resource = error_data.get("resource", "Resource")
            raise IdswyftNotFoundError(resource)
        elif status_code == 409:
            raise IdswyftAPIError(message, status_code, error_code, details)
        elif status_code == 429:
            retry_after = error_data.get("retry_after")
            raise IdswyftRateLimitError(message, retry_after)
        elif 500 <= status_code < 600:
            raise IdswyftServerError(message)
        else:
            raise IdswyftAPIError(message, status_code, error_code, details)

    def _prepare_file(self, file_data: FileData, field_name: str = "file") -> tuple:
        """Prepare file data for upload"""
        if isinstance(file_data, str):
            # File path
            with open(file_data, "rb") as f:
                return (field_name, f.read(), "application/octet-stream")
        elif isinstance(file_data, bytes):
            # Raw bytes
            return (field_name, file_data, "application/octet-stream")
        elif hasattr(file_data, "read"):
            # File-like object
            return (field_name, file_data.read(), "application/octet-stream")
        else:
            raise ValueError(f"Invalid file data type: {type(file_data)}")

    # ─── Verification Flow (v2 API) ──────────────────────

    def start_verification(
        self,
        user_id: str,
        document_type: Optional[str] = None,
        sandbox: Optional[bool] = None,
    ) -> InitializeResponse:
        """
        Step 1: Initialize a new verification session.

        Args:
            user_id: Unique identifier for the user
            document_type: Type of document ('passport', 'drivers_license', 'national_id')
            sandbox: Whether to use sandbox environment

        Returns:
            InitializeResponse with verification_id for subsequent steps
        """
        body = {"user_id": user_id}
        if document_type:
            body["document_type"] = document_type
        if sandbox is not None:
            body["sandbox"] = sandbox

        return self._make_request("POST", "/api/v2/verify/initialize", json_data=body)

    def upload_front_document(
        self,
        verification_id: str,
        document_file: FileData,
        document_type: str = "drivers_license",
    ) -> VerificationResult:
        """
        Step 2: Upload the front of the ID document.
        Triggers OCR extraction and Gate 1 (front quality check).

        Args:
            verification_id: Session ID from start_verification()
            document_file: Document image (file path, bytes, or file-like object)
            document_type: Type of document (default: 'drivers_license')

        Returns:
            VerificationResult with OCR data and quality gate outcome
        """
        file_tuple = self._prepare_file(document_file, "document")
        files = {"document": file_tuple}
        data = {"document_type": document_type}

        return self._make_request(
            "POST",
            f"/api/v2/verify/{verification_id}/front-document",
            data=data,
            files=files,
        )

    def upload_back_document(
        self,
        verification_id: str,
        document_file: FileData,
        document_type: str = "drivers_license",
    ) -> VerificationResult:
        """
        Step 3: Upload the back of the ID document.
        Triggers barcode extraction, Gate 2 (back quality), and Gate 3 (cross-validation).

        Args:
            verification_id: Session ID from start_verification()
            document_file: Back of ID image (file path, bytes, or file-like object)
            document_type: Type of document (default: 'drivers_license')

        Returns:
            VerificationResult with barcode data and cross-validation results
        """
        file_tuple = self._prepare_file(document_file, "document")
        files = {"document": file_tuple}
        data = {"document_type": document_type}

        return self._make_request(
            "POST",
            f"/api/v2/verify/{verification_id}/back-document",
            data=data,
            files=files,
        )

    def get_cross_validation(
        self,
        verification_id: str,
    ) -> VerificationResult:
        """
        Step 3.5 (optional): Retrieve cross-validation results.
        Cross-validation is auto-triggered after back document upload.
        Use this to query the cached result separately.

        Args:
            verification_id: Session ID from start_verification()

        Returns:
            VerificationResult with cross-validation details
        """
        return self._make_request(
            "POST",
            f"/api/v2/verify/{verification_id}/cross-validation",
        )

    def upload_selfie(
        self,
        verification_id: str,
        selfie_file: FileData,
    ) -> VerificationResult:
        """
        Step 4: Upload a selfie for liveness detection and face matching.
        Triggers Gate 4 (liveness) and Gate 5 (face match), then auto-finalizes.

        Args:
            verification_id: Session ID from start_verification()
            selfie_file: Selfie image (file path, bytes, or file-like object)

        Returns:
            VerificationResult with face match, liveness, and final_result
        """
        file_tuple = self._prepare_file(selfie_file, "selfie")
        files = {"selfie": file_tuple}

        return self._make_request(
            "POST",
            f"/api/v2/verify/{verification_id}/live-capture",
            files=files,
        )

    def get_verification_status(self, verification_id: str) -> VerificationResult:
        """
        Get the full status and results of a verification session.
        Can be called at any point to check progress.

        Args:
            verification_id: Session ID from start_verification()

        Returns:
            VerificationResult with comprehensive status and all collected data
        """
        return self._make_request(
            "GET",
            f"/api/v2/verify/{verification_id}/status",
        )

    # ─── Developer Management ────────────────────────────

    def register_developer(self, email: str, name: str) -> Dict[str, str]:
        """
        Register as a new developer

        Args:
            email: Developer email address
            name: Developer name

        Returns:
            Dictionary with developer_id and message
        """
        return self._make_request(
            "POST", "/api/developer/register",
            json_data={"email": email, "name": name},
        )

    def create_api_key(self, name: str, environment: str) -> Dict[str, str]:
        """
        Create a new API key

        Args:
            name: API key name/description
            environment: Environment ('sandbox' or 'production')

        Returns:
            Dictionary with api_key and key_id
        """
        return self._make_request(
            "POST", "/api/developer/api-key",
            json_data={"name": name, "environment": environment},
        )

    def list_api_keys(self) -> Dict[str, list]:
        """List all API keys"""
        return self._make_request("GET", "/api/developer/api-keys")

    def revoke_api_key(self, key_id: str) -> Dict[str, Any]:
        """Revoke/delete an API key"""
        return self._make_request("DELETE", f"/api/developer/api-key/{key_id}")

    def get_api_activity(
        self,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get API activity logs"""
        params = {}
        if limit:
            params["limit"] = str(limit)
        if offset:
            params["offset"] = str(offset)
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date

        return self._make_request("GET", "/api/developer/activity", params=params)

    def get_usage_stats(self) -> UsageStats:
        """Get developer usage statistics"""
        return self._make_request("GET", "/api/developer/stats")

    # ─── Webhook Management ──────────────────────────────

    def register_webhook(
        self,
        url: str,
        events: Optional[list] = None,
        secret: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a webhook URL"""
        body = {"url": url}
        if events:
            body["events"] = events
        if secret:
            body["secret"] = secret

        return self._make_request("POST", "/api/webhooks/register", json_data=body)

    def list_webhooks(self) -> Dict[str, list]:
        """List all webhooks"""
        return self._make_request("GET", "/api/webhooks")

    def update_webhook(
        self,
        webhook_id: str,
        url: Optional[str] = None,
        events: Optional[list] = None,
        secret: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update a webhook"""
        body = {}
        if url:
            body["url"] = url
        if events is not None:
            body["events"] = events
        if secret is not None:
            body["secret"] = secret

        return self._make_request("PUT", f"/api/webhooks/{webhook_id}", json_data=body)

    def delete_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook"""
        return self._make_request("DELETE", f"/api/webhooks/{webhook_id}")

    def test_webhook(self, webhook_id: str) -> Dict[str, Any]:
        """Test webhook delivery"""
        return self._make_request("POST", f"/api/webhooks/{webhook_id}/test")

    def get_webhook_deliveries(
        self,
        webhook_id: str,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Get webhook delivery history"""
        params = {}
        if limit:
            params["limit"] = str(limit)
        if offset:
            params["offset"] = str(offset)

        return self._make_request("GET", f"/api/webhooks/{webhook_id}/deliveries", params=params)

    # ─── Utilities ────────────────────────────────────────

    def health_check(self) -> Dict[str, str]:
        """Check API health status"""
        try:
            return self._make_request("GET", "/api/health")
        except IdswyftNotFoundError:
            return {"status": "ok", "timestamp": ""}

    @staticmethod
    def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
        """
        Verify webhook signature for security

        Args:
            payload: Raw webhook payload string
            signature: Signature from X-Idswyft-Signature header
            secret: Your webhook secret

        Returns:
            True if signature is valid, False otherwise
        """
        if not all([payload, signature, secret]):
            return False

        try:
            signature = signature.replace("sha256=", "")
            expected = hmac.new(
                secret.encode("utf-8"),
                payload.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()
            return hmac.compare_digest(expected, signature)
        except Exception:
            return False

    def __enter__(self):
        """Context manager entry"""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.session.close()

    def close(self):
        """Close the HTTP session"""
        self.session.close()
