# Encryption Key Rotation Runbook

**Scope**: Rotating `ENCRYPTION_KEY` for the local file storage provider when envelope encryption (`STORAGE_ENCRYPTION=true`) is enabled. This is the master key that wraps each file's per-file Data Encryption Key (DEK). See `backend/src/services/storageCrypto.ts` for the algorithm.

**When to rotate**:
- Suspected compromise of `ENCRYPTION_KEY` (env var leaked, ex-employee with access, key checked into a logfile).
- Scheduled rotation per compliance policy (e.g., 12-month rotation for SOC 2 / FIPS-aligned operations).
- Proactive rotation after a security incident even if the key wasn't directly implicated — defense in depth.

**Time required**: ~5 minutes for the operator + linear time in file count for the script (~1 ms per file). 100k files ≈ 100 seconds.

---

## How it works

The codebase reads with both keys (current + previous) but writes only under the current. So rotation is a four-stage transition:

```
stage 0: only old key set                          (steady state pre-rotation)
stage 1: BOTH keys set                              (rotation window — reads work, writes use new)
stage 2: BOTH keys set, all files re-wrapped       (script ran, but keep PREVIOUS for safety window)
stage 3: only new key set                          (steady state post-rotation)
```

Files written during stage 1 are already wrapped under the new key. Files from before stage 1 stay wrapped under the old key until the rotation script re-wraps them in stage 2.

---

## Procedure

### 1. Generate the new key

```bash
NEW_KEY=$(openssl rand -hex 32)
echo "$NEW_KEY"   # save somewhere secure — you'll set it in the env shortly
```

The output is 64 hex chars. The codebase requires ≥32 characters of master key material, so this is more than sufficient.

### 2. Take a backup snapshot of `uploads/`

Before any cryptographic operation, make sure you can restore. On Railway:

```bash
# Option A — copy the volume to S3
aws s3 sync /app/uploads s3://your-backup-bucket/idswyft-uploads-pre-rotation-$(date +%F)/

# Option B — rsync to another host with sufficient space
rsync -av /app/uploads/ backup-host:/backups/idswyft-uploads-pre-rotation-$(date +%F)/
```

If the rotation script later fails or corrupts a file, restore from this backup. **Do not skip this step.**

### 3. Configure both keys (stage 1)

Set the new key as `ENCRYPTION_KEY` and the *old* key as `ENCRYPTION_KEY_PREVIOUS`. On Railway:

```bash
railway variables set ENCRYPTION_KEY="<NEW_KEY>" ENCRYPTION_KEY_PREVIOUS="<OLD_KEY>" \
  --service idswyfts-main-api --environment production

# Same for engine if it ever reads files (it doesn't today, but safe default):
railway variables set ENCRYPTION_KEY="<NEW_KEY>" ENCRYPTION_KEY_PREVIOUS="<OLD_KEY>" \
  --service idswyft-ve-engine --environment production
```

The service auto-redeploys. Once both keys are live:
- Reads continue to work for all existing files (decrypt tries `ENCRYPTION_KEY` first, falls back to `ENCRYPTION_KEY_PREVIOUS`).
- New writes use the new key.
- Verify by uploading one new verification document and confirming downloads succeed.

**Stop here if you only need to rotate going-forward**: you can leave the system in this state indefinitely. The downside is you can't retire the old key until you progress to stage 2.

### 4. Dry-run the rotation script (stage 1.5)

Run with `--dry-run` first to inventory the file population without writing:

```bash
ENCRYPTION_KEY="<NEW_KEY>" ENCRYPTION_KEY_PREVIOUS="<OLD_KEY>" \
  npx tsx backend/scripts/rotate-encryption-key.ts --dry-run --root=uploads
```

Expected output:

```
[DRY RUN] Rotating files under /app/uploads
Found N files to inspect

[DRY RUN] Rotation summary:
  scanned:          N
  rotated:          M       <- would re-wrap under new key
  already current:  K       <- already under new key (test files, recently uploaded)
  legacy plaintext: P       <- pre-encryption-era files, skipped (not encrypted at all)
  failed:           0
```

