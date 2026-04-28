# Service-key minting — curl recipe

> **Cloud-only.** This file is in `.community-ignore` and never ships to the public mirror. The endpoints described here only exist when `IDSWYFT_EDITION=cloud` is set on the backend.

Service keys (`isk_*`) let internal Idswyft products call the verification API without hitting customer-facing rate limits, quotas, or plan gates. The minting UI lives in `idswyft-vaas/platform-admin/` (separate repo, deferred until vaas deploys). Until then, this is the operating procedure.

## Prerequisites

- The Idswyft backend must be running with `IDSWYFT_EDITION=cloud` set.
- You must hold the `IDSWYFT_PLATFORM_SERVICE_TOKEN` (32-byte random hex), set in the platform 1Password vault under "Idswyft / Platform Service Token". This token is set as a Railway env var on production + staging.
- Replace `https://api.idswyft.app` with the staging URL when testing against staging.

```bash
export IDSWYFT_PLATFORM_SERVICE_TOKEN="<paste from 1Password>"
export IDSWYFT_API_BASE="https://api.idswyft.app"
```

## Mint a new service key

```bash
curl -X POST "${IDSWYFT_API_BASE}/api/platform/api-keys/service" \
  -H "X-Platform-Service-Token: ${IDSWYFT_PLATFORM_SERVICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "service_product": "gatepass",
    "service_environment": "production",
    "label": "GatePass production"
  }'
```

**Valid `service_product`**: `gatepass`, `idswyft-internal`
**Valid `service_environment`**: `production`, `staging`, `development`
**`label`**: 3–100 chars, human-readable (shown in admin lists)

**Response** (201):

```json
{
  "id": "uuid-of-the-key-row",
  "key": "isk_<64-char-hex>",
  "key_prefix": "isk_xxxx",
  "service_product": "gatepass",
  "service_environment": "production",
  "service_label": "GatePass production",
  "created_at": "2026-04-28T...",
  "warning": "This is the only time the plaintext key will be shown..."
}
```

> **Save the `key` value immediately** — it will not be shown again. Hand off via 1Password vault, never via Slack / email / chat.

## List existing service keys

```bash
curl "${IDSWYFT_API_BASE}/api/platform/api-keys/service" \
  -H "X-Platform-Service-Token: ${IDSWYFT_PLATFORM_SERVICE_TOKEN}"
```

Returns metadata for all service keys (id, prefix, product, environment, label, created_at, last_used_at, is_active, revoked_at). No plaintext, no hash.

## Rotate a key

```bash
curl -X POST "${IDSWYFT_API_BASE}/api/platform/api-keys/service/<id>/rotate" \
  -H "X-Platform-Service-Token: ${IDSWYFT_PLATFORM_SERVICE_TOKEN}"
```

Mints a new `isk_*` with the same product/environment/label, then revokes the old one. Returns the new plaintext (one-time). Update GatePass's `IDSWYFT_API_KEY` Railway env var with the new value before traffic hits the rotation cutover.

If the rotate response is **207** instead of 200, the new key was minted but the old one failed to revoke — manually revoke via the DELETE endpoint below.

## Revoke a key

```bash
curl -X DELETE "${IDSWYFT_API_BASE}/api/platform/api-keys/service/<id>" \
  -H "X-Platform-Service-Token: ${IDSWYFT_PLATFORM_SERVICE_TOKEN}"
```

Sets `is_active=false` and `revoked_at=now()`. Subsequent verify-API calls with that key return 401 immediately (no cache TTL — auth resolver queries `is_active=true` per request).

## Launch sequence (one-off)

For the GatePass launch, mint three keys:

```bash
for env in development staging production; do
  curl -X POST "${IDSWYFT_API_BASE}/api/platform/api-keys/service" \
    -H "X-Platform-Service-Token: ${IDSWYFT_PLATFORM_SERVICE_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"service_product\": \"gatepass\",
      \"service_environment\": \"${env}\",
      \"label\": \"GatePass ${env}\"
    }"
  echo
done
```

Save each `key` to 1Password under "GatePass / Idswyft API Key (env)" and hand off to the GatePass team.

## Telemetry

After the keys are in use, GatePass call volume can be queried directly from the audit log:

```sql
-- GatePass calls in the last 24h
SELECT count(*) FROM api_activity_logs
WHERE is_service = true
  AND service_product = 'gatepass'
  AND timestamp > now() - interval '24 hours';

-- p95 latency for service-key calls
SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)
FROM api_activity_logs
WHERE is_service = true
  AND timestamp > now() - interval '1 hour';

-- Error rate (any 4xx/5xx) for GatePass
SELECT
  count(*) FILTER (WHERE status_code >= 400)::float / count(*) AS error_rate
FROM api_activity_logs
WHERE is_service = true
  AND service_product = 'gatepass'
  AND timestamp > now() - interval '24 hours';
```

## Security notes

- `IDSWYFT_PLATFORM_SERVICE_TOKEN` rotates separately from `isk_*` keys. To rotate the token: generate a new one with `openssl rand -hex 32`, update Railway env var (cloud production + staging), update 1Password vault, then restart the backend.
- The token is compared with `crypto.timingSafeEqual` to prevent timing-attack discovery (see `backend/src/middleware/platformAuth.ts`).
- `isk_*` keys hash with HMAC-SHA256 using `apiKeySecret` (same as `ik_*`). Only the hash is stored — the plaintext is shown once at mint/rotate time.
- The shadow developer rows (`service+gatepass@idswyft.app`, `service+internal@idswyft.app`) cannot log in — they have no password, no JWT issued, no admin role. They exist purely to satisfy the `developer_id` FK on `api_keys`.
