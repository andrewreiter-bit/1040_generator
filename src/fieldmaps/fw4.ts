/**
 * Form W-4 field map for the 2023–2025 revisions (identical field names in all
 * three years; the 2026 revision has a different layout and is not mapped).
 *
 * The W-4's XFA labels are offset from their boxes (e.g. the Step 3 "children
 * × $2,000" box carries the section heading), so label heuristics misfire.
 * The map is strict: the page 3 worksheets and Step 4 stay blank.
 */
import { FakeTaxpayer, FilingStatus } from "../faker/taxpayer";
import { BLANK, FieldMap, FieldValue, MappedField, OFF, checkIf, money } from "./types";
import { childTaxCreditCount, otherDependentCount } from "../tax/household";

const P1 = "topmostSubform[0].Page1[0].";
const P3 = "topmostSubform[0].Page3[0].";

/** Step 3 applies only if total income is at or under this (printed on the 2023–2025 forms). */
const STEP3_INCOME_LIMIT = { joint: 400000, other: 200000 };

function totalIncome(t: FakeTaxpayer): number {
  return t.totalWages + t.totalInterest + t.totalDividends;
}

function step3Applies(t: FakeTaxpayer): boolean {
  const limit = t.filingStatus === "MFJ" ? STEP3_INCOME_LIMIT.joint : STEP3_INCOME_LIMIT.other;
  return totalIncome(t) <= limit;
}

export function w4ChildrenAmount(t: FakeTaxpayer): number {
  return step3Applies(t) ? childTaxCreditCount(t) * 2000 : 0;
}

export function w4OtherDependentsAmount(t: FakeTaxpayer): number {
  return step3Applies(t) ? otherDependentCount(t) * 500 : 0;
}

const amountOrBlank = (n: number) => (n > 0 ? money(n) : BLANK);

const w4Status = (status: FilingStatus): "single" | "joint" | "hoh" =>
  status === "MFJ" || status === "QSS" ? "joint" : status === "HOH" ? "hoh" : "single";

function buildMap(taxYear: number): FieldMap {
  const entries: Array<[string, string, FieldValue]> = [
    [`${P1}Step1a[0].f1_01[0]`, "firstName", (t) => `${t.firstName} ${t.middleInitial}`.trim()],
    [`${P1}Step1a[0].f1_02[0]`, "lastName", (t) => t.lastName],
    [`${P1}Step1a[0].f1_03[0]`, "address", (t) => (t.aptNumber ? `${t.streetAddress} ${t.aptNumber}` : t.streetAddress)],
    [`${P1}Step1a[0].f1_04[0]`, "cityStateZip", (t) => `${t.city}, ${t.state} ${t.zipCode}`],
    [`${P1}f1_05[0]`, "ssn", (t) => t.ssn],
    [`${P1}c1_1[0]`, "filingStatus.single", (t) => checkIf(w4Status(t.filingStatus) === "single")],
    [`${P1}c1_1[1]`, "filingStatus.joint", (t) => checkIf(w4Status(t.filingStatus) === "joint")],
    [`${P1}c1_1[2]`, "filingStatus.hoh", (t) => checkIf(w4Status(t.filingStatus) === "hoh")],
    [`${P1}c1_2[0]`, "step2cTwoJobs", () => OFF],
    [`${P1}Step3_ReadOrder[0].f1_06[0]`, "step3Children", (t) => amountOrBlank(w4ChildrenAmount(t))],
    [`${P1}Step3_ReadOrder[0].f1_07[0]`, "step3Other", (t) => amountOrBlank(w4OtherDependentsAmount(t))],
    [`${P1}f1_09[0]`, "line3", (t) => amountOrBlank(w4ChildrenAmount(t) + w4OtherDependentsAmount(t))],
    [`${P1}f1_13[0]`, "employerNameAddress", (t) => {
      const w2 = t.w2Records[0];
      return w2 ? `${w2.employerName}\n${w2.employerStreet}\n${w2.employerCity}, ${w2.employerState} ${w2.employerZip}` : BLANK;
    }],
    [`${P1}f1_15[0]`, "employerEin", (t) => t.w2Records[0]?.employerEin ?? BLANK],
    // Worksheet totals have formulas; keep them blank since the worksheets are unused.
    [`${P3}f3_09[0]`, "deductionsWorksheet3", () => BLANK],
    [`${P3}f3_11[0]`, "deductionsWorksheet5", () => BLANK],
  ];
  const fields: Record<string, MappedField> = {};
  for (const [name, key, value] of entries) fields[name] = { key, value };
  return { formId: "fw4", taxYear, strict: true, fields };
}

export const FW4_MAPS: FieldMap[] = [2023, 2024, 2025].map(buildMap);
