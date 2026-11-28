/**
 * computeReturn — an independent calculation of the Form 1040 for the income
 * types the generator supports (W-2 wages, interest, dividends, capital gain
 * distributions, a net capital gain/loss, Schedule C businesses, Forms 1099-R) and the
 * schedules they need (1, 2, 3, C, SE, Forms 8959 / 8960 / 8995).
 *
 * Lines the PDF computes with its own formulas (9, 11, 14, 15, 18, 22, 24, 33,
 * 34) are left to those formulas; the validator compares them with these
 * values so two independent implementations have to agree.
 *
 * Anything the generator cannot yet carry through to the 1040 (Schedules D/E/A
 * detail, Schedule 8812 Part II, EIC, …) is listed in `unsupported` instead of being
 * silently dropped from the totals.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import {
  CREDIT_FOR_OTHER_DEPENDENTS,
  CTC_PHASEOUT_THRESHOLD,
  SENIOR_DEDUCTION,
  STUDENT_LOAN_INTEREST,
  additionalStandardDeduction,
  capitalGainsThresholds,
  standardDeduction,
  taxOnIncome,
  yearConstants,
  QBI_MINIMUM,
  OBBBA_2026,
} from "../config/tax-year";
import { Schedule1APartsIIToIV, schedule1APartsIIToIV } from "./additional-deductions";
import { form8839, Form8839Lines, limitAdoptionCredit } from "./adoption";
import { childTaxCreditCount, eicChildren, includedW2s, is65OrOlder, otherDependentCount, separatedSpouse } from "./household";
import { EicLines, Schedule8812PartII, additionalChildTaxCredit, earnedIncomeCredit } from "./credits";
import { QbiRow,
  BusinessDeductions, Form8995ALines, Form8995Lines, ScheduleCLines, ScheduleSELines,
  businessDeductions, form8995, form8995A, includedScheduleCs, scheduleC, scheduleSE,
} from "./business";
import { Form8959Lines, Form8960Lines, excessSocialSecurity, form8959, form8960 } from "./payroll";
import { Rounder, rounderFor, sumWith } from "./rounding";
import { CapitalResult, computeCapital } from "./capital";
import { ScheduleALines, scheduleA } from "./itemized";
import { Form4952Lines, form4952 } from "./investment-interest";
import { ScheduleRLines, scheduleR } from "./elderly";
import { ScheduleELines, scheduleE } from "./rental";
import { Form8582Lines, PassiveClass, form8582, isRoyalty, isSelfRental, passiveClass } from "./passive";
import { SocialSecurityLines, socialSecurityWorksheet } from "./social-security";
import { RetirementLines, retirementDistributions } from "./retirement";
import { Form8880Lines, form8880 } from "./savers-credit";
import { Form2441Lines, form2441 } from "./dependent-care";
import { Form8863Lines, form8863 } from "./education";
import { Form8962Lines, form8962 } from "./premium-tax-credit";
import { IraDeductionLines, iraDeduction } from "./ira";
import { Form6251Lines, form6251 } from "./amt";
import { HsaLines, form8889 } from "./hsa";

export interface Schedule1Lines {
  businessIncome: number;      // 3
  rentalIncome: number;        // 5 (Schedule E line 26)
  unemployment: number;        // 7
  unemploymentRepaid: number;  // repayment shown beside line 7
  /** 8g: Alaska Permanent Fund dividends (not NII, not earned or EIC investment income). */
  alaskaPfd: number;
  /** 8b: gambling winnings (Forms W-2G box 1); losses (Schedule A line 16) aren't modelled. */
  gamblingWinnings: number;
  hsaDistributions: number;    // 8f (taxable HSA distributions, Form 8889 line 16)
  hsaDeduction: number;        // 13 (Form 8889 line 13)
  hsa?: HsaLines;
  otherIncome: number;         // 9 (lines 8a–8z; 8b, 8f and 8g are modelled)
  additionalIncome: number;    // 10 → 1040 line 8
  educatorExpenses: number;    // 11
  seTaxDeduction: number;      // 15
  healthInsurance: number;     // 17
  earlyWithdrawalPenalty: number; // 18 (1099-INT box 2)
  iraDeduction: number;        // 20
  iraWorksheet?: IraDeductionLines;
  studentLoanInterest: number; // 21
  adjustments: number;         // 26 → 1040 line 10
  required: boolean;
}

export interface Schedule2Lines {
  seTax: number;               // 4
  /** 8: 10% additional tax on code 1 early distributions (Form 5329 not required; box checked). */
  earlyDistributionTax: number;
  /** 13: uncollected Social Security / Medicare tax from W-2 box 12 codes A, B, M and N. */
  uncollectedTax: number;
  /** 17c: additional 20% tax on HSA distributions (Form 8889 line 17b); also line 18. */
  hsaAdditionalTax: number;
  additionalMedicareTax: number; // 11
  niit: number;                // 12
  otherTaxes: number;          // 21 → 1040 line 23
  required: boolean;
}

export interface Schedule3Lines {
  dependentCareCredit: number;  // 2 (Form 2441 line 11)
  educationCredit: number;      // 3 (Form 8863 line 19)
  saversCredit: number;         // 4 (Form 8880 line 12)
  elderlyCredit: number;        // 6d (Schedule R line 22)
  adoptionCredit: number;       // 6c (Form 8839 line 18)
  nonrefundableCredits: number; // 8 → 1040 line 20
  excessSocialSecurity: number; // 11
  netPremiumTaxCredit: number;  // 9 (Form 8962 line 26)
  otherPayments: number;        // 15 → 1040 line 31
  required: boolean;
}

