import process from 'node:process';

const base = (process.env.IDSWYFT_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const apiKey = process.env.TESTAGRAM_IDSWYFT_API_KEY || '';
const webhookUrl = process.env.TESTAGRAM_WEBHOOK_URL || '';
const secret = process.env.TESTAGRAM_WEBHOOK_SECRET || '';

if (!apiKey || !webhookUrl || !secret) {
  throw new Error('TESTAGRAM_IDSWYFT_API_KEY, TESTAGRAM_WEBHOOK_URL and TESTAGRAM_WEBHOOK_SECRET are required');
}

const response = await fetch(base + '/api/webhooks/register', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl, is_sandbox: false, secret_token: secret }),
});
const body = await response.text();
if (!response.ok) throw new Error('Webhook registration failed: HTTP ' + response.status + ' ' + body);
console.log('GREEN Testagram webhook registered');
console.log(body);
