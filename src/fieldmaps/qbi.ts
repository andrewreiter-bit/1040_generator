/**
 * Form 8995-A field map (2023–2025 share field names). Filed when taxable income
 * before the QBI deduction is above the § 199A threshold. Three business columns
 * (A–C); lines 2–15 in column c are f1_(9 + 3·(L−2) + c), Part III lines 17–26
 * are f2_(1 + 3·(L−17) + c). REIT/PTP lines, aggregation and patron boxes stay
 * blank (not modelled).
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { Form8995ABusiness } from "../tax/business";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { personSsn } from "./business";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
type Value = (r: ReturnLines, t: FakeTaxpayer) => string;

function form8995A(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), source(t)), ...(text ? { text } : {}) };
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const a = (r: ReturnLines) => r.form8995A;
  const col = (r: ReturnLines, c: number): Form8995ABusiness | undefined => a(r)?.businesses[c];
  const ROW = ["A", "B", "C"];

  add(`${P1}f1_01[0]`, "names", (r, t) => (a(r) ? namesOnReturn(t) : BLANK));
  add(`${P1}f1_02[0]`, "ssn", (r, t) => (a(r) ? t.ssn : BLANK), true);
  for (let c = 0; c < 3; c++) {
    const row = `${P1}Table_PartI[0].Row${ROW[c]}[0].`;
    const biz = (r: ReturnLines) => col(r, c)?.row;
    add(`${row}f1_${pad(3 + 2 * c)}[0]`, `line1.${ROW[c]}.name`, (r) => biz(r)?.name ?? BLANK, true);
    add(`${row}c1_${1 + 3 * c}[0]`, `line1.${ROW[c]}.sstb`, (r) => checkIf(!!col(r, c)?.sstb));
    add(`${row}c1_${2 + 3 * c}[0]`, `line1.${ROW[c]}.aggregation`, () => OFF);
    add(`${row}f1_${pad(4 + 2 * c)}[0]`, `line1.${ROW[c]}.tin`, (r) => biz(r)?.tin ?? BLANK, true);
    add(`${row}c1_${3 + 3 * c}[0]`, `line1.${ROW[c]}.patron`, () => OFF);

    const L2: Array<[number, (b: Form8995ABusiness) => string]> = [
      [2, (b) => money(b.line2)], [3, (b) => money(b.line3)], [4, (b) => money(b.line4)], [5, (b) => money(b.line5)],
      [6, (b) => money(b.line6)], [7, (b) => money(b.line7)], [8, (b) => money(b.line8)], [9, (b) => money(b.line9)],
      [10, (b) => money(b.line10)], [11, (b) => money(b.line11)], [12, (b) => (b.partIII ? money(b.line12) : BLANK)],
      [13, (b) => money(b.line13)], [14, () => BLANK], [15, (b) => money(b.line15)],
    ];
    for (const [L, v] of L2) {
      add(`${P1}Table_PartII[0].Row${L}[0].f1_${pad(9 + 3 * (L - 2) + c)}[0]`, `line${L}.${ROW[c]}`, (r) => (col(r, c) ? v(col(r, c)!) : BLANK));
    }
    const L3: Array<[number, (p: NonNullable<Form8995ABusiness["partIII"]>) => string]> = [
      [17, (p) => money(p.line17)], [18, (p) => money(p.line18)], [19, (p) => money(p.line19)], [20, (p) => money(p.line20)],
      [21, (p) => money(p.line21)], [22, (p) => money(p.line22)], [23, (p) => money(p.line23)],
      [24, (p) => (p.line24 * 100).toFixed(2)], [25, (p) => money(p.line25)], [26, (p) => money(p.line26)],
    ];
    // Lines 17–19, 25, 26: one box per column. Lines 20–24 (taxable income, threshold, excess,
    // range, percentage — the same for every business) have one input box plus three
    // read-only per-column copies.
    const partIII = (r: ReturnLines) => col(r, c)?.partIII;
    for (const [L, v] of L3) {
      let name: string;
      if (L <= 19) name = `f2_${pad(1 + 3 * (L - 17) + c)}[0]`;
      else if (L >= 25) name = `f2_${pad((L === 25 ? 30 : 33) + c)}[0]`;
      else name = `f2_${pad(11 + 4 * (L - 20) + c)}_RO[0]`;
      add(`${P2}Table_PartIII[0].Row${L}[0].${name}`, `line${L}.${ROW[c]}`, (r) => (partIII(r) ? v(partIII(r)!) : BLANK), L === 24);
    }
  }
  // Part III lines 20–24: the single input box (shared by all columns).
  const anyIII = (r: ReturnLines) => a(r)?.businesses.find((b) => b.partIII)?.partIII;
  const shared: Array<[number, (p: NonNullable<Form8995ABusiness["partIII"]>) => string]> = [
    [20, (p) => money(p.line20)], [21, (p) => money(p.line21)], [22, (p) => money(p.line22)], [23, (p) => money(p.line23)],
    [24, (p) => (p.line24 * 100).toFixed(2)],
  ];
  for (const [L, v] of shared) {
    add(`${P2}Table_PartIII[0].Row${L}[0].Ln${L}[0].f2_${pad(10 + 4 * (L - 20))}[0]`, `line${L}`, (r) => (anyIII(r) ? v(anyIII(r)!) : BLANK), L === 24);
  }
  // Line 16 is a single total; its box sits in the last column.
  add(`${P1}Table_PartII[0].Row16[0].f1_51[0]`, "line16.A", () => BLANK);
  add(`${P1}Table_PartII[0].Row16[0].f1_52[0]`, "line16.B", () => BLANK);
  add(`${P1}Table_PartII[0].Row16[0].f1_53[0]`, "line16", (r) => (a(r) ? money(a(r)!.line16) : BLANK));

  const iv: Array<[number, number, (x: NonNullable<ReturnLines["form8995A"]>) => string]> = [
    [27, 36, (x) => money(x.line27)], [28, 37, () => BLANK], [29, 38, () => BLANK], [30, 39, () => BLANK], [31, 40, () => BLANK],
    [32, 41, (x) => money(x.line32)], [33, 42, (x) => money(x.line33)], [34, 43, (x) => money(x.line34)],
    [35, 44, (x) => money(x.line35)], [36, 45, (x) => money(x.line36)], [37, 46, (x) => money(x.line37)],
    [38, 47, () => BLANK], [39, 48, (x) => money(x.line39)], [40, 49, () => BLANK],
  ];
  for (const [L, n, v] of iv) add(`${P2}f2_${n}[0]`, `line${L}`, (r) => (a(r) ? v(a(r)!) : BLANK));
  return { formId: "f8995a", taxYear, strict: true, fields };
}

/**
 * Schedule A (Form 8995-A), Part I: one column per SSTB (up to three) when taxable
 * income is inside the phase-in range. Lines 5–10 have one input box plus three
 * read-only column copies. Part II (PTPs) stays blank. 2024/2025 share field
 * names. The 2023 PDF (page 4 of the 2023 Form 8995/8995-A package, extracted
 * on its own) has the same layout with every field number from line 1a on two
 * lower and zero-padded (f1_3 → f1_01, f1_18 → f1_16); `f` translates.
 */
