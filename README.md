# Idswyft — Open-Source Identity Verification

[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/team-idswyft/idswyft)](https://github.com/team-idswyft/idswyft/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/team-idswyft/idswyft)](https://github.com/team-idswyft/idswyft/issues)

Self-hostable identity verification platform for developers. Document OCR, barcode/MRZ parsing, cross-validation, liveness detection, and face matching — all in one API, running on your infrastructure.

**[Website](https://idswyft.app)** | **[Documentation](https://idswyft.app/docs)** | **[Demo](https://idswyft.app/demo)** | **[Pricing](https://idswyft.app/pricing)**

---

## Self-Host in One Command

```bash
git clone https://github.com/team-idswyft/idswyft.git && cd idswyft && docker compose up -d
```

That's it — pre-built images are pulled from GitHub Container Registry in ~2 minutes. Visit `http://localhost` to access the developer portal.

The Community Edition is **free forever** — unlimited verifications, full source code, MIT license. Your data stays on your servers.

### Interactive Setup

For a guided installation with secrets generation:

```bash
git clone https://github.com/team-idswyft/idswyft.git
cd idswyft
./install.sh
```

The install script will:
- Pull pre-built Docker images from `ghcr.io/team-idswyft/`
- Generate secure random values for `JWT_SECRET`, `API_KEY_SECRET`, `ENCRYPTION_KEY`
- Create a `.env` file with your configuration
- Start the stack via Docker Compose

### Build from Source

If you prefer to build images locally (e.g., for auditing, custom modifications, or ARM64 hosts):

```bash
# Via install script
./install.sh --build

# Or manually
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

> **Note:** Pre-built images are x86_64 (amd64) only. On ARM64 hosts (Apple Silicon, AWS Graviton), use `--build` to compile from source.

### What Gets Deployed

| Service    | Description                              | Port  | Image Size |
|------------|------------------------------------------|-------|------------|
| `postgres` | PostgreSQL 16 database                   | 5432  | ~80MB      |
| `engine`   | ML verification engine (OCR, face, liveness) | 3002 | ~1.5GB    |
| `api`      | Core API (lightweight orchestrator)      | 3001  | ~250MB     |
| `frontend` | Developer portal (React)                 | 80    | ~100MB     |

---

## How It Works

```
Front of ID ──► OCR + Barcode ──► Cross-Validation ──► Live Capture ──► Face Match ──► Result
```

1. **Create a session** — `POST /api/v2/verify/initialize`
2. **Upload front of ID** — OCR extracts name, DOB, document number, expiry
3. **Upload back of ID** — Barcode (PDF417) or MRZ parsed and cross-validated against front
4. **Live capture** — Real-time liveness detection confirms a real person is present
5. **Face match** — Live capture compared against document photo
6. **Result** — `verified`, `failed`, or `manual_review` delivered via API and webhook

---

## Features

**Core Verification**
- Document OCR via PaddleOCR (passports, driver's licenses, national IDs)
- PDF417 barcode parsing (US) and MRZ parsing (TD1/TD2/TD3 international)
- Cross-validation engine — front OCR vs back barcode/MRZ, inconsistencies flagged
- Liveness detection with anti-spoof scoring
- Face matching with configurable confidence thresholds
- 19-country format registry with country-aware extraction

**Integration**
- REST API with API key authentication
- JavaScript SDK (`npm install @idswyft/sdk`) with drop-in embed component
- Hosted verification page — redirect users, zero frontend work
- Webhooks with retry logic (up to 3 attempts) and delivery status
- Batch API for bulk verification processing

**Security & Compliance**
- Encryption at rest for all uploaded documents
- GDPR/CCPA compliant data handling with configurable retention
- HTTPS-only communication
- Audit logging for verification activities
- Sandbox mode for safe testing

**Developer Experience**
- Full API integration in under 30 minutes
- Developer portal with API key management
- Admin dashboard for monitoring and manual review
- Rate limiting and abuse protection

---

## Quick Start (API)

### JavaScript

```javascript
const BASE = 'https://api.idswyft.app'  // or http://localhost:3001
const h = { 'X-API-Key': 'your-api-key' }

// 1. Create session
const { verification_id } = await fetch(`${BASE}/api/v2/verify/initialize`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ document_type: 'drivers_license' }),
}).then(r => r.json())

// 2. Upload front of ID
const front = new FormData()
front.append('document', frontFile)
await fetch(`${BASE}/api/v2/verify/${verification_id}/front-document`, {
  method: 'POST', headers: h, body: front
})

// 3. Upload back of ID
const back = new FormData()
back.append('document', backFile)
await fetch(`${BASE}/api/v2/verify/${verification_id}/back-document`, {
  method: 'POST', headers: h, body: back
})

// 4. Live capture for liveness + face match
const capture = new FormData()
capture.append('image', captureFile)
await fetch(`${BASE}/api/v2/verify/${verification_id}/live-capture`, {
  method: 'POST', headers: h, body: capture
})

