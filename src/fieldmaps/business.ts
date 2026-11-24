/**
 * Schedule C (one per business) and Schedule SE (one per person) field maps,
 * 2023–2025. Both PDFs keep the same field names in all three years apart from
 * the Schedule C name box (2023 nests it under Pg1Header) and the statutory-
 * employee box (2025 nests it under Line1_ReadOrder).
 *
 * Every line is written from computeReturn (the label formulas are not used), so
 * the validator can compare these copies with the 1040 / Schedule 1 / Schedule 2.
 * Views come from documentsFor: `t.document.scheduleCIndex` / `t.document.person`.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { EXPENSE_LINES, Person, ScheduleCLines, ScheduleSELines } from "../tax/business";
import { computeReturn } from "../tax/compute";
import { BLANK, CHECK, FieldMap, FieldValue, MappedField, OFF, checkIf, money } from "./types";

const P1 = "topmostSubform[0].Page1[0].";
const P2 = "topmostSubform[0].Page2[0].";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));

export function personName(t: FakeTaxpayer, who: Person): string {
  return who === "spouse"
    ? [t.spouseFirstName, t.spouseLastName ?? t.lastName].filter(Boolean).join(" ")
    : [t.firstName, t.middleInitial, t.lastName].filter(Boolean).join(" ");
}
export const personSsn = (t: FakeTaxpayer, who: Person) => (who === "spouse" ? t.spouseSSN ?? BLANK : t.ssn);

/** The Schedule C this view is for (first business when the view has no index). */
export function scheduleCFor(t: FakeTaxpayer): ScheduleCLines | undefined {
  return computeReturn(source(t)).scheduleC[t.document?.scheduleCIndex ?? 0];
}

export function scheduleSEFor(t: FakeTaxpayer): ScheduleSELines | undefined {
  const ses = computeReturn(source(t)).scheduleSE;
  return t.document?.person ? ses.find((s) => s.owner === t.document!.person) : ses[0];
}

// ── Schedule C ────────────────────────────────────────────────────────────────

const LINES_8_17 = `${P1}Lines8-17[0].`;
const LINES_18_27 = `${P1}Lines18-27[0].`;

/** Expense line → field. */
const EXPENSE_FIELDS: Record<string, string> = {
  "8": `${LINES_8_17}f1_17[0]`, "9": `${LINES_8_17}f1_18[0]`, "10": `${LINES_8_17}f1_19[0]`,
  "11": `${LINES_8_17}f1_20[0]`, "12": `${LINES_8_17}f1_21[0]`, "13": `${LINES_8_17}f1_22[0]`,
  "14": `${LINES_8_17}f1_23[0]`, "15": `${LINES_8_17}f1_24[0]`, "16a": `${LINES_8_17}f1_25[0]`,
  "16b": `${LINES_8_17}f1_26[0]`, "17": `${LINES_8_17}f1_27[0]`,
  "18": `${LINES_18_27}f1_28[0]`, "19": `${LINES_18_27}f1_29[0]`, "20a": `${LINES_18_27}f1_30[0]`,
  "20b": `${LINES_18_27}f1_31[0]`, "21": `${LINES_18_27}f1_32[0]`, "22": `${LINES_18_27}f1_33[0]`,
  "23": `${LINES_18_27}f1_34[0]`, "24a": `${LINES_18_27}f1_35[0]`, "24b": `${LINES_18_27}f1_36[0]`,
  "25": `${LINES_18_27}f1_37[0]`, "26": `${LINES_18_27}f1_38[0]`,
  // "Other expenses (from line 48)": printed as line 27a in 2023/2024 and 27b in 2025
  // (2025 moved the energy-efficient-buildings deduction, f1_40, up to 27a). Same field.
  "27a": `${LINES_18_27}f1_39[0]`,
};

const PART_V_ROWS = 9;

/** Part V rows: the business's itemised other expenses, or one "Other" row for the total. */
export function otherExpenseRows(c: ScheduleCLines): Array<{ description: string; amount: number }> {
  const items = c.business.expenses.otherExpenseItems;
  if (items?.length) return items;
  const total = c.expenseLines["27a"];
  return total ? [{ description: "Other business expenses", amount: total }] : [];
}

