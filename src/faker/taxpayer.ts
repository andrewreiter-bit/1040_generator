/**
 * FakeTaxpayer — the central identity model.
 * Every field on every form resolves from a single instance so SSN, name,
 * and address are consistent across the entire submission.
 */

export interface Dependent {
  firstName: string;
  lastName: string;
  ssn: string;
  relationship: "Child" | "Stepchild" | "Foster child" | "Grandchild" | "Sibling" | "Niece" | "Nephew" | "Parent" | "Other";
  birthYear: number;
  /** Months the dependent lived with the taxpayer in the U.S. */
  monthsInHome: number;
  /** Full-time student for some part of 5 months (qualifying child up to age 23). */
  fullTimeStudent?: boolean;
  /** Permanently and totally disabled (qualifying child at any age). */
  disabled?: boolean;
  /** SSN valid for employment, issued by the return due date. Omitted = valid. Needed for CTC and EIC. */
  ssnValidForEmployment?: boolean;
  qualifiesChildTaxCredit: boolean;
  qualifiesOtherDependent: boolean;
}

export interface W2Record {
  employerName: string;
  employerEin: string;
  employerStreet: string;
  employerCity: string;
  employerState: string;
  employerZip: string;
  wages: number;                  // Box 1
  federalWithheld: number;        // Box 2
  socialSecurityWages: number;    // Box 3
  ssWithheld: number;             // Box 4
  medicareWages: number;          // Box 5
  medicareWithheld: number;       // Box 6
  stateWages: number;             // Box 16
  stateWithheld: number;          // Box 17
  stateCode: string;              // Box 15
  /** Whose W-2 this is. Omitted = primary taxpayer. A spouse W-2 appears only on MFJ returns. */
  employee?: "primary" | "spouse";
  /**
   * Box 12 entries that change the return: elective deferrals (D, E, F, G, H, S, AA, BB, EE;
   * Form 8880 line 2), and A/B (uncollected Social Security / Medicare tax on tips) and M/N
   * (the same on group-term life insurance), which go to Schedule 2 line 13. Profiles draw
   * code D deferrals; A/B/M/N come only from the answer key.
   */
  box12?: Array<{ code: string; amount: number }>;
  /** Box 13 "Retirement plan": covered by a plan at work. Omitted = covered when box 12 shows an elective deferral. */
  retirementPlan?: boolean;
}

export interface Interest1099 {
  payerName: string;
  payerTin: string;
  interestIncome: number;
  earlyWithdrawalPenalty: number;
  usSavingsBondInterest: number;
  /** Box 4. Omitted = none. */
  federalWithheld?: number;
}

export interface Dividend1099 {
  payerName: string;
  payerTin: string;
  ordinaryDividends: number;
  qualifiedDividends: number;
  totalCapitalGain: number;
  /** Box 4. Omitted = none. */
  federalWithheld?: number;
}

/** Schedule C lines 8–27a. Amounts are what goes on the line, except `mealsTotal` (line 24b is 50% of it). */
export interface ScheduleCExpenses {
  advertising?: number;          // 8
  commissionsFees?: number;      // 10
  contractLabor?: number;        // 11
  depletion?: number;            // 12
  depreciation?: number;         // 13
  employeeBenefits?: number;     // 14
  insurance?: number;            // 15
  mortgageInterest?: number;     // 16a
  otherInterest?: number;        // 16b
  legalProfessional?: number;    // 17
  officeExpense?: number;        // 18
  pensionPlans?: number;         // 19
  rentVehicles?: number;         // 20a
  rentOther?: number;            // 20b
  repairs?: number;              // 21
  supplies?: number;             // 22
  taxesLicenses?: number;        // 23
  travel?: number;               // 24a
  mealsTotal?: number;           // 24b = 50%
  utilities?: number;            // 25
  wages?: number;                // 26
  otherExpenses?: number;        // 27a (Part V total)
  /** Part V detail; when omitted, Part V shows one "Other" row for `otherExpenses`. */
  otherExpenseItems?: Array<{ description: string; amount: number }>;
}

