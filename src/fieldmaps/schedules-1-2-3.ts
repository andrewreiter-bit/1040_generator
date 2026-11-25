/**
 * Schedules 1, 2, 3 and Forms 8995, 8959, 8960 field maps, 2023–2025.
 *
 * Field numbering moves between years, so each schedule has a small per-year
 * table of the fields it writes (names checked against each year's template
 * labels). Forms 8959 and 8960 keep identical field names in all three years.
 *
 * Only the lines the engine models are written; every other line is blank
 * (including subtotal lines the PDFs would otherwise compute as 0.00).
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";
import { personSsn } from "./business";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const r = (t: FakeTaxpayer) => computeReturn(source(t));
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));

type Value = (r: ReturnLines, t: FakeTaxpayer) => string;

function mapBuilder(formId: string, taxYear: number) {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(r(t), source(t)), ...(text ? { text } : {}) };
  };
  return { add, build: (): FieldMap => ({ formId, taxYear, strict: true, fields }) };
}

const names: Value = (_r, t) => namesOnReturn(t);
const ssn: Value = (_r, t) => t.ssn;

interface Schedule1Layout {
  root: string;
  line3: string; line5: string; line7: string; line8g: string; line9: string; line10: string;
  /** 2025 only: "repaid" checkbox and amount beside line 7. */
  repaidBox?: string; repaidAmount?: string;
  line11: string; line15: string; line17: string; line18: string; line21: string; line25: string; line26: string;
}

const S1: Record<number, Schedule1Layout> = {
  2023: { root: "form1[0]", line3: "P1.f1_06", line5: "P1.f1_08", line7: "P1.f1_10", line8g: "P1.f1_17", line9: "P1.f1_35", line10: "P1.f1_36",
    line11: "P2.f2_01", line15: "P2.f2_05", line17: "P2.f2_07", line18: "P2.f2_08", line21: "P2.f2_13", line25: "P2.f2_30", line26: "P2.f2_31" },
  2024: { root: "form1[0]", line3: "P1.f1_07", line5: "P1.f1_09", line7: "P1.f1_11", line8g: "P1.f1_18", line9: "P1.f1_37", line10: "P1.f1_38",
    line11: "P2.f2_01", line15: "P2.f2_05", line17: "P2.f2_07", line18: "P2.f2_08", line21: "P2.f2_13", line25: "P2.f2_30", line26: "P2.f2_31" },
  2025: { root: "topmostSubform[0]", line3: "P1.f1_07", line5: "P1.f1_09", line7: "P1.f1_12", line8g: "P1.f1_19", line9: "P1.f1_37", line10: "P1.f1_38",
    repaidBox: "P1.Line7_ReadOrder[0].c1_3", repaidAmount: "P1.Line7_ReadOrder[0].f1_11",
    line11: "P2.f2_01", line15: "P2.f2_05", line17: "P2.f2_07", line18: "P2.f2_08", line21: "P2.f2_13", line25: "P2.f2_29", line26: "P2.f2_30" },
};

/** "P1.f1_07" → "<root>.Page1[0].f1_07[0]". */
const fieldIn = (root: string) => (short: string) =>
  `${root}.${short.replace(/^P1\./, "Page1[0].").replace(/^P2\./, "Page2[0].")}[0]`;

function schedule1(taxYear: number): FieldMap {
  const L = S1[taxYear];
  const F = fieldIn(L.root);
  const { add, build } = mapBuilder("f1040s1", taxYear);
  add(F("P1.f1_01"), "names", names);
  add(F("P1.f1_02"), "ssn", ssn);
  add(F(L.line3), "line3", (x) => moneyOrBlank(x.schedule1.businessIncome));
  add(F(L.line5), "line5", (x) => moneyOrBlank(x.schedule1.rentalIncome));
  if (L.repaidBox && L.repaidAmount) {
    add(F(L.repaidBox), "line7.repaid", (x) => checkIf(x.schedule1.unemploymentRepaid > 0));
    add(F(L.repaidAmount), "line7.repaidAmount", (x) => moneyOrBlank(x.schedule1.unemploymentRepaid));
  }
  // 2023/2024 have no repaid box: line 7 is simply the net amount.
  add(F(L.line7), "line7", (x) => moneyOrBlank(x.schedule1.unemployment));
  add(F(L.line8g), "line8g", (x) => moneyOrBlank(x.schedule1.alaskaPfd));
  add(F(L.line9), "line9", (x) => moneyOrBlank(x.schedule1.otherIncome));
  add(F(L.line10), "line10", (x) => money(x.schedule1.additionalIncome));
  add(F(L.line11), "line11", (x) => moneyOrBlank(x.schedule1.educatorExpenses));
  add(F(L.line15), "line15", (x) => moneyOrBlank(x.schedule1.seTaxDeduction));
  add(F(L.line17), "line17", (x) => moneyOrBlank(x.schedule1.healthInsurance));
  add(F(L.line18), "line18", (x) => moneyOrBlank(x.schedule1.earlyWithdrawalPenalty));
  add(F(L.line21), "line21", (x) => moneyOrBlank(x.schedule1.studentLoanInterest));
  add(F(L.line25), "line25", () => BLANK);
  add(F(L.line26), "line26", (x) => money(x.schedule1.adjustments));
  return build();
}

