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
import { childTaxCreditCount, eicChildren, includedW2s, is65OrOlder, otherDependentCount } from "./household";
import { EicLines, Schedule8812PartII, additionalChildTaxCredit, earnedIncomeCredit } from "./credits";
import {
  BusinessDeductions, Form8995Lines, ScheduleCLines, ScheduleSELines,
  businessDeductions, form8995, includedScheduleCs, scheduleC, scheduleSE,
} from "./business";
import { Form8959Lines, Form8960Lines, excessSocialSecurity, form8959, form8960 } from "./payroll";
import { Rounder, rounderFor, sumWith } from "./rounding";
import { CapitalResult, computeCapital } from "./capital";
import { ScheduleALines, scheduleA } from "./itemized";
import { ScheduleELines, scheduleE } from "./rental";

export interface Schedule1Lines {
  businessIncome: number;      // 3
  rentalIncome: number;        // 5 (Schedule E line 26)
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
  /** § 1(h) net capital gain: smaller of Schedule D lines 15 and 16 (or the distributions alone). */
  netCapitalGain: number;
  scheduleDRequired: boolean;
  capital: CapitalResult;
  /** Line 12: standard deduction (with the 65+ add-on) or Schedule A, whichever is larger. */
  standardDeductionAmount: number;
  itemizes: boolean;
  scheduleA?: ScheduleALines;
  scheduleE?: ScheduleELines;
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
  earnedIncomeCredit: number;  // 27 (2025: 27a)
  additionalChildTaxCredit: number; // 28
  scheduleThreePayments: number; // 31
  refundableCredits: number;   // 32 (27 + 28 + 29 + 31; AOTC not modelled)
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
  const schE = t.rentals?.length ? scheduleE(t.rentals, R) : undefined;
  if (schE?.columns.some((c) => c.net < 0)) unsupported.push("rental loss (passive activity limits, Form 8582)");
  if ((schE?.columns.length ?? 0) > 3) unsupported.push("more than three rental properties (Schedule E continuation page)");
  const rentalIncome = schE?.line26 ?? 0;
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
  const additionalIncome = round2(businessIncome + rentalIncome + unemployment);
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
    businessIncome, rentalIncome, unemployment, unemploymentRepaid, additionalIncome, educatorExpenses, seTaxDeduction,
    healthInsurance, studentLoanInterest, adjustments,
    required: additionalIncome !== 0 || adjustments !== 0 || scheduleCs.length > 0 || g1099s.length > 0 || !!schE,
  };

  const agi = round2(totalIncome - adjustments);

  // ── Deductions ────────────────────────────────────────────────────────────
  const youAre65 = is65OrOlder(t.dateOfBirth, t.taxYear);
  const spouseIs65 = t.filingStatus === "MFJ" && is65OrOlder(t.spouseDateOfBirth, t.taxYear);
  // Line 12: the larger of the standard deduction and Schedule A. (Assumes an MFS spouse
  // doesn't itemize, which would force itemizing here; the model can't see that return.)
  const boxes = (youAre65 ? 1 : 0) + (spouseIs65 ? 1 : 0);
  const standardDeductionAmount = standardDeduction(t.taxYear, t.filingStatus) + boxes * additionalStandardDeduction(t.taxYear, t.filingStatus);
  const schA = t.itemized ? scheduleA(t, agi, R) : undefined;
  const legacyItemized = !t.itemized && !t.takesStandardDeduction && t.itemizedDeductionTotal != null ? round2(t.itemizedDeductionTotal) : undefined;
  const itemizedAmount = schA?.line17 ?? legacyItemized ?? 0;
  const itemizes = itemizedAmount > standardDeductionAmount;
  const deduction = itemizes ? itemizedAmount : standardDeductionAmount;
  if (itemizes && legacyItemized != null) unsupported.push("itemized deductions given only as a total (no Schedule A detail)");
  if (itemizes && schA && (schA.line11 > agi * 0.6 || schA.line12 > agi * 0.3)) {
    unsupported.push("charitable contributions over the AGI limits (§ 170(b))");
  }
  if (t.taxYear >= 2025 && (youAre65 || spouseIs65)) {
    unsupported.push("2025 Schedule 1-A senior deduction (line 13b)");
  }
  let qbi: Form8995Lines | undefined;
  if (scheduleCs.length || t.priorYearQbiLoss) {
    qbi = form8995(bizDed.qbiByBusiness, Math.max(0, round2(agi - deduction)), round2(qualifiedDividends + netCapitalGain), t, R);
    if (qbi.overThreshold && qbi.netQbi > 0) unsupported.push("QBI deduction above the § 199A threshold (Form 8995-A)");
  }
  const qbiDeduction = qbi && !qbi.overThreshold ? qbi.deduction : 0;
  const totalDeductions = round2(deduction + qbiDeduction);
  const taxableIncome = Math.max(0, round2(agi - totalDeductions));

  // ── Tax ───────────────────────────────────────────────────────────────────
  const tax = qualifiedDividends > 0 || netCapitalGain > 0
    ? qdcgTax(taxableIncome, qualifiedDividends, netCapitalGain, t, R)
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
  const scheduleThreeCredits = 0;
  const totalCredits = round2(childAndOtherDependentCredit + scheduleThreeCredits);
  const taxAfterCredits = Math.max(0, round2(taxBeforeCredits - totalCredits));

  // ── Schedule 2 Part II ────────────────────────────────────────────────────
  const f8959 = form8959(t.filingStatus, w2s, scheduleSEs, R);
  const f8960 = form8960(t.filingStatus, agi, taxableInterest, ordinaryDividends, capitalGain, R, rentalIncome);
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
    capital.federalWithheld,
    ...g1099s.map((g) => g.federalWithheld),
  ]);
  const otherWithholding = f8959.additionalWithheld;
  const totalWithholding = round2(w2Withholding + form1099Withholding + otherWithholding);
  const estimatedPayments = round2(t.estimatedTaxPayments ?? 0);
  const excessSs = excessSocialSecurity(t, w2s, R).total;
  const schedule3: Schedule3Lines = { excessSocialSecurity: excessSs, otherPayments: excessSs, required: excessSs > 0 };
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
    seTaxDeduction: seTaxDeduction, eic: eic.credit, excessSocialSecurity: excessSs,
  });
  const schedule8812 = {
    ctcChildren: nCtc, otherDependents: nOdc, maxCredit, threshold, reduction, afterPhaseout: creditAfterPhaseout,
    taxLimit: taxBeforeCredits, credit: childAndOtherDependentCredit, partII,
    required: maxCredit > 0,
  };
  const refundableCredits = round2(eic.credit + partII.credit + scheduleThreePayments);
  const totalPayments = round2(totalWithholding + estimatedPayments + refundableCredits);

  const overpaid = Math.max(0, round2(totalPayments - totalTax));
  const amountOwed = Math.max(0, round2(totalTax - totalPayments));

  const result: ReturnLines = {
    wages, taxableInterest, qualifiedDividends, ordinaryDividends, capitalGainDistributions,
    capitalGain, netCapitalGain, scheduleDRequired, capital, standardDeductionAmount, itemizes,
    scheduleA: itemizes ? schA : undefined, scheduleE: schE, additionalIncome, totalIncome, adjustments, agi,
    youAre65, spouseIs65, deduction, qbiDeduction, totalDeductions, taxableIncome,
    tax, scheduleTwoPartOne, taxBeforeCredits, childAndOtherDependentCredit,
    scheduleThreeCredits, totalCredits, taxAfterCredits, otherTaxes, totalTax,
    w2Withholding, form1099Withholding, otherWithholding, totalWithholding, estimatedPayments,
    earnedIncomeCredit: eic.credit, additionalChildTaxCredit: partII.credit,
    scheduleThreePayments, refundableCredits, totalPayments, overpaid, refund: overpaid, amountOwed,
    scheduleC: scheduleCs, scheduleSE: scheduleSEs, businessDeductions: bizDed,
    schedule1, schedule2, schedule3, form8959: f8959, form8960: f8960, form8995: qbi,
    schedule8812, eic,
    unsupported,
  };
  memo.set(t, result);
  return result;
}