/** One Schedule C (sole proprietorship). Losses are assumed fully at risk (line 32a). */
export interface ScheduleCBusiness {
  /** Omitted = primary taxpayer. A spouse business appears only on MFJ returns. */
  owner?: "primary" | "spouse";
  principalBusiness: string;     // line A
  businessCode: string;          // line B (6-digit NAICS-based code)
  businessName: string;          // line C ("" = none)
  ein: string;                   // line D ("" = none)
  accountingMethod: "Cash" | "Accrual";
  materiallyParticipated: boolean;
  grossReceipts: number;         // 1
  returnsAllowances: number;     // 2
  costOfGoodsSold: number;       // 4
  otherIncome: number;           // 6
  expenses: ScheduleCExpenses;
  /**
   * Business standard-mileage miles (line 9 = miles × rate + parkingTolls). The car loan
   * interest and personal property tax are for the whole year; their business share
   * (business ÷ total miles, Pub 463) goes on lines 16b and 23, not line 9.
   */
  vehicle?: {
    businessMiles: number; commutingMiles: number; otherMiles: number; placedInService: string; parkingTolls: number;
    loanInterest?: number; personalPropertyTax?: number;
  };
  /** Simplified-method home office: square feet used for business (line 30b) and of the whole home (30a). */
  homeOfficeSqFt?: number;
  homeTotalSqFt?: number;
  /** Line I: payments that require Forms 1099 (and line J: those 1099s were filed). */
  paid1099Payments?: boolean;
  /** Self-employed health insurance premiums for this business (Schedule 1 line 17). */
  healthInsurancePremiums?: number;
  /** § 199A: not a qualified trade or business (left out of Forms 8995 / 8995-A). Omitted = qualified. */
  notQualifiedForQbi?: boolean;
  /** § 199A: specified service trade or business (health, law, accounting, consulting, …). */
  sstb?: boolean;
  /** § 199A W-2 wages paid to employees (Form 8995-A line 4). */
  w2WagesPaid?: number;
  /** § 199A unadjusted basis immediately after acquisition of qualified property (line 7). */
  ubia?: number;
}

/**
 * One sale of a capital asset: a Form 1099-B transaction and a Form 8949 row.
 * Dates are MM/DD/YYYY; `dateAcquired` may be "VARIOUS" (then `term` decides).
 */
export interface CapitalAssetSale {
  /** Omitted = primary taxpayer. A spouse's sale appears only on MFJ returns. */
  owner?: "primary" | "spouse";
  brokerName: string;
  brokerTin: string;
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  /** Used only when the dates can't decide (VARIOUS / missing date). */
  term?: "short" | "long";
  /** 1099-B box 12 / Form 8949 box: basis reported to IRS (A/D), not reported (B/E), no 1099-B (C/F). */
  reporting: "basisReported" | "basisNotReported" | "noForm1099B";
  /** 1099-B box 1g: wash sale loss disallowed (added back, code W). */
  washSaleDisallowed?: number;
  /** 1099-B box 1f: accrued market discount (ordinary income up to the gain, code D). */
  accruedMarketDiscount?: number;
  /** 1099-B box 4. */
  federalWithheld?: number;
}

/** Schedule A inputs (amounts paid, before any limit). */
export interface ItemizedDeductions {
  medicalExpenses?: number;          // 1 (before the 7.5%-of-AGI floor)
  /** 5a. Omitted = state/local income tax withheld on the return's W-2s (box 17). */
  stateLocalTax?: { kind: "income" | "sales"; amount: number };
  realEstateTax?: number;            // 5b
  personalPropertyTax?: number;      // 5c
  mortgageInterest1098?: number;     // 8a (home acquisition debt assumed within the limit)
  mortgagePoints?: number;           // 8c
  charityCash?: number;              // 11
  /** 12. Kept at $500 or less (no Form 8283). */
  charityNonCash?: number;
  /**
   * Lines 11–12 by Pub 526 limit category (percent of AGI). When present, charityCash and
   * charityNonCash are ignored: line 11 = cash60 + cash30, line 12 = the rest.
   */
  charityByLimit?: { cash60?: number; cash30?: number; nonCash50?: number; nonCash30?: number; capitalGain30?: number; capitalGain20?: number };
  /** 13. Carryover from prior years (assumed within its 5 years). */
  charityCarryover?: number;
  /** 16. Gambling losses, deductible up to the gambling winnings on Schedule 1 line 8b. */
  gamblingLosses?: number;
  /** 18. Itemize even when smaller than the standard deduction. */
  electToItemize?: boolean;
}

