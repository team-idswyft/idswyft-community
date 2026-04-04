import { readFileSync } from 'fs';
import { logger } from '@/utils/logger.js';

interface OFACEntry {
  name: string;
  list: string;
  dob?: string;
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Extract DOB from OFAC remarks field.
 * Pattern: "DOB dd Mon yyyy" e.g. "DOB 15 Mar 1985"
 */
function extractDOB(remarks: string): string | undefined {
  const match = remarks.match(/DOB\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i);
  if (!match) return undefined;
  const [, day, mon, year] = match;
  const monthNum = MONTH_MAP[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()];
  if (!monthNum) return undefined;
  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Parse OFAC SDN pipe-delimited CSV content into entries.
 * Columns: ent_num | SDN_Name | SDN_Type | Program | Title | Call_Sign | Vess_type | Tonnage | GRT | Vess_flag | Vess_owner | Remarks
 */
function parseSDNCSV(content: string): OFACEntry[] {
  const entries: OFACEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Pipe-delimited: split by |, but fields may contain quotes
    const fields = trimmed.split('|').map(f => f.trim().replace(/^"|"$/g, ''));

    if (fields.length < 3) continue;

    const sdnName = fields[1];
    const sdnType = fields[2];

    // Only include individuals, skip entities/vessels
    if (!sdnType || sdnType.toLowerCase() !== 'individual') continue;
    if (!sdnName || sdnName === '-0-') continue;

    const remarks = fields[11] || '';
    const dob = extractDOB(remarks);

    entries.push({
      name: sdnName,
      list: 'us_ofac_sdn',
      ...(dob && { dob }),
    });
  }

  return entries;
}

/**
 * Load OFAC SDN entries from a local file.
 */
export function loadOFACFromFile(filePath: string): OFACEntry[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const entries = parseSDNCSV(content);
    logger.info(`OFAC loader: parsed ${entries.length} individuals from ${filePath}`);
    return entries;
  } catch (err) {
    logger.error(`OFAC loader: failed to read ${filePath}:`, err);
    return [];
  }
}

/**
 * Download and parse OFAC SDN CSV from URL.
 * Default: US Treasury SDN list.
 */
export async function loadOFACFromURL(
  url = 'https://www.treasury.gov/ofac/downloads/sdn.csv'
): Promise<OFACEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.error(`OFAC loader: HTTP ${res.status} from ${url}`);
      return [];
    }

    const content = await res.text();
    const entries = parseSDNCSV(content);
    logger.info(`OFAC loader: parsed ${entries.length} individuals from ${url}`);
    return entries;
  } catch (err) {
    logger.error(`OFAC loader: failed to fetch ${url}:`, err);
    return [];
  }
}

// Export parseSDNCSV and extractDOB for testing
export { parseSDNCSV, extractDOB };
