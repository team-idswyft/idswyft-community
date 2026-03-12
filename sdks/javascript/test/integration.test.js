/**
 * Integration tests for Idswyft JavaScript SDK (v3 — v2 API)
 * Tests against actual running API server
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Import the SDK (assuming it's built)
const { IdswyftSDK, IdswyftError } = require('../dist/index.js');

// Test configuration
const API_BASE_URL = 'http://localhost:3001';
const TEST_API_KEY = 'test-api-key-12345';

// Create test client
const client = new IdswyftSDK({
  apiKey: TEST_API_KEY,
  baseURL: API_BASE_URL,
  sandbox: true,
});

// Helper function to create a test image file
function createTestImageBuffer() {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x64,
    0x00, 0x00, 0x00, 0x64,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x4c, 0x5c, 0x6d, 0x7e,
  ]);
  const idatChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x0c,
    0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x62, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4,
  ]);
  const iendChunk = Buffer.from([
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

async function testHealthCheck() {
  console.log('\n=== Testing Health Check ===');
  try {
    const result = await client.healthCheck();
    console.log('  Health check passed:', result);
    return true;
  } catch (error) {
    console.error('  Health check failed:', error.message);
    return false;
  }
}

async function testVerificationFlow() {
  console.log('\n=== Testing V2 Verification Flow ===');
  try {
    const testImage = createTestImageBuffer();

    // Step 1: Initialize
    console.log('Step 1: Initializing verification session...');
    const session = await client.startVerification({
      user_id: 'test-user-123',
      document_type: 'drivers_license',
    });

    console.log('  Session created:', session.verification_id);
    console.log('  Status:', session.status);
    const vid = session.verification_id;

    // Step 2: Upload front
    console.log('\nStep 2: Uploading front document...');
    const frontResult = await client.uploadFrontDocument(vid, testImage, 'drivers_license');
    console.log('  Status:', frontResult.status);
    if (frontResult.ocr_data) {
      console.log('  OCR data received');
    }

    // Step 3: Upload back
    console.log('\nStep 3: Uploading back document...');
    const backResult = await client.uploadBackDocument(vid, testImage, 'drivers_license');
    console.log('  Status:', backResult.status);
    if (backResult.documents_match != null) {
      console.log('  Documents match:', backResult.documents_match);
    }

    // Step 3.5: Cross-validation
    console.log('\nStep 3.5: Checking cross-validation...');
    const cvResult = await client.getCrossValidation(vid);
    console.log('  Status:', cvResult.status);

    // Step 4: Upload selfie
    console.log('\nStep 4: Uploading selfie...');
    const selfieResult = await client.uploadSelfie(vid, testImage);
    console.log('  Status:', selfieResult.status);
    if (selfieResult.final_result) {
      console.log('  Final result:', selfieResult.final_result);
    }

    // Step 5: Get status
    console.log('\nStep 5: Getting verification status...');
    const status = await client.getVerificationStatus(vid);
    console.log('  Status:', status.status);
    console.log('  Step:', status.current_step, '/', status.total_steps);

    return { session, frontResult, backResult, selfieResult, status };
  } catch (error) {
    console.error('  Verification flow failed:', error.message);
    if (error instanceof IdswyftError) {
      console.error('  Status Code:', error.statusCode);
    }
    return null;
  }
}

async function testDeveloperManagement() {
  console.log('\n=== Testing Developer Management ===');
  try {
    console.log('Creating new API key...');
    const apiKeyResult = await client.createApiKey({
      name: 'Test SDK Key',
      environment: 'sandbox',
    });
    console.log('  API key created:', apiKeyResult.key_id);

    console.log('Listing API keys...');
    const apiKeysList = await client.listApiKeys();
    console.log('  Total keys:', apiKeysList.api_keys.length);

    console.log('Getting API activity...');
    const activityResult = await client.getApiActivity({ limit: 5 });
    console.log('  Total activities:', activityResult.total);

    return true;
  } catch (error) {
    console.error('  Developer management failed:', error.message);
    return false;
  }
}

async function testWebhookManagement() {
  console.log('\n=== Testing Webhook Management ===');
  try {
    console.log('Registering webhook...');
    const webhookResult = await client.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['verification.completed', 'verification.failed'],
      secret: 'test-webhook-secret',
    });
    console.log('  Webhook registered:', webhookResult.webhook.id);

    console.log('Listing webhooks...');
    const webhooksList = await client.listWebhooks();
    console.log('  Total webhooks:', webhooksList.webhooks.length);

    return true;
  } catch (error) {
    console.error('  Webhook management failed:', error.message);
    return false;
  }
}

async function testUsageStats() {
  console.log('\n=== Testing Usage Statistics ===');
  try {
    const result = await client.getUsageStats();
    console.log('  Total requests:', result.total_requests);
    console.log('  Success rate:', result.success_rate);
    return true;
  } catch (error) {
    console.error('  Usage stats failed:', error.message);
    return false;
  }
}

async function testWebhookSignatureVerification() {
  console.log('\n=== Testing Webhook Signature Verification ===');
  const crypto = require('crypto');
  const payload = '{"verification_id":"test-123","status":"COMPLETE"}';
  const secret = 'test-webhook-secret';

  const validSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const isValid = IdswyftSDK.verifyWebhookSignature(payload, validSignature, secret);
  console.log('  Valid signature:', isValid ? 'accepted' : 'rejected');

  const isInvalid = IdswyftSDK.verifyWebhookSignature(payload, 'invalid', secret);
  console.log('  Invalid signature:', !isInvalid ? 'rejected' : 'accepted');

  return isValid && !isInvalid;
}

async function runAllTests() {
  console.log('Idswyft JavaScript SDK v3 Integration Tests');
  console.log('='.repeat(50));

  const results = {
    healthCheck: false,
    verificationFlow: false,
    developerManagement: false,
    webhookManagement: false,
    usageStats: false,
    webhookVerification: false,
  };

  try {
    results.healthCheck = await testHealthCheck();
    const flowResult = await testVerificationFlow();
    results.verificationFlow = flowResult != null;
    results.developerManagement = await testDeveloperManagement();
    results.webhookManagement = await testWebhookManagement();
    results.usageStats = await testUsageStats();
    results.webhookVerification = await testWebhookSignatureVerification();
  } catch (error) {
    console.error('Unexpected error during testing:', error);
  }

  // Summary
  console.log('\nTest Results Summary');
  console.log('='.repeat(30));

  const testNames = {
    healthCheck: 'Health Check',
    verificationFlow: 'V2 Verification Flow (5 steps)',
    developerManagement: 'Developer Management',
    webhookManagement: 'Webhook Management',
    usageStats: 'Usage Statistics',
    webhookVerification: 'Webhook Signature Verification',
  };

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${testNames[test]}`);
  });

  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  console.log(`\nOverall: ${passedCount}/${totalCount} tests passed`);

  return passedCount === totalCount;
}

if (require.main === module) {
  runAllTests()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, testHealthCheck, testVerificationFlow, testUsageStats };
