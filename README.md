# Testagram Native Identity

Self-owned identity verification infrastructure for Testagram, derived from the MIT-licensed Idswyft Community codebase and heavily tailored for Testagram.

This fork is designed to run directly on an operator-owned Linux host. **Docker is not part of the runtime. Managed KYC providers are not part of the runtime.**

## What the native stack does

Front of Kenyan national ID → local OCR → back of ID/barcode parsing → cross-validation → live camera capture → local liveness analysis → local face match → verified / failed / manual review.

The browser flow is served by Testagram. The ML engine is private to the host.

## Native architecture

Browser
  → nginx
  → Testagram Identity API (127.0.0.1:3001)
      → operator-owned PostgreSQL
      → encrypted local identity storage
      → Testagram Identity ML Engine (127.0.0.1:3002)

The ML engine requires a dedicated ENGINE_SERVICE_TOKEN and is not exposed by nginx.

## Hard exclusions

The native production profile rejects configuration for:

- Didit
- Persona
- Onfido
- AWS Rekognition / S3
- hosted OCR
- hosted face matching
- Resend as a required runtime dependency
- Supabase runtime credentials

The source still contains compatibility adapters inherited from upstream, but TESTAGRAM_NATIVE_SELF_HOSTED=true prevents them from being selected.

## Build without Docker

Prerequisites: Linux, Node.js 20+, npm, PostgreSQL, nginx, build-essential.

  npm ci
  npm run build
  npm run test:backend
  npm run type-check

The engine build downloads its local ML model assets when they are not already present.

## Native installation

Use:

  sudo bash deploy/native/install-native.sh

Then configure:

- /etc/testagram-identity/backend.env
- /etc/testagram-identity/engine.env

Create the PostgreSQL database and user on the same host, run migrations, then enable:

  sudo systemctl enable --now testagram-identity-engine
  sudo systemctl enable --now testagram-identity-api
  sudo systemctl enable --now nginx

Health checks:

  curl http://127.0.0.1:3001/health
  curl http://127.0.0.1:3002/health

Unauthorized engine extraction requests must return 401.

## Testagram integration boundary

Testagram should receive only the verification outcome and the minimum identity-enforcement data it actually needs.

Raw ID images and live captures belong to the dedicated encrypted identity storage. Do not copy raw identity documents into the normal Testagram application database.

For the one-person/one-account policy, the integration should consume a protected uniqueness fingerprint and the final verification decision rather than a raw national-ID number.

## Kenyan document handling

The flow is explicitly designed to accept national_id with front + back + live capture. No invented checksum or undocumented Kenyan ID rule is added. Country-specific document rules should be promoted into the engine only after they are backed by verified specimen/test fixtures.

## Green gates

1. Native source build green.
2. Shared/backend/engine/frontend type checks green.
3. Backend tests green.
4. Production dependency audit has no high/critical regression.
5. API health green.
6. ML engine health green.
7. Engine rejects unauthenticated extraction calls.
8. API-to-engine authenticated extraction path green.
9. PostgreSQL migrations green.
10. Encrypted local storage read/write/delete green.
11. Android camera → front/back document → liveness → face match → final Testagram identity enforcement green.

The final real-device gate cannot honestly be marked green from GitHub CI alone; it requires an actual Testagram browser session and camera/liveness capture.

## Project layout

- backend/ — Testagram identity API and verification state machine
- engine/ — local OCR, barcode/MRZ, liveness and face processing
- frontend/ — verification/admin UI
- shared/ — shared contracts and utilities
- deploy/native/ — systemd, nginx, environment templates and native installer
- docs/testagram-native-identity.md — operating model and security boundary

## License

The upstream code is MIT licensed. Review LICENSE and TRADEMARK.md before distributing modified public builds or branding.
