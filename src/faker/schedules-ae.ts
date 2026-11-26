/**
 * Synthetic Schedule A and Schedule E detail for the profiles.
 *
 * Both are built AFTER every existing draw (seeds keep their households) from the
 * figures the profile already drew:
 *
 * - Schedule A: `itemizedDeductionTotal` is the target for line 17. Line 5a is the
 *   state income tax withheld on the return's own W-2s (box 17), plus drawn real
 *   estate tax, capped at the year's SALT limit. Mortgage interest (8a) and gifts
 *   to charity (11, plus ≤ $500 non-cash on 12, so no Form 8283) make up the rest.
 *   When capped SALT alone is more than the target, line 17 is just the SALT
 *   (rule checked by the validator: line 17 = max(target, capped SALT)). No
 *   medical expenses are generated. Whether the household then itemizes is
 *   computeReturn's call (larger of standard or itemized).
 * - Schedule E: one rental (single- or multi-family) whose line 21 equals the
 *   drawn `rentalIncome` exactly: expenses are drawn, rents are solved for.
 *   Depreciation is 27.5-year straight line on a building placed in service in an
 *   earlier year (no Form 4562). Addresses are synthetic.
 */
import { Faker } from "@faker-js/faker";
import { FakeTaxpayer, ItemizedDeductions, RentalProperty, SSA1099 } from "./taxpayer";
import { saltCap } from "../config/tax-year";
import { includedW2s } from "../tax/household";
import { scheduleE } from "../tax/rental";
import { cents } from "../tax/rounding";
import { zipInState } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

/**
 * AGI isn't known yet, so this uses the most generous SALT cap (2025's shrinks
 * above $500k of AGI); computeReturn applies the real one.
 */
export function buildItemized(faker: Faker, t: FakeTaxpayer, target: number): ItemizedDeductions {
  const box17 = round2(includedW2s(t).reduce((s, w) => s + w.stateWithheld, 0));
  const realEstateTax = dollars(faker, 1500, 9000);
  const cap = saltCap(t.taxYear, t.filingStatus, 0);
  const salt = Math.min(round2(box17 + realEstateTax), cap);
  const rest = Math.max(0, round2(target - salt));
  const mortgageShare = faker.number.float({ min: 0.55, max: 0.85, fractionDigits: 3 });
  const charityNonCash = rest > 0 ? Math.min(500, dollars(faker, 0, 500), round2(rest * 0.1)) : 0;
  const mortgageInterest1098 = round2(rest * mortgageShare);
  const charityCash = round2(rest - mortgageInterest1098 - charityNonCash);
  return {
    realEstateTax,
    mortgageInterest1098: mortgageInterest1098 || undefined,
    charityCash: charityCash || undefined,
    charityNonCash: charityNonCash || undefined,
  };
}

export function buildRental(faker: Faker, targetNet: number): RentalProperty {
  const multi = faker.datatype.boolean({ probability: 0.3 });
  const mortgaged = faker.datatype.boolean({ probability: 0.65 });
  const buildingBasis = dollars(faker, 120000, 400000);
  const expenses: RentalProperty["expenses"] = {
    insurance: dollars(faker, 600, 2500),
    taxes: dollars(faker, 1500, 7000),
    repairs: dollars(faker, 200, 4000),
    cleaningMaintenance: faker.datatype.boolean({ probability: 0.5 }) ? dollars(faker, 150, 1500) : undefined,
    utilities: faker.datatype.boolean({ probability: 0.4 }) ? dollars(faker, 300, 2500) : undefined,
    managementFees: faker.datatype.boolean({ probability: 0.35 }) ? dollars(faker, 900, 3600) : undefined,
    mortgageInterest: mortgaged ? dollars(faker, 3000, 15000) : undefined,
    // 27.5-year straight line, full year (placed in service in an earlier year).
    depreciation: round2(buildingBasis / 27.5),
  };
  const street = faker.location.streetAddress();
  const city = faker.location.city();
  const state = faker.location.state({ abbreviated: true });
  const zip = zipInState(state, faker.location.zipCode("#####"));
  const total = round2(Object.values(expenses).reduce((s: number, v) => s + (v ?? 0), 0));
  const property: RentalProperty = {
    address: `${street}, ${city}, ${state} ${zip}`,
    propertyType: multi ? 2 : 1,
    fairRentalDays: 365,
    personalUseDays: 0,
    qualifiedJointVenture: false,
    rents: round2(targetNet + total),
    royalties: 0,
    expenses,
  };
  // Reconcile to the cent against the engine's own Schedule E arithmetic.
  const drift = round2(targetNet - scheduleE([property], cents).columns[0].net);
  if (drift !== 0) property.rents = round2(property.rents + drift);
  return property;
}

/**
 * Form SSA-1099 behind the profile's drawn net Social Security benefits (box 5).
 * About a third of recipients have voluntary withholding at a Form W-4V rate.
 */
export function buildSsa1099(faker: Faker, netBenefits: number): SSA1099 {
  const withholds = faker.datatype.boolean({ probability: 0.35 });
  const rate = faker.helpers.arrayElement([0.07, 0.1, 0.12, 0.22]);
  return {
    recipient: "primary",
    benefitsPaid: netBenefits,
    benefitsRepaid: 0,
    netBenefits,
    federalWithheld: withholds ? round2(netBenefits * rate) : 0,
  };
}

/**
 * Turn an already-built rental into a loss (rents 55–95% of its expenses).
 * Called after every other draw, so households keep all earlier values; the
 * caller sets `rentalIncome` to the new Schedule E line 21.
 */
export function makeRentalLoss(faker: Faker, property: RentalProperty): number {
  const total = round2(Object.values(property.expenses).reduce((s: number, v) => s + (v ?? 0), 0));
  property.rents = round2(total * faker.number.float({ min: 0.55, max: 0.95, fractionDigits: 3 }));
  return scheduleE([property], cents).columns[0].net;
}
