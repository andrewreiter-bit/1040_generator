/**
 * Form 8606 Parts I and II (2023–2025 layout; 2025 instructions): the nontaxable share of
 * traditional, SEP and SIMPLE IRA distributions and Roth conversions when the person has basis.
 *
 *   Line 3   nondeductible contributions (line 1) + prior basis (line 2); line 5 = line 3
 *            (line 4, contributions made in the next year's filing window, isn't modelled)
 *   Line 9   year-end value (6) + distributions (7, excluding rollovers and conversions) +
 *            conversions (8); line 10 = line 5 ÷ line 9, at most 1, to 5 decimal places
 *   Lines 11–13  nontaxable part of the conversions and of the distributions
 *   Line 14  basis carried to next year; line 15a/15c taxable distributions (no disaster relief)
 *   Lines 16–18  Part II: the taxable part of the conversions
 */
import { Form8606Input } from "../faker/taxpayer";
import { Rounder } from "./rounding";

export interface Form8606Lines {
  line1: number; line2: number; line3: number; line5: number; line6: number; line7: number; line8: number;
  line9: number; line10: number; line11: number; line12: number; line13: number; line14: number;
  line15a: number; line15c: number; line16: number; line17: number; line18: number;
  /** Taxable total for Form 1040 line 4b: line 15c + line 18. */
  taxable: number;
}

export function form8606(x: Form8606Input, R: Rounder): Form8606Lines {
  const line1 = R(x.nondeductibleContributions ?? 0);
  const line2 = R(x.priorBasis);
  const line3 = R(line1 + line2);
  const line5 = line3;
  const line6 = R(x.yearEndValue);
  const line7 = R(x.distributions);
  const line8 = R(x.conversions);
  const line9 = R(line6 + line7 + line8);
  const line10 = line9 > 0 ? Math.min(1, Math.round((line5 / line9) * 1e5) / 1e5) : 0;
  const line11 = R(line8 * line10);
  const line12 = R(line7 * line10);
  const line13 = R(line11 + line12);
  const line14 = Math.max(0, R(line3 - line13));
  const line15a = Math.max(0, R(line7 - line12));
  const line15c = line15a;
  const line16 = line8, line17 = line11;
  const line18 = Math.max(0, R(line16 - line17));
  return { line1, line2, line3, line5, line6, line7, line8, line9, line10, line11, line12, line13, line14, line15a, line15c, line16, line17, line18, taxable: R(line15c + line18) };
}
