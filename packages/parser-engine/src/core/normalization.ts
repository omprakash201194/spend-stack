/**
 * Shared normalization utilities used by all bank parsers.
 *
 * These functions transform raw, bank-specific strings into the canonical
 * representations used throughout the SpendStack import pipeline.
 */

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Attempts to parse a date string written in common Indian bank formats.
 *
 * Supported formats (in priority order):
 *   DD/MM/YYYY   — used by ICICI Bank
 *   DD-MM-YYYY   — used by Kotak, Bank of Baroda
 *   DD MMM YYYY  — e.g. "01 Jan 2024"
 *
 * @returns ISO 8601 date string (YYYY-MM-DD) or null when parsing fails.
 */
export function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const slashOrDash = /^(\d{2})[/\-](\d{2})[/\-](\d{4})$/;
  const sdMatch = slashOrDash.exec(trimmed);
  if (sdMatch) {
    const day = sdMatch[1]!;
    const month = sdMatch[2]!;
    const year = sdMatch[3]!;
    return toIsoDate(year, month, day);
  }

  // DD MMM YYYY  (e.g. "01 Jan 2024")
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const longMatch = /^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(trimmed);
  if (longMatch) {
    const day = longMatch[1]!;
    const abbr = longMatch[2]!.toLowerCase();
    const year = longMatch[3]!;
    const month = monthNames[abbr];
    if (month !== undefined) return toIsoDate(year, month, day);
  }

  return null;
}

function toIsoDate(year: string, month: string, day: string): string {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

/**
 * Parses an amount string that may contain commas, leading/trailing whitespace,
 * or an empty string (representing zero / not-applicable).
 *
 * @returns Parsed numeric value, or null when the string is blank.
 */
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const value = parseFloat(trimmed);
  return isNaN(value) ? null : value;
}

// ---------------------------------------------------------------------------
// Description normalization
// ---------------------------------------------------------------------------

/**
 * Cleans a raw transaction description for consistent display and comparison.
 *
 * - Collapses multiple whitespace characters into a single space.
 * - Strips leading/trailing whitespace.
 * - Converts to upper case for uniform comparison.
 */
export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

// ---------------------------------------------------------------------------
// Fingerprint hashing
// ---------------------------------------------------------------------------

/**
 * Computes a lightweight non-cryptographic hash of a normalized description
 * string.  This hash is used as part of the duplicate detection fingerprint
 * and does NOT need to be cryptographically secure.
 *
 * Uses the FNV-1a 32-bit algorithm for speed and simplicity.
 */
export function hashDescription(normalized: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parses a single CSV line into fields, correctly handling quoted fields that
 * may contain commas or escaped double-quotes ("").
 */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (ch === '"') {
      if (inQuotes && line.charAt(i + 1) === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Splits file content into non-empty lines, stripping Windows-style \r.
 */
export function splitLines(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0);
}