function buildScheduleC(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: (c: ScheduleCLines, t: FakeTaxpayer) => string, text = false) => {
    const v: FieldValue = (t) => {
      const c = scheduleCFor(t);
      return c ? value(c, source(t)) : BLANK;
    };
    fields[name] = { key, value: v, ...(text ? { text } : {}) };
  };
  const yes = (cond: boolean) => () => checkIf(cond);
  const off = () => OFF;

  add(taxYear === 2023 ? `${P1}Pg1Header[0].f1_1[0]` : `${P1}f1_1[0]`, "proprietorName", (c, t) => personName(t, c.owner));
  add(`${P1}f1_2[0]`, "ssn", (c, t) => personSsn(t, c.owner));
  add(`${P1}f1_3[0]`, "A.principalBusiness", (c) => c.business.principalBusiness, true);
  add(`${P1}BComb[0].f1_4[0]`, "B.code", (c) => c.business.businessCode, true);
  add(`${P1}f1_5[0]`, "C.businessName", (c) => c.business.businessName, true);
  add(`${P1}DComb[0].f1_6[0]`, "D.ein", (c) => c.business.ein, true);
  add(`${P1}f1_7[0]`, "E.address", () => BLANK);        // business conducted from the home address
  add(`${P1}f1_8[0]`, "E.cityStateZip", () => BLANK);
  add(`${P1}c1_1[0]`, "F.cash", (c) => checkIf(c.business.accountingMethod === "Cash"));
  add(`${P1}c1_1[1]`, "F.accrual", (c) => checkIf(c.business.accountingMethod === "Accrual"));
  add(`${P1}c1_1[2]`, "F.other", off);
  add(`${P1}f1_9[0]`, "F.otherSpecify", () => BLANK, true);
  add(`${P1}c1_2[0]`, "G.yes", (c) => checkIf(c.business.materiallyParticipated));
  add(`${P1}c1_2[1]`, "G.no", (c) => checkIf(!c.business.materiallyParticipated));
  add(`${P1}c1_3[0]`, "H.started", off);
  add(`${P1}c1_4[0]`, "I.yes", (c) => checkIf(!!c.business.paid1099Payments));
  add(`${P1}c1_4[1]`, "I.no", (c) => checkIf(!c.business.paid1099Payments));
  add(`${P1}c1_5[0]`, "J.yes", (c) => checkIf(!!c.business.paid1099Payments));
  add(`${P1}c1_5[1]`, "J.no", off);
  add(taxYear >= 2025 ? `${P1}Line1_ReadOrder[0].c1_6[0]` : `${P1}c1_6[0]`, "line1.statutoryEmployee", off);

  add(`${P1}f1_10[0]`, "line1", (c) => money(c.grossReceipts));
  add(`${P1}f1_11[0]`, "line2", (c) => moneyOrBlank(c.returnsAllowances));
  add(`${P1}f1_12[0]`, "line3", (c) => money(c.netReceipts));
  add(`${P1}f1_13[0]`, "line4", (c) => moneyOrBlank(c.costOfGoodsSold));
  add(`${P1}f1_14[0]`, "line5", (c) => money(c.grossProfit));
  add(`${P1}f1_15[0]`, "line6", (c) => moneyOrBlank(c.otherIncome));
  add(`${P1}f1_16[0]`, "line7", (c) => money(c.grossIncome));
  for (const [line, name] of Object.entries(EXPENSE_FIELDS)) {
    add(name, `line${line}`, (c) => moneyOrBlank(c.expenseLines[line]));
  }
  add(`${LINES_18_27}f1_40[0]`, "line27.energyEfficientBuildings", () => BLANK);
  add(`${P1}f1_41[0]`, "line28", (c) => money(c.totalExpenses));
  add(`${P1}f1_42[0]`, "line29", (c) => money(c.tentativeProfit));
  add(`${P1}Line30_ReadOrder[0].f1_43[0]`, "line30a.homeSqFt", (c) =>
    c.homeOffice ? String(c.business.homeTotalSqFt ?? BLANK) : BLANK, true);
  add(`${P1}Line30_ReadOrder[0].f1_44[0]`, "line30b.businessSqFt", (c) =>
    c.homeOffice ? String(Math.min(c.business.homeOfficeSqFt ?? 0, 300)) : BLANK, true);
  add(`${P1}f1_45[0]`, "line30", (c) => moneyOrBlank(c.homeOffice));
  add(`${P1}f1_46[0]`, "line31", (c) => money(c.netProfit));
  add(`${P1}c1_7[0]`, "line32a.allAtRisk", (c) => checkIf(c.netProfit < 0));
  add(`${P1}c1_7[1]`, "line32b.someNotAtRisk", off);

  // Part III (cost of goods sold): no inventory in the model.
  for (const n of [1, 2, 3]) add(`${P2}c2_${n}[0]`, `line33.${n}`, off);
  add(`${P2}c2_4[0]`, "line34.yes", off);
  add(`${P2}c2_4[1]`, "line34.no", off);
  for (let n = 1; n <= 8; n++) add(`${P2}f2_${n}[0]`, `partIII.f2_${n}`, () => BLANK);

  // Part IV (vehicle), only with a standard-mileage vehicle.
  const veh = (c: ScheduleCLines) => c.business.vehicle;
  const date = (c: ScheduleCLines) => (veh(c)?.placedInService ?? "").split("/");
  add(`${P2}f2_9[0]`, "line43.month", (c) => (veh(c) ? date(c)[0] : BLANK), true);
  add(`${P2}f2_10[0]`, "line43.day", (c) => (veh(c) ? date(c)[1] : BLANK), true);
  add(`${P2}f2_11[0]`, "line43.year", (c) => (veh(c) ? date(c)[2] : BLANK), true);
  add(`${P2}f2_12[0]`, "line44a.business", (c) => (veh(c) ? String(veh(c)!.businessMiles) : BLANK), true);
  add(`${P2}f2_13[0]`, "line44b.commuting", (c) => (veh(c) ? String(veh(c)!.commutingMiles) : BLANK), true);
  add(`${P2}f2_14[0]`, "line44c.other", (c) => (veh(c) ? String(veh(c)!.otherMiles) : BLANK), true);
  // 45 personal use off-duty, 46 another vehicle available, 47a evidence, 47b written evidence: all "Yes".
  for (const [n, q] of [[5, "45"], [6, "46"], [7, "47a"], [8, "47b"]] as const) {
    add(`${P2}c2_${n}[0]`, `line${q}.yes`, (c) => checkIf(!!veh(c)));
    add(`${P2}c2_${n}[1]`, `line${q}.no`, off);
  }

  // Part V (other expenses).
  for (let r = 0; r < PART_V_ROWS; r++) {
    const item = `${P2}PartVTable[0].Item${r + 1}[0].`;
    const row = (c: ScheduleCLines) => otherExpenseRows(c)[r];
    add(`${item}f2_${15 + r * 2}[0]`, `partV.${r + 1}.description`, (c) => row(c)?.description ?? BLANK, true);
    add(`${item}f2_${16 + r * 2}[0]`, `partV.${r + 1}.amount`, (c) => moneyOrBlank(row(c)?.amount));
  }
  add(`${P2}f2_33[0]`, "line48", (c) => moneyOrBlank(c.expenseLines["27a"]));

  return { formId: "f1040sc", taxYear, strict: true, fields };
}