interface Schedule2Layout {
  /** Part I subtotal lines (blank) and line 3. */
  partIBlank: string[]; line3: string;
  line4: string; line4Boxes: string[];
  line7: string; line8: string; line8Box: string; line11: string; line12: string; line13: string; line18: string; line21: string;
}

const S2: Record<number, Schedule2Layout> = {
  // 2023: line 1 AMT, 2 excess APTC, 3 = 1 + 2.
  2023: { partIBlank: [], line3: "P1.f1_05", line4: "P1.f1_06", line4Boxes: [],
    line7: "P1.f1_09", line8: "P1.f1_10", line8Box: "P1.Line8_ReadOrder[0].c1_1", line11: "P1.f1_13", line12: "P1.f1_14", line13: "P1.f1_15", line18: "P2.f2_22", line21: "P2.f2_25" },
  2024: { partIBlank: ["P1.f1_11"], line3: "P1.f1_13", line4: "P1.f1_14", line4Boxes: [],
    line7: "P1.f1_17", line8: "P1.f1_18", line8Box: "P1.Line8_ReadOrder[0].c1_3", line11: "P1.f1_21", line12: "P1.f1_22", line13: "P1.f1_23", line18: "P2.f2_22", line21: "P2.f2_25" },
  2025: { partIBlank: ["P1.f1_11"], line3: "P1.f1_13", line4: "P1.f1_15",
    line4Boxes: ["P1.Line4_ReadOrder[0].c1_3", "P1.Line4_ReadOrder[0].c1_4", "P1.Line4_ReadOrder[0].c1_5"],
    line7: "P1.f1_18", line8: "P1.f1_19", line8Box: "P1.Line8_ReadOrder[0].c1_6", line11: "P1.f1_22", line12: "P1.f1_23", line13: "P1.f1_24", line18: "P2.f2_21", line21: "P2.f2_24" },
};

function schedule2(taxYear: number): FieldMap {
  const L = S2[taxYear];
  const F = fieldIn("form1[0]");
  const { add, build } = mapBuilder("f1040s2", taxYear);
  add(F("P1.f1_01"), "names", names);
  add(F("P1.f1_02"), "ssn", ssn);
  L.partIBlank.forEach((f, i) => add(F(f), `partI.subtotal${i + 1}`, () => BLANK));
  add(F(L.line3), "line3", (x) => moneyOrBlank(x.scheduleTwoPartOne));
  L.line4Boxes.forEach((f, i) => add(F(f), `line4.box${i + 1}`, () => OFF));
  add(F(L.line4), "line4", (x) => moneyOrBlank(x.schedule2.seTax));
  add(F(L.line7), "line7", () => BLANK);
  // Line 8: 10% of code 1 early distributions; the box says Form 5329 isn't required.
  add(F(L.line8), "line8", (x) => moneyOrBlank(x.schedule2.earlyDistributionTax));
  add(F(L.line8Box), "line8.noForm5329", (x) => checkIf(x.schedule2.earlyDistributionTax > 0));
  add(F(L.line11), "line11", (x) => moneyOrBlank(x.schedule2.additionalMedicareTax));
  add(F(L.line12), "line12", (x) => moneyOrBlank(x.schedule2.niit));
  add(F(L.line13), "line13", (x) => moneyOrBlank(x.schedule2.uncollectedTax));
  add(F(L.line18), "line18", () => BLANK);
  add(F(L.line21), "line21", (x) => money(x.schedule2.otherTaxes));
  return build();
}

