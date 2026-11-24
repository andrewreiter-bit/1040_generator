/**
 * Schedule 8812 (child tax credit / ACTC) and Schedule EIC field maps, 2023–2025.
 *
 * Schedule 8812: page 1 (Part I) is identical in all three years. Page 2 changes
 * in 2025: 2023/2024 open Part II-A with a line-15 "don't claim ACTC" checkbox
 * (c2_1) and number 16a…27 as f2_1…f2_15; 2025 makes line 15 "reserved" (f2_1)
 * and numbers 16a…27 as f2_2…f2_16. Yes/No pairs are [0] = No, [1] = Yes.
 *
 * Schedule EIC: three child columns; 2025 zero-pads the field numbers and moves
 * the 4a/4b checkboxes from c1_2…c1_7 to c1_1…c1_6 (2023/2024 have an extra
 * c1_1 box at the top). Lines 4a/4b are answered only for a child old enough to
 * need them (born in or before tax year − 19).
 */
import { Dependent, FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn, ReturnLines } from "../tax/compute";
import { ageAtYearEnd, eicChildren, namesOnReturn } from "../tax/household";
import { yearConstants } from "../config/tax-year";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
type Value = (r: ReturnLines, t: FakeTaxpayer) => string;

function builder(formId: string, taxYear: number) {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: Value, text = false) => {
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), source(t)), ...(text ? { text } : {}) };
  };
  return { add, build: (): FieldMap => ({ formId, taxYear, strict: true, fields }) };
}

// ── Schedule 8812 ─────────────────────────────────────────────────────────────

function schedule8812(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const y25 = taxYear >= 2025;
  const p2 = (n: number) => `${P2}f2_${y25 ? n + 1 : n}[0]`;   // 16a = f2_1 (2023/24) / f2_2 (2025)
  const { add, build } = builder("f1040s8", taxYear);
  const s = (r: ReturnLines) => r.schedule8812;
  const ii = (r: ReturnLines) => r.schedule8812.partII;
  const cap = yearConstants(taxYear).additionalChildTaxCreditPerChild;
  const line10 = (r: ReturnLines) => (s(r).reduction / 0.05);
  const goesOn = (r: ReturnLines) => s(r).maxCredit > s(r).reduction;   // line 12 "Yes"
  const partII = (r: ReturnLines) => goesOn(r) && ii(r).line16a > 0;     // 16a not zero

  add(`${P1}f1_1[0]`, "names", (_r, t) => namesOnReturn(t));
  add(`${P1}f1_2[0]`, "ssn", (_r, t) => t.ssn);
  add(`${P1}f1_3[0]`, "line1", (r) => money(r.agi));
  for (const n of [4, 5, 6, 7]) add(`${P1}f1_${n}[0]`, `line2.f1_${n}`, () => BLANK);   // 2a–2d: none
  add(`${P1}f1_8[0]`, "line3", (r) => money(r.agi));
  add(`${P1}f1_9[0]`, "line4", (r) => String(s(r).ctcChildren), true);
  add(`${P1}f1_10[0]`, "line5", (r) => money(s(r).ctcChildren * yearConstants(taxYear).childTaxCreditPerChild));
  add(`${P1}Line6ReadOrder[0].f1_11[0]`, "line6", (r) => String(s(r).otherDependents), true);
  add(`${P1}f1_12[0]`, "line7", (r) => money(s(r).otherDependents * 500));
  add(`${P1}f1_13[0]`, "line8", (r) => money(s(r).maxCredit));
  add(`${P1}f1_14[0]`, "line9", (r) => money(s(r).threshold));
  add(`${P1}f1_15[0]`, "line10", (r) => money(line10(r)));
  add(`${P1}f1_16[0]`, "line11", (r) => money(s(r).reduction));
  add(`${P1}c1_1[0]`, "line12.no", (r) => checkIf(!goesOn(r)));
  add(`${P1}c1_1[1]`, "line12.yes", (r) => checkIf(goesOn(r)));
  add(`${P1}f1_17[0]`, "line12", (r) => (goesOn(r) ? money(s(r).afterPhaseout) : BLANK));
  add(`${P1}f1_18[0]`, "line13", (r) => (goesOn(r) ? money(s(r).taxLimit) : BLANK));
  add(`${P1}f1_19[0]`, "line14", (r) => (goesOn(r) ? money(s(r).credit) : BLANK));

  if (y25) add(`${P2}f2_1[0]`, "line15.reserved", () => BLANK);
  else add(`${P2}c2_1[0]`, "line15.noActc", () => OFF);
  add(p2(1), "line16a", (r) => (goesOn(r) ? money(ii(r).line16a) : BLANK));
  add(p2(2), "line16b.children", (r) => (partII(r) ? String(s(r).ctcChildren) : BLANK), true);
  add(p2(3), "line16b", (r) => (partII(r) ? money(ii(r).line16b) : BLANK));
  add(p2(4), "line17", (r) => (partII(r) && ii(r).line16b ? money(ii(r).line17) : BLANK));
  add(p2(5), "line18a", (r) => (partII(r) && ii(r).line16b ? money(ii(r).earnedIncome) : BLANK));
  add(p2(6), "line18b", () => BLANK);
  const box19 = y25 ? "c2_1" : "c2_2";
  const boxNext = y25 ? "c2_2" : "c2_3";
  const over2500 = (r: ReturnLines) => ii(r).line19 > 0;
  const live = (r: ReturnLines) => partII(r) && ii(r).line16b > 0;
  add(`${P2}${box19}[0]`, "line19.no", (r) => checkIf(live(r) && !over2500(r)));
  add(`${P2}${box19}[1]`, "line19.yes", (r) => checkIf(live(r) && over2500(r)));
  add(p2(7), "line19", (r) => (live(r) && over2500(r) ? money(ii(r).line19) : BLANK));
  add(p2(8), "line20", (r) => (live(r) ? money(ii(r).line20) : BLANK));
  add(`${P2}${boxNext}[0]`, "next.no", (r) => checkIf(live(r) && ii(r).line16b < 3 * cap));
  add(`${P2}${boxNext}[1]`, "next.yes", (r) => checkIf(live(r) && ii(r).line16b >= 3 * cap));
  const b = (r: ReturnLines) => ii(r).partIIB;
  add(p2(9), "line21", (r) => (b(r) ? money(b(r)!.line21) : BLANK));
  add(p2(10), "line22", (r) => (b(r) ? money(b(r)!.line22) : BLANK));
  add(p2(11), "line23", (r) => (b(r) ? money(b(r)!.line23) : BLANK));
  add(p2(12), "line24", (r) => (b(r) ? money(b(r)!.line24) : BLANK));
  add(p2(13), "line25", (r) => (b(r) ? money(b(r)!.line25) : BLANK));
  add(p2(14), "line26", (r) => (b(r) ? money(b(r)!.line26) : BLANK));
  add(p2(15), "line27", (r) => money(r.additionalChildTaxCredit));
  return build();
}

