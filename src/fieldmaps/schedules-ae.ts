/**
 * Schedule A and Schedule E (Part I) field maps, 2023–2025.
 *
 * Schedule A: 2023/2024 share one layout (topmostSubform root, two-line boxes for
 * lines 6 and 16); 2025 moves to a form1 root with one-line 6/16 boxes, so the
 * fields after line 7 are renumbered. Only filed when the household itemizes.
 *
 * Schedule E: identical field names in all three years. Part I holds up to three
 * properties (columns A–C); expense line L in column c is f1_(22 + 3·(L−5) + c).
 * Parts II–V (partnerships, estates, REMICs, farm rental) are not modelled.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { RENTAL_EXPENSE_LINES, RentalColumn } from "../tax/rental";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));
type Value = (r: ReturnLines, t: FakeTaxpayer) => string;

function builder(formId: string, taxYear: number) {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), source(t)), ...(text ? { text } : {}) };
  };
  return { add, build: (): FieldMap => ({ formId, taxYear, strict: true, fields }) };
}

// ── Schedule A ────────────────────────────────────────────────────────────────

/** Line → field (number), per layout. */
const SA_2023_2024: Record<string, string> = {
  "1": "f1_3", "2": "f1_4", "3": "f1_5", "4": "f1_6", "5a": "f1_7", "5b": "f1_8", "5c": "f1_9", "5d": "f1_10",
  "5e": "f1_11", "6.type1": "f1_12", "6.type2": "f1_13", "6": "f1_14", "7": "f1_15", "8a": "f1_16",
  "8b.payee1": "f1_17", "8b.payee2": "f1_18", "8b": "f1_19", "8c": "f1_20", "8d": "f1_21", "8e": "f1_22",
  "9": "f1_23", "10": "f1_24", "11": "f1_25", "12": "f1_26", "13": "f1_27", "14": "f1_28", "15": "f1_29",
  "16.type1": "f1_30", "16.type2": "f1_31", "16.type3": "f1_32", "16": "f1_33", "17": "f1_34",
};
const SA_2025: Record<string, string> = {
  "1": "f1_3", "2": "Line2_ReadOrder[0].f1_4", "3": "f1_5", "4": "f1_6", "5a": "f1_7", "5b": "f1_8", "5c": "f1_9",
  "5d": "f1_10", "5e": "f1_11", "6.type1": "f1_12", "6": "f1_13", "7": "f1_14", "8a": "f1_15",
  "8b.payee1": "Line8b_ReadOrder[0].f1_16", "8b": "f1_17", "8c": "f1_18", "8d": "f1_19", "8e": "f1_20",
  "9": "f1_21", "10": "f1_22", "11": "f1_23", "12": "f1_24", "13": "f1_25", "14": "f1_26", "15": "f1_27",
  "16.type1": "f1_28", "16": "f1_29", "17": "f1_30",
};

function scheduleA(taxYear: number): FieldMap {
  const y25 = taxYear >= 2025;
  const P1 = y25 ? "form1[0].Page1[0]." : "topmostSubform[0].Page1[0].";
  const L = y25 ? SA_2025 : SA_2023_2024;
  const { add, build } = builder("f1040sa", taxYear);
  const a = (r: ReturnLines) => r.scheduleA;
  const values: Record<string, Value> = {
    "1": (r) => moneyOrBlank(a(r)?.line1),
    "2": (r) => (a(r)?.line1 ? money(a(r)!.line2) : BLANK),
    "3": (r) => (a(r)?.line1 ? money(a(r)!.line3) : BLANK),
    "4": (r) => (a(r)?.line1 ? money(a(r)!.line4) : BLANK),
    "5a": (r) => moneyOrBlank(a(r)?.line5a),
    "5b": (r) => moneyOrBlank(a(r)?.line5b),
    "5c": (r) => moneyOrBlank(a(r)?.line5c),
    "5d": (r) => moneyOrBlank(a(r)?.line5d),
    "5e": (r) => moneyOrBlank(a(r)?.line5e),
    "7": (r) => moneyOrBlank(a(r)?.line7),
    "8a": (r) => moneyOrBlank(a(r)?.line8a),
    "8c": (r) => moneyOrBlank(a(r)?.line8c),
    "8e": (r) => moneyOrBlank(a(r)?.line8e),
    "10": (r) => moneyOrBlank(a(r)?.line10),
    "11": (r) => moneyOrBlank(a(r)?.line11),
    "12": (r) => moneyOrBlank(a(r)?.line12),
    "14": (r) => moneyOrBlank(a(r)?.line14),
    "17": (r) => (a(r) ? money(a(r)!.line17) : BLANK),
  };
  add(`${P1}f1_1[0]`, "names", (_r, t) => namesOnReturn(t));
  add(`${P1}f1_2[0]`, "ssn", (_r, t) => t.ssn);
  for (const [line, field] of Object.entries(L)) {
    add(`${P1}${field}[0]`, `line${line}`, values[line] ?? (() => BLANK), /type|payee/.test(line));
  }
  add(`${P1}c1_1[0]`, "line5a.salesTax", (r) => checkIf(!!a(r)?.salesTaxElected));
  add(`${P1}Line8_ReadOrder[0].c1_2[0]`, "line8.notAllForHome", () => OFF);
  add(`${P1}Line18_ReadOrder[0].c1_3[0]`, "line18.electToItemize", () => OFF);
  return build();
}

