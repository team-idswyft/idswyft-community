import { OCRData } from '../types/index.js';
import type { LLMProviderConfig } from './ocr/LLMFieldExtractor.js';

// ── OCR Provider ──────────────────────────────────────
export interface OCRProvider {
  readonly name: string;
  processDocument(buffer: Buffer, documentType: string, issuingCountry?: string, llmConfig?: LLMProviderConfig): Promise<OCRData>;
}

// ── Face Matching Provider ────────────────────────────
export interface FaceMatchingProvider {
  readonly name: string;
  /** Returns a similarity score 0..1 */
  compareFaces(face1: Buffer, face2: Buffer): Promise<number>;
  /** Returns true if a human face is detected */
  detectFace(image: Buffer): Promise<boolean>;
}

// ── Liveness Provider ─────────────────────────────────
export interface LivenessProvider {
  readonly name: string;
  /** Returns a liveness score 0..1 (1 = definitely live person) */
  assessLiveness(imageData: {
    buffer: Buffer;
    width?: number;
    height?: number;
    pixelData?: number[];
  }): Promise<number>;
}

// ── Provider Registry ─────────────────────────────────
export interface ProviderConfig {
  ocr: 'paddle' | 'tesseract' | 'openai' | 'azure' | 'aws-textract' | 'custom';
  face: 'tensorflow' | 'aws-rekognition' | 'custom';
  liveness: 'enhanced-heuristic' | 'custom';
  // For custom providers: URL to HTTP endpoint implementing the interface
  customOcrEndpoint?: string;
  customFaceEndpoint?: string;
  customLivenessEndpoint?: string;
}
