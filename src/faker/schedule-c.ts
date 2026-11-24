/**
 * Synthetic Schedule C businesses for the profiles.
 *
 * A profile first draws a net profit/loss (its existing `businessIncome` draw,
 * unchanged so seeds keep producing the same household), then calls
 * `buildScheduleC` AFTER all of its other draws to break that figure into
 * receipts and expenses. The lines are built so Schedule C line 31 equals the
 * drawn net figure exactly: expenses are drawn first and gross receipts are
 * solved for. Home office (simplified method) is used only when the business
 * shows a profit large enough to absorb it, since it cannot create a loss.
 *
 * Everything here is synthetic: business names come from faker, there is no EIN
 * (a sole proprietor without employees uses their SSN), and the business is run
 * from the home address.
 */
import { Faker } from "@faker-js/faker";
import { ScheduleCBusiness, ScheduleCExpenses } from "./taxpayer";
import { SIMPLIFIED_HOME_OFFICE, yearConstants } from "../config/tax-year";
import { scheduleC } from "../tax/business";
import { cents } from "../tax/rounding";

/** Principal business / Schedule C line B codes (from the Schedule C instructions' code list). */
const ACTIVITIES: Array<[string, string]> = [
  ["Graphic design services", "541430"],
  ["Management consulting", "541600"],
  ["Photography", "541920"],
  ["Landscaping services", "561730"],
  ["Freelance writing", "711510"],
  ["Bookkeeping services", "541219"],
  ["House cleaning", "561720"],
  ["Custom software development", "541511"],
  ["Tutoring", "611000"],
  ["Finish carpentry", "238350"],
];

const OPTIONAL_EXPENSES: Array<[keyof ScheduleCExpenses, number, number]> = [
  ["advertising", 100, 3000],
  ["contractLabor", 500, 12000],
  ["insurance", 200, 2500],
  ["legalProfessional", 150, 2500],
  ["officeExpense", 100, 2000],
  ["rentOther", 1200, 12000],
  ["repairs", 100, 2500],
  ["taxesLicenses", 50, 800],
  ["travel", 200, 4000],
  ["mealsTotal", 100, 2400],
  ["utilities", 300, 3000],
];

const OTHER_EXPENSE_TYPES = ["Software subscriptions", "Professional dues", "Continuing education", "Bank fees", "Website hosting"];

const dollars = (faker: Faker, min: number, max: number) =>
  Math.round(faker.number.float({ min, max, fractionDigits: 2 }) * 100) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildScheduleC(
  faker: Faker,
  targetNetProfit: number,
  taxYear: number,
  owner: "primary" | "spouse" = "primary",
): ScheduleCBusiness {
  const [principalBusiness, businessCode] = faker.helpers.arrayElement(ACTIVITIES);
  const named = faker.datatype.boolean({ probability: 0.5 });
  const businessName = named ? `${faker.person.lastName()} ${principalBusiness.split(" ")[0]} LLC`.replace(/\s+/g, " ") : "";

  const expenses: ScheduleCExpenses = { supplies: dollars(faker, 100, 3000) };
  for (const [key, min, max] of faker.helpers.arrayElements(OPTIONAL_EXPENSES, { min: 2, max: 5 })) {
    (expenses as Record<string, number>)[key] = dollars(faker, min, max);
  }
  const otherItems = faker.helpers.arrayElements(OTHER_EXPENSE_TYPES, { min: 0, max: 2 })
    .map((description) => ({ description, amount: dollars(faker, 50, 1500) }));
  if (otherItems.length) {
    expenses.otherExpenseItems = otherItems;
    expenses.otherExpenses = round2(otherItems.reduce((s, x) => s + x.amount, 0));
  }

  const vehicle = faker.datatype.boolean({ probability: 0.4 })
    ? {
        businessMiles: faker.number.int({ min: 800, max: 12000 }),
        commutingMiles: faker.number.int({ min: 0, max: 3000 }),
        otherMiles: faker.number.int({ min: 2000, max: 10000 }),
        placedInService: `${String(faker.number.int({ min: 1, max: 12 })).padStart(2, "0")}/${String(faker.number.int({ min: 1, max: 28 })).padStart(2, "0")}/${taxYear - faker.number.int({ min: 1, max: 6 })}`,
        parkingTolls: dollars(faker, 0, 400),
      }
    : undefined;
  const wantsHomeOffice = faker.datatype.boolean({ probability: 0.35 });
  const homeOfficeSqFt = faker.number.int({ min: 80, max: SIMPLIFIED_HOME_OFFICE.maxSqFt });
  const homeTotalSqFt = faker.number.int({ min: 900, max: 3200 });
  const paid1099Payments = (expenses.contractLabor ?? 0) >= 600;

  // Line 28 total, exactly as the engine adds it (meals at 50%, vehicle at the mileage rate).
  const vehicleExpense = vehicle ? round2(vehicle.businessMiles * yearConstants(taxYear).standardMileageRate + vehicle.parkingTolls) : 0;
  const listed = Object.entries(expenses)
    .filter(([k]) => k !== "otherExpenseItems" && k !== "mealsTotal")
    .reduce((s, [, v]) => s + (v as number), 0);
  const totalExpenses = round2(listed + round2((expenses.mealsTotal ?? 0) * 0.5) + vehicleExpense);

  const homeOffice = wantsHomeOffice ? homeOfficeSqFt * SIMPLIFIED_HOME_OFFICE.ratePerSqFt : 0;
  const useHomeOffice = wantsHomeOffice && targetNetProfit > 0;
  // Gross receipts solve line 31 = receipts − expenses − home office (≥ the expenses for a loss).
  const grossReceipts = Math.max(0, round2(targetNetProfit + totalExpenses + (useHomeOffice ? homeOffice : 0)));
  // A loss bigger than the expenses: add the shortfall to supplies so the lines still tie out.
  if (grossReceipts === 0 && targetNetProfit < -totalExpenses) {
    expenses.supplies = round2((expenses.supplies ?? 0) + (-targetNetProfit - totalExpenses));
  }

  const business: ScheduleCBusiness = {
    owner,
    principalBusiness,
    businessCode,
    businessName,
    ein: "",
    accountingMethod: "Cash",
    materiallyParticipated: true,
    grossReceipts,
    returnsAllowances: 0,
    costOfGoodsSold: 0,
    otherIncome: 0,
    expenses,
    vehicle,
    homeOfficeSqFt: useHomeOffice ? homeOfficeSqFt : undefined,
    homeTotalSqFt: useHomeOffice ? homeTotalSqFt : undefined,
    paid1099Payments,
  };

  // Reconcile to the cent against the engine's own line arithmetic (float sums can drift by 1¢).
  const drift = round2(targetNetProfit - scheduleC(business, taxYear, cents).netProfit);
  if (drift !== 0) {
    if (business.grossReceipts > 0) business.grossReceipts = round2(business.grossReceipts + drift);
    else expenses.supplies = round2((expenses.supplies ?? 0) - drift);
  }
  return business;
}
