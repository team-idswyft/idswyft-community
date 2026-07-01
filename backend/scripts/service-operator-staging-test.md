# Service Operator — end-to-end test checklist (staging)

> **Cloud-only.** In `.community-ignore`. Runs against the staging environment (deployed from `dev`). Companion docs: `service-operator-access.md` (how the feature works) and `mint-service-key.md` (minting ops).

Goal: prove the whole operator flow on staging — **mint → login → dashboard (activity + webhook) → review dashboard** — plus the isolation guarantees. Check each box; note the actual result beside any surprise.

---

## 0. Prerequisites

- [ ] Staging is deployed from the latest `dev` (includes Phases 1–5 + the rotate/webhook fixes). Confirm the backend `version` if you have a health endpoint.
- [ ] You can run the CLI wrapper against staging: `./backend/scripts/service-key.sh --env staging list` returns without error (it pulls `IDSWYFT_PLATFORM_SERVICE_TOKEN` from Railway). If the wrapper isn't available, export the staging token + `IDSWYFT_API_BASE=<staging-api-url>` and use `npx tsx backend/scripts/mint-service-key.ts …` directly.
- [ ] You control an **email inbox** to receive the OTP (e.g. `svc-operator-test+staging@yourteam.com`). On cloud/staging the code is **emailed**; it is stored hashed in the DB and cannot be read back from there. (Only if staging has *no* email transport configured does `otp/send` return `{ code, self_hosted: true }` in its response body.)
- [ ] The staging **frontend** is a `cloud`-edition build (so `/operator/login` renders instead of redirecting). Note its base URL: `https://<staging-frontend>` .
- [ ] A second service key under the **same product** exists (or mint one) so you can prove cross-key isolation in step 8. Bind it to a *different* email.

Set `STAGING_API` and `STAGING_WEB` for the curl steps:
```bash
STAGING_API=https://<staging-api-url>
STAGING_WEB=https://<staging-frontend>
OP_EMAIL=svc-operator-test+staging@yourteam.com
```

---

## 1. Mint an operator-bound key

- [ ] Mint a staging key bound to your test email:
  ```bash
  ./backend/scripts/service-key.sh -e staging mint gatepass staging "Operator E2E test" --operator "$OP_EMAIL"
  ```
- [ ] Output shows the `isk_…` plaintext (once) + the key `id`. **Save the plaintext key** (needed to generate a verification in step 6b) and the `id`.
- [ ] `list` shows the new key as active:
  ```bash
  ./backend/scripts/service-key.sh -e staging list
  ```
  Expected: row present, `is_active = yes`, correct product/env/label.

---

## 2. Verify the binding landed

- [ ] Confirm `operator_email` is set on the key (via Supabase SQL on the staging project, or the platform list if it surfaces it):
  ```sql
  select id, key_prefix, service_product, service_environment, operator_email, is_active
  from api_keys where id = '<key-id>';
  ```
  Expected: `operator_email` = your test email (lowercased), `is_active = true`, `is_service = true`.

---

## 3. Operator login — send OTP

- [ ] Request a code:
  ```bash
  curl -sX POST "$STAGING_API/api/auth/service-operator/otp/send" \
    -H "Content-Type: application/json" -d "{\"email\":\"$OP_EMAIL\"}"
  ```
  Expected: `{ "message": "If this email operates a service key, a verification code has been sent." }` (and, only if staging has no email transport, a `code` field).
- [ ] Retrieve the 6-digit code from the inbox for `$OP_EMAIL` (or the `code` field above).
- [ ] Negative check — an email bound to **no** key returns no access:
  ```bash
  curl -sX POST "$STAGING_API/api/auth/service-operator/otp/send" \
    -H "Content-Type: application/json" -d '{"email":"nobody-nothere@example.com"}'
  # send always returns the generic message; verify with a code would 401 "No service access".
  ```

---

## 4. Operator login — verify + cookie (single-key path)

