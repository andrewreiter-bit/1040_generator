/**
 * Refundable credits: earned income credit (Form 1040 line 27, EIC Worksheet A/B)
 * and additional child tax credit (Schedule 8812 Part II-A / II-B, line 28).
 */
import { FakeTaxpayer, FilingStatus } from "../faker/taxpayer";
import {
  ACTC_EARNED_INCOME_FLOOR, ACTC_EARNED_INCOME_RATE, EIC_CREDIT_RATE, EIC_PHASEOUT_RATE, yearConstants,
} from "../config/tax-year";
import { ageAtYearEnd } from "./household";
import { Rounder } from "./rounding";

/**
 * EIC Table amount: the table taxes each $50 row at its midpoint and rounds to
 * whole dollars; nothing at or above the completed phase-out amount.
 */
export function eicTableAmount(income: number, children: number, status: FilingStatus, taxYear: number): number {
  const c = yearConstants(taxYear);
  const n = Math.min(3, children);
  const joint = status === "MFJ";
  if (income <= 0) return 0;
  if (income >= (joint ? c.eicIncomeLimit.mfj : c.eicIncomeLimit.other)[n]) return 0;
  const mid = Math.floor(income / 50) * 50 + 25;
  const start = (joint ? c.eicPhaseoutStart.mfj : c.eicPhaseoutStart.other)[n];
  const phasedIn = Math.min(c.eicMaxCredit[n], mid * EIC_CREDIT_RATE[n]);
  const reduction = Math.max(0, mid - start) * EIC_PHASEOUT_RATE[n];
  return Math.max(0, Math.round(phasedIn - reduction + 1e-9));
}

export interface EicLines {
  qualifyingChildren: number;   // used for the table column (capped at 3)
  earnedIncome: number;         // Worksheet line 1
  fromEarnedIncome: number;     // line 2
  fromAgi: number | null;       // line 5 (when AGI differs from earned income)
  credit: number;               // line 6 → Form 1040 line 27
  /** Why the credit is zero, when it is ("" when a credit is allowed). */
  reasonNone: string;
}

/**
 * Earned income credit. Assumes the taxpayer can't be claimed as a dependent or
 * be someone else's qualifying child, and didn't file Form 2555 (the model has
 * none of those). MFS with a qualifying child is the caller's to flag.
 */
export function earnedIncomeCredit(
  t: FakeTaxpayer, children: number, earnedIncome: number, agi: number, investmentIncome: number,
): EicLines {
  const c = yearConstants(t.taxYear);
  const n = Math.min(3, children);
  const none = (reasonNone: string): EicLines =>
    ({ qualifyingChildren: n, earnedIncome, fromEarnedIncome: 0, fromAgi: null, credit: 0, reasonNone });

  if (t.filingStatus === "MFS" && n === 0) return none("married filing separately without a qualifying child");
  if (investmentIncome > c.eicInvestmentIncomeLimit) return none("investment income over the limit");
  if (earnedIncome <= 0) return none("no earned income");
  if (n === 0) {
    // Without a qualifying child: the taxpayer (or spouse on a joint return) must be 25–64 at year end.
    const age = (dob: string | null | undefined) => (dob ? ageAtYearEnd(Number(dob.split("/")[2]), t.taxYear) : -1);
    const inRange = (a: number) => a >= 25 && a <= 64;
    if (!inRange(age(t.dateOfBirth)) && !(t.filingStatus === "MFJ" && inRange(age(t.spouseDateOfBirth)))) {
      return none("no qualifying child and not age 25–64");
    }
  }
  const fromEarnedIncome = eicTableAmount(earnedIncome, n, t.filingStatus, t.taxYear);
  const start = (t.filingStatus === "MFJ" ? c.eicPhaseoutStart.mfj : c.eicPhaseoutStart.other)[n];
  let fromAgi: number | null = null;
  let credit = fromEarnedIncome;
  if (agi !== earnedIncome) {
    fromAgi = eicTableAmount(agi, n, t.filingStatus, t.taxYear);
    if (agi >= start) credit = Math.min(fromEarnedIncome, fromAgi);
  }
  return { qualifyingChildren: n, earnedIncome, fromEarnedIncome, fromAgi, credit, reasonNone: credit ? "" : "income over the phase-out range" };
}

export interface Schedule8812PartII {
  line16a: number;              // credit left after line 14
  line16b: number;              // children × refundable cap
  line17: number;
  earnedIncome: number;         // 18a
  line19: number;
  line20: number;
  /** Part II-B (3+ children, line 20 < line 17). */
  partIIB?: { line21: number; line22: number; line23: number; line24: number; line25: number; line26: number };
  credit: number;               // 27 → Form 1040 line 28
}

/**
 * Schedule 8812 Part II-A / II-B. `line12` is the credit after the income phase-out,
 * `line14` the nonrefundable part used on Form 1040 line 19.
 */
export function additionalChildTaxCredit(args: {
  t: FakeTaxpayer; R: Rounder; ctcChildren: number; line12: number; line14: number; earnedIncome: number;
  socialSecurityMedicareWithheld: number; seTaxDeduction: number; eic: number; excessSocialSecurity: number;
}): Schedule8812PartII {
  const { t, R, ctcChildren, line12, line14, earnedIncome } = args;
  const cap = yearConstants(t.taxYear).additionalChildTaxCreditPerChild;
  const line16a = R(Math.max(0, line12 - line14));
  const line16b = ctcChildren * cap;
  const line17 = Math.min(line16a, line16b);
  const line19 = Math.max(0, R(earnedIncome - ACTC_EARNED_INCOME_FLOOR));
  const line20 = R(line19 * ACTC_EARNED_INCOME_RATE);
  // "If zero, stop": lines after 16a / 16b stay blank.
  if (line16a === 0 || line16b === 0) {
    return { line16a, line16b: line16a === 0 ? 0 : line16b, line17: 0, earnedIncome: 0, line19: 0, line20: 0, credit: 0 };
  }
  const base = { line16a, line16b, line17, earnedIncome, line19, line20 };
  if (line16b < 3 * cap) return { ...base, credit: Math.min(line17, line20) };
  if (line20 >= line17) return { ...base, credit: line17 };
  const line21 = R(args.socialSecurityMedicareWithheld);
  const line22 = R(args.seTaxDeduction);           // + Schedule 2 lines 5, 6, 13: not modelled (0)
  const line23 = R(line21 + line22);
  const line24 = R(args.eic + args.excessSocialSecurity);
  const line25 = Math.max(0, R(line23 - line24));
  const line26 = Math.max(line20, line25);
  return { ...base, partIIB: { line21, line22, line23, line24, line25, line26 }, credit: Math.min(line17, line26) };
}
