# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idswyft is an open-source identity verification platform. Developers integrate via API to verify government-issued IDs (passport, driver's license, national ID) with OCR, cross-validation, liveness detection, and face matching. Self-hostable via Docker Compose or available as a managed cloud service at idswyft.app.

## Repository Structure

```
backend/     Express + TypeScript API server (v1.7.0)         → port 3001
engine/      ML verification engine (TensorFlow, PaddleOCR)   → port 3002
frontend/    Vite + React + TypeScript (edition-aware)         → port 5173 (dev)
sdks/javascript/  npm SDK (idswyft-sdk v4.0.0)
docker-compose.yml  4-container self-hosted stack
install.sh          Interactive setup script
```

## Technical Stack

| Component | Technology |
|-----------|-----------|
| Backend | Express 4, TypeScript 5, ESM modules |
| Database | PostgreSQL 16 (via Supabase JS client + direct `pg` for migrations) |
| Frontend | React 18, Vite 4, Tailwind CSS 3, Zustand, React Query |
| OCR | PaddleOCR (ONNX, primary), Tesseract.js (fallback), optional LLM vision |
| Face Recognition | vladmandic/face-api.js (TF.js + WASM backend) |
| Deepfake Detection | EfficientNet-B0 via ONNX Runtime |
| Tamper Detection | Sharp (ELA, entropy, FFT spectral analysis) |
| Barcode | @zxing/library (PDF417, QR), MRZ parser |
| Storage | Local filesystem or S3-compatible |
| Auth | HMAC-SHA256 API keys, JWT (httpOnly cookies), OTP |

## Architectural Invariant: Deterministic Decisions

**All comparison and decision logic must be deterministic and fully auditable.** No LLM or probabilistic model may be used for any verification decision — only for OCR text extraction, which is isolated behind a provider interface.

- Gates use checksums, exact string matching, Levenshtein distance, cosine similarity with fixed thresholds
- Same inputs must always produce the same verification result
- LLMs may only read text from images (extraction) — never decide pass/fail/review
- The LLM provider interface is isolated in `engine/src/providers/ocr/LLMFieldExtractor.ts` — it must never be imported or called from gate logic, cross-validation, liveness scoring, or face matching

## Verification Pipeline

5-step state machine with automatic gate transitions:

```
AWAITING_FRONT → AWAITING_BACK → CROSS_VALIDATING → AWAITING_LIVE → FACE_MATCHING → COMPLETE
                                                                                   → HARD_REJECTED
```

| Step | Route | What happens |
|------|-------|-------------|
| 1 | `POST /api/v2/verify/initialize` | Create session |
| 2 | `POST /api/v2/verify/:id/front-document` | OCR, face detection, tamper detection |
| 3 | `POST /api/v2/verify/:id/back-document` | Barcode/MRZ + auto cross-validation |
| 4 | `POST /api/v2/verify/:id/live-capture` | Liveness (head-turn or passive) + auto face match |
| 5 | `GET /api/v2/verify/:id/status` | Poll for final result |

**Final results**: `verified`, `failed`, or `manual_review`

## Engine Worker Architecture

The engine (`engine/`) is a separate container (~1.5GB) that handles ML-heavy operations. The API container stays lightweight (~250MB).

- `ENGINE_URL` env var controls routing: set → call engine via HTTP; unset → local fallback functions
- Three endpoints: `POST /extract/front`, `POST /extract/back`, `POST /extract/live`
- Heavy deps (TensorFlow, ONNX, PaddleOCR, canvas) live only in the engine

## AML / Sanctions Screening

Gate 6 screens extracted names against sanctions lists. Configured via:

- `AML_PROVIDER` — comma-separated: `opensanctions`, `offline`, or `none` (default: `none`)
- `OFAC_SDN_PATH` — path to local OFAC SDN CSV file (used when `offline` provider is active)
- `OFAC_AUTO_LOAD=true` — download OFAC SDN from US Treasury at startup (alternative to local file)
- `developers.aml_enabled` — per-developer toggle (default: `true`), managed via Settings API

## Auth System

6 auth mechanisms in `backend/src/middleware/auth.ts`:

