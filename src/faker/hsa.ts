/**
 * Synthetic health savings accounts (Form 8889, W-2 box 12 code W, Form 1099-SA), drawn
 * AFTER every other draw so seeds keep their households.
 *
 * About 15% of households have an HSA, held by the main earner (largest W-2 on the return),
 * when everyone on the return is under 65 (no Medicare) and there's no Marketplace policy.
 * Coverage is family on a joint return or with dependents, otherwise self-only. 60% of those
 * HSAs get an employer contribution (W-2 box 12 code W, $250–$2,000; box 1 is already net of
 * it); the holder contributes 20–100% of the room that's left, so there's never an excess.
 * 45% take a distribution (Form 1099-SA, $150–$4,000); about 1 in 10 of those spends part
 * of it on something other than medical care (taxable, plus the 20% additional tax).
 */
import { Faker } from "@faker-js/faker";
import { FakeTaxpayer, HsaAccount } from "./taxpayer";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

export function addHsa(faker: Faker, t: FakeTaxpayer, limit: { self: number; family: number }, catchUp: number): void {
  const go = faker.datatype.boolean({ probability: 0.15 });
  const employerGo = faker.datatype.boolean({ probability: 0.6 });
  const employerAmt = dollars(faker, 250, 2000);
  const share = faker.number.float({ min: 0.2, max: 1, fractionDigits: 3 });
  const distGo = faker.datatype.boolean({ probability: 0.45 });
  const distAmt = dollars(faker, 150, 4000);
  const nonQualified = faker.datatype.boolean({ probability: 0.1 });
  const qualifiedShare = faker.number.float({ min: 0.6, max: 0.95, fractionDigits: 3 });
  const trustee = {
    name: `${faker.company.name()} HSA Bank`, street: faker.location.streetAddress(),
    city: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode("#####")}`,
    tin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
  };
  const account = faker.string.numeric(10);

  const joint = t.filingStatus === "MFJ";
  const ages = [t.dateOfBirth, joint ? t.spouseDateOfBirth : null].filter((d): d is string => !!d).map((d) => t.taxYear - Number(d.split("/")[2]));
  const onReturn = t.w2Records.filter((w) => w.employee !== "spouse" || joint);
  const main = [...onReturn].sort((a, b) => b.wages - a.wages)[0];
  if (!go || !main || ages.some((a) => a >= 65) || t.marketplace1095As?.length) return;

  const who = main.employee ?? "primary";
  const family = joint || t.dependents.length > 0;
  const holderAge = t.taxYear - Number(((who === "primary" ? t.dateOfBirth : t.spouseDateOfBirth) ?? "").split("/")[2]);
  const max = (family ? limit.family : limit.self) + (holderAge >= 55 ? catchUp : 0);
  const employer = employerGo ? Math.min(employerAmt, max) : 0;
  if (employer > 0) main.box12 = [...(main.box12 ?? []), { code: "W", amount: employer }];
  const account_: HsaAccount = {
    coverage: family ? "family" : "self",
    contributions: Math.floor((max - employer) * share),
  };
  if (distGo) {
    account_.distribution = { trustee, account, gross: distAmt, qualifiedMedical: nonQualified ? round2(distAmt * qualifiedShare) : distAmt };
  }
  t.hsa = { [who]: account_ };
}
