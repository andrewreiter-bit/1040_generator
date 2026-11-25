/**
 * Form 4952, investment interest expense deduction (2023–2025 forms; the instructions are printed
 * on the form). Filed only with Schedule A: line 8 is the deduction on Schedule A line 9.
 *
 *   Line 3   this year's investment interest (line 1) + the disallowed amount carried from last
 *            year's line 7 (line 2)
 *   Line 4a  gross investment income: taxable interest and ordinary dividends (Alaska Permanent
 *            Fund dividends excluded; annuities and royalties aren't modelled)
 *   Line 4b  qualified dividends on 4a; 4c = 4a − 4b
 *   Line 4d  net gain from the disposition of investment property: Schedule D line 16 when positive
 *            (it includes capital gain distributions and loss carryovers)
 *   Line 4e  smaller of 4d and the net capital gain (net long-term gain over net short-term loss)
 *   Line 4g  the elected amount, at most 4b + 4e. It's attributed first to 4e, then 4b, and that
 *            much is taken out of the gain taxed at capital-gain rates (Schedule D Tax Worksheet
 *            line 3), here by reducing the net capital gain and qualified dividends fed to the
 *            Qualified Dividends and Capital Gain Tax Worksheet and Form 6251 Part III.
 *   Line 5   investment expenses: $0 (miscellaneous itemized deductions aren't allowed 2018–2025)
 *   Line 6   4h − 5; line 7 carries 3 − 6 forward; line 8 = smaller of 3 and 6
 */
import { InvestmentInterest } from "../faker/taxpayer";
import { Rounder } from "./rounding";

export interface Form4952Lines {
  line1: number; line2: number; line3: number;
  line4a: number; line4b: number; line4c: number; line4d: number; line4e: number; line4f: number;
  line4g: number; line4h: number; line5: number; line6: number; line7: number; line8: number;
  /** Part of line 4g taken from the net capital gain and from qualified dividends. */
  electedFromGain: number; electedFromDividends: number;
  /**
   * Whether the form must be filed. Not when (Who Must File, exception) interest and ordinary
   * dividends less qualified dividends exceed the investment interest, there are no other
   * investment expenses, and there's no carryover. The deduction is the same either way.
   */
  required: boolean;
}

export function form4952(
  input: InvestmentInterest,
  amounts: { taxableInterest: number; ordinaryDividends: number; qualifiedDividends: number; scheduleDLine16: number; netCapitalGain: number },
  R: Rounder,
): Form4952Lines {
  const line1 = R(input.paid);
  const line2 = R(input.priorYearDisallowed ?? 0);
  const line3 = R(line1 + line2);
  const line4a = R(amounts.taxableInterest + amounts.ordinaryDividends);
  const line4b = R(amounts.qualifiedDividends);
  const line4c = Math.max(0, R(line4a - line4b));
  const line4d = Math.max(0, R(amounts.scheduleDLine16));
  const line4e = Math.min(line4d, Math.max(0, R(amounts.netCapitalGain)));
  const line4f = R(line4d - line4e);
  const line4g = Math.min(R(input.electedQdcg ?? 0), R(line4b + line4e));
  const line4h = R(line4c + line4f + line4g);
  const line5 = 0;
  const line6 = Math.max(0, R(line4h - line5));
  const line7 = Math.max(0, R(line3 - line6));
  const line8 = Math.min(line3, line6);
  const electedFromGain = Math.min(line4g, line4e);
  return {
    line1, line2, line3, line4a, line4b, line4c, line4d, line4e, line4f, line4g, line4h, line5, line6, line7, line8,
    electedFromGain, electedFromDividends: R(line4g - electedFromGain),
    required: !(line4c > line1 && line5 === 0 && line2 === 0) || line4g > 0,
  };
}