- [ ] Verify the code, saving cookies:
  ```bash
  curl -sX POST "$STAGING_API/api/auth/service-operator/otp/verify" \
    -H "Content-Type: application/json" -c op-cookies.txt \
    -d "{\"email\":\"$OP_EMAIL\",\"code\":\"<CODE>\"}"
  ```
  Expected (single key): a `scope: 'service-operator'` + `operator` body and a `Set-Cookie: idswyft_token=…` (in `op-cookies.txt`).
  If the email is on **multiple** keys instead: expect `{ selection_token, keys:[…] }`, then
  ```bash
  curl -sX POST "$STAGING_API/api/auth/service-operator/otp/select" \
    -H "Content-Type: application/json" -c op-cookies.txt \
    -d '{"selection_token":"<TOKEN>","api_key_id":"<key-id>"}'
  ```
- [ ] Confirm the session resolves to operator mode:
  ```bash
  curl -s "$STAGING_API/api/developer/profile" -b op-cookies.txt
  ```
  Expected: `scope: "service-operator"` and an `operator` block with your `key_prefix` / `service_product` / `service_environment`. **No `data` block.**

---

## 5. Operator dashboard (browser)

- [ ] In a fresh browser (cloud staging), open `"$STAGING_WEB/operator/login"`, enter `$OP_EMAIL`, then the OTP → lands on `/developer` in **operator mode**.
- [ ] **Hidden** for the operator: Create API Key button, rotate/delete key actions, the "Set up your team" banner, and the **Settings** button (sidebar + mobile). Confirm none appear.
- [ ] **Shown:** exactly one key, read-only; Webhooks section; Analytics; and a **"Review queue"** link in the sidebar. An operator identity badge shows the product/environment/key prefix.
- [ ] (Community sanity, optional) On a `community` build, `/operator/login` redirects to `/` and no operator UI appears.

---

## 6. Activity + a verification to review

**6a. Activity view**
- [ ] `GET /activity` returns only this key's activity:
  ```bash
  curl -s "$STAGING_API/api/developer/activity" -b op-cookies.txt
  ```
  Expected: `recent_activities` all have `api_key_id = <key-id>`; `statistics` scoped to this key. In the browser the Activity view matches.

**6b. Generate a `manual_review` verification for this key** (so step 7 has something to act on)
- [ ] Using the **plaintext `isk_` key** from step 1 (this is the *system* credential, `X-API-Key`), run a verification through the v2 flow that lands in `manual_review` (e.g. submit a document/live-capture combination your pipeline routes to manual review, or use your standard staging fixture that triggers it). The key point: the verification's `api_key_id` must equal `<key-id>` (captured automatically at `/initialize`).
- [ ] Confirm it's scoped to the key:
  ```sql
  select id, status, api_key_id from verification_requests
  where api_key_id = '<key-id>' order by created_at desc limit 5;
  ```
  Expected: at least one row with `status = 'manual_review'`.

---

## 7. Review dashboard

