import { FilingStatus } from "../faker/taxpayer";

/**
 * Year-specific federal constants for tax years 2023–2025.
 *
 * Sources (checked against the IRS/SSA text):
 *   2023  Rev. Proc. 2022-38 (IRB 2022-45) §§ 3.01, 3.03, 3.05, 3.15
 *   2024  Rev. Proc. 2023-34 (IRB 2023-48) §§ 3.01, 3.03, 3.05, 3.15
 *   2025  2025 Instructions for Form 1040 (Tax Computation Worksheet, Qualified
 *         Dividends and Capital Gain Tax Worksheet, What's New) — reflects the
 *         One Big Beautiful Bill Act changes to the standard deduction and CTC;
 *         Rev. Proc. 2024-40 / IRS Topic 551 for the additional standard deduction.
 *   Standard deduction: printed on each year's Form 1040 (line 12 / 12e sidebar).
 *   Social Security wage base: SSA contribution and benefit base.
 *   EIC (all parameters) and investment-income limit: Rev. Proc. 2022-38 / 2023-34 / 2024-40 § 3.06
 *         (also the IRS "Earned income and EITC tables" page); credit and phase-out percentages § 32(b)(1).
 *   Refundable child tax credit per child: same Rev. Procs § 3.05 ($1,600 / $1,700 / $1,700).
 *   QBI threshold (§ 199A(e)(2)): Rev. Proc. 2022-38 § 3.27, 2023-34 § 3.27, 2024-40 § 3.27.
 *   Standard mileage rate: Notice 2023-03 (65.5¢), Notice 2024-08 (67¢), Notice 2025-5 (70¢).
 *   Saver's credit AGI limits and line 9 table: each year's Form 8880 (2023, 2024, 2025).
 *   Student loan interest phase-out (§ 221(b)(2)): Rev. Proc. 2022-38 § 3.29, 2023-34 § 3.29, 2024-40 § 3.29.
 *   Educator expenses (§ 62(d)(3)): $300 per eligible educator for 2023–2025.
 */

type StatusTable<T> = { single: T; mfj: T; mfs: T; hoh: T };

interface YearConstants {
  standardDeduction: { single: number; mfj: number; hoh: number };
  /** § 63(f) additional amount per aged/blind condition. */
  additionalStandardDeduction: { married: number; unmarried: number };
  /** Upper bound ("not over") of the 10/12/22/24/32/35% brackets; 37% above the last. */
  brackets: StatusTable<number[]>;
  /** § 1(j)(5)(B) maximum zero-rate and 15%-rate amounts for qualified dividends / capital gains. */
  capitalGainsZeroMax: StatusTable<number>;
  capitalGainsFifteenMax: StatusTable<number>;
  childTaxCreditPerChild: number;
  /** Refundable portion cap per child (§ 24(d)(1)(A)): Schedule 8812 line 16b. */
  additionalChildTaxCreditPerChild: number;
  ssWageBase: number;
  /** EIC: earned income and AGI must be LESS than these (completed phase-out), by qualifying children 0/1/2/3+. */
  eicIncomeLimit: { mfj: number[]; other: number[] };
  /** EIC earned income amount (where the maximum credit is reached), by children 0/1/2/3+. */
  eicEarnedIncomeAmount: number[];
  eicMaxCredit: number[];
  /** EIC threshold phase-out amount, by children 0/1/2/3+. */
  eicPhaseoutStart: { mfj: number[]; other: number[] };
  /** EIC: investment income must be at or under this. */
  eicInvestmentIncomeLimit: number;
  /** § 199A threshold amount: at or under it, Form 8995 (no W-2 wage / UBIA / SSTB limits). */
  qbiThreshold: { joint: number; other: number };
  /** Business standard mileage rate, dollars per mile (Schedule C line 9). */
  standardMileageRate: number;
  /** Student loan interest deduction phase-out start (MAGI); range is $15,000 ($30,000 joint). */
  studentLoanPhaseoutStart: { joint: number; other: number };
  /** Form 8880 Saver's credit: no credit when AGI is over these. */
  saversCreditAgiLimit: { joint: number; hoh: number; other: number };
  /**
   * Form 8880 line 9 table: AGI not over [0] → 50%, [1] → 20%, [2] → 10% (then 0%).
   * "other" is single, married filing separately and qualifying surviving spouse.
   */
  saversCreditBrackets: { joint: [number, number, number]; hoh: [number, number, number]; other: [number, number, number] };
}

