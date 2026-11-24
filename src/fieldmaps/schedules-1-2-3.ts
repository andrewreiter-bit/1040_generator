/**
 * Schedules 1, 2, 3 and Forms 8995, 8959, 8960 field maps — 2025 only.
 *
 * forms_2023/ and forms_2024/ currently hold the 2025 revision of these PDFs, so
 * there is deliberately no 2023/2024 map: documentsFor produces no document for
 * a needed schedule without a map, and the validator reports it (scheduleGaps).
 * Add a year here once its own PDF is in forms_<year>/ and its template rebuilt.
 *
 * Only the lines the engine models are written; every other line is blank.
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

function schedule1_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const { add, build } = mapBuilder("f1040s1", 2025);
  add(`${P1}f1_01[0]`, "names", names);
  add(`${P1}f1_02[0]`, "ssn", ssn);
  add(`${P1}f1_07[0]`, "line3", (x) => moneyOrBlank(x.schedule1.businessIncome));
  add(`${P1}Line7_ReadOrder[0].c1_3[0]`, "line7.repaid", (x) => checkIf(x.schedule1.unemploymentRepaid > 0));
  add(`${P1}Line7_ReadOrder[0].f1_11[0]`, "line7.repaidAmount", (x) => moneyOrBlank(x.schedule1.unemploymentRepaid));
  add(`${P1}f1_12[0]`, "line7", (x) => moneyOrBlank(x.schedule1.unemployment));
  add(`${P1}f1_37[0]`, "line9", () => BLANK);   // subtotal formulas for lines the model never uses
  add(`${P1}f1_38[0]`, "line10", (x) => money(x.schedule1.additionalIncome));
  add(`${P2}f2_01[0]`, "line11", (x) => moneyOrBlank(x.schedule1.educatorExpenses));
  add(`${P2}f2_05[0]`, "line15", (x) => moneyOrBlank(x.schedule1.seTaxDeduction));
  add(`${P2}f2_07[0]`, "line17", (x) => moneyOrBlank(x.schedule1.healthInsurance));
  add(`${P2}f2_13[0]`, "line21", (x) => moneyOrBlank(x.schedule1.studentLoanInterest));
  add(`${P2}f2_29[0]`, "line25", () => BLANK);
  add(`${P2}f2_30[0]`, "line26", (x) => money(x.schedule1.adjustments));
  return build();
}

function schedule2_2025(): FieldMap {
  const P1 = "form1[0].Page1[0].";
  const P2 = "form1[0].Page2[0].";
  const { add, build } = mapBuilder("f1040s2", 2025);
  add(`${P1}f1_01[0]`, "names", names);
  add(`${P1}f1_02[0]`, "ssn", ssn);
  add(`${P1}f1_11[0]`, "line1z", () => BLANK);
  add(`${P1}f1_13[0]`, "line3", (x) => moneyOrBlank(x.scheduleTwoPartOne));
  add(`${P1}f1_18[0]`, "line7", () => BLANK);
  add(`${P2}f2_21[0]`, "line18", () => BLANK);
  add(`${P1}Line4_ReadOrder[0].c1_3[0]`, "line4.form4361", () => OFF);
  add(`${P1}Line4_ReadOrder[0].c1_4[0]`, "line4.form4029", () => OFF);
  add(`${P1}Line4_ReadOrder[0].c1_5[0]`, "line4.other", () => OFF);
  add(`${P1}f1_15[0]`, "line4", (x) => moneyOrBlank(x.schedule2.seTax));
  add(`${P1}f1_22[0]`, "line11", (x) => moneyOrBlank(x.schedule2.additionalMedicareTax));
  add(`${P1}f1_23[0]`, "line12", (x) => moneyOrBlank(x.schedule2.niit));
  add(`${P2}f2_24[0]`, "line21", (x) => money(x.schedule2.otherTaxes));
  return build();
}

function schedule3_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f1040s3", 2025);
  add(`${P1}f1_01[0]`, "names", names);
  add(`${P1}f1_02[0]`, "ssn", ssn);
  add(`${P1}f1_24[0]`, "line7", () => BLANK);
  add(`${P1}f1_25[0]`, "line8", (x) => moneyOrBlank(x.scheduleThreeCredits));
  add(`${P1}f1_36[0]`, "line14", () => BLANK);
  add(`${P1}f1_28[0]`, "line11", (x) => moneyOrBlank(x.schedule3.excessSocialSecurity));
  add(`${P1}f1_37[0]`, "line15", (x) => money(x.schedule3.otherPayments));
  return build();
}

export const FORM_8995_ROWS = 5;

function form8995_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f8995", 2025);
  const q = (x: ReturnLines) => x.form8995;
  add(`${P1}f1_01[0]`, "names", names);
  add(`${P1}f1_02[0]`, "ssn", ssn);
  const ROW = ["Row1i", "Row1ii", "Row1iii", "Row1iv", "Row1v"];
  for (let i = 0; i < FORM_8995_ROWS; i++) {
    const row = `${P1}Table[0].${ROW[i]}[0].`;
    const n = 3 + i * 3;
    const biz = (x: ReturnLines) => x.scheduleC[i];
    add(`${row}f1_${String(n).padStart(2, "0")}[0]`, `line1.${i + 1}.name`, (x) =>
      biz(x) ? biz(x).business.businessName || biz(x).business.principalBusiness : BLANK, true);
    add(`${row}f1_${String(n + 1).padStart(2, "0")}[0]`, `line1.${i + 1}.tin`, (x, t) =>
      biz(x) ? biz(x).business.ein || personSsn(t, biz(x).owner) : BLANK, true);
    add(`${row}f1_${String(n + 2).padStart(2, "0")}[0]`, `line1.${i + 1}.qbi`, (x) =>
      biz(x) ? money(q(x)!.qbiByBusiness[i]) : BLANK);
  }
  add(`${P1}Line2_ReadOrder[0].f1_18[0]`, "line2", (x) => money(q(x)!.totalQbi));
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

function form8959_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f8959", 2025);
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

function form8960_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = mapBuilder("f8960", 2025);
  const m = (x: ReturnLines) => x.form8960;
  const f = (n: number) => `${P1}f1_${n}[0]`;
  add(f(1), "names", names);
  add(f(2), "ssn", ssn);
  for (const n of [1, 2, 3]) add(`${P1}PartI[0].c1_${n}[0]`, `partI.election${n}`, () => OFF);
  add(f(3), "line1", (x) => moneyOrBlank(x.taxableInterest));
  add(f(4), "line2", (x) => moneyOrBlank(x.ordinaryDividends));
  for (const n of [5, 6, 7, 8]) add(f(n), `line.f1_${n}`, () => BLANK);   // 3, 4a–4c: none
  add(f(9), "line5a", (x) => moneyOrBlank(x.capitalGain));
  add(f(10), "line5b", () => BLANK);
  add(f(11), "line5c", () => BLANK);
  add(f(12), "line5d", (x) => moneyOrBlank(x.capitalGain));
  add(f(13), "line6", () => BLANK);
  add(f(14), "line7", () => BLANK);
  add(f(15), "line8", (x) => money(x.taxableInterest + x.ordinaryDividends + x.capitalGain));
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

export const SCHEDULE_1_2_3_MAPS: FieldMap[] = [
  schedule1_2025(), schedule2_2025(), schedule3_2025(), form8995_2025(), form8959_2025(), form8960_2025(),
];
