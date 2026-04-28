# Self-Hosted Idswyft — Backup & Restore Runbook

**Audience**: operators running the community edition via `docker compose up`.
**Goal**: zero data-loss scenarios you can't recover from.

The community edition stores three things you can't reconstruct after a host failure:

1. **PostgreSQL database** (`pgdata` volume) — verifications, developer accounts, API keys, audit trail
2. **Uploaded files** (`uploads` volume) — document images and selfies, when `STORAGE_PROVIDER=local`
3. **Configuration** (`.env`) — JWT_SECRET, API_KEY_SECRET, ENCRYPTION_KEY, SERVICE_TOKEN

Lose any one and the others become much harder to recover. This document covers all three.

---

## Quick reference

| What | Frequency | Cost |
|---|---|---|
| Database snapshot | Daily | Tiny (compressed pg_dump) |
| `uploads` volume | Daily, on every retention cycle, or never (depending on storage strategy) | Grows with verification volume |
| `.env` | Once, after install | Trivial |
| Backup verification (test restore) | Monthly | Half-hour of operator time |

---

## Database backup

The database is the most important thing to back up. Without it, all verification history, audit logs, and customer accounts are gone.

### One-shot manual backup

```bash
# From the directory containing docker-compose.yml:
docker compose exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-acl \
  -U "${DB_USER:-idswyft}" "${DB_NAME:-idswyft}" \
  | gzip > "idswyft-$(date +%Y%m%d-%H%M%S).sql.gz"
```

A typical install with a few hundred verifications produces a backup file under 10 MB. Million-row deployments may run several hundred MB.

### Automated daily backup

Create `/opt/idswyft/backup.sh` on the host (NOT inside a container):

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──────────────────────────────
COMPOSE_DIR="/opt/idswyft"          # directory containing docker-compose.yml
BACKUP_DIR="/var/backups/idswyft"   # local backup directory
RETENTION_DAYS=30                   # delete backups older than this

# Optional: ship to S3 / B2 / etc. Leave empty to keep local-only.
S3_BUCKET=""                        # e.g. "s3://my-backups/idswyft/"

# ── Backup ────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
DEST="$BACKUP_DIR/idswyft-db-$TIMESTAMP.sql.gz"

cd "$COMPOSE_DIR"

# Pull credentials from .env
export $(grep -E '^(DB_USER|DB_NAME)=' .env | xargs)

docker compose exec -T postgres \
  pg_dump --clean --if-exists --no-owner --no-acl \
  -U "${DB_USER}" "${DB_NAME}" \
  | gzip > "$DEST"

echo "[$(date -u +%FT%TZ)] Backup written: $DEST ($(du -h "$DEST" | cut -f1))"

# ── Optional: ship to remote object storage ───
if [ -n "$S3_BUCKET" ]; then
  aws s3 cp "$DEST" "$S3_BUCKET" --storage-class STANDARD_IA
  echo "[$(date -u +%FT%TZ)] Uploaded to $S3_BUCKET"
fi

# ── Retention ──────────────────────────────────
find "$BACKUP_DIR" -name "idswyft-db-*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date -u +%FT%TZ)] Pruned local backups older than $RETENTION_DAYS days"
```

Make it executable and add a daily cron entry:

```bash
chmod +x /opt/idswyft/backup.sh
echo "30 2 * * * /opt/idswyft/backup.sh >> /var/log/idswyft-backup.log 2>&1" | sudo crontab -
```

This runs at 02:30 UTC daily.

### Configure retention

The script keeps 30 daily backups by default. For longer retention, modify the cron schedule and `RETENTION_DAYS`:

| Pattern | Schedule | Why |
|---|---|---|
| Daily-only (30 days) | `30 2 * * *` | Simple, low storage |
| Daily + monthly tier | Daily script + a monthly archive copy | Long-tail compliance |
| Hourly during peak hours | `30 */1 * * *` | Sub-day RPO for high-volume |

For the monthly-archive variant:

```bash
# Add to backup.sh after the daily backup:
if [ "$(date +%d)" = "01" ]; then
  cp "$DEST" "$BACKUP_DIR/monthly-$(date +%Y-%m).sql.gz"
fi

# And add a longer retention for monthly archives:
find "$BACKUP_DIR" -name "monthly-*.sql.gz" -mtime +365 -delete
```

---

## Uploaded files (`uploads` volume)

When `STORAGE_PROVIDER=local`, document images and selfies live in the `uploads` Docker volume. When `STORAGE_PROVIDER=s3`, files live in S3 and AWS handles durability — no local backup needed.

### How to back up the local uploads volume

```bash
# Find the volume mount path on the host (varies by Docker setup)
docker volume inspect idswyft_uploads --format '{{ .Mountpoint }}'
# → typically /var/lib/docker/volumes/idswyft_uploads/_data

# Snapshot via tar
sudo tar czf "/var/backups/idswyft/uploads-$(date -u +%Y%m%d).tar.gz" \
  -C "$(docker volume inspect idswyft_uploads --format '{{ .Mountpoint }}')" .
