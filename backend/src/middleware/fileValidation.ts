import { fileTypeFromBuffer } from 'file-type';
import { logger } from '@/utils/logger.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export interface FileValidationResult {
  valid: boolean;
  detectedType?: string;
  reason?: string;
}

export async function validateFileType(
  buffer: Buffer,
  allowedTypes: string[] = ALLOWED_MIME_TYPES
): Promise<FileValidationResult> {
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    return {
      valid: false,
      reason: 'Could not determine file type from content'
    };
  }

  if (!allowedTypes.includes(detected.mime)) {
    logger.warn('File type mismatch detected', {
      detectedMime: detected.mime,
      allowedTypes
    });
    return {
      valid: false,
      detectedType: detected.mime,
      reason: `File type '${detected.mime}' not in allowed types: ${allowedTypes.join(', ')}`
    };
  }

  return { valid: true, detectedType: detected.mime };
}
