/**
 * Schedule B (Interest and Ordinary Dividends) field map, 2023–2025.
 *
 * Part I line 1 and Part II line 5 are payer-name / amount pairs (14 and 15
 * rows); lines 2 and 6 are the totals that carry to Form 1040 lines 2b and 3b.
 * Part III: no foreign accounts (7a No, FinCEN sub-question blank) and no
 * foreign trust (8 No). Field names are identical across years except the
 * 2025 PDF nests the 7a boxes under "TagcorrectingSubform".
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { namesOnReturn } from "../tax/household";
import { computeReturn } from "../tax/compute";
import { BLANK, CHECK, FieldMap, FieldValue, MappedField, OFF, money } from "./types";

const P1 = "topmostSubform[0].Page1[0].";
const f = (n: number) => `${P1}f1_${String(n).padStart(2, "0")}[0]`;

const INTEREST_ROWS = 14;
const DIVIDEND_ROWS = 15;

/** Part I row r (0-based): name field, amount field. Row 0's name box is under Line1_ReadOrder. */
function interestRow(r: number): [string, string] {
  if (r === 0) return [`${P1}Line1_ReadOrder[0].f1_03[0]`, f(4)];
  return [f(5 + (r - 1) * 2), f(6 + (r - 1) * 2)];
}

/** Part II row r (0-based). Row 0's name box is under ReadOrderControl. */
function dividendRow(r: number): [string, string] {
  if (r === 0) return [`${P1}ReadOrderControl[0].f1_34[0]`, f(35)];
  return [f(36 + (r - 1) * 2), f(37 + (r - 1) * 2)];
}

/** Part I rows: each 1099-INT payer, then accrued market discount recognized on sales (by broker). */
export function scheduleBInterestRows(t: FakeTaxpayer): Array<{ payer: string; amount: number }> {
  const rows = t.interest1099s.map((p) => ({ payer: p.payerName, amount: p.interestIncome }));
  const byBroker = new Map<string, number>();
  for (const r of computeReturn(t).capital.rows) {
    if (r.marketDiscount) byBroker.set(r.sale.brokerName, (byBroker.get(r.sale.brokerName) ?? 0) + r.marketDiscount);
  }
  for (const [broker, amount] of byBroker) rows.push({ payer: `${broker} (accrued market discount)`, amount });
  return rows;
}

export const scheduleBInterestTotal = (t: FakeTaxpayer) =>
  Math.round(scheduleBInterestRows(t).reduce((s, p) => s + p.amount, 0) * 100) / 100;
export const scheduleBDividendTotal = (t: FakeTaxpayer) =>
  Math.round(t.dividend1099s.reduce((s, p) => s + p.ordinaryDividends, 0) * 100) / 100;

function buildMap(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value?: FieldValue, text = false) => { fields[name] = { key, value, ...(text ? { text } : {}) }; };

  add(f(1), "names", (t) => namesOnReturn(t));
  add(f(2), "ssn", (t) => t.ssn);

  for (let r = 0; r < INTEREST_ROWS; r++) {
    const [name, amount] = interestRow(r);
    add(name, `int${r + 1}.payer`, (t) => scheduleBInterestRows(t)[r]?.payer ?? BLANK, true);
    add(amount, `int${r + 1}.amount`, (t) => money(scheduleBInterestRows(t)[r]?.amount));
  }
  add(f(31), "line2", (t) => money(scheduleBInterestTotal(t)));
  add(f(32), "line3", () => BLANK);   // excludable savings bond interest (Form 8815): none
  add(f(33), "line4");                // formula: line 2 − line 3

  for (let r = 0; r < DIVIDEND_ROWS; r++) {
    const [name, amount] = dividendRow(r);
    add(name, `div${r + 1}.payer`, (t) => t.dividend1099s[r]?.payerName ?? BLANK, true);
    add(amount, `div${r + 1}.amount`, (t) => money(t.dividend1099s[r]?.ordinaryDividends));
  }
  add(f(64), "line6", (t) => money(scheduleBDividendTotal(t)));

  const q7a = taxYear >= 2025 ? `${P1}TagcorrectingSubform[0].` : P1;
  add(`${q7a}c1_1[0]`, "foreignAccountYes", () => OFF);
  add(`${q7a}c1_1[1]`, "foreignAccountNo", () => CHECK);
  add(`${P1}c1_2[0]`, "fincenYes", () => OFF);
  add(`${P1}c1_2[1]`, "fincenNo", () => OFF);
  add(`${P1}c1_3[0]`, "foreignTrustYes", () => OFF);
  add(`${P1}c1_3[1]`, "foreignTrustNo", () => CHECK);

  return { formId: "f1040sb", taxYear, strict: true, fields };
}

export const F1040SB_MAPS: FieldMap[] = [2023, 2024, 2025].map(buildMap);