// ── Schedule EIC ──────────────────────────────────────────────────────────────

/** The (up to three) qualifying children listed on Schedule EIC. */
export const scheduleEicChildren = (t: FakeTaxpayer): Dependent[] => eicChildren(t).slice(0, 3);

function scheduleEic(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const y25 = taxYear >= 2025;
  const f = (n: number) => `f1_${y25 ? String(n).padStart(2, "0") : n}[0]`;
  const c4a = y25 ? [1, 2, 3] : [2, 3, 4];
  const c4b = y25 ? [4, 5, 6] : [5, 6, 7];
  const { add, build } = builder("f1040sei", taxYear);
  const kid = (t: FakeTaxpayer, i: number) => scheduleEicChildren(t)[i];

  add(`${P1}${f(1)}`, "names", (_r, t) => namesOnReturn(t));
  add(`${P1}${f(2)}`, "ssn", (_r, t) => t.ssn);
  if (!y25) add(`${P1}c1_1[0]`, "beforeYouBegin", () => OFF);
  for (let i = 0; i < 3; i++) {
    const k = `child${i + 1}`;
    add(`${P1}${f(3 + i)}`, `${k}.name`, (_r, t) => (kid(t, i) ? `${kid(t, i).firstName} ${kid(t, i).lastName}` : BLANK), true);
    add(`${P1}${f(6 + i)}`, `${k}.ssn`, (_r, t) => kid(t, i)?.ssn ?? BLANK, true);
    const yearBox = i === 0 ? "Year1_ReadOrder[0]." : i === 1 ? "Year2_ReadOrder[0]." : "";
    for (let d = 0; d < 4; d++) {
      add(`${P1}${yearBox}${f(9 + i * 4 + d)}`, `${k}.birthYear${d + 1}`, (_r, t) => (kid(t, i) ? String(kid(t, i).birthYear)[d] : BLANK), true);
    }
    // 4a/4b only for a child born in or before (tax year − 19).
    const asked = (t: FakeTaxpayer) => !!kid(t, i) && ageAtYearEnd(kid(t, i).birthYear, taxYear) >= 19;
    const student = (t: FakeTaxpayer) => asked(t) && !!kid(t, i).fullTimeStudent && ageAtYearEnd(kid(t, i).birthYear, taxYear) < 24;
    const yes4a = i < 2 ? `Line4a_Child${i + 1}_ReadOrder[0].Yes_ReadOrder[0].` : `Line4a_Child3_Yes_ReadOrder[0].`;
    const no4a = i < 2 ? `Line4a_Child${i + 1}_ReadOrder[0].` : "";
    const yes4b = i < 2 ? `Line4b_Child${i + 1}_ReadOrder[0].Yes_ReadOrder[0].` : `Line4b_Child3_Yes_ReadOrder[0].`;
    const no4b = i < 2 ? `Line4b_Child${i + 1}_ReadOrder[0].` : "";
    add(`${P1}${yes4a}c1_${c4a[i]}[0]`, `${k}.line4a.yes`, (_r, t) => checkIf(student(t)));
    add(`${P1}${no4a}c1_${c4a[i]}[0]`, `${k}.line4a.no`, (_r, t) => checkIf(asked(t) && !student(t)));
    add(`${P1}${yes4b}c1_${c4b[i]}[0]`, `${k}.line4b.yes`, (_r, t) => checkIf(asked(t) && !student(t) && !!kid(t, i).disabled));
    add(`${P1}${no4b}c1_${c4b[i]}[0]`, `${k}.line4b.no`, (_r, t) => checkIf(asked(t) && !student(t) && !kid(t, i).disabled));
    add(`${P1}${f(21 + i)}`, `${k}.relationship`, (_r, t) => kid(t, i)?.relationship ?? BLANK, true);
    const months = i === 0 ? "Line6_Child1_ReadOrder[0]." : i === 1 ? "Line6_Child2_ReadOrder[0]." : "";
    add(`${P1}${months}${f(24 + i)}`, `${k}.months`, (_r, t) =>
      (kid(t, i) ? String(kid(t, i).birthYear === taxYear ? 12 : Math.min(12, kid(t, i).monthsInHome)) : BLANK), true);
  }
  return build();
}

export const CREDIT_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [schedule8812(y), scheduleEic(y)]);