const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

const YEARS: Record<number, YearConstants> = {
  2023: {
    standardDeduction: { single: 13850, mfj: 27700, hoh: 20800 },
    additionalStandardDeduction: { married: 1500, unmarried: 1850 },
    brackets: {
      mfj:    [22000, 89450, 190750, 364200, 462500, 693750],
      hoh:    [15700, 59850, 95350, 182100, 231250, 578100],
      single: [11000, 44725, 95375, 182100, 231250, 578125],
      mfs:    [11000, 44725, 95375, 182100, 231250, 346875],
    },
    capitalGainsZeroMax:    { mfj: 89250, mfs: 44625, hoh: 59750, single: 44625 },
    capitalGainsFifteenMax: { mfj: 553850, mfs: 276900, hoh: 523050, single: 492300 },
    childTaxCreditPerChild: 2000,
    additionalChildTaxCreditPerChild: 1600,
    ssWageBase: 160200,
    eicIncomeLimit: { other: [17640, 46560, 52918, 56838], mfj: [24210, 53120, 59478, 63398] },
    eicEarnedIncomeAmount: [7840, 11750, 16510, 16510],
    eicMaxCredit: [600, 3995, 6604, 7430],
    eicPhaseoutStart: { other: [9800, 21560, 21560, 21560], mfj: [16370, 28120, 28120, 28120] },
    eicInvestmentIncomeLimit: 11000,
    qbiThreshold: { joint: 364200, other: 182100 },
    standardMileageRate: 0.655,
    saversCreditAgiLimit: { joint: 73000, hoh: 54750, other: 36500 },
    saversCreditBrackets: { joint: [43500, 47500, 73000], hoh: [32625, 35625, 54750], other: [21750, 23750, 36500] },
    studentLoanPhaseoutStart: { joint: 155000, other: 75000 },
  },
  2024: {
    standardDeduction: { single: 14600, mfj: 29200, hoh: 21900 },
    additionalStandardDeduction: { married: 1550, unmarried: 1950 },
    brackets: {
      mfj:    [23200, 94300, 201050, 383900, 487450, 731200],
      hoh:    [16550, 63100, 100500, 191950, 243700, 609350],
      single: [11600, 47150, 100525, 191950, 243725, 609350],
      mfs:    [11600, 47150, 100525, 191950, 243725, 365600],
    },
    capitalGainsZeroMax:    { mfj: 94050, mfs: 47025, hoh: 63000, single: 47025 },
    capitalGainsFifteenMax: { mfj: 583750, mfs: 291850, hoh: 551350, single: 518900 },
    childTaxCreditPerChild: 2000,
    additionalChildTaxCreditPerChild: 1700,
    ssWageBase: 168600,
    eicIncomeLimit: { other: [18591, 49084, 55768, 59899], mfj: [25511, 56004, 62688, 66819] },
    eicEarnedIncomeAmount: [8260, 12390, 17400, 17400],
    eicMaxCredit: [632, 4213, 6960, 7830],
    eicPhaseoutStart: { other: [10330, 22720, 22720, 22720], mfj: [17250, 29640, 29640, 29640] },
    eicInvestmentIncomeLimit: 11600,
    qbiThreshold: { joint: 383900, other: 191950 },
    standardMileageRate: 0.67,
    saversCreditAgiLimit: { joint: 76500, hoh: 57375, other: 38250 },
    saversCreditBrackets: { joint: [46000, 50000, 76500], hoh: [34500, 37500, 57375], other: [23000, 25000, 38250] },
    studentLoanPhaseoutStart: { joint: 165000, other: 80000 },
  },
  2025: {
    standardDeduction: { single: 15750, mfj: 31500, hoh: 23625 },
    additionalStandardDeduction: { married: 1600, unmarried: 2000 },
    brackets: {
      mfj:    [23850, 96950, 206700, 394600, 501050, 751600],
      hoh:    [17000, 64850, 103350, 197300, 250500, 626350],
      single: [11925, 48475, 103350, 197300, 250525, 626350],
      mfs:    [11925, 48475, 103350, 197300, 250525, 375800],
    },
    capitalGainsZeroMax:    { mfj: 96700, mfs: 48350, hoh: 64750, single: 48350 },
    capitalGainsFifteenMax: { mfj: 600050, mfs: 300000, hoh: 566700, single: 533400 },
    childTaxCreditPerChild: 2200,
    additionalChildTaxCreditPerChild: 1700,
    ssWageBase: 176100,
    eicIncomeLimit: { other: [19104, 50434, 57310, 61555], mfj: [26214, 57554, 64430, 68675] },
    eicEarnedIncomeAmount: [8490, 12730, 17880, 17880],
    eicMaxCredit: [649, 4328, 7152, 8046],
    eicPhaseoutStart: { other: [10620, 23350, 23350, 23350], mfj: [17730, 30470, 30470, 30470] },
    eicInvestmentIncomeLimit: 11950,
    qbiThreshold: { joint: 394600, other: 197300 },
    standardMileageRate: 0.70,
    saversCreditAgiLimit: { joint: 79000, hoh: 59250, other: 39500 },
    saversCreditBrackets: { joint: [47500, 51000, 79000], hoh: [35625, 38250, 59250], other: [23750, 25500, 39500] },
    studentLoanPhaseoutStart: { joint: 170000, other: 85000 },
  },
};

