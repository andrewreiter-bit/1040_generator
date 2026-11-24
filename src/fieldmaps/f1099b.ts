/**
 * Form 1099-B field map, 2023–2025: one document per sale the broker reports
 * (Form 8949 box A/B/D/E; box C/F sales have no 1099-B). All four copies (A, 1,
 * B, 2) carry the same values. Field names come from the generated
 * f1099b.layout.ts (scripts/gen-1099b-map.ts).
 *
 * Box 1e is left blank and box 5 ("noncovered security") checked when basis was
 * not reported to the IRS; box 12 ("basis reported to IRS") is checked otherwise.
 * The broker's address is not modelled, so the payer box carries the name only.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { Form8949Row } from "../tax/capital";
import { computeReturn } from "../tax/compute";
import { personName } from "./business";
import { F1099B_LAYOUT } from "./f1099b.layout";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));

/** Sales that come with a Form 1099-B, in Form 8949 row order. */
export const reportedSales = (t: FakeTaxpayer): Form8949Row[] =>
  computeReturn(t).capital.rows.filter((r) => r.sale.reporting !== "noForm1099B");

type Value = (row: Form8949Row, t: FakeTaxpayer) => string;

const VALUES: Record<string, Value> = {
  payer: (r) => r.sale.brokerName,
  payerTin: (r) => r.sale.brokerTin,
  recipientTin: (r, t) => (r.sale.owner === "spouse" ? t.spouseSSN ?? BLANK : t.ssn),
  recipientName: (r, t) => personName(t, r.sale.owner === "spouse" ? "spouse" : "primary"),
  street: (_r, t) => [t.streetAddress, t.aptNumber].filter(Boolean).join(" "),
  city: (_r, t) => `${t.city}, ${t.state} ${t.zipCode}`,
  form8949Box: (r) => r.box,
  box1a: (r) => r.sale.description,
  box1b: (r) => r.sale.dateAcquired,
  box1c: (r) => r.sale.dateSold,
  box1d: (r) => money(r.proceeds),
  box1e: (r) => (r.sale.reporting === "basisReported" ? money(r.basis) : BLANK),
  box1f: (r) => moneyOrBlank(r.sale.accruedMarketDiscount),
  box1g: (r) => moneyOrBlank(r.sale.washSaleDisallowed),
  "box2.short": (r) => checkIf(r.term === "short"),
  "box2.long": (r) => checkIf(r.term === "long"),
  box4: (r) => moneyOrBlank(r.sale.federalWithheld),
  "box5.noncovered": (r) => checkIf(r.sale.reporting === "basisNotReported"),
  "box6.gross": () => "Yes",
  "box12.basisReported": (r) => checkIf(r.sale.reporting === "basisReported"),
};
/** Keys whose field is a checkbox (unchecked unless VALUES says otherwise). */
const CHECKBOX_KEYS = /^(corrected|secondTinNotice|fatca|box2\.|box3\.|box5\.|box6\.|box7\.|box12\.)/;

function build1099B(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  for (const [name, copyKey] of Object.entries(F1099B_LAYOUT[taxYear])) {
    const key = copyKey.split(".").slice(1).join(".");
    const fn = VALUES[key];
    const isBox = CHECKBOX_KEYS.test(key);
    fields[name] = {
      key: copyKey,
      text: !isBox && !/^box1[deg]$|^box4$|^box(8|9|10|11|13)$|^stateTax/.test(key),
      value: (t) => {
        const row = reportedSales(source(t))[t.document?.saleIndex ?? 0];
        if (!row) return isBox ? OFF : BLANK;
        return fn ? fn(row, source(t)) : isBox ? OFF : BLANK;
      },
    };
  }
  return { formId: "f1099b", taxYear, strict: true, fields };
}

export const F1099B_MAPS: FieldMap[] = [2023, 2024, 2025].map(build1099B);
