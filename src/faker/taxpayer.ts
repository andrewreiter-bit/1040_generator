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
  /** Business standard-mileage miles (line 9 = miles × rate + parkingTolls). */
  vehicle?: { businessMiles: number; commutingMiles: number; otherMiles: number; placedInService: string; parkingTolls: number };
  /** Simplified-method home office: square feet used for business (line 30b) and of the whole home (30a). */
  homeOfficeSqFt?: number;
  homeTotalSqFt?: number;
  /** Line I: payments that require Forms 1099 (and line J: those 1099s were filed). */
  paid1099Payments?: boolean;
  /** Self-employed health insurance premiums for this business (Schedule 1 line 17). */
  healthInsurancePremiums?: number;
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
  capitalGains: number | null;
  socialSecurityBenefits: number | null;

  unemployment1099Gs?: Unemployment1099G[];
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