export interface ReturnLines {
  wages: number;               // 1a (W-2 box 1)
  /** 1h: other earned income (disability pensions before minimum retirement age). 1z = 1a + 1h. */
  otherEarnedIncome: number;
  /** Schedule R (credit for the elderly or the disabled), when a box applies. */
  scheduleR?: ScheduleRLines;
  taxableInterest: number;     // 2b
  qualifiedDividends: number;  // 3a
  ordinaryDividends: number;   // 3b
  capitalGainDistributions: number;
  capitalGain: number;         // 7 / 7a (after the loss limit)
  /** § 1(h) net capital gain: smaller of Schedule D lines 15 and 16 (or the distributions alone). */
  netCapitalGain: number;
  scheduleDRequired: boolean;
  capital: CapitalResult;
  /** Lines 4a–5b (Forms 1099-R) and Schedule 2 line 8. */
  retirement: RetirementLines;
  /** Lines 6a / 6b. */
  socialSecurity: SocialSecurityLines;
  youBlind: boolean;
  spouseBlind: boolean;
  /** Line 12: standard deduction (with the 65+ add-on) or Schedule A, whichever is larger. */
  standardDeductionAmount: number;
  /** 2026 on: Form 1040 line 12f, the § 170(p) charitable deduction for a filer who doesn't itemize. */
  charitableDeduction: number;
  /** 2026 on: the § 68 reduction of itemized deductions (included in `deduction`). */
  itemizedLimitation: number;
  itemizes: boolean;
  scheduleA?: ScheduleALines;
  /** Form 4684 Section A totals; filed even without itemizing (a qualified disaster loss raises the standard deduction). */
  form4684?: ScheduleALines["form4684"];
  /** Form 4952, when the filer itemizes with investment interest. */
  form4952?: Form4952Lines;
  scheduleE?: ScheduleELines;
  form8582?: Form8582Lines;
  additionalIncome: number;    // 8 (Schedule 1 line 10)
  totalIncome: number;         // 9
  adjustments: number;         // 10
  agi: number;                 // 11 / 11a
  youAre65: boolean;
  spouseIs65: boolean;
  deduction: number;           // 12 / 12e
  qbiDeduction: number;        // 13 / 13a (2026: 13b)
  /** 2026 on: § 199A(i) minimum deduction ($400 with active QBI of $1,000 or more). */
  qbiMinimum?: { activeQbi: number; amount: number };
  /** Schedule 1-A (line 38 → Form 1040 line 13b for 2025, 13a for 2026): Parts II–V. */
  /** Schedule 1-A: Parts II–IV (tips, overtime, car loan interest) and Part V (seniors); line 38 = 13 + 21 + 30 + 37. */
  schedule1A?: Schedule1APartsIIToIV & { seniorApplies: boolean; magi: number; line33: number; line34: number; line35: number; line36a: number; line36b: number; line37: number; line38: number };
  additionalDeductions: number; // 13b
  totalDeductions: number;     // 14
  taxableIncome: number;       // 15
  tax: number;                 // 16
  scheduleTwoPartOne: number;  // 17 (Schedule 2 line 3: excess advance PTC repayment; no AMT)
  /** Form 6251: always figured; attached (and AMT owed) when line 11 is more than zero. */
  form6251: Form6251Lines;
  /** Schedule 2 Part I: AMT (2023 line 1, 2024–2025 line 2) and the excess advance PTC repayment. */
  alternativeMinimumTax: number;
  excessAdvancePtc: number;
  /** Form 8962 (premium tax credit), when the household had Marketplace coverage. */
  form8962?: Form8962Lines;
  taxBeforeCredits: number;    // 18
  childAndOtherDependentCredit: number; // 19
  scheduleThreeCredits: number;          // 20
  /** Form 8863 (education credits), when the return claims one. */
  form8863?: Form8863Lines;
  /** Form 2441 (child and dependent care credit), when the return claims it. */
  form2441?: Form2441Lines;
  /** Form 8880 (Saver's credit), when the return claims it. */
  form8880?: Form8880Lines;
  totalCredits: number;        // 21
  taxAfterCredits: number;     // 22
  otherTaxes: number;          // 23 (Schedule 2 line 21)
  totalTax: number;            // 24
  w2Withholding: number;       // 25a
  form1099Withholding: number; // 25b
  otherWithholding: number;    // 25c (Form 8959 line 24)
  totalWithholding: number;    // 25d
  estimatedPayments: number;   // 26
  earnedIncomeCredit: number;  // 27 (2025: 27a)
  /** MFS filer who meets the separated-spouse test (§ 32(d)(2)): the 2025 Form 1040 Dependents-section box. */
  separatedSpouse: boolean;
  /** EIC claimed on a separate return under the separated-spouse rule: the 2023/2024 Schedule EIC box. */
  eicSeparatedSpouse: boolean;
  additionalChildTaxCredit: number; // 28
  scheduleThreePayments: number; // 31
  /** 29: refundable American opportunity credit (Form 8863 line 8). */
  americanOpportunityCredit: number;
  /** 2025 on: Form 8839 line 13 → Form 1040 line 30. */
  refundableAdoptionCredit: number;
  form8839?: Form8839Lines;
  refundableCredits: number;   // 32 (27 + 28 + 29 + 31)
  totalPayments: number;       // 33
  overpaid: number;            // 34
  refund: number;              // 35a
  amountOwed: number;          // 37
  scheduleC: ScheduleCLines[];
  scheduleSE: ScheduleSELines[];
  businessDeductions: BusinessDeductions;
  schedule1: Schedule1Lines;
  schedule2: Schedule2Lines;
  schedule3: Schedule3Lines;
  form8959: Form8959Lines;
  form8960: Form8960Lines;
  form8995?: Form8995Lines;
  /** Above the § 199A threshold: Form 8995-A (with Schedules A / C as needed). */
  form8995A?: Form8995ALines;
  /** Schedule 8812 Part I (lines 4–14). */
  schedule8812: {
    ctcChildren: number; otherDependents: number; maxCredit: number; threshold: number;
    reduction: number; afterPhaseout: number; taxLimit: number; credit: number;
    partII: Schedule8812PartII;
    required: boolean;
  };
  eic: EicLines;
  unsupported: string[];
}


