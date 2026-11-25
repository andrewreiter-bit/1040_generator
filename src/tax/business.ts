/**
 * Self-employment: Schedule C (per business), Schedule SE (per person) and the
 * Form 8995 qualified business income deduction (below the § 199A threshold).
 *
 * Every line goes through the return's Rounder (cents or whole dollars).
 */
import { FakeTaxpayer, ScheduleCBusiness, ScheduleCExpenses, W2Record } from "../faker/taxpayer";
import { QBI_PHASE_IN_RANGE, QBI_RATE, SE_TAX, SIMPLIFIED_HOME_OFFICE, yearConstants } from "../config/tax-year";
import { Rounder, sumWith } from "./rounding";

export type Person = "primary" | "spouse";
export const ownerOf = (b: ScheduleCBusiness): Person => b.owner ?? "primary";

/** Schedule Cs on this return: a spouse's business counts only on a joint return. */
export function includedScheduleCs(t: FakeTaxpayer): ScheduleCBusiness[] {
  return (t.scheduleCs ?? []).filter((b) => ownerOf(b) === "primary" || t.filingStatus === "MFJ");
}

/** Expense lines in form order (line number → key). Line 9 and 24b are derived. */
type AmountKey = Exclude<keyof ScheduleCExpenses, "otherExpenseItems" | "mealsTotal">;
export const EXPENSE_LINES: Array<[string, AmountKey]> = [
  ["8", "advertising"], ["10", "commissionsFees"], ["11", "contractLabor"], ["12", "depletion"],
  ["13", "depreciation"], ["14", "employeeBenefits"], ["15", "insurance"], ["16a", "mortgageInterest"],
  ["16b", "otherInterest"], ["17", "legalProfessional"], ["18", "officeExpense"], ["19", "pensionPlans"],
  ["20a", "rentVehicles"], ["20b", "rentOther"], ["21", "repairs"], ["22", "supplies"],
  ["23", "taxesLicenses"], ["24a", "travel"], ["25", "utilities"], ["26", "wages"], ["27a", "otherExpenses"],
];

export interface ScheduleCLines {
  business: ScheduleCBusiness;
  owner: Person;
  grossReceipts: number;        // 1
  returnsAllowances: number;    // 2
  netReceipts: number;          // 3
  costOfGoodsSold: number;      // 4
  grossProfit: number;          // 5
  otherIncome: number;          // 6
  grossIncome: number;          // 7
  /** Every expense line by line number ("8" … "27a"), including "9" and "24b". */
  expenseLines: Record<string, number>;
  totalExpenses: number;        // 28
  tentativeProfit: number;      // 29
  homeOffice: number;           // 30
  netProfit: number;            // 31
}

export function scheduleC(b: ScheduleCBusiness, taxYear: number, R: Rounder): ScheduleCLines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const grossReceipts = R(b.grossReceipts);
  const returnsAllowances = R(b.returnsAllowances);
  const netReceipts = R(grossReceipts - returnsAllowances);
  const costOfGoodsSold = R(b.costOfGoodsSold);
  const grossProfit = R(netReceipts - costOfGoodsSold);
  const otherIncome = R(b.otherIncome);
  const grossIncome = R(grossProfit + otherIncome);

  const expenseLines: Record<string, number> = {};
  for (const [line, key] of EXPENSE_LINES) expenseLines[line] = R(b.expenses[key] ?? 0);
  expenseLines["9"] = b.vehicle
    ? R(b.vehicle.businessMiles * yearConstants(taxYear).standardMileageRate + b.vehicle.parkingTolls)
    : 0;
  expenseLines["24b"] = R((b.expenses.mealsTotal ?? 0) * 0.5);
  const totalExpenses = sum(Object.values(expenseLines));
  const tentativeProfit = R(grossIncome - totalExpenses);

  // Simplified method: $5 × up to 300 sq ft, but it cannot create or increase a loss.
  const sqft = Math.min(b.homeOfficeSqFt ?? 0, SIMPLIFIED_HOME_OFFICE.maxSqFt);
  const homeOffice = R(Math.min(sqft * SIMPLIFIED_HOME_OFFICE.ratePerSqFt, Math.max(0, tentativeProfit)));
  const netProfit = R(tentativeProfit - homeOffice);

  return {
    business: b, owner: ownerOf(b), grossReceipts, returnsAllowances, netReceipts, costOfGoodsSold,
    grossProfit, otherIncome, grossIncome, expenseLines, totalExpenses, tentativeProfit, homeOffice, netProfit,
  };
}

