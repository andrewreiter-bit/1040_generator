/**
 * 2025 Form 8839 (Qualified Adoption Expenses): Part I (up to three children) and Part II (the
 * adoption credit, three child columns). Part III (employer-provided benefits) isn't modelled and
 * stays blank. Fields were matched to lines by position on the 2025 PDF.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const P1 = "topmostSubform[0].Page1[0].";
const r = (t: FakeTaxpayer): ReturnLines => computeReturn(t.document?.source ?? t);
const src = (t: FakeTaxpayer) => t.document?.source ?? t;

function form8839Map(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: (t: FakeTaxpayer) => string, text = false) => {
    fields[`${P1}${name}`] = { key, value, ...(text ? { text: true } : {}) };
  };
  const f = (t: FakeTaxpayer) => r(t).form8839;
  const child = (t: FakeTaxpayer, i: number) => f(t)?.children[i];
  const dep = (t: FakeTaxpayer, i: number) => { const c = child(t, i); return c ? src(t).dependents[c.dependentIndex] : undefined; };
  const adoption = (t: FakeTaxpayer, i: number) => src(t).adoptions?.[i];
  add("f1_1[0]", "names", (t) => namesOnReturn(src(t)), true);
  add("f1_2[0]", "ssn", (t) => src(t).ssn, true);
  // Part I, line 1: (a) name, (b) year of birth, (c) born before 2008 and disabled, (d) special needs,
  // (e) foreign child, (f) identifying number, (g) adoption final in 2025 or earlier.
  for (let i = 0; i < 3; i++) {
    const row = `Table_PartI[0].BodyRow_Child${i + 1}[0].`;
    const fb = 3 + i * 4, cb = 1 + i * 4;
    add(`${row}f1_${fb}[0]`, `child${i + 1}.firstName`, (t) => dep(t, i)?.firstName ?? BLANK, true);
    add(`${row}f1_${fb + 1}[0]`, `child${i + 1}.lastName`, (t) => dep(t, i)?.lastName ?? BLANK, true);
    add(`${row}f1_${fb + 2}[0]`, `child${i + 1}.birthYear`, (t) => (dep(t, i) ? String(dep(t, i)!.birthYear) : BLANK), true);
    add(`${row}c1_${cb}[0]`, `child${i + 1}.disabled`, (t) => checkIf(!!dep(t, i)?.disabled && dep(t, i)!.birthYear < 2008));
    add(`${row}c1_${cb + 1}[0]`, `child${i + 1}.specialNeeds`, (t) => checkIf(!!adoption(t, i)?.specialNeeds));
    add(`${row}c1_${cb + 2}[0]`, `child${i + 1}.foreign`, () => OFF);
    add(`${row}f1_${fb + 3}[0]`, `child${i + 1}.ssn`, (t) => dep(t, i)?.ssn ?? BLANK, true);
    add(`${row}c1_${cb + 3}[0]`, `child${i + 1}.final`, (t) => checkIf(!!adoption(t, i) && adoption(t, i)!.finalYear <= taxYear));
  }
  // Part II: per-child columns (x ≈ 310, 367, 425) for lines 2–6, 10, 11a, 11b.
  const col = (first: number, key: string, pick: (c: NonNullable<ReturnType<typeof child>>) => number) => {
    // Line 2's fields sit in Child1–Child3 subforms; the rest are plain f1_NN.
    for (let i = 0; i < 3; i++) add(first === 15 ? `Child${i + 1}[0].f1_${15 + i}[0]` : `f1_${first + i}[0]`,
      `line${key}.child${i + 1}`, (t) => { const c = child(t, i); return c ? money(pick(c)) : BLANK; });
  };
  col(15, "2", (c) => c.line2);
  // Line 3: one Yes/No pair for the return.
  add("Line3_ReadOrder[0].Line3Checkboxes_ReadOrder[0].c1_13[0]", "line3.no", (t) => checkIf(!!f(t)?.children.length && f(t)!.children.every((c) => c.line3 === 0)));
  add("Line3_ReadOrder[0].Line3Checkboxes_ReadOrder[0].c1_13[1]", "line3.yes", (t) => checkIf(!!f(t)?.children.some((c) => c.line3 > 0)));
  col(18, "3", (c) => c.line3);
  col(21, "4", (c) => c.line4);
  col(24, "5", (c) => c.line5);
  col(27, "6", (c) => c.line6);
  add("f1_30[0]", "line7", (t) => (f(t)?.children.length ? money(f(t)!.line7) : BLANK));
  add("Line8_ReadOrder[0].c1_14[0]", "line8.no", (t) => checkIf(!!f(t)?.children.length && f(t)!.line8 === undefined));
  add("Line8_ReadOrder[0].c1_14[1]", "line8.yes", (t) => checkIf(f(t)?.line8 !== undefined));
  add("f1_31[0]", "line8", (t) => (f(t)?.line8 !== undefined ? money(f(t)!.line8!) : BLANK));
  // Line 9: a whole-number digit and three decimals.
  add("f1_32[0]", "line9.whole", (t) => (f(t)?.line9 !== undefined ? String(Math.floor(f(t)!.line9!)) : BLANK), true);
  add("f1_33[0]", "line9.decimal", (t) => (f(t)?.line9 !== undefined ? (f(t)!.line9! % 1).toFixed(3).slice(2) : BLANK), true);
  col(34, "10", (c) => c.line10);
  col(37, "11a", (c) => c.line11a);
  col(40, "11b", (c) => c.line11b);
  const one = (name: string, key: string, pick: (x: NonNullable<ReturnType<typeof f>>) => number) => add(name, key, (t) => (f(t) ? money(pick(f(t)!)) : BLANK));
  one("f1_43[0]", "line11c", (x) => x.line11c);
  one("f1_44[0]", "line12", (x) => x.line12);
  one("f1_45[0]", "line13", (x) => x.line13);
  one("f1_46[0]", "line14", (x) => x.line14);
  add("f1_47[0]", "line15", (t) => (f(t)?.line15 ? money(f(t)!.line15) : BLANK));
  one("f1_48[0]", "line16", (x) => x.line16);
  one("f1_49[0]", "line17", (x) => x.line17);
  one("f1_50[0]", "line18", (x) => x.line18);
  return { formId: "f8839", taxYear, strict: true, fields };
}

export const ADOPTION_MAPS: FieldMap[] = [form8839Map(2025)];