/** Statutory (not inflation-adjusted) amounts used in every supported year. */
export const CREDIT_FOR_OTHER_DEPENDENTS = 500;
export const CTC_PHASEOUT_THRESHOLD = { joint: 400000, other: 200000 };
export const CAPITAL_LOSS_LIMIT = { mfs: 1500, other: 3000 };

/** Self-employment tax (§ 1401, § 1402(a)(12)). */
export const SE_TAX = { netEarningsFactor: 0.9235, socialSecurityRate: 0.124, medicareRate: 0.029, minimumNetEarnings: 400 };
/** Employee Social Security tax rate (§ 3101(a)) — the per-employer cap is wage base × this. */
export const SOCIAL_SECURITY_EMPLOYEE_RATE = 0.062;
export const MEDICARE_EMPLOYEE_RATE = 0.0145;
/** Additional Medicare Tax (§ 3101(b)(2), Form 8959): 0.9% over these (not indexed). */
export const ADDITIONAL_MEDICARE = { rate: 0.009, threshold: { mfj: 250000, mfs: 125000, other: 200000 }, withholdingThreshold: 200000 };
/** Net investment income tax (§ 1411, Form 8960): 3.8% over these (not indexed). QSS uses the joint amount. */
export const NIIT = { rate: 0.038, threshold: { joint: 250000, mfs: 125000, other: 200000 } };
/** § 32(b)(1) credit and phase-out percentages, by qualifying children 0/1/2/3+. */
export const EIC_CREDIT_RATE = [0.0765, 0.34, 0.40, 0.45];
export const EIC_PHASEOUT_RATE = [0.0765, 0.1598, 0.2106, 0.2106];
/** Schedule 8812 line 19/20: 15% of earned income over $2,500 (§ 24(d)(1)(B)). */
export const ACTC_EARNED_INCOME_FLOOR = 2500;
export const ACTC_EARNED_INCOME_RATE = 0.15;
/** Schedule A line 3: medical expenses deductible above 7.5% of AGI (§ 213(a)). */
export const MEDICAL_AGI_FLOOR = 0.075;

/**
 * Schedule A line 5e SALT cap (§ 164(b)(6)). 2023–2024: $10,000. 2025 (OBBBA,
 * 2025 Schedule A instructions' worksheet): $40,000 less 30% of modified AGI over
 * $500,000, not below $10,000. Married filing separately: half of each amount.
 */
export function saltCap(taxYear: number, status: FilingStatus, modifiedAgi: number): number {
  const half = status === "MFS" ? 0.5 : 1;
  if (taxYear < 2025) return 10000 * half;
  const over = Math.max(0, modifiedAgi - 500000 * half);
  return Math.max(40000 * half - 0.3 * over, 10000 * half);
}

/**
 * Social Security Benefits Worksheet (Form 1040 instructions, lines 6a/6b; § 86):
 * base amounts and the second-tier amounts (not indexed). MFS who lived with the
 * spouse at any time during the year use $0 for both.
 */
