# Changelog — Main API (`backend/`)

All notable changes to the Idswyft Main API are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.52] - 2026-04-24

### Changed
- **LLM docs audit** — added 7 missing sections to llms-full.txt (face age estimation, velocity detection, IP geolocation, voice auth, PEP screening, compliance rules, verifiable credentials, identity vault), fixed version v1.8.2 → v1.8.52

## [1.8.51] - 2026-04-24

### Fixed
- **redirect_url not working on hosted page** — thread redirect_url through mobile auto-redirect flow, add redirect support to MobileVerificationPage with 3-second auto-redirect after completion (fixes idswyft-community#28)

### Security
- **Open redirect prevention** — validate redirect_url protocol (http/https only), rejecting javascript:, data:, and other dangerous schemes

### Changed
- Extract shared `buildRedirectUrl` utility to `frontend/src/utils/redirect.ts`
- Add `verification_mode` and `age_threshold` to hosted page URL parameters documentation

## [1.8.50] - 2026-04-24

### Added
- **Mobile auto-redirect** — when a user opens the verification URL on a mobile device, automatically redirects to the native mobile verification page instead of showing the desktop/mobile choice screen with a pointless QR code

## [1.8.49] - 2026-04-24

### Fixed
- **Duplicate verification in QR handoff** — when a verification was initialized via API (session token flow) and the user chose mobile QR handoff, the mobile page created a second verification instead of reusing the original; the developer's verification stayed stuck at `AWAITING_FRONT` while the duplicate completed silently

## [1.8.48] - 2026-04-21

### Added
- **Voice auth toggle in Settings Modal** — developers can now enable/disable voice authentication (Gate 7) from the Integrations tab in both cloud and community editions

## [1.8.47] - 2026-04-21

### Fixed
- **Intermittent CORS failures on staging** — Railway's Fastly CDN was caching OPTIONS preflight responses with stale `Access-Control-Allow-Origin` headers; added `Cache-Control: private, no-store` and `Surrogate-Control: no-store` to all preflight responses, and set `maxAge: 600` for browser-side preflight caching

## [1.8.46] - 2026-04-21

### Fixed
- **Demo hard rejection dead-end** — OCR polling HARD_REJECTED now advances to Results step with retry/new demo options instead of leaving the user stuck on the processing screen
- **Sign-in "Continue with Email" unresponsive** — added explicit JS email validation with inline error message instead of relying solely on browser-native required validation
- **File picker intermittently unresponsive** — replaced `document.getElementById` with React `useRef` for file input triggering in front and back document upload steps
- **"View on GitHub" link dead clicks** — fixed clickable area on pricing page Community tier CTA by correcting display mode from block to flex

## [1.8.45] - 2026-04-21

### Fixed
- **Address verification OCR routing** — address document OCR now routes through the engine worker (`POST /extract/ocr`) instead of directly importing `ppu-paddle-ocr` in the API container, which crashed on Railway staging; falls back to local OCR in dev mode when `ENGINE_URL` is not set

## [1.8.44] - 2026-04-20

### Added
- **IP geolocation risk** — analyzes verification IP addresses to detect geographic fraud signals: country mismatch (IP vs document issuing country), Tor exit nodes, datacenter/VPN IPs (AWS, GCP, Azure, etc.), and high-risk jurisdictions; flags (`country_mismatch`, `tor_exit_node`, `datacenter_ip`, `high_risk_country`) contribute 7% weight to composite risk score; flagged sessions route to `manual_review`; Tor exit list auto-refreshes every 24 hours; sandbox verifications excluded

## [1.8.43] - 2026-04-20

### Added
- **Velocity checks** — fraud velocity detection analyzes IP reuse, user frequency, and step timing to detect bots and rapid resubmissions; flags (`rapid_ip_reuse`, `burst_activity`, `high_user_frequency`, `bot_like_timing`) contribute 8% weight to composite risk score; flagged sessions route to `manual_review`; sandbox verifications excluded from analysis

## [1.8.42] - 2026-04-20

### Added
- **PEP screening** — screens against Politically Exposed Persons databases via OpenSanctions `/match/peps` endpoint; PEP matches always produce `potential_match` (never `confirmed_match`) since PEP status is a risk signal for enhanced due diligence; configure with `AML_PROVIDER=pep` or combine with sanctions via `AML_PROVIDER=opensanctions,pep`

## [1.8.41] - 2026-04-19

### Changed
- **v2 frontend design overhaul** — new technical editorial aesthetic: Geist + JetBrains Mono fonts, oklch green accents, sharp borders, light/dark theme toggle, sticky nav, grid-based layouts across all pages
- **Hero section** — interactive demo panel with specimen ID images, v2 typography and copy, subtle guilloche security pattern background
- **Developer portal** — guilloche security pattern background on auth gate and dashboard
- **Security fixes** — XSS prevention in JSON syntax highlighter, stabilized React hook dependencies, removed duplicate font loading

## [1.8.40] - 2026-04-15

### Fixed
- **External database SSL** — `install.sh` now defaults to `DATABASE_SSL_REJECT_UNAUTHORIZED=false` for BYOD databases, fixing `SELF_SIGNED_CERT_IN_CHAIN` errors with Railway, Supabase, and other cloud providers; SSL prompt defaults to yes and both env vars are always set

## [1.8.39] - 2026-04-15

### Added
- **Self-hosting guide** on the docs page (`/docs/guides#self-hosting`) — prerequisites, three install options, external database (BYOD) troubleshooting, and useful commands reference

## [1.8.38] - 2026-04-15

### Fixed
- **Handoff restart after verification failure** — mobile users clicking "Try Again" after a failed verification no longer get 401; `authenticateHandoffToken` now allows `'failed'` sessions for the `/restart` endpoint only, and the restart handler resets the handoff session to `'pending'` (with atomic guard) so the next `PATCH /complete` cycle succeeds

## [1.8.36] - 2026-04-15

### Added
- **Secure session tokens** — `POST /api/v2/verify/initialize` now returns a short-lived `session_token` and `verification_url`; end users load `/user-verification?session=<token>` instead of exposing the raw API key in the URL
- **`GET /api/v2/verify/session-info`** — public endpoint to resolve session token to verification metadata and developer branding
- **`authenticateSessionToken` middleware** — reuses HMAC handoff pattern; `X-Session-Token` header accepted on all verification endpoints
- **Session token scope enforcement** — `requireOwnedVerification` ensures a session token can only access its bound verification

### Changed
- Address verification routes now accept session token and handoff token auth (not just API key)
- Handoff creation accepts `X-Session-Token` header as alternative to `api_key` body field
- SDK `InitializeResponse` type includes `session_token` and `verification_url` fields
- Old `?api_key=` URL flow still works (backward compatible) with console deprecation warning

## [1.8.35] - 2026-04-14

### Added
- **Watchtower auto-update** — optional sidecar for automatic container updates via Docker Compose `--profile autoupdate`; checks for new images daily at 4 AM UTC with rolling restarts, never touches the database
- **`install.sh` auto-update step** — interactive prompt to enable Watchtower during installation, generates API token, appends to `.env`
- **Watchtower probe in `/api/system/version`** — checks Watchtower metrics endpoint (2s timeout) and returns `configured`, `running`, `containers_scanned/updated/failed` status
- **Auto-Update card** in community Settings modal System tab — three-state display (running with metrics, configured but stopped, not configured)
- **`update.sh` / `uninstall.sh`** — detect and include `--profile autoupdate` in compose commands when Watchtower is running

## [1.8.34] - 2026-04-14

### Added
- **`update.sh`** — safe upgrade script for community edition; pulls latest images and recreates containers without touching `.env` or database volumes
- **`GET /api/system/version`** — version check endpoint with GitHub API integration, 1-hour cache, and semver comparison (requires developer JWT)
- **System tab** in community Settings modal — shows current version, update available badge, click-to-copy update/uninstall commands

### Fixed
- Health and root endpoints now return actual version from `package.json` instead of hardcoded `1.0.0`

## [1.8.11] - 2026-04-13

### Added
- **Passport back-skip** — passports are single-sided; when front OCR detects a passport, the verification flow dynamically skips the back-document upload and cross-validation steps
- `applyPassportOverride()` in shared package — single source of truth for the flow override, used by session state machine and route handler
- `requires_back` field in front-document response — signals to clients whether the back-document step is needed (reflects passport detection)
- Passport-specific 400 error message on the back-document endpoint ("A passport was detected — passports are single-sided")
- 9 unit tests covering all verification mode + passport combinations (full, document_only, identity, liveness_only, age_only)

### Fixed
- **PaddleOCR `detected_document_type` not set** — when user explicitly selected a document type (e.g. "passport"), auto-classification was skipped and `detected_document_type` was never populated; now set from user-provided type with confidence 1.0
- **`mapStatusForResponse` null cross-validation** — `document_only` and `full` mode branches now handle null `cross_validation` (expected for passport flows that skip cross-validation)

## [1.8.10] - 2026-04-10

### Added
- **Haiti CIN (Carte d'Identification Nationale) OCR support** — PaddleOCR extraction for Haitian national ID cards with bilingual French/Kreyòl label handling, DMY date format, and compass-rose watermark resilience. Benchmark: 5/6 fields (name, DOB, doc#, expiry, nationality).
- **Date-format hint threading** — `standardizeDateFormat`, `findAllDates`, `findDateField`, `extractDate`, and `findLastDateField` now accept an optional `DMY`/`MDY`/`YMD` hint for country-specific date disambiguation.
- **`stripTrailingLabelNoise` / `stripLeadingLabelNoise` helpers** — clean bilingual OCR artifacts (French + Haitian Creole label fragments concatenated with extracted values).
- **59 unit tests** for `BaseExtractor` helpers (`stripLeadingLabelNoise`, `stripTrailingLabelNoise`, `findLastDateField`, `extractDate`, `isLabelOrNoise`).

### Fixed
- **JS `\b` word-boundary bug** — trailing `\b` in French label regexes silently failed after non-ASCII chars like `é` (JavaScript's `\b` is ASCII-only). Replaced with `(?![A-Za-z])` negative lookahead in both backend and engine.
- **`findLastDateField` window/hint coupling** — search window size and date-format hint are now independent parameters (`options.windowSize` vs `hint`).

## [1.8.3] - 2026-04-09

### Fixed
- **Compliance auth recursion bug** — `authenticateComplianceRequest` self-recursed on the `X-API-Key` branch instead of calling `authenticateAPIKey`, which would have stack-overflowed any request actually sending an API key. The bug was latent because the previous UI only ever hit the JWT branch.

### Changed
- **Compliance ruleset auth model** — `/api/v2/compliance/*` now accepts exactly two paths: `X-API-Key` (developer SDK/automation) **or** an organization-admin reviewer session cookie (Admin Dashboard UI). Regular reviewers and platform admins are rejected — compliance is a per-dev-organization concern owned by the org admin, not by individual developers or Idswyft platform operators.
- **Developer-portal JWT path removed** from compliance endpoints — compliance management has moved out of the Developer Portal entirely.
- **`getComplianceDeveloperId` helper** consolidates developer-scope resolution across the two auth paths (formerly 9 inline `(req as any).developer.id` casts).

### Security
- **CSRF enforced on compliance routes** — `/api/v2/compliance` is now mounted with `conditionalCsrf`, matching the pattern used by `/api/developer`, `/api/admin`, and `/api/auth`. The middleware no-ops for `X-API-Key` callers (no `idswyft_token` cookie present) and enforces `x-csrf-token` for the reviewer cookie path.

## [1.8.2] - 2026-04-02

### Added
- **Verification page branding** — developers can white-label the hosted verification page with a custom logo, accent color, and company name
- `GET/PUT /api/developer/settings/branding` — configure branding settings (logo URL, hex accent color, company name)
- `POST /api/developer/branding/logo` — upload branding logo (JPEG/PNG, max 2 MB, magic byte validated)
- `GET /api/v2/verify/page-config?api_key=...` — public endpoint returning developer branding for the hosted page (cached 5 min, rate limited)
- Live preview panel in Developer Portal Settings modal
- Branding applied to desktop, mobile, and embedded verification flows
- "Powered by Idswyft" attribution when custom branding is active

## [1.8.1] - 2026-04-02

### Added
- **Custom verification flows** — `verification_mode` parameter now supports `'document_only'` and `'identity'` presets
- `document_only`: Front → Back → CrossVal (3 steps, no biometric)
- `identity`: Front → Liveness → FaceMatch (3 steps, no back document or cross-validation)
- Endpoint guards: back-document returns 400 for identity/age_only flows; live-capture returns 400 for document_only/age_only flows

## [1.8.0] - 2026-04-02

### Added
- **Role-based access control** — `verification_reviewers` now has a `role` column (`'admin'` or `'reviewer'`), enabling Organization Admins with elevated privileges distinct from regular Reviewers
- **Organization Admin role** — org admins can access analytics, GDPR data deletion (scoped to their developer), and override verification decisions; regular reviewers are limited to approve/reject
- **Role-aware reviewer invitations** — `POST /api/developer/reviewers/invite` accepts optional `role` parameter (`'admin'` | `'reviewer'`, defaults to `'reviewer'`)
- **Role in reviewer JWT** — `role` field included in reviewer token payload and OTP verify response
- **`requireOrgAdminOrPlatformAdmin` middleware** — gates analytics, GDPR delete, and override endpoints to org admins and platform admins only
- **Team setup banner** — Developer Portal shows a dismissible banner prompting developers to invite an Organization Admin when none exists
- **Role badges in Settings** — reviewer list in Settings modal displays purple "Admin" or gray "Reviewer" badges, with role selector in the invite form

### Changed
- **Developer escalation removed** — `POST /api/auth/admin/escalate` now returns `410 Gone`; developers no longer auto-escalate to admin access
- **Analytics endpoints opened to org admins** — all 5 analytics routes (`/analytics`, `/analytics/funnel`, `/analytics/rejections`, `/analytics/fraud-patterns`, `/analytics/risk-distribution`) now accept reviewer JWTs with `role: 'admin'`, scoped by `developer_id`
- **GDPR delete opened to org admins** — `DELETE /api/admin/user/:userId/data` accessible to org admins with ownership verification (user must belong to their developer's verifications)
- **Override restricted** — verification override decision requires org admin or platform admin role; regular reviewers get 403
- **DevelopersList platform-admin only** — `GET /api/admin/developers` restricted to platform admins (`admin_users` table), no longer accessible to reviewer tokens
- **Admin frontend aligned with design system** — AdminLogin, VerificationManagement, and DevelopersList pages now use CSS pattern backgrounds (`pattern-shield`, `pattern-crosshatch`), monospace breadcrumbs, and `C.mono` heading font consistent with the rest of the site
- **Review Dashboard docs updated** — role hierarchy documented, override marked as admin-only, stats bar reflects 5-card layout, gate analysis and risk assessment in detail panel

### Security
- **Override guard fix** — platform admins were incorrectly blocked from override due to `req.reviewer?.role !== 'admin'` evaluating truthy when `req.reviewer` is undefined; fixed with explicit null check
- Developer escalation path fully removed — no route exists to promote a developer session to admin access

### Migration
- `39_admin_restructure.sql` — adds `role` column to `verification_reviewers` (default `'reviewer'`), CHECK constraint, index, and TOTP columns on `admin_users`

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
