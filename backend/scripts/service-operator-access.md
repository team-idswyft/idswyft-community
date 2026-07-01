# Service Operator Access — internal reference

> **Cloud-only.** This file is in `.community-ignore` and never ships to the public mirror. Everything here only exists when `IDSWYFT_EDITION=cloud` is set on the backend. Companion docs: `mint-service-key.md` (minting/rotation ops) and `service-operator-staging-test.md` (end-to-end test checklist).

## What this is

A **service operator** is the *human* who runs an internal integration (e.g. the GatePass team). Before this feature they had no way into the UI: they couldn't see their key's verifications/activity/webhooks/analytics, and they couldn't act on `manual_review` cases (the review page was gated to platform admins + invited reviewers only).

Service Operator Access gives that human a **scoped login** to the *existing* developer dashboard and admin review queue, seeing and acting on **only their key's** data — no new dashboard, no new review UI.

## Two principals — do not confuse them

| | Service **key** (`isk_*`) | Service **operator** (human) |
|---|---|---|
| Who | The integrating *system* (GatePass backend) | The *person* who operates that integration |
| Credential | `X-API-Key: isk_…` header | httpOnly `idswyft_token` cookie (JWT, audience `idswyft-service-operator`) |
| Obtained via | Minting (`mint-service-key.ts`) | Email OTP login at `/operator/login` |
| Used for | Calling the verification API; managing its own webhook via API (Request 1) | Browsing the dashboard + review queue in a browser |
| Bound together by | — | `api_keys.operator_email` (one email per key) |

The operator's browser session and the system's API key are **separate credentials for the same key**. The operator never sends `X-API-Key`; the system never gets a cookie.

## The tenant boundary: `api_key_id`, not `developer_id`

All `isk_*` keys for a product share **one shadow developer row** (`service+gatepass@idswyft.app`, `service+internal@idswyft.app`). Therefore `developer_id` is **NOT** a tenant boundary. **`api_key_id` is.** Every operator-scoped query applies `.eq('api_key_id', <operatorKeyId>)`. Two operators of two different keys under the same shadow developer cannot see each other's data.

The operator token is **reloaded from the DB on every request** (`authenticateServiceOperatorJWT`): it re-checks `is_service = true`, `is_active = true`, and that `operator_email` still equals the email in the token. So revoking the key, deactivating it, or re-binding the email takes effect on the operator's **next request** (no cache/TTL) → they get a `401` and must re-login.

## Data model

| Column | Table | Added in | Purpose |
|---|---|---|---|
| `operator_email` | `api_keys` | Phase 1 | Binds the human operator's email to the key (the login credential). Normalized to lowercase on write. |
| `api_key_id` | `verification_requests` | Phase 3a | Which key initialized each verification — the scoping column for dashboards + review. Nullable; NULL for pre-existing/non-keyed sessions. |
| `reviewed_by`, `reviewed_at` | `verification_requests` | Phase 4 | Manual-review attribution (admin id / reviewer id / **operator email**) + timestamp. |
| `api_key_id` | `webhooks` | pre-existing | Scopes a webhook to one key. Service keys/operators create key-scoped webhooks; a NULL value is a product-wide webhook (platform-only). |

## Auth flow (login)

Routes are mounted at `/api/auth` → full paths below. Handled in `serviceOperatorAuth.ts`.

1. `POST /api/auth/service-operator/otp/send` `{ email }` → creates a 6-digit code (hashed into `developer_otp_codes`) and emails it via `emailService.sendOtpEmail`. **The plaintext code is returned in the response ONLY when no email transport is configured** (`{ code, self_hosted: true }`); otherwise it is emailed only. The DB stores the code **hashed**, so it cannot be read back from the table.
2. `POST /api/auth/service-operator/otp/verify` `{ email, code }`:
   - **0 active keys** for this email → `401` ("No service access for this email").
   - **1 key** → issues the operator JWT and sets the `idswyft_token` cookie. Logged in.
   - **>1 keys** → returns `{ selection_token, keys: [{ api_key_id, service_product, service_environment, service_label }] }` (no second OTP needed).
3. `POST /api/auth/service-operator/otp/select` `{ selection_token, api_key_id }` → issues the cookie for the chosen key.

The operator JWT: audience `idswyft-service-operator`, 7-day expiry. `authenticateServiceOperatorJWT` sets `req.operatorKeyId`, `req.operatorEmail`, `req.developer` (shadow), `req.apiKey`.

## Endpoints the operator can reach

All authenticate via the operator cookie (`authenticateDashboard` for `/api/developer/*`, `authenticateReviewPrincipal` for the four review routes), and are hard-scoped to `req.operatorKeyId`. Client-supplied `?developer_id` / `?api_key_id` params are **ignored** for operators.

