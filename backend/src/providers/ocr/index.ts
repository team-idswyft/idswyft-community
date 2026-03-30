import type { OCRProvider } from '@idswyft/shared';
import { PaddleOCRProvider } from './PaddleOCRProvider.js';
import { TesseractProvider } from './TesseractProvider.js';

export function createOCRProvider(): OCRProvider {
  const name = process.env.OCR_PROVIDER ?? 'paddle';

  switch (name) {
    case 'paddle':
      return new PaddleOCRProvider();
    case 'tesseract':
      return new TesseractProvider();
    default:
      return new PaddleOCRProvider();
  }
}

export { PaddleOCRProvider } from './PaddleOCRProvider.js';
export { TesseractProvider } from './TesseractProvider.js';
