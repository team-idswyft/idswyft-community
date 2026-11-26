/**
 * French document text helpers.
 *
 * Ported from the Preuvid community fork (MIT, https://github.com/Boublo/preuvid).
 * The 2021 French national ID card (CNI) prints dates as space-separated
 * `DD MM YYYY` groups and separates given names with commas. These helpers
 * recover both. They are pure, deterministic, and side-effect free, so the
 * verification pipeline stays auditable.
 */

/**
 * Find space-separated `DD MM YYYY` dates in free text.
 *
 * The 2021 CNI recto writes the date of birth and expiry date with spaces, for
 * example `08 01 1952`. The standard date regex only matches `/`, `-`, or `.`
 * separators, so it misses these. This helper adds them back, but only as a
 * day-month-year reading (DMY hint), and only when the day, month, and year are
 * plausible — so a run of digits is not mistaken for a date.
 *
 * The match requires exactly `DD MM YYYY` with one or two spaces or tabs
 * between groups, and rejects any group touching another digit or a `.`/`-`/`/`
 * so it never slices a longer number or a separator-delimited date. Returns
 * dates as `YYYY-MM-DD`.
 */
export function findSpacedDmyDates(text: string): string[] {
  const results: string[] = [];
  const re = /(?<![\d.\/-])(\d{2})[ \t]{1,2}(\d{2})[ \t]{1,2}(\d{4})(?![\d.\/-])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, d, mo, y] = m;
    const day = parseInt(d, 10);
    const month = parseInt(mo, 10);
    const year = parseInt(y, 10);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2099) {
      continue;
    }
    results.push(`${y}-${mo}-${d}`);
  }
  return results;
}

/**
 * Normalize comma-separated given names to space-separated.
 *
 * The 2021 CNI prints multiple given names separated by commas, for example
 * `JEAN, PIERRE`. Commas are not part of a name, so this collapses them to
 * single spaces. A name with no comma passes through unchanged (apart from
 * trimming), so it is safe to apply to any country's given-name field.
 */
export function normalizeCommaSeparatedNames(value: string): string {
  return value.replace(/\s*,\s*/g, ' ').trim();
}
