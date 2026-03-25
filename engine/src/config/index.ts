/**
 * Engine Worker Configuration
 * Minimal config — only what the extraction engine needs.
 */
export const config = {
  port: parseInt(process.env.PORT || '3002'),
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key',
  providers: {
    ocr: (process.env.OCR_PROVIDER ?? 'auto') as 'tesseract' | 'openai' | 'azure' | 'aws-textract' | 'auto',
    face: (process.env.FACE_PROVIDER ?? 'tensorflow') as 'tensorflow' | 'aws-rekognition' | 'custom',
    liveness: (process.env.LIVENESS_PROVIDER ?? 'enhanced-heuristic') as 'enhanced-heuristic' | 'custom',
    customOcrEndpoint: process.env.CUSTOM_OCR_ENDPOINT,
    customFaceEndpoint: process.env.CUSTOM_FACE_ENDPOINT,
  },
  ocr: {
    tesseractPath: process.env.TESSERACT_PATH || '/usr/bin/tesseract',
  },
};

export default config;
