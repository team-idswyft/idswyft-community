# Changelog — Main API (`backend/`)

All notable changes to the Idswyft Main API are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.2] - 2026-03-30

### Added
- **AML screening auto-trigger** — AML now runs automatically on all non-sandbox verifications when providers are configured (`AML_PROVIDER` env var). No longer requires `addons.aml_screening: true` per session. Developers can opt out via `aml_enabled` column on `developers` table.
- **Multi-provider AML screening** — `AML_PROVIDER` supports comma-separated values (e.g., `opensanctions,offline`). All providers run in parallel; matches are deduplicated and the highest risk level wins.
- **AML result persistence** — full screening results (matches, risk level, lists checked, screened name/DOB) are now stored in the `aml_screenings` DB table for audit trail
- **Expanded AML session state** — `aml_screening` in verification status now includes `matches` array (listed_name, list_source, score, match_type), `screened_name`, and `screened_dob`
- **AML risk scoring integration** — risk score now includes `aml_screening` factor (weight 0.10): `clear` → 0, `potential_match` → 60, `confirmed_match` → 100
- **Address cross-validation** — front OCR address is now compared against back PDF417/barcode address as a supplementary signal (weight 0, does not affect verdict). Uses word-overlap scoring with address normalization (abbreviation expansion). Thresholds: ≥0.70 PASS, ≥0.40 REVIEW, <0.40 FAIL.
- `address` field added to `qr_payload` in back extraction (both engine worker and local fallback)
- `address_validation` field in `cross_validation_results` (score, verdict, front/back addresses)
- `aml_enabled` developer column (migration 35) — defaults to true, set false to opt out
- `createAMLProviders()` factory function replacing `createAMLProvider()`
- `screenAll()` multi-provider orchestrator with `Promise.allSettled` and match deduplication

### Changed
- Risk scoring weights rebalanced: `ocr_confidence` 0.20→0.18, `face_match` 0.25→0.22, `cross_validation` 0.20→0.18, `liveness_proxy` 0.20→0.17, `document_expiry` 0.15 (unchanged), `aml_screening` 0.10 (new). Total: 1.00
- `AMLScreeningSessionResult` type expanded with `matches`, `screened_name`, `screened_dob` fields
- `CrossValidationResult` type expanded with optional `address_validation` field

## [1.7.0] - 2026-03-27

### Added
- **Reviewer invitation system** — developers can invite external reviewers to access the Verification Management page, scoped to that developer's data only
- **Passwordless reviewer auth** — reviewers authenticate via email OTP (same flow as developer portal), no passwords or admin accounts needed
- `POST /api/developer/reviewers/invite` — invite a reviewer by email
- `GET /api/developer/reviewers` — list all reviewers for the authenticated developer
- `DELETE /api/developer/reviewers/:id` — revoke a reviewer's access
- `POST /api/auth/reviewer/otp/send` — send OTP to reviewer email
- `POST /api/auth/reviewer/otp/verify` — verify OTP and issue scoped reviewer JWT (24h, developer-scoped)
- `authenticateAdminOrReviewer` middleware — admin routes accept either admin JWT or reviewer JWT
- Reviewer management UI in developer portal Settings modal (invite, list, revoke, copy login link)
- `verification_reviewers` database table with global email uniqueness

### Changed
- Admin verification endpoints now scope queries by `developer_id` when accessed with a reviewer token
- `AdminLogin.tsx` rewritten as passwordless OTP flow (replaces legacy password form)
- `VerificationManagement.tsx` accepts both `adminToken` and `reviewerToken`, with Sign Out button
- Reviewers cannot use the `override` decision on verification reviews (admin-only)
- Rate limiting on reviewer OTP send endpoint (5 per 15 min per IP)

### Security
- HTML escaping in reviewer invitation emails to prevent injection
- JWT `developer_id` cross-checked against database in both reviewer auth middlewares
- Timing-safe token comparison inherited from existing OTP infrastructure

## [1.6.0] - 2026-03-26

