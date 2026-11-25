/**
 * Form 8962, premium tax credit (PTC), 2023–2025, from each year's form and instructions:
 *
 *   Line 1   tax family size: the filer, the spouse on a joint return, and each dependent
 *   Line 2a  modified AGI: AGI + tax-exempt interest (none modelled) + Social Security
 *            benefits not included in income; 2b dependents' MAGI (none modelled)
 *   Line 4   prior-year federal poverty line for the family size (Alaska, Hawaii, or the
 *            other 48 states and DC)
 *   Line 5   household income as a whole percent of it, truncated; over 400% → 401
 *   Line 7   applicable figure (Table 2): 0 to 150%, rising 2 points per 50 to 6% at 300%,
 *            then 2.5 points per 100 to 8.5% at 400% and above, to 4 decimals (half up)
 *   Line 8a  line 3 × line 7, to the whole dollar; 8b = 8a / 12, to the whole dollar
 *   Line 11  annual calculation (one full-year policy, the same each month): (a) premiums,
 *            (b) SLCSP, (c) = 8a, (d) = max(0, b − c), (e) = min(a, d), (f) advance payments
 *   Lines 24–29  PTC vs advance payments: the net PTC goes to Schedule 3 line 9; an excess is
 *            repaid up to the Table 5 limit (none at 400%+) on Schedule 2 line 2 (2023) /
 *            line 1a (2024–2025)
 *
 * Not modelled (reported as unsupported): married filing separately (the exception for
 * victims of domestic abuse or spousal abandonment), household income under 100% of the
 * poverty line, and the monthly calculation, allocation and year-of-marriage parts.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { PTC_POVERTY_LINE, PTC_REPAYMENT_LIMIT } from "../config/tax-year";
import { Rounder, sumWith } from "./rounding";

export interface Form8962Lines {
  line1: number; line2a: number; line2b: number; line3: number;
  table: "alaska" | "hawaii" | "contiguous";
  line4: number; line5: number; line7: number; line8a: number; line8b: number;
  line11: { a: number; b: number; c: number; d: number; e: number; f: number };
  line24: number; line25: number;
  /** Net PTC (Schedule 3 line 9); undefined when line 25 is greater than line 24 (left blank). */
  line26?: number;
  line27: number;
  /** Repayment limitation; undefined at 400% or more (left blank). */
  line28?: number;
  line29: number;
  unsupported: string[];
}

/** Table 2, in basis points: exact tenths of a basis point, rounded half up. */
export function applicableFigure(pct: number): number {
  if (pct <= 150) return 0;
  if (pct >= 400) return 0.085;
  const tenths = pct <= 300 ? (Math.min(pct, 300) - 150) * 40 : 6000 + (pct - 300) * 25;
  return Math.floor((tenths + 5) / 10) / 10000;
}

/** Line 8a: line 3 × line 7 to the whole dollar, half up, in exact integers (cents × basis points). */
export function contributionAmount(householdIncome: number, figure: number): number {
  const product = Math.round(householdIncome * 100) * Math.round(figure * 10000); // dollars × 1e6
  return Math.floor((product + 500000) / 1000000);
}

export function povertyLine(t: FakeTaxpayer, familySize: number): { table: Form8962Lines["table"]; amount: number } {
  const table = t.state === "AK" ? "alaska" : t.state === "HI" ? "hawaii" : "contiguous";
  const [first, each] = PTC_POVERTY_LINE[t.taxYear][table];
  return { table, amount: first + each * (familySize - 1) };
}

export function form8962(
  t: FakeTaxpayer, agi: number, socialSecurity: { line1: number; taxable: number }, R: Rounder,
): Form8962Lines | undefined {
  const policies = t.marketplace1095As ?? [];
  if (!policies.length) return undefined;
  const sum = (xs: number[]) => sumWith(R, xs);
  const unsupported: string[] = [];
  if (t.filingStatus === "MFS") unsupported.push("premium tax credit on a separate return (Form 8962 line A exception)");

  const line1 = 1 + (t.filingStatus === "MFJ" ? 1 : 0) + t.dependents.filter((d) => d.birthYear <= t.taxYear).length;
  const line2a = R(agi + Math.max(0, socialSecurity.line1 - socialSecurity.taxable));
  const line2b = 0;
  const line3 = R(line2a + line2b);
  const { table, amount: line4 } = povertyLine(t, line1);
  const line5 = line3 > line4 * 4 ? 401 : Math.floor((line3 * 100) / line4 + 1e-9);
  if (line5 < 100) unsupported.push("household income under 100% of the federal poverty line (Form 8962 line 5)");
  const line7 = applicableFigure(line5);
  const line8a = contributionAmount(line3, line7);
  const line8b = Math.round(line8a / 12);
  const a = sum(policies.map((p) => p.annualPremium));
  const b = sum(policies.map((p) => p.annualSlcsp));
  const c = line8a;
  const d = Math.max(0, R(b - c));
  const e = Math.min(a, d);
  const f = sum(policies.map((p) => p.annualAdvancePayments));
  const line24 = e, line25 = f;
  const line26 = line24 >= line25 ? R(line24 - line25) : undefined;
  const line27 = line25 > line24 ? R(line25 - line24) : 0;
  const tier = line5 < 200 ? 0 : line5 < 300 ? 1 : line5 < 400 ? 2 : undefined;
  const line28 = line27 > 0 && tier !== undefined ? PTC_REPAYMENT_LIMIT[t.taxYear][tier][t.filingStatus === "Single" ? 0 : 1] : undefined;
  const line29 = line27 > 0 ? (line28 === undefined ? line27 : Math.min(line27, line28)) : 0;
  return {
    line1, line2a, line2b, line3, table, line4, line5, line7, line8a, line8b,
    line11: { a, b, c, d, e, f }, line24, line25, line26, line27, line28, line29, unsupported,
  };
}
