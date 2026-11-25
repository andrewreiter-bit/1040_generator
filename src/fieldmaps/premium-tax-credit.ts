/**
 * Form 8962 and Form 1095-A field maps, 2023–2025 (field names are the same every year).
 *
 * Form 8962: Part I lines 1–8b, line 9 "No" and line 10 "Yes" (one full-year policy → the
 * annual calculation on line 11), lines 24–29. The monthly rows (12–23), Part IV
 * (allocation) and Part V (year of marriage) are blank, including their formula cells.
 * Form 1095-A: one per policy. Part II lists everyone on the return as covered all year;
 * Part III shows a twelfth of each annual amount per month, with December absorbing the
 * rounding so line 33 equals the annual totals.
 */
import { FakeTaxpayer, Marketplace1095A } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { Form8962Lines } from "../tax/premium-tax-credit";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, CHECK, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const P1 = "topmostSubform[0].Page1[0].";

function form8962Map(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, v: (x: Form8962Lines, t: FakeTaxpayer) => string, opts: { text?: boolean; box?: boolean } = {}) => {
    fields[name] = {
      key,
      value: (t) => { const x = computeReturn(source(t)).form8962; return x ? v(x, source(t)) : opts.box ? OFF : BLANK; },
      ...(opts.text ? { text: true } : {}),
    };
  };
  add(`${P1}f1_1[0]`, "names", (_x, t) => namesOnReturn(t), { text: true });
  add(`${P1}f1_2[0]`, "ssn", (_x, t) => t.ssn, { text: true });
  add(`${P1}c1_1[0]`, "lineA.mfsException", () => OFF, { box: true });
  add(`${P1}f1_3[0]`, "line1", (x) => String(x.line1), { text: true });
  add(`${P1}f1_4[0]`, "line2a", (x) => money(x.line2a));
  add(`${P1}f1_5[0]`, "line2b", (x) => (x.line2b ? money(x.line2b) : BLANK));
  add(`${P1}f1_6[0]`, "line3", (x) => money(x.line3));
  (["alaska", "hawaii", "contiguous"] as const).forEach((tbl, i) =>
    add(`${P1}c1_2[${i}]`, `line4.${tbl}`, (x) => checkIf(x.table === tbl), { box: true }));
  add(`${P1}f1_7[0]`, "line4", (x) => money(x.line4));
  add(`${P1}f1_8[0]`, "line5", (x) => String(x.line5), { text: true });
  add(`${P1}f1_9[0]`, "line7", (x) => x.line7.toFixed(4), { text: true });
  add(`${P1}f1_10[0]`, "line8a", (x) => money(x.line8a));
  add(`${P1}f1_11[0]`, "line8b", (x) => money(x.line8b));
  add(`${P1}c1_4[0]`, "line9.yes", () => OFF, { box: true });
  add(`${P1}c1_4[1]`, "line9.no", () => CHECK, { box: true });
  add(`${P1}c1_5[0]`, "line10.yes", () => CHECK, { box: true });
  add(`${P1}c1_5[1]`, "line10.no", () => OFF, { box: true });
  (["a", "b", "c", "d", "e", "f"] as const).forEach((col, i) =>
    add(`${P1}Part2Table1[0].BodyRow1[0].f1_${13 + i}[0]`, `line11.${col}`, (x) => money(x.line11[col])));
  // Lines 12–23 (monthly): blank.
  for (let row = 1; row <= 12; row++) {
    for (let k = 0; k < 6; k++) {
      const n = 19 + (row - 1) * 6 + k;
      add(`${P1}Part2Table2[0].BodyRow${row}[0].f1_${n}[0]`, `line${11 + row}.${"abcdef"[k]}`, () => BLANK, { text: true });
    }
  }
  add(`${P1}f1_91[0]`, "line24", (x) => money(x.line24));
  add(`${P1}f1_92[0]`, "line25", (x) => money(x.line25));
  add(`${P1}f1_93[0]`, "line26", (x) => (x.line26 === undefined ? BLANK : money(x.line26)));
  add(`${P1}f1_94[0]`, "line27", (x) => (x.line27 ? money(x.line27) : BLANK));
  add(`${P1}f1_95[0]`, "line28", (x) => (x.line27 && x.line28 !== undefined ? money(x.line28) : BLANK));
  add(`${P1}f1_96[0]`, "line29", (x) => (x.line27 ? money(x.line29) : BLANK));
  return { formId: "f8962", taxYear, strict: true, fields };
}

/** Month m (0–11) of an annual amount: a twelfth, with December taking the rounding. */
export function monthly(annual: number, m: number): number {
  const each = Math.round((annual / 12) * 100) / 100;
  return m < 11 ? each : Math.round((annual - each * 11) * 100) / 100;
}

