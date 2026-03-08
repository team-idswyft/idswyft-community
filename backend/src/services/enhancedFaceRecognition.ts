/**
 * Stub for EnhancedFaceRecognitionService.
 * The real implementation requires optional heavy dependencies (TensorFlow, Sharp)
 * that are not bundled by default. Code that imports this should always do so
 * inside a try/catch so callers fall back to lighter heuristics.
 */
export class EnhancedFaceRecognitionService {
  async compareFaces(_imagePath1: string, _imagePath2: string): Promise<number> {
    throw new Error('EnhancedFaceRecognitionService: optional dependencies not installed');
  }

  async detectLiveness(_imagePath: string): Promise<number> {
    throw new Error('EnhancedFaceRecognitionService: optional dependencies not installed');
  }
}
