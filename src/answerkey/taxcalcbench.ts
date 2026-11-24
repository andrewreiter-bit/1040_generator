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
import { CapitalAssetSale, Dependent, FakeTaxpayer, FilingStatus, ScheduleCBusiness, W2Record } from "../faker/taxpayer";
import { ReturnLines } from "../tax/compute";
import { saversCreditAgiLimit } from "../config/tax-year";
import { isQualifyingChild } from "../tax/household";

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
  { line: "27",  element: "EarnedIncomeCreditAmt",          pick: (r) => r.earnedIncomeCredit },
  { line: "28",  element: "AdditionalChildTaxCreditAmt",    pick: (r) => r.additionalChildTaxCredit },
  { line: "29",  element: "RefundableAmerOppCreditAmt",     pick: () => 0 },
  { line: "32",  element: "RefundableCreditsAmt",           pick: (r) => r.refundableCredits },
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
  return expectedAmounts(xml, "IRS1040", element)[0] ?? 0;
}

/**
 * Every value of <element> inside each <form> block (e.g. one per Schedule C or
 * Schedule SE), in document order; a block without the element contributes 0.
 */
export function expectedAmounts(xml: string, form: string, element: string): number[] {
  const blocks = [...xml.matchAll(new RegExp(`<${form}\\b[^>]*>([\\s\\S]*?)</${form}>`, "g"))].map((m) => m[1]);
  return blocks.map((block) => {
    const m = new RegExp(`<${element}(?:\\s[^>]*)?>([^<]*)</${element}>`).exec(block);
    const n = m ? Number(m[1].replace(/[$,\s]/g, "")) : 0;
    return isNaN(n) ? 0 : n;
  });
}

