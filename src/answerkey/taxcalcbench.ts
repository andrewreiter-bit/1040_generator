/**
 * Adapter for the TaxCalcBench TY24 dataset (github.com/column-tax/tax-calc-bench),
 * used as an external answer key for computeReturn.
 *
 * DATA USE: TaxCalcBench is published for evaluation only — its notice asks that
 * its inputs and expected outputs never be used for model training or synthetic
 * training-data generation. This module only READS a local clone to score our
 * calculation engine. Nothing from the dataset is copied into this repo or into
 * generated returns; keep it that way.
 *
 * Inputs are question/answer JSON. A case is "in scope" only if every non-empty
 * answer is something FakeTaxpayer represents (see SUPPORTED_PATHS); anything else
 * is reported as out of scope instead of being silently dropped.
 */
import fs from "fs";
import path from "path";
import { Dependent, FakeTaxpayer, FilingStatus, W2Record } from "../faker/taxpayer";
import { ReturnLines } from "../tax/compute";

type Json = unknown;

export interface BenchCase {
  name: string;
  input: Json;
  /** IRS1040 element name → expected amount (missing elements are 0, as in TaxCalcBench's scorer). */
  expectedXml: string;
}

export interface ScoredLine {
  line: string;
  element: string;
  pick: (r: ReturnLines) => number;
}

/** The 19 federal lines TaxCalcBench scores for TY24 (tax_return_evaluator.py). */
export const SCORED_LINES: ScoredLine[] = [
  { line: "1a",  element: "WagesAmt",                       pick: (r) => r.wages },
  { line: "9",   element: "TotalIncomeAmt",                 pick: (r) => r.totalIncome },
  { line: "10",  element: "TotalAdjustmentsAmt",            pick: (r) => r.adjustments },
  { line: "11",  element: "AdjustedGrossIncomeAmt",         pick: (r) => r.agi },
  { line: "12",  element: "TotalItemizedOrStandardDedAmt",  pick: (r) => r.deduction },
  { line: "15",  element: "TaxableIncomeAmt",               pick: (r) => r.taxableIncome },
  { line: "16",  element: "TaxAmt",                         pick: (r) => r.tax },
  { line: "19",  element: "CTCODCAmt",                      pick: (r) => r.childAndOtherDependentCredit },
  { line: "24",  element: "TotalTaxAmt",                    pick: (r) => r.totalTax },
  { line: "25d", element: "WithholdingTaxAmt",              pick: (r) => r.totalWithholding },
  { line: "26",  element: "EstimatedTaxPaymentsAmt",        pick: (r) => r.estimatedPayments },
  { line: "27",  element: "EarnedIncomeCreditAmt",          pick: () => 0 },
  { line: "28",  element: "AdditionalChildTaxCreditAmt",    pick: () => 0 },
  { line: "29",  element: "RefundableAmerOppCreditAmt",     pick: () => 0 },
  { line: "32",  element: "RefundableCreditsAmt",           pick: () => 0 },
  { line: "33",  element: "TotalPaymentsAmt",               pick: (r) => r.totalPayments },
  { line: "34",  element: "OverpaidAmt",                    pick: (r) => r.overpaid },
  { line: "35a", element: "RefundAmt",                      pick: (r) => r.refund },
  { line: "37",  element: "OwedAmt",                        pick: (r) => r.amountOwed },
];

/** Cases whose expected output contradicts their own inputs (TaxCalcBench README "Known issues"). */
export const KNOWN_BAD_CASES: Record<string, string> = {
  "single-senior-blind-over-65": "missing Form 1095-A data needed for Form 8962 (tax-calc-bench#66)",
  "mfj-dependent-claimed-2441-exclusion": "answers 'no' to educator expenses / estimated payments but expected output counts them (tax-calc-bench#161)",
  "mfj-w2-box12-codes-a-b-1099int-schedulec": "answers 'no' to educator expenses / estimated payments but expected output counts them (tax-calc-bench#161)",
};