/** Qualified Dividends and Capital Gain Tax Worksheet (Form 1040 line 16), 2023–2025 layout. */
function qdcgTax(taxable: number, qualDiv: number, netCapGain: number, t: FakeTaxpayer, R: Rounder): number {
  const { zeroMax, fifteenMax } = capitalGainsThresholds(t.taxYear, t.filingStatus);
  const l1 = taxable;
  const l4 = qualDiv + Math.max(0, netCapGain);
  const l5 = Math.max(0, l1 - l4);
  const l7 = Math.min(l1, zeroMax);
  const l8 = Math.min(l5, l7);
  const l9 = l7 - l8;                       // taxed at 0%
  const l10 = Math.min(l1, l4);
  const l12 = l10 - l9;
  const l14 = Math.min(l1, fifteenMax);
  const l15 = l5 + l9;
  const l16 = Math.max(0, l14 - l15);
  const l17 = Math.min(l12, l16);
  const l18 = R(l17 * 0.15);
  const l20 = l10 - (l9 + l17);
  const l21 = R(l20 * 0.20);
  const l22 = R(taxOnIncome(l5, t.taxYear, t.filingStatus));
  const l23 = R(l18 + l21 + l22);
  const l24 = R(taxOnIncome(l1, t.taxYear, t.filingStatus));
  return Math.min(l23, l24);
}

const memo = new WeakMap<FakeTaxpayer, ReturnLines>();

/** W-2 box 12 codes whose amounts are uncollected tax owed on Schedule 2 line 13. */
const UNCOLLECTED_TAX_CODES = new Set(["A", "B", "M", "N"]);