/** Supporting-form amounts shown by --verbose, to locate where a 1040 line diverges. */
export const DETAIL_LINES: Array<{ form: string; element: string; label: string; pick: (r: ReturnLines) => number[] }> = [
  { form: "IRS1040ScheduleC", element: "NetProfitOrLossAmt", label: "Sch C 31", pick: (r) => r.scheduleC.map((c) => c.netProfit) },
  { form: "IRS1040ScheduleSE", element: "SelfEmploymentTaxAmt", label: "Sch SE 12", pick: (r) => r.scheduleSE.filter((s) => !s.belowMinimum).map((s) => s.seTax) },
  { form: "IRS1040Schedule1", element: "TotalAdditionalIncomeAmt", label: "Sch 1 10", pick: (r) => [r.schedule1.additionalIncome] },
  { form: "IRS1040Schedule1", element: "DeductibleSelfEmploymentTaxAmt", label: "Sch 1 15", pick: (r) => [r.schedule1.seTaxDeduction] },
  { form: "IRS1040Schedule1", element: "SelfEmpldHealthInsDedAmt", label: "Sch 1 17", pick: (r) => [r.schedule1.healthInsurance] },
  { form: "IRS1040Schedule1", element: "StudentLoanInterestDedAmt", label: "Sch 1 21", pick: (r) => [r.schedule1.studentLoanInterest] },
  { form: "IRS1040Schedule1", element: "UnemploymentCompAmt", label: "Sch 1 7", pick: (r) => [r.schedule1.unemployment] },
  { form: "IRS1040Schedule2", element: "TotalOtherTaxesAmt", label: "Sch 2 21", pick: (r) => [r.schedule2.otherTaxes] },
  { form: "IRS8959", element: "TotalAMRRTTaxAmt", label: "8959 18", pick: (r) => [r.form8959.totalTax] },
  { form: "IRS8959", element: "AddnlMedicareTaxWithholdingAmt", label: "8959 24", pick: (r) => [r.form8959.additionalWithheld] },
  { form: "IRS1040Schedule3", element: "ExcessSocSecAndTier1RRTATaxAmt", label: "Sch 3 11", pick: (r) => [r.schedule3.excessSocialSecurity] },
  { form: "IRS1040", element: "QualifiedBusinessIncomeDedAmt", label: "1040 13", pick: (r) => [r.qbiDeduction] },
  { form: "IRS1040ScheduleD", element: "NetSTCapitalGainOrLossAmt", label: "Sch D 7", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line7] : []) },
  { form: "IRS1040ScheduleD", element: "NetLTCapitalGainOrLossAmt", label: "Sch D 15", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line15] : []) },
  { form: "IRS1040ScheduleD", element: "NetSTAndLTCapitalGainOrLossAmt", label: "Sch D 16", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line16] : []) },
  { form: "IRS1040", element: "TaxableInterestAmt", label: "1040 2b", pick: (r) => [r.taxableInterest] },
  { form: "IRS1040Schedule8812", element: "CTCODCAfterAGILimitAmt", label: "8812 12", pick: (r) => (r.schedule8812.required ? [r.schedule8812.afterPhaseout] : []) },
  { form: "IRS1040Schedule8812", element: "ACTCBeforeLimitAmt", label: "8812 16a", pick: (r) => (r.schedule8812.required ? [r.schedule8812.partII.line16a] : []) },
  { form: "IRS1040Schedule8812", element: "NetEarnedIncomeCalculatedAmt", label: "8812 20", pick: (r) => (r.schedule8812.required ? [r.schedule8812.partII.line20] : []) },
];

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
  /^irs1040\.dependent_detail\[\]\.dependent_(first_name|last_name|middle_initial|date_of_birth|months_lived|months_lived_in_us|relationship|ssn|ssn_itin_atin|ssn_employment_valid|supported_by_tp|us_citizen_national_or_resident_alien|us_citizen_national_resident_alien_or_canada_mexico_resident|student_for_5_plus_months)$/,
  /^w2\[\]\.(who_applies_to|ein|employer_(name|street_address|city|state|zip)|wages|withholding|social_security_(wages|tax|tips)|medicare_(wages_and_tips|tax_withheld)|retirement_plan|third_party_sick_pay)$/,
  /^w2\[\]\.w2_state_local_tax_grp\[\]\./,
  /^w2\[\]\.other_deductions\[\]\./,          // box 14: informational
  /^irs1040_scheduleb\.irs1099_int\[\]\.(interest_1099int_(who_applies_to|payer|payer_ein|interest|fed_inc_tax_withheld)|int_payer_\w+|irs1099_int_state\[\]\.\w+)$/,
  /^irs1040_scheduleb\.irs1099_div\[\]\.dividend_1099div_(who_applies_to|payer|ordinary_div|qualified_div|capital_gain_distr|nondividend_distributions)$/,
  /^irs_payment\./,                            // direct debit of a balance due
  // Schedule C: identity, Part I questions, income and expense lines. wages_paid / UBIA /
  // SSTB matter only above the § 199A threshold, which the engine reports as unsupported.
  /^irs1040_schedulec\[\]\.(who_applies_to|business_(act|code|name|ein)|street_address|city|state|zip|method_accounting|material_participate|schc_at_risk|qualified_business|use_calculated_qbi|specified_service|former_employer|new_business|filed_1099|payment_require_1099|wages_paid|ubia_qualified_property)$/,
  /^irs1040_schedulec\[\]\.(gross_receipts_cash|returns_allowances|other_income|advertising|commissions_fees|contract_labor|depletion|employee_benefit|insurance|mortgage_interest|other_interest|legal_professional|office_expense|pension_psp|machinery_equip_rent|other_rent|repairs_maintenance|supplies|tax_licenses|travel|meal_entertainment|utilities|wages_expense|se_health_insurance|total_home_area|business_home_area)$/,
  /^irs1040_schedulec\[\]\.other_expense_detail\[\]\.other_expense_detail_(desc|amt)$/,
  /^irs1040_schedulec\[\]\.irs1099_nec\[\]\.nec_(payer_\w+|comp|fed_wh)$/,
  /^irs1040_schedulec\[\]\.irs1099_k\[\]\.k_(payer_\w+|comp|fed_wh)$/,
  /^irs1040_schedulec\[\]\.irs1099_misc\[\]\.(payer_\w+|rents|other_income|fish_boat_proceeds|medandhlth_care_pmts|misc_fed_wh)$/,
  // Standard-mileage vehicles: only miles, parking and tolls (see VEHICLE_COST_PATHS).
  /^irs1040_schedulec\[\]\.vehicle_info_group\[\]\.(vehicle_(standard_mileage|service_date|business_miles|commuting_miles|other_miles|off_duty|another_avail|evidence_support|evidence_written)|car_truck_expense_(parking|tolls))$/,
  /^irs8995a_schedulec\.prior_yr_qbi_loss_carryforward$/,
  // Form 8949 / Schedule D.
  /^irs8949\.irs1099_b_grp\[\]\.(payer_name|who_applies_to)$/,
  /^irs8949\.irs1099_b_grp\[\]\.irs1099_b\[\]\.(acquired_dt|sold_disposed_dt|desc_of_prop|proceeds|cost_basis|input_irs8949_code|input_irs8949_code_summary|input_sale_term|reporting_method_input|wash_sale_loss|accrued_market_discount|payer_ein|fed_inc_tax_wh)$/,
  /^irs1040_schedule_d\.(st|lt)_capital_loss_carryover_input$/,
  // Schedule 1: unemployment (1099-G), educator expenses, student loan interest.
  /^irs1040_schedule1\.irs1099_g\[\]\.(g_payer_\w+|g_who_applies_to|g_unemployment_comp|g_fed_wh|g_amount_repaid_current_year)$/,
  /^irs1040_schedule1\.irs1099_g\[\]\.irs1099_g_state\[\]\.\w+$/,
  /^irs1040_schedule1\.(qualified_educator|tp_educator_exp_amount|sp_educator_exp_amount|paid_student_loan_interest|student_interest)$/,
];

