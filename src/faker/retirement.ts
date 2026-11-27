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
import { cityStateZip } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

const ageAtYearEnd = (dob: string | null, taxYear: number) => (dob ? taxYear - Number(dob.split("/")[2]) : NaN);

function payer(faker: Faker, kind: "ira" | "pension" | "roth" | "plan") {
  const suffix = { ira: "IRA Custodian", pension: "Pension Plan", roth: "Roth IRA Custodian", plan: "401(k) Plan" }[kind];
  return {
    payerName: `${faker.company.name()} ${suffix}`,
    payerTin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
    payerStreet: faker.location.streetAddress(),
    payerCity: cityStateZip(faker),
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

/** § 402(g) elective deferral limit and the age-50 catch-up (IRS cost-of-living notices). */
const DEFERRAL_LIMIT: Record<number, number> = { 2023: 22500, 2024: 23000, 2025: 23500, 2026: 24500 };
const DEFERRAL_CATCH_UP: Record<number, number> = { 2023: 7500, 2024: 7500, 2025: 7500, 2026: 8000 };
/** IRA contribution limit and the age-50 catch-up. */
const IRA_LIMIT: Record<number, number> = { 2023: 6500, 2024: 7000, 2025: 7000, 2026: 7500 };
const IRA_CATCH_UP: Record<number, number> = { 2023: 1000, 2024: 1000, 2025: 1000, 2026: 1100 };
/** Draw Roth contributions only well below the Roth IRA income phase-out (it starts at $138,000 / $218,000 joint for 2023). */
const ROTH_INCOME_CEILING = { joint: 190000, other: 120000 };

/**
 * After every other draw: about 40% of W-2s show a 401(k) elective deferral (box 12 code D).
 * The § 402(g) limit is per person across all employers, so later W-2s get only what's left.
 * Box 1 stays as drawn (wages already net of the deferral); boxes 3 and 5 rise by the
 * deferral (box 3 up to the wage base) and boxes 4 and 6 are refigured at 6.2% / 1.45%.
 * About 10% of people on the return also contribute to a Roth IRA, but only in households
 * whose drawn income is well under the Roth phase-out, and never on a separate return by
 * someone who lived with their spouse (their phase-out range is $0–$10,000; Pub 590-A).
 * Both feed Form 8880.
 */
export function addRetirementSavings(faker: Faker, t: FakeTaxpayer, ssWageBase: number): void {
  const birthYear = (dob: string | null) => (dob ? Number(dob.split("/")[2]) : t.taxYear);
  const age = (who: "primary" | "spouse") => t.taxYear - birthYear(who === "spouse" ? t.spouseDateOfBirth : t.dateOfBirth);
  const remaining: Record<"primary" | "spouse", number> = {
    primary: (DEFERRAL_LIMIT[t.taxYear] ?? 23500) + (age("primary") >= 50 ? DEFERRAL_CATCH_UP[t.taxYear] : 0),
    spouse: (DEFERRAL_LIMIT[t.taxYear] ?? 23500) + (age("spouse") >= 50 ? DEFERRAL_CATCH_UP[t.taxYear] : 0),
  };
  for (const w of t.w2Records) {
    if (!faker.datatype.boolean({ probability: 0.4 })) continue;
    const who = w.employee ?? "primary";
    const drawn = round2(w.wages * faker.number.float({ min: 0.02, max: 0.12, fractionDigits: 3 }));
    const deferral = Math.min(remaining[who], drawn);
    if (deferral <= 0) continue;
    remaining[who] = round2(remaining[who] - deferral);
    w.box12 = [...(w.box12 ?? []), { code: "D", amount: deferral }];
    w.socialSecurityWages = Math.min(ssWageBase, round2(w.socialSecurityWages + deferral));
    w.medicareWages = round2(w.medicareWages + deferral);
    w.ssWithheld = round2(w.socialSecurityWages * 0.062);
    w.medicareWithheld = round2(w.medicareWages * 0.0145);
  }
  const income = t.totalWages + Math.max(0, t.businessIncome ?? 0);
  const ceiling = t.filingStatus === "MFJ" ? ROTH_INCOME_CEILING.joint : ROTH_INCOME_CEILING.other;
  const people: Array<"primary" | "spouse"> = t.filingStatus === "MFJ" ? ["primary", "spouse"] : ["primary"];
  for (const who of people) {
    const mfsTogether = t.filingStatus === "MFS" && t.mfsLivedWithSpouse !== false;
    if (!faker.datatype.boolean({ probability: 0.1 }) || income > ceiling || mfsTogether) continue;
    const max = (IRA_LIMIT[t.taxYear] ?? 7000) + (age(who) >= 50 ? IRA_CATCH_UP[t.taxYear] : 0);
    t.rothIraContributions = { ...(t.rothIraContributions ?? {}), [who]: round2(Math.min(max, dollars(faker, 500, max))) };
  }
}

/**
 * After every other draw: about 12% of people with wages contribute to a traditional IRA, but
 * only where nobody on the return is covered by a workplace plan (no W-2 box 13 / deferrals)
 * and nobody made Roth contributions, so the whole contribution is deductible (no phase-out,
 * no Form 8606) and the 1040 worksheet applies. Capped at the year's limit and their wages.
 */
export function addTraditionalIra(faker: Faker, t: FakeTaxpayer, limit: number, catchUp: number): void {
  const people: Array<"primary" | "spouse"> = t.filingStatus === "MFJ" ? ["primary", "spouse"] : ["primary"];
  const draws = people.map(() => ({ go: faker.datatype.boolean({ probability: 0.12 }), share: faker.number.float({ min: 0.15, max: 1, fractionDigits: 3 }) }));
  const onReturn = t.w2Records.filter((w) => w.employee !== "spouse" || t.filingStatus === "MFJ");
  const covered = onReturn.some((w) => w.retirementPlan ?? (w.box12 ?? []).some((e) => ["D", "E", "F", "G", "H", "S", "AA", "BB", "EE"].includes(e.code)));
  if (covered || t.rothIraContributions) return;
  people.forEach((who, i) => {
    const wages = onReturn.filter((w) => (w.employee ?? "primary") === who).reduce((s, w) => s + w.wages, 0);
    const age = t.taxYear - Number(((who === "primary" ? t.dateOfBirth : t.spouseDateOfBirth) ?? "").split("/")[2]);
    const max = Math.min(limit + (age >= 50 ? catchUp : 0), wages);
    if (!draws[i].go || max < 500) return;
    t.traditionalIraContributions = { ...(t.traditionalIraContributions ?? {}), [who]: Math.round(max * draws[i].share) };
  });
}
