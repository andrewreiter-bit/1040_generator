/**
 * Form 2441 field map, 2023–2025. 2023/2024 share a layout; 2025 merges each provider's
 * two address lines into one field, which shifts every later page 1 field by 3:
 *
 *   Part I row k (1–3): name, address (2023/24: two fields), SSN/EIN, household employee
 *     Yes/No (c1_4–c1_6 [0]/[1]), amount paid
 *   Part II line 2 row k: first name, last name, SSN, "over 12 and disabled" box, expenses
 *   Lines 3–11: f1_30–f1_40 (2023/24), f1_27–f1_37 (2025). Line 8's box follows a printed
 *     "X ." so it takes the two digits (35 … 20).
 *
 * Part III (employer-provided dependent care benefits) isn't modelled; page 2 is blank,
 * including its formula lines.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { Form2441Lines } from "../tax/dependent-care";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;

function form2441Map(taxYear: number): FieldMap {
  const y25 = taxYear >= 2025;
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const fields: Record<string, MappedField> = {};
  const f = (t: FakeTaxpayer) => computeReturn(source(t)).form2441;
  const add = (name: string, key: string, value: (x: Form2441Lines, t: FakeTaxpayer) => string, opts: { text?: boolean; box?: boolean } = {}) => {
    fields[name] = {
      key,
      value: (t) => { const x = f(t); return x ? value(x, source(t)) : opts.box ? OFF : BLANK; },
      ...(opts.text ? { text: true } : {}),
    };
  };
  const fn = (n: number) => `f1_${n}[0]`;
  add(`${P1}${fn(1)}`, "names", (_x, t) => namesOnReturn(t), { text: true });
  add(`${P1}${fn(2)}`, "ssn", (_x, t) => t.ssn, { text: true });
  add(`${P1}c1_1[0]`, "lineA", (x) => checkIf(x.lineA), { box: true });
  add(`${P1}c1_2[0]`, "lineB", () => OFF, { box: true });
  add(`${P1}PartI[0].c1_3[0]`, "moreThan3Providers", (_x, t) => checkIf((t.dependentCare?.providers.length ?? 0) > 3), { box: true });

  // Part I: care providers.
  const per = y25 ? 4 : 5;
  for (let k = 0; k < 3; k++) {
    const row = `${P1}PartITable[0].BodyRow${k + 1}[0].`;
    const base = 3 + per * k;
    const p = (t: FakeTaxpayer) => t.dependentCare?.providers[k];
    add(`${row}${fn(base)}`, `provider${k + 1}.name`, (_x, t) => p(t)?.name ?? BLANK, { text: true });
    if (y25) {
      add(`${row}ColB[0].${fn(base + 1)}`, `provider${k + 1}.address`, (_x, t) => (p(t) ? `${p(t)!.street}\n${p(t)!.city}` : BLANK), { text: true });
    } else {
      add(`${row}ColB[0].${fn(base + 1)}`, `provider${k + 1}.street`, (_x, t) => p(t)?.street ?? BLANK, { text: true });
      add(`${row}ColB[0].${fn(base + 2)}`, `provider${k + 1}.city`, (_x, t) => p(t)?.city ?? BLANK, { text: true });
    }
    const tin = y25 ? base + 2 : base + 3;
    add(`${row}${fn(tin)}`, `provider${k + 1}.tin`, (_x, t) => p(t)?.tin ?? BLANK, { text: true });
    add(`${row}ColD[0].c1_${4 + k}[0]`, `provider${k + 1}.employee.yes`, (_x, t) => checkIf(!!p(t)?.householdEmployee), { box: true });
    add(`${row}ColD[0].c1_${4 + k}[1]`, `provider${k + 1}.employee.no`, (_x, t) => (p(t) ? checkIf(!p(t)!.householdEmployee) : OFF), { box: true });
    add(`${row}${fn(tin + 1)}`, `provider${k + 1}.amount`, (_x, t) => (p(t) ? money(p(t)!.amountPaid) : BLANK));
  }

  // Part II line 2: qualifying persons.
  add(`${P1}c1_7[0]`, "moreThan3Persons", (x) => checkIf(x.persons.length > 3), { box: true });
  const l2 = y25 ? 15 : 18;
  for (let k = 0; k < 3; k++) {
    const row = `${P1}Table_Line2[0].Row${k + 1}[0].`;
    const n = l2 + 4 * k;
    const person = (x: Form2441Lines) => x.persons[k];
    const dep = (x: Form2441Lines, t: FakeTaxpayer) => (person(x) ? t.dependents[person(x)!.dependentIndex] : undefined);
    add(`${row}${fn(n)}`, `line2.${k + 1}.first`, (x, t) => dep(x, t)?.firstName ?? BLANK, { text: true });
    add(`${row}${fn(n + 1)}`, `line2.${k + 1}.last`, (x, t) => dep(x, t)?.lastName ?? BLANK, { text: true });
    add(`${row}${fn(n + 2)}`, `line2.${k + 1}.ssn`, (x, t) => dep(x, t)?.ssn ?? BLANK, { text: true });
    add(`${row}c1_${8 + k}[0]`, `line2.${k + 1}.over12Disabled`, (x, t) => checkIf(!!dep(x, t) && t.taxYear - dep(x, t)!.birthYear >= 13), { box: true });
    add(`${row}${fn(n + 3)}`, `line2.${k + 1}.expenses`, (x) => (person(x) ? money(person(x)!.amount) : BLANK));
  }

  // Lines 3–11.
  const l3 = y25 ? 27 : 30;
  const lines: Array<[string, (x: Form2441Lines) => string, boolean?]> = [
    ["line3", (x) => money(x.line3)], ["line4", (x) => money(x.line4)], ["line5", (x) => money(x.line5)],
    ["line6", (x) => money(x.line6)], ["line7", (x) => money(x.line7)],
    ["line8", (x) => String(Math.round(x.line8 * 100)), true],
    ["line9a", (x) => money(x.line9a)], ["line9b", (x) => money(x.line9b)], ["line9c", (x) => money(x.line9c)],
    ["line10", (x) => money(x.line10)], ["line11", (x) => money(x.line11)],
  ];
  lines.forEach(([key, v, text], i) => add(`${P1}${fn(l3 + i)}`, key, v, { text: !!text }));

  // Part III (page 2): not modelled.
  for (let n = 1; n <= 20; n++) {
    add(`${P2}${n === 5 ? "Line16_ReadOrder[0]." : ""}f2_${n}[0]`, `partIII.f2_${n}`, () => BLANK, { text: true });
  }
  add(`${P2}c2_1[0]`, "partIII.c2_1.yes", () => OFF, { box: true });
  add(`${P2}c2_1[1]`, "partIII.c2_1.no", () => OFF, { box: true });
  return { formId: "f2441", taxYear, strict: true, fields };
}

export const FORM_2441_MAPS: FieldMap[] = [2023, 2024, 2025].map(form2441Map);