/**
 * TaxCalcBench adds the vehicle's loan interest and personal property tax to line 9
 * pro-rated by a business-use ratio we can't reproduce exactly; keep those cases out.
 */
const VEHICLE_COST_PATHS = /^irs1040_schedulec\[\]\.vehicle_info_group\[\]\.car_truck_expense_(tax|interest)$/;

/** W-2 box 12 elective deferrals: no effect on the scored lines unless the Saver's credit (Form 8880) applies. */
const RETIREMENT_BOX12 = new Set(["D", "E", "F", "G", "H", "S", "AA", "BB", "EE"]);

/** W-2 box 12 codes that never change the scored 1040 lines. */
const NEUTRAL_BOX12 = new Set(["C", "DD", "L"]);

const FILING_STATUS: Record<string, FilingStatus> = {
  single: "Single",
  married_jointly: "MFJ",
  married_separately: "MFS",
  head_of_household: "HOH",
  qualifying_surviving_spouse: "QSS",
};

const RELATIONSHIP: Record<string, Dependent["relationship"]> = {
  son: "Child", daughter: "Child", stepchild: "Stepchild", stepson: "Stepchild", stepdaughter: "Stepchild",
  foster_child: "Foster child", grandchild: "Grandchild", grandson: "Grandchild", granddaughter: "Grandchild",
  niece: "Niece", nephew: "Nephew", brother: "Sibling", sister: "Sibling", half_brother: "Sibling",
  half_sister: "Sibling", stepbrother: "Sibling", stepsister: "Sibling", parent: "Parent",
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
  /** Scope checks that need the computed return (each returns a reason, or undefined when fine). */
  postChecks: Array<(r: ReturnLines) => string | undefined>;
}

