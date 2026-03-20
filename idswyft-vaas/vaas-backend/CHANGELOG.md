# Changelog — VaaS API (`idswyft-vaas/vaas-backend/`)

All notable changes to the Idswyft VaaS API are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-19

### Added
- Webhook event types: `verification.approved`, `verification.rejected`, `verification.overridden`, `verification.expired`
- Per-org storage routing layer with S3/Supabase support
- Platform-level admin routes (`/api/platform/*`) — orgs, branding, email config, admin CRUD
- Session expiration service with automatic `verification.expired` webhook
- Migration runner (`npm run migrate`) with `_migrations` tracking table
- Rate limiting: `authRateLimit` on login routes, `apiKeyRateLimit` on API-key routes
- Configurable from-email (`from_email` column on `platform_email_config`)
- Dynamic platform branding endpoint (`GET /api/assets/platform`)
- International ID verification: MRZ parsing (TD1/TD2/TD3), 19-country format registry
- Verification document sync to VaaS storage
- VaaS ↔ Main API integration via service token (`X-Service-Token`)

### Fixed
- Webhook config schema now accepts all event types the backend actually fires
- CORS origins always include production domains

### Changed
- Cross-validation: unreadable barcodes get verdict `REVIEW` (score 0.80), not auto-PASS

## [1.0.0] - 2025-12-01

### Added
- Initial release — VaaS verification sessions, webhook delivery, org-scoped admin
- End user management with verification status tracking
- Webhook system with HMAC-SHA256 signing and retry backoff
- Org-scoped admin authentication with JWT
- Audit logging for all admin actions