| Method | Header/Source | Use case |
|--------|-------------|----------|
| `authenticateAPIKey` | `X-API-Key` header | Developer API calls |
| `authenticateServiceToken` | `X-Service-Token` header | Service-to-service |
| `authenticateJWT` | `idswyft_token` cookie or Bearer | Admin dashboard |
| `authenticateDeveloperJWT` | `idswyft_token` cookie or Bearer | Developer portal |
| `authenticateReviewerJWT` | `idswyft_token` cookie or Bearer | Invited reviewers |
| `authenticateAdminOrReviewer` | Cookie or Bearer | Shared admin endpoints |

**API key format**: `ik_` prefix + 64 hex chars. Keys are HMAC-SHA256 hashed before storage. Sandbox mode is a boolean `is_sandbox` on the key, not a prefix distinction.

## Edition System

Build-time `VITE_EDITION` flag in `frontend/src/config/edition.ts`:
- `community` (default): self-hosted, Dev Portal at `/`, minimal chrome
- `cloud`: managed idswyft.app, marketing homepage at `/`, full navbar/footer

## Docker Architecture

4 containers (+ optional Caddy for HTTPS):

```
postgres:16-alpine → engine (ML, port 3002) → api (port 3001) → frontend (nginx, port 8080)
```

- Frontend uses `nginxinc/nginx-unprivileged:alpine` (non-root)
- All containers run as non-root users
- `install.sh` generates 256-bit secrets and handles HTTPS setup

## Git Workflow

- **`main`** is production — protected by branch rules, requires PR with approval
- **`dev`** is the working branch — also protected, requires PR
- CI runs `tsc --noEmit` on backend, frontend, and engine for all PRs
- Docker images are built on `v*` tag push (not on merge to main)
- CODEOWNERS requires `@doobee46` approval on all changes

## Deployment

When the user says "deploy", follow this sequence:

1. **Commit** the feature/fix to `dev` (direct push — always work on `dev`)
2. **Bump version** in `backend/package.json` (patch increment, e.g., `1.8.37` → `1.8.38`)
3. **Add changelog entry** to `backend/CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading, following Keep a Changelog format
4. **Commit** the version bump: `chore: bump version to x.y.z`
5. **Push** to `origin/dev`: `git push origin dev`
6. **Merge `dev` into `main`**: `git checkout main && git merge dev && git push origin main`
7. **Create annotated tag on `main`**: `git tag -a vx.y.z -m "summary"` — tags must be on `main`, never on `dev`
8. **Push the tag**: `git push origin vx.y.z` — triggers `sync-release.yml` → community repo sync → Docker image CI
9. **Switch back to `dev`**: `git checkout dev`

## Development

```bash
# Backend
cd backend && npm install && npm run dev    # → localhost:3001

# Frontend
cd frontend && npm install && npm run dev   # → localhost:5173

# Engine (optional, for ML features)
cd engine && npm install && npm run dev     # → localhost:3002
```

**Migrations**: `cd backend && npm run migrate` — reads from `supabase/migrations/`, tracks in `_migrations` table.

## Key Conventions

- Use **"live capture"** not "selfie" — the system uses real-time camera with liveness detection
- Design system: `C` tokens from `frontend/src/theme.ts` — dark theme default
- Fonts: DM Sans (sans), IBM Plex Mono (mono)
- Icons: heroicons/react
- Webhook delivery is fire-and-forget: trigger after `res.json()`, never throw
- Cross-validation: unreadable barcodes get verdict `REVIEW` (score 0.80), not auto-PASS

## Compliance

- Face embeddings stripped before DB persistence (GDPR Article 9)
- Data retention with configurable `DATA_RETENTION_DAYS`
- GDPR erasure covers all tables: documents, selfies, contexts, risk scores, webhook payloads
- File encryption at rest: S3-backed storage uses SSE-AES256 server-side encryption (`storage.ts:194`). The `local` provider writes plaintext to disk — operators using `STORAGE_PROVIDER=local` for production should rely on filesystem-level encryption (LUKS, dm-crypt, EBS volume encryption) until envelope encryption ships. Cloud edition uses S3.
- HTTPS enforced in production, PG SSL auto-enabled for non-local connections
- CSP + HSTS headers on both nginx and Express