/** One rental real estate property (Schedule E Part I column). */
export interface RentalProperty {
  address: string;                   // 1a, street, city, state and ZIP
  /** 1b property type code: 1 single family, 2 multi-family, 3 vacation/short-term, 4 commercial, 5 land, 6 royalties, 7 self-rental, 8 other. */
  propertyType: number;
  fairRentalDays: number;            // 2
  personalUseDays: number;
  qualifiedJointVenture: boolean;
  /** Actively participated (management decisions, ≥ 10% owner). Omitted = yes. */
  activeParticipation?: boolean;
  /** Materially participated (with `realEstateProfessional`, the rental isn't passive; § 469(c)(7)). */
  materialParticipation?: boolean;
  /** Royalties (code 6) from a trade or business: passive (Form 8582 line 2). Omitted = portfolio income. */
  royaltyPassive?: boolean;
  /** Treated as a § 199A trade or business: its allowed result is QBI (Form 8995 / 8995-A row). */
  qbi?: boolean;
  /** Whose property it is (joint: both spouses). Omitted = primary. */
  owner?: "primary" | "spouse" | "joint";
  /** Prior-year unallowed passive loss carried forward (Form 8582 line 1c), as a positive amount. */
  priorYearUnallowedLoss?: number;
  rents: number;                     // 3
  royalties: number;                 // 4
  expenses: {
    advertising?: number; autoTravel?: number; cleaningMaintenance?: number; commissions?: number;
    insurance?: number; legalProfessional?: number; managementFees?: number; mortgageInterest?: number;
    otherInterest?: number; repairs?: number; supplies?: number; taxes?: number; utilities?: number;
    depreciation?: number; other?: number;
  };
}

/** Form SSA-1099 (Social Security benefit statement). */
export interface SSA1099 {
  /** Omitted = primary taxpayer. A spouse's SSA-1099 appears only on MFJ returns. */
  recipient?: "primary" | "spouse";
  benefitsPaid: number;      // box 3
  benefitsRepaid: number;    // box 4
  netBenefits: number;       // box 5 = 3 − 4 (Form 1040 line 6a)
  federalWithheld: number;   // box 6
  /** Medicare premiums withheld (part of box 3; deductible only on Schedule A). */
  medicarePremiums?: number;
}

/** Form 1099-G box 1 unemployment compensation (Schedule 1 line 7). */
export interface Unemployment1099G {
  /** Omitted = primary taxpayer. A spouse's 1099-G appears only on MFJ returns. */
  recipient?: "primary" | "spouse";
  payerName: string;
  payerTin: string;
  compensation: number;         // box 1
  /** Benefits repaid in the same year (subtracted on line 7). */
  repaidThisYear: number;
  federalWithheld: number;      // box 4
}

/** Form 1099-R box 7 distribution codes the model supports. */
export type DistributionCode =
  | "1"   // early distribution, no known exception (10% additional tax)
  | "2"   // early distribution, exception applies
  | "7"   // normal distribution
  | "G"   // direct rollover to a qualified plan or IRA (box 2a = 0)
  | "Q";  // qualified Roth IRA distribution (not taxable)

/**
 * Form 1099-R: a distribution from a pension, annuity, 401(k) or IRA. The
 * IRA/SEP/SIMPLE box decides the 1040 line (4a/4b for IRAs, 5a/5b otherwise).
 */
export interface Retirement1099R {
  /** Omitted = primary taxpayer. A spouse's 1099-R appears only on MFJ returns. */
  recipient?: "primary" | "spouse";
  payerName: string;
  payerTin: string;
  payerStreet: string;
  /** "City, ST ZIP". */
  payerCity: string;
  accountNumber?: string;
  grossDistribution: number;          // box 1
  /** Box 2a. Code G: 0. Code Q: 0 (left blank by the payer, not taxable). */
  taxableAmount: number;
  taxableAmountNotDetermined: boolean; // box 2b
  totalDistribution: boolean;          // box 2b
  federalWithheld: number;            // box 4
  /** Box 5: employee contributions recovered tax free (box 1 − box 2a for a partly taxable pension). */
  employeeContributions?: number;
  distributionCode: DistributionCode; // box 7
  iraSepSimple: boolean;              // box 7 checkbox
  /** Box 14–16 (one state). */
  stateWithheld?: number;
  stateCode?: string;
  statePayerNumber?: string;
}

