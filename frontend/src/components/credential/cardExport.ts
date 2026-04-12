import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * Download the card DOM element as a 2x-resolution PNG.
 * Waits for fonts before capture to ensure correct rendering.
 */
export async function downloadCardPng(
  element: HTMLElement,
  filename = 'idswyft-credential.png',
): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
  });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Download the card as a single-page PDF at ISO ID-1 dimensions (85.6 x 53.98mm).
 * Captures a 2x PNG first, then embeds it in the PDF.
 */
export async function downloadCardPdf(
  element: HTMLElement,
  filename = 'idswyft-credential.pdf',
): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    cacheBust: true,
  });

  // ISO ID-1 card: 85.6mm x 53.98mm
  const cardW = 85.6;
  const cardH = 53.98;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [cardH, cardW],
  });
  doc.addImage(dataUrl, 'PNG', 0, 0, cardW, cardH);
  doc.save(filename);
}
