# Idswyft SDKs

This directory contains the official SDKs for the [Idswyft](https://idswyft.app) identity verification platform.

## Available SDKs

### JavaScript/Node.js SDK
**Location**: `./javascript/`
**Package**: `@idswyft/sdk`
**Language**: TypeScript/JavaScript
**Node.js**: 16+

**Installation:**
```bash
npm install @idswyft/sdk
```

**Quick Start:**
```javascript
import { IdswyftSDK } from '@idswyft/sdk';

const client = new IdswyftSDK({
  apiKey: process.env.IDSWYFT_API_KEY,
  sandbox: true
});

// Step 1: Initialize session
const session = await client.startVerification({
  user_id: 'user-123',
  document_type: 'drivers_license',
});

const vid = session.verification_id;

// Step 2: Upload front of ID
const front = await client.uploadFrontDocument(vid, frontImageBuffer);
console.log('OCR data:', front.ocr_data);

// Step 3: Upload back of ID
const back = await client.uploadBackDocument(vid, backImageBuffer);
console.log('Cross-validation:', back.cross_validation_results);

// Step 4: Upload selfie (auto-finalizes)
const result = await client.uploadSelfie(vid, selfieBuffer);
console.log('Final result:', result.final_result); // 'verified', 'manual_review', or 'failed'
```

### Python SDK
**Location**: `./python/`
**Package**: `idswyft`
**Language**: Python
**Version**: 3.8+

**Installation:**
```bash
pip install idswyft
```

**Quick Start:**
```python
import idswyft

client = idswyft.IdswyftClient(
    api_key="your-api-key",
    sandbox=True
)

# Step 1: Initialize session
session = client.start_verification(user_id="user-123", document_type="drivers_license")
vid = session["verification_id"]

# Step 2: Upload front of ID
front = client.upload_front_document(vid, "front.jpg")
print(f"OCR: {front.get('ocr_data')}")

# Step 3: Upload back of ID
back = client.upload_back_document(vid, "back.jpg")
print(f"Cross-validation: {back.get('cross_validation_results')}")

# Step 4: Upload selfie (auto-finalizes)
result = client.upload_selfie(vid, "selfie.jpg")
print(f"Result: {result['final_result']}")  # 'verified', 'manual_review', or 'failed'
```

## Verification Flow (v2 API)

Both SDKs follow the same step-based verification flow:

```
1. startVerification()       → Initialize session, get verification_id
2. uploadFrontDocument()     → Upload front of ID → OCR + quality gate
3. uploadBackDocument()      → Upload back of ID → barcode + cross-validation
4. uploadSelfie()            → Upload selfie → liveness + face match → auto-finalize
5. getVerificationStatus()   → Check status at any point
```

Each step auto-triggers quality gates:
- **Gate 1**: Front document quality (blur, resolution, contrast)
- **Gate 2**: Back document quality
- **Gate 3**: Cross-validation (front OCR vs back barcode)
- **Gate 4**: Liveness detection
- **Gate 5**: Face matching (selfie vs document photo)

If any gate fails, the session is hard-rejected and subsequent steps return 409.

## Features

### Document Verification
- Support for passports, driver's licenses, national IDs
- Real-time OCR text extraction
- Barcode/PDF417 scanning for ID back
- Cross-validation between front and back data

### Selfie Verification
- Liveness detection
- Face matching against document photos
- Anti-spoofing measures

### Developer Tools
- Usage statistics and quota monitoring
- Webhook signature verification for security
- Comprehensive error handling with specific error types
- Full TypeScript definitions (JavaScript SDK)
- Complete type hints (Python SDK)

### Enterprise Features
- API key management
- Rate limiting and abuse protection
- Sandbox environment for testing
- GDPR/CCPA compliant data handling

## Authentication

Both SDKs use API keys for authentication:

1. Register at [Idswyft Developer Portal](https://idswyft.app/developer)
2. Get your API key
3. Store securely as environment variable:

```bash
export IDSWYFT_API_KEY="your-api-key"
```

## Testing

**JavaScript:**
```bash
cd javascript/
npm test
```

**Python:**
```bash
cd python/
python -m pytest
```

## Documentation

- **JavaScript SDK**: [`./javascript/README.md`](./javascript/README.md)
- **Python SDK**: [`./python/README.md`](./python/README.md)
- **API Documentation**: [https://idswyft.app/doc](https://idswyft.app/doc)

## License

Both SDKs are released under the MIT License. See individual LICENSE files in each SDK directory.
