/**
 * Field maps, 2023–2025, for Schedule R (credit for the elderly or the disabled), Form 8606
 * (nondeductible IRAs), Form 4684 Section A (personal casualty losses) and Form 8283 Section A
 * (noncash gifts). Schedule R and Form 4684 keep their field names every year; Form 8606 pads
 * names to two digits from 2025, and Form 8283 pads them in the December 2023 revision (used for
 * 2023 and 2024) but not in the December 2025 one.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn, ReturnLines } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { Form8606Lines } from "../tax/ira-basis";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const P1 = "topmostSubform[0].Page1[0].";
const P2 = "topmostSubform[0].Page2[0].";
const amt = (n: number | undefined) => (n ? money(n) : BLANK);

type V = (r: ReturnLines, t: FakeTaxpayer) => string;
function builder(formId: string, taxYear: number) {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value: V, text = false) => {
    // The return comes from the source taxpayer; `document` (whose form / which copy) stays the view's.
    fields[name] = { key, value: (t) => value(computeReturn(source(t)), { ...source(t), document: t.document }), ...(text ? { text: true } : {}) };
  };
  return { add, build: (): FieldMap => ({ formId, taxYear, strict: true, fields }) };
}

const personName = (t: FakeTaxpayer, who: "primary" | "spouse") => who === "spouse"
  ? `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}`.trim()
  : `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " ");

// ── Schedule R ────────────────────────────────────────────────────────────────

function scheduleRMap(taxYear: number): FieldMap {
  const { add, build } = builder("f1040sr", taxYear);
  const s = (r: ReturnLines) => r.scheduleR;
  add(`${P1}f1_1[0]`, "names", (r, t) => (s(r) ? namesOnReturn(t) : BLANK), true);
  add(`${P1}f1_2[0]`, "ssn", (r, t) => (s(r) ? t.ssn : BLANK), true);
  const box = (n: number) => (r: ReturnLines) => (s(r)?.box === n ? checkIf(true) : OFF);
  add(`${P1}c1_1[0]`, "box1", box(1));
  add(`${P1}c1_1[1]`, "box2", box(2));
  [3, 4, 5, 6, 7].forEach((n, i) => add(`${P1}Married[0].c1_1[${i}]`, `box${n}`, box(n)));
  [8, 9].forEach((n, i) => add(`${P1}MarriedSeparate[0].c1_1[${i}]`, `box${n}`, box(n)));
  add(`${P1}c1_2[0]`, "partII.box", () => OFF);   // physician's statement already filed: not modelled
  const lines: Array<[number, string, (x: NonNullable<ReturnLines["scheduleR"]>) => number | undefined]> = [
    [1, "line10", (x) => x.line10], [2, "line11", (x) => x.line11], [3, "line12", (x) => x.line12],
    [4, "line13a", (x) => x.line13a], [5, "line13b", () => undefined], [6, "line13c", (x) => x.line13c],
    [7, "line14", (x) => x.line14], [8, "line15", (x) => x.line15], [9, "line16", (x) => x.line16],
    [10, "line17", (x) => x.line17], [11, "line18", (x) => x.line18], [12, "line19", (x) => x.line19],
    [13, "line20", (x) => x.line20], [14, "line21", (x) => x.line21], [15, "line22", (x) => x.line22],
  ];
  for (const [n, key, v] of lines) add(`${P2}f2_${n}[0]`, key, (r) => (s(r) ? (key === "line11" && v(s(r)!) === undefined ? BLANK : money(v(s(r)!) ?? 0)) : BLANK));
  return build();
}

// ── Form 8606 ─────────────────────────────────────────────────────────────────

function form8606Map(taxYear: number): FieldMap {
  const { add, build } = builder("f8606", taxYear);
  const pad = (n: number) => (taxYear >= 2025 ? String(n).padStart(2, "0") : String(n));
  const who = (t: FakeTaxpayer) => t.document?.form8606Person ?? "primary";
  const f = (r: ReturnLines, t: FakeTaxpayer): Form8606Lines | undefined => r.retirement.form8606[who(t)];
  const add1 = (n: number, key: string, v: (x: Form8606Lines) => string, text = false) =>
    add(`${P1}f1_${pad(n)}[0]`, key, (r, t) => { const x = f(r, t); return x ? v(x) : BLANK; }, text);
  add(`${P1}f1_${pad(1)}[0]`, "name", (r, t) => (f(r, t) ? personName(t, who(t)) : BLANK), true);
  add(`${P1}f1_${pad(2)}[0]`, "ssn", (r, t) => (f(r, t) ? (who(t) === "spouse" ? t.spouseSSN ?? "" : t.ssn) : BLANK), true);
  for (const n of [3, 4, 5, 6, 7, 8]) add(`${P1}f1_${pad(n)}[0]`, `address.${n}`, () => BLANK, true);   // only when filed alone
  add1(9, "line1", (x) => amt(x.line1));
  add1(10, "line2", (x) => money(x.line2));
  add1(11, "line3", (x) => money(x.line3));
  add1(12, "line4", () => BLANK);
  add1(13, "line5", (x) => money(x.line5));
  add1(14, "line6", (x) => money(x.line6));
  add1(15, "line7", (x) => amt(x.line7));
  add1(16, "line8", (x) => amt(x.line8));
  add1(17, "line9", (x) => money(x.line9));
  // Line 10 is a decimal in two boxes: the whole number (blank below 1) and five decimal places.
  add1(18, "line10.whole", (x) => (x.line10 >= 1 ? "1" : BLANK), true);
  add1(19, "line10.decimals", (x) => (x.line10 >= 1 ? "00000" : String(Math.round(x.line10 * 1e5)).padStart(5, "0")), true);
  add1(20, "line11", (x) => amt(x.line11));
  add1(21, "line12", (x) => amt(x.line12));
  add1(22, "line13", (x) => amt(x.line13));
  add1(23, "line14", (x) => money(x.line14));
  // 2023/2024 put lines 15a–15c at the bottom of page 1 (f1_24–26) and start page 2 at line 16;
  // 2025 moved 15a–15c to the top of page 2.
  const y25 = taxYear >= 2025;
  const at = (page1: number, page2: number) => (y25 ? `${P2}f2_${pad(page2)}[0]` : `${P1}f1_${pad(page1)}[0]`);
  const add2 = (name: string, key: string, v: (x: Form8606Lines) => string) =>
    add(name, key, (r, t) => { const x = f(r, t); return x ? v(x) : BLANK; });
  add2(at(24, 1), "line15a", (x) => (x.line7 ? money(x.line15a) : BLANK));
  add2(at(25, 2), "line15b", () => BLANK);
  add2(at(26, 3), "line15c", (x) => (x.line7 ? money(x.line15c) : BLANK));
  const p2 = (n25: number, nOld: number) => `${P2}f2_${pad(y25 ? n25 : nOld)}[0]`;
  add2(p2(4, 1), "line16", (x) => amt(x.line16));
  add2(p2(5, 2), "line17", (x) => (x.line16 ? money(x.line17) : BLANK));
  add2(p2(6, 3), "line18", (x) => (x.line16 ? money(x.line18) : BLANK));
  for (let i = 0; i < 9; i++) add2(p2(7 + i, 4 + i), `partIII.${19 + i}`, () => BLANK);   // Roth IRA distributions: not modelled
  return build();
}

// ── Form 4684 Section A ───────────────────────────────────────────────────────

function form4684Map(taxYear: number): FieldMap {
  const { add, build } = builder("f4684", taxYear);
  const idx = (t: FakeTaxpayer) => t.document?.casualtyIndex ?? 0;
  const ev = (t: FakeTaxpayer) => source(t).itemized?.casualtyEvents?.[idx(t)];
  add(`${P1}f1_1[0]`, "names", (_r, t) => (ev(t) ? namesOnReturn(t) : BLANK), true);
  add(`${P1}f1_2[0]`, "ssn", (_r, t) => (ev(t) ? t.ssn : BLANK), true);
  const fema = (t: FakeTaxpayer) => /^(DR|EM)-?\s*(.+)$/i.exec(ev(t)?.femaNumber ?? "");
  add(`${P1}c1_1[0]`, "federallyDeclared", (_r, t) => checkIf(!!ev(t) && ev(t)!.kind !== "other"));
  add(`${P1}f1_3[0]`, "drNumber", (_r, t) => (fema(t)?.[1].toUpperCase() === "DR" ? fema(t)![2] : BLANK), true);
  add(`${P1}f1_4[0]`, "emNumber", (_r, t) => (fema(t)?.[1].toUpperCase() === "EM" ? fema(t)![2] : BLANK), true);
  const item = (t: FakeTaxpayer, c: number) => ev(t)?.items[c];
  for (let c = 0; c < 4; c++) {
    const row = `${P1}Table_Line1[0].Row${"ABCD"[c]}[0].`;
    const base = 5 + 4 * c;
    add(`${row}f1_${base}[0]`, `line1.${"ABCD"[c]}.description`, (_r, t) => item(t, c)?.description ?? BLANK, true);
    add(`${row}f1_${base + 1}[0]`, `line1.${"ABCD"[c]}.location`, (_r, t) => item(t, c)?.location ?? BLANK, true);
    add(`${row}f1_${base + 2}[0]`, `line1.${"ABCD"[c]}.zip`, (_r, t) => item(t, c)?.zip ?? BLANK, true);
    add(`${row}f1_${base + 3}[0]`, `line1.${"ABCD"[c]}.dateAcquired`, (_r, t) => item(t, c)?.dateAcquired ?? BLANK, true);
    const T = `${P1}Table_Lines2-9[0].`;
    const col = (line: number, first: number, v: (x: NonNullable<ReturnType<typeof item>>) => number | undefined) =>
      add(`${T}Line${line}[0].f1_${first + c}[0]`, `line${line}.${"ABCD"[c]}`, (_r, t) => { const x = item(t, c); const n = x ? v(x) : undefined; return n === undefined ? BLANK : money(n); });
    const drop = (x: { fmvBefore: number; fmvAfter: number }) => Math.max(0, x.fmvBefore - x.fmvAfter);
    col(2, 21, (x) => x.basis);
    col(3, 25, (x) => x.insurance);
    col(4, 29, () => undefined);                                  // gains: not modelled
    col(5, 33, (x) => x.fmvBefore);
    col(6, 37, (x) => x.fmvAfter);
    col(7, 41, (x) => drop(x));
    col(8, 45, (x) => Math.min(x.basis, drop(x)));
    col(9, 49, (x) => Math.max(0, Math.min(x.basis, drop(x)) - x.insurance));
  }
  const e = (r: ReturnLines, _t: FakeTaxpayer) => r.form4684;
  const thisEvent = (r: ReturnLines, t: FakeTaxpayer) => e(r, t)?.events[idx(t)];
  add(`${P1}f1_53[0]`, "line10", (r, t) => (thisEvent(r, t) ? money(thisEvent(r, t)!.loss) : BLANK));
  add(`${P1}f1_54[0]`, "line11", (r, t) => (thisEvent(r, t) ? money(Math.min(thisEvent(r, t)!.floor, thisEvent(r, t)!.loss)) : BLANK));
  add(`${P1}f1_55[0]`, "line12", (r, t) => (thisEvent(r, t) ? money(thisEvent(r, t)!.net) : BLANK));
  // Lines 13–18 on one Form 4684 only (the first).
  const first = (r: ReturnLines, t: FakeTaxpayer) => (idx(t) === 0 ? e(r, t) : undefined);
  add(`${P1}f1_56[0]`, "line13", (r, t) => (first(r, t) ? money(0) : BLANK));
  add(`${P1}f1_57[0]`, "line14", (r, t) => (first(r, t) ? money(first(r, t)!.line14) : BLANK));
  add(`${P1}f1_58[0]`, "line15", (r, t) => (first(r, t) ? money(first(r, t)!.line15) : BLANK));
  add(`${P1}f1_59[0]`, "line16", (r, t) => (first(r, t) ? money(first(r, t)!.line16) : BLANK));
  add(`${P1}f1_60[0]`, "line17", (r, t) => (first(r, t) ? money(first(r, t)!.line17) : BLANK));
  add(`${P1}f1_61[0]`, "line18", (r, t) => (first(r, t) ? money(first(r, t)!.line18) : BLANK));
  return build();
}

// ── Form 8283 Section A ───────────────────────────────────────────────────────

function form8283Map(taxYear: number): FieldMap {
  const { add, build } = builder("f8283", taxYear);
  const rev2023 = taxYear < 2025;
  const n = (k: number) => (rev2023 && k < 10 ? String(k).padStart(2, "0") : String(k));
  const R1 = "Form8283[0].Page1[0].";
  const copy = (t: FakeTaxpayer) => t.document?.form8283Copy ?? 0;
  const gifts = (t: FakeTaxpayer) => source(t).itemized?.noncashGifts ?? [];
  const gift = (t: FakeTaxpayer, row: number) => gifts(t)[copy(t) * 4 + row];
  add(`${R1}f1_${n(1)}[0]`, "names", (_r, t) => (gifts(t).length ? namesOnReturn(t) : BLANK), true);
  add(`${R1}f1_${n(2)}[0]`, "ssn", (_r, t) => (gifts(t).length ? t.ssn : BLANK), true);
  add(`${R1}f1_${n(3)}[0]`, "entityName", () => BLANK, true);
  add(`${R1}f1_${n(4)}[0]`, "entityTin", () => BLANK, true);
  add(`${R1}c1_1[0]`, "passThrough", () => OFF);
  for (let row = 0; row < 4; row++) {
    const L = "ABCD"[row];
    const A = `${R1}Table_Line1_ColsA-C[0].Row1${L}[0].`;
    const D = `${R1}Table_Line1_ColsD-I[0].Row1${L}[0].`;
    const g = (t: FakeTaxpayer) => gift(t, row);
    add(`${A}f1_${n(5 + 3 * row)}[0]`, `row${L}.donee`, (_r, t) => (g(t) ? [g(t)!.donee, g(t)!.doneeAddress].filter(Boolean).join(", ") : BLANK), true);
    add(`${A}ColB[0].c1_${2 + row}[0]`, `row${L}.vehicle`, () => OFF);
    add(`${A}ColB[0].f1_${n(6 + 3 * row)}[0]`, `row${L}.vin`, () => BLANK, true);
    add(`${A}f1_${n(7 + 3 * row)}[0]`, `row${L}.description`, (_r, t) => g(t)?.description ?? BLANK, true);
    const base = 17 + 6 * row;
    add(`${D}f1_${n(base)}[0]`, `row${L}.dateContributed`, (_r, t) => g(t)?.dateContributed ?? BLANK, true);
    add(`${D}f1_${n(base + 1)}[0]`, `row${L}.dateAcquired`, (_r, t) => g(t)?.dateAcquired ?? BLANK, true);
    add(`${D}f1_${n(base + 2)}[0]`, `row${L}.howAcquired`, (_r, t) => g(t)?.howAcquired ?? BLANK, true);
    add(`${D}f1_${n(base + 3)}[0]`, `row${L}.cost`, (_r, t) => (g(t)?.cost !== undefined ? money(g(t)!.cost!) : BLANK));
    add(`${D}f1_${n(base + 4)}[0]`, `row${L}.fmv`, (_r, t) => (g(t) ? money(g(t)!.fmv) : BLANK));
    add(`${D}f1_${n(base + 5)}[0]`, `row${L}.method`, (_r, t) => g(t)?.method ?? BLANK, true);
  }
  return build();
}

export const ELDERLY_IRA_CASUALTY_NONCASH_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [scheduleRMap(y), form8606Map(y), form4684Map(y), form8283Map(y)]);
