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
import { CapitalAssetSale, Dependent, DistributionCode, Education, EducationStudent, FakeTaxpayer, FilingStatus, GamblingWinnings, HsaAccount, ItemizedDeductions, Retirement1099R, ScheduleCBusiness, W2Record } from "../faker/taxpayer";
import { ReturnLines } from "../tax/compute";
import { isQualifyingChild } from "../tax/household";
import { mergeSourceDocuments } from "./ty25-documents";

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
  { line: "29",  element: "RefundableAmerOppCreditAmt",     pick: (r) => r.americanOpportunityCredit },
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

/**
 * TY25 federal cases (ty25-us-*). The 40 state cases' expected output is the state return only
 * (no IRS1040), so they score no federal line and aren't loaded. Source documents are read from
 * the PDFs at run time (ty25-documents.ts) and merged into remaining_data.json's answers.
 */
export function loadTy25Cases(benchDir: string): BenchCase[] {
  const dataDir = path.join(benchDir, "tax_calc_bench", "ty25", "test_data");
  if (!fs.existsSync(dataDir)) throw new Error(`TaxCalcBench TY25 data not found at ${dataDir}`);
  return fs.readdirSync(dataDir)
    .filter((d) => /^ty25-us-/.test(d) && fs.existsSync(path.join(dataDir, d, "input", "remaining_data.json")))
    .sort()
    .map((name) => {
      const input = JSON.parse(fs.readFileSync(path.join(dataDir, name, "input", "remaining_data.json"), "utf8"));
      mergeSourceDocuments(path.join(dataDir, name, "input"), input.input.return_data);
      return { name, input, expectedXml: fs.readFileSync(path.join(dataDir, name, "output.xml"), "utf8") };
    });
}

/**
 * Supporting-form lines that count toward a case's result like the 1040 lines (a mismatch fails
 * the case), for forms the 19 scored lines can't see into. Form 8889 line 13 isn't listed: it
 * reaches line 10 through Schedule 1 line 13, which is scored.
 */
export const CHECKED_FORM_LINES: Array<{ form: string; element: string; label: string; pick: (r: ReturnLines) => number[] }> = [
  { form: "IRS8889", element: "HSALimitedAnnualDeductibleAmt", label: "8889 3", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line3) ?? [] },
  { form: "IRS8889", element: "HSALimitedDeductibleAllwdAmt", label: "8889 5", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line5) ?? [] },
  { form: "IRS8889", element: "HSAFamilyDeductibleAmt", label: "8889 6", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line6) ?? [] },
  { form: "IRS8889", element: "HSALimitedGrossContributionAmt", label: "8889 8", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line8) ?? [] },
  { form: "IRS8889", element: "HSAEmployerContributionAmt", label: "8889 9", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line9) ?? [] },
  { form: "IRS8889", element: "TotalHSAContributionAmt", label: "8889 11", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line11) ?? [] },
  { form: "IRS8889", element: "HSALimitedContributionAmt", label: "8889 12", pick: (r) => r.schedule1.hsa?.forms.map((f) => f.line12) ?? [] },
];

/**
 * Lines where the engine follows the IRS instructions and the expected output doesn't. Shown as
 * "disagrees with benchmark" instead of failing the case; every other checked line still counts.
 */
