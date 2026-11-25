/**
 * Form 1099-R field map, 2023–2025: one document per distribution on the return
 * (a spouse's only when filing jointly). Every copy carries the same values.
 * Field names come from the generated f1099r.layout.ts (scripts/gen-1099r-map.ts).
 *
 * Box 2a is blank for a code Q distribution (the payer leaves it blank when the
 * distribution is a qualified Roth distribution) and 0.00 for a code G direct
 * rollover, as the 1099-R instructions require. Boxes 3, 6, 8–11 and the local
 * boxes 17–19 aren't modelled and stay blank.
 */
import { FakeTaxpayer, Retirement1099R } from "../faker/taxpayer";
import { computeReturn } from "../tax/compute";
import { personName } from "./business";
import { F1099R_LAYOUT } from "./f1099r.layout";
import { BLANK, FieldMap, MappedField, OFF, checkIf, money } from "./types";

const source = (t: FakeTaxpayer) => t.document?.source ?? t;
const moneyOrBlank = (n: number | undefined) => (n == null || n === 0 ? BLANK : money(n));

/** The 1099-Rs this return reports, in document order. */
export const reported1099Rs = (t: FakeTaxpayer): Retirement1099R[] => computeReturn(t).retirement.records.map((x) => x.r);

type Value = (r: Retirement1099R, t: FakeTaxpayer) => string;

const VALUES: Record<string, Value> = {
  payer: (r) => `${r.payerName}\n${r.payerStreet}\n${r.payerCity}`,
  payerTin: (r) => r.payerTin,
  recipientTin: (r, t) => (r.recipient === "spouse" ? t.spouseSSN ?? BLANK : t.ssn),
  recipientName: (r, t) => personName(t, r.recipient === "spouse" ? "spouse" : "primary"),
  street: (_r, t) => [t.streetAddress, t.aptNumber].filter(Boolean).join(" "),
  city: (_r, t) => `${t.city}, ${t.state} ${t.zipCode}`,
  account: (r) => r.accountNumber ?? BLANK,
  box1: (r) => money(r.grossDistribution),
  box2a: (r) => (r.distributionCode === "Q" ? BLANK : money(r.taxableAmount)),
  "box2b.notDetermined": (r) => checkIf(r.taxableAmountNotDetermined),
  "box2b.total": (r) => checkIf(r.totalDistribution),
  box4: (r) => moneyOrBlank(r.federalWithheld),
  box5: (r) => moneyOrBlank(r.employeeContributions),
  box7: (r) => r.distributionCode,
  "box7.iraSepSimple": (r) => checkIf(r.iraSepSimple),
  box14a: (r) => moneyOrBlank(r.stateWithheld),
  box15a: (r) => (r.stateWithheld ? `${r.stateCode} ${r.statePayerNumber}` : BLANK),
  box16a: (r) => (r.stateWithheld ? money(r.grossDistribution) : BLANK),
};
const CHECKBOX_KEYS = /^(void|corrected|box2b\.|box7\.|box12\.)/;
const TEXT_KEYS = /^(payer|payerTin|recipientTin|recipientName|street|city|account|box7|box8pct|box9a|box11|box13|box15a|box15b|box18a|box18b)$/;

function build1099R(taxYear: number): FieldMap {
  const fields: Record<string, MappedField> = {};
  for (const [name, copyKey] of Object.entries(F1099R_LAYOUT[taxYear])) {
    const key = copyKey.split(".").slice(1).join(".");
    const fn = VALUES[key];
    const isBox = CHECKBOX_KEYS.test(key);
    fields[name] = {
      key: copyKey,
      ...(!isBox && TEXT_KEYS.test(key) ? { text: true } : {}),
      value: (t) => {
        const r = reported1099Rs(source(t))[t.document?.retirementIndex ?? 0];
        if (!r) return isBox ? OFF : BLANK;
        return fn ? fn(r, source(t)) : isBox ? OFF : BLANK;
      },
    };
  }
  return { formId: "f1099r", taxYear, strict: true, fields };
}

export const F1099R_MAPS: FieldMap[] = [2023, 2024, 2025].map(build1099R);