// ── Schedule E ────────────────────────────────────────────────────────────────

function scheduleE(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const { add, build } = builder("f1040se", taxYear);
  const f = (n: number) => `f1_${n}[0]`;
  const col = (r: ReturnLines, c: number): RentalColumn | undefined => r.scheduleE?.columns[c];
  const COL = ["A", "B", "C"];

  add(`${P1}f1_1[0]`, "names", (_r, t) => namesOnReturn(t));
  add(`${P1}f1_2[0]`, "ssn", (_r, t) => t.ssn);
  // A: payments requiring Forms 1099 → No (B then not answered).
  add(`${P1}c1_1[0]`, "A.yes", () => OFF);
  add(`${P1}c1_1[1]`, "A.no", (r) => checkIf(!!r.scheduleE));
  add(`${P1}c1_2[0]`, "B.yes", () => OFF);
  add(`${P1}c1_2[1]`, "B.no", () => OFF);
  for (let c = 0; c < 3; c++) {
    const k = COL[c];
    add(`${P1}Table_Line1a[0].Row${k}[0].${f(3 + c)}`, `line1a.${k}`, (r) => col(r, c)?.property.address ?? BLANK, true);
    add(`${P1}Table_Line1b[0].Row${k}[0].${f(6 + c)}`, `line1b.${k}`, (r) => (col(r, c) ? String(col(r, c)!.property.propertyType) : BLANK), true);
    const row2 = `${P1}Table_Line2[0].Row${k}[0].`;
    add(`${row2}${f(9 + c * 2)}`, `line2.${k}.fairRentalDays`, (r) => (col(r, c) ? String(col(r, c)!.property.fairRentalDays) : BLANK), true);
    add(`${row2}${f(10 + c * 2)}`, `line2.${k}.personalUseDays`, (r) => (col(r, c) ? String(col(r, c)!.property.personalUseDays) : BLANK), true);
    add(`${row2}c1_${3 + c}[0]`, `line2.${k}.qjv`, (r) => checkIf(!!col(r, c)?.property.qualifiedJointVenture));
    add(`${P1}Table_Income[0].Line3[0].${f(16 + c)}`, `line3.${k}`, (r) => (col(r, c) ? money(col(r, c)!.rents) : BLANK));
    add(`${P1}Table_Income[0].Line4[0].${f(19 + c)}`, `line4.${k}`, (r) => moneyOrBlank(col(r, c)?.royalties));
    for (const [line] of RENTAL_EXPENSE_LINES) {
      const L = Number(line);
      const n = L <= 18 ? 22 + 3 * (L - 5) + c : 65 + c;
      add(`${P1}Table_Expenses[0].Line${L}[0].${f(n)}`, `line${L}.${k}`, (r) => moneyOrBlank(col(r, c)?.expenseLines[line]));
    }
    add(`${P1}Table_Expenses[0].Line20[0].${f(68 + c)}`, `line20.${k}`, (r) => (col(r, c) ? money(col(r, c)!.totalExpenses) : BLANK));
    add(`${P1}Table_Expenses[0].Line21[0].${f(71 + c)}`, `line21.${k}`, (r) => (col(r, c) ? money(col(r, c)!.net) : BLANK));
    add(`${P1}Table_Expenses[0].Line22[0].${f(74 + c)}`, `line22.${k}`, (r) => (col(r, c)?.deductibleLoss ? money(col(r, c)!.deductibleLoss) : BLANK));
  }
  add(`${P1}f1_15[0]`, "type8.describe", () => BLANK, true);
  add(`${P1}Table_Expenses[0].Line19[0].${f(64)}`, "line19.describe", () => BLANK, true);
  const e = (r: ReturnLines) => r.scheduleE;
  add(`${P1}${f(77)}`, "line23a", (r) => (e(r) ? money(e(r)!.line23a) : BLANK));
  add(`${P1}${f(78)}`, "line23b", (r) => moneyOrBlank(e(r)?.line23b));
  add(`${P1}${f(79)}`, "line23c", (r) => moneyOrBlank(e(r)?.line23c));
  add(`${P1}${f(80)}`, "line23d", (r) => moneyOrBlank(e(r)?.line23d));
  add(`${P1}${f(81)}`, "line23e", (r) => (e(r) ? money(e(r)!.line23e) : BLANK));
  add(`${P1}${f(82)}`, "line24", (r) => (e(r) ? money(e(r)!.line24) : BLANK));
  add(`${P1}${f(83)}`, "line25", (r) => moneyOrBlank(e(r)?.line25 ? -e(r)!.line25 : 0));   // printed in parentheses
  add(`${P1}${f(84)}`, "line26", (r) => (e(r) ? money(e(r)!.line26) : BLANK));
  return build();
}

export const SCHEDULE_A_E_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [scheduleA(y), scheduleE(y)]);
