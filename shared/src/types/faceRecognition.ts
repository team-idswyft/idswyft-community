export interface FaceBufferDetectionResult {
  confidence: number;
  embedding: Float32Array;
  landmarks: Array<{ x: number; y: number }>;
  boundingBox: { x: number; y: number; width: number; height: number };
}
