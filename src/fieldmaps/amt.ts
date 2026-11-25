/**
 * Form 6251 and Form 3921 field maps, 2023–2025.
 *
 * Form 6251: 2023/2024 share a layout (line 1 = f1_3, lines 2a–2t = f1_4–f1_23, 3 = f1_24,
 * 4–11 = f1_25–f1_32). 2025 splits line 1 into 1a/1b (f1_3/f1_4), shifting every later
 * page 1 field by one. Part III (page 2, lines 12–40) is f2_1–f2_29 in every year; lines
 * 35–37 (unrecaptured § 1250 gain) stay blank. Only lines 2a and 2i are modelled in Part I.
 * Form 3921 (continuous-use, Rev. April 2025): one per exercise; Copy A puts its columns
 * under LftCol with f1_ names, Copies B and C under LeftColumn with f2_.
 */
import { FakeTaxpayer, IsoExercise } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { Form6251Lines } from "../tax/amt";
import { namesOnReturn } from "../tax/household";
import { BLANK, FieldMap, MappedField, OFF, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;

function form6251Map(taxYear: number): FieldMap {
  const y25 = taxYear >= 2025;
  const P1 = "topmostSubform[0].Page1[0].";
  const P2 = "topmostSubform[0].Page2[0].";
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, v: (x: Form6251Lines, t: FakeTaxpayer) => string, text = false) => {
    fields[name] = { key, value: (t) => v(computeReturn(source(t)).form6251, source(t)), ...(text ? { text } : {}) };
  };
  const neg = (n: number) => (n < 0 ? `(${money(-n)})` : money(n));
  add(`${P1}f1_1[0]`, "names", (_x, t) => namesOnReturn(t), true);
  add(`${P1}f1_2[0]`, "ssn", (_x, t) => t.ssn, true);
  const off = y25 ? 1 : 0;
  if (y25) {
    add(`${P1}f1_3[0]`, "line1a", (x) => money(x.line1a ?? 0));
    add(`${P1}f1_4[0]`, "line1b", (x) => neg(x.line1), true);
  } else {
    add(`${P1}f1_3[0]`, "line1", (x) => neg(x.line1), true);
  }
  // Line 2a–2t (20 lines), then 3: only 2a and 2i are modelled.
  const letters = "abcdefghijklmnopqrst";
  for (let i = 0; i < 20; i++) {
    const n = 4 + off + i;
    const l = letters[i];
    add(`${P1}f1_${n}[0]`, `line2${l}`, (x) => (l === "a" ? money(x.line2a) : l === "i" && x.line2i ? money(x.line2i) : BLANK));
  }
  const p1: Array<[number, string, (x: Form6251Lines) => string]> = [
    [24, "line3", () => BLANK], [25, "line4", (x) => money(x.line4)], [26, "line5", (x) => money(x.line5)],
    [27, "line6", (x) => money(x.line6)], [28, "line7", (x) => money(x.line7)], [29, "line8", () => BLANK],
    [30, "line9", (x) => money(x.line9)], [31, "line10", (x) => money(x.line10)], [32, "line11", (x) => money(x.line11)],
  ];
  for (const [n, key, v] of p1) add(`${P1}f1_${n + off}[0]`, key, v);
  // Part III: lines 12–40 → f2_1–f2_29 (blank unless Part III applies).
  for (let line = 12; line <= 40; line++) {
    add(`${P2}f2_${line - 11}[0]`, `line${line}`, (x) => {
      const v = x.partIII?.[`l${line}`];
      return v === undefined ? BLANK : money(v);
    });
  }
  return { formId: "f6251", taxYear, strict: true, fields };
}

/** ISO exercises on this return (a spouse's only when filing jointly). */
export const includedIsoExercises = (t: FakeTaxpayer): IsoExercise[] =>
  (t.isoExercises ?? []).filter((x) => x.employee !== "spouse" || t.filingStatus === "MFJ");

function form3921Map(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const copies: Array<[string, number, string, string[]]> = [
    ["CopyA", 1, "LftCol", ["c1_1[0]", "c1_1[1]"]], ["CopyB", 2, "LeftColumn", ["CopyHeader[0].c2_1[0]"]], ["CopyC", 2, "LeftColumn", ["c2_1[0]"]],
  ];
  const ex = (t: FakeTaxpayer) => includedIsoExercises(source(t))[t.document?.isoIndex ?? 0];
  for (const [copy, p, left, boxes] of copies) {
    const C = `topmostSubform[0].${copy}[0].`;
    const add = (name: string, key: string, v: (x: IsoExercise, t: FakeTaxpayer) => string, text = true) => {
      fields[`${C}${name}`] = { key: `${copy}.${key}`, value: (t) => { const x = ex(t); return x ? v(x, source(t)) : BLANK; }, ...(text ? { text } : {}) };
    };
    boxes.forEach((b, i) => { fields[`${C}${b}`] = { key: `${copy}.corrected${i}`, value: () => OFF }; });
    const person = (x: IsoExercise, t: FakeTaxpayer) => x.employee === "spouse"
      ? { name: `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}`, tin: t.spouseSSN ?? "" }
      : { name: `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " "), tin: t.ssn };
    add(`${left}[0].f${p}_1[0]`, "transferor", (x) => `${x.corporation.name}\n${x.corporation.street}\n${x.corporation.city}`);
    add(`${left}[0].f${p}_2[0]`, "transferorTin", (x) => x.corporation.ein);
    add(`${left}[0].f${p}_3[0]`, "employeeTin", (x, t) => person(x, t).tin);
    add(`${left}[0].f${p}_4[0]`, "employeeName", (x, t) => person(x, t).name);
    add(`${left}[0].f${p}_5[0]`, "street", (_x, t) => [t.streetAddress, t.aptNumber].filter(Boolean).join(" "));
    add(`${left}[0].f${p}_6[0]`, "city", (_x, t) => `${t.city}, ${t.state} ${t.zipCode}`);
    add(`${left}[0].f${p}_7[0]`, "account", (x) => x.account ?? BLANK);
    add(`RghtCol[0].f${p}_8[0]`, "box1", (x) => x.dateGranted);
    add(`RghtCol[0].f${p}_9[0]`, "box2", (x) => x.dateExercised);
    add(`RghtCol[0].f${p}_10[0]`, "box3", (x) => money(x.exercisePrice), false);
    add(`RghtCol[0].f${p}_11[0]`, "box4", (x) => money(x.fairMarketValue), false);
    add(`RghtCol[0].f${p}_12[0]`, "box5", (x) => String(x.shares));
    add(`RghtCol[0].f${p}_13[0]`, "box6", () => BLANK);
  }
  return { formId: "f3921", taxYear, strict: true, fields };
}

export const AMT_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [form6251Map(y), form3921Map(y)]);
