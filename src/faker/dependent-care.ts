/**
 * Synthetic child care for Form 2441, drawn AFTER every other draw so seeds keep their
 * households. About 45% of eligible households pay for care: those with a qualifying child
 * under 13 at year end (Form 2441's test) where the filer works (both spouses on a joint return) and the return
 * isn't married filing separately. Each qualifying child gets $1,500–$9,000 of care,
 * paid to one or two providers: a daycare center (EIN) or an individual sitter (SSN) who
 * isn't a household employee (no Schedule H). Provider amounts add up to the expenses.
 */
import { Faker } from "@faker-js/faker";
import { CareProvider, DependentCare, FakeTaxpayer } from "./taxpayer";
import { includedW2s } from "../tax/household";
import { isQualifyingCarePerson } from "../tax/dependent-care";
import { cityStateZip } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

function provider(faker: Faker): Omit<CareProvider, "amountPaid"> {
  const center = faker.datatype.boolean({ probability: 0.65 });
  return {
    name: center
      ? `${faker.company.name()} ${faker.helpers.arrayElement(["Child Care Center", "Learning Center", "Kids Academy", "Early Learning"])}`
      : `${faker.person.firstName()} ${faker.person.lastName()}`,
    street: faker.location.streetAddress(),
    city: cityStateZip(faker),
    tin: center
      ? `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`
      : `${faker.number.int({ min: 100, max: 665 })}-${faker.string.numeric(2)}-${faker.string.numeric(4)}`,
  };
}

export function buildDependentCare(faker: Faker, t: FakeTaxpayer): DependentCare | undefined {
  const kids = t.dependents.map((d, i) => ({ d, i })).filter(({ d, i }) => t.taxYear - d.birthYear < 13 && isQualifyingCarePerson(t, i));
  const w2s = includedW2s(t);
  const works = (who: "primary" | "spouse") =>
    w2s.some((w) => (w.employee ?? "primary") === who && w.wages > 0)
    || (t.scheduleCs ?? []).some((b) => (b.owner ?? "primary") === who && b.grossReceipts > 0);
  const eligible = kids.length > 0 && t.filingStatus !== "MFS" && works("primary") && (t.filingStatus !== "MFJ" || works("spouse"));
  if (!faker.datatype.boolean({ probability: 0.45 }) || !eligible) return undefined;
  const expenses = kids.map(({ i }) => ({ dependentIndex: i, amount: dollars(faker, 1500, 9000) }));
  const total = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const n = faker.datatype.boolean({ probability: 0.3 }) ? 2 : 1;
  const first = n === 2 ? round2(total * faker.number.float({ min: 0.3, max: 0.7, fractionDigits: 2 })) : total;
  const providers: CareProvider[] = [{ ...provider(faker), amountPaid: first }];
  if (n === 2) providers.push({ ...provider(faker), amountPaid: round2(total - first) });
  return { providers, expenses };
}
