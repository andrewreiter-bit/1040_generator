/**
 * computeReturn — an independent calculation of the Form 1040 for the income
 * types the generator supports (W-2 wages, interest, dividends, capital gain
 * distributions, a net capital gain/loss).
 *
 * Lines the PDF computes with its own formulas (9, 11, 14, 15, 18, 22, 24, 33,
 * 34) are left to those formulas; the validator compares them with these
 * values so two independent implementations have to agree.
 *
 * Anything the generator cannot yet carry through to the 1040 (Schedules 1/2/C/E/SE,
 * Schedule 8812 Part II, EIC, …) is listed in `unsupported` instead of being
 * silently dropped from the totals.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import {
  CAPITAL_LOSS_LIMIT,
  CREDIT_FOR_OTHER_DEPENDENTS,
  CTC_PHASEOUT_THRESHOLD,
  additionalStandardDeduction,
  capitalGainsThresholds,
  standardDeduction,
  taxOnIncome,
  yearConstants,
} from "../config/tax-year";
import { ageAtYearEnd, childTaxCreditCount, includedW2s, is65OrOlder, otherDependentCount } from "./household";

export interface ReturnLines {
  wages: number;               // 1a / 1z
  taxableInterest: number;     // 2b
  qualifiedDividends: number;  // 3a
  ordinaryDividends: number;   // 3b
  capitalGainDistributions: number;
  capitalGain: number;         // 7 / 7a (after the loss limit)
  scheduleDRequired: boolean;
  additionalIncome: number;    // 8 (Schedule 1) — not yet supported, always 0
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
  otherTaxes: number;          // 23 (Schedule 2) — not yet supported, always 0
  totalTax: number;            // 24
  w2Withholding: number;       // 25a
  form1099Withholding: number; // 25b
  totalWithholding: number;    // 25d
  estimatedPayments: number;   // 26
  totalPayments: number;       // 33
  overpaid: number;            // 34
  refund: number;              // 35a
  amountOwed: number;          // 37
  unsupported: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Qualified Dividends and Capital Gain Tax Worksheet (Form 1040 line 16), 2023–2025 layout. */
function qdcgTax(taxable: number, qualDiv: number, netCapGain: number, t: FakeTaxpayer): number {
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
  const l18 = l17 * 0.15;
  const l20 = l10 - (l9 + l17);
  const l21 = l20 * 0.20;
  const l22 = taxOnIncome(l5, t.taxYear, t.filingStatus);
  const l23 = l18 + l21 + l22;
  const l24 = taxOnIncome(l1, t.taxYear, t.filingStatus);
  return round2(Math.min(l23, l24));
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

  if (t.businessIncome != null) unsupported.push("Schedule C business income (Schedule 1 line 3, Schedule SE tax)");
  if (t.rentalIncome != null) unsupported.push("Schedule E rental income (Schedule 1 line 5)");
  if (t.socialSecurityBenefits != null) unsupported.push("taxable Social Security benefits (line 6b worksheet)");
  const additionalIncome = 0;

  const totalIncome = round2(wages + taxableInterest + ordinaryDividends + capitalGain + additionalIncome);
  const adjustments = 0;
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
  const qbiDeduction = 0;
  const totalDeductions = round2(deduction + qbiDeduction);
  const taxableIncome = Math.max(0, round2(agi - totalDeductions));

  // ── Tax ───────────────────────────────────────────────────────────────────
  const tax = qualifiedDividends > 0 || capitalGain > 0
    ? qdcgTax(taxableIncome, qualifiedDividends, capitalGain, t)
    : taxOnIncome(taxableIncome, t.taxYear, t.filingStatus);
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
  const otherTaxes = 0;
  const totalTax = round2(taxAfterCredits + otherTaxes);

  // ── Payments ──────────────────────────────────────────────────────────────
  const w2Withholding = sum(w2s.map((w) => w.federalWithheld));
  const form1099Withholding = sum([
    ...t.interest1099s.map((p) => p.federalWithheld ?? 0),
    ...t.dividend1099s.map((p) => p.federalWithheld ?? 0),
  ]);
  const totalWithholding = round2(w2Withholding + form1099Withholding);
  const estimatedPayments = round2(t.estimatedTaxPayments ?? 0);
  if (!eicIsZero(t, wages, agi, taxableInterest + ordinaryDividends + Math.max(0, capitalGain))) {
    unsupported.push("earned income credit (line 27) — household may qualify");
  }
  // Social Security tax over the wage-base maximum from 2+ employers is a Schedule 3 line 11 credit.
  const maxSsTax = c.ssWageBase * 0.062;
  for (const who of ["primary", "spouse"] as const) {
    const mine = w2s.filter((w) => (w.employee ?? "primary") === who);
    if (mine.length > 1 && sum(mine.map((w) => w.ssWithheld)) > maxSsTax + 0.5) {
      unsupported.push("excess Social Security tax withheld (Schedule 3 line 11)");
      break;
    }
  }
  const totalPayments = round2(totalWithholding + estimatedPayments);

  const overpaid = Math.max(0, round2(totalPayments - totalTax));
  const amountOwed = Math.max(0, round2(totalTax - totalPayments));

  const result: ReturnLines = {
    wages, taxableInterest, qualifiedDividends, ordinaryDividends, capitalGainDistributions,
    capitalGain, scheduleDRequired, additionalIncome, totalIncome, adjustments, agi,
    youAre65, spouseIs65, deduction, qbiDeduction, totalDeductions, taxableIncome,
    tax, scheduleTwoPartOne, taxBeforeCredits, childAndOtherDependentCredit,
    scheduleThreeCredits, totalCredits, taxAfterCredits, otherTaxes, totalTax,
    w2Withholding, form1099Withholding, totalWithholding, estimatedPayments, totalPayments, overpaid, refund: overpaid, amountOwed,
    unsupported,
  };
  memo.set(t, result);
  return result;
}