### Added
- **Batch verification processing** — `POST /api/v2/batch/upload` now runs the full verification pipeline: downloads documents from provided URLs, processes through engine (OCR, barcode/MRZ extraction), runs quality gates and cross-validation, sets final status to `manual_review` (no live capture in batch mode)
- **Admin status override** — `PUT /api/admin/verification/:id/review` accepts `decision: 'override'` with `new_status` field to set any valid status (verified, failed, manual_review, pending)
- **Webhook forwarding on admin actions** — approve, reject, and override decisions now fire webhooks to the developer's registered endpoints using their scoped API key (same events as the automated pipeline)
- **Verification Management page** — new dark-themed admin UI at `/admin/verifications` with stats bar, filterable/searchable table, expandable detail view with document images, and approve/reject/override actions with confirmation dialogs
- **Enhanced verification detail endpoint** — `GET /api/admin/verification/:id` now returns all documents (front + back) from the documents table, not just the FK-linked document

### Changed
- Batch items that fail quality gates are correctly marked as `failed` with rejection reason instead of always ending at `manual_review`

## [1.5.4] - 2026-03-26

### Fixed
- **CSRF token endpoint 503** — `/api/auth/csrf-token` returned 503 because `cookie-parser` was not installed. The `csrf-csrf` library requires `req.cookies` to be populated. Added `cookie-parser` middleware and wrapped the route in `catchAsync` for proper error handling.

### Added
- `cookie-parser` dependency for CSRF double-submit cookie support

## [1.5.3] - 2026-03-26

### Fixed
- **CORS blocks Docker setup wizard** — `http://localhost` (port 80) was missing from the CORS allowlist, causing the setup form POST to fail with 500. Added `http://localhost` as a hardcoded origin in config and prepended it to `CORS_ORIGINS` in docker-compose.yml.

## [1.5.2] - 2026-03-26

### Fixed
- **Docker setup wizard not loading** — `.env.production` had `VITE_API_URL=https://api.idswyft.app` baked in, causing Docker builds to route API calls to the cloud instead of the local nginx proxy. Dockerfile now removes `.env.production` before `vite build`.
- **Port collision in docker-compose** — renamed `${PORT}` to `${IDSWYFT_PORT}` so dev `.env` (`PORT=3001`) no longer hijacks the frontend container port mapping
- **Setup redirect on API error** — DeveloperPage now redirects to `/setup` when API is unreachable (common during Docker startup) instead of silently showing the login form
- **Setup wizard layout** — vertically centered form, block-centered logo
- **Mobile responsive grids** — DemoPage and DocsPage grids now stack to single column on viewports < 768px
- **Step indicator overflow** — shrunk step circles/labels on mobile to prevent horizontal overflow on DemoPage

### Changed
- **OCR modular architecture** — refactored `PaddleOCRProvider.ts` (2,141 → 120 lines) into 12 focused modules using facade + strategy pattern. Zero behavior change, same benchmark accuracy (63.6%)
- **US DL name extraction** — improved name scoring, sanitization, and multi-line parsing

## [1.5.1] - 2026-03-24

### Fixed
- **Mobile handoff desktop notification** — desktop no longer stays stuck on "Waiting for phone..." when mobile PATCH fails
  - Added exponential backoff retry (3 attempts: 1s/2s/4s) with `keepalive` on mobile completion PATCH
  - Extended handoff session timeout from 10 to 30 minutes for complex verifications
  - New `verification_id` linkage: mobile links verification to handoff session early, desktop dual-polls both handoff status and verification API as fallback
  - DemoPage transitions to full results view on handoff completion
  - UserVerificationPage gets dark-themed completion screen with distinct verified/failed/review states
- Fixed `face_match_results.score` → `.similarity_score` in mobile handoff result payload
- Added UUID format validation on `/link` endpoint

### Added
- `PATCH /api/verify/handoff/:token/link` — links a verification_id to a handoff session
- `verification_id` column on `mobile_handoff_sessions` table (migration 32)
- `verification_id` returned in handoff status poll response for desktop fallback

## [1.5.0] - 2026-03-24