export interface ScheduleSELines {
  owner: Person;
  netProfit: number;            // 2 (Schedule C line 31 total)
  combined: number;             // 3
  netEarnings: number;          // 4a / 4c (0 when under $400)
  /** True when line 4c is under $400: no SE tax, and no Schedule SE is required. */
  belowMinimum: boolean;
  selfEmploymentEarnings: number; // 6
  wageBase: number;             // 7
  socialSecurityWages: number;  // 8a / 8d
  remainingBase: number;        // 9
  socialSecurityTax: number;    // 10
  medicareTax: number;          // 11
  seTax: number;                // 12
  deduction: number;            // 13
}

/** Schedule SE Part I for one person (no farm, church, or optional-method income). */
export function scheduleSE(owner: Person, cs: ScheduleCLines[], w2s: W2Record[], taxYear: number, R: Rounder): ScheduleSELines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const netProfit = sum(cs.filter((c) => c.owner === owner).map((c) => c.netProfit));
  const combined = netProfit;
  const line4a = combined > 0 ? R(combined * SE_TAX.netEarningsFactor) : combined;
  const belowMinimum = line4a < SE_TAX.minimumNetEarnings;
  const netEarnings = belowMinimum ? 0 : line4a;
  const selfEmploymentEarnings = netEarnings;
  const wageBase = yearConstants(taxYear).ssWageBase;
  const socialSecurityWages = sum(w2s.filter((w) => (w.employee ?? "primary") === owner).map((w) => w.socialSecurityWages));
  const remainingBase = Math.max(0, R(wageBase - socialSecurityWages));
  const socialSecurityTax = R(Math.min(selfEmploymentEarnings, remainingBase) * SE_TAX.socialSecurityRate);
  const medicareTax = R(selfEmploymentEarnings * SE_TAX.medicareRate);
  const seTax = R(socialSecurityTax + medicareTax);
  const deduction = R(seTax * 0.5);
  return {
    owner, netProfit, combined, netEarnings, belowMinimum, selfEmploymentEarnings, wageBase,
    socialSecurityWages, remainingBase, socialSecurityTax, medicareTax, seTax, deduction,
  };
}

export interface BusinessDeductions {
  /** Deductible part of SE tax and self-employed health insurance, allocated per business (index-aligned with Schedule C list). */
  seDeductionByBusiness: number[];
  healthInsuranceByBusiness: number[];
  healthInsuranceTotal: number;   // Schedule 1 line 17
  qbiByBusiness: number[];        // Form 8995 line 1c
}

/**
 * Allocate each person's deductible SE tax across that person's profitable
 * businesses (by net profit) and limit self-employed health insurance to the
 * business's earned income (net profit less its share of the SE deduction).
 * QBI per business = net profit − both allocations (§ 1.199A-3(b)(1)(vi)).
 */
export function businessDeductions(cs: ScheduleCLines[], ses: ScheduleSELines[], R: Rounder): BusinessDeductions {
  const sum = (xs: number[]) => sumWith(R, xs);
  const seDeductionByBusiness = cs.map((c) => {
    const se = ses.find((s) => s.owner === c.owner);
    if (!se || se.deduction === 0 || c.netProfit <= 0) return 0;
    const positive = sum(cs.filter((x) => x.owner === c.owner && x.netProfit > 0).map((x) => x.netProfit));
    return R(se.deduction * (c.netProfit / positive));
  });
  const healthInsuranceByBusiness = cs.map((c, i) =>
    R(Math.max(0, Math.min(c.business.healthInsurancePremiums ?? 0, c.netProfit - seDeductionByBusiness[i])))
  );
  const qbiByBusiness = cs.map((c, i) => R(c.netProfit - seDeductionByBusiness[i] - healthInsuranceByBusiness[i]));
  return { seDeductionByBusiness, healthInsuranceByBusiness, healthInsuranceTotal: sum(healthInsuranceByBusiness), qbiByBusiness };
}