export const KNOWN_DIFFERENCES: Record<string, Record<string, string>> = (() => {
  const rule1 = "2025 Form 8889 line 3 rule 1 and 26 U.S.C. 223(b)(5) (married per section 7703, so separate filers too): the spouse's family HDHP coverage puts the filer on the family amount ($8,550 × 6 ÷ 12), and line 6 splits it with the spouse (Steps 1–4); the benchmark uses the filer's own self-only coverage ($4,300 × 6 ÷ 12)";
  return { "ty25-us-006": { "8889 3": rule1, "8889 5": rule1, "8889 6": rule1, "8889 8": rule1, "8889 12": rule1 } };
})();

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
  { form: "IRS1040", element: "TaxableIRAAmt", label: "1040 4b", pick: (r) => [r.retirement.line4b] },
  { form: "IRS1040", element: "TaxablePensionsAmt", label: "1040 5b", pick: (r) => [r.retirement.line5b] },
  { form: "IRS1040", element: "QualifiedBusinessIncomeDedAmt", label: "1040 13", pick: (r) => [r.qbiDeduction] },
  { form: "IRS8962", element: "TotalPremiumTaxCreditAmt", label: "8962 24", pick: (r) => (r.form8962 ? [r.form8962.line24] : []) },
  { form: "IRS1040Schedule2", element: "PremiumTaxCreditTaxLiabAmt", label: "Sch 2 1a", pick: (r) => (r.scheduleTwoPartOne ? [r.scheduleTwoPartOne] : []) },
  { form: "IRS8880", element: "CrQualifiedRetirementSavAmt", label: "8880 12", pick: (r) => (r.form8880 ? [r.form8880.line12] : []) },
  { form: "IRS8995A", element: "TotalQBIComponentAmt", label: "8995-A 16", pick: (r) => (r.form8995A ? [r.form8995A.line16] : []) },
  { form: "IRS1040ScheduleD", element: "NetSTCapitalGainOrLossAmt", label: "Sch D 7", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line7] : []) },
  { form: "IRS1040ScheduleD", element: "NetLTCapitalGainOrLossAmt", label: "Sch D 15", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line15] : []) },
  { form: "IRS1040ScheduleD", element: "NetSTAndLTCapitalGainOrLossAmt", label: "Sch D 16", pick: (r) => (r.capital.scheduleD ? [r.capital.scheduleD.line16] : []) },
  { form: "IRS1040ScheduleA", element: "StateAndLocalTaxAmt", label: "Sch A 5a", pick: (r) => (r.scheduleA ? [r.scheduleA.line5a] : []) },
  { form: "IRS1040ScheduleA", element: "StateAndLocalTaxLimitationAmt", label: "Sch A 5e", pick: (r) => (r.scheduleA ? [r.scheduleA.line5e] : []) },
  { form: "IRS1040ScheduleA", element: "GiftsByCashOrCheckAmt", label: "Sch A 11", pick: (r) => (r.scheduleA ? [r.scheduleA.line11] : []) },
  { form: "IRS1040ScheduleA", element: "OtherThanByCashOrCheckAmt", label: "Sch A 12", pick: (r) => (r.scheduleA ? [r.scheduleA.line12] : []) },
  { form: "IRS1040ScheduleA", element: "CarryoverFromPriorYearAmt", label: "Sch A 13", pick: (r) => (r.scheduleA ? [r.scheduleA.line13] : []) },
  { form: "IRS1040ScheduleA", element: "TotalItemizedDeductionsAmt", label: "Sch A 17", pick: (r) => (r.itemizes && r.scheduleA ? [r.scheduleA.line17] : []) },
  { form: "IRS1040", element: "TaxableInterestAmt", label: "1040 2b", pick: (r) => [r.taxableInterest] },
  { form: "IRS1040", element: "SocSecBnftAmt", label: "1040 6a", pick: (r) => [r.socialSecurity.line1] },
  { form: "IRS1040", element: "TaxableSocSecAmt", label: "1040 6b", pick: (r) => [r.socialSecurity.taxable] },
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
  /^irs1040_scheduleb\.irs1099_int\[\]\.(interest_1099int_(who_applies_to|payer|payer_ein|interest|fed_inc_tax_withheld|early_withdrawal)|int_payer_\w+|irs1099_int_state\[\]\.\w+)$/,
  /^irs1040_scheduleb\.irs1099_div\[\]\.dividend_1099div_(who_applies_to|payer|ordinary_div|qualified_div|capital_gain_distr|nondividend_distributions|fed_wh)$/,
  /^irs_payment\./,                            // direct debit of a balance due
  // Schedule C: identity, Part I questions, income and expense lines. wages_paid / UBIA /
  // SSTB matter only above the § 199A threshold, which the engine reports as unsupported.
  /^irs1040_schedulec\[\]\.(who_applies_to|business_(act|code|name|ein)|street_address|city|state|zip|method_accounting|material_participate|schc_at_risk|qualified_business|use_calculated_qbi|specified_service|former_employer|new_business|filed_1099|payment_require_1099|wages_paid|ubia_qualified_property)$/,
  /^irs1040_schedulec\[\]\.(gross_receipts_cash|returns_allowances|other_income|advertising|commissions_fees|contract_labor|depletion|employee_benefit|insurance|mortgage_interest|other_interest|legal_professional|office_expense|pension_psp|machinery_equip_rent|other_rent|repairs_maintenance|supplies|tax_licenses|travel|meal_entertainment|utilities|wages_expense|se_health_insurance|total_home_area|business_home_area)$/,
  /^irs1040_schedulec\[\]\.other_expense_detail\[\]\.other_expense_detail_(desc|amt)$/,
  /^irs1040_schedulec\[\]\.irs1099_nec\[\]\.nec_(payer_\w+|comp|fed_wh)$/,
  /^irs1040_schedulec\[\]\.irs1099_k\[\]\.k_(payer_\w+|comp|fed_wh)$/,
  /^irs1040_schedulec\[\]\.irs1099_misc\[\]\.(payer_\w+|rents|other_income|fish_boat_proceeds|medandhlth_care_pmts|misc_fed_wh)$/,
  // Standard-mileage vehicles. TaxCalcBench puts the business share (business ÷ total miles)
  // of loan interest and personal property tax on line 9; the engine follows the Schedule C
  // line 9 instructions and puts it on lines 16b and 23 (same line 28 total).
  /^irs1040_schedulec\[\]\.vehicle_info_group\[\]\.(vehicle_(standard_mileage|service_date|business_miles|commuting_miles|other_miles|off_duty|another_avail|evidence_support|evidence_written)|car_truck_expense_(parking|tolls|interest|tax))$/,
  /^irs8995a_schedulec\.prior_yr_qbi_loss_carryforward$/,
  // Form 8949 / Schedule D.
  /^irs8949\.irs1099_b_grp\[\]\.(payer_name|who_applies_to)$/,
  /^irs8949\.irs1099_b_grp\[\]\.irs1099_b\[\]\.(acquired_dt|sold_disposed_dt|desc_of_prop|proceeds|cost_basis|input_irs8949_code|input_irs8949_code_summary|input_sale_term|reporting_method_input|wash_sale_loss|accrued_market_discount|payer_ein|fed_inc_tax_wh)$/,
  /^irs1040_schedule_d\.(st|lt)_capital_loss_carryover_input$/,
  // SSA-1099. Medicare / drug premiums matter only when itemizing (no bench case itemizes).
  /^ssa_1099\.ssa_1099_grp\[\]\.ssa_(who_applies_to|net_benefits|federal_withholding|medicare_premiums|prescription_drug_premiums)$/,
  /^irs1040\.(tp_blind|sp_blind)$/,
  // Form 2441: care providers and prior-year expenses paid this year (line 9b).
  /^irs2441\.(carryover|care_provider_grp\[\]\.(provider_name|street_address|city|state|zip|provider_ssn|provider_ein|paid_to_provider)|qualifying_person_grp\[\]\.(person|qualifying_expenses_paid))$/,
  // Form 8962 / 1095-A: one full-year policy (annual amounts).
  /^irs8962\.(received_1095a|full_year_coverage_1095a|annual_premium|annual_premium_slcsp|annual_advanced_ptc)$/,
  // Form 8863 (one institution per student).
  /^irs8863\.(total_support_8863|either_parent_alive)$/,
  /^irs8863\.student_educational_instn_grp\[\]\.(student|prior_year_credit_claimed|academic_period_eligible_student|post_secondary_education|drug_felony_conviction)$/,
  /^irs8863\.student_educational_instn_grp\[\]\.educational_institution_group\[\]\.(institution_name|street_address|city|state|zip|current_year_1098t_received|prior_year_1098t_received|ein|qualified_expenses)$/,
  // Full-time student: no Saver's credit for that person (Form 8880).
  /^irs1040\.(tp_student|sp_student)$/,
  // Schedule 1: unemployment (1099-G), educator expenses, student loan interest.
  /^irs1040_schedule1\.irs1099_g\[\]\.(g_payer_\w+|g_who_applies_to|g_unemployment_comp|g_fed_wh|g_amount_repaid_current_year)$/,
  /^irs1040_schedule1\.irs1099_g\[\]\.irs1099_g_state\[\]\.\w+$/,
  /^irs1040_schedule1\.(qualified_educator|tp_educator_exp_amount|sp_educator_exp_amount|paid_student_loan_interest|student_interest)$/,
  // Alaska Permanent Fund dividends (Schedule 1 line 8g).
  /^irs1040_schedule1\.alaska_permanent_dividend_(tp|sp)_input$/,
  // Form 1099-R (box 7 codes outside 1/2/7/G/Q are reported separately).
  /^irs1099_r\[\]\.(who_applies_to|corrected_ind_checkbox|payer_ein_input|payer_name_business_name_input|payer_us_address_(input|city_nm_input|state_abbreviation_cd_input|zip_cd_input)|phone_num_input)$/,
  // TY25: navigation answers ("did you have an HSA?") whose details are asked separately.
  /^\w+_screen$/, /^hsa_account$/, /^requested_to_see_expert_assist_offer$/,
  // TY25 HSAs (Form 8889): contributions, coverage on December 1, and coverage months when it changed.
  /^hsa\.hsa(ContribCurYr|LastMonthRuleStatus|StatusChangeDurYr)(TP|SP)$/,
  /^hsa_addtl\.hsaMonthsCover(Self|Family)(TP|SP)$/,
  // TY25 Schedule A. deduction_type is the preparer's note of the result; the override decides.
  /^deduction_type$/, /^deduction_override$/, /^mfs_deduction$/,  // values checked in toTaxpayer
  /^ty25_unplaced_state_local_income_tax$/,                         // checked when itemizing
  /^scha_tax\.(stateTaxOrSalesTax|salesTaxesPaid|taxRE|taxPP)$/,
  /^scha_gft\.(cash60|cash30|nonCash50|nonCash30|contrib30CapGain)(CO)?$/, /^scha_gft\.noncash50CO$/,
  /^med_exp\.(medExpDrDentist|medExpPrescYesSCHA)(TP|SP)$/,
  // Married filing separately: living apart / legal separation (checked against the computed return).
  /^basic3\.(legallySeparated|livedApartFromSpouse|livedWithSpouse6Mos)$/,
  // TY25 Forms W-2G (read from the PDFs; see ty25-documents.ts).
  /^wg2\[\]\.(nonStandard|w2g_(who_applies_to|payer|winnings|fed_wh))$/,
  /^irs1099_r\[\]\.(gross_distribution_amt_input|taxable_amt_input|txbl_amount_not_determined_ind_input|total_distribution_ind_input|federal_income_tax_withheld_amt_input|employee_contributions_amt_input|f1099_r_distribution_cd_input|irasepsimple_ind_input)$/,
];