**Dashboard — `/api/developer/*`:**
- `GET /profile` → returns `{ scope: 'service-operator', operator: { email, api_key_id, key_prefix, service_label, service_product, service_environment } }` (this block is what flips the UI into operator mode)
- `GET /api-keys` → their one key (read-only)
- `GET /stats`, `GET /activity`, `GET /analytics` → key-scoped
- `GET /verifications/:id` → key-scoped detail (cross-key id → `404`)
- `GET|POST|DELETE /webhooks`, `GET /webhooks/:id/secret` → key-scoped webhook management

**Review — `/api/admin/*`:**
- `GET /dashboard` → key-scoped (also the review UI's auth probe)
- `GET /verifications` → key-scoped `manual_review` queue
- `GET /verification/:id` → key-scoped detail (cross-key → `404`)
- `PUT /verification/:id/review` → approve / reject / override within scope; writes `reviewed_by = operator email`; fires only the verification's own key-scoped webhook

**Least privilege:** operators reach ONLY the routes above. The other `/api/admin/*` routes — audit export, GDPR erasure, developers list, admin analytics — remain on `authenticateAdminOrReviewer` and **reject the operator token** (wrong audience). This is enforced by using a dedicated `authenticateReviewPrincipal` on only the four review routes, not by extending the shared admin middleware.

## Binding / managing the operator email

Done with the platform CLI (`mint-service-key.ts`, via the `service-key.sh` Railway wrapper — see `mint-service-key.md`):

```bash
# Bind at mint time:
./backend/scripts/service-key.sh -e staging mint gatepass staging "GatePass staging" --operator ops@gatepass.example.com

# Bind / change later:
./backend/scripts/service-key.sh -e staging set-operator <key-id> ops@gatepass.example.com

# Unbind (operator can no longer log in):
./backend/scripts/service-key.sh -e staging set-operator <key-id> --clear
```

Underlying endpoints: mint `POST /api/platform/api-keys/service` with `operator_email`; rebind `PATCH /api/platform/api-keys/service/:id/operator` `{ operator_email }`. Both platform routes require `X-Platform-Service-Token`.

**Rotation preserves the binding.** `POST /api/platform/api-keys/service/:id/rotate` carries `operator_email` to the new key, so a routine rotation does not lock the operator out. (This was a bug — fixed; see the rotate handler in `platform/serviceKeys.ts`.)

## Frontend (cloud edition only)

- **Login:** `/operator/login` — a dedicated page, cloud-gated (`isCloud ? <OperatorLogin/> : <Navigate to="/"/>`). Not linked from anywhere; operators are given the URL. Email → OTP → (multi-key picker if needed) → navigates to `/developer`.
- **Dashboard:** reuses `DeveloperPage`. Operator mode is detected from the `profile` `operator` block. Hidden for operators: create-key, rotate/delete, the team-setup banner, and **Settings entirely** (an operator profile has no `data` block, so the Settings tabs have no data source). Shown: their one key (read-only), webhooks, analytics, verifications, an operator identity badge, and a **"Review queue"** nav link.
- **Review:** reuses `VerificationManagement` (`/admin/verifications`). Operator is detected via the profile signal (NOT the admin-only probes, which operators can't reach). Operators keep the **Override** control (they are the data owner of their key); the Developers list and Compliance tab are hidden.

In the **community** edition none of this appears: `/operator/login` redirects to `/`, and operator detection is inert because the community backend never returns an `operator` block.

## Edge cases / behavior

- Email bound to **no active key** → `401`, generic message (send always says "if this email operates a service key…").
- Key revoked / deactivated / `operator_email` changed mid-session → next request's token reload fails → `401`, forces re-login.
- Email that is *also* a real developer → separate audiences + separate verify endpoints; no collision (operator login yields an operator token only).
- Email on **multiple keys** → picker + short-lived selection token (no second OTP).
- Sandbox: service keys force production; the operator sees production data only.

## Security model (summary)

- The **backend is the enforced boundary**; the frontend gating is UX-only. Every hidden affordance is also scoped/blocked server-side — hiding a button never guards data.
- Per-key isolation everywhere via `.eq('api_key_id', operatorKeyId)`; the shadow developer is not a boundary.
- Operator override authority is scoped to their own key (equivalent to org-admin capability over their scope only). The `api_key_id` pre-check on the review action is enforced from the crypto-verified, per-request-reloaded token — not client-controllable.
- Least privilege: operators cannot reach audit export, GDPR erasure, developer listing, or admin analytics.
