/**
 * Form 4952 field map, 2023–2025. The same layout every year; 2025 renames the fields with two
 * digits (f1_01 …) and puts line 4a in a Line4a_ReadOrder subform. The form is attached when the
 * filer itemizes with investment interest and doesn't meet the form's filing exception
 * (Form4952Lines.required). Line 5 (investment expenses) is $0 for 2018–2025.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { Form4952Lines } from "../tax/investment-interest";
import { BLANK, FieldMap, MappedField, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;

function form4952Map(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const y25 = taxYear >= 2025;
  const name = (n: number) => (y25 ? `f1_${String(n).padStart(2, "0")}` : `f1_${n}`);
  const fields: Record<string, MappedField> = {};
  const f = (t: FakeTaxpayer): Form4952Lines | undefined => computeReturn(source(t)).form4952;
  const add = (n: number, key: string, v: (x: Form4952Lines, t: FakeTaxpayer) => string, text = false) => {
    const sub = y25 && n === 6 ? "Line4a_ReadOrder[0]." : "";
    fields[`${P1}${sub}${name(n)}[0]`] = { key, value: (t) => { const x = f(t); return x ? v(x, source(t)) : BLANK; }, ...(text ? { text: true } : {}) };
  };
  const amount = (n: number) => (n ? money(n) : BLANK);
  add(1, "names", (_x, t) => namesOnReturn(t), true);
  add(2, "ssn", (_x, t) => t.ssn, true);
  add(3, "line1", (x) => money(x.line1));
  add(4, "line2", (x) => amount(x.line2));
  add(5, "line3", (x) => money(x.line3));
  add(6, "line4a", (x) => amount(x.line4a));
  add(7, "line4b", (x) => amount(x.line4b));
  add(8, "line4c", (x) => amount(x.line4c));
  add(9, "line4d", (x) => amount(x.line4d));
  add(10, "line4e", (x) => amount(x.line4e));
  add(11, "line4f", (x) => amount(x.line4f));
  add(12, "line4g", (x) => amount(x.line4g));
  add(13, "line4h", (x) => money(x.line4h));
  add(14, "line5", () => BLANK);
  add(15, "line6", (x) => money(x.line6));
  add(16, "line7", (x) => money(x.line7));
  add(17, "line8", (x) => money(x.line8));
  return { formId: "f4952", taxYear, strict: true, fields };
}

export const INVESTMENT_INTEREST_MAPS: FieldMap[] = [2023, 2024, 2025].map(form4952Map);
