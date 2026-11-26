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

// ─── Custom Generators ────────────────────────────────────────────────────────

function fakeSSN(faker: Faker): string {
  let area: number;
  do { area = faker.number.int({ min: 1, max: 899 }); }
  while (area === 666);
  const group = faker.number.int({ min: 1, max: 99 });
  const serial = faker.number.int({ min: 1, max: 9999 });
  return `${String(area).padStart(3, "0")}-${String(group).padStart(2, "0")}-${String(serial).padStart(4, "0")}`;
}

function fakeEIN(faker: Faker): string {
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
  const prefixes = ["01","02","03","04","05","06","07","08","09","10","11","12",
                    "21","22","23","24","25","26","27","28","29","30","31","32"];
  const prefix = faker.helpers.arrayElement(prefixes);
  const middle = faker.string.numeric(6);
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

function fakeBirthDate(faker: Faker, minAge = 22, maxAge = 70): string {
  const now = new Date();
  const year = now.getFullYear() - faker.number.int({ min: minAge, max: maxAge });
  const month = faker.number.int({ min: 1, max: 12 });
  const day   = faker.number.int({ min: 1, max: 28 });
  return `${String(month).padStart(2,"0")}/${String(day).padStart(2,"0")}/${year}`;
}

function fakeDollar(faker: Faker, min: number, max: number): number {
  return Math.round(faker.number.float({ min, max, fractionDigits: 2 }) * 100) / 100;
}

// ─── W-2 Builder ─────────────────────────────────────────────────────────────

function buildW2(faker: Faker, state: string, taxYear: number): W2Record {
  const wages = fakeDollar(faker, 35000, 160000);
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
    employerZip: faker.location.zipCode(),
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

  // ── Pinned Primary Taxpayer, Spouse & Dependents (edit values as needed) ───
  const firstName    = "Alex";
  const lastName     = "Rivera";
  const state        = "OH";
  const birthDateStr = "08/22/1982";
  const filingStatus: FilingStatus = "MFJ";

  const dependents: Dependent[] = [
    {
      firstName: "Maya",
      lastName: "Rivera",
      ssn: "456-78-9012",
      relationship: "Child",
      birthYear: 2015,
      monthsInHome: 12,
      qualifiesChildTaxCredit: true,
      qualifiesOtherDependent: false,
    },
    {
      firstName: "Leo",
      lastName: "Rivera",
      ssn: "567-89-0123",
      relationship: "Child",
      birthYear: 2018,
      monthsInHome: 12,
      qualifiesChildTaxCredit: true,
      qualifiesOtherDependent: false,
    },
  ];

  // ── Randomized Income & Deductions (varies with --seed) ────────────────────
  // Always generate 2 W-2s so both spouses have wage statements
  const w2Records: W2Record[] = Array.from({ length: 2 }, () => buildW2(faker, state, taxYear))
    .map((w, i) => (i === 1 ? { ...w, employee: "spouse" as const } : w)); // W-2 #2 is Casey's
  const totalWages = w2Records.reduce((s, w) => s + w.wages, 0);

  const intCount = faker.number.int({ min: 0, max: 2 });
  const interest1099s: Interest1099[] = Array.from({ length: intCount }, () => ({
    payerName: faker.company.name() + " Bank",
    payerTin: fakeEIN(faker),
    interestIncome: fakeDollar(faker, 10, 2500),
    earlyWithdrawalPenalty: 0,
    usSavingsBondInterest: faker.datatype.boolean() ? fakeDollar(faker, 0, 500) : 0,
  }));
  const totalInterest = interest1099s.reduce((s, i) => s + i.interestIncome, 0);

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

  const takesStandard = faker.datatype.boolean({ probability: 0.85 });

  const taxpayer: FakeTaxpayer = {
    seed: resolvedSeed,
    taxYear,

    // Primary Taxpayer
    firstName,
    middleInitial: "J",
    lastName,
    ssn: "234-56-7890",
    dateOfBirth: birthDateStr,
    occupation: "Product Manager",
    phone: "(555) 867-5309",

    // Address
    streetAddress: "1420 Oakwood Avenue",
    aptNumber: null,
    city: "Columbus",
    state,
    zipCode: "43215",

    // Spouse (MFJ)
    filingStatus,
    spouseFirstName: "Casey",
    spouseLastName: "Rivera",
    spouseSSN: "345-67-8901",
    spouseDateOfBirth: "11/03/1984",
    spouseOccupation: "Graphic Designer",

    // Dependents
    dependents,

    // Direct Deposit Banking
    routingNumber: "044000037",
    accountNumber: "1122334455",
    accountType: "Checking",

    // Income & Deductions
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
    socialSecurityBenefits: age(birthDateStr) >= 62 ? fakeDollar(faker, 5000, 30000) : null,
    takesStandardDeduction: takesStandard,
    itemizedDeductionTotal: takesStandard ? null : fakeDollar(faker, 29000, 75000),
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
  addTraditionalIra(faker, taxpayer, IRA_CONTRIBUTION_LIMIT[taxYear], IRA_CATCH_UP);
  // Incentive stock option exercises (Form 3921 → AMT; last draws).
  const isoExercises = buildIsoExercises(faker, taxpayer);
  if (isoExercises) taxpayer.isoExercises = isoExercises;
  // Health savings account (Form 8889, W-2 code W, Form 1099-SA; last draws).
  addHsa(faker, taxpayer, HSA_LIMIT[taxYear], HSA_CATCH_UP);
  addExtras(faker, taxpayer);
  return taxpayer;
}

function age(dob: string): number {
  const [m, d, y] = dob.split("/").map(Number);
  const now = new Date();
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
}