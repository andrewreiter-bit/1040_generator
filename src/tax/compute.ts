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
  EDUCATOR_EXPENSE_LIMIT,
  SENIOR_DEDUCTION,
  STUDENT_LOAN_INTEREST,
  additionalStandardDeduction,
  capitalGainsThresholds,
  standardDeduction,
  taxOnIncome,
  yearConstants,
} from "../config/tax-year";
import { childTaxCreditCount, eicChildren, includedW2s, is65OrOlder, otherDependentCount } from "./household";
import { EicLines, Schedule8812PartII, additionalChildTaxCredit, earnedIncomeCredit } from "./credits";
import {
  BusinessDeductions, Form8995ALines, Form8995Lines, ScheduleCLines, ScheduleSELines,
  businessDeductions, form8995, form8995A, includedScheduleCs, scheduleC, scheduleSE,
} from "./business";
import { Form8959Lines, Form8960Lines, excessSocialSecurity, form8959, form8960 } from "./payroll";
import { Rounder, rounderFor, sumWith } from "./rounding";
import { CapitalResult, computeCapital } from "./capital";
import { ScheduleALines, scheduleA } from "./itemized";
import { ScheduleELines, scheduleE } from "./rental";
import { Form8582Lines, form8582 } from "./passive";
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
  nonrefundableCredits: number; // 8 → 1040 line 20
  excessSocialSecurity: number; // 11
  netPremiumTaxCredit: number;  // 9 (Form 8962 line 26)
  otherPayments: number;        // 15 → 1040 line 31
  required: boolean;
}

export interface ReturnLines {
  wages: number;               // 1a / 1z
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
  itemizes: boolean;
  scheduleA?: ScheduleALines;
  scheduleE?: ScheduleELines;
  form8582?: Form8582Lines;
  additionalIncome: number;    // 8 (Schedule 1 line 10)
  totalIncome: number;         // 9
  adjustments: number;         // 10
  agi: number;                 // 11 / 11a
  youAre65: boolean;
  spouseIs65: boolean;
  deduction: number;           // 12 / 12e
  qbiDeduction: number;        // 13 / 13a
  /** 2025 Schedule 1-A (line 38 → Form 1040 line 13b); only Part V (seniors) is modelled. */
  schedule1A?: { magi: number; line33: number; line34: number; line35: number; line36a: number; line36b: number; line37: number; line38: number };
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
  additionalChildTaxCredit: number; // 28
  scheduleThreePayments: number; // 31
  /** 29: refundable American opportunity credit (Form 8863 line 8). */
  americanOpportunityCredit: number;
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
  if (t.rentalIncome != null && !t.rentals?.length) unsupported.push("rental income given only as a net figure (no Schedule E detail)");
  const schEBase = t.rentals?.length ? scheduleE(t.rentals, R) : undefined;
  if ((schEBase?.columns.length ?? 0) > 3) unsupported.push("more than three rental properties (Schedule E continuation page)");
  if (t.rentals?.some((p) => p.priorYearUnallowedLoss)) unsupported.push("prior-year unallowed passive losses (Form 8582 line 1c)");
  if (t.rentals?.some((p) => p.activeParticipation === false)) unsupported.push("rental without active participation (Form 8582 Part V)");
  if (t.socialSecurityBenefits != null && !t.ssa1099s?.length) {
    unsupported.push("Social Security benefits given only as a net figure (no SSA-1099 detail)");
  }

