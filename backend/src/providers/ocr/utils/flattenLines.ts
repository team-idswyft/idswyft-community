import type { FlatLine } from '../types.js';

type RecognitionResult = any;

/**
 * Flatten PaddleOCR lines into FlatLine objects that preserve
 * vertical position (y), horizontal position (x), and width.
 *
 * Uses the `box: { x, y, width, height }` property from RecognitionResult.
 */
export function flattenLines(lines: RecognitionResult[][]): FlatLine[] {
  return lines
    .map((lineItems): FlatLine | null => {
      if (lineItems.length === 0) return null;

      // Sort items left-to-right within the line
      const sorted = [...lineItems].sort((a, b) => {
        const ax = a.box?.x ?? 0;
        const bx = b.box?.x ?? 0;
        return ax - bx;
      });

      const texts:    string[] = [];
      let   totalConf          = 0;
      let   minX               = Infinity;
      let   maxX               = 0;
      let   sumY               = 0;

      for (const item of sorted) {
        texts.push(item.text);
        totalConf += item.confidence;

        const bb = item.box;
        if (bb) {
          minX = Math.min(minX, bb.x);
          maxX = Math.max(maxX, bb.x + bb.width);
          sumY += bb.y + bb.height / 2; // vertical center
        }
      }

      return {
        text:       texts.join(' '),
        confidence: totalConf / sorted.length,
        y:          sumY / sorted.length,
        x:          minX === Infinity ? 0 : minX,
        width:      maxX - (minX === Infinity ? 0 : minX),
      };
    })
    .filter((l): l is FlatLine => l !== null)
    .sort((a, b) => a.y - b.y);  // sort top-to-bottom
}