const S3: Record<number, { line2: string; line3: string; line4: string; line7: string; line8: string; line11: string; line14: string; line15: string }> = {
  2023: { line2: "P1.f1_04", line3: "P1.f1_05", line4: "P1.f1_06", line7: "P1.f1_25", line8: "P1.f1_26", line11: "P2.f2_03", line14: "P2.f2_16", line15: "P2.f2_17" },
  2024: { line2: "P1.f1_04", line3: "P1.f1_05", line4: "P1.f1_06", line7: "P1.f1_25", line8: "P1.f1_26", line11: "P1.f1_29", line14: "P1.f1_38", line15: "P1.f1_39" },
  2025: { line2: "P1.f1_04", line3: "P1.f1_05", line4: "P1.f1_06", line7: "P1.f1_24", line8: "P1.f1_25", line11: "P1.f1_28", line14: "P1.f1_36", line15: "P1.f1_37" },
};

function schedule3(taxYear: number): FieldMap {
  const L = S3[taxYear];
  const F = fieldIn("topmostSubform[0]");
  const { add, build } = mapBuilder("f1040s3", taxYear);
  add(F("P1.f1_01"), "names", names);
  add(F("P1.f1_02"), "ssn", ssn);
  add(F(L.line2), "line2", (x) => moneyOrBlank(x.schedule3.dependentCareCredit));
  add(F(L.line3), "line3", (x) => moneyOrBlank(x.schedule3.educationCredit));
  add(F(L.line4), "line4", (x) => moneyOrBlank(x.schedule3.saversCredit));
  add(F(L.line7), "line7", () => BLANK);
  add(F(L.line8), "line8", (x) => moneyOrBlank(x.scheduleThreeCredits));
  add(F(L.line11), "line11", (x) => moneyOrBlank(x.schedule3.excessSocialSecurity));
  add(F(L.line14), "line14", () => BLANK);
  add(F(L.line15), "line15", (x) => money(x.schedule3.otherPayments));
  return build();
}

export const FORM_8995_ROWS = 5;

/**
 * Form 8995: 2025 names the line-1 rows Row1i…Row1v with zero-padded fields
 * (f1_01, f1_03 …) and puts line 2 under Line2_ReadOrder; 2023/2024 use
 * Ln1A_Row1…Ln1E_Row5, unpadded f1_1…f1_9 and ReadOrderSubForm. Lines 3–17 match.
 */
function form8995(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const y25 = taxYear >= 2025;
  const fn = (n: number) => `f1_${y25 ? String(n).padStart(2, "0") : n}[0]`;
  const { add, build } = mapBuilder("f8995", taxYear);
  const q = (x: ReturnLines) => x.form8995;
  add(`${P1}${fn(1)}`, "names", names);
  add(`${P1}${fn(2)}`, "ssn", ssn);
  const ROW = y25 ? ["Row1i", "Row1ii", "Row1iii", "Row1iv", "Row1v"] : ["Ln1A_Row1", "Ln1B_Row2", "Ln1C_Row3", "Ln1D_Row4", "Ln1E_Row5"];
  for (let i = 0; i < FORM_8995_ROWS; i++) {
    const row = `${P1}Table[0].${ROW[i]}[0].`;
    const n = 3 + i * 3;
    const biz = (x: ReturnLines) => (q(x) && i < q(x)!.businessIndex.length ? x.scheduleC[q(x)!.businessIndex[i]] : undefined);
    add(`${row}${fn(n)}`, `line1.${i + 1}.name`, (x) =>
      biz(x) ? biz(x)!.business.businessName || biz(x)!.business.principalBusiness : BLANK, true);
    add(`${row}${fn(n + 1)}`, `line1.${i + 1}.tin`, (x, t) =>
      biz(x) ? biz(x)!.business.ein || personSsn(t, biz(x)!.owner) : BLANK, true);
    add(`${row}${fn(n + 2)}`, `line1.${i + 1}.qbi`, (x) =>
      biz(x) ? money(q(x)!.qbiByBusiness[i]) : BLANK);
  }
  add(`${P1}${y25 ? "Line2_ReadOrder" : "ReadOrderSubForm"}[0].f1_18[0]`, "line2", (x) => money(q(x)!.totalQbi));
  add(`${P1}f1_19[0]`, "line3", (x) => moneyOrBlank(q(x)!.priorYearLoss), true);
  add(`${P1}f1_20[0]`, "line4", (x) => money(q(x)!.netQbi));
  add(`${P1}f1_21[0]`, "line5", (x) => money(q(x)!.qbiComponent));
  add(`${P1}Line6_ReadOrder[0].f1_22[0]`, "line6", () => BLANK);
  add(`${P1}f1_23[0]`, "line7", () => BLANK, true);
  add(`${P1}f1_24[0]`, "line8", () => BLANK);
  add(`${P1}f1_25[0]`, "line9", () => BLANK);
  add(`${P1}f1_26[0]`, "line10", (x) => money(q(x)!.combinedComponent));
  add(`${P1}f1_27[0]`, "line11", (x) => money(q(x)!.taxableIncomeBeforeQbi));
  add(`${P1}f1_28[0]`, "line12", (x) => money(q(x)!.netCapitalGain));
  add(`${P1}f1_29[0]`, "line13", (x) => money(q(x)!.reducedTaxableIncome));
  add(`${P1}f1_30[0]`, "line14", (x) => money(q(x)!.incomeLimitation));
  add(`${P1}f1_31[0]`, "line15", (x) => money(q(x)!.deduction));
  add(`${P1}f1_32[0]`, "line16", (x) => moneyOrBlank(q(x)!.lossCarryforward));
  add(`${P1}f1_33[0]`, "line17", () => BLANK);
  return build();
}

