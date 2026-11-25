/**
 * Schedule D (2023–2025) and Form 8949 (2025 only) field maps.
 *
 * Schedule D keeps one layout in all three years; 2025 renumbers the name/SSN
 * and line-1a/16/18/19/21 fields (f1_1 instead of f1_01, …). The 2023/2024 PDFs
 * mark the column (g) boxes of lines 1a and 8a read-only ("_RO"): Exception 1
 * rows have no adjustments.
 *
 * Form 8949: each copy has one short-term box (Part I) and one long-term box
 * (Part II); documentsFor makes as many copies as the busiest part needs
 * (`t.document.form8949Copy`). 2023/2024: 14 rows per part, boxes A–C / D–F,
 * unpadded field numbers under Table_Line1. 2025: 11 rows, boxes A–C plus the
 * new digital-asset boxes G–I / J–L, zero-padded fields under Table_Line1_PartN.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { Form8949Box, Form8949Row, LineTotals, ScheduleDLines } from "../tax/capital";
import { computeReturn } from "../tax/compute";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));

// ── Schedule D ────────────────────────────────────────────────────────────────

function buildScheduleD(taxYear: number): FieldMap {
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const T1 = `${P1}Table_PartI[0].`;
  const T2 = `${P1}Table_PartII[0].`;
  const y25 = taxYear >= 2025;
  const f = (n: number) => (y25 && n < 10 ? `f1_${n}[0]` : `f1_${String(n).padStart(2, "0")}[0]`);
  const g = (n: number) => (y25 ? `f2_${n}[0]` : `f2_${String(n).padStart(2, "0")}[0]`);
  const fields: Record<string, MappedField> = {};
  const d = (t: FakeTaxpayer): ScheduleDLines | undefined => computeReturn(source(t)).capital.scheduleD;
  const add = (name: string, key: string, value: (s: ScheduleDLines, t: FakeTaxpayer) => string) => {
    fields[name] = { key, value: (t) => { const s = d(t); return s ? value(s, source(t)) : BLANK; } };
  };
  const row = (prefix: string, first: number, key: string, pick: (s: ScheduleDLines) => LineTotals, roAdjust: boolean) => {
    const used = (s: ScheduleDLines) => pick(s).proceeds !== 0 || pick(s).basis !== 0 || pick(s).gain !== 0;
    add(`${prefix}${f(first)}`, `${key}.d`, (s) => (used(s) ? money(pick(s).proceeds) : BLANK));
    add(`${prefix}${f(first + 1)}`, `${key}.e`, (s) => (used(s) ? money(pick(s).basis) : BLANK));
    const gName = roAdjust && !y25 ? `${prefix}f1_${String(first + 2).padStart(2, "0")}_RO[0]` : `${prefix}${f(first + 2)}`;
    add(gName, `${key}.g`, (s) => (roAdjust ? BLANK : moneyOrBlank(pick(s).adjustment)));
    add(`${prefix}${f(first + 3)}`, `${key}.h`, (s) => (used(s) ? money(pick(s).gain) : BLANK));
  };

  add(`${P1}${f(1)}`, "names", (_s, t) => namesOnReturn(t));
  add(`${P1}${f(2)}`, "ssn", (_s, t) => t.ssn);
  add(`${P1}c1_1[0]`, "qofYes", () => OFF);
  add(`${P1}c1_1[1]`, "qofNo", () => "Yes");
  row(`${T1}Row1a[0].`, 3, "line1a", (s) => s.line1a, true);
  row(`${T1}Row1b[0].`, 7, "line1b", (s) => s.line1b, false);
  row(`${T1}Row2[0].`, 11, "line2", (s) => s.line2, false);
  row(`${T1}Row3[0].`, 15, "line3", (s) => s.line3, false);
  add(`${P1}f1_19[0]`, "line4", () => BLANK);
  add(`${P1}f1_20[0]`, "line5", () => BLANK);
  add(`${P1}f1_21[0]`, "line6", (s) => moneyOrBlank(s.line6 ? -s.line6 : 0));   // printed in parentheses
  add(`${P1}f1_22[0]`, "line7", (s) => money(s.line7));
  row(`${T2}Row8a[0].`, 23, "line8a", (s) => s.line8a, true);
  row(`${T2}Row8b[0].`, 27, "line8b", (s) => s.line8b, false);
  row(`${T2}Row9[0].`, 31, "line9", (s) => s.line9, false);
  row(`${T2}Row10[0].`, 35, "line10", (s) => s.line10, false);
  add(`${P1}f1_39[0]`, "line11", () => BLANK);
  add(`${P1}f1_40[0]`, "line12", () => BLANK);
  add(`${P1}f1_41[0]`, "line13", (s) => moneyOrBlank(s.line13));
  add(`${P1}f1_42[0]`, "line14", (s) => moneyOrBlank(s.line14 ? -s.line14 : 0));
  add(`${P1}f1_43[0]`, "line15", (s) => money(s.line15));

  // Part III: 16; 17 (both gains?) → 18/19/20; a loss → 21; a loss, zero or "No" on 17 → 22.
  const gainPath = (s: ScheduleDLines) => s.line16 > 0;
  const askLine22 = (s: ScheduleDLines) => !gainPath(s) || !s.bothGains;
  const hasQualDiv = (t: FakeTaxpayer) => computeReturn(t).qualifiedDividends > 0;
  add(`${P2}${g(1)}`, "line16", (s) => money(s.line16));
  add(`${P2}c2_1[0]`, "line17.yes", (s) => checkIf(gainPath(s) && s.bothGains));
  add(`${P2}c2_1[1]`, "line17.no", (s) => checkIf(gainPath(s) && !s.bothGains));
  add(`${P2}${g(2)}`, "line18", (s) => (gainPath(s) && s.bothGains ? money(0) : BLANK));
  add(`${P2}${g(3)}`, "line19", (s) => (gainPath(s) && s.bothGains ? money(0) : BLANK));
  // Line 20: 18 and 19 are both zero → "Yes" (Qualified Dividends and Capital Gain Tax Worksheet).
  add(`${P2}c2_2[0]`, "line20.yes", (s) => checkIf(gainPath(s) && s.bothGains));
  add(`${P2}c2_2[1]`, "line20.no", () => OFF);
  add(y25 ? `${P2}${g(4)}` : `${P2}TagCorrectingSubform[0].${g(4)}`, "line21", (s) => (s.line16 < 0 ? money(-s.line21) : BLANK));
  add(`${P2}c2_3[0]`, "line22.yes", (s, t) => checkIf(askLine22(s) && hasQualDiv(t)));
  add(`${P2}c2_3[1]`, "line22.no", (s, t) => checkIf(askLine22(s) && !hasQualDiv(t)));
  return { formId: "f1040sd", taxYear, strict: true, fields };
}

// ── Form 8949 ─────────────────────────────────────────────────────────────────

/** Rows per part: 14 on the 2023/2024 form, 11 on 2025. */
export const form8949Rows = (taxYear: number) => (taxYear >= 2025 ? 11 : 14);