- [ ] From the operator dashboard, click **"Review queue"** (→ `/admin/verifications`). It loads (the auth probe `GET /api/admin/dashboard` succeeds for the operator).
- [ ] The queue shows **only this key's** cases — the `manual_review` verification from 6b is present; other keys' cases are not.
- [ ] Admin-only UI is **hidden**: the "Developers" button and the Compliance tab. The **Override** control **is visible** (operators may override their own scope).
- [ ] Open the case, then **approve** it (or reject/override). Expected: success, status changes.
- [ ] Confirm attribution:
  ```sql
  select id, status, reviewed_by, reviewed_at from verification_requests where id = '<verification-id>';
  ```
  Expected: `reviewed_by = <OP_EMAIL>` (the operator's email, not "admin …"), `reviewed_at` set, and `manual_review_reason` reads "Manually approved by <email>" (no "admin" mislabel).
- [ ] API cross-check (queue + action are cookie-scoped):
  ```bash
  curl -s "$STAGING_API/api/admin/verifications?status=manual_review" -b op-cookies.txt
  ```
  Expected: only `api_key_id = <key-id>` rows.

---

## 8. Webhook management + per-key delivery

- [ ] Create a webhook as the operator (browser Webhooks section, or API):
  ```bash
  curl -sX POST "$STAGING_API/api/developer/webhooks" -b op-cookies.txt \
    -H "Content-Type: application/json" \
    -d '{"url":"https://webhook.site/<your-uuid>","events":["verification.completed","verification.failed","verification.manual_review"]}'
  ```
  Expected: created; the one-time signing secret is returned. Confirm it's scoped:
  ```sql
  select id, url, api_key_id from webhooks where api_key_id = '<key-id>';
  ```
  Expected: the new webhook has `api_key_id = <key-id>` (NOT null).
- [ ] `GET /webhooks` as the operator returns only this key's webhook(s):
  ```bash
  curl -s "$STAGING_API/api/developer/webhooks" -b op-cookies.txt
  ```
- [ ] **Per-key delivery:** review/approve another `manual_review` case for this key (repeat 6b + 7) with the webhook.site URL open. Expected: your endpoint receives exactly one delivery for **this key's** verification — a sibling key's webhook is NOT fired.

---

## 9. Isolation & least-privilege (negative checks)

With the operator cookie (`op-cookies.txt`):
- [ ] Cross-key verification detail → `404`:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" \
    "$STAGING_API/api/developer/verifications/<a-DIFFERENT-key's-verification-id>" -b op-cookies.txt
  ```
  Expected: `404`.
- [ ] Cross-key review action → `404`:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X PUT \
    "$STAGING_API/api/admin/verification/<OTHER-key-verification-id>/review" \
    -H "Content-Type: application/json" -b op-cookies.txt -d '{"decision":"approve"}'
  ```
  Expected: `404`.
- [ ] Admin-only routes reject the operator token:
  ```bash
  curl -s -o /dev/null -w "audit=%{http_code}\n"  "$STAGING_API/api/admin/audit/export" -b op-cookies.txt
  curl -s -o /dev/null -w "devs=%{http_code}\n"   "$STAGING_API/api/admin/developers?limit=1" -b op-cookies.txt
  ```
  Expected: both `401`/`403` (NOT `200`).

---

## 10. Session invalidation (revoke / rebind takes effect immediately)

- [ ] Revoke the key, then reuse the same cookie:
  ```bash
  ./backend/scripts/service-key.sh -e staging revoke <key-id>
  curl -s -o /dev/null -w "%{http_code}\n" "$STAGING_API/api/developer/profile" -b op-cookies.txt
  ```
  Expected: `401` on the very next request (no TTL). Re-mint for step 11, or skip.

---

## 11. Rotation preserves the operator binding

- [ ] Mint a fresh operator-bound key (step 1), log in (steps 3–4), then rotate it:
  ```bash
  ./backend/scripts/service-key.sh -e staging rotate <key-id>
  ```
- [ ] Confirm the **new** key kept the binding:
  ```sql
  select id, operator_email, is_active from api_keys
  where service_product='gatepass' and operator_email = '$OP_EMAIL' order by created_at desc limit 2;
  ```
  Expected: the new key (active) has `operator_email = $OP_EMAIL`; the old is inactive.
- [ ] Log in again with the same email → succeeds against the rotated key (no lock-out). This is the regression guard for the rotate fix.

---

## 12. Cleanup

- [ ] Revoke the test key(s):
  ```bash
  ./backend/scripts/service-key.sh -e staging revoke <key-id>
  ```
- [ ] Delete the test webhook (browser, or `DELETE /api/developer/webhooks/<id>` with the operator cookie).
- [ ] Remove `op-cookies.txt` and any saved plaintext key file from `~/.idswyft-keys/`.

---

### Pass criteria
All boxes checked. The load-bearing ones: **login sets a scoped cookie (4)**, **operator mode hides owner-only affordances (5)**, **review queue shows only the key's cases + Override visible + `reviewed_by = operator email` (7)**, **webhook is `api_key_id`-scoped and per-key delivery fires only the right key (8)**, **cross-key → 404 and admin routes → 401 (9)**, **rotation keeps the binding (11)**.