function form1095AMap(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const policy = (t: FakeTaxpayer): Marketplace1095A | undefined => source(t).marketplace1095As?.[t.document?.policyIndex ?? 0];
  const add = (name: string, key: string, v: (p: Marketplace1095A, t: FakeTaxpayer) => string, opts: { text?: boolean; box?: boolean } = {}) => {
    fields[name] = { key, value: (t) => { const p = policy(t); return p ? v(p, source(t)) : opts.box ? OFF : BLANK; }, ...(opts.text ? { text: true } : {}) };
  };
  const covered = (t: FakeTaxpayer) => [
    { name: `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " "), ssn: t.ssn, dob: t.dateOfBirth },
    ...(t.filingStatus === "MFJ" ? [{ name: `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}`, ssn: t.spouseSSN ?? "", dob: t.spouseDateOfBirth ?? "" }] : []),
    ...t.dependents.filter((d) => d.birthYear <= t.taxYear).map((d) => ({ name: `${d.firstName} ${d.lastName}`, ssn: d.ssn, dob: "" })),
  ];
  const H = `${P1}Pg1Header[0].`;
  add(`${H}c1_1[0]`, "void", () => OFF, { box: true });
  add(`${H}c1_1[1]`, "corrected", () => OFF, { box: true });
  add(`${P1}f1_1[0]`, "line1", (p) => p.marketplaceId, { text: true });
  add(`${P1}f1_2[0]`, "line2", (p) => p.policyNumber, { text: true });
  add(`${P1}f1_3[0]`, "line3", (p) => p.issuer, { text: true });
  add(`${P1}f1_4[0]`, "line4", (_p, t) => `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " "), { text: true });
  add(`${P1}f1_5[0]`, "line5", (_p, t) => t.ssn, { text: true });
  add(`${P1}f1_6[0]`, "line6", (_p, t) => t.dateOfBirth, { text: true });
  add(`${P1}f1_7[0]`, "line7", (_p, t) => (t.filingStatus === "MFJ" ? `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}` : BLANK), { text: true });
  add(`${P1}f1_8[0]`, "line8", (_p, t) => (t.filingStatus === "MFJ" ? t.spouseSSN ?? BLANK : BLANK), { text: true });
  add(`${P1}f1_9[0]`, "line9", (_p, t) => (t.filingStatus === "MFJ" ? t.spouseDateOfBirth ?? BLANK : BLANK), { text: true });
  add(`${P1}f1_10[0]`, "line10", (_p, t) => `01/01/${t.taxYear}`, { text: true });
  add(`${P1}f1_11[0]`, "line11", (_p, t) => `12/31/${t.taxYear}`, { text: true });
  add(`${P1}f1_12[0]`, "line12", (_p, t) => [t.streetAddress, t.aptNumber].filter(Boolean).join(" "), { text: true });
  add(`${P1}f1_13[0]`, "line13", (_p, t) => t.city, { text: true });
  add(`${P1}f1_14[0]`, "line14", (_p, t) => t.state, { text: true });
  add(`${P1}f1_15[0]`, "line15", (_p, t) => `US ${t.zipCode}`, { text: true });
  for (let row = 0; row < 5; row++) {
    const R = `${P1}Table_PartII[0].Row${16 + row}[0].`;
    const n = 16 + row * 5;
    const who = (t: FakeTaxpayer) => covered(t)[row];
    add(`${R}f1_${n}[0]`, `line${16 + row}.a`, (_p, t) => who(t)?.name ?? BLANK, { text: true });
    add(`${R}f1_${n + 1}[0]`, `line${16 + row}.b`, (_p, t) => who(t)?.ssn ?? BLANK, { text: true });
    add(`${R}f1_${n + 2}[0]`, `line${16 + row}.c`, (_p, t) => (who(t) && !who(t)!.ssn ? who(t)!.dob : BLANK), { text: true });
    add(`${R}f1_${n + 3}[0]`, `line${16 + row}.d`, (_p, t) => (who(t) ? `01/01/${t.taxYear}` : BLANK), { text: true });
    add(`${R}f1_${n + 4}[0]`, `line${16 + row}.e`, (_p, t) => (who(t) ? `12/31/${t.taxYear}` : BLANK), { text: true });
  }
  const cols: Array<keyof Marketplace1095A> = ["annualPremium", "annualSlcsp", "annualAdvancePayments"];
  for (let m = 0; m < 12; m++) {
    cols.forEach((c, k) => add(`${P1}Table_PartIII[0].Row${21 + m}[0].f1_${41 + m * 3 + k}[0]`, `line${21 + m}.${"ABC"[k]}`, (p) => money(monthly(p[c] as number, m))));
  }
  cols.forEach((c, k) => add(`${P1}Table_PartIII[0].Row33[0].f1_${77 + k}[0]`, `line33.${"ABC"[k]}`, (p) => money(p[c] as number)));
  return { formId: "f1095a", taxYear, strict: true, fields };
}

export const PREMIUM_TAX_CREDIT_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [form8962Map(y), form1095AMap(y)]);
