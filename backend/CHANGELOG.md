# Changelog — Main API (`backend/`)

All notable changes to the Idswyft Main API are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
