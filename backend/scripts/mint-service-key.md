# Service-key minting — operating procedure

> **Cloud-only.** This file is in `.community-ignore` and never ships to the public mirror. The endpoints described here only exist when `IDSWYFT_EDITION=cloud` is set on the backend.

Service keys (`isk_*`) let internal Idswyft products call the verification API without hitting customer-facing rate limits, quotas, or plan gates. The minting UI lives in `idswyft-vaas/platform-admin/` (separate repo, deferred until vaas deploys). Until then, this is the operating procedure.

## Preferred: TypeScript CLI

`backend/scripts/mint-service-key.ts` wraps the curl recipes below with safety rails:

- Plaintext keys never printed to stdout — written to `~/.idswyft-keys/<timestamp>-<product>-<env>.json` with `chmod 0600`
- Production operations require typing `production` to confirm
- All operations append to `~/.idswyft-keys/audit.jsonl` (no plaintext)
- After mint/rotate, automatically lists keys to verify the operation landed
- Pretty table for `list`

```bash
export IDSWYFT_PLATFORM_SERVICE_TOKEN="<paste from Railway Variables tab>"
export IDSWYFT_API_BASE="https://api.idswyft.app"  # or staging URL

# See full usage:
npx tsx backend/scripts/mint-service-key.ts help

# Common operations:
npx tsx backend/scripts/mint-service-key.ts list
npx tsx backend/scripts/mint-service-key.ts mint gatepass staging "GatePass staging"
npx tsx backend/scripts/mint-service-key.ts rotate <id>
npx tsx backend/scripts/mint-service-key.ts revoke <id>

# Launch flow: mint dev + staging + prod GatePass keys (with prompts):
npx tsx backend/scripts/mint-service-key.ts launch-gatepass
```

The curl recipes below are still useful when the script can't run (e.g. fresh server without Node, or debugging the underlying HTTP). Otherwise prefer the script — it handles redaction, audit logging, and prod confirmation that you'd otherwise need to remember.

---

## Curl recipes (fallback / debugging)

### Prerequisites

- The Idswyft backend must be running with `IDSWYFT_EDITION=cloud` set.
- You must hold the `IDSWYFT_PLATFORM_SERVICE_TOKEN` (32-byte random hex). This token is set as a Railway env var on the cloud production + staging environments. **The Railway dashboard's Variables tab is the canonical source of truth** — encrypted at rest, click the eye icon to reveal. If you keep a separate copy in a password manager (Bitwarden, 1Password, Apple Keychain, KeePass, plain `chmod 600` file, etc.), label the entry `Idswyft / Platform Service Token (<env>)` for greppability.
- Replace `https://api.idswyft.app` with `https://staging.api.idswyft.app` when testing against staging.

```bash
# Paste from Railway Variables tab or your password manager:
export IDSWYFT_PLATFORM_SERVICE_TOKEN="<paste here>"
export IDSWYFT_API_BASE="https://api.idswyft.app"
```

### Generating the token (one-time at deploy / rotation)

```bash
# Pipe directly to clipboard so the token never echoes to your terminal:
openssl rand -hex 32 | clip       # Windows (Git Bash)
openssl rand -hex 32 | pbcopy     # macOS
openssl rand -hex 32 | xclip      # Linux

# Then paste into Railway → Idswyft → <env> → idswyfts-main-api → Variables → IDSWYFT_PLATFORM_SERVICE_TOKEN
# Railway auto-redeploys when env vars change.
```

Production + staging should hold **different** tokens — never reuse a value across environments.

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

> **Save the `key` value immediately** — it will not be shown again. Hand off via your team's secrets channel (encrypted password-manager share, signed message, etc.), **never via Slack / email / chat / Discord**. If the key is leaked in transit, rotate immediately via the rotate endpoint below.

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

Save each `key` to your secrets store (Railway env var on the GatePass services, plus a copy in your password manager if you use one — label as `GatePass / Idswyft API Key (<env>)`). Hand off to the GatePass team via your encrypted secrets channel.

The `IDSWYFT_API_KEY` env var on the GatePass Railway services is the consuming side: rotate that var when you rotate keys here. The GatePass code at `apps/api/src/lib/idswyft.ts` doesn't need any change — it already reads `IDSWYFT_API_KEY` and sends it as `X-API-Key`, agnostic to whether the value starts with `ik_` or `isk_`.

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

- `IDSWYFT_PLATFORM_SERVICE_TOKEN` rotates separately from `isk_*` keys. To rotate the token: generate a new one with `openssl rand -hex 32 | clip` (Windows) or `| pbcopy` (macOS), update the Railway env var on cloud production + staging (the dashboard auto-redeploys), update any backup copy you keep, then verify with a list call against the new token. The old token is invalid the moment Railway redeploys with the new value — there is no overlap window, so coordinate the change with anyone holding the old value.
- The token is compared with `crypto.timingSafeEqual` to prevent timing-attack discovery (see `backend/src/middleware/platformAuth.ts`).
- `isk_*` keys hash with HMAC-SHA256 using `apiKeySecret` (same as `ik_*`). Only the hash is stored — the plaintext is shown once at mint/rotate time.
- The shadow developer rows (`service+gatepass@idswyft.app`, `service+internal@idswyft.app`) cannot log in — they have no password, no JWT issued, no admin role. They exist purely to satisfy the `developer_id` FK on `api_keys`.