  // ── Pensions, annuities and IRAs (lines 4a–5b) ───────────────────────────
  const retirement = retirementDistributions(t, R);
  const retirementIncome = round2(retirement.line4b + retirement.line5b);
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
    Math.min(t.educatorExpenses?.primary ?? 0, EDUCATOR_EXPENSE_LIMIT),
    joint ? Math.min(t.educatorExpenses?.spouse ?? 0, EDUCATOR_EXPENSE_LIMIT) : 0,
  ]);
  const seTaxDeduction = sum(scheduleSEs.map((s) => s.deduction));
  const healthInsurance = bizDed.healthInsuranceTotal;
  const earlyWithdrawalPenalty = sum(t.interest1099s.map((i) => i.earlyWithdrawalPenalty ?? 0));

  // Form 8582: rental losses are limited using modified AGI — every AGI item except the
  // passive loss, taxable Social Security, the SE-tax deduction and IRA / student loan
  // interest deductions (net passive income, when there is any, stays in).
  let f8582: Form8582Lines | undefined;
  let schE = schEBase;
  if (schEBase) {
    const nets = schEBase.columns.map((c) => c.net);
    const netPassive = sum(nets);
    const modifiedAgi = round2(
      wages + taxableInterest + ordinaryDividends + retirementIncome + capitalGain + businessIncome + unemployment + otherIncome + Math.max(0, netPassive)
      - (educatorExpenses + hsaDeduction + healthInsurance + earlyWithdrawalPenalty),
    );
    f8582 = form8582(t, nets, modifiedAgi, R);
    schE = scheduleE(t.rentals!, R, f8582.activities.map((a) => a.allowed));
  }
  const rentalIncome = schE?.line26 ?? 0;
  const additionalIncome = round2(businessIncome + rentalIncome + unemployment + otherIncome);
  // Lines 6a/6b: the worksheet uses every other income line and the adjustments other than
  // student loan interest (whose own worksheet uses line 9, so it comes after). The IRA
  // deduction is one of those adjustments, but its own worksheet needs line 9: figure line 9
  // without it first, then the deduction, then the Social Security worksheet again with it.
  // (Only exact when nobody is covered by a workplace plan or there are no benefits; the
  // other case is Pub 590-A Appendix B and is reported as unsupported.)
  const otherIncome9 = round2(wages + taxableInterest + ordinaryDividends + retirementIncome + capitalGain + additionalIncome);
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
  const schA = t.itemized ? scheduleA(t, agi, R, gamblingWinnings) : undefined;
  const legacyItemized = !t.itemized && !t.takesStandardDeduction && t.itemizedDeductionTotal != null ? round2(t.itemizedDeductionTotal) : undefined;
  const itemizedAmount = schA?.line17 ?? legacyItemized ?? 0;
  // The larger of the two, or Schedule A when the filer elects to itemize (line 18) or must.
  const itemizes = itemizedAmount > standardDeductionAmount || (!!schA && (schA.electToItemize || spouseItemizes));
  const deduction = itemizes ? itemizedAmount : standardDeductionAmount;
  if (itemizes && legacyItemized != null) unsupported.push("itemized deductions given only as a total (no Schedule A detail)");
  if (itemizes && schA?.charityLimitMayApply) {
    unsupported.push("charitable contributions that may exceed an AGI limit (§ 170(b); Pub 526 Worksheet 2)");
  }
  // 2025 Schedule 1-A Part V: enhanced deduction for seniors (married couples must file jointly).
  let schedule1A: ReturnLines["schedule1A"];
  const sd = SENIOR_DEDUCTION;
  if (t.taxYear >= sd.firstYear && t.taxYear <= sd.lastYear && t.filingStatus !== "MFS" && (youAre65 || spouseIs65)) {
    const magi = agi;   // + foreign / Puerto Rico exclusions: none modelled
    const line33 = Math.max(0, round2(magi - (t.filingStatus === "MFJ" ? sd.threshold.joint : sd.threshold.other)));
    const line34 = round2(line33 * sd.phaseoutRate);
    const line35 = Math.max(0, round2(sd.amount - line34));
    const line36a = youAre65 && t.ssn ? line35 : 0;
    const line36b = spouseIs65 && t.spouseSSN ? line35 : 0;
    const line37 = round2(line36a + line36b);
    schedule1A = { magi, line33, line34, line35, line36a, line36b, line37, line38: line37 };
  }
  const additionalDeductions = schedule1A?.line38 ?? 0;
  let qbi: Form8995Lines | undefined;
  // Only qualified trades or businesses enter Forms 8995 / 8995-A (each keeps its Schedule C index).
  const qbiIdx = scheduleCs.map((_, i) => i).filter((i) => !scheduleCs[i].business.notQualifiedForQbi);
  const qbiAmounts = qbiIdx.map((i) => bizDed.qbiByBusiness[i]);
  if (qbiIdx.length || t.priorYearQbiLoss) {
    // Form 8995 line 11: taxable income before the QBI deduction (2025: after line 13b).
    qbi = form8995(qbiAmounts, Math.max(0, round2(agi - deduction - additionalDeductions)), round2(qualifiedDividends + netCapitalGain), t, R, qbiIdx);
  }
  // Above the threshold: Form 8995-A (W-2 wage / UBIA limit, SSTB phase-out, loss netting).
  const f8995a = qbi?.overThreshold
    ? form8995A(qbiIdx.map((i) => scheduleCs[i]), qbiAmounts, qbi.taxableIncomeBeforeQbi, qbi.netCapitalGain, t, R, qbiIdx)
    : undefined;
  const qbiDeduction = f8995a ? f8995a.line39 : qbi ? qbi.deduction : 0;
  const totalDeductions = round2(deduction + qbiDeduction + additionalDeductions);
  const taxableIncome = Math.max(0, round2(agi - totalDeductions));

  // ── Tax ───────────────────────────────────────────────────────────────────
  const tax = qualifiedDividends > 0 || netCapitalGain > 0
    ? qdcgTax(taxableIncome, qualifiedDividends, netCapitalGain, t, R)
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
    standardDeduction: standardDeductionAmount, taxableIncome, qualifiedDividends, netCapitalGain,
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
  const f2441 = form2441(t, w2s, scheduleSEs, agi, taxBeforeCredits, R);
  if (f2441) unsupported.push(...f2441.unsupported);
  const dependentCareCredit = f2441?.line11 ?? 0;
  const f8863 = t.filingStatus === "MFS" ? undefined : form8863(t, agi, taxBeforeCredits, dependentCareCredit, R);
  const educationCredit = f8863?.line19 ?? 0;
  const americanOpportunityCredit = f8863?.line8 ?? 0;
  const f8880 = form8880(t, w2s, retirement.records, agi, Math.max(0, round2(taxBeforeCredits - dependentCareCredit - educationCredit)), R);
  const saversCredit = f8880.line12;
  const ctcTaxLimit = Math.max(0, round2(taxBeforeCredits - dependentCareCredit - educationCredit - saversCredit));
  const childAndOtherDependentCredit = Math.min(creditAfterPhaseout, ctcTaxLimit);
  const scheduleThreeCredits = round2(dependentCareCredit + educationCredit + saversCredit);
  const totalCredits = round2(childAndOtherDependentCredit + scheduleThreeCredits);
  const taxAfterCredits = Math.max(0, round2(taxBeforeCredits - totalCredits));

  // ── Schedule 2 Part II ────────────────────────────────────────────────────
  const f8959 = form8959(t.filingStatus, w2s, scheduleSEs, R);
  const f8960 = form8960(t.filingStatus, agi, taxableInterest, ordinaryDividends, capitalGain, R, rentalIncome);
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
    dependentCareCredit, educationCredit, saversCredit, nonrefundableCredits: scheduleThreeCredits, excessSocialSecurity: excessSs,
    netPremiumTaxCredit: f8962?.line26 ?? 0, otherPayments: round2(excessSs + (f8962?.line26 ?? 0)),
    required: excessSs > 0 || scheduleThreeCredits > 0 || (f8962?.line26 ?? 0) > 0,
  };
  const scheduleThreePayments = schedule3.otherPayments;

  // ── Earned income credit (line 27) ────────────────────────────────────────
  // Earned income (EIC Worksheet B / Schedule 8812 earned income worksheet): wages plus
  // net self-employment earnings, i.e. Schedule SE line 3 less the line 13 deduction.
  const seEarned = sum(scheduleSEs.map((s) => s.combined - s.deduction));
  const earnedIncome = round2(wages + seEarned);
  const nEic = eicChildren(t).length;
  // Pub 596 Worksheet 1: interest, dividends, capital gain net income and net passive (rental) income.
  const investmentIncome = round2(taxableInterest + ordinaryDividends + Math.max(0, capitalGain) + Math.max(0, rentalIncome));
  let eic = earnedIncomeCredit(t, nEic, earnedIncome, agi, investmentIncome);
  if (t.filingStatus === "MFS" && nEic > 0) {
    // A separate return gets EIC only under the separated-spouse rule (§ 32(d)(2)), which the
    // model can't decide. No credit is claimed; it's flagged only when the rule would matter.
    if (eic.credit > 0) unsupported.push("EIC on a separate return with a qualifying child (separated-spouse rule, § 32(d)(2))");
    eic = { ...eic, fromEarnedIncome: 0, fromAgi: null, credit: 0, reasonNone: "married filing separately (separated-spouse rule not modelled)" };
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
  const refundableCredits = round2(eic.credit + partII.credit + americanOpportunityCredit + scheduleThreePayments);
  const totalPayments = round2(totalWithholding + estimatedPayments + refundableCredits);

  const overpaid = Math.max(0, round2(totalPayments - totalTax));
  const amountOwed = Math.max(0, round2(totalTax - totalPayments));

  const result: ReturnLines = {
    wages, taxableInterest, qualifiedDividends, ordinaryDividends, capitalGainDistributions,
    capitalGain, netCapitalGain, scheduleDRequired, capital, retirement, socialSecurity, standardDeductionAmount, itemizes,
    scheduleA: itemizes ? schA : undefined, scheduleE: schE, form8582: f8582, additionalIncome, totalIncome, adjustments, agi,
    youAre65, spouseIs65, youBlind, spouseBlind, deduction, qbiDeduction, schedule1A, additionalDeductions, totalDeductions, taxableIncome,
    // Form 8962 is filed only to claim the PTC or reconcile advance payments.
    tax, scheduleTwoPartOne, form6251: f6251, alternativeMinimumTax, excessAdvancePtc, form8962: f8962 && (f8962.line24 > 0 || f8962.line25 > 0) ? f8962 : undefined, taxBeforeCredits, childAndOtherDependentCredit,
    scheduleThreeCredits, form2441: f2441?.required ? f2441 : undefined, form8880: f8880.required ? f8880 : undefined, totalCredits, taxAfterCredits, otherTaxes, totalTax,
    w2Withholding, form1099Withholding, otherWithholding, totalWithholding, estimatedPayments,
    earnedIncomeCredit: eic.credit, additionalChildTaxCredit: partII.credit, americanOpportunityCredit,
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