### Changed
- **Extracted ML verification engine into separate microservice** (`engine/`)
  - Core API image reduced from ~2GB to ~250MB — no longer bundles TensorFlow, ONNX, PaddleOCR, or canvas
  - Engine Worker runs as a standalone container (~1.5GB) handling OCR, face detection, liveness, and deepfake analysis
  - API calls engine via HTTP (`ENGINE_URL` env var) during verifications; falls back to local extraction when unset
- Docker Compose architecture: postgres + engine + api + frontend (4 containers)
- Backend `package.json` stripped of `@tensorflow/tfjs`, `@vladmandic/face-api`, `onnxruntime-node`, `ppu-paddle-ocr`, `canvas`, `jimp`, `tesseract.js`, `@zxing/*`
- Backend Dockerfile no longer needs native build tools (python3, make, g++, libcairo2-dev, etc.)
- CI workflow builds 3 images in parallel: api, engine, frontend

### Added
- `engine/` directory with its own `package.json`, `tsconfig.json`, `Dockerfile`, and Express server
- `backend/src/services/engineClient.ts` — HTTP client for the engine worker using native `fetch` + `FormData`
- `ENGINE_URL` environment variable for engine service discovery

## [1.4.0] - 2026-03-24

### Added
- Community edition first-run setup wizard — `GET /api/setup/status` and `POST /api/setup/initialize`
- Auto-detects zero-developer state, creates first account + API key without OTP
- Rate-limited setup endpoint (5 req/15min) with input sanitization
- Docker auto-migration on boot via entrypoint script
- Migration runner: configurable directory (`MIGRATIONS_DIR`), conditional SSL, lenient mode

### Removed
- VaaS-specific migrations (06, 08, 10) that don't belong in community edition

### Fixed
- Docker frontend double `/api/api/` URL prefix — production builds now use same-origin (empty base URL)

## [1.3.0] - 2026-03-24 (superseded by 1.4.0)

_Initial setup wizard implementation, replaced by the clean rewrite in 1.4.0._

### Added
- Setup wizard endpoints (initial version)
- Version bump and changelog entry

## [1.3.1] - 2026-03-24 (superseded by 1.4.0)

_Docker integration fixes for 1.3.0, folded into 1.4.0._

### Fixed
- API URL prefix, auto-migration entrypoint, removed VaaS migrations

## [1.2.0] - 2026-03-20

### Changed
- Liveness system cleanup: removed dead MediaPipe/ActiveLiveness code path, renamed MultiFrame → HeadTurn
- Malformed `liveness_metadata` now returns HTTP 400 (`VALIDATION_ERROR`) instead of silently falling back to passive mode
- Removed legacy `multi_frame_color` challenge type alias — only `head_turn` is accepted
- `color_sequence` field is now optional (clients no longer need to send it)
- Removed deprecated `HeuristicProvider` — only `EnhancedHeuristicProvider` remains

## [1.1.0] - 2026-03-19

### Added
- Visual authenticity checks — FFT analysis, color distribution, zone validation, deepfake detection
- Webhook resend endpoint (`POST /api/developer/webhooks/:id/deliveries/:did/resend`)
- Per-API-key scoping for webhook endpoints
- Developer-configurable LLM fallback for OCR with date disambiguation
- Account deletion endpoint (`DELETE /api/developer/account`)
- Email OTP + GitHub OAuth authentication (replaced insecure password login)
- Webhook delivery logs endpoint (`GET /api/developer/webhooks/:id/deliveries`)
- Webhook test endpoint with timeout handling
- AML/sanctions screening opt-in addon
- US driver's license format validator
- `/health` endpoint for Railway health checks + `/api/health` for API consumers

### Fixed
- NULL events column silently filtering out webhook deliveries
- Per-provider metrics now derived from results JSONB instead of session-level aggregates
- Missing `webhook_deliveries` table migration
- OTP security hardening — atomic verify, timing-safe comparison, fail-closed
- Trailing AAMVA field markers stripped from space-separated DLN
- CORS origins always include production domains

## [1.0.0] - 2025-12-01

### Added
- Initial release — document OCR, face matching, verification pipeline
- RESTful API for verification workflows
- API key management system
- Webhook notification system with HMAC-SHA256 signing
- Sandbox environment for developer testing
- Rate limiting and abuse protection