function form8959(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f8959", taxYear);
  const m = (x: ReturnLines) => x.form8959;
  const f = (n: number) => `${P1}f1_${n}[0]`;
  add(f(1), "names", names);
  add(f(2), "ssn", ssn);
  add(f(3), "line1", (x) => money(m(x).medicareWages));
  add(f(4), "line2", () => BLANK);
  add(f(5), "line3", () => BLANK);
  add(f(6), "line4", (x) => money(m(x).medicareWages));
  add(f(7), "line5", (x) => money(m(x).threshold));
  add(f(8), "line6", (x) => money(m(x).wagesOverThreshold));
  add(f(9), "line7", (x) => money(m(x).wageTax));
  const se = (x: ReturnLines) => x.scheduleSE.some((s) => !s.belowMinimum);
  add(f(10), "line8", (x) => (se(x) ? money(m(x).seIncome) : BLANK));
  add(f(11), "line9", (x) => (se(x) ? money(m(x).threshold) : BLANK));
  add(f(12), "line10", (x) => (se(x) ? money(m(x).medicareWages) : BLANK));
  add(f(13), "line11", (x) => (se(x) ? money(m(x).remainingThreshold) : BLANK));
  add(f(14), "line12", (x) => (se(x) ? money(m(x).seOverThreshold) : BLANK));
  add(f(15), "line13", (x) => (se(x) ? money(m(x).seTax) : BLANK));
  for (const n of [16, 17, 18, 19]) add(f(n), `partIII.f1_${n}`, () => BLANK);   // RRTA: none
  add(f(20), "line18", (x) => money(m(x).totalTax));
  add(f(21), "line19", (x) => money(m(x).medicareWithheld));
  add(f(22), "line20", (x) => money(m(x).medicareWages));
  add(f(23), "line21", (x) => money(m(x).regularMedicareWithheld));
  add(f(24), "line22", (x) => money(m(x).additionalWithheld));
  add(f(25), "line23", () => BLANK);
  add(f(26), "line24", (x) => money(m(x).additionalWithheld));
  return build();
}

