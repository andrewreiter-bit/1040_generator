/**
 * computeReturn — an independent calculation of the Form 1040 for the income
 * types the generator supports (W-2 wages, interest, dividends, capital gain
 * distributions, a net capital gain/loss, Schedule C businesses) and the
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
  CAPITAL_LOSS_LIMIT,
  CREDIT_FOR_OTHER_DEPENDENTS,
  CTC_PHASEOUT_THRESHOLD,
  EDUCATOR_EXPENSE_LIMIT,
  STUDENT_LOAN_INTEREST,
  additionalStandardDeduction,
  capitalGainsThresholds,
  standardDeduction,
  taxOnIncome,
  yearConstants,
} from "../config/tax-year";
import { ageAtYearEnd, childTaxCreditCount, includedW2s, is65OrOlder, otherDependentCount } from "./household";
import {
  BusinessDeductions, Form8995Lines, ScheduleCLines, ScheduleSELines,
  businessDeductions, form8995, includedScheduleCs, scheduleC, scheduleSE,
} from "./business";
import { Form8959Lines, Form8960Lines, excessSocialSecurity, form8959, form8960 } from "./payroll";
import { Rounder, rounderFor, sumWith } from "./rounding";

export interface Schedule1Lines {
  businessIncome: number;      // 3
  unemployment: number;        // 7
  unemploymentRepaid: number;  // repayment shown beside line 7
  additionalIncome: number;    // 10 → 1040 line 8
  educatorExpenses: number;    // 11
  seTaxDeduction: number;      // 15
  healthInsurance: number;     // 17
  studentLoanInterest: number; // 21
  adjustments: number;         // 26 → 1040 line 10
  required: boolean;
}

export interface Schedule2Lines {
  seTax: number;               // 4
  additionalMedicareTax: number; // 11
  niit: number;                // 12
  otherTaxes: number;          // 21 → 1040 line 23
  required: boolean;
}

export interface Schedule3Lines {
  excessSocialSecurity: number; // 11
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
  scheduleDRequired: boolean;
  additionalIncome: number;    // 8 (Schedule 1 line 10)
  totalIncome: number;         // 9
  adjustments: number;         // 10
  agi: number;                 // 11 / 11a
  youAre65: boolean;
  spouseIs65: boolean;
  deduction: number;           // 12 / 12e
  qbiDeduction: number;        // 13 / 13a
  totalDeductions: number;     // 14
  taxableIncome: number;       // 15
  tax: number;                 // 16
  scheduleTwoPartOne: number;  // 17
  taxBeforeCredits: number;    // 18
  childAndOtherDependentCredit: number; // 19
  scheduleThreeCredits: number;          // 20
  totalCredits: number;        // 21
  taxAfterCredits: number;     // 22
  otherTaxes: number;          // 23 (Schedule 2 line 21)
  totalTax: number;            // 24
  w2Withholding: number;       // 25a
  form1099Withholding: number; // 25b
  otherWithholding: number;    // 25c (Form 8959 line 24)
  totalWithholding: number;    // 25d
  estimatedPayments: number;   // 26
  scheduleThreePayments: number; // 31
  refundableCredits: number;   // 32 (27 + 28 + 29 + 31; EIC/ACTC/AOTC are 0 or unsupported)
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

/**
 * True when the household certainly gets no earned income credit, so line 27 is 0.
 * Conservative: qualifying children are over-counted (any dependent under 24 who
 * lived with the taxpayer more than half the year), which only raises the income
 * limit; anything not provably zero is reported as unsupported by the caller.
 */
function eicIsZero(t: FakeTaxpayer, earnedIncome: number, agi: number, investmentIncome: number): boolean {
  const c = yearConstants(t.taxYear);
  if (earnedIncome <= 0) return true;
  if (investmentIncome > c.eicInvestmentIncomeLimit) return true;
  const possibleChildren = Math.min(3, t.dependents.filter(
    (d) => ageAtYearEnd(d.birthYear, t.taxYear) < 24 && d.monthsInHome > 6
  ).length);
  const limit = (t.filingStatus === "MFJ" ? c.eicIncomeLimit.mfj : c.eicIncomeLimit.other)[possibleChildren];
  if (earnedIncome >= limit || agi >= limit) return true;
  if (possibleChildren === 0) {
    // Without a qualifying child, the taxpayer or spouse must be 25–64 at year end.
    const age = (dob: string | null | undefined) => (dob ? ageAtYearEnd(Number(dob.split("/")[2]), t.taxYear) : -1);
    const inRange = (a: number) => a >= 25 && a <= 64;
    if (!inRange(age(t.dateOfBirth)) && !(t.filingStatus === "MFJ" && inRange(age(t.spouseDateOfBirth)))) return true;
  }
  return false;
}