/** A care provider for Form 2441 Part I. */
export interface CareProvider {
  name: string;
  street: string;
  /** "City, ST ZIP". */
  city: string;
  /** SSN for an individual, EIN for a daycare center. */
  tin: string;
  /** Household employee (e.g. a nanny): Schedule H territory, not modelled. Omitted = no. */
  householdEmployee?: boolean;
  amountPaid: number;
}

/** Child and dependent care (Form 2441). */
export interface DependentCare {
  providers: CareProvider[];
  /** Qualified expenses incurred and paid this year, per dependent (index into `dependents`). */
  expenses: Array<{ dependentIndex: number; amount: number }>;
  /** Prior-year expenses paid this year (Form 2441 line 9b / Worksheet A; not modelled). */
  priorYearExpensesPaid?: number;
}

/** An eligible educational institution (Form 8863 line 22, Form 1098-T filer). */
export interface EducationInstitution {
  name: string;
  street: string;
  /** "City, ST ZIP". */
  city: string;
  ein: string;
}

/** One student's education expenses for Form 8863 Part III (and their Form 1098-T). */
export interface EducationStudent {
  /** Whose education: the filer, the spouse, or a dependent (index into `dependents`). */
  student: "primary" | "spouse" | number;
  institution: EducationInstitution;
  /** 1098-T box 1: payments received for qualified tuition and related expenses. */
  tuitionPaid: number;
  /** 1098-T box 5: scholarships or grants (reduce qualified expenses). */
  scholarships: number;
  /** Required course materials bought elsewhere (count for the American opportunity credit only). */
  courseMaterials?: number;
  /** Got a 1098-T from the institution for the year (line 22a(2)). Omitted = yes. */
  received1098T?: boolean;
  /** At least half-time in a degree program (1098-T box 8; line 24). */
  halfTime: boolean;
  /** Graduate student (1098-T box 9). */
  graduate: boolean;
  /** Completed the first 4 years of postsecondary education before the year (line 25). */
  completedFirst4Years: boolean;
  /** Tax years the American opportunity credit was already claimed for the student (line 23: 4 → none). */
  aotcPriorYears: number;
  /** Felony drug conviction (line 26). Omitted = no. */
  felonyDrugConviction?: boolean;
}

/** Education credits (Form 8863). */
export interface Education {
  students: EducationStudent[];
  /** Line 7 box: the filer is under 24 and meets the conditions that make the AOTC nonrefundable only. */
  aotcNonrefundableOnly?: boolean;
}

/**
 * Form 1095-A, Health Insurance Marketplace Statement: one policy covering the household for
 * the whole year at the same monthly amounts (so Form 8962 line 11's annual calculation applies).
 */
export interface Marketplace1095A {
  marketplaceId: string;
  policyNumber: string;
  issuer: string;
  /** Annual totals (line 33, columns A–C). */
  annualPremium: number;           // A: enrollment premiums
  annualSlcsp: number;             // B: second lowest cost silver plan premium
  annualAdvancePayments: number;   // C: advance payment of the PTC
}

/**
 * Form 3921: exercise of an incentive stock option. The shares are held at year end, so
 * there's no regular-tax income; the spread is an AMT adjustment (Form 6251 line 2i).
 */
export interface IsoExercise {
  /** Omitted = primary taxpayer. A spouse's exercise appears only on MFJ returns. */
  employee?: "primary" | "spouse";
  corporation: { name: string; street: string; city: string; ein: string };
  dateGranted: string;        // box 1, MM/DD/YYYY
  dateExercised: string;      // box 2 (in the tax year)
  exercisePrice: number;      // box 3, per share
  fairMarketValue: number;    // box 4, per share on the exercise date
  shares: number;             // box 5
  account?: string;
}

/** One person's health savings account (Form 8889; Form 1099-SA for distributions). */
export interface HsaAccount {
  /** HDHP coverage type (Form 8889 line 1); with `months`, the type on December 1 or the last covered month. */
  coverage: "self" | "family";
  /**
   * Months the person was an eligible individual on the 1st of the month, by coverage type (Line 3
   * Limitation Chart). Omitted = eligible all 12 months with `coverage`.
   */
  months?: { self: number; family: number };
  /** Coverage on December 1, when the person was eligible then (last-month rule). */
  decemberCoverage?: "self" | "family";
  /**
   * Elects the last-month rule: eligible on December 1 → treated as eligible all year with that
   * coverage (2025 instructions: "you may consider yourself"). The testing period (Part III) isn't modelled.
   */
  lastMonthRule?: boolean;
  /** Contributions the person made (not through the employer or a cafeteria plan), line 2. */
  contributions: number;
  /** Form 1099-SA, when the HSA paid out during the year. */
  distribution?: {
    trustee: { name: string; street: string; city: string; tin: string };
    account?: string;
    gross: number;             // box 1 (distribution code 1)
    qualifiedMedical: number;  // Form 8889 line 15
  };
}