export function loadTy24Cases(benchDir: string): BenchCase[] {
  const dataDir = path.join(benchDir, "tax_calc_bench", "ty24", "test_data");
  if (!fs.existsSync(dataDir)) {
    throw new Error(`TaxCalcBench TY24 data not found at ${dataDir}`);
  }
  return fs.readdirSync(dataDir)
    .filter((d) => fs.existsSync(path.join(dataDir, d, "input.json")))
    .sort()
    .map((name) => ({
      name,
      input: JSON.parse(fs.readFileSync(path.join(dataDir, name, "input.json"), "utf8")),
      expectedXml: fs.readFileSync(path.join(dataDir, name, "output.xml"), "utf8"),
    }));
}

/** Value of /Return/ReturnData/IRS1040/<element>, or 0 when absent. */
export function expectedAmount(xml: string, element: string): number {
  const block = /<IRS1040\b[^>]*>([\s\S]*?)<\/IRS1040>/.exec(xml)?.[1] ?? "";
  const m = new RegExp(`<${element}(?:\\s[^>]*)?>([^<]*)</${element}>`).exec(block);
  if (!m) return 0;
  const n = Number(m[1].replace(/[$,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── Input walking ─────────────────────────────────────────────────────────────

/** A leaf answer: { label, value } (some leaves have no label). */
function isLeaf(x: unknown): x is { value: unknown } {
  return !!x && typeof x === "object" && "value" in (x as object) &&
    (typeof (x as { value: unknown }).value !== "object" || (x as { value: unknown }).value === null);
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || v === false || v === 0;

/** Every non-empty leaf as "a.b[].c" → values. */
function leaves(x: unknown, p = "", out: Array<[string, unknown]> = []): Array<[string, unknown]> {
  if (isLeaf(x)) {
    if (!isEmpty(x.value)) out.push([p, x.value]);
  } else if (Array.isArray(x)) {
    x.forEach((i) => leaves(i, `${p}[]`, out));
  } else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) leaves(v, p ? `${p}.${k}` : k, out);
  }
  return out;
}

/**
 * Non-empty answers that FakeTaxpayer represents, or that have no effect on the
 * 19 scored lines (addresses, bank details, state boxes, etc.).
 */
const SUPPORTED_PATHS: RegExp[] = [
  /^has_ssn$/, /^residency_status$/,
  /^irs1040\.(filing_status|tp_(first_name|last_name|middle_initial|date_of_birth|occupation)|sp_(first_name|last_name|middle_initial|date_of_birth|occupation|presidential_election_campaign))$/,
  /^irs1040\.(refund_method|routing_number|account_number|bank_account_type|virtual_currency|tp_elects_to_claim_dependent_credit|hoh_planning_to_claim_child_or_dependent_credit)$/,
  /^irs1040\.qualifying_child_(name|ssn|dob|relationship)$/,
  /^irs1040\.(paid_estimated_tax_pmts|estimated_tax_payment_[1-4]|applied_from_prior_year)$/,
  /^irs1040\.dependent_detail\[\]\.dependent_(first_name|last_name|middle_initial|date_of_birth|months_lived|months_lived_in_us|relationship|ssn|ssn_employment_valid|supported_by_tp|us_citizen_national_or_resident_alien|us_citizen_national_resident_alien_or_canada_mexico_resident|student_for_5_plus_months)$/,
  /^w2\[\]\.(who_applies_to|ein|employer_(name|street_address|city|state|zip)|wages|withholding|social_security_(wages|tax|tips)|medicare_(wages_and_tips|tax_withheld)|retirement_plan|third_party_sick_pay)$/,
  /^w2\[\]\.w2_state_local_tax_grp\[\]\./,
  /^w2\[\]\.other_deductions\[\]\./,          // box 14: informational
  /^irs1040_scheduleb\.irs1099_int\[\]\.(interest_1099int_(who_applies_to|payer|payer_ein|interest|fed_inc_tax_withheld)|int_payer_\w+|irs1099_int_state\[\]\.\w+)$/,
  /^irs1040_scheduleb\.irs1099_div\[\]\.dividend_1099div_(who_applies_to|payer|ordinary_div|qualified_div|capital_gain_distr|nondividend_distributions)$/,
  /^irs_payment\./,                            // direct debit of a balance due
];

/** W-2 box 12 codes that never change the scored 1040 lines. */
const NEUTRAL_BOX12 = new Set(["C", "DD"]);

const FILING_STATUS: Record<string, FilingStatus> = {
  single: "Single",
  married_jointly: "MFJ",
  married_separately: "MFS",
  head_of_household: "HOH",
  qualifying_surviving_spouse: "QSS",
};

const RELATIONSHIP: Record<string, Dependent["relationship"]> = {
  son: "Child", daughter: "Child", stepchild: "Child", foster_child: "Child",
  parent: "Parent", brother: "Sibling", sister: "Sibling",
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const isoToUs = (d: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d ?? ""));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
};

function val(obj: unknown, key: string): unknown {
  const v = (obj as Record<string, unknown> | undefined)?.[key];
  return isLeaf(v) ? v.value : v;
}

function list(obj: unknown, key: string): unknown[] {
  const v = val(obj, key);
  return Array.isArray(v) ? v : [];
}

export interface Conversion {
  taxpayer?: FakeTaxpayer;
  /** Answers our model does not represent; non-empty → case is out of scope. */
  outOfScope: string[];
}

export function toTaxpayer(input: Json, taxYear = 2024): Conversion {
  const root = (input as { input: Record<string, unknown> }).input;
  const header = root.return_header;
  const rd = root.return_data as Record<string, unknown>;
  const outOfScope = new Set<string>();

  for (const [p, v] of leaves(rd)) {
    if (p === "w2[].employers_use_grp[].box_12_code") {
      if (!NEUTRAL_BOX12.has(String(v))) outOfScope.add(`W-2 box 12 code ${v}`);
      continue;
    }
    if (p === "w2[].employers_use_grp[].box_12_amount") continue;
    if (!SUPPORTED_PATHS.some((re) => re.test(p))) outOfScope.add(p);
  }

  const f1040 = rd.irs1040;
  const status = FILING_STATUS[String(val(f1040, "filing_status"))];
  if (!status) outOfScope.add(`filing_status=${val(f1040, "filing_status")}`);

  const dependents: Dependent[] = list(f1040, "dependent_detail").map((d) => {
    const rel = String(val(d, "dependent_relationship") ?? "");
    if (val(d, "dependent_ssn_employment_valid") === false) outOfScope.add("dependent SSN not valid for employment (ODC instead of CTC)");
    return {
      firstName: String(val(d, "dependent_first_name") ?? ""),
      lastName: String(val(d, "dependent_last_name") ?? ""),
      ssn: String(val(d, "dependent_ssn") ?? ""),
      relationship: RELATIONSHIP[rel] ?? "Other",
      birthYear: Number(String(val(d, "dependent_date_of_birth") ?? "").slice(0, 4)),
      monthsInHome: num(val(d, "dependent_months_lived")),
      qualifiesChildTaxCredit: false, // derived from age by tax/household
      qualifiesOtherDependent: false,
    };
  });

  const w2Records: W2Record[] = list(rd, "w2").map((w) => {
    const st = list(w, "w2_state_local_tax_grp")[0];
    return {
      employerName: String(val(w, "employer_name") ?? ""),
      employerEin: String(val(w, "ein") ?? ""),
      employerStreet: String(val(w, "employer_street_address") ?? ""),
      employerCity: String(val(w, "employer_city") ?? ""),
      employerState: String(val(w, "employer_state") ?? ""),
      employerZip: String(val(w, "employer_zip") ?? ""),
      wages: num(val(w, "wages")),
      federalWithheld: num(val(w, "withholding")),
      socialSecurityWages: num(val(w, "social_security_wages")),
      ssWithheld: num(val(w, "social_security_tax")),
      medicareWages: num(val(w, "medicare_wages_and_tips")),
      medicareWithheld: num(val(w, "medicare_tax_withheld")),
      stateWages: num(val(st, "state_wages")),
      stateWithheld: num(val(st, "state_income_tax")),
      stateCode: String(val(st, "state") ?? ""),
      employee: val(w, "who_applies_to") === "spouse" ? "spouse" : "primary",
    };
  });

  const schB = rd.irs1040_scheduleb;
  const interest1099s = list(schB, "irs1099_int").map((i) => ({
    payerName: String(val(i, "interest_1099int_payer") ?? ""),
    payerTin: String(val(i, "interest_1099int_payer_ein") ?? ""),
    interestIncome: num(val(i, "interest_1099int_interest")),
    earlyWithdrawalPenalty: 0,
    usSavingsBondInterest: 0,
    federalWithheld: num(val(i, "interest_1099int_fed_inc_tax_withheld")),
  }));
  const dividend1099s = list(schB, "irs1099_div").map((d) => ({
    payerName: String(val(d, "dividend_1099div_payer") ?? ""),
    payerTin: "",
    ordinaryDividends: num(val(d, "dividend_1099div_ordinary_div")),
    qualifiedDividends: num(val(d, "dividend_1099div_qualified_div")),
    totalCapitalGain: num(val(d, "dividend_1099div_capital_gain_distr")),
  }));

  const estimated =
    [1, 2, 3, 4].reduce((s, q) => s + num(val(f1040, `estimated_tax_payment_${q}`)), 0) +
    num(val(f1040, "applied_from_prior_year"));

  const married = status === "MFJ" || status === "MFS";
  const taxpayer: FakeTaxpayer = {
    seed: 0,
    taxYear,
    firstName: String(val(f1040, "tp_first_name") ?? ""),
    middleInitial: String(val(f1040, "tp_middle_initial") ?? ""),
    lastName: String(val(f1040, "tp_last_name") ?? ""),
    ssn: String(val(header, "tp_ssn") ?? ""),
    dateOfBirth: isoToUs(val(f1040, "tp_date_of_birth")),
    occupation: String(val(f1040, "tp_occupation") ?? ""),
    phone: "",
    streetAddress: String(val(header, "address") ?? ""),
    aptNumber: null,
    city: String(val(header, "city") ?? ""),
    state: String(val(header, "state") ?? ""),
    zipCode: String(val(header, "zip_code") ?? ""),
    filingStatus: status ?? "Single",
    spouseFirstName: married ? String(val(f1040, "sp_first_name") ?? "") : null,
    spouseLastName: married ? String(val(f1040, "sp_last_name") ?? "") : null,
    spouseSSN: married ? String(val(header, "sp_ssn") ?? "") : null,
    spouseDateOfBirth: married ? isoToUs(val(f1040, "sp_date_of_birth")) : null,
    spouseOccupation: married ? String(val(f1040, "sp_occupation") ?? "") : null,
    dependents,
    routingNumber: String(val(f1040, "routing_number") ?? ""),
    accountNumber: String(val(f1040, "account_number") ?? ""),
    accountType: val(f1040, "bank_account_type") === "savings" ? "Savings" : "Checking",
    w2Records,
    interest1099s,
    dividend1099s,
    totalWages: w2Records.reduce((s, w) => s + w.wages, 0),
    totalInterest: interest1099s.reduce((s, i) => s + i.interestIncome, 0),
    totalDividends: dividend1099s.reduce((s, d) => s + d.ordinaryDividends, 0),
    totalQualifiedDividends: dividend1099s.reduce((s, d) => s + d.qualifiedDividends, 0),
    businessIncome: null,
    rentalIncome: null,
    capitalGains: null,
    socialSecurityBenefits: null,
    estimatedTaxPayments: estimated,
    takesStandardDeduction: true,
    itemizedDeductionTotal: null,
    preparerPtin: null,
  };

  return { taxpayer, outOfScope: [...outOfScope] };
}
