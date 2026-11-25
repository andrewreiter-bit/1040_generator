/**
 * Synthetic Forms 1099-R for the profiles, drawn AFTER every existing draw so
 * each seed keeps its household. Each person on the return (the spouse only
 * when filing jointly) gets distributions that fit their age at year end:
 *
 *   73+     IRA required minimum distribution (code 7, IRA box, 2a = box 1 with
 *           "taxable amount not determined"), often a pension, sometimes a Roth (Q)
 *   61–72   sometimes a pension or an IRA distribution (code 7), rarely a Roth (Q)
 *   25–58   rarely an early distribution — code 1 (10% additional tax) or code 2
 *           (exception applies) — or a 401(k) direct rollover to an IRA (code G)
 *
 * Ages 59–60 draw nothing, so a code 7 is never dated before 59½. Pensions
 * are fully taxable unless the employee contributed (box 5), in which case box 2a
 * is box 1 less box 5 (the payer's Simplified Method figure). Payers are
 * synthetic; withholding follows the usual defaults (20% on an eligible rollover
 * distribution from a plan paid to the employee, often 10% from an IRA).
 */
import { Faker } from "@faker-js/faker";
import { DistributionCode, FakeTaxpayer, Retirement1099R } from "./taxpayer";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

const ageAtYearEnd = (dob: string | null, taxYear: number) => (dob ? taxYear - Number(dob.split("/")[2]) : NaN);

function payer(faker: Faker, kind: "ira" | "pension" | "roth" | "plan") {
  const suffix = { ira: "IRA Custodian", pension: "Pension Plan", roth: "Roth IRA Custodian", plan: "401(k) Plan" }[kind];
  return {
    payerName: `${faker.company.name()} ${suffix}`,
    payerTin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
    payerStreet: faker.location.streetAddress(),
    payerCity: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })} ${faker.location.zipCode("#####")}`,
    accountNumber: faker.string.numeric(10),
  };
}

function distribution(
  faker: Faker, t: FakeTaxpayer, recipient: "primary" | "spouse",
  kind: "ira" | "pension" | "roth" | "plan", code: DistributionCode, gross: number,
): Retirement1099R {
  const isIra = kind === "ira" || kind === "roth";
  let taxable = gross;
  let employeeContributions: number | undefined;
  if (code === "G" || code === "Q") taxable = 0;
  else if (kind === "pension" && faker.datatype.boolean({ probability: 0.25 })) {
    employeeContributions = round2(gross * faker.number.float({ min: 0.03, max: 0.12, fractionDigits: 3 }));
    taxable = round2(gross - employeeContributions);
  }
  let withheld = 0;
  if (code === "G" || code === "Q") withheld = 0;
  else if (kind === "plan") withheld = round2(taxable * 0.2);
  else if (faker.datatype.boolean({ probability: 0.6 })) withheld = round2(taxable * faker.helpers.arrayElement([0.1, 0.1, 0.12, 0.15]));
  const stateWithholds = withheld > 0 && faker.datatype.boolean({ probability: 0.3 });
  return {
    recipient,
    ...payer(faker, kind),
    grossDistribution: gross,
    taxableAmount: taxable,
    // Traditional IRA payers check "not determined"; a direct rollover moves the whole account.
    taxableAmountNotDetermined: kind === "ira",
    totalDistribution: code === "G",
    federalWithheld: withheld,
    employeeContributions,
    distributionCode: code,
    iraSepSimple: isIra,
    stateWithheld: stateWithholds ? round2(taxable * 0.04) : undefined,
    stateCode: stateWithholds ? t.state : undefined,
    statePayerNumber: stateWithholds ? faker.string.numeric(9) : undefined,
  };
}

export function buildRetirement1099Rs(faker: Faker, t: FakeTaxpayer): Retirement1099R[] {
  const out: Retirement1099R[] = [];
  const people: Array<["primary" | "spouse", string | null]> = [["primary", t.dateOfBirth]];
  if (t.filingStatus === "MFJ") people.push(["spouse", t.spouseDateOfBirth]);
  for (const [who, dob] of people) {
    const age = ageAtYearEnd(dob, t.taxYear);
    if (age >= 73) {
      if (faker.datatype.boolean({ probability: 0.85 })) out.push(distribution(faker, t, who, "ira", "7", dollars(faker, 3000, 40000)));
      if (faker.datatype.boolean({ probability: 0.4 })) out.push(distribution(faker, t, who, "pension", "7", dollars(faker, 6000, 45000)));
      if (faker.datatype.boolean({ probability: 0.08 })) out.push(distribution(faker, t, who, "roth", "Q", dollars(faker, 2000, 20000)));
    } else if (age >= 61) {
      if (faker.datatype.boolean({ probability: 0.3 })) out.push(distribution(faker, t, who, "pension", "7", dollars(faker, 6000, 45000)));
      if (faker.datatype.boolean({ probability: 0.2 })) out.push(distribution(faker, t, who, "ira", "7", dollars(faker, 2000, 30000)));
      if (faker.datatype.boolean({ probability: 0.08 })) out.push(distribution(faker, t, who, "roth", "Q", dollars(faker, 2000, 20000)));
    } else if (age >= 25 && age <= 58) {
      if (faker.datatype.boolean({ probability: 0.07 })) {
        const code: DistributionCode = faker.datatype.boolean({ probability: 0.6 }) ? "1" : "2";
        const fromPlan = faker.datatype.boolean({ probability: 0.5 });
        out.push(distribution(faker, t, who, fromPlan ? "plan" : "ira", code, dollars(faker, 1000, 25000)));
      }
      if (faker.datatype.boolean({ probability: 0.05 })) {
        const rollover = distribution(faker, t, who, "plan", "G", dollars(faker, 5000, 120000));
        // Schedule 2 line 8 skips Form 5329 only when code 1 is on ALL of a person's 1099-Rs, so a
        // code 1 person keeps no rollover (dropped after its draws, so the RNG sequence is unchanged).
        if (!out.some((r) => r.recipient === who && r.distributionCode === "1")) out.push(rollover);
      }
    }
  }
  return out;
}
