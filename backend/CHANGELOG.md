# Changelog — Main API (`backend/`)

All notable changes to the Idswyft Main API are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-19

### Added
- Visual authenticity checks — FFT analysis, color distribution, zone validation, deepfake detection
- Webhook resend endpoint (`POST /api/developer/webhooks/:id/deliveries/:did/resend`)
- Per-API-key scoping for webhook endpoints
- Developer-configurable LLM fallback for OCR with date disambiguation
- Developer portal analytics charts with 7-day retention
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

### Changed
- Email templates redesigned with guilloche pattern, platform identity, and mobile optimization

## [1.0.0] - 2025-12-01

### Added
- Initial release — document OCR, face matching, verification pipeline
- RESTful API for verification workflows
- API key management system
- Webhook notification system with HMAC-SHA256 signing
- Sandbox environment for developer testing
- Rate limiting and abuse protection
