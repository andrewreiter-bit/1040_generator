/**
 * retired_single — a single filer with a small pension and nothing else, sized so the credit for
 * the elderly or the disabled (Schedule R) is more than zero.
 *
 * Schedule R needs AGI under $17,500 for a single filer (less nontaxable Social Security), and a
 * credit needs tax to offset, so AGI must also be over the standard deduction. Married, head of
 * household and separate filers have no such window (their standard deductions exceed the
 * Schedule R limits), and a 65+ single filer has none in 2025 (the senior deduction). So:
 * - Disabled (every 2025 seed; 70% in 2023/2024): under 65, retired on permanent and total
 *   disability, with a code 3 pension received before minimum retirement age (Form 1040 line 1h,
 *   Schedule R box 2, line 11).
 * - Elderly (30% in 2023/2024): 65 or older with a fully taxable code 7 pension (box 1).
 * No Social Security (nontaxable benefits on line 13a would erase the credit; SSDI recipients
 * aren't Schedule R claimants) and no wages. The pension is drawn so AGI lands between the
 * standard deduction (+ $300) and $17,400; at most one small bank 1099-INT.
 */
import { Faker, en } from "@faker-js/faker";
import { FakeTaxpayer, Interest1099, Retirement1099R } from "./taxpayer";
import { additionalStandardDeduction, standardDeduction } from "./tax-year";
import { cityStateZip, zipInState } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

function fakeSSN(faker: Faker): string {
  let area: number;
  do { area = faker.number.int({ min: 1, max: 899 }); } while (area === 666);
  return `${String(area).padStart(3, "0")}-${String(faker.number.int({ min: 1, max: 99 })).padStart(2, "0")}-${String(faker.number.int({ min: 1, max: 9999 })).padStart(4, "0")}`;
}
const fakeTin = (faker: Faker) => `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`;

/** Top of AGI for a positive credit: just under the $17,500 single limit. */
const AGI_CAP = 17400;

export function createTaxpayer(seed?: number, taxYear = 2025): FakeTaxpayer {
  const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
  const faker = new Faker({ locale: [en] });
  faker.seed(resolvedSeed);

  const elderly = taxYear < 2025 && faker.datatype.boolean({ probability: 0.3 });
  const age = elderly ? faker.number.int({ min: 66, max: 80 }) : faker.number.int({ min: 35, max: 63 });
  const dob = `${String(faker.number.int({ min: 1, max: 12 })).padStart(2, "0")}/${String(faker.number.int({ min: 1, max: 28 })).padStart(2, "0")}/${taxYear - age}`;
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const state = faker.location.state({ abbreviated: true });

  const hasInterest = faker.datatype.boolean({ probability: 0.5 });
  const interestAmt = dollars(faker, 5, 150);
  const interest1099s: Interest1099[] = hasInterest
    ? [{ payerName: `${faker.company.name()} Bank`, payerTin: fakeTin(faker), interestIncome: interestAmt, earlyWithdrawalPenalty: 0, usSavingsBondInterest: 0 }]
    : [];
  const interest = hasInterest ? interestAmt : 0;

  const floor = standardDeduction(taxYear, "Single") + (elderly ? additionalStandardDeduction(taxYear, "Single") : 0) + 300;
  const pension = dollars(faker, floor, AGI_CAP - interest);
  const withheld = faker.datatype.boolean({ probability: 0.4 }) ? round2(pension * 0.03) : 0;
  const payer: Retirement1099R = {
    recipient: "primary",
    payerName: elderly ? `${faker.company.name()} Pension Plan` : `${faker.company.name()} Disability Plan`,
    payerTin: fakeTin(faker), payerStreet: faker.location.streetAddress(), payerCity: cityStateZip(faker),
    accountNumber: faker.string.numeric(10),
    grossDistribution: pension, taxableAmount: pension, taxableAmountNotDetermined: false, totalDistribution: false,
    federalWithheld: withheld, distributionCode: elderly ? "7" : "3", iraSepSimple: false,
    ...(elderly ? {} : { disabilityBeforeRetirementAge: true }),
  };

  const taxpayer: FakeTaxpayer = {
    seed: resolvedSeed,
    taxYear,
    firstName,
    middleInitial: faker.string.alpha({ length: 1, casing: "upper" }),
    lastName,
    ssn: fakeSSN(faker),
    dateOfBirth: dob,
    occupation: elderly ? "Retired" : "Disabled",
    phone: faker.phone.number(),
    streetAddress: faker.location.streetAddress(),
    aptNumber: faker.datatype.boolean({ probability: 0.3 }) ? `Apt ${faker.string.alphanumeric(3).toUpperCase()}` : null,
    city: faker.location.city(),
    state,
    zipCode: zipInState(state, faker.location.zipCode()),
    filingStatus: "Single",
    spouseFirstName: null,
    spouseLastName: null,
    spouseSSN: null,
    spouseDateOfBirth: null,
    spouseOccupation: null,
    dependents: [],
    routingNumber: "021000021",
    accountNumber: faker.string.numeric(10),
    accountType: "Checking",
    w2Records: [],
    interest1099s,
    dividend1099s: [],
    totalWages: 0,
    totalInterest: interest,
    totalDividends: 0,
    totalQualifiedDividends: 0,
    businessIncome: null,
    rentalIncome: null,
    capitalGains: null,
    socialSecurityBenefits: null,
    takesStandardDeduction: true,
    itemizedDeductionTotal: null,
    preparerPtin: null,
    retirement1099Rs: [payer],
    ...(elderly ? {} : { permanentlyDisabled: { primary: true } }),
  };
  return taxpayer;
}
