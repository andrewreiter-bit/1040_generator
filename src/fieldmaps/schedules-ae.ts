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
import { F8582_INDEX, shortFieldName } from "./f8582.index";

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

// ── Form 8582 ─────────────────────────────────────────────────────────────────

const ratio = (n: number) => n.toFixed(4);

/**
 * Form 8582 (2025 layout). Part I–III lines; Part IV one row per rental (up to 5);
 * Part VI only when Part II line 9 has an amount; Parts VII/VIII only when some
 * loss is unallowed. Part V (other passive activities) and Part IX stay blank.
 */
function form8582_2025(): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const { add, build } = builder("f8582", 2025);
  const f = (r: ReturnLines) => r.form8582;
  const live = (r: ReturnLines) => !!f(r)?.required;
  const limited = (r: ReturnLines) => live(r) && f(r)!.line3 < 0;
  const amt = (pick: (x: NonNullable<ReturnLines["form8582"]>) => number | undefined, when = live) => (r: ReturnLines) =>
    (when(r) && pick(f(r)!) != null ? money(pick(f(r)!)!) : BLANK);
  const n1 = (n: number) => `${P1}f1_${String(n).padStart(2, "0")}[0]`;
  const n2 = (n: number) => `${P2}f2_${String(n).padStart(2, "0")}[0]`;
  const name = (r: ReturnLines, i: number) => {
    const c = r.scheduleE?.columns[i];
    return c ? `Rental: ${c.property.address.split(",")[0]}` : BLANK;
  };
  const losses = (r: ReturnLines) => (f(r)?.activities ?? []).map((a, i) => ({ ...a, i })).filter((a) => a.loss > 0);

  add(n1(1), "names", (_r, t) => namesOnReturn(t));
  add(n1(2), "ssn", (_r, t) => (_r.form8582?.required ? t.ssn : BLANK), true);   // "Identifying number" (typed as an amount)
  add(n1(3), "line1a", amt((x) => x.line1a || undefined));
  add(n1(4), "line1b", amt((x) => (x.line1b ? -x.line1b : undefined)));   // printed in parentheses
  add(n1(5), "line1c", () => BLANK);
  add(n1(6), "line1d", amt((x) => x.line1d));
  for (const n of [7, 8, 9, 10]) add(n1(n), `line2.${n}`, () => BLANK);
  add(n1(11), "line3", amt((x) => x.line3));
  add(n1(12), "line4", amt((x) => x.partII?.line4, limited));
  add(n1(13), "line5", amt((x) => x.partII?.line5, limited));
  add(n1(14), "line6", amt((x) => x.partII?.line6, limited));
  add(n1(15), "line7", amt((x) => x.partII?.line7, limited));
  add(n1(16), "line8", amt((x) => x.partII?.line8, limited));
  add(n1(17), "line9", amt((x) => x.partII?.line9, limited));
  add(n1(18), "line10", amt((x) => x.line10, limited));
  add(n1(19), "line11", amt((x) => x.line11, limited));

  // Part IV: rentals with active participation.
  for (let r = 0; r < 5; r++) {
    const base = 20 + 6 * r;
    const row = `${P1}Table_Part4[0].Row${r + 1}[0].`;
    const act = (x: ReturnLines) => (live(x) ? f(x)!.activities[r] : undefined);
    add(`${row}f1_${base}[0]`, `partIV.${r + 1}.name`, (x) => (act(x) ? name(x, r) : BLANK), true);
    add(`${row}f1_${base + 1}[0]`, `partIV.${r + 1}.a`, (x) => (act(x) && act(x)!.net > 0 ? money(act(x)!.net) : BLANK));
    add(`${row}f1_${base + 2}[0]`, `partIV.${r + 1}.b`, (x) => (act(x) && act(x)!.net < 0 ? money(-act(x)!.net) : BLANK));
    add(`${row}f1_${base + 3}[0]`, `partIV.${r + 1}.c`, () => BLANK);
    add(`${row}f1_${base + 4}[0]`, `partIV.${r + 1}.d`, (x) => (act(x) && act(x)!.net > 0 ? money(act(x)!.net) : BLANK));
    add(`${row}f1_${base + 5}[0]`, `partIV.${r + 1}.e`, (x) => (act(x) && act(x)!.net < 0 ? money(-act(x)!.net) : BLANK));
  }
  const tot = `${P1}Table_Part4[0].Row6[0].`;
  add(`${tot}f1_50[0]`, "partIV.total.a", amt((x) => x.line1a || undefined));
  add(`${tot}f1_51[0]`, "partIV.total.b", amt((x) => (x.line1b ? -x.line1b : undefined)));
  add(`${tot}f1_52[0]`, "partIV.total.c", () => BLANK);
  add(`${tot}f1_53[0]`, "partIV.total.d", amt((x) => x.line1a || undefined));
  add(`${tot}f1_54[0]`, "partIV.total.e", amt((x) => (x.line1b ? -x.line1b : undefined)));
  // Part V (other passive activities): not modelled.
  for (let n = 1; n <= 30; n++) {
    const r = Math.floor((n - 1) / 6) + 1;
    add(`${P2}Table_Part5[0].Row${r}[0].${`f2_${String(n).padStart(2, "0")}[0]`}`, `partV.f2_${n}`, () => BLANK, true);
  }
  for (const n of [31, 32, 33, 34, 35]) add(`${P2}Table_Part5[0].Total[0].f2_${n}[0]`, `partV.total.${n}`, () => BLANK);

  // Part VI: special allowance by loss (only when line 9 has an amount).
  const partVI = (x: ReturnLines) => limited(x) && !!f(x)!.partII?.line9;
  for (let r = 0; r < 5; r++) {
    const base = 36 + 6 * r;
    const row = `${P2}Table_Part6[0].Row${r + 1}[0].`;
    const a = (x: ReturnLines) => (partVI(x) ? losses(x)[r] : undefined);
    add(`${row}f2_${base}[0]`, `partVI.${r + 1}.name`, (x) => (a(x) ? name(x, a(x)!.i) : BLANK), true);
    add(`${row}f2_${base + 1}[0]`, `partVI.${r + 1}.form`, (x) => (a(x) ? "Sch E, line 22" : BLANK), true);
    add(`${row}f2_${base + 2}[0]`, `partVI.${r + 1}.a`, (x) => (a(x) ? money(a(x)!.loss) : BLANK));
    add(`${row}f2_${base + 3}[0]`, `partVI.${r + 1}.b`, (x) => (a(x) ? ratio(a(x)!.ratio) : BLANK), true);
    add(`${row}f2_${base + 4}[0]`, `partVI.${r + 1}.c`, (x) => (a(x) ? money(a(x)!.specialAllowance) : BLANK));
    add(`${row}f2_${base + 5}[0]`, `partVI.${r + 1}.d`, (x) => (a(x) ? money(a(x)!.afterAllowance) : BLANK));
  }
  const s = (x: ReturnLines, k: "loss" | "specialAllowance" | "afterAllowance" | "unallowed" | "allowed") =>
    losses(x).reduce((t, a) => t + a[k], 0);
  add(n2(66), "partVI.total.a", (x) => (partVI(x) ? money(s(x, "loss")) : BLANK));
  add(n2(67), "partVI.total.ratio", () => BLANK, true);
  add(n2(68), "partVI.total.c", (x) => (partVI(x) ? money(s(x, "specialAllowance")) : BLANK));
  add(n2(69), "partVI.total.d", (x) => (partVI(x) ? money(s(x, "afterAllowance")) : BLANK));

  // Parts VII / VIII: unallowed and allowed losses (when some loss is unallowed).
  const partVII = (x: ReturnLines) => limited(x) && f(x)!.unallowedCarryforward > 0;
  const afterTotal = (x: ReturnLines) => s(x, "afterAllowance");
  for (let r = 0; r < 5; r++) {
    const a = (x: ReturnLines) => (partVII(x) ? losses(x)[r] : undefined);
    const row7 = `${P2}Table_Part7[0].Row${r + 1}[0].`;
    const b7 = 70 + 5 * r;
    add(`${row7}f2_${b7}[0]`, `partVII.${r + 1}.name`, (x) => (a(x) ? name(x, a(x)!.i) : BLANK), true);
    add(`${row7}f2_${b7 + 1}[0]`, `partVII.${r + 1}.form`, (x) => (a(x) ? "Sch E, line 22" : BLANK), true);
    add(`${row7}f2_${b7 + 2}[0]`, `partVII.${r + 1}.a`, (x) => (a(x) ? money(a(x)!.afterAllowance) : BLANK));
    add(`${row7}f2_${b7 + 3}[0]`, `partVII.${r + 1}.b`, (x) => (a(x) ? ratio(afterTotal(x) ? a(x)!.afterAllowance / afterTotal(x) : 0) : BLANK), true);
    add(`${row7}f2_${b7 + 4}[0]`, `partVII.${r + 1}.c`, (x) => (a(x) ? money(a(x)!.unallowed) : BLANK));
    const row8 = `${P2}Table_PartVIII[0].Row${r + 1}[0].`;
    const b8 = 98 + 5 * r;
    add(`${row8}f2_${b8}[0]`, `partVIII.${r + 1}.name`, (x) => (a(x) ? name(x, a(x)!.i) : BLANK), true);
    add(`${row8}f2_${b8 + 1}[0]`, `partVIII.${r + 1}.form`, (x) => (a(x) ? "Sch E, line 22" : BLANK), true);
    add(`${row8}f2_${b8 + 2}[0]`, `partVIII.${r + 1}.a`, (x) => (a(x) ? money(a(x)!.loss) : BLANK));
    add(`${row8}f2_${b8 + 3}[0]`, `partVIII.${r + 1}.b`, (x) => (a(x) ? money(a(x)!.unallowed) : BLANK));
    add(`${row8}f2_${b8 + 4}[0]`, `partVIII.${r + 1}.c`, (x) => (a(x) ? money(a(x)!.allowed) : BLANK));
  }
  add(n2(95), "partVII.total.a", (x) => (partVII(x) ? money(afterTotal(x)) : BLANK));
  add(n2(96), "partVII.total.ratio", () => BLANK, true);
  add(n2(97), "partVII.total.c", (x) => (partVII(x) ? money(s(x, "unallowed")) : BLANK));
  // Part IX (activities reported on two or more forms): not used.
  for (const n of ["f3_01[0]", "Form1_NotATable[0].Form1_ReadOrder[0].f3_02[0]", "Form1_NotATable[0].f3_03[0]", "Form1_NotATable[0].f3_04[0]", "Form1_NotATable[0].f3_05[0]", "Form1_NotATable[0].f3_06[0]", "Form1_NotATable[0].f3_07[0]", "Form1_NotATable[0].f3_08[0]", "Form2_NotATable[0].Form2_ReadOrder[0].f3_09[0]", "Form2_NotATable[0].f3_10[0]", "Form2_NotATable[0].f3_11[0]", "Form2_NotATable[0].f3_12[0]", "Form2_NotATable[0].f3_13[0]", "Form2_NotATable[0].f3_14[0]", "Form2_NotATable[0].f3_15[0]", "Form3_NotATable[0].Form3_ReadOrder[0].f3_16[0]", "Form3_NotATable[0].f3_17[0]", "Form3_NotATable[0].f3_18[0]", "Form3_NotATable[0].f3_19[0]", "Form3_NotATable[0].f3_20[0]", "Form3_NotATable[0].f3_21[0]", "Form3_NotATable[0].f3_22[0]", "f3_23[0]", "f3_24[0]", "f3_25[0]", "f3_26[0]"]) add(`topmostSubform[0].Page3[0].${n}`, `partIX.${n.replace(/^.*\./, "")}`, () => BLANK, true);
  add(n2(123), "partVIII.total.a", (x) => (partVII(x) ? money(s(x, "loss")) : BLANK));
  add(n2(124), "partVIII.total.b", (x) => (partVII(x) ? money(s(x, "unallowed")) : BLANK));
  add(n2(125), "partVIII.total.c", (x) => (partVII(x) ? money(s(x, "allowed")) : BLANK));
  return build();
}

/**
 * 2023/2024: the same boxes carry the same short field numbers as 2025 (only the
 * table containers and zero-padding differ), so the 2025 map is translated by
 * short name through the generated index (scripts/gen-field-index.ts).
 */
function form8582ForYear(taxYear: number): FieldMap {
  const base = form8582_2025();
  if (taxYear === 2025) return base;
  const index = F8582_INDEX[taxYear];
  const fields: Record<string, MappedField> = {};
  for (const [name2025, entry] of Object.entries(base.fields)) {
    const target = index[shortFieldName(name2025)];
    if (!target) throw new Error(`Form 8582 ${taxYear}: no field for ${name2025}`);
    fields[target] = entry;
  }
  return { ...base, taxYear, fields };
}

export const FORM_8582_MAPS: FieldMap[] = [2023, 2024, 2025].map(form8582ForYear);