export const SOCIAL_SECURITY_TAXABILITY = {
  base: { joint: 32000, other: 25000 },
  secondTier: { joint: 9000, other: 6000 },
  firstTierRate: 0.5,
  secondTierRate: 0.85,
};

/**
 * Traditional IRA (IRA Deduction Worksheet, Schedule 1 line 20; Pub 590-A): the contribution
 * limit and age-50 catch-up, and where the deduction phase-out ends for someone covered by a
 * workplace plan — single/HOH (and MFS living apart), joint (and QSS), a joint filer who isn't
 * covered but whose spouse is, and MFS living together. Each range is $10,000 wide except the
 * covered joint filer's ($20,000).
 */
export const IRA_CONTRIBUTION_LIMIT: Record<number, number> = { 2023: 6500, 2024: 7000, 2025: 7000 };
export const IRA_CATCH_UP = 1000;
export const IRA_PHASEOUT_END: Record<number, { single: number; joint: number; spouseCovered: number; mfsTogether: number }> = {
  2023: { single: 83000, joint: 136000, spouseCovered: 228000, mfsTogether: 10000 },
  2024: { single: 87000, joint: 143000, spouseCovered: 240000, mfsTogether: 10000 },
  2025: { single: 89000, joint: 146000, spouseCovered: 246000, mfsTogether: 10000 },
};

/**
 * Premium tax credit (Form 8962), from each year's Form 8962 instructions. The poverty line
 * is the prior year's (Tables 1-1 to 1-3): first person + each additional person; the tables
 * are linear. Repayment limitation (Table 5): by line 5 percentage, single vs other filers;
 * none at 400% or more.
 */
export const PTC_POVERTY_LINE: Record<number, Record<"contiguous" | "alaska" | "hawaii", [number, number]>> = {
  2023: { contiguous: [13590, 4720], alaska: [16990, 5900], hawaii: [15630, 5430] },
  2024: { contiguous: [14580, 5140], alaska: [18210, 6430], hawaii: [16770, 5910] },
  2025: { contiguous: [15060, 5380], alaska: [18810, 6730], hawaii: [17310, 6190] },
};
/** [under 200%, 200–300%, 300–400%] × [single, other filing status]. */
export const PTC_REPAYMENT_LIMIT: Record<number, Array<[number, number]>> = {
  2023: [[350, 700], [900, 1800], [1500, 3000]],
  2024: [[375, 750], [950, 1900], [1575, 3150]],
  2025: [[375, 750], [975, 1950], [1625, 3250]],
};

/**
 * Alaska Permanent Fund dividend per eligible resident (Schedule 1 line 8g), including any
 * energy relief payment made with it: 2023 $1,312; 2024 $1,702 ($1,403.83 + $298.17 energy
 * relief); 2025 $1,000 (Alaska Department of Revenue announcements).
 */
export const ALASKA_PFD: Record<number, number> = { 2023: 1312, 2024: 1702, 2025: 1000 };

/**
 * 2025 Schedule 1-A Part V, enhanced deduction for seniors (OBBBA § 70103):
 * $6,000 per spouse born before January 2, 1961 with a valid SSN, less 6% of
 * modified AGI over $75,000 ($150,000 joint); married couples must file jointly.
 * Tax years 2025–2028.
 */
export const SENIOR_DEDUCTION = { amount: 6000, phaseoutRate: 0.06, threshold: { joint: 150000, other: 75000 }, firstYear: 2025, lastYear: 2028 };

export const EDUCATOR_EXPENSE_LIMIT = 300;
export const STUDENT_LOAN_INTEREST = { max: 2500, phaseoutRange: { joint: 30000, other: 15000 } };
/** § 199A(b)(3)(B) phase-in range above the threshold, 2018–2025 (OBBBA widens it from 2026). */
export const QBI_PHASE_IN_RANGE = { joint: 100000, other: 50000 };
/** § 199A deduction rate. */
export const QBI_RATE = 0.20;
/** Simplified home-office method (Rev. Proc. 2013-13): $5 per square foot, up to 300 square feet. */
export const SIMPLIFIED_HOME_OFFICE = { ratePerSqFt: 5, maxSqFt: 300 };

export const SUPPORTED_TAX_YEARS = Object.keys(YEARS).map(Number);