/** W-2 box 12 codes that are uncollected tax (Schedule 2 line 13). */
const UNCOLLECTED_BOX12 = new Set(["A", "B", "M", "N"]);

/** W-2 box 12 elective deferrals (Form 8880 line 2). */
const RETIREMENT_BOX12 = new Set(["D", "E", "F", "G", "H", "S", "AA", "BB", "EE"]);

/** W-2 box 12 code W: employer HSA contributions (Form 8889 line 9). */
const HSA_BOX12 = new Set(["W"]);

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

  for (const [p, v] of leaves(rd)) {
    if (p === "w2[].employers_use_grp[].box_12_code") {
      const code = String(v);
      if (!RETIREMENT_BOX12.has(code) && !NEUTRAL_BOX12.has(code) && !UNCOLLECTED_BOX12.has(code) && !HSA_BOX12.has(code)) outOfScope.add(`W-2 box 12 code ${code}`);
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
      retirementPlan: val(w, "retirement_plan") === true,
      box12: list(w, "employers_use_grp")
        .map((e) => ({ code: String(val(e, "box_12_code") ?? ""), amount: num(val(e, "box_12_amount")) }))
        .filter((e) => UNCOLLECTED_BOX12.has(e.code) || RETIREMENT_BOX12.has(e.code) || HSA_BOX12.has(e.code)),
    };
  });

  const schB = rd.irs1040_scheduleb;
  const interest1099s = list(schB, "irs1099_int").map((i) => ({
    payerName: String(val(i, "interest_1099int_payer") ?? ""),
    payerTin: String(val(i, "interest_1099int_payer_ein") ?? ""),
    interestIncome: num(val(i, "interest_1099int_interest")),
    earlyWithdrawalPenalty: num(val(i, "interest_1099int_early_withdrawal")),
    usSavingsBondInterest: 0,
    federalWithheld: num(val(i, "interest_1099int_fed_inc_tax_withheld")),
  }));
  const dividend1099s = list(schB, "irs1099_div").map((d) => ({
    payerName: String(val(d, "dividend_1099div_payer") ?? ""),
    payerTin: "",
    ordinaryDividends: num(val(d, "dividend_1099div_ordinary_div")),
    qualifiedDividends: num(val(d, "dividend_1099div_qualified_div")),
    totalCapitalGain: num(val(d, "dividend_1099div_capital_gain_distr")),
    federalWithheld: num(val(d, "dividend_1099div_fed_wh")) || undefined,
  }));

  const scheduleCs: ScheduleCBusiness[] = list(rd, "irs1040_schedulec").map((c) => {
    if (val(c, "schc_at_risk") !== true) outOfScope.add("Schedule C investment not all at risk (Form 6198)");
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
        loanInterest: num(val(veh, "car_truck_expense_interest")) || undefined,
        personalPropertyTax: num(val(veh, "car_truck_expense_tax")) || undefined,
      } : undefined,
      notQualifiedForQbi: val(c, "qualified_business") === false || undefined,
      homeOfficeSqFt: num(val(c, "business_home_area")) || undefined,
      homeTotalSqFt: num(val(c, "total_home_area")) || undefined,
      healthInsurancePremiums: num(val(c, "se_health_insurance")) || undefined,
      sstb: val(c, "specified_service") === true,
      w2WagesPaid: num(val(c, "wages_paid")) || undefined,
      ubia: num(val(c, "ubia_qualified_property")) || undefined,
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
  const ssa1099s = list(rd.ssa_1099, "ssa_1099_grp").map((g) => {
    if (num(val(g, "ssa_lump_sum_benefits"))) outOfScope.add("Social Security lump-sum payment for prior years (Pub 915)");
    const net = num(val(g, "ssa_net_benefits"));
    return {
      recipient: (val(g, "ssa_who_applies_to") === "spouse" ? "spouse" : "primary") as "primary" | "spouse",
      benefitsPaid: net, benefitsRepaid: 0, netBenefits: net,
      federalWithheld: num(val(g, "ssa_federal_withholding")),
      medicarePremiums: num(val(g, "ssa_medicare_premiums")) || undefined,
    };
  });
  // Form 2441. Expenses per qualifying person point at a dependent_detail entry by an id the
  // dependents don't carry, so they're used only when the return has a single dependent.
  const careProviders = list(rd.irs2441, "care_provider_grp").map((p) => ({
    name: String(val(p, "provider_name") ?? ""),
    street: String(val(p, "street_address") ?? ""),
    city: [val(p, "city"), val(p, "state"), val(p, "zip")].filter(Boolean).join(" "),
    tin: String(val(p, "provider_ssn") ?? val(p, "provider_ein") ?? ""),
    amountPaid: num(val(p, "paid_to_provider")),
  }));
  const careCarryover = num(val(rd.irs2441, "carryover"));
  const careExpenses = list(rd.irs2441, "qualifying_person_grp").map((q) => ({ dependentIndex: 0, amount: num(val(q, "qualifying_expenses_paid")) }));
  const dependentCare = careProviders.length || careCarryover || careExpenses.length
    ? { providers: careProviders, expenses: careExpenses, priorYearExpensesPaid: careCarryover || undefined }
    : undefined;
  const CODES = new Set<string>(["1", "2", "7", "G", "Q"]);
  const retirement1099Rs = list(rd, "irs1099_r").map((x): Retirement1099R => {
    const code = String(val(x, "f1099_r_distribution_cd_input") ?? "");
    if (!CODES.has(code)) outOfScope.add(`Form 1099-R distribution code "${code}"`);
    return {
      recipient: val(x, "who_applies_to") === "spouse" ? "spouse" : "primary",
      payerName: String(val(x, "payer_name_business_name_input") ?? ""),
      payerTin: String(val(x, "payer_ein_input") ?? ""),
      payerStreet: String(val(x, "payer_us_address_input") ?? ""),
      payerCity: [val(x, "payer_us_address_city_nm_input"), val(x, "payer_us_address_state_abbreviation_cd_input"), val(x, "payer_us_address_zip_cd_input")]
        .filter(Boolean).join(" "),
      grossDistribution: num(val(x, "gross_distribution_amt_input")),
      taxableAmount: num(val(x, "taxable_amt_input")),
      taxableAmountNotDetermined: val(x, "txbl_amount_not_determined_ind_input") === true,
      totalDistribution: val(x, "total_distribution_ind_input") === true,
      federalWithheld: num(val(x, "federal_income_tax_withheld_amt_input")),
      employeeContributions: num(val(x, "employee_contributions_amt_input")) || undefined,
      distributionCode: code as DistributionCode,
      iraSepSimple: val(x, "irasepsimple_ind_input") === true,
    };
  });
  const schD = rd.irs1040_schedule_d;
  const capitalLossCarryover = {
    shortTerm: num(val(schD, "st_capital_loss_carryover_input")),
    longTerm: num(val(schD, "lt_capital_loss_carryover_input")),
  };

  const scheduleC1099Withholding = list(rd, "irs1040_schedulec").reduce((s: number, c) =>
    s + list(c, "irs1099_nec").reduce((a: number, x) => a + num(val(x, "nec_fed_wh")), 0)
      + list(c, "irs1099_k").reduce((a: number, x) => a + num(val(x, "k_fed_wh")), 0)
      + list(c, "irs1099_misc").reduce((a: number, x) => a + num(val(x, "misc_fed_wh")), 0), 0);


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
  if (dependentCare?.expenses.length && (list(f1040, "dependent_detail").length !== 1 || dependents.length !== 1)) {
    outOfScope.add("Form 2441 expenses with several dependents (the input's person references can't be resolved)");
  } else if (dependentCare && !dependentCare.expenses.length && dependentCare.providers.some((p) => p.amountPaid > 0)
    && dependents.some((d) => taxYear - d.birthYear < 13 || (d.disabled && d.monthsInHome > 6))) {
    outOfScope.add("Form 2441 care for a qualifying person without per-person expenses");
  }
  // Form 8962: a single 1095-A with annual amounts; part-year coverage needs the monthly lines.
  const ptc = rd.irs8962;
  let marketplace1095As: FakeTaxpayer["marketplace1095As"];
  if (val(ptc, "received_1095a") === true) {
    if (val(ptc, "full_year_coverage_1095a") !== true) outOfScope.add("Form 1095-A coverage for part of the year (Form 8962 monthly lines)");
    marketplace1095As = [{
      marketplaceId: "", policyNumber: "", issuer: "",
      annualPremium: num(val(ptc, "annual_premium")), annualSlcsp: num(val(ptc, "annual_premium_slcsp")),
      annualAdvancePayments: num(val(ptc, "annual_advanced_ptc")),
    }];
  }
  // Form 8863: the qualified expenses given are the adjusted expenses (no scholarships split out).
  const educationGroups = list(rd.irs8863, "student_educational_instn_grp");
  let education: Education | undefined;
  if (educationGroups.length) {
    const students: EducationStudent[] = [];
    for (const g of educationGroups) {
      const ref = String(val(g, "student") ?? "");
      const who: EducationStudent["student"] | undefined =
        ref === "taxpayer_info" ? "primary" : ref === "spouse_info" ? "spouse" : dependents.length === 1 ? 0 : undefined;
      if (who === undefined) outOfScope.add("Form 8863 student who is one of several dependents (the reference can't be resolved)");
      const insts = list(g, "educational_institution_group");
      if (insts.length > 1) outOfScope.add("Form 8863 student with more than one institution (line 22b)");
      const inst = insts[0];
      students.push({
        student: who ?? "primary",
        institution: {
          name: String(val(inst, "institution_name") ?? ""), street: String(val(inst, "street_address") ?? ""),
          city: [val(inst, "city"), val(inst, "state"), val(inst, "zip")].filter(Boolean).join(" "), ein: String(val(inst, "ein") ?? ""),
        },
        tuitionPaid: num(val(inst, "qualified_expenses")), scholarships: 0,
        received1098T: val(inst, "current_year_1098t_received") === true,
        halfTime: val(g, "academic_period_eligible_student") === true, graduate: false,
        completedFirst4Years: val(g, "post_secondary_education") === true,
        aotcPriorYears: val(g, "prior_year_credit_claimed") === true ? 4 : 0,
        felonyDrugConviction: val(g, "drug_felony_conviction") === true,
      });
    }
    // Line 7: a filer under 24 with a living parent, not filing jointly, and under 18 (or 18–23
    // with earned income under half their support) gets the AOTC only as a nonrefundable credit.
    const tpAge = taxYear - Number(String(val(f1040, "tp_date_of_birth") ?? "").slice(0, 4));
    const earned = w2Records.filter((w) => w.employee !== "spouse").reduce((x, w) => x + w.wages, 0);
    const halfSupport = num(val(rd.irs8863, "total_support_8863")) / 2;
    const parentAlive = val(rd.irs8863, "either_parent_alive") === true;
    const nonrefundableOnly = tpAge < 24 && parentAlive && status !== "MFJ"
      && (tpAge < 18 || earned < halfSupport);
    education = { students, aotcNonrefundableOnly: nonrefundableOnly || undefined };
  }
  // TY25 HSAs. December coverage is asked for the last-month rule, but the input has no election,
  // so the rule isn't applied (the 2025 instructions: "you may consider yourself" eligible all
  // year); when coverage changed during the year, the months come from hsa_addtl.
  const hsaPerson = (sfx: "TP" | "SP"): HsaAccount | undefined => {
    const contributions = num(val(rd.hsa, `hsaContribCurYr${sfx}`));
    const dec = String(val(rd.hsa, `hsaLastMonthRuleStatus${sfx}`) ?? "").toLowerCase();
    const decemberCoverage = dec === "self" || dec === "family" ? dec : undefined;
    if (dec && !decemberCoverage && dec !== "none") outOfScope.add(`HSA December coverage "${dec}"`);
    const changed = val(rd.hsa, `hsaStatusChangeDurYr${sfx}`) === true;
    const self = num(val(rd.hsa_addtl, `hsaMonthsCoverSelf${sfx}`)), family = num(val(rd.hsa_addtl, `hsaMonthsCoverFamily${sfx}`));
    if (!contributions && !decemberCoverage && !self && !family) return undefined;
    return {
      coverage: decemberCoverage ?? (family >= self && family > 0 ? "family" : "self"),
      contributions,
      months: changed || !decemberCoverage ? { self, family } : undefined,
      decemberCoverage,
    };
  };
  const hsaTp = hsaPerson("TP"), hsaSp = married ? hsaPerson("SP") : undefined;
  const hsa = hsaTp || hsaSp ? { primary: hsaTp, spouse: hsaSp } : undefined;
  const gamblingWinnings: GamblingWinnings[] = list(rd, "wg2").map((g) => ({
    recipient: val(g, "w2g_who_applies_to") === "spouse" ? "spouse" : "primary",
    payerName: String(val(g, "w2g_payer") ?? ""), payerTin: "",
    winnings: num(val(g, "w2g_winnings")), federalWithheld: num(val(g, "w2g_fed_wh")),
  }));
  // TY25 Schedule A. "maximize_deduction" takes the larger of standard and itemized (us-004 notes
  // "standard" yet its expected return itemizes the larger amount); "force_itemized" elects to
  // itemize a smaller amount (line 18).
  const override = val(rd, "deduction_override");
  if (override !== undefined && override !== "maximize_deduction" && override !== "force_itemized") outOfScope.add(`deduction_override=${override}`);
  const mfsDeduction = val(rd, "mfs_deduction");
  if (mfsDeduction !== undefined && !["spouse_did_not_file", "spouse_itemized", "spouse_standard"].includes(String(mfsDeduction))) outOfScope.add(`mfs_deduction=${mfsDeduction}`);
  const tax = rd.scha_tax, gft = rd.scha_gft, med = rd.med_exp, oth = rd.scha_oth;
  let itemized: ItemizedDeductions | undefined;
  if (override !== undefined || tax || gft || med || oth) {
    const choice = val(tax, "stateTaxOrSalesTax");
    if (choice !== undefined && choice !== "L" && choice !== "G") outOfScope.add(`scha_tax.stateTaxOrSalesTax=${choice}`);
    // Line 16: only gambling losses are modelled.
    let gamblingLosses = 0;
    for (let i = 1; i <= 9; i++) {
      const type = val(oth, `miscNot2Type${i}`), amt = num(val(oth, `miscNot2Amt${i}`));
      if (type === undefined && !amt) continue;
      if (/^gambling losses$/i.test(String(type ?? ""))) gamblingLosses += amt;
      else outOfScope.add(`Schedule A line 16 "${type}"`);
    }
    const carry = ["cash60CO", "cash30CO", "nonCash30CO", "noncash50CO", "contrib30CapGainCO"].reduce((a, k) => a + num(val(gft, k)), 0);
    itemized = {
      medicalExpenses: ["medExpDrDentistTP", "medExpDrDentistSP", "medExpPrescYesSCHATP", "medExpPrescYesSCHASP"].reduce((a, k) => a + num(val(med, k)), 0) || undefined,
      // "L": state and local income taxes (W-2 box 17, the engine's default); "G": general sales taxes.
      stateLocalTax: choice === "G" ? { kind: "sales", amount: num(val(tax, "salesTaxesPaid")) } : undefined,
      realEstateTax: num(val(tax, "taxRE")) || undefined,
      personalPropertyTax: num(val(tax, "taxPP")) || undefined,
      charityByLimit: {
        cash60: num(val(gft, "cash60")), cash30: num(val(gft, "cash30")), nonCash50: num(val(gft, "nonCash50")),
        nonCash30: num(val(gft, "nonCash30")), capitalGain30: num(val(gft, "contrib30CapGain")),
      },
      charityCarryover: carry || undefined,
      gamblingLosses: gamblingLosses || undefined,
      electToItemize: override === "force_itemized" || undefined,
    };
  }
  // Local income tax and 1099 state withholding belong on line 5a but aren't read into it.
  const unplacedTax = num(val(rd, "ty25_unplaced_state_local_income_tax"));
  if (itemized && unplacedTax && itemized.stateLocalTax?.kind !== "sales") {
    postChecks.push((r) => (r.itemizes ? `Schedule A line 5a missing $${unplacedTax} of local income tax or 1099 state withholding` : undefined));
  }
  // Living apart / legal separation changes only the Social Security base amount, the IRA
  // phase-out range and EIC for a separated spouse; none of those may apply.
  if (["legallySeparated", "livedApartFromSpouse"].some((k) => val(rd.basic3, k) === true)) {
    postChecks.push((r) => r.socialSecurity.line1 > 0 || r.schedule1.iraDeduction > 0 || r.earnedIncomeCredit > 0 || dependents.length
      ? "married filing separately while separated or living apart, with Social Security, an IRA deduction, EIC or dependents"
      : undefined);
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
    ssa1099s,
    retirement1099Rs: retirement1099Rs.length ? retirement1099Rs : undefined,
    dependentCare,
    education,
    marketplace1095As,
    hsa,
    gamblingWinnings: gamblingWinnings.length ? gamblingWinnings : undefined,
    fullTimeStudent: val(f1040, "tp_student") === true || val(f1040, "sp_student") === true
      ? { primary: val(f1040, "tp_student") === true, spouse: val(f1040, "sp_student") === true }
      : undefined,
    alaskaPermanentFundDividends: {
      primary: num(val(schedule1, "alaska_permanent_dividend_tp_input")) || undefined,
      spouse: num(val(schedule1, "alaska_permanent_dividend_sp_input")) || undefined,
    },
    blind: val(f1040, "tp_blind") === true,
    spouseBlind: val(f1040, "sp_blind") === true,
    educatorExpenses: educator
      ? { primary: num(val(schedule1, "tp_educator_exp_amount")), spouse: num(val(schedule1, "sp_educator_exp_amount")) }
      : undefined,
    studentLoanInterestPaid: val(schedule1, "paid_student_loan_interest") === true ? num(val(schedule1, "student_interest")) : 0,
    rentalIncome: null,
    capitalGains: null,
    socialSecurityBenefits: null,
    estimatedTaxPayments: estimated,
    takesStandardDeduction: !itemized,
    itemizedDeductionTotal: null,
    itemized,
    spouseItemizes: status === "MFS" && mfsDeduction === "spouse_itemized" || undefined,
    preparerPtin: null,
  };

  return { taxpayer, outOfScope: [...outOfScope], postChecks };
}
