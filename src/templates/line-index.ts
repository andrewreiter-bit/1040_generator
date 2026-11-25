import { FieldDefinition } from "./schema";

export interface LineIndex {
  /** IRS line number (e.g. "11a") → pdfFieldName */
  byLine: Map<string, string>;
  /** pdfFieldName → index in the fields array */
  byField: Map<string, number>;
  /** ordered line keys, preserving fields-array order */
  orderedKeys: string[];
}

/** Labels of the text box that sits next to a line's amount ("16. 3. (specify)", "1h … Enter type"). */
const COMPANION_LABEL = /specify|enter number|enter type|list type|\btype\.?$|form \(enter/i;

/**
 * How well a field represents its line's amount. When several fields share a
 * line number, formulas read the highest-scoring one (first wins on ties).
 * Checkboxes never hold amounts, so they are not indexed at all.
 */
function amountScore(f: FieldDefinition): number {
  if (f.fieldType !== "dollar_amount") return 0;
  return COMPANION_LABEL.test(f.labelHint) ? 1 : 2;
}

export function buildLineIndex(fields: FieldDefinition[]): LineIndex {
  const byLine      = new Map<string, string>();
  const byField     = new Map<string, number>();
  const orderedKeys: string[] = [];
  const bestScore   = new Map<string, number>();

  fields.forEach((f, i) => {
    byField.set(f.pdfFieldName, i);
    if (!f.lineNumber || f.fieldType === "checkbox") return;
    const score = amountScore(f);
    const prev = bestScore.get(f.lineNumber);
    if (prev === undefined) {
      orderedKeys.push(f.lineNumber);
    }
    if (prev === undefined || score > prev) {
      byLine.set(f.lineNumber, f.pdfFieldName);
      bestScore.set(f.lineNumber, score);
    }
  });

  return { byLine, byField, orderedKeys };
}

/**
 * Returns all line keys in [start, end] (inclusive), preserving document order.
 * Returns null if either endpoint isn't in the index.
 */
export function expandRange(
  start: string,
  end: string,
  index: LineIndex
): string[] | null {
  const si = index.orderedKeys.indexOf(start);
  const ei = index.orderedKeys.indexOf(end);
  if (si === -1 || ei === -1) return null;
  return index.orderedKeys.slice(si, ei + 1);
}