/** Investment interest (Form 4952). */
export interface InvestmentInterest {
  /** Line 1: investment interest paid or accrued this year. */
  paid: number;
  /** Line 2: disallowed investment interest carried from last year's line 7. */
  priorYearDisallowed?: number;
  /** Line 4g: qualified dividends and net capital gain elected as investment income (capped at 4b + 4e). */
  electedQdcg?: number;
}

/** Form W-2G, gambling winnings (Schedule 1 line 8b; box 4 withholding → Form 1040 line 25c). */
export interface GamblingWinnings {
  recipient: "primary" | "spouse";
  payerName: string;
  payerTin: string;
  winnings: number;        // box 1
  federalWithheld: number; // box 4
}

export type FilingStatus = "Single" | "MFJ" | "MFS" | "HOH" | "QSS";

/**
 * Set on a per-document view by documentsFor (src/tax/documents.ts): the full
 * taxpayer the return is computed from, and which record this copy is for.
 */
export interface DocumentContext {
  source: FakeTaxpayer;
  /** Index into computeReturn(source).scheduleC. */
  scheduleCIndex?: number;
  /** Whose Schedule SE this is. */
  person?: "primary" | "spouse";
  /** Which Form 8949 copy (see form8949Copies). */
  form8949Copy?: number;
  /** Which reported sale a Form 1099-B is for (see reportedSales). */
  saleIndex?: number;
  /** Which Form 1099-R (index into computeReturn(source).retirement.records). */
  retirementIndex?: number;
  /** Which education student (index into source.education.students): Form 1098-T, Form 8863 page 2. */
  educationIndex?: number;
  /** Whose HSA (Form 8889, Form 1099-SA). */
  hsaPerson?: "primary" | "spouse";
  /** Which ISO exercise (index into the included exercises): Form 3921. */
  isoIndex?: number;
  /** Which Marketplace policy (index into source.marketplace1095As): Form 1095-A. */
  policyIndex?: number;
}

export interface FakeTaxpayer {
  seed: number;
  taxYear: number;

  // Primary identity
  firstName: string;
  middleInitial: string;
  lastName: string;
  ssn: string;               // XXX-XX-XXXX
  dateOfBirth: string;       // MM/DD/YYYY
  occupation: string;
  phone: string;             // (XXX) XXX-XXXX

  // Address
  streetAddress: string;
  aptNumber: string | null;
  city: string;
  state: string;             // 2-letter
  zipCode: string;

  // Spouse
  filingStatus: FilingStatus;
  spouseFirstName: string | null;
  spouseLastName: string | null;
  spouseSSN: string | null;
  spouseDateOfBirth: string | null;
  spouseOccupation: string | null;

  // Dependents
  dependents: Dependent[];

  // Banking
  routingNumber: string;
  accountNumber: string;
  accountType: "Checking" | "Savings";

  // Income documents
  w2Records: W2Record[];
  interest1099s: Interest1099[];
  dividend1099s: Dividend1099[];

  // Computed income totals
  totalWages: number;
  totalInterest: number;
  totalDividends: number;
  totalQualifiedDividends: number;
  /** Net Schedule C profit/loss. Ignored by computeReturn when `scheduleCs` is present (then it should equal their sum). */
  businessIncome: number | null;
  scheduleCs?: ScheduleCBusiness[];
  rentalIncome: number | null;
  /** Net capital gain/loss as a bare figure (legacy); ignored when `capitalSales` is present. */
  capitalGains: number | null;
  /** Net Social Security benefits as a bare figure (legacy); ignored when `ssa1099s` is present. */
  socialSecurityBenefits: number | null;