// ── Schedule SE ───────────────────────────────────────────────────────────────

function buildScheduleSE(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: (s: ScheduleSELines, t: FakeTaxpayer) => string, text = false) => {
    const v: FieldValue = (t) => {
      const s = scheduleSEFor(t);
      return s ? value(s, source(t)) : BLANK;
    };
    fields[name] = { key, value: v, ...(text ? { text } : {}) };
  };
  // Lines 8b–10 are skipped when W-2 social security wages already reach the wage base.
  const skip8bTo10 = (s: ScheduleSELines) => s.socialSecurityWages >= s.wageBase;

  add(`${P1}f1_1[0]`, "name", (s, t) => personName(t, s.owner));
  add(`${P1}f1_2[0]`, "ssn", (s, t) => personSsn(t, s.owner));
  add(`${P1}c1_1[0]`, "partI.minister", () => OFF);
  add(`${P1}f1_3[0]`, "line1a", () => BLANK);
  add(`${P1}f1_4[0]`, "line1b", () => BLANK);
  add(`${P1}f1_5[0]`, "line2", (s) => money(s.netProfit));
  add(`${P1}f1_6[0]`, "line3", (s) => money(s.combined));
  add(`${P1}f1_7[0]`, "line4a", (s) => money(s.combined > 0 ? s.netEarnings : s.combined));
  add(`${P1}f1_8[0]`, "line4b", () => BLANK);
  add(`${P1}f1_9[0]`, "line4c", (s) => money(s.netEarnings));
  add(`${P1}Line5a_ReadOrder[0].f1_10[0]`, "line5a", () => BLANK);
  add(`${P1}f1_11[0]`, "line5b", () => BLANK);
  add(`${P1}f1_12[0]`, "line6", (s) => money(s.selfEmploymentEarnings));
  add(`${P1}f1_13[0]`, "line7", (s) => money(s.wageBase));
  add(`${P1}Line8a_ReadOrder[0].f1_14[0]`, "line8a", (s) => moneyOrBlank(s.socialSecurityWages));
  add(`${P1}f1_15[0]`, "line8b", () => BLANK);
  add(`${P1}f1_16[0]`, "line8c", () => BLANK);
  add(`${P1}f1_17[0]`, "line8d", (s) => (skip8bTo10(s) ? BLANK : moneyOrBlank(s.socialSecurityWages)));
  add(`${P1}f1_18[0]`, "line9", (s) => (skip8bTo10(s) ? BLANK : money(s.remainingBase)));
  add(`${P1}f1_19[0]`, "line10", (s) => (skip8bTo10(s) ? BLANK : money(s.socialSecurityTax)));
  add(`${P1}f1_20[0]`, "line11", (s) => money(s.medicareTax));
  add(`${P1}f1_21[0]`, "line12", (s) => money(s.seTax));
  add(`${P1}f1_22[0]`, "line13", (s) => money(s.deduction));
  for (const n of [1, 2, 3, 4]) add(`${P2}f2_${n}[0]`, `partII.f2_${n}`, () => BLANK);

  return { formId: "f1040sse", taxYear, strict: true, fields };
}

export const SCHEDULE_C_MAPS: FieldMap[] = [2023, 2024, 2025].map(buildScheduleC);
export const SCHEDULE_SE_MAPS: FieldMap[] = [2023, 2024, 2025].map(buildScheduleSE);
// Keep EXPENSE_LINES referenced so the field table and the engine's line list stay in step.
if (EXPENSE_LINES.some(([line]) => !EXPENSE_FIELDS[line])) throw new Error("Schedule C expense line without a field");
