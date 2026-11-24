/**
 * Social Security Benefits Worksheet — Lines 6a and 6b (Form 1040 instructions,
 * 2023–2025; § 86). Not modelled: lump-sum payments for prior years (Pub 915),
 * tax-exempt interest, Forms 2555/4563 and Puerto Rico exclusions.
 */
import { FakeTaxpayer, SSA1099 } from "../faker/taxpayer";
import { SOCIAL_SECURITY_TAXABILITY as S } from "../config/tax-year";
import { Rounder, sumWith } from "./rounding";

export interface SocialSecurityLines {
  line1: number;   // total net benefits (box 5) → Form 1040 line 6a
  line2: number;   // 50% of line 1
  line3: number;   // other income: 1040 lines 1z, 2b, 3b, 4b, 5b, 7, 8
  line4: number;   // tax-exempt interest (2a): none modelled
  line5: number;
  line6: number;   // Schedule 1 lines 11–20, 23, 25 (adjustments other than student loan interest)
  line7: number;
  line8: number;   // base amount
  line9: number;
  line10: number;
  line11: number;
  line12: number;
  line13: number;
  line14: number;
  line15: number;
  line16: number;
  line17: number;
  taxable: number; // line 18 → Form 1040 line 6b (or 0 when the worksheet stops early)
  federalWithheld: number;
}

export function includedSsa1099s(t: FakeTaxpayer): SSA1099[] {
  return (t.ssa1099s ?? []).filter((s) => s.recipient !== "spouse" || t.filingStatus === "MFJ");
}

export function socialSecurityWorksheet(
  t: FakeTaxpayer, otherIncome: number, adjustmentsExceptStudentLoan: number, R: Rounder,
): SocialSecurityLines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const forms = includedSsa1099s(t);
  const line1 = sum(forms.map((s) => s.netBenefits));
  const federalWithheld = sum(forms.map((s) => s.federalWithheld));
  const joint = t.filingStatus === "MFJ";
  const together = t.filingStatus === "MFS" && t.mfsLivedWithSpouse !== false;
  const line2 = R(line1 * S.firstTierRate);
  const line3 = R(otherIncome);
  const line4 = 0;
  const line5 = sum([line2, line3, line4]);
  const line6 = R(adjustmentsExceptStudentLoan);
  const line7 = Math.max(0, R(line5 - line6));
  const line8 = together ? 0 : joint ? S.base.joint : S.base.other;
  const line9 = Math.max(0, R(line7 - line8));
  const line10 = together ? 0 : joint ? S.secondTier.joint : S.secondTier.other;
  const line11 = Math.max(0, R(line9 - line10));
  const line12 = Math.min(line9, line10);
  const line13 = R(line12 / 2);
  const line14 = Math.min(line2, line13);
  const line15 = R(line11 * S.secondTierRate);
  const line16 = R(line14 + line15);
  const line17 = R(line1 * S.secondTierRate);
  // The worksheet stops with "none taxable" when line 6 ≥ line 5 or line 8 ≥ line 7.
  const taxable = line1 <= 0 || line6 >= line5 || line9 === 0 ? 0 : Math.min(line16, line17);
  return { line1, line2, line3, line4, line5, line6, line7, line8, line9, line10, line11, line12, line13, line14, line15, line16, line17, taxable, federalWithheld };
}