  unemployment1099Gs?: Unemployment1099G[];
  /** Health savings accounts, per person (Form 8889). Employer contributions are W-2 box 12 code W. */
  hsa?: { primary?: HsaAccount; spouse?: HsaAccount };
  /** Investment interest expense (Form 4952 → Schedule A line 9). */
  investmentInterest?: InvestmentInterest;
  /** Forms W-2G (gambling winnings). */
  gamblingWinnings?: GamblingWinnings[];
  /** Incentive stock option exercises (Forms 3921 → Form 6251 line 2i). */
  isoExercises?: IsoExercise[];
  /**
   * Married filing separately: qualifies for the Form 8962 line A exception (domestic abuse or
   * spousal abandonment). Without it a separate filer can't take the PTC and repays the advance.
   */
  ptcMfsException?: boolean;
  /** Form 8960 line 10: additional modifications to net investment income (positive reduces it). */
  niitAdditionalModifications?: number;
  /** Health Insurance Marketplace coverage (Forms 1095-A → Form 8962). */
  marketplace1095As?: Marketplace1095A[];
  /** Education credits: students, institutions and expenses (Form 8863, Forms 1098-T). */
  education?: Education;
  /** Child and dependent care expenses and providers (Form 2441). */
  dependentCare?: DependentCare;
  /** Traditional IRA contributions for the year, per person (IRA deduction, Schedule 1 line 20; Form 8880 line 1). */
  traditionalIraContributions?: { primary?: number; spouse?: number };
  /** Roth IRA contributions for the year, per person (Form 8880 line 1; not deductible). */
  rothIraContributions?: { primary?: number; spouse?: number };
  /** Full-time student for some part of 5 months of the year (no Saver's credit for that person). */
  fullTimeStudent?: { primary?: boolean; spouse?: boolean };
  /** Alaska Permanent Fund dividends received (Schedule 1 line 8g), per person. */
  alaskaPermanentFundDividends?: { primary?: number; spouse?: number };
  /** Pension, annuity and IRA distributions (Form 1040 lines 4a–5b). */
  retirement1099Rs?: Retirement1099R[];
  /** Social Security benefits. When present, `socialSecurityBenefits` is ignored. */
  ssa1099s?: SSA1099[];
  /** MFS only: lived with the spouse at any time during the year (Social Security base amount $0). Omitted = yes. */
  mfsLivedWithSpouse?: boolean;
  /** Legally blind at year end (additional standard deduction). */
  blind?: boolean;
  spouseBlind?: boolean;
  /** Schedule E lines A/B: payments that required Forms 1099, and whether they were all filed. Omitted = no. */
  scheduleE1099?: { required: boolean; filed?: boolean };
  /** A real estate professional (§ 469(c)(7)(B)): materially participated rentals aren't passive. */
  realEstateProfessional?: boolean;
  /** Married filing separately and the spouse itemizes: the standard deduction is $0 (§ 63(c)(6)(A)). */
  spouseItemizes?: boolean;
  /** Schedule A detail. When present, `itemizedDeductionTotal` is ignored. */
  itemized?: ItemizedDeductions;
  /** Schedule E Part I rentals. When present, `rentalIncome` is ignored. */
  rentals?: RentalProperty[];
  /** Capital asset sales (Form 8949 / Schedule D). When present, `capitalGains` is ignored. */
  capitalSales?: CapitalAssetSale[];
  /** Capital loss carryover from the prior year, as positive amounts (Schedule D lines 6 and 14). */
  capitalLossCarryover?: { shortTerm: number; longTerm: number };
  /** Unreimbursed K–12 educator expenses (Schedule 1 line 11), per person, before the per-person cap. */
  educatorExpenses?: { primary?: number; spouse?: number };
  /** Student loan interest paid (Schedule 1 line 21 worksheet input). */
  studentLoanInterestPaid?: number;

  /** Prior-year qualified business loss carryforward, as a positive amount (Form 8995 line 3). */
  priorYearQbiLoss?: number;
  /** Federal income tax withheld on 1099-NEC / 1099-MISC / 1099-K (part of 1040 line 25b). */
  otherForm1099Withholding?: number;

  /** Present only on per-document views (see DocumentContext). */
  document?: DocumentContext;

  /** Round every computed line to whole dollars instead of keeping cents. */
  wholeDollars?: boolean;

  /** Estimated tax payments plus any overpayment applied from the prior year (1040 line 26). */
  estimatedTaxPayments?: number;

  // Deductions
  takesStandardDeduction: boolean;
  itemizedDeductionTotal: number | null;

  // Preparer
  preparerPtin: string | null;
}
