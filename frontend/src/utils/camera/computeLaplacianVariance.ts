/**
 * Computes the Laplacian variance of a region of the canvas — a measure of image sharpness.
 * Higher values indicate sharper focus; lower values indicate blur.
 *
 * Uses a 3x3 Laplacian kernel [[0,1,0],[1,-4,1],[0,1,0]] on a grayscale conversion
 * of the specified rectangular region.
 */
export function computeLaplacianVariance(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
): number {
  const imageData = ctx.getImageData(x, y, w, h);
  const pixels = imageData.data;
  const width = w;
  const height = h;

  // Convert to grayscale array
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
  }

  // Apply Laplacian kernel [[0,1,0],[1,-4,1],[0,1,0]]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const idx = row * width + col;
      const lap =
        gray[idx - width] +          // top
        gray[idx - 1] +              // left
        -4 * gray[idx] +             // center
        gray[idx + 1] +              // right
        gray[idx + width];            // bottom

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return (sumSq / count) - (mean * mean); // variance
}