export interface Form8995Lines {
  qbiByBusiness: number[];      // 1c
  totalQbi: number;             // 2
  priorYearLoss: number;        // 3 (≤ 0)
  netQbi: number;               // 4
  qbiComponent: number;         // 5
  combinedComponent: number;    // 10 (no REIT/PTP)
  taxableIncomeBeforeQbi: number; // 11
  netCapitalGain: number;       // 12
  reducedTaxableIncome: number; // 13
  incomeLimitation: number;     // 14
  deduction: number;            // 15
  lossCarryforward: number;     // 16 (≤ 0)
  /** Taxable income before QBI is over the § 199A threshold: Form 8995-A applies instead. */
  overThreshold: boolean;
}

export function form8995(
  qbiByBusiness: number[], taxableIncomeBeforeQbi: number, netCapitalGain: number, t: FakeTaxpayer, R: Rounder
): Form8995Lines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const thr = yearConstants(t.taxYear).qbiThreshold;
  const threshold = t.filingStatus === "MFJ" ? thr.joint : thr.other;
  const totalQbi = sum(qbiByBusiness);
  const priorYearLoss = -R(t.priorYearQbiLoss ?? 0);
  const combined = R(totalQbi + priorYearLoss);
  const netQbi = Math.max(0, combined);
  const qbiComponent = R(netQbi * QBI_RATE);
  const combinedComponent = qbiComponent;
  const reducedTaxableIncome = Math.max(0, R(taxableIncomeBeforeQbi - netCapitalGain));
  const incomeLimitation = R(reducedTaxableIncome * QBI_RATE);
  const deduction = Math.min(combinedComponent, incomeLimitation);
  return {
    qbiByBusiness, totalQbi, priorYearLoss, netQbi, qbiComponent, combinedComponent,
    taxableIncomeBeforeQbi, netCapitalGain, reducedTaxableIncome, incomeLimitation, deduction,
    lossCarryforward: Math.min(0, combined),
    overThreshold: taxableIncomeBeforeQbi > threshold,
  };
}

// ── Form 8995-A (taxable income above the § 199A threshold) ─────────────────

export interface Form8995ABusiness {
  index: number;               // into the Schedule C list
  sstb: boolean;
  /** Schedule A: applicable percentage (1 below the range, 0 above it) — SSTBs only. */
  applicablePct: number;
  /** Before the applicable percentage (Schedule A lines 2–4). */
  rawQbi: number; rawW2: number; rawUbia: number;
  qbi: number;                 // Schedule A line 11 / Schedule C (a)
  lossNetting: number;         // Schedule C (b), ≤ 0
  line2: number;               // adjusted QBI (Schedule C (c))
  line3: number;
  line4: number; line5: number; line6: number; line7: number; line8: number; line9: number; line10: number; line11: number;
  /** Part III (only inside the phase-in range when line 10 < line 3). */
  partIII?: { line17: number; line18: number; line19: number; line20: number; line21: number; line22: number; line23: number; line24: number; line25: number; line26: number };
  line12: number;
  line13: number;
  line15: number;
}

export interface Form8995ALines {
  taxableIncomeBeforeQbi: number;
  threshold: number;
  range: number;
  businesses: Form8995ABusiness[];
  /** Schedule C (loss netting), when any business has a loss or there's a carryforward. */
  scheduleC?: { line2: number; line3: number; line4: number; line5: number; line6: number };
  /** Schedule A is needed: an SSTB inside the phase-in range. */
  scheduleANeeded: boolean;
  line16: number; line27: number; line32: number; line33: number; line34: number; line35: number;
  line36: number; line37: number; line39: number;
  lossCarryforward: number;    // ≤ 0
}

/**
 * Form 8995-A with Schedules A (SSTBs) and C (loss netting), 2023–2025 layout.
 * No REIT/PTP income, aggregation (Schedule B) or cooperative patronage (Schedule D).
 */
