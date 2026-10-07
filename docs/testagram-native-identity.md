# Testagram Native Identity Verification

This fork is the Testagram-owned identity engine, not an Idswyft-hosted service.

## Hard boundaries

- No Docker runtime.
- No Didit, Persona, Onfido, AWS Rekognition, hosted OCR, hosted face matching, or managed KYC API.
- PostgreSQL runs on the operator-owned Linux host.
- Verification files use the local filesystem with application-level AES-256-GCM encryption.
- The ML engine binds to 127.0.0.1:3002 and requires ENGINE_SERVICE_TOKEN.
- The API binds to 127.0.0.1:3001; nginx is the only public HTTP entry point.
- Testagram is the browser-facing origin.

## Native service graph

Browser → nginx → Testagram Identity API → local PostgreSQL
                                  └→ local ML engine
                                  └→ encrypted local verification storage

The engine never needs a public DNS record and must not be exposed through nginx.

## Build

Run npm ci, then npm run build, then npm run test:backend.

The build compiles shared types, ML engine, API and frontend. CI is required to run these checks without Docker.

## First host bootstrap

1. Install Linux packages and Node 20 with deploy/native/install-native.sh.
2. Create an operator-owned PostgreSQL database/user.
3. Copy and edit /etc/testagram-identity/backend.env and engine.env.
4. Generate unique 64-byte secrets; never commit them.
5. Run cd /opt/testagram-identity/backend && npm run migrate.
6. Start testagram-identity-engine, then testagram-identity-api.
7. Validate curl http://127.0.0.1:3001/health.
8. Enable nginx and point Testagram's identity-verification route to this service.

## Kenyan ID policy

The verification flow is configured for national_id and must require front document, back document, live capture/liveness and face match before a positive decision. Country-specific document-format rules must be added only after they are backed by verified specimen/test data; this fork does not invent a Kenyan ID checksum.

## Data minimisation

Do not mirror raw identity documents into Testagram's normal application database. Keep raw captures in the dedicated encrypted identity storage and persist only the verification result, risk decision, protected uniqueness fingerprint and audit event needed by Testagram.

## CI monitoring

GitHub Actions is the authoritative source-build gate for this fork. A production identity journey is not marked green until the native CI gate and the real-device camera/liveness gate both pass.

## Operational green criteria

- CI: shared/backend/engine/frontend type checks green.
- Backend unit tests green.
- npm production dependency audits have no high/critical regression.
- API health green.
- Engine health green.
- Unauthorized engine calls return 401.
- API-to-engine authenticated extraction path passes.
- Native PostgreSQL migration completes.
- Native storage read/write/delete passes.
- Real Android camera → front/back ID → liveness → face match test is required before calling the production verification journey green.
