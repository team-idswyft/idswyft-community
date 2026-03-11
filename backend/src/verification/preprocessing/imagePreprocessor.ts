import sharp from 'sharp';
import { ImagePreprocessingError } from '../exceptions.js';

const MIN_FILE_SIZE = 500;           // bytes
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const JPEG_QUALITY = 90;

// JPEG: FF D8 FF
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF];
// PNG: 89 50 4E 47
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];

/**
 * Validates raw image buffer before any processing.
 * Checks file size and format (JPEG or PNG via magic bytes).
 * Throws ImagePreprocessingError if invalid.
 */
export function validateImageInput(buffer: Buffer): void {
  if (!buffer || buffer.length < MIN_FILE_SIZE) {
    throw new ImagePreprocessingError(
      `Image too small (${buffer?.length ?? 0} bytes). Minimum: ${MIN_FILE_SIZE} bytes.`
    );
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new ImagePreprocessingError(
      `Image too large (${buffer.length} bytes). Maximum: ${MAX_FILE_SIZE} bytes.`
    );
  }

  const isJpeg = buffer[0] === JPEG_MAGIC[0] && buffer[1] === JPEG_MAGIC[1] && buffer[2] === JPEG_MAGIC[2];
  const isPng = buffer[0] === PNG_MAGIC[0] && buffer[1] === PNG_MAGIC[1] && buffer[2] === PNG_MAGIC[2] && buffer[3] === PNG_MAGIC[3];

  if (!isJpeg && !isPng) {
    throw new ImagePreprocessingError(
      'Unsupported image format. Only JPEG or PNG accepted.'
    );
  }
}

/**
 * Preprocesses an image buffer for the verification pipeline:
 * 1. Validates format and size
 * 2. Reads metadata to check dimensions
 * 3. Auto-orients based on EXIF data
 * 4. Normalizes output to JPEG buffer
 */
export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  validateImageInput(buffer);

  const image = sharp(buffer);
  const metadata = await image.metadata();

  if ((metadata.width ?? 0) < MIN_WIDTH || (metadata.height ?? 0) < MIN_HEIGHT) {
    throw new ImagePreprocessingError(
      `Image resolution too low (${metadata.width}x${metadata.height}). Minimum: ${MIN_WIDTH}x${MIN_HEIGHT}.`
    );
  }

  // Auto-orient based on EXIF, then normalize to JPEG
  const processed = await image
    .rotate()  // auto-orient from EXIF
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return processed;
}