const memo = new WeakMap<FakeTaxpayer, ReturnLines>();

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
  const taxableInterest = round2(t.totalInterest);
  const ordinaryDividends = round2(t.totalDividends);
  const qualifiedDividends = round2(t.totalQualifiedDividends);
  const capitalGainDistributions = sum(t.dividend1099s.map((d) => d.totalCapitalGain));

  const netCapital = round2((t.capitalGains ?? 0) + capitalGainDistributions);
  const lossLimit = t.filingStatus === "MFS" ? CAPITAL_LOSS_LIMIT.mfs : CAPITAL_LOSS_LIMIT.other;
  const capitalGain = netCapital >= 0 ? netCapital : Math.max(netCapital, -lossLimit);
  const scheduleDRequired = t.capitalGains != null;
  if (scheduleDRequired) unsupported.push("Schedule D / Form 8949 detail (net capital gain is on line 7, but the Schedule D form is not filled)");

  if (t.businessIncome != null && !t.scheduleCs?.length) unsupported.push("Schedule C business income given only as a net figure (no Schedule C detail)");
  if (t.rentalIncome != null) unsupported.push("Schedule E rental income (Schedule 1 line 5)");
  if (t.socialSecurityBenefits != null) unsupported.push("taxable Social Security benefits (line 6b worksheet)");

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
  const additionalIncome = round2(businessIncome + unemployment);
  const educatorExpenses = sum([
    Math.min(t.educatorExpenses?.primary ?? 0, EDUCATOR_EXPENSE_LIMIT),
    joint ? Math.min(t.educatorExpenses?.spouse ?? 0, EDUCATOR_EXPENSE_LIMIT) : 0,
  ]);
  const seTaxDeduction = sum(scheduleSEs.map((s) => s.deduction));
  const healthInsurance = bizDed.healthInsuranceTotal;
  const totalIncome = round2(wages + taxableInterest + ordinaryDividends + capitalGain + additionalIncome);

  // Student Loan Interest Deduction Worksheet (not allowed on MFS).
  let studentLoanInterest = 0;
  if ((t.studentLoanInterestPaid ?? 0) > 0 && t.filingStatus !== "MFS") {
    const w1 = Math.min(t.studentLoanInterestPaid!, STUDENT_LOAN_INTEREST.max);
    const w4 = round2(totalIncome - (educatorExpenses + seTaxDeduction + healthInsurance));
    const start = joint ? c.studentLoanPhaseoutStart.joint : c.studentLoanPhaseoutStart.other;
    const range = joint ? STUDENT_LOAN_INTEREST.phaseoutRange.joint : STUDENT_LOAN_INTEREST.phaseoutRange.other;
    const w6 = Math.min(1, Math.round((Math.max(0, w4 - start) / range) * 1000) / 1000);
    studentLoanInterest = round2(w1 - round2(w1 * w6));
  }
  const adjustments = sum([educatorExpenses, seTaxDeduction, healthInsurance, studentLoanInterest]);
  const schedule1: Schedule1Lines = {
    businessIncome, unemployment, unemploymentRepaid, additionalIncome, educatorExpenses, seTaxDeduction,
    healthInsurance, studentLoanInterest, adjustments,
    required: additionalIncome !== 0 || adjustments !== 0 || scheduleCs.length > 0 || g1099s.length > 0,
  };

  const agi = round2(totalIncome - adjustments);

  // ── Deductions ────────────────────────────────────────────────────────────
  const youAre65 = is65OrOlder(t.dateOfBirth, t.taxYear);
  const spouseIs65 = t.filingStatus === "MFJ" && is65OrOlder(t.spouseDateOfBirth, t.taxYear);
  let deduction: number;
  if (t.takesStandardDeduction || t.itemizedDeductionTotal == null) {
    const boxes = (youAre65 ? 1 : 0) + (spouseIs65 ? 1 : 0);
    deduction = standardDeduction(t.taxYear, t.filingStatus) + boxes * additionalStandardDeduction(t.taxYear, t.filingStatus);
  } else {
    deduction = round2(t.itemizedDeductionTotal);
    unsupported.push("Schedule A itemized deduction detail (line 12 uses the profile total; Schedule A form is not filled)");
  }
  if (t.taxYear >= 2025 && (youAre65 || spouseIs65)) {
    unsupported.push("2025 Schedule 1-A senior deduction (line 13b)");
  }
  let qbi: Form8995Lines | undefined;
  if (scheduleCs.length || t.priorYearQbiLoss) {
    qbi = form8995(bizDed.qbiByBusiness, Math.max(0, round2(agi - deduction)), round2(qualifiedDividends + Math.max(0, capitalGain)), t, R);
    if (qbi.overThreshold && qbi.netQbi > 0) unsupported.push("QBI deduction above the § 199A threshold (Form 8995-A)");
  }
  const qbiDeduction = qbi && !qbi.overThreshold ? qbi.deduction : 0;
  const totalDeductions = round2(deduction + qbiDeduction);
  const taxableIncome = Math.max(0, round2(agi - totalDeductions));

  // ── Tax ───────────────────────────────────────────────────────────────────
  const tax = qualifiedDividends > 0 || capitalGain > 0
    ? qdcgTax(taxableIncome, qualifiedDividends, capitalGain, t, R)
    : R(taxOnIncome(taxableIncome, t.taxYear, t.filingStatus));
  const scheduleTwoPartOne = 0; // AMT / excess APTC not modelled
  const taxBeforeCredits = round2(tax + scheduleTwoPartOne);

  // ── Child tax credit / credit for other dependents (Schedule 8812 Part I) ──
  const nCtc = childTaxCreditCount(t);
  const nOdc = otherDependentCount(t);
  const maxCredit = nCtc * c.childTaxCreditPerChild + nOdc * CREDIT_FOR_OTHER_DEPENDENTS;
  const threshold = t.filingStatus === "MFJ" ? CTC_PHASEOUT_THRESHOLD.joint : CTC_PHASEOUT_THRESHOLD.other;
  const reduction = agi > threshold ? Math.ceil((agi - threshold) / 1000) * 50 : 0;
  const creditAfterPhaseout = Math.max(0, maxCredit - reduction);
  const childAndOtherDependentCredit = Math.min(creditAfterPhaseout, taxBeforeCredits);
  if (nCtc > 0 && creditAfterPhaseout > taxBeforeCredits) {
    unsupported.push("additional child tax credit (Schedule 8812 Part II, line 28)");
  }
  const scheduleThreeCredits = 0;
  const totalCredits = round2(childAndOtherDependentCredit + scheduleThreeCredits);
  const taxAfterCredits = Math.max(0, round2(taxBeforeCredits - totalCredits));

  // ── Schedule 2 Part II ────────────────────────────────────────────────────
  const f8959 = form8959(t.filingStatus, w2s, scheduleSEs, R);
  const f8960 = form8960(t.filingStatus, agi, taxableInterest, ordinaryDividends, capitalGain, R);
  const seTax = sum(scheduleSEs.map((s) => s.seTax));
  const otherTaxes = round2(seTax + f8959.totalTax + f8960.tax);
  const schedule2: Schedule2Lines = {
    seTax, additionalMedicareTax: f8959.totalTax, niit: f8960.tax, otherTaxes,
    required: otherTaxes > 0 || scheduleTwoPartOne > 0,
  };
  const totalTax = round2(taxAfterCredits + otherTaxes);

  // ── Payments ──────────────────────────────────────────────────────────────
  const w2Withholding = sum(w2s.map((w) => w.federalWithheld));
  const form1099Withholding = sum([
    ...t.interest1099s.map((p) => p.federalWithheld ?? 0),
    ...t.dividend1099s.map((p) => p.federalWithheld ?? 0),
    t.otherForm1099Withholding ?? 0,
    ...g1099s.map((g) => g.federalWithheld),
  ]);
  const otherWithholding = f8959.additionalWithheld;
  const totalWithholding = round2(w2Withholding + form1099Withholding + otherWithholding);
  const estimatedPayments = round2(t.estimatedTaxPayments ?? 0);
  // EIC earned income: wages plus net self-employment earnings (Schedule SE line 3 less line 13).
  const seEarned = sum(scheduleSEs.map((s) => s.combined - s.deduction));
  if (!eicIsZero(t, round2(wages + seEarned), agi, taxableInterest + ordinaryDividends + Math.max(0, capitalGain))) {
    unsupported.push("earned income credit (line 27) — household may qualify");
  }
  const excessSs = excessSocialSecurity(t, w2s, R).total;
  const schedule3: Schedule3Lines = { excessSocialSecurity: excessSs, otherPayments: excessSs, required: excessSs > 0 };
  const scheduleThreePayments = schedule3.otherPayments;
  const refundableCredits = scheduleThreePayments;
  const totalPayments = round2(totalWithholding + estimatedPayments + refundableCredits);

  const overpaid = Math.max(0, round2(totalPayments - totalTax));
  const amountOwed = Math.max(0, round2(totalTax - totalPayments));

  const result: ReturnLines = {
    wages, taxableInterest, qualifiedDividends, ordinaryDividends, capitalGainDistributions,
    capitalGain, scheduleDRequired, additionalIncome, totalIncome, adjustments, agi,
    youAre65, spouseIs65, deduction, qbiDeduction, totalDeductions, taxableIncome,
    tax, scheduleTwoPartOne, taxBeforeCredits, childAndOtherDependentCredit,
    scheduleThreeCredits, totalCredits, taxAfterCredits, otherTaxes, totalTax,
    w2Withholding, form1099Withholding, otherWithholding, totalWithholding, estimatedPayments,
    scheduleThreePayments, refundableCredits, totalPayments, overpaid, refund: overpaid, amountOwed,
    scheduleC: scheduleCs, scheduleSE: scheduleSEs, businessDeductions: bizDed,
    schedule1, schedule2, schedule3, form8959: f8959, form8960: f8960, form8995: qbi,
    unsupported,
  };
  memo.set(t, result);
  return result;
}
