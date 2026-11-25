/**
 * Synthetic incentive stock option exercises (Form 3921 → Form 6251 line 2i), drawn AFTER
 * every other draw so seeds keep their households. About 5% of households where someone
 * earns $90,000+ in W-2 wages exercise one ISO grant from that employer (the W-2's name,
 * address and EIN), granted 2–6 years earlier, and hold the shares at year end. The spread
 * (fair market value − exercise price) × shares is $20,000–$350,000, so some of these
 * returns owe AMT.
 */
import { Faker } from "@faker-js/faker";
import { FakeTaxpayer, IsoExercise } from "./taxpayer";

const round2 = (n: number) => Math.round(n * 100) / 100;
const date = (faker: Faker, year: number) =>
  `${String(faker.number.int({ min: 1, max: 12 })).padStart(2, "0")}/${String(faker.number.int({ min: 1, max: 28 })).padStart(2, "0")}/${year}`;

export function buildIsoExercises(faker: Faker, t: FakeTaxpayer): IsoExercise[] | undefined {
  const go = faker.datatype.boolean({ probability: 0.05 });
  const price = round2(faker.number.float({ min: 1, max: 30, fractionDigits: 2 }));
  const multiple = faker.number.float({ min: 1.5, max: 8, fractionDigits: 2 });
  const spread = faker.number.int({ min: 20000, max: 350000 });
  const yearsAgo = faker.number.int({ min: 2, max: 6 });
  const granted = date(faker, t.taxYear - yearsAgo);
  const exercised = date(faker, t.taxYear);
  const account = faker.string.numeric(8);
  const onReturn = t.w2Records.filter((w) => w.employee !== "spouse" || t.filingStatus === "MFJ");
  const w = [...onReturn].sort((a, b) => b.wages - a.wages)[0];
  if (!go || !w || w.wages < 90000) return undefined;
  const fmv = round2(price * multiple);
  const shares = Math.max(100, Math.round(spread / (fmv - price)));
  return [{
    employee: w.employee ?? "primary",
    corporation: { name: w.employerName, street: w.employerStreet, city: `${w.employerCity}, ${w.employerState} ${w.employerZip}`, ein: w.employerEin },
    dateGranted: granted, dateExercised: exercised, exercisePrice: price, fairMarketValue: fmv, shares, account,
  }];
}
