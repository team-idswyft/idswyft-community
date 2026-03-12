# Idswyft Python SDK

Official Python SDK for the [Idswyft](https://idswyft.app) identity verification platform.

## Installation

```bash
pip install idswyft
```

## Quick Start

```python
import idswyft

client = idswyft.IdswyftClient(
    api_key="your-api-key",
    sandbox=True
)

# Step 1: Initialize session
session = client.start_verification(user_id="user-123", document_type="drivers_license")
vid = session["verification_id"]

# Step 2: Upload front of ID (triggers OCR + quality gate)
front = client.upload_front_document(vid, "front.jpg")
print(f"OCR: {front.get('ocr_data')}")

# Step 3: Upload back of ID (triggers barcode + cross-validation)
back = client.upload_back_document(vid, "back.jpg")
print(f"Cross-validation: {back.get('cross_validation_results')}")

# Step 4: Upload selfie (triggers liveness + face match, auto-finalizes)
result = client.upload_selfie(vid, "selfie.jpg")
print(f"Result: {result['final_result']}")  # 'verified', 'manual_review', or 'failed'
```

## Authentication

Get your API key from the [Idswyft Developer Portal](https://idswyft.app/developer). Store it securely as an environment variable:

```bash
export IDSWYFT_API_KEY="your-api-key"
```

```python
import os
import idswyft

client = idswyft.IdswyftClient(api_key=os.getenv("IDSWYFT_API_KEY"))
```

## Configuration

```python
client = idswyft.IdswyftClient(
    api_key="your-api-key",             # Required: Your Idswyft API key
    base_url="https://api.idswyft.app", # Optional: API base URL
    timeout=30,                         # Optional: Request timeout in seconds (default: 30)
    sandbox=False                       # Optional: Use sandbox environment (default: False)
)
```

## Verification Flow (v2 API)

The SDK follows a step-based verification flow. Each step auto-triggers quality gates that validate the submission before proceeding.

```
1. start_verification()        -> Initialize session, get verification_id
2. upload_front_document()     -> Upload front of ID -> OCR + Gate 1 (quality)
3. upload_back_document()      -> Upload back of ID -> barcode + Gate 2-3 (quality + cross-validation)
4. upload_selfie()             -> Upload selfie -> Gate 4-5 (liveness + face match) -> auto-finalize
5. get_verification_status()   -> Check status at any point
```

If any gate fails, the session is hard-rejected and subsequent steps return a `409 Conflict` error.

### Step 1: Initialize Verification

```python
session = client.start_verification(
    user_id="user-123",                 # Required: Your internal user ID
    document_type="drivers_license",    # Optional: 'passport', 'drivers_license', 'national_id', 'other'
    sandbox=True,                       # Optional: Use sandbox environment
)

vid = session["verification_id"]        # Use this ID for all subsequent steps
print(session["status"])                # 'AWAITING_FRONT'
```

### Step 2: Upload Front Document

The front document upload accepts file paths, bytes, or file-like objects:

```python
# Using file path
front = client.upload_front_document(
    verification_id=vid,
    document_file="front.jpg",          # File path
    document_type="drivers_license",    # Default: 'drivers_license'
)

# Using file object
with open("front.jpg", "rb") as f:
    front = client.upload_front_document(vid, f)

# Using bytes
with open("front.jpg", "rb") as f:
    front = client.upload_front_document(vid, f.read())

# Response includes OCR extraction results
if front.get("ocr_data"):
    ocr = front["ocr_data"]
    print(f"Name: {ocr.get('full_name')}")
    print(f"DOB: {ocr.get('date_of_birth')}")
    print(f"ID Number: {ocr.get('id_number')}")

# If Gate 1 fails (poor quality), check rejection info
if front.get("rejection_reason"):
    print(f"Rejected: {front['rejection_reason']}")
    print(f"Detail: {front.get('rejection_detail')}")
```

### Step 3: Upload Back Document

```python
back = client.upload_back_document(vid, "back.jpg")

# Barcode/PDF417 extraction results
if back.get("barcode_data"):
    print(f"Barcode data: {back['barcode_data']}")

# Cross-validation results (front OCR vs back barcode)
if back.get("cross_validation_results"):
    cv = back["cross_validation_results"]
    print(f"Verdict: {cv['verdict']}")      # 'PASS' or 'REVIEW'
    print(f"Score: {cv['score']}")           # 0.0 - 1.0
    print(f"Match: {back['documents_match']}")  # boolean
```

### Step 3.5: Get Cross-Validation (Optional)

Cross-validation runs automatically after the back document upload. Use this to query the cached result separately:

```python
cv = client.get_cross_validation(vid)
print(f"Cross-validation: {cv.get('cross_validation_results')}")
```

### Step 4: Upload Selfie

This is the final step. It triggers liveness detection, face matching against the document photo, and auto-finalizes the verification.

```python
result = client.upload_selfie(vid, "selfie.jpg")

# Face match results
if result.get("face_match_results"):
    fm = result["face_match_results"]
    print(f"Face match passed: {fm['passed']}")
    print(f"Similarity score: {fm['score']}")

# Liveness results
if result.get("liveness_results"):
    lr = result["liveness_results"]
    print(f"Liveness passed: {lr['liveness_passed']}")

# Final verification outcome
print(f"Final result: {result.get('final_result')}")  # 'verified' | 'manual_review' | 'failed'
```

### Check Verification Status

Query the full status at any point during or after the flow:

```python
status = client.get_verification_status(vid)

print(f"Status: {status['status']}")                           # e.g. 'COMPLETE', 'AWAITING_BACK'
print(f"Step: {status.get('current_step')} / {status.get('total_steps')}")
print(f"Front uploaded: {status.get('front_document_uploaded')}")
print(f"Back uploaded: {status.get('back_document_uploaded')}")
print(f"Selfie uploaded: {status.get('live_capture_uploaded')}")
print(f"Final result: {status.get('final_result')}")
```

## Verification Statuses

| Status | Description |
|--------|-------------|
| `AWAITING_FRONT` | Waiting for front document upload |
| `FRONT_PROCESSING` | Processing front document (OCR + quality) |
| `AWAITING_BACK` | Waiting for back document upload |
| `BACK_PROCESSING` | Processing back document (barcode + cross-validation) |
| `CROSS_VALIDATING` | Running cross-validation between front and back |
| `AWAITING_LIVE` | Waiting for selfie upload |
| `LIVE_PROCESSING` | Processing selfie (liveness + face match) |
| `FACE_MATCHING` | Running face match comparison |
| `COMPLETE` | Verification complete |
| `HARD_REJECTED` | Session rejected by a quality gate |

## Developer Management

### API Keys

```python
# Create a new API key
key = client.create_api_key(name="Production Key", environment="production")
print(f"API Key: {key['api_key']}")
print(f"Key ID: {key['key_id']}")

# List all API keys
keys = client.list_api_keys()
for k in keys.get("api_keys", []):
    print(f"  {k['name']} ({k['environment']}) - Active: {k['is_active']}")

# Revoke an API key
client.revoke_api_key("key-id")
```

### Usage Statistics

```python
stats = client.get_usage_stats()
print(f"Success rate: {stats['success_rate']}")
print(f"Monthly usage: {stats['monthly_usage']}/{stats['monthly_limit']}")
print(f"Remaining quota: {stats['remaining_quota']}")
```

### API Activity

```python
activity = client.get_api_activity(
    limit=50,
    offset=0,
    start_date="2024-01-01",
    end_date="2024-12-31"
)
print(f"Total activities: {activity.get('total', 0)}")
```

## Webhook Management

```python
# Register a webhook
webhook = client.register_webhook(
    url="https://yourapp.com/webhook",
    events=["verification.completed", "verification.failed"],
    secret="your-webhook-secret"
)

# List all webhooks
webhooks = client.list_webhooks()

# Update a webhook
client.update_webhook("webhook-id", events=["verification.completed"])

# Test webhook delivery
client.test_webhook("webhook-id")

# Get delivery history
deliveries = client.get_webhook_deliveries("webhook-id", limit=20)

# Delete a webhook
client.delete_webhook("webhook-id")
```

## Webhook Signature Verification

Secure your webhook endpoints by verifying the signature:

```python
from flask import Flask, request
import idswyft

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    payload = request.get_data(as_text=True)
    signature = request.headers.get('X-Idswyft-Signature')
    secret = 'your-webhook-secret'

    if idswyft.IdswyftClient.verify_webhook_signature(payload, signature, secret):
        data = request.get_json()
        print(f"Event: {data['event_type']}")
        print(f"Verification: {data['verification_id']}")
        print(f"Status: {data['status']}")
        return 'OK', 200
    else:
        return 'Unauthorized', 401
```

## Error Handling

The SDK raises specific exceptions for different error types:

```python
from idswyft import (
    IdswyftError,
    IdswyftAPIError,
    IdswyftAuthenticationError,
    IdswyftValidationError,
    IdswyftNetworkError,
    IdswyftRateLimitError,
)

try:
    result = client.upload_front_document(vid, "front.jpg")
except IdswyftAuthenticationError:
    print("Check your API key")
except IdswyftValidationError as e:
    print(f"Validation error: {e.message}")
    if hasattr(e, 'validation_errors') and e.validation_errors:
        for err in e.validation_errors:
            print(f"  - {err}")
except IdswyftRateLimitError as e:
    print(f"Rate limit exceeded. Retry after: {e.retry_after}s")
except IdswyftNetworkError:
    print("Network error - check your connection")
except IdswyftAPIError as e:
    print(f"API Error {e.status_code}: {e.message}")
    if e.status_code == 409:
        print("Session was hard-rejected by a quality gate")
except IdswyftError as e:
    print(f"Error: {e}")
```

## Examples

### Django Integration

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
import idswyft

client = idswyft.IdswyftClient(api_key=settings.IDSWYFT_API_KEY)

@csrf_exempt
@require_http_methods(["POST"])
def start_verification(request):
    try:
        session = client.start_verification(
            user_id=str(request.user.id),
            document_type=request.POST.get("document_type", "drivers_license")
        )
        return JsonResponse(session)
    except idswyft.IdswyftError as e:
        return JsonResponse({"error": str(e)}, status=400)

@csrf_exempt
@require_http_methods(["POST"])
def upload_front(request, vid):
    try:
        doc = request.FILES["document"]
        result = client.upload_front_document(
            verification_id=vid,
            document_file=doc.read(),
            document_type=request.POST.get("document_type", "drivers_license")
        )
        return JsonResponse(result)
    except idswyft.IdswyftError as e:
        return JsonResponse({"error": str(e)}, status=400)
```

### FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, File, HTTPException
import idswyft

app = FastAPI()
client = idswyft.IdswyftClient(api_key="your-api-key")

@app.post("/verify/start")
async def start_verification(user_id: str, document_type: str = "drivers_license"):
    try:
        return client.start_verification(user_id=user_id, document_type=document_type)
    except idswyft.IdswyftError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/verify/{vid}/front")
async def upload_front(vid: str, document: UploadFile = File(...)):
    try:
        content = await document.read()
        return client.upload_front_document(vid, content)
    except idswyft.IdswyftError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/verify/{vid}/selfie")
async def upload_selfie(vid: str, selfie: UploadFile = File(...)):
    try:
        content = await selfie.read()
        return client.upload_selfie(vid, content)
    except idswyft.IdswyftError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### Context Manager

```python
import idswyft

# Automatically closes the HTTP session when done
with idswyft.IdswyftClient(api_key="your-api-key") as client:
    session = client.start_verification(user_id="user-123")
    vid = session["verification_id"]

    front = client.upload_front_document(vid, "front.jpg")
    back = client.upload_back_document(vid, "back.jpg")
    result = client.upload_selfie(vid, "selfie.jpg")
    print(result["final_result"])
# Session is automatically closed here
```

### Polling for Status

```python
import time
import idswyft

client = idswyft.IdswyftClient(api_key="your-api-key")

def wait_for_completion(vid, max_attempts=30, interval=2):
    """Poll verification status until complete."""
    terminal_statuses = {"COMPLETE", "HARD_REJECTED"}

    for attempt in range(1, max_attempts + 1):
        status = client.get_verification_status(vid)
        current = status["status"]
        print(f"Attempt {attempt}: {current}")

        if current in terminal_statuses:
            return status

        time.sleep(interval)

    raise TimeoutError("Verification did not complete in time")
```

## Type Hints

The SDK includes comprehensive type hints for IDE support:

```python
from idswyft import (
    IdswyftClient,
    VerificationResult,
    InitializeResponse,
    UsageStats,
    VerificationStatus,
    DocumentType,
    OCRData,
    CrossValidationResults,
    FaceMatchResults,
    LivenessResults,
)
```

## Support

- [Documentation](https://idswyft.app/doc)
- [Issue Tracker](https://github.com/doobee46/idswyft/issues)
- [Support](mailto:support@idswyft.app)

## License

MIT License - see [LICENSE](LICENSE) file for details.
