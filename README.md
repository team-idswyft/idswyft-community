# Idswyft — Open-Source Identity Verification

[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/team-idswyft/idswyft-community)](https://github.com/team-idswyft/idswyft-community/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/team-idswyft/idswyft-community)](https://github.com/team-idswyft/idswyft-community/issues)

Self-hostable identity verification platform for developers. Document OCR, barcode/MRZ parsing, cross-validation, liveness detection, and face matching — all in one API, running on your infrastructure.

**[Website](https://idswyft.app)** | **[Documentation](https://idswyft.app/docs)** | **[Demo](https://idswyft.app/demo)** | **[Pricing](https://idswyft.app/pricing)**

---

## Self-Host in One Command

```bash
git clone https://github.com/team-idswyft/idswyft-community.git && cd idswyft-community && docker compose up -d
```

That's it — pre-built images are pulled from GitHub Container Registry in ~2 minutes. Visit `http://localhost` to access the developer portal.

The Community Edition is **free forever** — unlimited verifications, full source code, MIT license. Your data stays on your servers.

### Prerequisites

| Dependency | Minimum Version | Check |
|------------|----------------|-------|
| **Docker** | 20.10+ | `docker --version` |
| **Docker Compose** | V2 (plugin) | `docker compose version` |
| **Git** | Any | `git --version` |

Docker Compose V2 ships as a plugin with Docker Desktop and recent Docker Engine installs. If `docker compose` doesn't work, install the [compose plugin](https://docs.docker.com/compose/install/).

**OS support:** Any Linux distribution (Debian, Ubuntu, RHEL, Alpine), macOS, or Windows with Docker Desktop. Production deployments are recommended on Linux.

### Interactive Setup (Recommended)

For a guided installation with secrets generation and optional HTTPS:

```bash
git clone https://github.com/team-idswyft/idswyft-community.git
cd idswyft-community
./install.sh
```

The install script will:
- Verify Docker and Docker Compose are installed
- Pull pre-built Docker images from `ghcr.io/team-idswyft/`
- Generate secure random values for `JWT_SECRET`, `API_KEY_SECRET`, `ENCRYPTION_KEY`
- Create a `.env` file with your configuration
- Optionally configure HTTPS with automatic Let's Encrypt certificates
- Start all services and wait for health checks

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
| `caddy`    | HTTPS reverse proxy (optional)           | 80/443 | ~50MB     |

### Server Requirements

The ML engine is the most resource-intensive component. Minimum and recommended specs:

| | Minimum | Recommended | High Volume |
|---|---|---|---|
| **CPU** | 2 vCPUs | 4 vCPUs | 8+ vCPUs |
| **RAM** | 4 GB | 8 GB | 16 GB |
| **Disk** | 20 GB | 50 GB | 100+ GB |
| **Throughput** | ~10 req/s | ~30 req/s | ~80+ req/s |
| **Use case** | Dev/testing, low traffic | Small-to-medium production | High-traffic production |

**Minimum (2 vCPU / 4GB)** — Handles ~10 concurrent verifications/sec with comfortable headroom. The engine uses ~1.5GB RAM at idle and spikes during ML inference. Suitable for startups processing up to a few hundred verifications per day.

**Recommended (4 vCPU / 8GB)** — Comfortable for production workloads. Extra cores significantly improve OCR and face detection throughput since these operations parallelize well.

**Storage note:** Disk usage grows with verification volume. Each verification stores uploaded documents (~2-5MB per session). Configure `RETENTION_DAYS` to auto-delete expired data.

> **Tested on:** 2 vCPU / 4GB RAM (AMD EPYC, Hetzner CX22) — sustained 15 req/s with p95 < 400ms, rate limiter engaged at higher loads, clean recovery under stress.

### HTTPS (Optional)

For public-facing deployments, enable automatic TLS via the built-in Caddy reverse proxy:

```bash
./install.sh    # Select "Enable HTTPS" when prompted, enter your domain
```

Or configure manually:

```bash
# 1. Copy the Caddyfile template
cp caddy/Caddyfile.acme caddy/Caddyfile    # Let's Encrypt (automatic)
# or
cp caddy/Caddyfile.manual caddy/Caddyfile  # Your own certificate

# 2. Set environment variables in .env
ENABLE_HTTPS=true
DOMAIN=verify.example.com
IDSWYFT_PORT=127.0.0.1:8080
CORS_ORIGINS=https://verify.example.com

# 3. Start with the HTTPS profile
docker compose --profile https up -d
```

Caddy automatically obtains and renews Let's Encrypt certificates. Requirements: ports 80 + 443 open, DNS A record pointing to your server.

### Uninstall

To cleanly remove Idswyft from your server:

```bash
cd idswyft-community
bash uninstall.sh
```

The uninstall script will:
- Stop and remove all containers and networks
- Remove database volumes (all verification data)
- Remove Docker images (`ghcr.io/team-idswyft/*`)
- Clean up generated config files (`.env`, `Caddyfile`)
- Optionally delete the installation directory

**Options:**

| Flag | Description |
|------|-------------|
| `--yes` | Skip confirmation prompts (non-interactive) |
| `--keep-data` | Remove containers but preserve the database volume |

```bash
# Non-interactive full removal
bash uninstall.sh --yes

# Remove containers but keep your database for reinstall
bash uninstall.sh --keep-data
```

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
- Encryption at rest for documents stored via S3-compatible providers (server-side AES256). For `STORAGE_PROVIDER=local`, rely on filesystem-level encryption (LUKS, dm-crypt, EBS).
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
| `ENCRYPTION_KEY` | 32-byte hex master key — encrypts stored secrets (LLM API keys, webhook secrets) at the application layer | required |
| `PORT` | API server port | `3001` |
| `NODE_ENV` | `development` or `production` | `development` |
| `STORAGE_PROVIDER` | `local`, `s3`, or `supabase`. `s3` is the only provider with built-in encryption at rest today. | `local` |
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

## License & Trademarks

**Code:** MIT License. See [LICENSE](./LICENSE). Use it commercially, modify it, distribute it.

**Brand:** The Idswyft name and logo are trademarks. Self-hosted deployments of the default UI must retain the "Powered by Idswyft" footer. See [TRADEMARK.md](./TRADEMARK.md) for the full policy.

**White-label:** Want to remove Idswyft branding? [Enterprise licenses](https://enterprise.idswyft.app) are available.

---

## Links

- **Website:** [idswyft.app](https://idswyft.app)
- **Documentation:** [idswyft.app/docs](https://idswyft.app/docs)
- **Demo:** [idswyft.app/demo](https://idswyft.app/demo)
- **Issues:** [github.com/team-idswyft/idswyft-community/issues](https://github.com/team-idswyft/idswyft-community/issues)
- **Enterprise:** [enterprise.idswyft.app](https://enterprise.idswyft.app)