function form8960(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f8960", taxYear);
  const m = (x: ReturnLines) => x.form8960;
  const f = (n: number) => `${P1}f1_${n}[0]`;
  add(f(1), "names", names);
  add(f(2), "ssn", ssn);
  for (const n of [1, 2, 3]) add(`${P1}PartI[0].c1_${n}[0]`, `partI.election${n}`, () => OFF);
  add(f(3), "line1", (x) => moneyOrBlank(x.taxableInterest));
  add(f(4), "line2", (x) => moneyOrBlank(x.ordinaryDividends));
  add(f(5), "line3", () => BLANK);                                        // annuities: none
  add(f(6), "line4a", (x) => moneyOrBlank(m(x).rentalIncome));             // rental real estate (Schedule E)
  add(f(7), "line4b", () => BLANK);
  add(f(8), "line4c", (x) => moneyOrBlank(m(x).rentalIncome));
  add(f(9), "line5a", (x) => moneyOrBlank(x.capitalGain));
  add(f(10), "line5b", () => BLANK);
  add(f(11), "line5c", () => BLANK);
  add(f(12), "line5d", (x) => moneyOrBlank(x.capitalGain));
  add(f(13), "line6", () => BLANK);
  add(f(14), "line7", () => BLANK);
  add(f(15), "line8", (x) => money(x.taxableInterest + x.ordinaryDividends + m(x).rentalIncome + x.capitalGain));
  for (const n of [16, 17, 18, 19, 20]) add(f(n), `partII.f1_${n}`, () => BLANK);
  add(f(21), "line11", () => BLANK);
  add(f(22), "line12", (x) => money(m(x).netInvestmentIncome));
  add(f(23), "line13", (x) => money(m(x).modifiedAgi));
  add(f(24), "line14", (x) => money(m(x).threshold));
  add(f(25), "line15", (x) => money(m(x).agiOverThreshold));
  add(f(26), "line16", (x) => money(Math.min(m(x).netInvestmentIncome, m(x).agiOverThreshold)));
  add(f(27), "line17", (x) => money(m(x).tax));
  for (let n = 28; n <= 35; n++) add(f(n), `estatesTrusts.f1_${n}`, () => BLANK);
  return build();
}

/**
 * 2025 Schedule 1-A (Additional Deductions): Part I (modified AGI), Part V
 * (enhanced deduction for seniors) and Part VI (total → Form 1040 line 13b).
 * Parts II–IV (tips, overtime, car loan interest) are not modelled and stay blank.
 */
function schedule1A_2025(): FieldMap {
  const F = fieldIn("form1[0]");
  const { add, build } = mapBuilder("f1040s1a", 2025);
  const a = (x: ReturnLines) => x.schedule1A;
  const amt = (pick: (s: NonNullable<ReturnLines["schedule1A"]>) => number) => (x: ReturnLines) => (a(x) ? money(pick(a(x)!)) : BLANK);
  add(F("P1.f1_01"), "names", names);
  add(F("P1.f1_02"), "ssn", ssn);
  add(F("P1.f1_03"), "line1", amt((s) => s.magi));
  for (const n of [4, 5, 6, 7, 8]) add(F(`P1.f1_0${n}`), `line2.f1_0${n}`, () => BLANK);   // 2a–2e: no exclusions
  add(F("P1.f1_09"), "line3", amt((s) => s.magi));
  for (let n = 10; n <= 31; n++) add(F(`P1.f1_${n}`), `partII-III.f1_${n}`, () => BLANK, true);
  const p4 = ["Table_Line22[0].Line22a[0].VIN-1_Comb[0].f2_01", "Table_Line22[0].Line22a[0].f2_02", "Table_Line22[0].Line22a[0].f2_03",
    "Table_Line22[0].Line22b[0].VIN-2_Comb[0].f2_04", "Table_Line22[0].Line22b[0].f2_05", "Table_Line22[0].Line22b[0].f2_06"];
  p4.forEach((f, i) => add(F(`P2.${f}`), `partIV.line22.${i}`, () => BLANK, true));
  for (let n = 7; n <= 14; n++) add(F(`P2.f2_${String(n).padStart(2, "0")}`), `partIV.f2_${n}`, () => BLANK, true);
  add(F("P2.f2_15"), "line31", amt((s) => s.magi));
  add(F("P2.f2_16"), "line32", (x, t) => (a(x) ? money(t.filingStatus === "MFJ" ? 150000 : 75000) : BLANK));
  add(F("P2.f2_17"), "line33", amt((s) => s.line33));
  add(F("P2.f2_18"), "line34", (x) => (a(x)?.line33 ? money(a(x)!.line34) : BLANK));
  add(F("P2.f2_19"), "line35", amt((s) => s.line35));
  add(F("P2.f2_20"), "line36a", (x) => moneyOrBlank(a(x)?.line36a));
  add(F("P2.f2_21"), "line36b", (x) => moneyOrBlank(a(x)?.line36b));
  add(F("P2.f2_22"), "line37", amt((s) => s.line37));
  add(F("P2.f2_23"), "line38", amt((s) => s.line38));
  return build();
}

export const SCHEDULE_1_2_3_MAPS: FieldMap[] = [
  ...[2023, 2024, 2025].flatMap((y) => [schedule1(y), schedule2(y), schedule3(y), form8995(y), form8959(y), form8960(y)]),
  schedule1A_2025(),
];
