import { supabase } from '@/config/database.js';
import config from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import type { VerificationSource } from '@/types/index.js';
import { encryptBlob, maybeDecryptBlob } from './storageCrypto.js';

/**
 * Resolve a stored public-asset URL to an absolute URL when the deployment
 * keeps the frontend and API on different origins.
 *
 * Inputs come from `developers.avatar_url` and `developers.branding_logo_url`,
 * which can hold three populations:
 *   - relative `/api/public/assets/...` paths emitted by `storePublicAsset` for
 *     `local` and `s3` storage providers;
 *   - absolute Supabase-storage public URLs from the `supabase` provider;
 *   - absolute external URLs (GitHub avatars, branding URLs set via the
 *     `PUT /api/developer/settings/branding` form which validates http/https).
 *
 * Apply this helper in every API response that exposes those columns, NOT at
 * write time, so existing relative rows in the DB get the prefix automatically
 * once `PUBLIC_ASSET_BASE_URL` is set in cloud production.
 */
export function resolvePublicAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.storage.publicAssetBaseUrl;
  if (!base) return url;
  return base.replace(/\/+$/, '') + url;
}

/**
 * Build the master-key candidate list for envelope decryption.
 * Order: current ENCRYPTION_KEY first, then ENCRYPTION_KEY_PREVIOUS if set.
 * During key rotation both are configured; new files use the current key,
 * old files (still encrypted under the previous key) decrypt via the fallback.
 */
function masterKeyCandidates(): string[] {
  const current = config.encryptionKey;
  const previous = config.storage.encryptionKeyPrevious;
  const candidates = [current];
  if (previous && previous !== current) candidates.push(previous);
  return candidates;
}