export function form8995A(
  cs: ScheduleCLines[], qbiByBusiness: number[], taxableIncomeBeforeQbi: number, netCapitalGain: number,
  t: FakeTaxpayer, R: Rounder,
): Form8995ALines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const joint = t.filingStatus === "MFJ";
  const y = yearConstants(t.taxYear).qbiThreshold;
  const threshold = joint ? y.joint : y.other;
  const range = joint ? QBI_PHASE_IN_RANGE.joint : QBI_PHASE_IN_RANGE.other;
  const ti = R(taxableIncomeBeforeQbi);
  const over = Math.max(0, ti - threshold);
  const inRange = ti > threshold && ti < threshold + range;
  const pctSstb = ti <= threshold ? 1 : ti >= threshold + range ? 0 : 1 - over / range;

  // Schedule A: SSTB amounts at the applicable percentage.
  const base = cs.map((c, i) => {
    const sstb = !!c.business.sstb;
    const pct = sstb ? pctSstb : 1;
    return {
      index: i, sstb, applicablePct: pct,
      rawQbi: R(qbiByBusiness[i]), rawW2: R(c.business.w2WagesPaid ?? 0), rawUbia: R(c.business.ubia ?? 0),
      qbi: R(qbiByBusiness[i] * pct),
      w2: R((c.business.w2WagesPaid ?? 0) * pct),
      ubia: R((c.business.ubia ?? 0) * pct),
    };
  });

  // Schedule C: net losses (and any carryforward) against the businesses with income, pro rata.
  const carry = -R(t.priorYearQbiLoss ?? 0);
  const line3 = sum([...base.filter((b) => b.qbi < 0).map((b) => b.qbi), carry]);
  const line4 = sum(base.filter((b) => b.qbi > 0).map((b) => b.qbi));
  const netted = Math.min(-line3, line4);
  const needC = line3 < 0;
  const netting = base.map((b) => (b.qbi > 0 && line4 > 0 ? -R(netted * (b.qbi / line4)) : 0));

  const businesses = base.map((b, i): Form8995ABusiness => {
    const line2 = Math.max(0, R(b.qbi + netting[i]));
    const l3 = R(line2 * QBI_RATE);
    const line4w = b.w2, line5 = R(line4w * 0.5), line6 = R(line4w * 0.25);
    const line7 = b.ubia, line8 = R(line7 * 0.025), line9 = R(line6 + line8);
    const line10 = Math.max(line5, line9), line11 = Math.min(l3, line10);
    let partIII: Form8995ABusiness["partIII"];
    let line12 = 0;
    if (inRange && line10 < l3) {
      const line19 = R(l3 - line10);
      const line24 = over / range;
      const line25 = R(line19 * line24);
      const line26 = R(l3 - line25);
      partIII = { line17: l3, line18: line10, line19, line20: ti, line21: threshold, line22: R(over), line23: range, line24, line25, line26 };
      line12 = line26;
    }
    const line13 = ti <= threshold ? l3 : Math.max(line11, line12);
    return {
      index: b.index, sstb: b.sstb, applicablePct: b.applicablePct, rawQbi: b.rawQbi, rawW2: b.rawW2, rawUbia: b.rawUbia, qbi: b.qbi, lossNetting: netting[i], line2, line3: l3,
      line4: line4w, line5, line6, line7, line8, line9, line10, line11, partIII, line12, line13, line15: line13,
    };
  });

  const line16 = sum(businesses.map((b) => b.line15));
  const line27 = line16, line32 = line27, line33 = ti, line34 = R(netCapitalGain);
  const line35 = Math.max(0, R(line33 - line34));
  const line36 = R(line35 * QBI_RATE);
  const line37 = Math.min(line32, line36);
  return {
    taxableIncomeBeforeQbi: ti, threshold, range, businesses,
    scheduleC: needC ? { line2: carry, line3, line4, line5: -netted, line6: Math.min(0, R(line3 + netted)) } : undefined,
    scheduleANeeded: inRange && base.some((b) => b.sstb),
    line16, line27, line32, line33, line34, line35, line36, line37, line39: line37,
    lossCarryforward: needC ? Math.min(0, R(line3 + netted)) : 0,
  };
}