// 5. Get results
const result = await fetch(`${BASE}/api/v2/verify/${verification_id}/status`, {
  headers: h
}).then(r => r.json())
console.log(result.status) // 'verified' | 'failed' | 'manual_review'
```

### Python

```python
import requests

BASE = "https://api.idswyft.app"  # or http://localhost:3001
H = {"X-API-Key": "your-api-key"}

# 1. Create session
r = requests.post(f"{BASE}/api/v2/verify/initialize",
    json={"document_type": "drivers_license"}, headers={**H, "Content-Type": "application/json"})
verification_id = r.json()["verification_id"]

# 2-4. Upload documents and live capture
requests.post(f"{BASE}/api/v2/verify/{verification_id}/front-document",
    files={"document": open("front.jpg", "rb")}, headers=H)
requests.post(f"{BASE}/api/v2/verify/{verification_id}/back-document",
    files={"document": open("back.jpg", "rb")}, headers=H)
requests.post(f"{BASE}/api/v2/verify/{verification_id}/live-capture",
    files={"image": open("capture.jpg", "rb")}, headers=H)

# 5. Get results
result = requests.get(f"{BASE}/api/v2/verify/{verification_id}/status", headers=H).json()
print(result["status"])  # 'verified' | 'failed' | 'manual_review'
```

---

## Architecture

```
frontend/          React + Vite developer portal
backend/           Node.js + TypeScript core API (lightweight orchestrator)
  src/
    routes/        API endpoints (v2)
    services/      Webhook delivery, API key management, engine client
    verification/  Session state machine, cross-validation, face matching
    config/        Dynamic thresholds, verification config
engine/            ML verification engine (separate microservice)
  src/
    routes/        Extraction endpoints (front, back, live)
    services/      OCR, barcode, face recognition
    providers/     PaddleOCR, liveness, tampering, deepfake detection
docker-compose.yml One-command self-hosted deployment (4 containers)
install.sh         Interactive setup script
```

The core API (~250MB) handles routing, sessions, webhooks, and API key management. Heavy ML operations (OCR, face detection, liveness, deepfake analysis) run in a separate Engine Worker container (~1.5GB), called via HTTP only during verifications.

**Tech stack:** Node.js, TypeScript, Express, React, Vite, PostgreSQL, PaddleOCR, TensorFlow (face detection), ONNX Runtime, Tailwind CSS

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_NAME` | PostgreSQL database name | `idswyft` |
| `DB_USER` | PostgreSQL username | `idswyft` |
| `DB_PASSWORD` | PostgreSQL password | required |
| `DATABASE_URL` | PostgreSQL connection string (auto-built in Docker) | required |
| `JWT_SECRET` | Secret for auth tokens | required |
| `API_KEY_SECRET` | Secret for API key generation | required |
| `ENCRYPTION_KEY` | 32-char key for file encryption at rest | required |
| `PORT` | API server port | `3001` |
| `NODE_ENV` | `development` or `production` | `development` |
| `STORAGE_PROVIDER` | `local` or `supabase` | `local` |
| `SANDBOX_MODE` | Enable sandbox for testing | `false` |
| `ENGINE_URL` | Engine worker URL (auto-set in Docker) | `http://engine:3002` |

### Database Migrations

The backend includes a lightweight migration runner:

```bash
cd backend
npm run migrate
```

This creates a `_migrations` tracking table, applies pending SQL files in order, and skips already-applied migrations.

---

## Development Setup

If you want to run from source (without Docker):

```bash
# Prerequisites: Node.js 20+, PostgreSQL

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL, JWT_SECRET, etc.

# Run migrations
cd backend && npm run migrate

# Start dev servers
cd backend && npm run dev      # API on :3001
cd frontend && npm run dev     # Portal on :5173
```

### Testing

```bash
cd backend && npm test         # Vitest test suite
cd backend && npm run type-check  # TypeScript check
```

---

## Editions

| | Community (Self-Hosted) | Cloud |
|---|---|---|
| **Price** | Free forever | From $0/mo |
| **Verifications** | Unlimited | 50 - 2,000/mo |
| **Hosting** | Your infrastructure | Managed by Idswyft |
| **Support** | GitHub issues | Email / Priority |
| **Source code** | Full access (MIT) | N/A |

**Cloud** is available at [idswyft.app](https://idswyft.app) — same engine, managed infrastructure.

See the [full pricing comparison](https://idswyft.app/pricing).

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a branch from `dev`: `git checkout -b feature/my-feature`
3. Make your changes with clear commit messages
4. Run `npm test` and `npm run type-check` in the backend
5. Open a Pull Request targeting `dev` (not `main`)

For large features, open an issue first to discuss the approach.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

Use it commercially, modify it, distribute it — no restrictions.

---

## Links

- **Website:** [idswyft.app](https://idswyft.app)
- **Documentation:** [idswyft.app/docs](https://idswyft.app/docs)
- **Demo:** [idswyft.app/demo](https://idswyft.app/demo)
- **Issues:** [github.com/team-idswyft/idswyft/issues](https://github.com/team-idswyft/idswyft/issues)
- **Enterprise:** [enterprise.idswyft.app](https://enterprise.idswyft.app)