function scheduleA8995A(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const T = `${P1}Table_PartI[0].`;
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), source(t)), ...(text ? { text } : {}) };
  };
  const a = (r: ReturnLines) => (r.form8995A?.scheduleANeeded ? r.form8995A : undefined);
  const sstbs = (r: ReturnLines) => a(r)?.businesses.filter((b) => b.sstb) ?? [];
  const COL = ["A", "B", "C"];
  // Field "f1_<n>" by its 2024/2025 number; 2023 renumbers (see above).
  const f = (n: number) => (taxYear === 2023 ? `f1_${String(n < 3 ? n : n - 2).padStart(2, "0")}` : `f1_${n}`);
  add(`${P1}${f(1)}[0]`, "names", (r, t) => (a(r) ? namesOnReturn(t) : BLANK), true);
  add(`${P1}${f(2)}[0]`, "ssn", (r, t) => (a(r) ? t.ssn : BLANK), true);
  for (let c = 0; c < 3; c++) {
    const b = (r: ReturnLines) => sstbs(r)[c];
    const biz = (r: ReturnLines) => b(r)?.row;
    add(`${T}Row1a[0].${f(3 + c)}[0]`, `line1a.${COL[c]}`, (r) => biz(r)?.name ?? BLANK, true);
    add(`${T}Row1b[0].${f(6 + c)}[0]`, `line1b.${COL[c]}`, (r) => biz(r)?.tin ?? BLANK, true);
    add(`${T}Row2[0].${f(9 + c)}[0]`, `line2.${COL[c]}`, (r) => (b(r) ? money(b(r)!.rawQbi) : BLANK));
    add(`${T}Row3[0].${f(12 + c)}[0]`, `line3.${COL[c]}`, (r) => (b(r) ? money(b(r)!.rawW2) : BLANK));
    add(`${T}Row4[0].${f(15 + c)}[0]`, `line4.${COL[c]}`, (r) => (b(r) ? money(b(r)!.rawUbia) : BLANK));
    const shared = (r: ReturnLines, L: number) => {
      const x = a(r)!; const over = x.taxableIncomeBeforeQbi - x.threshold;
      return [money(x.taxableIncomeBeforeQbi), money(x.threshold), money(over), money(x.range), (over / x.range).toFixed(4),
        ((1 - over / x.range) * 100).toFixed(2)][L - 5];
    };
    for (let L = 5; L <= 10; L++) {
      add(`${T}Row${L}[0].${f(19 + 4 * (L - 5) + c)}_RO[0]`, `line${L}.${COL[c]}`, (r) => (b(r) ? shared(r, L) : BLANK), L >= 9);
    }
    add(`${T}Row11[0].${f(42 + c)}[0]`, `line11.${COL[c]}`, (r) => (b(r) ? money(b(r)!.qbi) : BLANK));
    add(`${T}Row12[0].${f(45 + c)}[0]`, `line12.${COL[c]}`, (r) => (b(r) ? money(b(r)!.line4) : BLANK));
    add(`${T}Row13[0].${f(48 + c)}[0]`, `line13.${COL[c]}`, (r) => (b(r) ? money(b(r)!.line7) : BLANK));
  }
  for (let L = 5; L <= 10; L++) {
    add(`${T}Row${L}[0].Ln${L}[0].${f(14 + 4 * (L - 4))}[0]`, `line${L}`, (r) => {
      if (!a(r)) return BLANK;
      const x = a(r)!; const over = x.taxableIncomeBeforeQbi - x.threshold;
      return [money(x.taxableIncomeBeforeQbi), money(x.threshold), money(over), money(x.range), (over / x.range).toFixed(4),
        ((1 - over / x.range) * 100).toFixed(2)][L - 5];
    }, L >= 9);
  }
  // Part II (publicly traded partnerships): not modelled; blank, including its formula lines.
  const T2 = `${P1}Table_PartII[0].`;
  for (let n = 51; n <= 59; n++) add(`${T2}Row${14 + Math.floor((n - 51) / 3)}[0].${f(n)}[0]`, `partII.f1_${n}`, () => BLANK, true);
  for (let n = 60; n <= 67; n++) add(`${P1}${f(n)}[0]`, `partII.line${n - 43}`, () => BLANK, true);
  return { formId: "f8995aa", taxYear, strict: true, fields };
}

