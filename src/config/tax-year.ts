import { FilingStatus } from "../faker/taxpayer";

/**
 * Year-specific constants. Values are taken from the text printed on each
 * year's Form 1040 (line 12 / 12e "Standard deduction for—" sidebar).
 */
const STANDARD_DEDUCTION: Record<number, { single: number; mfj: number; hoh: number }> = {
  2023: { single: 13850, mfj: 27700, hoh: 20800 },
  2024: { single: 14600, mfj: 29200, hoh: 21900 },
  2025: { single: 15750, mfj: 31500, hoh: 23625 },
};

export const SUPPORTED_TAX_YEARS = Object.keys(STANDARD_DEDUCTION).map(Number);

/** Basic standard deduction (ignores age/blindness add-ons and dependent limits). */
export function standardDeduction(taxYear: number, status: FilingStatus): number {
  const row = STANDARD_DEDUCTION[taxYear];
  if (!row) throw new Error(`No standard deduction table for tax year ${taxYear}`);
  switch (status) {
    case "Single":
    case "MFS": return row.single;
    case "MFJ":
    case "QSS": return row.mfj;
    case "HOH": return row.hoh;
  }
}
