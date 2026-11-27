import { Faker, en } from "@faker-js/faker";
import {
  FakeTaxpayer,
  Dependent,
  W2Record,
  Interest1099,
  Dividend1099,
  FilingStatus,
} from "./taxpayer";
import { ALASKA_PFD, HSA_CATCH_UP, HSA_LIMIT, IRA_CATCH_UP, IRA_CONTRIBUTION_LIMIT, ssWageBase } from "./tax-year";
import { addBusinessPayrollAndProperty, addVehicleCosts, buildScheduleC } from "./schedule-c";
import { addRetirementSavings, addTraditionalIra, buildRetirement1099Rs } from "./retirement";
import { buildDependentCare } from "./dependent-care";
import { buildEducation } from "./education";
import { buildMarketplace } from "./marketplace";
import { buildIsoExercises } from "./iso";
import { addHsa } from "./hsa";
import { addExtras } from "./extras";
import { buildCapitalSales } from "./capital";
import { buildItemized, buildRental, buildSsa1099, makeRentalLoss } from "./schedules-ae";
import { zipInState } from "./zip";

// ─── Custom Generators ────────────────────────────────────────────────────────

function fakeSSN(faker: Faker): string {
  // Avoid invalid prefixes: 000, 666, 900-999
  let area: number;
  do { area = faker.number.int({ min: 1, max: 899 }); }
  while (area === 666);
  const group = faker.number.int({ min: 1, max: 99 });
  const serial = faker.number.int({ min: 1, max: 9999 });
  return `${String(area).padStart(3, "0")}-${String(group).padStart(2, "0")}-${String(serial).padStart(4, "0")}`;
}

function fakeEIN(faker: Faker): string {
  // Valid IRS EIN prefixes (campus/area codes)
  const prefixes = [10,12,11,13,14,15,16,20,21,22,23,24,25,26,27,
                    30,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,
                    47,48,50,51,52,53,54,55,56,57,58,59,60,61,62,63,
                    64,65,66,67,68,71,72,73,74,75,76,77,80,81,82,83,
                    84,85,86,87,88,90,91,92,93,94,95,98,99];
  const prefix = faker.helpers.arrayElement(prefixes);
  const suffix = faker.number.int({ min: 1000000, max: 9999999 });
  return `${prefix}-${suffix}`;
}

function fakeRoutingNumber(faker: Faker): string {
  // ABA routing numbers: first 2 digits are 01-12 (Federal Reserve routing) or 21-32
  const prefixes = ["01","02","03","04","05","06","07","08","09","10","11","12",
                    "21","22","23","24","25","26","27","28","29","30","31","32"];
  const prefix = faker.helpers.arrayElement(prefixes);
  // ABA is 9 digits: 8 base digits + 1 checksum
  // Formula: 3*(d0+d3+d6) + 7*(d1+d4+d7) + (d2+d5+d8) ≡ 0 mod 10
  const middle = faker.string.numeric(6); // 2 prefix + 6 middle = 8 base digits
  const base = prefix + middle;
  const d = base.split("").map(Number);
  const checksum = (10 - ((3*(d[0]+d[3]+d[6]) + 7*(d[1]+d[4]+d[7]) + (d[2]+d[5])) % 10)) % 10;
  return base + checksum;
}

function fakeDateInYear(faker: Faker, year: number): string {
  const start = new Date(year, 0, 1);
  const end   = new Date(year, 11, 31);
  const d = faker.date.between({ from: start, to: end });
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
}

/** Age minAge–maxAge at the end of the tax year (not today), so a seed gives the same household whenever it runs. */
function fakeBirthDate(faker: Faker, taxYear: number, minAge = 22, maxAge = 70): string {
  const year = taxYear - faker.number.int({ min: minAge, max: maxAge });
  const month = faker.number.int({ min: 1, max: 12 });
  const day   = faker.number.int({ min: 1, max: 28 });
  return `${String(month).padStart(2,"0")}/${String(day).padStart(2,"0")}/${year}`;
}