```

### When backups become unnecessary

The `DATA_RETENTION_DAYS` setting (default 90 days) auto-deletes verification records older than the retention period. If your business policy is "30-day retention, then permanent purge", and you've configured `DATA_RETENTION_DAYS=30`, then a 30-day-old backup is also stale — you'd be restoring data the policy says should be deleted. In that case, **don't back up uploads**: rely on the database for the verification history (which preserves anonymized rows for audit) and accept that file content is ephemeral.

### When backups are essential

If you operate under a regulator-driven longer retention (KYC may require 5+ years for some jurisdictions), back the volume up daily and ship to durable cold storage. S3 Glacier or B2 are cheap enough for this.

### If `STORAGE_PROVIDER=local` AND `STORAGE_ENCRYPTION=true`

Your backups contain envelope-encrypted blobs that require the master `ENCRYPTION_KEY` to decrypt. **Back up the key separately** (1Password, AWS Secrets Manager, hardware token — anywhere you'd put a master credential). Losing the key while keeping the backups is the same as not having backups.

---

## `.env` backup

The `.env` file contains secrets that, if regenerated, invalidate every existing API key, every encrypted webhook secret, every JWT, and every encrypted vault entry. Back it up immediately after running `install.sh` — once, not daily, because it shouldn't change.

```bash
# After install.sh completes:
cp .env "/var/backups/idswyft/env.$(date +%Y%m%d).backup"
sudo chmod 600 "/var/backups/idswyft/env.$(date +%Y%m%d).backup"

# Then copy the file to a separate, isolated location:
#   - 1Password / Bitwarden / etc. (preferred)
#   - Encrypted USB stored offline
#   - Encrypted S3 bucket different from the database backup bucket
```

If you rotate a secret (e.g. via the `ENCRYPTION_KEY` rotation procedure), back up the new `.env` immediately.

---

## Restore procedure

### Database restore

```bash
# Stop containers that would mutate the DB during restore
docker compose stop api engine

# Restore from a backup file
gunzip -c "/var/backups/idswyft/idswyft-db-20260427-023000.sql.gz" | \
  docker compose exec -T postgres psql -U "${DB_USER:-idswyft}" -d "${DB_NAME:-idswyft}"

# Restart
docker compose start api engine

# Verify
docker compose exec postgres psql -U "${DB_USER:-idswyft}" -d "${DB_NAME:-idswyft}" \
  -c "SELECT COUNT(*) FROM verification_requests;"
```

The `--clean --if-exists` flags from `pg_dump` make the restore idempotent: it drops existing tables before restoring, so you can replay the same backup multiple times safely.

### Uploads restore

```bash
docker compose stop api engine
sudo rm -rf "$(docker volume inspect idswyft_uploads --format '{{ .Mountpoint }}')/*"
sudo tar xzf "/var/backups/idswyft/uploads-20260427.tar.gz" \
  -C "$(docker volume inspect idswyft_uploads --format '{{ .Mountpoint }}')"
docker compose start api engine
```

### `.env` restore

Just copy the file back. Restart the stack so all containers pick up the values:

```bash
cp "/var/backups/idswyft/env.20260427.backup" .env
chmod 600 .env
docker compose down
docker compose up -d
```

---

## Restore drill

A backup that's never been restored is a hope, not a backup. **Run a restore drill monthly.** The procedure:

1. Provision a separate test host (small VM, ephemeral, throwaway)
2. Install Idswyft via `install.sh` on the test host
3. Stop containers
4. Copy your most recent production backup files to the test host
5. Run the restore steps above
6. Bring the stack up
7. Verify: log in to the developer portal with a known account, view recent verifications, confirm data matches what you'd expect from the backup date

If anything in steps 5–7 doesn't work cleanly, **fix the runbook now** — not when you actually need it.

The test host can be torn down immediately after. Total drill time: 30 minutes.

---

## Notes on backup security

Backup files contain everything the database contains: PII, hashed API keys, encrypted secrets, audit trail. Treat them as sensitive:

- **Encrypt at rest**: enable SSE on your S3 bucket. Use `aws s3 cp ... --sse AES256` or configure default encryption at the bucket level.
- **Restrict access**: backup bucket should be a separate IAM principal from production, with object-write-only permissions for the backup script and read access only for the operator running restores.
- **Never commit `.env` or backup files to git**: the `.gitignore` already blocks `.env` but be cautious with paths like `/var/backups/idswyft` — if those somehow end up in a git work tree, they'd leak.
- **Set restrictive permissions on host backups**: `chmod 700 /var/backups/idswyft && chmod 600 /var/backups/idswyft/*`.

---

## RTO / RPO targets (recommended defaults)

| Metric | Target | What it means |
|---|---|---|
| RPO (Recovery Point Objective) | 24 hours | Maximum data loss tolerable: one day of verifications |
| RTO (Recovery Time Objective) | 1 hour | Maximum downtime tolerable during recovery |

Daily backups + a tested restore procedure achieve both. Tighter targets (sub-hour RPO) require continuous replication via a managed service (Supabase, RDS, Crunchy Data) — out of scope for the community-edition Docker stack.

For regulated deployments with stricter requirements, consider:

- **Sub-day RPO**: switch to managed Postgres with point-in-time recovery
- **Sub-hour RTO**: pre-provision a warm standby and rehearse failover
- **Geographic redundancy**: ship backups to a second region's storage

---

## Don't do this

- **Don't snapshot the running pgdata volume directly.** Postgres's WAL semantics mean a hot-copied data directory can be inconsistent. Use `pg_dump` instead — it produces a logically consistent snapshot regardless of concurrent writes.
- **Don't store backups on the same disk as the production volume.** A disk failure that kills the database also kills the backup. Cross-disk or cross-region.
- **Don't rotate `ENCRYPTION_KEY` without backing up `.env` first.** If the rotation goes wrong, you need the original key to recover. See `backend/scripts/encryption-key-rotation.md` (cloud-only — community operators using `STORAGE_ENCRYPTION` should write their own rotation procedure).
- **Don't assume Watchtower auto-updates back up your data.** They update the application image; volumes (including pgdata and uploads) are unaffected. Backups are still your responsibility.