If `failed > 0`, **stop and investigate** before running for real. Failed files are listed on stderr — typical causes are corrupted on-disk bytes or files encrypted under a third unknown key.

### 5. Run the rotation script (stage 2)

```bash
ENCRYPTION_KEY="<NEW_KEY>" ENCRYPTION_KEY_PREVIOUS="<OLD_KEY>" \
  npx tsx backend/scripts/rotate-encryption-key.ts --root=uploads
```

The script:
- Walks every file under `uploads/`.
- For each file, attempts decrypt with the current key. If that succeeds, the file is already current — skip.
- Otherwise decrypts with the candidate list (current + previous), re-encrypts under the current key, and atomically writes via temp+rename. A crash mid-rotation cannot leave a half-encrypted file because the rename is atomic — the file at any moment is either fully old-wrapped or fully new-wrapped.
- Exits 0 on full success, 2 if any files failed.

### 6. Verify the rotation

Re-run the dry-run and confirm `rotated: 0, already current: <total - legacy>`:

```bash
ENCRYPTION_KEY="<NEW_KEY>" ENCRYPTION_KEY_PREVIOUS="<OLD_KEY>" \
  npx tsx backend/scripts/rotate-encryption-key.ts --dry-run --root=uploads
```

If any files still report `rotated: would-rotate`, repeat step 5. If `failed > 0`, investigate.

### 7. Retire the previous key (stage 3)

After you're confident every file has been re-wrapped, remove `ENCRYPTION_KEY_PREVIOUS`:

```bash
railway variables delete ENCRYPTION_KEY_PREVIOUS \
  --service idswyfts-main-api --environment production

railway variables delete ENCRYPTION_KEY_PREVIOUS \
  --service idswyft-ve-engine --environment production
```

The service redeploys. Reads now only succeed with the new key. **The old key is now dead** — anyone with it cannot decrypt anything in the system.

Validate:

```bash
# Upload a new verification document
# Download it via the API
# Confirm it succeeds
```

---

## Failure modes and recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Script exits 2 with `failed > 0` | stderr lists the failed paths | Inspect each: usually corrupted on-disk bytes (compare to backup). Restore individual files from the backup snapshot, then re-run the script. |
| Service can't read files after step 7 (key retired too early) | API returns 500s on file downloads | Re-add `ENCRYPTION_KEY_PREVIOUS` from your secret store; redeploy. Then re-run step 5. |
| Wrong "old" key configured as `ENCRYPTION_KEY_PREVIOUS` | All files fail to decrypt; script exits 2 immediately | Set the correct old key in `ENCRYPTION_KEY_PREVIOUS`. If you don't have it, the data is unrecoverable — restore from backup. |
| Rotation script crashes mid-run | Some files rotated, some not | Safe to re-run — already-rotated files are no-ops the second time around. |
| Backup snapshot missing | Caught at step 2 | Do not proceed. Take the backup first. |

---

## Don't do this

- **Don't rotate without a backup.** If something goes wrong, you'd need to recover from the rotation script's atomic-write guarantee, which protects against partial writes but not against fundamental input corruption (wrong old key configured, etc.).
- **Don't retire the previous key on the same day you start rotation.** Wait until you've verified post-rotation reads work for at least one full deploy cycle. Even a 24-hour soak gives you time to catch missed edge cases.
- **Don't reuse a previous key.** Once retired, never set it again as `ENCRYPTION_KEY` or `ENCRYPTION_KEY_PREVIOUS`. Generate a fresh value with `openssl rand -hex 32` each rotation.
- **Don't run the script outside the application server.** It needs access to the same `uploads/` directory the API reads from. Running it from a separate host means files are not where you think they are.

---

## Notes for cloud edition (S3-backed)

This runbook is for the local provider only. The cloud edition (`STORAGE_PROVIDER=s3`) uses S3 server-side encryption with AES-256, which is keyed independently by AWS. Rotation of the SSE key is handled at the S3 / KMS layer per AWS documentation; the application's `ENCRYPTION_KEY` only encrypts stored secrets (LLM API keys, etc.) at the application layer in cloud mode, not files.
