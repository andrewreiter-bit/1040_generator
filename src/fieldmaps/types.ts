import { FakeTaxpayer } from "../faker/taxpayer";

/**
 * Returns the value to write for a field, or `undefined` to fall back to the
 * template's formula / generic resolver.
 * Checkbox values: "Yes" (checked) or "Off" (unchecked).
 */
export type FieldValue = (t: FakeTaxpayer) => string | undefined;

export interface MappedField {
  /** Stable semantic key, e.g. "line1a", "filingStatus.MFJ", "dep2.ssn". */
  key: string;
  /** Omit to keep the default behaviour while still giving the field a key. */
  value?: FieldValue;
  /** The box holds text (e.g. a payer name) even if the template typed it as an amount. */
  text?: boolean;
}

export interface FieldMap {
  formId: string;
  taxYear: number;
  /**
   * strict = the map is authoritative for this form: unmapped non-formula
   * text fields are left blank and unmapped checkboxes are left unchecked.
   */
  strict: boolean;
  /** Keyed by full pdfFieldName. */
  fields: Record<string, MappedField>;
}

export const CHECK = "Yes";
export const OFF = "Off";
export const BLANK = "";

export const checkIf = (cond: boolean): string => (cond ? CHECK : OFF);

export function money(n: number | null | undefined): string {
  if (n == null) return BLANK;
  return (Math.round(n * 100) / 100).toFixed(2);
}
