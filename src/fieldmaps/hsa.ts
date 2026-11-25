/**
 * Form 8889 and Form 1099-SA field maps, 2023–2025.
 *
 * Form 8889: the same field names every year. One form per person with an HSA (a joint
 * return files one per spouse); Part III (failing to stay an eligible individual) stays
 * blank. Form 1099-SA (continuous-use, Rev. April 2025, with a calendar-year box): one per
 * person with a distribution; distribution code 1 (normal), box 5 "HSA".
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { Form8889Lines } from "../tax/hsa";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const P1 = "topmostSubform[0].Page1[0].";

const person = (t: FakeTaxpayer, who: "primary" | "spouse") => who === "spouse"
  ? { name: `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}`.trim(), ssn: t.spouseSSN ?? "" }
  : { name: `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " "), ssn: t.ssn };

function form8889Map(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const f = (t: FakeTaxpayer): Form8889Lines | undefined =>
    computeReturn(source(t)).schedule1.hsa?.forms.find((x) => x.person === (t.document?.hsaPerson ?? "primary"));
  const add = (name: string, key: string, v: (x: Form8889Lines, t: FakeTaxpayer) => string, opts: { text?: boolean; box?: boolean } = {}) => {
    fields[`${P1}${name}`] = { key, value: (t) => { const x = f(t); return x ? v(x, source(t)) : opts.box ? OFF : BLANK; }, ...(opts.text ? { text: true } : {}) };
  };
  add("f1_1[0]", "name", (x, t) => person(t, x.person).name, { text: true });
  add("f1_2[0]", "ssn", (x, t) => person(t, x.person).ssn, { text: true });
  add("c1_1[0]", "line1.self", (x) => checkIf(x.coverage === "self"), { box: true });
  add("c1_1[1]", "line1.family", (x) => checkIf(x.coverage === "family"), { box: true });
  const lines: Array<[string, string, (x: Form8889Lines) => string]> = [
    ["f1_3", "line2", (x) => money(x.line2)], ["f1_4", "line3", (x) => money(x.line3)], ["f1_5", "line4", () => BLANK],
    ["f1_6", "line5", (x) => money(x.line5)], ["f1_7", "line6", (x) => money(x.line6)], ["f1_8", "line7", (x) => (x.line7 ? money(x.line7) : BLANK)],
    ["f1_9", "line8", (x) => money(x.line8)], ["f1_10", "line9", (x) => (x.line9 ? money(x.line9) : BLANK)], ["f1_11", "line10", () => BLANK],
    ["f1_12", "line11", (x) => (x.line11 ? money(x.line11) : BLANK)], ["f1_13", "line12", (x) => money(x.line12)], ["f1_14", "line13", (x) => money(x.line13)],
    ["f1_15", "line14a", (x) => (x.line14a ? money(x.line14a) : BLANK)], ["f1_16", "line14b", () => BLANK],
    ["f1_17", "line14c", (x) => (x.line14a ? money(x.line14c) : BLANK)], ["f1_18", "line15", (x) => (x.line14a ? money(x.line15) : BLANK)],
    ["f1_19", "line16", (x) => (x.line14a ? money(x.line16) : BLANK)], ["f1_20", "line17b", (x) => (x.line17b ? money(x.line17b) : BLANK)],
    ["f1_21", "line18", () => BLANK], ["f1_22", "line19", () => BLANK], ["f1_23", "line20", () => BLANK], ["f1_24", "line21", () => BLANK],
  ];
  for (const [n, key, v] of lines) add(`${n}[0]`, key, v);
  add("c1_2[0]", "line17a", (x) => checkIf(x.exception17a), { box: true });
  return { formId: "f8889", taxYear, strict: true, fields };
}

/** People with an HSA distribution, in document order. */
export const hsaDistributionPeople = (t: FakeTaxpayer): Array<"primary" | "spouse"> =>
  (["primary", "spouse"] as const).filter((p) => (p === "primary" || t.filingStatus === "MFJ") && !!t.hsa?.[p]?.distribution);

function form1099SAMap(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const R = "Form1099-SA[0].";
  const copies: Array<[string, string, string, string, string[]]> = [
    ["CopyA", "LeftColumn", "rightColumn", "rightColumn[0].f1_1[0]", ["copyAheader[0].c1_1[0]", "copyAheader[0].c1_1[1]"]],
    ["CopyB", "LeftCol", "RightCol", "CopyBHeader[0].f1_1[0]", ["CopyBHeader[0].c1_1[0]"]],
  ];
  for (const [copy, left, right, year, boxes] of copies) {
    const C = `${R}${copy}[0].`;
    const d = (t: FakeTaxpayer) => { const p = t.document?.hsaPerson ?? "primary"; return { p, x: source(t).hsa?.[p]?.distribution }; };
    const add = (name: string, key: string, v: (t: FakeTaxpayer, p: "primary" | "spouse", x: NonNullable<ReturnType<typeof d>["x"]>) => string, box = false, text = true) => {
      fields[`${C}${name}`] = { key: `${copy}.${key}`, value: (t) => { const { p, x } = d(t); return x ? v(source(t), p, x) : box ? OFF : BLANK; }, ...(!box && text ? { text: true } : {}) };
    };
    add(year, "calendarYear", (t) => String(t.taxYear));
    boxes.forEach((b, i) => add(b, `corrected${i}`, () => OFF, true));
    add(`${left}[0].f1_2[0]`, "payer", (_t, _p, x) => `${x.trustee.name}\n${x.trustee.street}\n${x.trustee.city}`);
    add(`${left}[0].f1_3[0]`, "payerTin", (_t, _p, x) => x.trustee.tin);
    add(`${left}[0].f1_4[0]`, "recipientTin", (t, p) => person(t, p).ssn);
    add(`${left}[0].f1_5[0]`, "recipientName", (t, p) => person(t, p).name);
    add(`${left}[0].f1_6[0]`, "street", (t) => [t.streetAddress, t.aptNumber].filter(Boolean).join(" "));
    add(`${left}[0].f1_7[0]`, "city", (t) => `${t.city}, ${t.state} ${t.zipCode}`);
    add(`${left}[0].f1_8[0]`, "account", (_t, _p, x) => x.account ?? BLANK);
    add(`${right}[0].f1_9[0]`, "box1", (_t, _p, x) => money(x.gross), false, false);
    add(`${right}[0].f1_10[0]`, "box2", () => BLANK, false, false);
    add(`${right}[0].f1_11[0]`, "box3", () => "1");
    add(`${right}[0].f1_12[0]`, "box4", () => BLANK);
    add(`${right}[0].c1_2[0]`, "box5.hsa", () => "Yes", true);
    add(`${right}[0].c1_2[1]`, "box5.archerMsa", () => OFF, true);
    add(`${right}[0].c1_2[2]`, "box5.maMsa", () => OFF, true);
  }
  return { formId: "f1099sa", taxYear, strict: true, fields };
}

export const HSA_MAPS: FieldMap[] = [2023, 2024, 2025].flatMap((y) => [form8889Map(y), form1099SAMap(y)]);