export function toTaxpayer(input: Json, taxYear = 2024): Conversion {
  const root = (input as { input: Record<string, unknown> }).input;
  const header = root.return_header;
  const rd = root.return_data as Record<string, unknown>;
  const outOfScope = new Set<string>();
  const postChecks: Conversion["postChecks"] = [];
  let retirementDeferral = false;

  for (const [p, v] of leaves(rd)) {
    if (p === "w2[].employers_use_grp[].box_12_code") {
      if (RETIREMENT_BOX12.has(String(v))) retirementDeferral = true;
      else if (!NEUTRAL_BOX12.has(String(v))) outOfScope.add(`W-2 box 12 code ${v}`);
      continue;
    }
    if (VEHICLE_COST_PATHS.test(p)) {
      outOfScope.add("Schedule C vehicle loan interest / property tax with the standard mileage rate");
      continue;
    }
    if (p === "w2[].employers_use_grp[].box_12_amount") continue;
    if (!SUPPORTED_PATHS.some((re) => re.test(p))) outOfScope.add(p);
  }

  const f1040 = rd.irs1040;
  const status = FILING_STATUS[String(val(f1040, "filing_status"))];
  if (!status) outOfScope.add(`filing_status=${val(f1040, "filing_status")}`);

  // Each listed person with the answers that decide whether they are a dependent at all.
  const listed = list(f1040, "dependent_detail").map((d) => {
    const rel = String(val(d, "dependent_relationship") ?? "");
    if (rel && !RELATIONSHIP[rel]) outOfScope.add(`dependent relationship "${rel}"`);
    if (val(d, "dependent_ssn_itin_atin") === false) outOfScope.add("dependent without an SSN/ITIN/ATIN");
    const monthsInUs = val(d, "dependent_months_lived_in_us");
    const dep: Dependent = {
      firstName: String(val(d, "dependent_first_name") ?? ""),
      lastName: String(val(d, "dependent_last_name") ?? ""),
      ssn: String(val(d, "dependent_ssn") ?? ""),
      relationship: RELATIONSHIP[rel] ?? "Other",
      birthYear: Number(String(val(d, "dependent_date_of_birth") ?? "").slice(0, 4)),
      // Residency for a qualifying child counts months in the taxpayer's home in the U.S.
      monthsInHome: Math.min(num(val(d, "dependent_months_lived")), monthsInUs == null ? 12 : num(monthsInUs)),
      fullTimeStudent: val(d, "dependent_student_for_5_plus_months") === true,
      disabled: val(d, "dependent_disabled") === true,
      ssnValidForEmployment: val(d, "dependent_ssn_employment_valid") !== false,
      qualifiesChildTaxCredit: false, // derived by tax/household
      qualifiesOtherDependent: false,
    };
    const citizenOrResident =
      val(d, "dependent_us_citizen_national_or_resident_alien") === true ||
      val(d, "dependent_us_citizen_national_resident_alien_or_canada_mexico_resident") === true;
    return { dep, citizenOrResident, supportedByTp: val(d, "dependent_supported_by_tp") };
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

  const scheduleCs: ScheduleCBusiness[] = list(rd, "irs1040_schedulec").map((c) => {
    if (val(c, "schc_at_risk") !== true) outOfScope.add("Schedule C investment not all at risk (Form 6198)");
    if (val(c, "qualified_business") === false) outOfScope.add("Schedule C business not a qualified trade or business (QBI)");
    if (val(c, "use_calculated_qbi") === false) outOfScope.add("user-adjusted QBI");
    const nec = list(c, "irs1099_nec"), k = list(c, "irs1099_k"), misc = list(c, "irs1099_misc");
    const form1099Receipts =
      nec.reduce((s: number, x) => s + num(val(x, "nec_comp")), 0) +
      k.reduce((s: number, x) => s + num(val(x, "k_comp")), 0) +
      misc.reduce((s: number, x) => s + ["rents", "other_income", "fish_boat_proceeds", "medandhlth_care_pmts"].reduce((a: number, f) => a + num(val(x, f)), 0), 0);
    const veh = list(c, "vehicle_info_group")[0];
    if (list(c, "vehicle_info_group").length > 1) outOfScope.add("more than one Schedule C vehicle");
    if (veh && val(veh, "vehicle_standard_mileage") !== true) outOfScope.add("Schedule C vehicle actual expenses");
    return {
      owner: val(c, "who_applies_to") === "spouse" ? "spouse" : "primary",
      principalBusiness: String(val(c, "business_act") ?? ""),
      businessCode: "",
      businessName: String(val(c, "business_name") ?? ""),
      ein: String(val(c, "business_ein") ?? ""),
      accountingMethod: val(c, "method_accounting") === "accrual" ? "Accrual" : "Cash",
      materiallyParticipated: val(c, "material_participate") === true,
      grossReceipts: num(val(c, "gross_receipts_cash")) + form1099Receipts,
      returnsAllowances: num(val(c, "returns_allowances")),
      costOfGoodsSold: 0,
      otherIncome: num(val(c, "other_income")),
      expenses: {
        advertising: num(val(c, "advertising")),
        commissionsFees: num(val(c, "commissions_fees")),
        contractLabor: num(val(c, "contract_labor")),
        depletion: num(val(c, "depletion")),
        employeeBenefits: num(val(c, "employee_benefit")),
        insurance: num(val(c, "insurance")),
        mortgageInterest: num(val(c, "mortgage_interest")),
        otherInterest: num(val(c, "other_interest")),
        legalProfessional: num(val(c, "legal_professional")),
        officeExpense: num(val(c, "office_expense")),
        pensionPlans: num(val(c, "pension_psp")),
        rentVehicles: num(val(c, "machinery_equip_rent")),
        rentOther: num(val(c, "other_rent")),
        repairs: num(val(c, "repairs_maintenance")),
        supplies: num(val(c, "supplies")),
        taxesLicenses: num(val(c, "tax_licenses")),
        travel: num(val(c, "travel")),
        mealsTotal: num(val(c, "meal_entertainment")),
        utilities: num(val(c, "utilities")),
        wages: num(val(c, "wages_expense")),
        otherExpenses: list(c, "other_expense_detail").reduce((s: number, x) => s + num(val(x, "other_expense_detail_amt")), 0),
      },
      vehicle: veh ? {
        businessMiles: num(val(veh, "vehicle_business_miles")),
        commutingMiles: num(val(veh, "vehicle_commuting_miles")),
        otherMiles: num(val(veh, "vehicle_other_miles")),
        placedInService: isoToUs(val(veh, "vehicle_service_date")),
        parkingTolls: num(val(veh, "car_truck_expense_parking")) + num(val(veh, "car_truck_expense_tolls")),
      } : undefined,
      homeOfficeSqFt: num(val(c, "business_home_area")) || undefined,
      homeTotalSqFt: num(val(c, "total_home_area")) || undefined,
      healthInsurancePremiums: num(val(c, "se_health_insurance")) || undefined,
    };
  });
  const schedule1 = rd.irs1040_schedule1;
  const unemployment1099Gs = list(schedule1, "irs1099_g").map((g) => ({
    recipient: (val(g, "g_who_applies_to") === "spouse" ? "spouse" : "primary") as "primary" | "spouse",
    payerName: String(val(g, "g_payer_name") ?? ""),
    payerTin: String(val(g, "g_payer_tin") ?? ""),
    compensation: num(val(g, "g_unemployment_comp")),
    repaidThisYear: num(val(g, "g_amount_repaid_current_year")),
    federalWithheld: num(val(g, "g_fed_wh")),
  }));
  const educator = val(schedule1, "qualified_educator") === true;

  const REPORTING: Record<string, CapitalAssetSale["reporting"]> = {
    basis_reported: "basisReported", basis_not_reported: "basisNotReported", not_received: "noForm1099B",
  };
  const capitalSales: CapitalAssetSale[] = list(rd.irs8949, "irs1099_b_grp").flatMap((g) =>
    list(g, "irs1099_b").map((b): CapitalAssetSale => {
      const summary = val(b, "reporting_method_input") === "summary_transaction";
      const code = String(val(b, summary ? "input_irs8949_code_summary" : "input_irs8949_code") ?? "");
      if (!REPORTING[code]) outOfScope.add(`Form 8949 code "${code}"`);
      return {
        owner: val(g, "who_applies_to") === "spouse" ? "spouse" : "primary",
        brokerName: String(val(g, "payer_name") ?? ""),
        brokerTin: String(val(b, "payer_ein") ?? ""),
        description: String(val(b, "desc_of_prop") ?? (summary ? "Summary" : "")),
        dateAcquired: summary ? "VARIOUS" : isoToUs(val(b, "acquired_dt")),
        dateSold: summary ? `12/31/${taxYear}` : isoToUs(val(b, "sold_disposed_dt")),
        proceeds: num(val(b, "proceeds")),
        costBasis: num(val(b, "cost_basis")),   // a missing basis is $0
        term: val(b, "input_sale_term") === "long_term" ? "long" : "short",
        reporting: REPORTING[code] ?? "noForm1099B",
        washSaleDisallowed: num(val(b, "wash_sale_loss")),
        accruedMarketDiscount: num(val(b, "accrued_market_discount")),
        federalWithheld: num(val(b, "fed_inc_tax_wh")),
      };
    }));
  const schD = rd.irs1040_schedule_d;
  const capitalLossCarryover = {
    shortTerm: num(val(schD, "st_capital_loss_carryover_input")),
    longTerm: num(val(schD, "lt_capital_loss_carryover_input")),
  };

  const scheduleC1099Withholding = list(rd, "irs1040_schedulec").reduce((s: number, c) =>
    s + list(c, "irs1099_nec").reduce((a: number, x) => a + num(val(x, "nec_fed_wh")), 0)
      + list(c, "irs1099_k").reduce((a: number, x) => a + num(val(x, "k_fed_wh")), 0)
      + list(c, "irs1099_misc").reduce((a: number, x) => a + num(val(x, "misc_fed_wh")), 0), 0);

  if (retirementDeferral) {
    postChecks.push((r) => {
      const limit = saversCreditAgiLimit(taxYear, status ?? "Single");
      return r.agi <= limit ? `W-2 elective deferral with AGI ≤ ${limit} (Saver's credit, Form 8880)` : undefined;
    });
  }

  const estimated =
    [1, 2, 3, 4].reduce((s, q) => s + num(val(f1040, `estimated_tax_payment_${q}`)), 0) +
    num(val(f1040, "applied_from_prior_year"));

  const married = status === "MFJ" || status === "MFS";
  // Decide who is a dependent once the taxpayer's own dates are known (qualifying-child age test).
  const dependents: Dependent[] = [];
  const probe = { taxYear, filingStatus: status ?? "Single",
    dateOfBirth: isoToUs(val(f1040, "tp_date_of_birth")), spouseDateOfBirth: isoToUs(val(f1040, "sp_date_of_birth")) } as FakeTaxpayer;
  for (const { dep, citizenOrResident, supportedByTp } of listed) {
    // A dependent must be a U.S. citizen, national or resident (or Canada/Mexico resident).
    if (!citizenOrResident) continue;
    if (supportedByTp === false) {
      if (isQualifyingChild(dep, probe)) {
        // The qualifying-child tests have no "taxpayer provided half the support" test, but
        // TaxCalcBench drops such a child entirely (single-eic-non-dependent-child), so don't score it.
        outOfScope.add("qualifying child the taxpayer did not provide half the support for (TaxCalcBench treats as no dependent and no EIC child)");
      } else {
        continue; // a qualifying relative must be supported by the taxpayer
      }
    }
    dependents.push(dep);
  }
  for (const k of ["tp_dependent", "sp_dependent", "eic_not_allowed", "qualifying_child_of_another"]) {
    if (val(f1040, k) === true) outOfScope.add(`irs1040.${k}`);
  }
  const taxpayer: FakeTaxpayer = {
    seed: 0,
    taxYear,
    wholeDollars: true,   // MeF amounts are whole dollars
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
    scheduleCs,
    priorYearQbiLoss: num(val(rd.irs8995a_schedulec, "prior_yr_qbi_loss_carryforward")),
    otherForm1099Withholding: scheduleC1099Withholding,
    unemployment1099Gs,
    capitalSales,
    capitalLossCarryover,
    educatorExpenses: educator
      ? { primary: num(val(schedule1, "tp_educator_exp_amount")), spouse: num(val(schedule1, "sp_educator_exp_amount")) }
      : undefined,
    studentLoanInterestPaid: val(schedule1, "paid_student_loan_interest") === true ? num(val(schedule1, "student_interest")) : 0,
    rentalIncome: null,
    capitalGains: null,
    socialSecurityBenefits: null,
    estimatedTaxPayments: estimated,
    takesStandardDeduction: true,
    itemizedDeductionTotal: null,
    preparerPtin: null,
  };

  return { taxpayer, outOfScope: [...outOfScope], postChecks };
}