export function computeReturn(t: FakeTaxpayer): ReturnLines {
  const cached = memo.get(t);
  if (cached) return cached;

  const c = yearConstants(t.taxYear);
  const R = rounderFor(t);
  const round2 = R;
  const sum = (xs: number[]) => sumWith(R, xs);
  const unsupported: string[] = [];
  const w2s = includedW2s(t);

  // ── Income ────────────────────────────────────────────────────────────────
  const wages = sum(w2s.map((w) => w.wages));
  const capitalGainDistributions = sum(t.dividend1099s.map((d) => d.totalCapitalGain));
  const capital = computeCapital(t, capitalGainDistributions, R);
  // Recognized accrued market discount on sales is interest income (§ 1276).
  const taxableInterest = round2(t.totalInterest + capital.marketDiscountInterest);
  const ordinaryDividends = round2(t.totalDividends);
  const qualifiedDividends = round2(t.totalQualifiedDividends);

  const capitalGain = capital.capitalGain;
  const netCapitalGain = capital.netCapitalGain;
  const scheduleDRequired = !!capital.scheduleD;
  if (t.capitalGains != null && !t.capitalSales?.length) {
    unsupported.push("capital gain given only as a net figure (no Form 8949 / Schedule D detail)");
  }

  if (t.businessIncome != null && !t.scheduleCs?.length) unsupported.push("Schedule C business income given only as a net figure (no Schedule C detail)");
  if (yearConstants(t.taxYear).standardMileageRateSecondHalf !== undefined
    && (t.scheduleCs ?? []).some((b) => b.vehicle && b.vehicle.businessMilesSecondHalf === undefined)) {
    unsupported.push("standard mileage without the July–December split of business miles (2026 rate change)");
  }
  if (t.rentalIncome != null && !t.rentals?.length) unsupported.push("rental income given only as a net figure (no Schedule E detail)");
  const schEBase = t.rentals?.length ? scheduleE(t.rentals, R) : undefined;
  if ((schEBase?.columns.length ?? 0) > 3) unsupported.push("more than three rental properties (Schedule E continuation page)");
  if (t.rentals?.some((p) => p.priorYearUnallowedLoss)) unsupported.push("prior-year unallowed passive losses (Form 8582 line 1c)");
  if (t.socialSecurityBenefits != null && !t.ssa1099s?.length) {
    unsupported.push("Social Security benefits given only as a net figure (no SSA-1099 detail)");
  }

  // ── Pensions, annuities and IRAs (lines 4a–5b) ───────────────────────────
  const retirement = retirementDistributions(t, R);
  const retirementIncome = round2(retirement.line4b + retirement.line5b);
  unsupported.push(...retirement.unsupported);
  // Line 1h: disability pensions before minimum retirement age are wages (earned income).
  const otherEarnedIncome = round2(retirement.disabilityPension.primary + retirement.disabilityPension.spouse);
  const line1z = round2(wages + otherEarnedIncome);
  if (retirement.needsForm5329) unsupported.push("code 1 early distribution next to another 1099-R code for the same person (Form 5329)");

  // ── Schedule C / SE ───────────────────────────────────────────────────────
  const scheduleCs = includedScheduleCs(t).map((b) => scheduleC(b, t.taxYear, R));
  const owners = (["primary", "spouse"] as const).filter((o) => scheduleCs.some((c) => c.owner === o));
  const scheduleSEs = owners.map((o) => scheduleSE(o, scheduleCs, w2s, t.taxYear, R));
  const bizDed = businessDeductions(scheduleCs, scheduleSEs, R);

  // ── Schedule 1 ────────────────────────────────────────────────────────────
  const joint = t.filingStatus === "MFJ";
  const businessIncome = sum(scheduleCs.map((c) => c.netProfit));
  const g1099s = (t.unemployment1099Gs ?? []).filter((g) => g.recipient !== "spouse" || joint);
  const unemploymentRepaid = sum(g1099s.map((g) => g.repaidThisYear));
  const unemployment = round2(sum(g1099s.map((g) => g.compensation)) - unemploymentRepaid);
  const alaskaPfd = sum([t.alaskaPermanentFundDividends?.primary ?? 0, joint ? t.alaskaPermanentFundDividends?.spouse ?? 0 : 0]);
  // HSAs (Form 8889): taxable distributions are other income (8f), the deduction an adjustment (13).
  const hsa = form8889(t, w2s, R);
  if (hsa) unsupported.push(...hsa.unsupported);
  const hsaDistributions = hsa?.taxableDistributions ?? 0;
  const hsaDeduction = hsa?.deduction ?? 0;
  const w2gs = (t.gamblingWinnings ?? []).filter((g) => g.recipient !== "spouse" || joint);
  const gamblingWinnings = sum(w2gs.map((g) => g.winnings));
  const otherIncome = round2(gamblingWinnings + alaskaPfd + hsaDistributions);
  const educatorExpenses = sum([
    Math.min(t.educatorExpenses?.primary ?? 0, yearConstants(t.taxYear).educatorExpenseLimit),
    joint ? Math.min(t.educatorExpenses?.spouse ?? 0, yearConstants(t.taxYear).educatorExpenseLimit) : 0,
  ]);
  const seTaxDeduction = sum(scheduleSEs.map((s) => s.deduction));
  const healthInsurance = bizDed.healthInsuranceTotal;
  const earlyWithdrawalPenalty = sum(t.interest1099s.map((i) => i.earlyWithdrawalPenalty ?? 0));

  // Form 8582: rental losses are limited using modified AGI — every AGI item except the
  // passive loss, taxable Social Security, the SE-tax deduction and IRA / student loan
  // interest deductions (net passive income, when there is any, stays in).
  let f8582: Form8582Lines | undefined;
  let schE = schEBase;
  let rentalClasses: PassiveClass[] = [];
  const reProMp = (p: NonNullable<FakeTaxpayer["rentals"]>[number]) => !!t.realEstateProfessional && !!p.materialParticipation && !isRoyalty(p);
  if (schEBase) {
    rentalClasses = schEBase.columns.map((c) => passiveClass(t, c.property, c.net));
    // Line 6: passive activity losses and a real estate professional's rental losses are left out;
    // net passive income and other nonpassive results (self-rental income, portfolio royalties) stay in.
    const passiveNet = sum(schEBase.columns.filter((_, i) => rentalClasses[i] !== "nonpassive").map((c) => c.net));
    const nonpassiveNet = sum(schEBase.columns.filter((c, i) => rentalClasses[i] === "nonpassive" && !(reProMp(c.property) && c.net < 0)).map((c) => c.net));
    const modifiedAgi = round2(
      line1z + taxableInterest + ordinaryDividends + retirementIncome + capitalGain + businessIncome + unemployment + otherIncome + Math.max(0, passiveNet) + nonpassiveNet
      - (educatorExpenses + hsaDeduction + healthInsurance + earlyWithdrawalPenalty),
    );
    f8582 = form8582(t, schEBase.columns.map((c, i) => ({ net: c.net, cls: rentalClasses[i] })), modifiedAgi, R);
    schE = scheduleE(t.rentals!, R, f8582.activities.map((a) => a.allowed));
    if (t.realEstateProfessional) schE = { ...schE, line43: sum(schE.columns.filter((c) => reProMp(c.property)).map((c) => c.net)) };
    if (t.rentals!.some((p) => isRoyalty(p) && p.qbi)) unsupported.push("royalties treated as a § 199A trade or business");
  }
  /** Each column's result on the return: income, or the loss allowed after Form 8582. */
  const rentalResult = (i: number) => { const c = schE!.columns[i]; return c.net > 0 ? c.net : c.deductibleLoss; };
  // Net investment income from Schedule E (Form 8960 line 4a). Excluded as derived in the ordinary
  // course of a trade or business: self-rental income recharacterized as nonpassive (Reg.
  // 1.1411-4(g)(6)) and a real estate professional's materially participated rentals (the
  // (g)(7) safe harbor, taking material participation as its 500 hours).
  const niiRental = schE ? sum(schE.columns.map((c, i) =>
    (isSelfRental(c.property) && rentalClasses[i] === "nonpassive") || reProMp(c.property) ? 0 : rentalResult(i))) : 0;
  const rentalIncome = schE?.line26 ?? 0;
  const additionalIncome = round2(businessIncome + rentalIncome + unemployment + otherIncome);
  // Lines 6a/6b: the worksheet uses every other income line and the adjustments other than
  // student loan interest (whose own worksheet uses line 9, so it comes after). The IRA
  // deduction is one of those adjustments, but its own worksheet needs line 9: figure line 9
  // without it first, then the deduction, then the Social Security worksheet again with it.
  // (Only exact when nobody is covered by a workplace plan or there are no benefits; the
  // other case is Pub 590-A Appendix B and is reported as unsupported.)
  const otherIncome9 = round2(line1z + taxableInterest + ordinaryDividends + retirementIncome + capitalGain + additionalIncome);
  const otherAdjustments = sum([educatorExpenses, hsaDeduction, seTaxDeduction, healthInsurance, earlyWithdrawalPenalty]);
  const ss0 = socialSecurityWorksheet(t, otherIncome9, otherAdjustments, R);
  const ira = iraDeduction(t, w2s, scheduleSEs, round2(otherIncome9 + ss0.taxable), otherAdjustments, ss0.line1 > 0, R);
  if (ira) unsupported.push(...ira.unsupported);
  const iraDeductionAmount = ira?.deduction ?? 0;
  const socialSecurity = iraDeductionAmount ? socialSecurityWorksheet(t, otherIncome9, round2(otherAdjustments + iraDeductionAmount), R) : ss0;
  const totalIncome = round2(otherIncome9 + socialSecurity.taxable);

  // Student Loan Interest Deduction Worksheet (not allowed on MFS).
  let studentLoanInterest = 0;
  if ((t.studentLoanInterestPaid ?? 0) > 0 && t.filingStatus !== "MFS") {
    const w1 = Math.min(t.studentLoanInterestPaid!, STUDENT_LOAN_INTEREST.max);
    const w4 = round2(totalIncome - (otherAdjustments + iraDeductionAmount));
    const start = joint ? c.studentLoanPhaseoutStart.joint : c.studentLoanPhaseoutStart.other;
    const range = joint ? STUDENT_LOAN_INTEREST.phaseoutRange.joint : STUDENT_LOAN_INTEREST.phaseoutRange.other;
    const w6 = Math.min(1, Math.round((Math.max(0, w4 - start) / range) * 1000) / 1000);
    studentLoanInterest = round2(w1 - round2(w1 * w6));
  }
  const adjustments = sum([educatorExpenses, hsaDeduction, seTaxDeduction, healthInsurance, earlyWithdrawalPenalty, iraDeductionAmount, studentLoanInterest]);
  const schedule1: Schedule1Lines = {
    businessIncome, rentalIncome, unemployment, unemploymentRepaid, alaskaPfd, gamblingWinnings, hsaDistributions, hsaDeduction, hsa, otherIncome, additionalIncome, educatorExpenses, seTaxDeduction,
    healthInsurance, earlyWithdrawalPenalty, iraDeduction: iraDeductionAmount, iraWorksheet: ira, studentLoanInterest, adjustments,
    required: additionalIncome !== 0 || adjustments !== 0 || scheduleCs.length > 0 || g1099s.length > 0 || !!schE,
  };

  const agi = round2(totalIncome - adjustments);

  // ── Deductions ────────────────────────────────────────────────────────────
  const youAre65 = is65OrOlder(t.dateOfBirth, t.taxYear);
  const spouseIs65 = t.filingStatus === "MFJ" && is65OrOlder(t.spouseDateOfBirth, t.taxYear);
  // Line 12: the larger of the standard deduction and Schedule A. (Assumes an MFS spouse
  // doesn't itemize, which would force itemizing here; the model can't see that return.)
  const youBlind = !!t.blind;
  const spouseBlind = t.filingStatus === "MFJ" && !!t.spouseBlind;
  const boxes = [youAre65, youBlind, spouseIs65, spouseBlind].filter(Boolean).length;
  // A separate filer whose spouse itemizes has no standard deduction (§ 63(c)(6)(A)).
  const spouseItemizes = t.filingStatus === "MFS" && !!t.spouseItemizes;
  const standardDeductionAmount = spouseItemizes ? 0
    : standardDeduction(t.taxYear, t.filingStatus) + boxes * additionalStandardDeduction(t.taxYear, t.filingStatus);
  // Form 4952: investment interest, deductible on Schedule A line 9 up to net investment income.
  const f4952All = t.investmentInterest
    ? form4952(t.investmentInterest, { taxableInterest, ordinaryDividends, qualifiedDividends, scheduleDLine16: capital.scheduleD?.line16 ?? capitalGain, netCapitalGain }, R)
    : undefined;
  const schA = t.itemized || f4952All ? scheduleA(t, agi, R, gamblingWinnings, f4952All?.line8 ?? 0) : undefined;
  const legacyItemized = !t.itemized && !t.takesStandardDeduction && t.itemizedDeductionTotal != null ? round2(t.itemizedDeductionTotal) : undefined;
  const itemizedAmount = schA?.line17 ?? legacyItemized ?? 0;
  // The larger of the two, or Schedule A when the filer elects to itemize (line 18) or must.
  // A net qualified disaster loss can be added to the standard deduction (Schedule A line 16
  // instructions; Form 4684 line 15) when not itemizing.
  const standardWithDisaster = round2(standardDeductionAmount + (schA?.qualifiedDisasterLoss ?? 0));
  // 2026 on (§ 170(p); Form 1040 line 12f): a filer who doesn't itemize deducts cash gifts to
  // 60%-limit charities, up to $1,000 ($2,000 joint). It counts when choosing whether to itemize.
  const y26 = t.taxYear >= OBBBA_2026.firstYear;
  const qualifyingCash = t.charitableCashGifts ?? t.itemized?.charityByLimit?.cash60 ?? t.itemized?.charityCash ?? 0;
  const nonItemizerCharity = y26 && !spouseItemizes
    ? Math.min(R(qualifyingCash), t.filingStatus === "MFJ" ? OBBBA_2026.nonItemizerCharity.joint : OBBBA_2026.nonItemizerCharity.other)
    : 0;
  const itemizes = itemizedAmount > round2(standardWithDisaster + nonItemizerCharity) || (!!schA && (schA.electToItemize || spouseItemizes));
  const charitableDeduction = itemizes ? 0 : nonItemizerCharity;
  let deduction = itemizes ? itemizedAmount : standardWithDisaster;
  if (schA) unsupported.push(...schA.casualtyUnsupported);
  // Form 4952 is filed (and its line 4g election made) only to claim the Schedule A deduction.
  const f4952 = itemizes ? f4952All : undefined;
  // Line 4g: elected gain isn't taxed at capital-gain rates (net capital gain first, then dividends).
  const prefDividends = round2(qualifiedDividends - (f4952?.electedFromDividends ?? 0));
  const prefGain = round2(netCapitalGain - (f4952?.electedFromGain ?? 0));
  if (itemizes && legacyItemized != null) unsupported.push("itemized deductions given only as a total (no Schedule A detail)");
  if (itemizes && schA?.charityLimitMayApply) {
    unsupported.push("charitable contributions that may exceed an AGI limit (§ 170(b); Pub 526 Worksheet 2)");
  }
  // 2025 Schedule 1-A Part V: enhanced deduction for seniors (married couples must file jointly).
  let schedule1A: ReturnLines["schedule1A"];
  const sd = SENIOR_DEDUCTION;
  const magi = agi;   // Schedule 1-A line 3: + foreign / Puerto Rico exclusions: none modelled
  const partsIIToIV = schedule1APartsIIToIV(t, magi, R);
  const seniorApplies = t.taxYear >= sd.firstYear && t.taxYear <= sd.lastYear && t.filingStatus !== "MFS" && (youAre65 || spouseIs65);
  if (seniorApplies || partsIIToIV.tips || partsIIToIV.overtime || partsIIToIV.carLoan) {
    let line33 = 0, line34 = 0, line35 = 0, line36a = 0, line36b = 0, line37 = 0;
    if (seniorApplies) {
      line33 = Math.max(0, round2(magi - (t.filingStatus === "MFJ" ? sd.threshold.joint : sd.threshold.other)));
      line34 = round2(line33 * sd.phaseoutRate);
      line35 = Math.max(0, round2(sd.amount - line34));
      line36a = youAre65 && t.ssn ? line35 : 0;
      line36b = spouseIs65 && t.spouseSSN ? line35 : 0;
      line37 = round2(line36a + line36b);
    }
    const line38 = round2((partsIIToIV.tips?.line13 ?? 0) + (partsIIToIV.overtime?.line21 ?? 0) + (partsIIToIV.carLoan?.line30 ?? 0) + line37);
    schedule1A = { ...partsIIToIV, seniorApplies, magi, line33, line34, line35, line36a, line36b, line37, line38 };
  }
  const additionalDeductions = schedule1A?.line38 ?? 0;
  let qbi: Form8995Lines | undefined;
  // Only qualified trades or businesses enter Forms 8995 / 8995-A (each keeps its Schedule C index).
  const qbiRows: QbiRow[] = scheduleCs.map((c, i) => ({ c, i })).filter(({ c }) => !c.business.notQualifiedForQbi).map(({ c, i }) => ({
    name: c.business.businessName || c.business.principalBusiness,
    tin: c.business.ein || (c.owner === "spouse" ? t.spouseSSN ?? "" : t.ssn),
    qbi: bizDed.qbiByBusiness[i], w2Wages: c.business.w2WagesPaid ?? 0, ubia: c.business.ubia ?? 0, sstb: !!c.business.sstb,
    source: { kind: "scheduleC", index: i },
  }));
  // Rentals treated as § 199A trades or businesses: the allowed result is QBI (a loss suspended
  // by Form 8582 isn't QBI this year). No W-2 wages or UBIA are modelled for rentals.
  (schE?.columns ?? []).forEach((c, i) => {
    if (!c.property.qbi || isRoyalty(c.property)) return;
    const who = c.property.owner === "spouse" ? "spouse" : "primary";
    qbiRows.push({
      name: `Rental: ${c.property.address.split(",")[0]}`, tin: who === "spouse" ? t.spouseSSN ?? "" : t.ssn,
      qbi: rentalResult(i), w2Wages: 0, ubia: 0, sstb: false, source: { kind: "rental", index: i },
    });
  });
  if (qbiRows.length || t.priorYearQbiLoss) {
    // Form 8995 line 11: taxable income before the QBI deduction (2025: after line 13b).
    qbi = form8995(qbiRows, Math.max(0, round2(agi - deduction - charitableDeduction - additionalDeductions)), round2(qualifiedDividends + netCapitalGain), t, R);
  }
  // Above the threshold: Form 8995-A (W-2 wage / UBIA limit, SSTB phase-out, loss netting).
  const f8995a = qbi?.overThreshold
    ? form8995A(qbiRows, qbi.taxableIncomeBeforeQbi, qbi.netCapitalGain, t, R)
    : undefined;
  const regularQbiDeduction = f8995a ? f8995a.line39 : qbi ? qbi.deduction : 0;
  // § 199A(i) (2026 on): at least $400 when active QBI — from trades or businesses the filer
  // materially participates in (§ 469(h)) — totals $1,000 or more (Form 8995 2026 line 16).
  let qbiMinimum: ReturnLines["qbiMinimum"];
  if (t.taxYear >= QBI_MINIMUM.firstYear && qbiRows.length) {
    const active = qbiRows.filter((row) => row.source.kind === "scheduleC"
      ? (scheduleCs[row.source.index]?.business.materiallyParticipated ?? true)   // row index = included Schedule C
      : !!t.realEstateProfessional && !!t.rentals?.[row.source.index]?.materialParticipation);   // Schedule E columns = t.rentals
    const activeQbi = round2(active.reduce((a, row) => a + row.qbi, 0));
    qbiMinimum = { activeQbi, amount: activeQbi >= QBI_MINIMUM.activeQbi ? QBI_MINIMUM.deduction : 0 };
  }
  const qbiDeduction = Math.max(regularQbiDeduction, qbiMinimum?.amount ?? 0);
  // § 68 (2026 on): itemized deductions are reduced by 2/37 of the lesser of them or the amount by
  // which taxable income before § 68 plus them — AGI less the Schedule 1-A and QBI deductions (the
  // 2026 Form 1040 instructions' test) — exceeds the start of the 37% bracket.
  let itemizedLimitation = 0;
  if (y26 && itemizes) {
    const start = yearConstants(t.taxYear).brackets[t.filingStatus === "MFJ" || t.filingStatus === "QSS" ? "mfj" : t.filingStatus === "MFS" ? "mfs" : t.filingStatus === "HOH" ? "hoh" : "single"].slice(-1)[0];
    const excess = Math.max(0, round2(agi - additionalDeductions - qbiDeduction - start));
    itemizedLimitation = R(Math.min(deduction, excess) * OBBBA_2026.itemizedLimitRate);
    // The QBI deduction itself depends on taxable income after § 68: not modelled together.
    if (itemizedLimitation > 0 && qbiDeduction > 0) unsupported.push("§ 68 itemized deduction limitation together with a QBI deduction");
    deduction = round2(deduction - itemizedLimitation);
  }
  const totalDeductions = round2(deduction + charitableDeduction + qbiDeduction + additionalDeductions);
  const taxableIncome = Math.max(0, round2(agi - totalDeductions));

  // ── Tax ───────────────────────────────────────────────────────────────────
  // Form 8995/8995-A net capital gain isn't reduced by Form 4952 line 4g: Reg. 1.199A-1(b)(3) takes
  // § 1222(11) net capital gain plus qualified dividends; § 1(h)(2)'s reduction is for § 1(h) only.
  const tax = prefDividends > 0 || prefGain > 0
    ? qdcgTax(taxableIncome, prefDividends, prefGain, t, R)
    : R(taxOnIncome(taxableIncome, t.taxYear, t.filingStatus));
  // Schedule 2 Part I: the excess advance PTC repayment (Form 8962 line 29); AMT isn't modelled.
  const f8962 = form8962(t, agi, socialSecurity, R);
  if (f8962) unsupported.push(...f8962.unsupported);
  // The self-employed health insurance deduction and the PTC depend on each other (Rev. Proc. 2014-41).
  if (f8962 && scheduleCs.some((c) => (c.business.healthInsurancePremiums ?? 0) > 0)) {
    unsupported.push("Marketplace coverage with a self-employed health insurance deduction (Rev. Proc. 2014-41 iteration)");
  }
  const excessAdvancePtc = f8962?.line29 ?? 0;
  // Form 6251 line 2i: ISO spread on shares exercised and still held (a spouse's only on a joint return).
  const isoAdjustment = sum((t.isoExercises ?? []).filter((x) => x.employee !== "spouse" || joint)
    .map((x) => R(Math.max(0, x.fairMarketValue - x.exercisePrice) * x.shares)));
  const f6251 = form6251(t, {
    agi, totalDeductions, isoAdjustment, seniorDeduction: schedule1A?.line37 ?? 0, itemizes, scheduleALine7: schA?.line7 ?? 0,
    standardDeduction: standardDeductionAmount, taxableIncome, qualifiedDividends: prefDividends, netCapitalGain: prefGain,
    regularTax: tax, excessAptc: excessAdvancePtc, R,
  });
  unsupported.push(...f6251.unsupported);
  const alternativeMinimumTax = f6251.line11;
  const scheduleTwoPartOne = round2(excessAdvancePtc + alternativeMinimumTax);
  const taxBeforeCredits = round2(tax + scheduleTwoPartOne);

  // ── Child tax credit / credit for other dependents (Schedule 8812 Part I) ──
  const nCtc = childTaxCreditCount(t);
  const nOdc = otherDependentCount(t);
  const maxCredit = nCtc * c.childTaxCreditPerChild + nOdc * CREDIT_FOR_OTHER_DEPENDENTS;
  const threshold = t.filingStatus === "MFJ" ? CTC_PHASEOUT_THRESHOLD.joint : CTC_PHASEOUT_THRESHOLD.other;
  const reduction = agi > threshold ? Math.ceil((agi - threshold) / 1000) * 50 : 0;
  const creditAfterPhaseout = Math.max(0, maxCredit - reduction);
  // Credit order: Form 2441 (Schedule 3 line 2) is limited by line 18; Form 8863 (line 3) by
  // line 18 less line 2; Form 8880 (line 4) by line 18 less lines 1–3; Schedule 8812 Credit
  // Limit Worksheet A then takes lines 2, 3 and 4 off line 18 before the child tax credit.
  const f2441 = form2441(t, w2s, scheduleSEs, agi, taxBeforeCredits, R, retirement.disabilityPension);
  if (f2441) unsupported.push(...f2441.unsupported);
  const dependentCareCredit = f2441?.line11 ?? 0;
  // Schedule R (Schedule 3 line 6d): limited to line 18 less Schedule 3 lines 1, 2 and 6l, and
  // taken off the limits of the credits after it.
  const ageAt = (dob: string | null | undefined) => t.taxYear - Number((dob ?? "").split("/")[2]);
  const schR = scheduleR(t, {
    ages: { primary: ageAt(t.dateOfBirth), spouse: t.filingStatus === "MFJ" ? ageAt(t.spouseDateOfBirth) : null },
    disabilityIncome: retirement.disabilityPension,
    nontaxableSocialSecurity: round2(socialSecurity.line1 - socialSecurity.taxable),
    agi, creditLimit: round2(taxBeforeCredits - dependentCareCredit),
  }, R);
  const elderlyCredit = schR?.line22 ?? 0;
  const f8863 = t.filingStatus === "MFS" ? undefined : form8863(t, agi, taxBeforeCredits, round2(dependentCareCredit + elderlyCredit), R);
  const educationCredit = f8863?.line19 ?? 0;
  const americanOpportunityCredit = f8863?.line8 ?? 0;
  const f8880 = form8880(t, w2s, retirement.records, agi, Math.max(0, round2(taxBeforeCredits - dependentCareCredit - elderlyCredit - educationCredit)), R);
  const saversCredit = f8880.line12;
  const ctcTaxLimit = Math.max(0, round2(taxBeforeCredits - dependentCareCredit - educationCredit - saversCredit - elderlyCredit));
  const childAndOtherDependentCredit = Math.min(creditAfterPhaseout, ctcTaxLimit);
  // Form 8839 (2025 on): the refundable part → line 30; the nonrefundable part (Schedule 3 line 6c)
  // is limited to line 18 less line 19 and the other Schedule 3 credits (§ 23(c): after the CTC).
  let f8839 = form8839(t, agi, R);
  if (f8839) {
    f8839 = limitAdoptionCredit(f8839, round2(ctcTaxLimit - childAndOtherDependentCredit), R);
    unsupported.push(...f8839.unsupported);
  }
  const adoptionCredit = f8839?.line18 ?? 0;
  const refundableAdoptionCredit = f8839?.line13 ?? 0;
  const scheduleThreeCredits = round2(dependentCareCredit + educationCredit + saversCredit + elderlyCredit + adoptionCredit);
  const totalCredits = round2(childAndOtherDependentCredit + scheduleThreeCredits);
  const taxAfterCredits = Math.max(0, round2(taxBeforeCredits - totalCredits));

  // ── Schedule 2 Part II ────────────────────────────────────────────────────
  const f8959 = form8959(t.filingStatus, w2s, scheduleSEs, R);
  const f8960 = form8960(t.filingStatus, agi, taxableInterest, ordinaryDividends, capitalGain, R, rentalIncome, f4952?.line8 ?? 0, round2(niiRental - rentalIncome), t.niitAdditionalModifications ?? 0, t.niitStateIncomeTax ?? 0);
  const seTax = sum(scheduleSEs.map((s) => s.seTax));
  const earlyDistributionTax = retirement.additionalTax;
  // Line 13 (Schedule 2 instructions): "box 12 of Form W-2 with codes A and B or M and N".
  const uncollectedTax = sum(w2s.flatMap((w) => (w.box12 ?? []).filter((e) => UNCOLLECTED_TAX_CODES.has(e.code)).map((e) => e.amount)));
  const hsaAdditionalTax = hsa?.additionalTax ?? 0;
  const otherTaxes = round2(seTax + earlyDistributionTax + f8959.totalTax + f8960.tax + uncollectedTax + hsaAdditionalTax);
  const schedule2: Schedule2Lines = {
    seTax, earlyDistributionTax, uncollectedTax, hsaAdditionalTax, additionalMedicareTax: f8959.totalTax, niit: f8960.tax, otherTaxes,
    required: otherTaxes > 0 || scheduleTwoPartOne > 0,
  };
  const totalTax = round2(taxAfterCredits + otherTaxes);

  // ── Payments ──────────────────────────────────────────────────────────────
  const w2Withholding = sum(w2s.map((w) => w.federalWithheld));
  const form1099Withholding = sum([
    ...t.interest1099s.map((p) => p.federalWithheld ?? 0),
    ...t.dividend1099s.map((p) => p.federalWithheld ?? 0),
    t.otherForm1099Withholding ?? 0,
    capital.federalWithheld,
    ...g1099s.map((g) => g.federalWithheld),
    socialSecurity.federalWithheld,
    retirement.federalWithheld,
  ]);
  // Line 25c: Form 8959 Additional Medicare Tax withheld and Forms W-2G box 4.
  const w2gWithheld = sum((t.gamblingWinnings ?? []).filter((g) => g.recipient !== "spouse" || joint).map((g) => g.federalWithheld));
  const otherWithholding = round2(f8959.additionalWithheld + w2gWithheld);
  const totalWithholding = round2(w2Withholding + form1099Withholding + otherWithholding);
  const estimatedPayments = round2(t.estimatedTaxPayments ?? 0);
  const excessSs = excessSocialSecurity(t, w2s, R).total;
  const schedule3: Schedule3Lines = {
    dependentCareCredit, educationCredit, saversCredit, elderlyCredit, adoptionCredit, nonrefundableCredits: scheduleThreeCredits, excessSocialSecurity: excessSs,
    netPremiumTaxCredit: f8962?.line26 ?? 0, otherPayments: round2(excessSs + (f8962?.line26 ?? 0)),
    required: excessSs > 0 || scheduleThreeCredits > 0 || (f8962?.line26 ?? 0) > 0,
  };
  const scheduleThreePayments = schedule3.otherPayments;

  // ── Earned income credit (line 27) ────────────────────────────────────────
  // Earned income (EIC Worksheet B / Schedule 8812 earned income worksheet): wages plus
  // net self-employment earnings, i.e. Schedule SE line 3 less the line 13 deduction.
  const seEarned = sum(scheduleSEs.map((s) => s.combined - s.deduction));
  const earnedIncome = round2(line1z + seEarned);
  const nEic = eicChildren(t).length;
  // Pub 596 Worksheet 1: interest, dividends, capital gain net income and net passive (rental) income.
  const investmentIncome = round2(taxableInterest + ordinaryDividends + Math.max(0, capitalGain) + Math.max(0, rentalIncome));
  let eic = earnedIncomeCredit(t, nEic, earnedIncome, agi, investmentIncome);
  // A separate return gets EIC only under the separated-spouse rule (§ 32(d)(2)): a qualifying child
  // who lived with the filer more than half the year (every EIC child does) and the filer living
  // apart from the spouse for the last 6 months, or legally separated. The filer then isn't treated
  // as married, so the non-joint column applies. Without a qualifying child, no EIC on a separate
  // return (credits.ts).
  const sepSpouse = separatedSpouse(t);
  if (t.filingStatus === "MFS" && nEic > 0 && !sepSpouse) {
    eic = { ...eic, fromEarnedIncome: 0, fromAgi: null, credit: 0, reasonNone: "married filing separately, not a separated spouse (§ 32(d)(2))" };
  }

  // ── Additional child tax credit (line 28, Schedule 8812 Part II) ─────────
  const partII = additionalChildTaxCredit({
    t, R, ctcChildren: nCtc, line12: creditAfterPhaseout, line14: childAndOtherDependentCredit, earnedIncome,
    socialSecurityMedicareWithheld: sum(w2s.flatMap((w) => [w.ssWithheld, w.medicareWithheld])),
    seTaxDeduction: seTaxDeduction, eic: eic.credit, excessSocialSecurity: excessSs, uncollectedTax,
  });
  const schedule8812 = {
    ctcChildren: nCtc, otherDependents: nOdc, maxCredit, threshold, reduction, afterPhaseout: creditAfterPhaseout,
    taxLimit: ctcTaxLimit, credit: childAndOtherDependentCredit, partII,
    required: maxCredit > 0,
  };
  const refundableCredits = round2(eic.credit + partII.credit + americanOpportunityCredit + refundableAdoptionCredit + scheduleThreePayments);
  const totalPayments = round2(totalWithholding + estimatedPayments + refundableCredits);

  const overpaid = Math.max(0, round2(totalPayments - totalTax));
  const amountOwed = Math.max(0, round2(totalTax - totalPayments));

  const result: ReturnLines = {
    wages, otherEarnedIncome, scheduleR: schR, taxableInterest, qualifiedDividends, ordinaryDividends, capitalGainDistributions,
    capitalGain, netCapitalGain, scheduleDRequired, capital, retirement, socialSecurity, standardDeductionAmount, charitableDeduction, itemizedLimitation, itemizes,
    // Form 4952 is also filed without itemizing when the § 163(d) limit alone disallows the interest
    // (line 8 is $0), to carry line 7 forward.
    scheduleA: itemizes ? schA : undefined, form4684: schA?.form4684,
    form4952: f4952 ?? (f4952All && f4952All.line8 === 0 && f4952All.line7 > 0 && !f4952All.line4g ? f4952All : undefined), scheduleE: schE, form8582: f8582, additionalIncome, totalIncome, adjustments, agi,
    youAre65, spouseIs65, youBlind, spouseBlind, deduction, qbiDeduction, qbiMinimum, schedule1A, additionalDeductions, totalDeductions, taxableIncome,
    // Form 8962 is filed only to claim the PTC or reconcile advance payments.
    tax, scheduleTwoPartOne, form6251: f6251, alternativeMinimumTax, excessAdvancePtc, form8962: f8962 && (f8962.line24 > 0 || f8962.line25 > 0) ? f8962 : undefined, taxBeforeCredits, childAndOtherDependentCredit,
    scheduleThreeCredits, form2441: f2441?.required ? f2441 : undefined, form8880: f8880.required ? f8880 : undefined, totalCredits, taxAfterCredits, otherTaxes, totalTax,
    w2Withholding, form1099Withholding, otherWithholding, totalWithholding, estimatedPayments,
    earnedIncomeCredit: eic.credit, separatedSpouse: sepSpouse, eicSeparatedSpouse: t.filingStatus === "MFS" && eic.credit > 0, additionalChildTaxCredit: partII.credit, americanOpportunityCredit, refundableAdoptionCredit, form8839: f8839,
    form8863: f8863?.required ? f8863 : undefined,
    scheduleThreePayments, refundableCredits, totalPayments, overpaid, refund: overpaid, amountOwed,
    scheduleC: scheduleCs, scheduleSE: scheduleSEs, businessDeductions: bizDed,
    schedule1, schedule2, schedule3, form8959: f8959, form8960: f8960, form8995: qbi, form8995A: f8995a,
    schedule8812, eic,
    unsupported,
  };
  memo.set(t, result);
  return result;
}
