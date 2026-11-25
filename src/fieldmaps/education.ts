/**
 * Education field maps, 2023–2025: Form 1098-T (one per student who got one) and Form 8863.
 *
 * Form 8863: page 1 field names are the same in every year; page 2 (Part III, one student
 * per copy) numbers its fields two higher in 2025 and renames the name fields. Line 6 and
 * line 17 each split into a whole-number box and a three-digit decimal box; SSNs and EINs
 * are split into their printed boxes. A return with several students gets one Form 8863
 * per student: page 1 is filled on the first copy only, page 2 on every copy ("use
 * additional copies of page 2"). Line 22b (a second institution) isn't modelled.
 */
import { EducationStudent, FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { Form8863Lines, Form8863Student } from "../tax/education";
import { namesOnReturn } from "../tax/household";
import { F1098T_LAYOUT } from "./f1098t.layout";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const digits = (s: string) => s.replace(/\D/g, "");

/** The student's name and TIN, as shown on the return. */
export function studentIdentity(t: FakeTaxpayer, s: EducationStudent): { first: string; last: string; tin: string } {
  if (s.student === "primary") return { first: `${t.firstName} ${t.middleInitial}`.trim(), last: t.lastName, tin: t.ssn };
  if (s.student === "spouse") return { first: t.spouseFirstName ?? "", last: t.spouseLastName ?? t.lastName, tin: t.spouseSSN ?? "" };
  const d = t.dependents[s.student];
  return { first: d?.firstName ?? "", last: d?.lastName ?? "", tin: d?.ssn ?? "" };
}

/** Students with a Form 1098-T, in document order (index into education.students). */
export const students1098T = (t: FakeTaxpayer): number[] =>
  (t.education?.students ?? []).map((s, i) => ({ s, i })).filter(({ s }) => s.received1098T !== false).map(({ i }) => i);

// ── Form 1098-T ──────────────────────────────────────────────────────────────────

function form1098TMap(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  for (const [name, copyKey] of Object.entries(F1098T_LAYOUT[taxYear])) {
    const key = copyKey.split(".").slice(1).join(".");
    const box = /^(corrected|box7|box8|box9)/.test(key);
    const v = (t: FakeTaxpayer): string => {
      const src = source(t);
      const s = src.education?.students[t.document?.educationIndex ?? -1];
      if (!s) return box ? OFF : BLANK;
      const who = studentIdentity(src, s);
      switch (key) {
        case "filer": return `${s.institution.name}\n${s.institution.street}\n${s.institution.city}`;
        case "filerEin": return s.institution.ein;
        case "studentTin": return who.tin;
        case "studentName": return `${who.first} ${who.last}`.trim();
        case "street": return [src.streetAddress, src.aptNumber].filter(Boolean).join(" ");
        case "city": return `${src.city}, ${src.state} ${src.zipCode}`;
        case "box1": return money(s.tuitionPaid);
        case "box5": return s.scholarships ? money(s.scholarships) : BLANK;
        case "box8": return checkIf(s.halfTime);
        case "box9": return checkIf(s.graduate);
        default: return box ? OFF : BLANK;
      }
    };
    fields[name] = { key: copyKey, value: v, ...(!box && !/^box(1|4|5|6|10)$/.test(key) ? { text: true } : {}) };
  }
  return { formId: "f1098t", taxYear, strict: true, fields };
}

// ── Form 8863 ────────────────────────────────────────────────────────────────────

function form8863Map(taxYear: number): FieldMap {
  const y25 = taxYear >= 2025;
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const fields: Record<string, MappedField> = {};
  const f = (t: FakeTaxpayer) => computeReturn(source(t)).form8863;
  const first = (t: FakeTaxpayer) => (t.document?.educationIndex ?? 0) === (f(t)?.students[0]?.index ?? 0);
  const add = (name: string, key: string, value: (x: Form8863Lines, t: FakeTaxpayer) => string, opts: { text?: boolean; box?: boolean; page1?: boolean } = {}) => {
    fields[name] = {
      key,
      value: (t) => {
        const x = f(t);
        if (!x || (opts.page1 && !first(t))) return opts.box ? OFF : BLANK;
        // The source household, but keeping this copy's document (which student it's for).
        return value(x, { ...source(t), document: t.document });
      },
      ...(opts.text ? { text: true } : {}),
    };
  };
  const ssnParts = (ssn: string) => { const d = digits(ssn); return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 9)]; };
  const decimal = (v: number) => [String(Math.floor(v)), String(Math.round((v % 1) * 1000)).padStart(3, "0")];

  // Page 1.
  add(`${P1}f1_1[0]`, "names", (_x, t) => namesOnReturn(t), { text: true, page1: true });
  ["f1_2", "f1_3", "f1_4"].forEach((n, i) => add(`${P1}SocialSecurity[0].${n}[0]`, `ssn.${i + 1}`, (_x, t) => ssnParts(t.ssn)[i], { text: true, page1: true }));
  const p1: Array<[string, string, (x: Form8863Lines) => string, boolean?]> = [
    ["f1_5", "line1", (x) => money(x.line1)], ["f1_6", "line2", (x) => money(x.line2)], ["f1_7", "line3", (x) => money(x.line3)],
    ["f1_8", "line4", (x) => money(x.line4)], ["f1_9", "line5", (x) => money(x.line5)],
    ["f1_10", "line6.whole", (x) => decimal(x.line6)[0], true], ["f1_11", "line6.decimal", (x) => decimal(x.line6)[1], true],
    ["f1_12", "line7", (x) => money(x.line7)], ["f1_13", "line8", (x) => money(x.line8)], ["f1_14", "line9", (x) => money(x.line9)],
    ["f1_15", "line10", (x) => money(x.line10)], ["f1_16", "line11", (x) => money(x.line11)], ["f1_17", "line12", (x) => money(x.line12)],
    ["f1_18", "line13", (x) => money(x.line13)], ["f1_19", "line14", (x) => money(x.line14)], ["f1_20", "line15", (x) => money(x.line15)],
    ["f1_21", "line16", (x) => money(x.line16)],
    ["f1_22", "line17.whole", (x) => decimal(x.line17)[0], true], ["f1_23", "line17.decimal", (x) => decimal(x.line17)[1], true],
    ["f1_24", "line18", (x) => money(x.line18)], ["f1_25", "line19", (x) => money(x.line19)],
  ];
  for (const [n, key, v, text] of p1) add(`${P1}${n}[0]`, key, v, { page1: true, text: !!text });
  add(`${P1}c1_1[0]`, "line7.nonrefundableOnly", (x) => checkIf(x.nonrefundableOnly), { box: true, page1: true });

  // Page 2: the student for this copy.
  const fn = (n: number) => `f2_${y25 ? n + 2 : n}[0]`;
  const student = (x: Form8863Lines, t: FakeTaxpayer): { row: Form8863Student; s: EducationStudent } | undefined => {
    const row = x.students.find((r) => r.index === (t.document?.educationIndex ?? x.students[0]?.index));
    const s = row ? t.education?.students[row.index] : undefined;
    return row && s ? { row, s } : undefined;
  };
  add(`${P2}${y25 ? "f2_1[0]" : "NameShown[0]"}`, "p2.names", (_x, t) => namesOnReturn(t), { text: true });
  [1, 2, 3].forEach((n, i) => add(`${P2}SSN[0].f2_${y25 ? n + 1 : n}[0]`, `p2.ssn.${i + 1}`, (_x, t) => ssnParts(t.ssn)[i], { text: true }));
  add(`${P2}${y25 ? "f2-5[0]" : "StudentName[0]"}`, "line20", (x, t) => { const st = student(x, t); if (!st) return BLANK; const w = studentIdentity(t, st.s); return `${w.first} ${w.last}`.trim(); }, { text: true });
  [4, 5, 6].forEach((n, i) => add(`${P2}StudentSSN[0].${fn(n)}`, `line21.${i + 1}`, (x, t) => { const st = student(x, t); return st ? ssnParts(studentIdentity(t, st.s).tin)[i] : BLANK; }, { text: true }));
  add(`${P2}Line22a[0].${fn(7)}`, "line22a.name", (x, t) => student(x, t)?.s.institution.name ?? BLANK, { text: true });
  add(`${P2}Line22a[0].${fn(8)}`, "line22a.address", (x, t) => { const st = student(x, t); return st ? `${st.s.institution.street}\n${st.s.institution.city}` : BLANK; }, { text: true });
  const got = (x: Form8863Lines, t: FakeTaxpayer) => (student(x, t) ? student(x, t)!.s.received1098T !== false : undefined);
  add(`${P2}Line22a[0].c2_1[0]`, "line22a.1098T.yes", (x, t) => checkIf(got(x, t) === true), { box: true });
  add(`${P2}Line22a[0].c2_1[1]`, "line22a.1098T.no", (x, t) => checkIf(got(x, t) === false), { box: true });
  add(`${P2}Line22a[0].c2_2[0]`, "line22a.priorBox7.yes", () => OFF, { box: true });
  add(`${P2}Line22a[0].c2_2[1]`, "line22a.priorBox7.no", (x, t) => checkIf(!!student(x, t)), { box: true });
  for (let k = 0; k < 9; k++) {
    add(`${P2}Line22a[0].${fn(9 + k)}`, `line22a.ein.${k + 1}`, (x, t) => {
      const st = student(x, t);
      return st && (st.row.aotc || st.s.received1098T !== false) ? digits(st.s.institution.ein)[k] ?? BLANK : BLANK;
    }, { text: true });
  }
  // Line 22b (second institution): not modelled.
  add(`${P2}Line22b[0].${fn(18)}`, "line22b.name", () => BLANK, { text: true });
  add(`${P2}Line22b[0].${fn(19)}`, "line22b.address", () => BLANK, { text: true });
  for (const c of ["c2_3", "c2_4"]) for (const i of [0, 1]) add(`${P2}Line22b[0].${c}[${i}]`, `line22b.${c}.${i}`, () => OFF, { box: true });
  for (let k = 0; k < 9; k++) add(`${P2}Line22b[0].${fn(20 + k)}`, `line22b.ein.${k + 1}`, () => BLANK, { text: true });
  // Lines 23–26: the form's flow stops at the first answer that rules the AOTC out.
  const answers = (s: EducationStudent): Array<boolean | undefined> => {
    const out: Array<boolean | undefined> = [s.aotcPriorYears >= 4];
    if (out[0]) return [true];
    out.push(s.halfTime); if (!s.halfTime) return out;
    out.push(s.completedFirst4Years); if (s.completedFirst4Years) return out;
    out.push(!!s.felonyDrugConviction);
    return out;
  };
  ["c2_5", "c2_6", "c2_7", "c2_8"].forEach((c, i) => {
    add(`${P2}${c}[0]`, `line${23 + i}.yes`, (x, t) => { const st = student(x, t); return checkIf(!!st && answers(st.s)[i] === true); }, { box: true });
    add(`${P2}${c}[1]`, `line${23 + i}.no`, (x, t) => { const st = student(x, t); return checkIf(!!st && answers(st.s)[i] === false); }, { box: true });
  });
  const amt = (k: keyof Form8863Student) => (x: Form8863Lines, t: FakeTaxpayer) => {
    const st = student(x, t);
    if (!st) return BLANK;
    if (k === "line31") return st.row.aotc ? BLANK : money(st.row.line31);
    return st.row.aotc ? money(st.row[k] as number) : BLANK;
  };
  ([[29, "line27"], [30, "line28"], [31, "line29"], [32, "line30"], [33, "line31"]] as Array<[number, keyof Form8863Student]>)
    .forEach(([n, k]) => add(`${P2}${fn(n)}`, k, amt(k)));
  return { formId: "f8863", taxYear, strict: true, fields };
}

export const EDUCATION_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [form1098TMap(y), form8863Map(y)]);