function fakeDollar(faker: Faker, min: number, max: number): number {
  return Math.round(faker.number.float({ min, max, fractionDigits: 2 }) * 100) / 100;
}

// ─── Dependent Builder ────────────────────────────────────────────────────────

function buildDependent(faker: Faker, taxYear: number, familyName: string): Dependent {
  // Unused, but kept so every later draw (and so every seed's household) stays the same.
  faker.number.int({ min: 20, max: 35 });
  // Age 0–17 at the end of the tax year (not "today"), so no child is born after the
  // tax year and the same seed gives the same household whenever it runs.
  const childBirthYear = taxYear - faker.number.int({ min: 0, max: 17 });
  const firstName = faker.person.firstName();
  faker.person.lastName(); // drawn but unused (children take the family name), so every later draw stays the same
  return {
    firstName,
    lastName: familyName,
    ssn: fakeSSN(faker),
    relationship: "Child",
    birthYear: childBirthYear,
    monthsInHome: faker.number.int({ min: 6, max: 12 }),
    qualifiesChildTaxCredit: childBirthYear > taxYear - 17, // informational; credits use tax/household
    qualifiesOtherDependent: false,
  };
}

// ─── W-2 Builder ─────────────────────────────────────────────────────────────

function buildW2(faker: Faker, state: string, taxYear: number): W2Record {
  const wages = fakeDollar(faker, 25000, 150000);
  const federalWithheld = Math.round(wages * faker.number.float({ min: 0.12, max: 0.24, fractionDigits: 3 }) * 100) / 100;
  const ssWages = Math.min(wages, ssWageBase(taxYear));
  const ssWithheld = Math.round(ssWages * 0.062 * 100) / 100;
  const medicareWages = wages;
  const medicareWithheld = Math.round(wages * 0.0145 * 100) / 100;
  const stateWithheld = Math.round(wages * faker.number.float({ min: 0.02, max: 0.08, fractionDigits: 3 }) * 100) / 100;

  return {
    employerName: faker.company.name(),
    employerEin: fakeEIN(faker),
    employerStreet: faker.location.streetAddress(),
    employerCity: faker.location.city(),
    employerState: state,
    employerZip: zipInState(state, faker.location.zipCode()),
    wages,
    federalWithheld,
    socialSecurityWages: ssWages,
    ssWithheld,
    medicareWages,
    medicareWithheld,
    stateWages: wages,
    stateWithheld,
    stateCode: state,
  };
}

// ─── Main Factory ─────────────────────────────────────────────────────────────

