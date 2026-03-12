"""
Type definitions for the Idswyft SDK (v3 — matches backend v2 API)
"""

from typing import Dict, Any, Optional, Literal, Union, BinaryIO
from datetime import datetime
import sys

if sys.version_info >= (3, 8):
    from typing import TypedDict
else:
    from typing_extensions import TypedDict

# Type aliases
DocumentType = Literal["passport", "drivers_license", "national_id", "other"]
VerificationStatus = Literal[
    "AWAITING_FRONT", "FRONT_PROCESSING",
    "AWAITING_BACK", "BACK_PROCESSING",
    "CROSS_VALIDATING",
    "AWAITING_LIVE", "LIVE_PROCESSING",
    "FACE_MATCHING", "COMPLETE", "HARD_REJECTED",
]
FinalResult = Literal["verified", "manual_review", "failed"]
Environment = Literal["sandbox", "production"]
FileData = Union[str, bytes, BinaryIO]


class OCRData(TypedDict, total=False):
    """OCR extraction results from document analysis"""
    full_name: Optional[str]
    name: Optional[str]
    date_of_birth: Optional[str]
    id_number: Optional[str]
    document_number: Optional[str]
    expiry_date: Optional[str]
    expiration_date: Optional[str]
    nationality: Optional[str]
    address: Optional[str]
    issuing_authority: Optional[str]
    raw_text: Optional[str]
    confidence_scores: Optional[Dict[str, float]]


class CrossValidationResults(TypedDict, total=False):
    """Cross-validation results between front and back of ID"""
    verdict: Literal["PASS", "REVIEW"]
    has_critical_failure: bool
    score: float
    failures: list[str]


class FaceMatchResults(TypedDict, total=False):
    """Face matching results"""
    passed: bool
    score: float
    distance: float


class LivenessResults(TypedDict, total=False):
    """Liveness detection results"""
    liveness_passed: bool
    liveness_score: float


class InitializeResponse(TypedDict, total=False):
    """Response from the initialize endpoint"""
    success: bool
    verification_id: str
    status: VerificationStatus
    current_step: int
    total_steps: int
    message: str


class VerificationResult(TypedDict, total=False):
    """Result from any verification step or status query"""
    success: bool
    verification_id: str
    status: VerificationStatus
    current_step: int
    total_steps: int
    message: str
    # Front document fields
    document_id: Optional[str]
    document_path: Optional[str]
    ocr_data: Optional[OCRData]
    # Back document fields
    barcode_data: Optional[Dict[str, Any]]
    barcode_extraction_failed: Optional[bool]
    documents_match: Optional[bool]
    cross_validation_results: Optional[CrossValidationResults]
    # Live capture fields
    selfie_id: Optional[str]
    selfie_path: Optional[str]
    face_match_results: Optional[FaceMatchResults]
    liveness_results: Optional[LivenessResults]
    # Final decision
    final_result: Optional[FinalResult]
    # Rejection/failure info
    rejection_reason: Optional[str]
    rejection_detail: Optional[str]
    failure_reason: Optional[str]
    manual_review_reason: Optional[str]
    # Status endpoint extras
    front_document_uploaded: Optional[bool]
    back_document_uploaded: Optional[bool]
    live_capture_uploaded: Optional[bool]
    face_match_passed: Optional[bool]
    liveness_passed: Optional[bool]
    created_at: Optional[str]
    updated_at: Optional[str]


# ─── Developer & Webhook Types ──────────────────────────

class ApiKey(TypedDict):
    """API key information"""
    id: str
    name: str
    key_prefix: str
    environment: Environment
    is_active: bool
    created_at: str
    last_used_at: Optional[str]
    monthly_requests: Optional[int]


class CreateApiKeyRequest(TypedDict):
    """Request parameters for creating API key"""
    name: str
    environment: Environment


class Webhook(TypedDict):
    """Webhook information"""
    id: str
    url: str
    events: list[str]
    is_active: bool
    created_at: str
    last_delivery_at: Optional[str]
    secret: Optional[str]


class CreateWebhookRequest(TypedDict, total=False):
    """Request parameters for creating webhook"""
    url: str
    events: Optional[list[str]]
    secret: Optional[str]


class UsageStats(TypedDict):
    """Developer usage statistics"""
    period: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    pending_requests: int
    manual_review_requests: int
    success_rate: str
    monthly_limit: int
    monthly_usage: int
    remaining_quota: int
    quota_reset_date: str


class ListVerificationsResponse(TypedDict):
    """Response from list verifications endpoint"""
    verifications: list[VerificationResult]
    total: int
    limit: int
    offset: int


class WebhookEvent(TypedDict, total=False):
    """Webhook event payload"""
    event_type: str
    verification_id: str
    status: VerificationStatus
    confidence_score: Optional[float]
    user_id: Optional[str]
    timestamp: str
    metadata: Optional[Dict[str, Any]]
