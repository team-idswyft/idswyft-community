import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preprocessImage, validateImageInput } from '../preprocessing/imagePreprocessor.js';
import { ImagePreprocessingError } from '../exceptions.js';

// Mock sharp module
vi.mock('sharp', () => {
  const mockSharp = vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({
      width: 1024,
      height: 768,
      format: 'jpeg',
      orientation: 1,
    }),
    rotate: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
  }));
  return { default: mockSharp };
});

describe('validateImageInput', () => {
  it('rejects buffers smaller than 500 bytes (too small to be real)', () => {
    const tiny = Buffer.alloc(100);
    expect(() => validateImageInput(tiny)).toThrow(ImagePreprocessingError);
    expect(() => validateImageInput(tiny)).toThrow(/too small/i);
  });

  it('rejects buffers larger than 10MB', () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    expect(() => validateImageInput(huge)).toThrow(ImagePreprocessingError);
    expect(() => validateImageInput(huge)).toThrow(/too large/i);
  });

  it('accepts buffers within valid size range', () => {
    const validJpeg = Buffer.alloc(1024);
    // Write JPEG magic bytes
    validJpeg[0] = 0xFF;
    validJpeg[1] = 0xD8;
    validJpeg[2] = 0xFF;
    expect(() => validateImageInput(validJpeg)).not.toThrow();
  });

  it('rejects non-JPEG/PNG formats based on magic bytes', () => {
    const gif = Buffer.alloc(1024);
    // GIF magic bytes
    gif[0] = 0x47; // G
    gif[1] = 0x49; // I
    gif[2] = 0x46; // F
    expect(() => validateImageInput(gif)).toThrow(ImagePreprocessingError);
    expect(() => validateImageInput(gif)).toThrow(/JPEG or PNG/i);
  });

  it('accepts JPEG format (magic bytes FF D8 FF)', () => {
    const jpeg = Buffer.alloc(1024);
    jpeg[0] = 0xFF;
    jpeg[1] = 0xD8;
    jpeg[2] = 0xFF;
    expect(() => validateImageInput(jpeg)).not.toThrow();
  });

  it('accepts PNG format (magic bytes 89 50 4E 47)', () => {
    const png = Buffer.alloc(1024);
    png[0] = 0x89;
    png[1] = 0x50; // P
    png[2] = 0x4E; // N
    png[3] = 0x47; // G
    expect(() => validateImageInput(png)).not.toThrow();
  });
});

describe('preprocessImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Buffer for valid JPEG input', async () => {
    const input = Buffer.alloc(1024);
    input[0] = 0xFF;
    input[1] = 0xD8;
    input[2] = 0xFF;
    const result = await preprocessImage(input);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('throws ImagePreprocessingError for undersized images', async () => {
    const tiny = Buffer.alloc(100);
    await expect(preprocessImage(tiny)).rejects.toThrow(ImagePreprocessingError);
  });

  it('throws ImagePreprocessingError when sharp reports dimensions below 640x480', async () => {
    const { default: sharp } = await import('sharp');
    (sharp as any).mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({
        width: 320,
        height: 240,
        format: 'jpeg',
        orientation: 1,
      }),
      rotate: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('small')),
    });

    const input = Buffer.alloc(1024);
    input[0] = 0xFF;
    input[1] = 0xD8;
    input[2] = 0xFF;
    await expect(preprocessImage(input)).rejects.toThrow(/resolution/i);
  });

  it('auto-orients EXIF rotated images', async () => {
    const { default: sharp } = await import('sharp');
    const mockRotate = vi.fn().mockReturnThis();
    (sharp as any).mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({
        width: 1024,
        height: 768,
        format: 'jpeg',
        orientation: 6, // 90° rotated
      }),
      rotate: mockRotate,
      jpeg: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('rotated')),
    });

    const input = Buffer.alloc(1024);
    input[0] = 0xFF;
    input[1] = 0xD8;
    input[2] = 0xFF;
    await preprocessImage(input);
    // sharp().rotate() with no args auto-orients based on EXIF
    expect(mockRotate).toHaveBeenCalled();
  });

  it('normalizes output to JPEG buffer', async () => {
    const { default: sharp } = await import('sharp');
    const mockJpeg = vi.fn().mockReturnThis();
    (sharp as any).mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({
        width: 1024,
        height: 768,
        format: 'png',
        orientation: 1,
      }),
      rotate: vi.fn().mockReturnThis(),
      jpeg: mockJpeg,
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('jpeg-output')),
    });

    const input = Buffer.alloc(1024);
    // PNG magic bytes
    input[0] = 0x89;
    input[1] = 0x50;
    input[2] = 0x4E;
    input[3] = 0x47;
    await preprocessImage(input);
    expect(mockJpeg).toHaveBeenCalledWith({ quality: 90 });
  });
});
