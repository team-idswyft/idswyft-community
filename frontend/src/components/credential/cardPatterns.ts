// Card background pattern generators — all output data-URI SVGs for inline use.
// Inline data URIs are required because html-to-image cannot capture CSS
// pseudo-elements or external stylesheets during DOM-to-image conversion.

/** Sine-wave guilloche mesh — tile 120x120, opacity controlled by caller. */
export function guillocheDataUri(): string {
  // Two offset sine waves that create a moiré-style security pattern
  const w = 120, h = 120;
  let paths = '';
  for (let i = 0; i < 6; i++) {
    const y0 = i * 20 + 10;
    let d = `M0,${y0}`;
    for (let x = 0; x <= w; x += 2) {
      const y = y0 + Math.sin((x + i * 15) * 0.12) * 8;
      d += ` L${x},${y.toFixed(1)}`;
    }
    paths += `<path d="${d}" fill="none" stroke="rgba(34,211,238,0.35)" stroke-width="0.5"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const x0 = i * 20 + 10;
    let d = `M${x0},0`;
    for (let y = 0; y <= h; y += 2) {
      const x = x0 + Math.sin((y + i * 15) * 0.12) * 8;
      d += ` L${x.toFixed(1)},${y}`;
    }
    paths += `<path d="${d}" fill="none" stroke="rgba(34,211,238,0.35)" stroke-width="0.5"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${paths}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Diagonal crosshatch grid — tile 16x16. */
export function crosshatchDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <path d="M0,0 L16,16 M16,0 L0,16" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Repeating "IDSWYFT VERIFIED" microtext strip — tile 300x12. */
export function microtextDataUri(): string {
  const text = 'IDSWYFT VERIFIED  \u00b7  '.repeat(4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="12">
    <text x="0" y="9" font-family="monospace" font-size="6" fill="rgba(34,211,238,0.6)" letter-spacing="1">${text}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Pre-encoded idswyft logo — avoids network fetch during export. */
export const IDSWYFT_LOGO_BASE64 =
  'data:image/png;base64,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';