export interface Form8949Part { box: Form8949Box; rows: Form8949Row[] }
export interface Form8949Copy { short?: Form8949Part; long?: Form8949Part }

/** Rows that need Form 8949, grouped into copies (one box per part, 11 rows per part). */
export function form8949Copies(t: FakeTaxpayer): Form8949Copy[] {
  const rows = computeReturn(t).capital.rows.filter((r) => !r.directToScheduleD);
  const per = form8949Rows(t.taxYear);
  const parts = (boxes: Form8949Box[]): Form8949Part[] => boxes.flatMap((box) => {
    const rs = rows.filter((r) => r.box === box);
    const out: Form8949Part[] = [];
    for (let i = 0; i < rs.length; i += per) out.push({ box, rows: rs.slice(i, i + per) });
    return out;
  });
  const st = parts(["A", "B", "C"]);
  const lt = parts(["D", "E", "F"]);
  return Array.from({ length: Math.max(st.length, lt.length) }, (_, i) => ({ short: st[i], long: lt[i] }));
}

/** Checkbox order: Part I A, B, C (2025: then G, H, I); Part II D, E, F (2025: then J, K, L). */
const BOX_INDEX: Record<Form8949Box, number> = { A: 0, B: 1, C: 2, D: 0, E: 1, F: 2 };

