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

/**
 * Report whether a document is a French identity document.
 *
 * This gate is an Idswyft addition, not from the Preuvid fork: the fork applies
 * the MRZ-merge and confidence-cap path to every document. We restrict that path
 * to French documents, so every other document keeps its current behaviour
 * unchanged. A probe showed the global merge rewrites non-French passport names
 * and confidences, which the French-only acceptance benchmark cannot validate.
 *
 * Keyed on three France-specific signals, any one of which is enough:
 *   - the caller's issuing-country hint is `FR` or `FRA`;
 *   - the document's MRZ issuing state is `FRA` (the caller reads the MRZ first
 *     and passes it; every French format — passport, 2021 CNI, old CNI, driving
 *     licence, residence permit — fills `FRA` here);
 *   - the OCR text contains `FRANÇAISE`, as in `RÉPUBLIQUE FRANÇAISE`. OCR often
 *     drops accents, so `Ç` and `C` both match.
 *
 * The signals are France-specific on purpose, not merely French-language. French
 * is an official language in Belgium, Switzerland, Luxembourg, Québec, and much
 * of West Africa, so generic French phrases (`PERMIS DE CONDUIRE`, `TITRE DE
 * SÉJOUR`, the bilingual `Nom / Surname` labels) appear on their documents too.
 * Gating on those would pull a francophone passport into the merge — exactly the
 * non-French rewrite this gate exists to prevent. Those issuers name themselves
 * otherwise (`ROYAUME DE BELGIQUE`, `CONFÉDÉRATION SUISSE`), and their MRZ
 * issuing state is `BEL`/`CHE`/…, never `FRA`.
 *
 * Deliberately conservative. A miss falls back to the existing path, which is
 * safe; a false positive would change a non-French document, which is not.
 */
export function isFrenchIdDocument(
  rawText: string | null | undefined,
  issuingCountry?: string | null,
  mrzIssuingCountry?: string | null,
): boolean {
  const hint = (issuingCountry ?? '').trim().toUpperCase();
  if (hint === 'FR' || hint === 'FRA') return true;

  if ((mrzIssuingCountry ?? '').trim().toUpperCase() === 'FRA') return true;

  return /FRAN[ÇC]AISE/i.test(rawText ?? '');
}