export function yearConstants(taxYear: number): YearConstants {
  const c = YEARS[taxYear];
  if (!c) throw new Error(`No tax constants for tax year ${taxYear} (supported: ${SUPPORTED_TAX_YEARS.join(", ")})`);
  return c;
}

function statusKey(status: FilingStatus): keyof StatusTable<unknown> {
  switch (status) {
    case "MFJ":
    case "QSS": return "mfj";
    case "MFS": return "mfs";
    case "HOH": return "hoh";
    case "Single": return "single";
  }
}

export const isMarriedStatus = (s: FilingStatus) => s === "MFJ" || s === "MFS" || s === "QSS";

/** Basic standard deduction (before the aged/blind add-on). */
export function standardDeduction(taxYear: number, status: FilingStatus): number {
  const row = yearConstants(taxYear).standardDeduction;
  switch (status) {
    case "Single":
    case "MFS": return row.single;
    case "MFJ":
    case "QSS": return row.mfj;
    case "HOH": return row.hoh;
  }
}

export function additionalStandardDeduction(taxYear: number, status: FilingStatus): number {
  const a = yearConstants(taxYear).additionalStandardDeduction;
  return isMarriedStatus(status) ? a.married : a.unmarried;
}

/** Form 8880 table column: MFJ, HOH, or everyone else (single, MFS and QSS share a column). */
const saversColumn = (status: FilingStatus) => (status === "MFJ" ? "joint" : status === "HOH" ? "hoh" : "other");

export function saversCreditAgiLimit(taxYear: number, status: FilingStatus): number {
  return yearConstants(taxYear).saversCreditAgiLimit[saversColumn(status)];
}

/** Form 8880 line 9: the credit rate for this AGI (0.5, 0.2, 0.1 or 0). */
export function saversCreditRate(taxYear: number, status: FilingStatus, agi: number): number {
  const [fifty, twenty, ten] = yearConstants(taxYear).saversCreditBrackets[saversColumn(status)];
  return agi <= fifty ? 0.5 : agi <= twenty ? 0.2 : agi <= ten ? 0.1 : 0;
}

export function ssWageBase(taxYear: number): number {
  return yearConstants(taxYear).ssWageBase;
}

export function capitalGainsThresholds(taxYear: number, status: FilingStatus): { zeroMax: number; fifteenMax: number } {
  const c = yearConstants(taxYear);
  const k = statusKey(status);
  return { zeroMax: c.capitalGainsZeroMax[k], fifteenMax: c.capitalGainsFifteenMax[k] };
}

/** Exact tax from the rate schedule (Tax Computation Worksheet), in cents. */
export function scheduleTax(taxableIncome: number, taxYear: number, status: FilingStatus): number {
  const limits = yearConstants(taxYear).brackets[statusKey(status)];
  let tax = 0;
  let lower = 0;
  for (let i = 0; i < RATES.length; i++) {
    const upper = i < limits.length ? limits[i] : Infinity;
    if (taxableIncome <= lower) break;
    tax += (Math.min(taxableIncome, upper) - lower) * RATES[i];
    lower = upper;
  }
  return Math.round(tax * 100) / 100;
}

/**
 * Tax on line 15 (or a QDCG worksheet line) as the 1040 instructions require:
 * under $100,000 use the Tax Table, which taxes the midpoint of each row and
 * rounds to whole dollars (rows: 0–5, 5–15, 15–25, then $25 rows to $3,000,
 * then $50 rows); $100,000 or more use the Tax Computation Worksheet.
 */
export function taxOnIncome(taxableIncome: number, taxYear: number, status: FilingStatus): number {
  const x = Math.max(0, taxableIncome);
  if (x >= 100000) return scheduleTax(x, taxYear, status);
  let lo: number, hi: number;
  if (x < 5) { lo = 0; hi = 5; }
  else if (x < 15) { lo = 5; hi = 15; }
  else if (x < 25) { lo = 15; hi = 25; }
  else if (x < 3000) { lo = Math.floor(x / 25) * 25; hi = lo + 25; }
  else { lo = Math.floor(x / 50) * 50; hi = lo + 50; }
  const mid = (lo + hi) / 2;
  return Math.round(scheduleTax(mid, taxYear, status) + 1e-6);
}
