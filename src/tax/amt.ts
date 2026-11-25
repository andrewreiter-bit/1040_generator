/**
 * Form 6251, alternative minimum tax, 2023–2025 (each year's form and instructions).
 *
 *   Line 1   AGI less total deductions (Form 1040 line 15, or line 11 − line 14 when that's
 *            negative). 2025 splits it (1a/1b) to add back the Schedule 1-A senior deduction,
 *            which the AMT treats as a personal exemption.
 *   Line 2a  taxes from Schedule A line 7 when itemizing, otherwise the standard deduction.
 *   Line 2i  incentive stock options exercised and held at year end: (fair market value −
 *            exercise price) × shares, per Form 3921. The other adjustments (2b–2h, 2j–3)
 *            aren't modelled.
 *   Line 5   exemption, less 25% of AMTI over the phase-out start
 *   Line 7   26% / 28% on the excess, or Part III (maximum capital gains rates) when there are
 *            qualified dividends or a net capital gain
 *   Line 10  regular tax (line 16) plus Schedule 2's excess advance PTC repayment; no foreign
 *            tax credit
 *   Line 11  AMT = line 9 − line 10, → Schedule 2 line 1 (2023) / line 2 (2024–2025)
 *
 * Form 6251 is attached when line 7 is more than line 10.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { AMT, capitalGainsThresholds } from "../config/tax-year";
import { Rounder } from "./rounding";

export interface Form6251Lines {
  line1: number;        // 2023/2024 line 1; 2025 line 1b
  line1a?: number;      // 2025: line 14 less the senior deduction
  line2a: number; line2i: number; line4: number; line5: number; line6: number; line7: number;
  line9: number; line10: number; line11: number;
  partIII?: Record<string, number>;
  unsupported: string[];
}

const statusKey = (t: FakeTaxpayer) => (t.filingStatus === "MFJ" || t.filingStatus === "QSS" ? "joint" : t.filingStatus === "MFS" ? "mfs" : "single");

/** 26% up to the bracket, 28% above it (Form 6251 lines 7, 18, 39). */
function rateTax(t: FakeTaxpayer, amount: number, R: Rounder): number {
  const b = AMT[t.taxYear].bracket / (t.filingStatus === "MFS" ? 2 : 1);
  return amount <= b ? R(amount * 0.26) : R(amount * 0.28 - b * 0.02);
}

export function form6251(t: FakeTaxpayer, args: {
  agi: number; totalDeductions: number; isoAdjustment: number; seniorDeduction: number; itemizes: boolean; scheduleALine7: number;
  standardDeduction: number; taxableIncome: number; qualifiedDividends: number; netCapitalGain: number;
  regularTax: number; excessAptc: number; R: Rounder;
}): Form6251Lines {
  const { R } = args;
  const y = AMT[t.taxYear];
  const k = statusKey(t);
  const y25 = t.taxYear >= 2025;
  const line1a = y25 ? R(args.totalDeductions - args.seniorDeduction) : undefined;
  const line1 = y25 ? R(args.agi - line1a!) : args.taxableIncome > 0 ? args.taxableIncome : R(args.agi - args.totalDeductions);
  const line2a = args.itemizes ? R(args.scheduleALine7) : R(args.standardDeduction);
  const line2i = R(args.isoAdjustment);
  const line4 = R(line1 + line2a + line2i);
  const line5 = Math.max(0, R(y.exemption[k] - Math.max(0, line4 - y.phaseoutStart[k]) * 0.25));
  const line6 = Math.max(0, R(line4 - line5));
  let line7 = 0;
  let partIII: Form6251Lines["partIII"];
  if (line6 > 0) {
    const gains = R(args.qualifiedDividends + Math.max(0, args.netCapitalGain));
    if (gains > 0) {
      // Part III. Line 13/20/27 come from the regular Qualified Dividends and Capital Gain Tax
      // Worksheet (lines 4 and 5); no unrecaptured § 1250 gain (line 14 = 0).
      const { zeroMax, fifteenMax } = capitalGainsThresholds(t.taxYear, t.filingStatus);
      const l12 = line6, l13 = gains, l15 = l13;
      const l16 = Math.min(l12, l15), l17 = R(l12 - l16), l18 = rateTax(t, l17, R);
      const qdcg5 = Math.max(0, R(args.taxableIncome - gains));
      const l19 = zeroMax, l20 = qdcg5, l21 = Math.max(0, R(l19 - l20));
      const l22 = Math.min(l12, l13), l23 = Math.min(l21, l22), l24 = R(l22 - l23);
      const l25 = fifteenMax, l26 = l21, l27 = qdcg5, l28 = R(l26 + l27), l29 = Math.max(0, R(l25 - l28));
      const l30 = Math.min(l24, l29), l31 = R(l30 * 0.15), l32 = R(l23 + l30);
      const l33 = l32 === l12 ? 0 : R(l22 - l32), l34 = R(l33 * 0.2);
      const l38 = R(l18 + l31 + l34), l39 = rateTax(t, l12, R), l40 = Math.min(l38, l39);
      partIII = { l12, l13, l14: 0, l15, l16, l17, l18, l19, l20, l21, l22, l23, l24, l25, l26, l27, l28, l29, l30, l31, l32, l33, l34, l38, l39, l40 };
      line7 = l40;
    } else {
      line7 = rateTax(t, line6, R);
    }
  }
  const line9 = line7;
  const line10 = Math.max(0, R(args.regularTax + args.excessAptc));
  const line11 = Math.max(0, R(line9 - line10));
  // Line 4: a separate filer above the MFS phase-out start + 4 × the MFS exemption adds an extra amount (not modelled).
  const mfsLimit = y.phaseoutStart.mfs + 4 * y.exemption.mfs;
  const unsupported = t.filingStatus === "MFS" && line4 > mfsLimit ? ["AMT: married filing separately with AMTI over the line 4 limit (extra add-back)"] : [];
  return { line1, line1a, line2a, line2i, line4, line5, line6, line7, line9, line10, line11, partIII, unsupported };
}
