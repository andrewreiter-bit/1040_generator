/**
 * Form W-2G (Rev. December 2023, continuous use: the revision in effect for 2023–2025 winnings;
 * irs.gov's January 2026 revision is for 2026 payments). Six copies (A, 1, B, C, 2, D) share one
 * layout; every copy gets the same values. One form per W-2G on the return (a spouse's only on a
 * joint return). State and local boxes (13–18) and the race/cashier/window/ID boxes stay blank.
 */
import { FakeTaxpayer, GamblingWinnings } from "../faker/taxpayer";
import { BLANK, FieldMap, MappedField, OFF, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const R = "topmostSubform[0].";
const COPIES = ["CopyA", "Copy1", "CopyB", "CopyC", "Copy2", "CopyD"];

/** W-2Gs on this return, in document order. */
export const includedW2gs = (t: FakeTaxpayer): GamblingWinnings[] =>
  (t.gamblingWinnings ?? []).filter((g) => g.recipient !== "spouse" || t.filingStatus === "MFJ");

function w2gMap(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  const g = (t: FakeTaxpayer) => includedW2gs(source(t))[t.document?.w2gIndex ?? 0];
  const add = (name: string, key: string, v: (x: GamblingWinnings, t: FakeTaxpayer) => string, text = true) => {
    fields[name] = { key, value: (t) => { const x = g(t); return x ? v(x, source(t)) : BLANK; }, ...(text ? { text: true } : {}) };
  };
  const winner = (x: GamblingWinnings, t: FakeTaxpayer) => x.recipient === "spouse"
    ? { name: `${t.spouseFirstName ?? ""} ${t.spouseLastName ?? t.lastName}`.trim(), tin: t.spouseSSN ?? "" }
    : { name: `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " "), tin: t.ssn };
  for (const c of COPIES) {
    const C = `${R}${c}[0].`;
    add(`${C}${c}Header[0].f1_01[0]`, `${c}.year`, () => String(taxYear).slice(2));
    fields[`${C}${c}Header[0].c1_1[0]`] = { key: `${c}.corrected`, value: () => OFF };
    if (c === "CopyA" || c === "Copy1" || c === "CopyD") fields[`${C}${c}Header[0].c1_1[1]`] = { key: `${c}.void`, value: () => OFF };
    const L = `${C}Col_Left[0].`, Rt = `${C}Col_Right[0].`;
    add(`${L}f1_02[0]`, `${c}.payer`, (x) => [x.payerName, x.payerStreet, x.payerCity].filter(Boolean).join("\n"));
    add(`${L}f1_03[0]`, `${c}.payerTin`, (x) => x.payerTin);
    add(`${L}f1_04[0]`, `${c}.payerPhone`, () => BLANK);
    add(`${L}f1_05[0]`, `${c}.winnerName`, (x, t) => winner(x, t).name);
    add(`${L}f1_06[0]`, `${c}.winnerStreet`, (_x, t) => t.streetAddress);
    add(`${L}f1_07[0]`, `${c}.winnerCity`, (_x, t) => `${t.city}, ${t.state} ${t.zipCode}`);
    add(`${Rt}Box1[0].f1_08[0]`, `${c}.box1`, (x) => money(x.winnings), false);
    add(`${Rt}f1_09[0]`, `${c}.box2`, (x) => x.dateWon ?? BLANK);
    add(`${Rt}f1_10[0]`, `${c}.box3`, (x) => x.wagerType ?? BLANK);
    add(`${Rt}f1_11[0]`, `${c}.box4`, (x) => (x.federalWithheld ? money(x.federalWithheld) : BLANK), false);
    for (const [n, k] of [[12, "box5"], [13, "box6"], [15, "box8"], [17, "box10"], [18, "box11"], [19, "box12"], [20, "box13"], [25, "box18"]] as const) add(`${Rt}f1_${n}[0]`, `${c}.${k}`, () => BLANK);
    add(`${Rt}Box7[0].f1_14[0]`, `${c}.box7`, () => BLANK, false);
    add(`${Rt}f1_16[0]`, `${c}.box9`, (x, t) => winner(x, t).tin);
    add(`${Rt}f1_21[0]`, `${c}.box14`, () => BLANK, false);
    add(`${Rt}Box15[0].f1_22[0]`, `${c}.box15`, () => BLANK, false);
    add(`${Rt}f1_23[0]`, `${c}.box16`, () => BLANK, false);
    add(`${Rt}Box17[0].f1_24[0]`, `${c}.box17`, () => BLANK, false);
  }
  return { formId: "fw2g", taxYear, strict: true, fields };
}

export const W2G_MAPS: FieldMap[] = [2023, 2024, 2025].map(w2gMap);
