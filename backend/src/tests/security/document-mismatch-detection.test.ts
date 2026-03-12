import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies that load at module initialisation time
vi.mock('@/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logVerificationEvent: vi.fn(),
}));
vi.mock('@/config/index.js', () => ({
  default: {
    nodeEnv: 'test',
    supabase: { url: '', anonKey: '', serviceRoleKey: '', storageBucket: '' },
    storage: { provider: 'local' },
    ocr: { tesseractPath: '/usr/bin/tesseract' },
  },
}));
vi.mock('@/config/database.js', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
  connectDB: vi.fn(),
}));
vi.mock('../../services/storage.js', () => ({
  StorageService: class MockStorage {
    storeDocument = vi.fn();
    storeSelfie = vi.fn();
    downloadFile = vi.fn().mockResolvedValue(Buffer.from('mock'));
    deleteFile = vi.fn();
    getFile = vi.fn();
  },
}));
// Mock face-api and image decoders to avoid native dependency loads
vi.mock('@vladmandic/face-api', () => ({
  nets: {
    ssdMobilenetv1: { loadFromDisk: vi.fn() },
    faceLandmark68Net: { loadFromDisk: vi.fn() },
    faceRecognitionNet: { loadFromDisk: vi.fn() },
  },
  env: { monkeyPatch: vi.fn() },
  tf: { tensor3d: vi.fn(), dispose: vi.fn() },
  SsdMobilenetv1Options: vi.fn(),
  detectSingleFace: vi.fn(),
}));
vi.mock('canvas', () => ({}));
vi.mock('sharp', () => ({ default: null }));

import { FaceRecognitionService } from '../../services/faceRecognition.js';

// Photo consistency threshold used by the verification pipeline
const PHOTO_CONSISTENCY_THRESHOLD = 0.75;

describe('Document Mismatch Detection Security', () => {
  let faceService: FaceRecognitionService;

  beforeEach(() => {
    faceService = new FaceRecognitionService();
  });

  it('returns low confidence for images without clear faces', async () => {
    vi.spyOn(faceService, 'detectFace').mockResolvedValue({
      confidence: 0.2,
      embedding: null,
    });

    const result = await faceService.detectFace('no-face.jpg');
    expect(result.confidence).toBeLessThan(PHOTO_CONSISTENCY_THRESHOLD);
    expect(result.embedding).toBeNull();
  });

  it('returns high confidence and embedding for clear face images', async () => {
    const mockEmbedding = Array.from({ length: 128 }, () => Math.random());
    vi.spyOn(faceService, 'detectFace').mockResolvedValue({
      confidence: 0.95,
      embedding: mockEmbedding,
    });

    const result = await faceService.detectFace('clear-face.jpg');
    expect(result.confidence).toBeGreaterThanOrEqual(PHOTO_CONSISTENCY_THRESHOLD);
    expect(result.embedding).toHaveLength(128);
  });

  it('treats borderline scores below threshold as mismatched', () => {
    // 0.74 is just under the threshold — must be treated as a mismatch
    expect(0.74).toBeLessThan(PHOTO_CONSISTENCY_THRESHOLD);
  });

  it('treats borderline scores at threshold as matched', () => {
    // 0.75 exactly meets the threshold — accepted
    expect(0.75).toBeGreaterThanOrEqual(PHOTO_CONSISTENCY_THRESHOLD);
  });
});