export function createTaxpayer(seed?: number, taxYear = 2025): FakeTaxpayer {
  const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);
  const faker = new Faker({ locale: [en] });
  faker.seed(resolvedSeed);

  const firstName = faker.person.firstName();
  const lastName  = faker.person.lastName();
  const state     = faker.location.state({ abbreviated: true });
  const birthDateStr = fakeBirthDate(faker, taxYear);
  const birthYear = parseInt(birthDateStr.split("/")[2]);

  const filingStatuses: FilingStatus[] = ["Single", "MFJ", "MFS", "HOH"];
  const filingStatus = faker.helpers.arrayElement(filingStatuses);
  const hasSPouse = filingStatus === "MFJ" || filingStatus === "MFS";

  // W-2s: 1-2 records
  const w2Count = faker.number.int({ min: 1, max: 2 });
  // On a joint return the second W-2 belongs to the spouse (no extra RNG draws).
  const w2Records: W2Record[] = Array.from({ length: w2Count }, () => buildW2(faker, state, taxYear))
    .map((w, i) => (i === 1 && filingStatus === "MFJ" ? { ...w, employee: "spouse" as const } : w));
  const totalWages = w2Records.reduce((s, w) => s + w.wages, 0);

  // 1099-INTs: 0-2
  const intCount = faker.number.int({ min: 0, max: 2 });
  const interest1099s: Interest1099[] = Array.from({ length: intCount }, () => ({
    payerName: faker.company.name() + " Bank",
    payerTin: fakeEIN(faker),
    interestIncome: fakeDollar(faker, 10, 2000),
    earlyWithdrawalPenalty: 0,
    usSavingsBondInterest: faker.datatype.boolean() ? fakeDollar(faker, 0, 500) : 0,
  }));
  const totalInterest = interest1099s.reduce((s, i) => s + i.interestIncome, 0);

  // 1099-DIVs: 0-2
  const divCount = faker.number.int({ min: 0, max: 2 });
  const dividend1099s: Dividend1099[] = Array.from({ length: divCount }, () => {
    const ordinary = fakeDollar(faker, 100, 5000);
    return {
      payerName: faker.company.name() + " Fund",
      payerTin: fakeEIN(faker),
      ordinaryDividends: ordinary,
      qualifiedDividends: Math.round(ordinary * faker.number.float({ min: 0.4, max: 0.9, fractionDigits: 2 }) * 100) / 100,
      totalCapitalGain: faker.datatype.boolean() ? fakeDollar(faker, 0, 1000) : 0,
    };
  });
  const totalDividends = dividend1099s.reduce((s, d) => s + d.ordinaryDividends, 0);
  const totalQualified = dividend1099s.reduce((s, d) => s + d.qualifiedDividends, 0);

  // Dependents: 0-3
  const depCount = faker.number.int({ min: 0, max: 3 });
  const dependents: Dependent[] = Array.from({ length: depCount }, () => buildDependent(faker, taxYear, lastName));

  const takesStandard = faker.datatype.boolean({ probability: 0.87 });

  const taxpayer: FakeTaxpayer = {
    seed: resolvedSeed,
    taxYear,
    firstName,
    middleInitial: faker.string.alpha({ length: 1, casing: "upper" }),
    lastName,
    ssn: fakeSSN(faker),
    dateOfBirth: birthDateStr,
    occupation: faker.person.jobTitle(),
    phone: faker.phone.number(),
    streetAddress: faker.location.streetAddress(),
    aptNumber: faker.datatype.boolean({ probability: 0.3 }) ? `Apt ${faker.string.alphanumeric(3).toUpperCase()}` : null,
    city: faker.location.city(),
    state,
    zipCode: zipInState(state, faker.location.zipCode()),
    filingStatus,
    spouseFirstName:   hasSPouse ? faker.person.firstName() : null,
    spouseLastName:    hasSPouse ? lastName : null,
    spouseSSN:         hasSPouse ? fakeSSN(faker) : null,
    spouseDateOfBirth: hasSPouse ? fakeBirthDate(faker, taxYear) : null,
    spouseOccupation:  hasSPouse ? faker.person.jobTitle() : null,
    dependents,
    routingNumber: fakeRoutingNumber(faker),
    accountNumber: faker.string.numeric({ length: { min: 8, max: 17 } }),
    accountType: faker.helpers.arrayElement(["Checking", "Savings"]),
    w2Records,
    interest1099s,
    dividend1099s,
    totalWages,
    totalInterest,
    totalDividends,
    totalQualifiedDividends: totalQualified,
    businessIncome: faker.datatype.boolean({ probability: 0.2 }) ? fakeDollar(faker, -5000, 80000) : null,
    rentalIncome:   faker.datatype.boolean({ probability: 0.15 }) ? fakeDollar(faker, 0, 30000) : null,
    capitalGains:   faker.datatype.boolean({ probability: 0.25 }) ? fakeDollar(faker, -3000, 20000) : null,
    socialSecurityBenefits: age(birthDateStr, taxYear) >= 62 ? fakeDollar(faker, 5000, 30000) : null,
    takesStandardDeduction: takesStandard,
    itemizedDeductionTotal: takesStandard ? null : fakeDollar(faker, 15000, 60000),
    preparerPtin: faker.datatype.boolean({ probability: 0.4 })
      ? `P${faker.string.numeric(8)}`
      : null,
  };
  // Schedule C detail behind the drawn net figure. These draws come after every
  // existing draw so a given seed still produces the same household.
  if (taxpayer.businessIncome != null) {
    taxpayer.scheduleCs = [buildScheduleC(faker, taxpayer.businessIncome, taxYear)];
  }
  // Brokerage sales behind the drawn net capital gain (also after every existing draw).
  if (taxpayer.capitalGains != null) {
    taxpayer.capitalSales = buildCapitalSales(faker, taxpayer.capitalGains, taxYear);
  }
  // Schedule A and Schedule E detail behind the drawn totals (also after every existing draw).
  if (!taxpayer.takesStandardDeduction && taxpayer.itemizedDeductionTotal != null) {
    taxpayer.itemized = buildItemized(faker, taxpayer, taxpayer.itemizedDeductionTotal);
  }
  if (taxpayer.rentalIncome != null) {
    taxpayer.rentals = [buildRental(faker, taxpayer.rentalIncome)];
  }
  // SSA-1099 behind the drawn benefits, and a rare blind taxpayer (also after every existing draw).
  if (taxpayer.socialSecurityBenefits != null) {
    taxpayer.ssa1099s = [buildSsa1099(faker, taxpayer.socialSecurityBenefits)];
  }
  taxpayer.blind = faker.datatype.boolean({ probability: 0.02 });
  // About a quarter of rentals run at a loss (Form 8582 passive limits); last draw, so nothing earlier moves.
  if (taxpayer.rentals?.length && faker.datatype.boolean({ probability: 0.25 })) {
    taxpayer.rentalIncome = makeRentalLoss(faker, taxpayer.rentals[0]);
  }
  // Payroll and qualified property for Form 8995-A (last draws, so nothing earlier moves).
  if (taxpayer.scheduleCs?.length) addBusinessPayrollAndProperty(faker, taxpayer.scheduleCs[0]);
  // Pension / IRA distributions by age (Forms 1099-R); last draws, so nothing earlier moves.
  const retirement1099Rs = buildRetirement1099Rs(faker, taxpayer);
  if (retirement1099Rs.length) taxpayer.retirement1099Rs = retirement1099Rs;
  // Alaska residents get the year's Permanent Fund dividend (Schedule 1 line 8g; no random draws).
  if (taxpayer.state === "AK" && ALASKA_PFD[taxYear]) {
    taxpayer.alaskaPermanentFundDividends = { primary: ALASKA_PFD[taxYear], spouse: taxpayer.spouseSSN ? ALASKA_PFD[taxYear] : undefined };
  }
  // Car loan interest / personal property tax on the business vehicle (last draws; line 31 unchanged).
  if (taxpayer.scheduleCs?.length) addVehicleCosts(faker, taxpayer.scheduleCs[0], taxYear);
  // 401(k) deferrals (W-2 box 12 code D) and Roth IRA contributions for Form 8880 (last draws).
  addRetirementSavings(faker, taxpayer, ssWageBase(taxYear));
  // Child care paid so the parents can work (Form 2441; last draws).
  const dependentCare = buildDependentCare(faker, taxpayer);
  if (dependentCare) taxpayer.dependentCare = dependentCare;
  // College and graduate tuition (Forms 1098-T and 8863; last draws).
  const education = buildEducation(faker, taxpayer);
  if (education) taxpayer.education = education;
  // Marketplace health coverage (Forms 1095-A and 8962; last draws).
  const marketplace = buildMarketplace(faker, taxpayer);
  if (marketplace) taxpayer.marketplace1095As = marketplace;
  // Traditional IRA contributions (Schedule 1 line 20; last draws).
  addTraditionalIra(faker, taxpayer, IRA_CONTRIBUTION_LIMIT[taxYear], IRA_CATCH_UP[taxYear]);
  // Incentive stock option exercises (Form 3921 → AMT; last draws).
  const isoExercises = buildIsoExercises(faker, taxpayer);
  if (isoExercises) taxpayer.isoExercises = isoExercises;
  // Health savings account (Form 8889, W-2 code W, Form 1099-SA; last draws).
  addHsa(faker, taxpayer, HSA_LIMIT[taxYear], HSA_CATCH_UP);
  addExtras(faker, taxpayer);
  return taxpayer;
}

/** Age at the end of the tax year (not today). */
function age(dob: string, taxYear: number): number {
  return taxYear - Number(dob.split("/")[2]);
}
