/**
 * Form 8880 (Saver's credit) and the W-2 box 12 / 13 fields, 2023–2025.
 *
 * Form 8880: 2023–2025 share field names. Lines 1–6 are two-column rows (BodyRow1–6:
 * f1_3/f1_4 … f1_13/f1_14, (a) you / (b) spouse), then f1_15 line 7 … f1_20 line 12;
 * line 9's box follows a printed "0 ." so it takes the digit only. Page 2 holds the
 * Credit Limit Worksheet (f2_1–f2_3). Column (b) is filled only on a joint return.
 *
 * W-2: a non-strict map (every other box still comes from the resolver) for box 12a–d
 * (code and amount) and the box 13 checkboxes on every copy. Copy A puts box 12 under
 * Line12_ReadOrder with f1_ names; the other copies under Box12_ReadOrder with f2_.
 * "Retirement plan" is checked when the W-2 shows an elective deferral.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { Form8880Lines } from "../tax/savers-credit";
import { coveredByPlan } from "../tax/ira";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;

function form8880Map(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const T = `${P1}Table_Ln1-6[0].`;
  const W = "topmostSubform[0].Page2[0].Col2[0].Pg2Worksheet[0].";
  const fields: Record<string, MappedField> = {};
  const f = (r: ReturnLines) => r.form8880;
  const add = (name: string, key: string, value: (x: Form8880Lines, t: FakeTaxpayer) => string, text = false) => {
    fields[name] = {
      key,
      value: (t) => { const x = f(computeReturn(source(t))); return x ? value(x, source(t)) : BLANK; },
      ...(text ? { text } : {}),
    };
  };
  add(`${P1}f1_1[0]`, "names", (_x, t) => namesOnReturn(t), true);
  add(`${P1}f1_2[0]`, "ssn", (_x, t) => t.ssn, true);
  const rows: Array<[number, keyof Form8880Lines]> = [[1, "line1"], [2, "line2"], [3, "line3"], [4, "line4"], [5, "line5"], [6, "line6"]];
  for (const [row, line] of rows) {
    const n = 3 + (row - 1) * 2;
    add(`${T}BodyRow${row}[0].f1_${n}[0]`, `${line}.a`, (x) => money((x[line] as [number, number])[0]));
    add(`${T}BodyRow${row}[0].f1_${n + 1}[0]`, `${line}.b`, (x, t) => (t.filingStatus === "MFJ" ? money((x[line] as [number, number])[1]) : BLANK));
  }
  add(`${P1}f1_15[0]`, "line7", (x) => money(x.line7));
  add(`${P1}f1_16[0]`, "line8", (x) => money(x.line8));
  add(`${P1}f1_17[0]`, "line9", (x) => String(Math.round(x.line9 * 10)), true);
  add(`${P1}f1_18[0]`, "line10", (x) => money(x.line10));
  add(`${P1}f1_19[0]`, "line11", (x) => money(x.line11));
  add(`${P1}f1_20[0]`, "line12", (x) => money(x.line12));
  // Credit Limit Worksheet: 1 = Form 1040 line 18; 2 = Schedule 3 lines 1–3, 6d, 6l (none); 3 = line 11.
  add(`${W}f2_1[0]`, "worksheet.line1", (x) => money(x.line11));
  add(`${W}f2_2[0]`, "worksheet.line2", () => BLANK);
  add(`${W}f2_3[0]`, "worksheet.line3", (x) => money(x.line11));
  return { formId: "f8880", taxYear, strict: true, fields };
}

function w2Map(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const copies: Array<[string, number, string]> = [
    ["CopyA", 1, "Line12_ReadOrder"], ["Copy1", 2, "Box12_ReadOrder"], ["CopyB", 2, "Box12_ReadOrder"],
    ["CopyC", 2, "Box12_ReadOrder"], ["Copy2", 2, "Box12_ReadOrder"], ["CopyD", 2, "Box12_ReadOrder"],
  ];
  // A W-2 document's view carries just its own W-2.
  const entries = (t: FakeTaxpayer) => t.w2Records[0]?.box12 ?? [];
  for (const [copy, p, box12] of copies) {
    const col = `topmostSubform[0].${copy}[0].Col_Right[0].`;
    for (let k = 0; k < 4; k++) {
      const letter = "abcd"[k];
      fields[`${col}${box12}[0].f${p}_${20 + 2 * k}[0]`] = { key: `${copy}.box12${letter}.code`, text: true, value: (t) => entries(t)[k]?.code ?? BLANK };
      fields[`${col}${box12}[0].f${p}_${21 + 2 * k}[0]`] = { key: `${copy}.box12${letter}.amount`, value: (t) => (entries(t)[k] ? money(entries(t)[k].amount) : BLANK) };
    }
    fields[`${col}Statutory_ReadOrder[0].c${p}_2[0]`] = { key: `${copy}.box13.statutory`, value: () => OFF };
    fields[`${col}Retirement_ReadOrder[0].c${p}_3[0]`] = {
      key: `${copy}.box13.retirementPlan`, value: (t) => checkIf(!!t.w2Records[0] && coveredByPlan(t.w2Records[0])),
    };
    fields[`${col}c${p}_4[0]`] = { key: `${copy}.box13.thirdPartySickPay`, value: () => OFF };
  }
  return { formId: "fw2", taxYear, strict: false, fields };
}

export const SAVERS_CREDIT_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [form8880Map(y), w2Map(y)]);