/**
 * Schedule C (Form 8995-A) — loss netting and carryforward (Rev. December 2022,
 * used for every year). One row per business (up to three, same order as Form
 * 8995-A); amounts the form puts in parentheses are entered as positive numbers.
 */
function scheduleC8995A(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), source(t)), ...(text ? { text } : {}) };
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const c8 = (r: ReturnLines) => (r.form8995A?.scheduleC ? r.form8995A : undefined);
  add(`${P1}f1_01[0]`, "names", (r, t) => (c8(r) ? namesOnReturn(t) : BLANK));
  add(`${P1}f1_02[0]`, "ssn", (r, t) => (c8(r) ? t.ssn : BLANK), true);
  for (let i = 0; i < 3; i++) {
    const b = (r: ReturnLines) => c8(r)?.businesses[i];
    const row = `${P1}Table_Line1[0].Row${i + 1}[0].`;
    const n = 3 + 4 * i;
    add(`${row}f1_${pad(n)}[0]`, `line1.${i + 1}.name`, (r) => b(r)?.row.name ?? BLANK, true);
    add(`${row}f1_${pad(n + 1)}[0]`, `line1.${i + 1}.a`, (r) => (b(r) ? money(b(r)!.qbi) : BLANK));
    add(`${row}f1_${pad(n + 2)}[0]`, `line1.${i + 1}.b`, (r) => (b(r)?.lossNetting ? money(-b(r)!.lossNetting) : BLANK));
    add(`${row}f1_${pad(n + 3)}[0]`, `line1.${i + 1}.c`, (r) => (b(r) ? money(b(r)!.line2) : BLANK));
  }
  const s = (r: ReturnLines) => c8(r)!.scheduleC!;
  add(`${P1}f1_15[0]`, "line2", (r) => (c8(r) && s(r).line2 ? money(-s(r).line2) : BLANK));
  add(`${P1}f1_16[0]`, "line3", (r) => (c8(r) ? money(-s(r).line3) : BLANK));
  add(`${P1}f1_17[0]`, "line4", (r) => (c8(r) ? money(s(r).line4) : BLANK));
  add(`${P1}f1_18[0]`, "line5", (r) => (c8(r) ? money(-s(r).line5) : BLANK));
  add(`${P1}f1_19[0]`, "line6", (r) => (c8(r) && s(r).line6 ? money(-s(r).line6) : BLANK));
  return { formId: "f8995ac", taxYear, strict: true, fields };
}

/**
 * Years whose folder holds that year's own Form 8995-A. The 2023/2024 PDFs share
 * the 2025 field names; add their years once they're installed in forms_<year>/.
 */
const FORM_8995A_YEARS = [2023, 2024, 2025];
export const QBI_MAPS: FieldMap[] = [
  ...FORM_8995A_YEARS.map(form8995A),
  ...[2023, 2024, 2025].map(scheduleA8995A),
  ...[2023, 2024, 2025].map(scheduleC8995A),
];
