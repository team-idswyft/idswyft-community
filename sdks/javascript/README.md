# Idswyft JavaScript/Node.js SDK

Official JavaScript/Node.js SDK for the [Idswyft](https://idswyft.app) identity verification platform.

## Installation

```bash
npm install @idswyft/sdk
# or
yarn add @idswyft/sdk
```

## Quick Start

```javascript
import { IdswyftSDK } from '@idswyft/sdk';

const idswyft = new IdswyftSDK({
  apiKey: process.env.IDSWYFT_API_KEY,
  sandbox: true
});

// Step 1: Initialize session
const session = await idswyft.startVerification({
  user_id: 'user-123',
  document_type: 'drivers_license',
});
const vid = session.verification_id;

// Step 2: Upload front of ID (triggers OCR + quality gate)
const front = await idswyft.uploadFrontDocument(vid, frontImageBuffer);
console.log('OCR data:', front.ocr_data);

// Step 3: Upload back of ID (triggers barcode + cross-validation)
const back = await idswyft.uploadBackDocument(vid, backImageBuffer);
console.log('Cross-validation:', back.cross_validation_results);

// Step 4: Upload selfie (triggers liveness + face match, auto-finalizes)
const result = await idswyft.uploadSelfie(vid, selfieBuffer);
console.log('Final result:', result.final_result); // 'verified', 'manual_review', or 'failed'
```

## Authentication

Get your API key from the [Idswyft Developer Portal](https://idswyft.app/developer). Store it securely as an environment variable:

```bash
export IDSWYFT_API_KEY="your-api-key"
```

```javascript
const idswyft = new IdswyftSDK({
  apiKey: process.env.IDSWYFT_API_KEY
});
```

## Configuration

```javascript
const idswyft = new IdswyftSDK({
  apiKey: 'your-api-key',             // Required: Your Idswyft API key
  baseURL: 'https://api.idswyft.app', // Optional: API base URL
  timeout: 30000,                     // Optional: Request timeout in ms (default: 30000)
  sandbox: false                      // Optional: Use sandbox environment (default: false)
});
```

## Verification Flow (v2 API)

The SDK follows a step-based verification flow. Each step auto-triggers quality gates that validate the submission before proceeding.

```
1. startVerification()       -> Initialize session, get verification_id
2. uploadFrontDocument()     -> Upload front of ID -> OCR + Gate 1 (quality)
3. uploadBackDocument()      -> Upload back of ID -> barcode + Gate 2-3 (quality + cross-validation)
4. uploadSelfie()            -> Upload selfie -> Gate 4-5 (liveness + face match) -> auto-finalize
5. getVerificationStatus()   -> Check status at any point
```

If any gate fails, the session is hard-rejected and subsequent steps return a `409 Conflict` error.

### Step 1: Initialize Verification

```javascript
const session = await idswyft.startVerification({
  user_id: 'user-123',                   // Required: Your internal user ID
  document_type: 'drivers_license',      // Optional: 'passport' | 'drivers_license' | 'national_id' | 'other'
  sandbox: true,                         // Optional: Use sandbox environment
});

console.log(session.verification_id);    // Use this ID for all subsequent steps
console.log(session.status);             // 'AWAITING_FRONT'
```

### Step 2: Upload Front Document

```javascript
const front = await idswyft.uploadFrontDocument(
  verificationId,                        // Session ID from Step 1
  documentFile,                          // File object (browser) or Buffer (Node.js)
  'drivers_license'                      // Document type (default: 'drivers_license')
);

// Response includes OCR extraction results
if (front.ocr_data) {
  console.log('Name:', front.ocr_data.full_name);
  console.log('DOB:', front.ocr_data.date_of_birth);
  console.log('ID Number:', front.ocr_data.id_number);
}

// If Gate 1 fails (poor quality), check rejection info
if (front.rejection_reason) {
  console.log('Rejected:', front.rejection_reason);
  console.log('Detail:', front.rejection_detail);
}
```

### Step 3: Upload Back Document

```javascript
const back = await idswyft.uploadBackDocument(
  verificationId,
  backImageFile,
  'drivers_license'
);

// Barcode/PDF417 extraction results
if (back.barcode_data) {
  console.log('Barcode data:', back.barcode_data);
}

// Cross-validation results (front OCR vs back barcode)
if (back.cross_validation_results) {
  console.log('Verdict:', back.cross_validation_results.verdict);   // 'PASS' or 'REVIEW'
  console.log('Score:', back.cross_validation_results.score);       // 0.0 - 1.0
  console.log('Match:', back.documents_match);                      // boolean
}
```

### Step 3.5: Get Cross-Validation (Optional)

Cross-validation runs automatically after the back document upload. Use this to query the cached result separately:

```javascript
const cv = await idswyft.getCrossValidation(verificationId);
console.log('Cross-validation:', cv.cross_validation_results);
```

### Step 4: Upload Selfie

This is the final step. It triggers liveness detection, face matching against the document photo, and auto-finalizes the verification.

```javascript
const result = await idswyft.uploadSelfie(verificationId, selfieFile);

// Face match results
if (result.face_match_results) {
  console.log('Face match passed:', result.face_match_results.passed);
  console.log('Similarity score:', result.face_match_results.score);
}

// Liveness results
if (result.liveness_results) {
  console.log('Liveness passed:', result.liveness_results.liveness_passed);
}

// Final verification outcome
console.log('Final result:', result.final_result); // 'verified' | 'manual_review' | 'failed'
```

### Check Verification Status

Query the full status at any point during or after the flow:

```javascript
const status = await idswyft.getVerificationStatus(verificationId);

console.log('Status:', status.status);                    // e.g. 'COMPLETE', 'AWAITING_BACK'
console.log('Step:', status.current_step, '/', status.total_steps);
console.log('Front uploaded:', status.front_document_uploaded);
console.log('Back uploaded:', status.back_document_uploaded);
console.log('Selfie uploaded:', status.live_capture_uploaded);
console.log('Final result:', status.final_result);
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

```javascript
// Create a new API key
const key = await idswyft.createApiKey({
  name: 'Production Key',
  environment: 'production'  // 'sandbox' | 'production'
});
console.log('API Key:', key.api_key);

// List all API keys
const keys = await idswyft.listApiKeys();
console.log('Keys:', keys.api_keys);

// Revoke an API key
await idswyft.revokeApiKey('key-id');
```

### Usage Statistics

```javascript
const stats = await idswyft.getUsageStats();
console.log('Success rate:', stats.success_rate);
console.log('Monthly usage:', stats.monthly_usage, '/', stats.monthly_limit);
console.log('Remaining quota:', stats.remaining_quota);
```

### API Activity

```javascript
const activity = await idswyft.getApiActivity({
  limit: 50,
  offset: 0,
  start_date: '2024-01-01',
  end_date: '2024-12-31'
});
console.log('Activities:', activity.activities);
```

## Webhook Management

```javascript
// Register a webhook
const webhook = await idswyft.registerWebhook({
  url: 'https://yourapp.com/webhook',
  events: ['verification.completed', 'verification.failed'],
  secret: 'your-webhook-secret'
});

// List all webhooks
const webhooks = await idswyft.listWebhooks();

// Update a webhook
await idswyft.updateWebhook('webhook-id', {
  events: ['verification.completed']
});

// Test webhook delivery
await idswyft.testWebhook('webhook-id');

// Get delivery history
const deliveries = await idswyft.getWebhookDeliveries('webhook-id', {
  limit: 20
});

// Delete a webhook
await idswyft.deleteWebhook('webhook-id');
```

## Webhook Signature Verification

Secure your webhook endpoints by verifying the signature:

```javascript
import { IdswyftSDK } from '@idswyft/sdk';

app.post('/webhook', (req, res) => {
  const payload = JSON.stringify(req.body);
  const signature = req.headers['x-idswyft-signature'];
  const secret = 'your-webhook-secret';

  if (IdswyftSDK.verifyWebhookSignature(payload, signature, secret)) {
    const data = req.body;
    console.log('Event:', data.event_type);
    console.log('Verification:', data.verification_id);
    console.log('Status:', data.status);
    res.sendStatus(200);
  } else {
    res.sendStatus(401);
  }
});
```

## Error Handling

The SDK throws `IdswyftError` for all API errors:

```javascript
import { IdswyftError } from '@idswyft/sdk';

try {
  const result = await idswyft.uploadFrontDocument(vid, file);
} catch (error) {
  if (error instanceof IdswyftError) {
    console.error('API Error:', error.message);
    console.error('Status Code:', error.statusCode);
    console.error('Error Code:', error.code);
    console.error('Details:', error.details);

    // Handle specific error codes
    switch (error.statusCode) {
      case 400: // Validation error
        console.error('Check your request parameters');
        break;
      case 401: // Authentication error
        console.error('Check your API key');
        break;
      case 404: // Not found
        console.error('Verification session not found');
        break;
      case 409: // Conflict (session already rejected)
        console.error('Session was hard-rejected by a quality gate');
        break;
      case 429: // Rate limit
        console.error('Rate limit exceeded');
        break;
    }
  }
}
```

## Examples

### Node.js with Express

```javascript
import express from 'express';
import multer from 'multer';
import { IdswyftSDK } from '@idswyft/sdk';

const app = express();
const upload = multer();
const idswyft = new IdswyftSDK({ apiKey: process.env.IDSWYFT_API_KEY });

// Initialize verification
app.post('/verify/start', async (req, res) => {
  try {
    const session = await idswyft.startVerification({
      user_id: req.body.user_id,
      document_type: req.body.document_type,
    });
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload front document
app.post('/verify/:vid/front', upload.single('document'), async (req, res) => {
  try {
    const result = await idswyft.uploadFrontDocument(
      req.params.vid,
      req.file.buffer,
      req.body.document_type
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload back document
app.post('/verify/:vid/back', upload.single('document'), async (req, res) => {
  try {
    const result = await idswyft.uploadBackDocument(
      req.params.vid,
      req.file.buffer,
      req.body.document_type
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload selfie
app.post('/verify/:vid/selfie', upload.single('selfie'), async (req, res) => {
  try {
    const result = await idswyft.uploadSelfie(req.params.vid, req.file.buffer);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## TypeScript Support

The SDK is written in TypeScript and exports all types:

```typescript
import {
  IdswyftSDK,
  IdswyftConfig,
  IdswyftError,
  // Verification types
  InitializeResponse,
  VerificationResult,
  VerificationStatus,
  DocumentType,
  OCRData,
  CrossValidationResults,
  FaceMatchResults,
  LivenessResults,
  // Developer types
  ApiKey,
  CreateApiKeyRequest,
  Webhook,
  CreateWebhookRequest,
} from '@idswyft/sdk';
```

## Support

- [Documentation](https://idswyft.app/doc)
- [Issue Tracker](https://github.com/doobee46/idswyft/issues)
- [Support](mailto:support@idswyft.app)

## License

MIT License - see [LICENSE](LICENSE) file for details.