function buildForm8949(taxYear: number): FieldMap {
  const y25 = taxYear >= 2025;
  const ROWS = form8949Rows(taxYear);
  const boxCount = y25 ? 6 : 3;
  const totalsAt = y25 ? 91 : 115;
  const fields: Record<string, MappedField> = {};
  const copy = (t: FakeTaxpayer): Form8949Copy | undefined => form8949Copies(source(t))[t.document?.form8949Copy ?? 0];
  const add = (name: string, key: string, value: (c: Form8949Copy, t: FakeTaxpayer) => string, text = false) => {
    fields[name] = { key, value: (t) => { const c = copy(t); return c ? value(c, source(t)) : BLANK; }, ...(text ? { text } : {}) };
  };
  for (const [part, pg, which] of [[1, 1, "short"], [2, 2, "long"]] as const) {
    const P = `topmostSubform[0].Page${pg}[0].`;
    const T = y25 ? `${P}Table_Line1_Part${part}[0].` : `${P}Table_Line1[0].`;
    const fn = (n: number) => `f${pg}_${y25 ? String(n).padStart(2, "0") : n}[0]`;
    const partOf = (c: Form8949Copy) => c[which];
    add(`${P}${fn(1)}`, `p${part}.names`, (c, t) => (partOf(c) || part === 1 ? namesOnReturn(t) : BLANK), true);
    add(`${P}${fn(2)}`, `p${part}.ssn`, (c, t) => (partOf(c) || part === 1 ? t.ssn : BLANK), true);
    for (let i = 0; i < boxCount; i++) {
      add(`${P}c${pg}_1[${i}]`, `p${part}.box${i}`, (c) => checkIf(!!partOf(c) && BOX_INDEX[partOf(c)!.box] === i));
    }
    for (let r = 0; r < ROWS; r++) {
      const base = 3 + r * 8;
      const R = `${T}Row${r + 1}[0].`;
      const row = (c: Form8949Copy) => partOf(c)?.rows[r];
      add(`${R}${fn(base)}`, `p${part}.r${r + 1}.a`, (c) => row(c)?.sale.description ?? BLANK, true);
      add(`${R}${fn(base + 1)}`, `p${part}.r${r + 1}.b`, (c) => row(c)?.sale.dateAcquired ?? BLANK, true);
      add(`${R}${fn(base + 2)}`, `p${part}.r${r + 1}.c`, (c) => row(c)?.sale.dateSold ?? BLANK, true);
      add(`${R}${fn(base + 3)}`, `p${part}.r${r + 1}.d`, (c) => (row(c) ? money(row(c)!.proceeds) : BLANK));
      add(`${R}${fn(base + 4)}`, `p${part}.r${r + 1}.e`, (c) => (row(c) ? money(row(c)!.basis) : BLANK));
      add(`${R}${fn(base + 5)}`, `p${part}.r${r + 1}.f`, (c) => row(c)?.codes ?? BLANK, true);
      add(`${R}${fn(base + 6)}`, `p${part}.r${r + 1}.g`, (c) => moneyOrBlank(row(c)?.adjustment));
      add(`${R}${fn(base + 7)}`, `p${part}.r${r + 1}.h`, (c) => (row(c) ? money(row(c)!.gain) : BLANK));
    }
    const tot = (c: Form8949Copy, pick: (r: Form8949Row) => number) =>
      partOf(c) ? Math.round(partOf(c)!.rows.reduce((s, r) => s + pick(r), 0) * 100) / 100 : undefined;
    add(`${P}${fn(totalsAt)}`, `p${part}.total.d`, (c) => (partOf(c) ? money(tot(c, (r) => r.proceeds)!) : BLANK));
    add(`${P}${fn(totalsAt + 1)}`, `p${part}.total.e`, (c) => (partOf(c) ? money(tot(c, (r) => r.basis)!) : BLANK));
    add(`${P}${fn(totalsAt + 2)}`, `p${part}.total.f`, () => BLANK);
    add(`${P}${fn(totalsAt + 3)}`, `p${part}.total.g`, (c) => moneyOrBlank(tot(c, (r) => r.adjustment)));
    add(`${P}${fn(totalsAt + 4)}`, `p${part}.total.h`, (c) => (partOf(c) ? money(tot(c, (r) => r.gain)!) : BLANK));
  }
  return { formId: "f8949", taxYear, strict: true, fields };
}

export const CAPITAL_MAPS: FieldMap[] = [...[2023, 2024, 2025].map(buildScheduleD), ...[2023, 2024, 2025].map(buildForm8949)];