export class StorageService {
  private generateSecureFileName(originalName: string, verificationId: string): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    return `${verificationId}_${timestamp}_${random}${extension}`;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create directory:', error);
      throw new Error('Failed to create storage directory');
    }
  }

  // ─── Bucket routing helpers ─────────────────────────────────

  /**
   * Parse bucket from an encoded file_path.
   * Format: `bucket-name:inner/path` for non-default buckets.
   * Paths without a prefix resolve to the default identity-documents bucket.
   */
  private resolveBucket(filePath: string): { bucket: string; path: string } {
    const idx = filePath.indexOf(':');
    // Guard: the colon must be present, reasonably early, and not look like a
    // Windows drive letter (e.g. C:\...) or absolute path.
    if (idx > 0 && idx < 40 && !filePath.startsWith('/')) {
      return { bucket: filePath.substring(0, idx), path: filePath.substring(idx + 1) };
    }
    return { bucket: config.supabase.storageBucket, path: filePath };
  }

  /** Map a verification source to its target Supabase Storage bucket. */
  getBucketForSource(source: VerificationSource): string {
    if (source === 'vaas') return config.supabase.vaasBucket;
    if (source === 'demo') return config.supabase.demoBucket;
    return config.supabase.storageBucket;
  }

  /** Create non-default buckets on startup if they don't already exist. */
  async ensureBucketsExist(): Promise<void> {
    for (const bucket of [config.supabase.vaasBucket, config.supabase.demoBucket]) {
      const { error } = await supabase.storage.createBucket(bucket, { public: false });
      if (error && !error.message.includes('already exists')) {
        logger.warn('Failed to create bucket', { bucket, error: error.message });
      }
    }
  }

  // ─── Store operations ───────────────────────────────────────

  async storeDocument(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    verificationId: string,
    source: VerificationSource = 'api'
  ): Promise<string> {
    const fileName = this.generateSecureFileName(originalName, verificationId);
    const bucket = this.getBucketForSource(source);

    try {
      if (config.storage.provider === 'supabase') {
        return await this.storeInSupabase(buffer, fileName, 'documents', mimeType, bucket);
      } else if (config.storage.provider === 'local') {
        return await this.storeLocally(buffer, fileName, 'documents');
      } else if (config.storage.provider === 's3') {
        return await this.storeInS3(buffer, fileName, 'documents', mimeType);
      } else {
        throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
      }
    } catch (error) {
      logger.error('Failed to store document:', error);
      throw new Error('Failed to store document');
    }
  }

  async storeSelfie(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    verificationId: string,
    source: VerificationSource = 'api'
  ): Promise<string> {
    const fileName = this.generateSecureFileName(originalName, verificationId);
    const bucket = this.getBucketForSource(source);

    try {
      if (config.storage.provider === 'supabase') {
        return await this.storeInSupabase(buffer, fileName, 'selfies', mimeType, bucket);
      } else if (config.storage.provider === 'local') {
        return await this.storeLocally(buffer, fileName, 'selfies');
      } else if (config.storage.provider === 's3') {
        return await this.storeInS3(buffer, fileName, 'selfies', mimeType);
      } else {
        throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
      }
    } catch (error) {
      logger.error('Failed to store selfie:', error);
      throw new Error('Failed to store selfie');
    }
  }

  private async storeInSupabase(
    buffer: Buffer,
    fileName: string,
    folder: string,
    mimeType: string,
    bucket?: string
  ): Promise<string> {
    const targetBucket = bucket || config.supabase.storageBucket;
    const innerPath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(targetBucket)
      .upload(innerPath, buffer, {
        contentType: mimeType,
        duplex: 'half'
      });

    if (error) {
      logger.error('Supabase storage error:', error);
      throw new Error('Failed to upload to Supabase storage');
    }

    // Encode bucket in returned path for non-default buckets
    const returnPath = targetBucket === config.supabase.storageBucket
      ? data.path
      : `${targetBucket}:${data.path}`;

    logger.info('File stored in Supabase', {
      path: returnPath,
      bucket: targetBucket,
      folder,
      fileName
    });

    return returnPath;
  }

  private async storeLocally(
    buffer: Buffer,
    fileName: string,
    folder: string
  ): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', folder);
    await this.ensureDirectoryExists(uploadDir);

    const filePath = path.join(uploadDir, fileName);

    // Envelope-encrypt before writing if STORAGE_ENCRYPTION=true. The read
    // path detects the magic prefix and decrypts on the fly, so flipping
    // the flag is forward-compatible — existing plaintext files keep working.
    const bytesToWrite = config.storage.encryption
      ? encryptBlob(buffer, config.encryptionKey)
      : buffer;

    await fs.writeFile(filePath, bytesToWrite);

    logger.info('File stored locally', {
      path: filePath,
      folder,
      fileName,
      encrypted: config.storage.encryption,
    });

    return `uploads/${folder}/${fileName}`;
  }

  private async storeInS3(
    buffer: Buffer,
    fileName: string,
    folder: string,
    mimeType: string
  ): Promise<string> {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const client = new S3Client({
      region: config.storage.awsRegion ?? 'us-east-1',
      credentials: {
        accessKeyId: config.storage.awsAccessKey!,
        secretAccessKey: config.storage.awsSecretKey!,
      },
    });

    const key = `${folder}/${fileName}`;

    await client.send(new PutObjectCommand({
      Bucket: config.storage.awsS3Bucket!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256', // Encrypt at rest
    }));

    logger.info('File stored in S3', { bucket: config.storage.awsS3Bucket, key });
    return key;
  }

  // ─── Public asset operations ────────────────────────────────

  /**
   * Store a public asset (branding logo, avatar) and return a publicly
   * accessible URL.  Unlike storeDocument / storeSelfie, this uses upsert
   * so re-uploads overwrite the previous file at the same path.
   */
  async storePublicAsset(
    buffer: Buffer,
    folder: string,
    fileName: string,
    mimeType: string
  ): Promise<string> {
    const storagePath = `${folder}/${fileName}`;

    if (config.storage.provider === 'local') {
      await this.storeLocally(buffer, fileName, folder);
      return `/api/public/assets/${folder}/${fileName}`;

    } else if (config.storage.provider === 'supabase') {
      // Each public-asset folder maps to a dedicated PUBLIC bucket. The
      // default `storageBucket` (identity-documents) is private — it holds
      // end-user passport / driver's-license images — so anything written
      // there ends up with a 404'ing public URL. See migration 60 for the
      // avatars bucket and migration 53 for branding.
      const bucket = folder === 'branding'
        ? 'branding'
        : folder === 'avatars'
          ? 'avatars'
          : config.supabase.storageBucket;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
          duplex: 'half',
        });

      if (error) {
        logger.error('Supabase public asset upload error:', error);
        throw new Error('Failed to upload to Supabase storage');
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      return data.publicUrl;

    } else if (config.storage.provider === 's3') {
      await this.storeInS3(buffer, fileName, folder, mimeType);
      // Proxy through the API server (same as local) so no bucket policy
      // or ACL configuration is needed — objects stay private in S3.
      return `/api/public/assets/${storagePath}`;

    } else {
      throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
    }
  }

  // ─── Read / URL operations ─────────────────────────────────

  async getFileUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (config.storage.provider === 'supabase') {
        const { bucket, path: innerPath } = this.resolveBucket(filePath);
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(innerPath, expiresIn);

        if (!data?.signedUrl) {
          throw new Error('Failed to generate signed URL');
        }

        return data.signedUrl;
      } else if (config.storage.provider === 'local') {
        // For local storage, return a relative path
        // In production, this should be served through a secure endpoint
        return `/files/${filePath}`;
      } else if (config.storage.provider === 's3') {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

        const client = new S3Client({
          region: config.storage.awsRegion ?? 'us-east-1',
          credentials: {
            accessKeyId: config.storage.awsAccessKey!,
            secretAccessKey: config.storage.awsSecretKey!,
          },
        });

        return await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: config.storage.awsS3Bucket!, Key: filePath }),
          { expiresIn }
        );
      } else {
        throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
      }
    } catch (error) {
      logger.error('Failed to get file URL:', error);
      throw new Error('Failed to get file URL');
    }
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      if (config.storage.provider === 'supabase') {
        const { bucket, path: innerPath } = this.resolveBucket(filePath);
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(innerPath);

        if (error || !data) {
          throw new Error('Failed to download from Supabase storage');
        }

        return Buffer.from(await data.arrayBuffer());
      } else if (config.storage.provider === 'local') {
        const fullPath = path.join(process.cwd(), filePath);
        const raw = await fs.readFile(fullPath);
        // Read path is always-on: encrypted files decrypt, legacy plaintext
        // passes through unchanged. Detection is by magic-byte prefix.
        return maybeDecryptBlob(raw, masterKeyCandidates());
      } else if (config.storage.provider === 's3') {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

        const client = new S3Client({
          region: config.storage.awsRegion ?? 'us-east-1',
          credentials: {
            accessKeyId: config.storage.awsAccessKey!,
            secretAccessKey: config.storage.awsSecretKey!,
          },
        });

        const response = await client.send(new GetObjectCommand({
          Bucket: config.storage.awsS3Bucket!,
          Key: filePath,
        }));

        if (!response.Body) {
          throw new Error('Empty response body from S3');
        }

        // Convert readable stream to Buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } else {
        throw new Error(`Unsupported storage provider: ${config.storage.provider}`);
      }
    } catch (error) {
      logger.error('Failed to download file:', error);
      throw new Error('Failed to download file');
    }
  }

  // ─── Delete operations ─────────────────────────────────────

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (config.storage.provider === 'supabase') {
        const { bucket, path: innerPath } = this.resolveBucket(filePath);
        const { error } = await supabase.storage
          .from(bucket)
          .remove([innerPath]);

        if (error) {
          throw new Error('Failed to delete from Supabase storage');
        }
      } else if (config.storage.provider === 'local') {
        const fullPath = path.join(process.cwd(), filePath);
        await fs.unlink(fullPath);
      } else if (config.storage.provider === 's3') {
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

        const client = new S3Client({
          region: config.storage.awsRegion ?? 'us-east-1',
          credentials: {
            accessKeyId: config.storage.awsAccessKey!,
            secretAccessKey: config.storage.awsSecretKey!,
          },
        });

        await client.send(new DeleteObjectCommand({
          Bucket: config.storage.awsS3Bucket!,
          Key: filePath,
        }));
      }

      logger.info('File deleted', { filePath });
    } catch (error) {
      logger.error('Failed to delete file:', error);
      throw new Error('Failed to delete file');
    }
  }

  // GDPR compliance: Delete all files for a user
  async deleteUserFiles(userId: string): Promise<void> {
    try {
      // Get all verification requests for the user
      const { data: verifications, error } = await supabase
        .from('verification_requests')
        .select(`
          id,
          documents(file_path),
          selfies(file_path)
        `)
        .eq('user_id', userId);

      if (error) {
        logger.error('Failed to get user files for deletion:', error);
        throw new Error('Failed to get user files');
      }

      const filesToDelete: string[] = [];

      verifications.forEach((verification: any) => {
        verification.documents?.forEach((doc: any) => {
          if (doc.file_path) filesToDelete.push(doc.file_path);
        });
        verification.selfies?.forEach((selfie: any) => {
          if (selfie.file_path) filesToDelete.push(selfie.file_path);
        });
      });

      // Delete files — resolveBucket() handles bucket routing automatically
      for (const fp of filesToDelete) {
        try {
          await this.deleteFile(fp);
        } catch (error) {
          logger.error(`Failed to delete file ${fp}:`, error);
          // Continue with other files even if one fails
        }
      }

      logger.info('User files deleted for GDPR compliance', {
        userId,
        filesDeleted: filesToDelete.length
      });
    } catch (error) {
      logger.error('Failed to delete user files:', error);
      throw new Error('Failed to delete user files');
    }
  }

  async getLocalFilePath(filePath: string): Promise<string> {
    try {
      if (config.storage.provider === 'local') {
        const fullPath = path.join(process.cwd(), filePath);

        // If envelope encryption is OFF, the on-disk file is plaintext and
        // we can return its path directly — same behavior as before.
        if (!config.storage.encryption) {
          return fullPath;
        }

        // Encryption ON: the on-disk file is ciphertext. Native consumers
        // (OCR libraries, sharp, etc.) that read by path can't handle that,
        // so write a decrypted temp file and return its path. Caller is
        // responsible for cleanup (mirrors the supabase branch below).
        const buffer = await this.downloadFile(filePath);   // handles decrypt
        const tempDir = path.join(process.cwd(), 'temp');
        await this.ensureDirectoryExists(tempDir);
        const fileName = path.basename(filePath);
        const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);
        await fs.writeFile(tempFilePath, buffer);
        return tempFilePath;
      } else if (config.storage.provider === 'supabase') {
        // For Supabase, download to temp directory for processing
        const tempDir = path.join(process.cwd(), 'temp');
        await this.ensureDirectoryExists(tempDir);

        const fileName = path.basename(filePath);
        const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);

        // Download file from Supabase — bucket resolved automatically
        const buffer = await this.downloadFile(filePath);
        await fs.writeFile(tempFilePath, buffer);

        return tempFilePath;
      } else {
        throw new Error(`Local file path not available for provider: ${config.storage.provider}`);
      }
    } catch (error) {
      logger.error('Failed to get local file path:', error);
      throw new Error('Failed to get local file path');
    }
  }

  // Health check for storage service
  async healthCheck(): Promise<{ status: string; provider: string; error?: string }> {
    try {
      if (config.storage.provider === 'supabase') {
        // Try to list files to test connection
        const { error } = await supabase.storage
          .from(config.supabase.storageBucket)
          .list('', { limit: 1 });

        return {
          status: error ? 'error' : 'healthy',
          provider: 'supabase',
          error: error?.message
        };
      } else if (config.storage.provider === 'local') {
        // Check if upload directory exists and is writable
        const uploadDir = path.join(process.cwd(), 'uploads');
        await this.ensureDirectoryExists(uploadDir);

        return {
          status: 'healthy',
          provider: 'local'
        };
      } else {
        return {
          status: 'unknown',
          provider: config.storage.provider
        };
      }
    } catch (error) {
      return {
        status: 'error',
        provider: config.storage.provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
