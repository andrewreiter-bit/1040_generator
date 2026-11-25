/**
 * Payroll-tax reconciliation on the 1040: Additional Medicare Tax (Form 8959),
 * net investment income tax (Form 8960) and the excess Social Security credit
 * (Schedule 3 line 11).
 */
import { FakeTaxpayer, FilingStatus, W2Record } from "../faker/taxpayer";
import {
  ADDITIONAL_MEDICARE, MEDICARE_EMPLOYEE_RATE, NIIT, SOCIAL_SECURITY_EMPLOYEE_RATE, ssWageBase,
} from "../config/tax-year";
import { ScheduleSELines } from "./business";
import { Rounder, sumWith } from "./rounding";

export interface Form8959Lines {
  medicareWages: number;        // 1 / 4
  threshold: number;            // 5 / 9
  wagesOverThreshold: number;   // 6
  wageTax: number;              // 7
  seIncome: number;             // 8
  remainingThreshold: number;   // 11
  seOverThreshold: number;      // 12
  seTax: number;                // 13
  totalTax: number;             // 18 → Schedule 2 line 11
  medicareWithheld: number;     // 19
  regularMedicareWithheld: number; // 21
  additionalWithheld: number;   // 22 / 24 → Form 1040 line 25c
  required: boolean;
}

function medicareThreshold(status: FilingStatus): number {
  const t = ADDITIONAL_MEDICARE.threshold;
  return status === "MFJ" ? t.mfj : status === "MFS" ? t.mfs : t.other;
}

export function form8959(status: FilingStatus, w2s: W2Record[], ses: ScheduleSELines[], R: Rounder): Form8959Lines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const medicareWages = sum(w2s.map((w) => w.medicareWages));
  const threshold = medicareThreshold(status);
  const wagesOverThreshold = Math.max(0, R(medicareWages - threshold));
  const wageTax = R(wagesOverThreshold * ADDITIONAL_MEDICARE.rate);
  const seIncome = sum(ses.map((s) => Math.max(0, s.selfEmploymentEarnings)));
  const remainingThreshold = Math.max(0, R(threshold - medicareWages));
  const seOverThreshold = Math.max(0, R(seIncome - remainingThreshold));
  const seTax = R(seOverThreshold * ADDITIONAL_MEDICARE.rate);
  const totalTax = R(wageTax + seTax);
  const medicareWithheld = sum(w2s.map((w) => w.medicareWithheld));
  const regularMedicareWithheld = R(medicareWages * MEDICARE_EMPLOYEE_RATE);
  // Employers withhold the extra 0.9% only on wages over $200,000 paid by them (§ 3102(f)).
  // Below that, box 6 above 1.45% is cent rounding, not Additional Medicare Tax withheld.
  const employerWithheldExtra = w2s.some((w) => w.medicareWages > ADDITIONAL_MEDICARE.withholdingThreshold);
  const required = totalTax > 0 || employerWithheldExtra;
  const additionalWithheld = required ? Math.max(0, R(medicareWithheld - regularMedicareWithheld)) : 0;
  return {
    medicareWages, threshold, wagesOverThreshold, wageTax, seIncome, remainingThreshold, seOverThreshold,
    seTax, totalTax, medicareWithheld, regularMedicareWithheld, additionalWithheld, required,
  };
}

export interface Form8960Lines {
  rentalIncome: number;         // 4a (Schedule E line 26)
  /** 4b: Schedule E results derived in the ordinary course of a non-section 1411 trade or business (removed). */
  rentalAdjustment: number;
  line4c: number;               // 4a + 4b
  investmentInterest: number;   // 9a (Form 4952 line 8, when itemized)
  totalDeductions: number;      // 11
  netInvestmentIncome: number;  // 12
  modifiedAgi: number;          // 13
  threshold: number;            // 14
  agiOverThreshold: number;     // 15
  tax: number;                  // 17 → Schedule 2 line 12
}

/**
 * Form 8960 for interest, dividends, rental income and net capital gain (the investment income the
 * model carries), less line 9a investment interest (the Form 4952 deduction taken on Schedule A).
 */
export function form8960(
  status: FilingStatus, agi: number, interest: number, dividends: number, capitalGain: number, R: Rounder,
  rentalIncome = 0, investmentInterest = 0, rentalAdjustment = 0,
): Form8960Lines {
  const t = NIIT.threshold;
  const threshold = status === "MFJ" || status === "QSS" ? t.joint : status === "MFS" ? t.mfs : t.other;
  const line4c = R(rentalIncome + rentalAdjustment);
  const totalDeductions = R(investmentInterest);
  const netInvestmentIncome = Math.max(0, R(interest + dividends + line4c + capitalGain - totalDeductions));
  const agiOverThreshold = Math.max(0, R(agi - threshold));
  const tax = R(Math.min(netInvestmentIncome, agiOverThreshold) * NIIT.rate);
  return { rentalIncome, rentalAdjustment: R(rentalAdjustment), line4c, investmentInterest: R(investmentInterest), totalDeductions, netInvestmentIncome, modifiedAgi: agi, threshold, agiOverThreshold, tax };
}

/**
 * Excess Social Security tax withheld (Schedule 3 line 11), per person: each
 * employer's withholding counts only up to its own maximum (an employer that
 * over-withholds must refund it, so that part is not creditable); W-2s with the
 * same EIN are one employer. Credit = total − one maximum, only with 2+ employers.
 */
export function excessSocialSecurity(t: FakeTaxpayer, w2s: W2Record[], R: Rounder): { byPerson: Record<"primary" | "spouse", number>; total: number } {
  const sum = (xs: number[]) => sumWith(R, xs);
  const max = R(ssWageBase(t.taxYear) * SOCIAL_SECURITY_EMPLOYEE_RATE);
  const byPerson = { primary: 0, spouse: 0 };
  for (const who of ["primary", "spouse"] as const) {
    const byEmployer = new Map<string, number>();
    w2s.filter((w) => (w.employee ?? "primary") === who).forEach((w, i) => {
      const key = w.employerEin.replace(/\D/g, "") || `#${i}`;
      byEmployer.set(key, R((byEmployer.get(key) ?? 0) + w.ssWithheld));
    });
    if (byEmployer.size < 2) continue;
    const creditable = sum([...byEmployer.values()].map((v) => Math.min(v, max)));
    byPerson[who] = Math.max(0, R(creditable - max));
  }
  return { byPerson, total: R(byPerson.primary + byPerson.spouse) };
}
