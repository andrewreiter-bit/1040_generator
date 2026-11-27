/**
 * Synthetic Health Insurance Marketplace coverage (Form 1095-A → Form 8962), drawn AFTER
 * every other draw so seeds keep their households.
 *
 * About 8% of households take a full-year Marketplace policy, when everyone on the return
 * is under 65 (no Medicare) and the return isn't married filing separately. The benchmark
 * plan (SLCSP) is age-rated from a 40-year-old's monthly premium (adults 0.6–3.0×, children
 * 0.6×); the enrolled plan costs 75–125% of it. The Marketplace pays advance credits from a
 * projected income (drawn wages and business income, off by up to ±15%), so the return
 * usually reconciles a small difference either way. Monthly amounts are the same all year.
 */
import { Faker } from "@faker-js/faker";
import { FakeTaxpayer, Marketplace1095A } from "./taxpayer";
import { applicableFigure, povertyLine } from "../tax/premium-tax-credit";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** A 40-year-old's monthly benchmark (SLCSP) premium, roughly the national average. */
const SLCSP_40: Record<number, number> = { 2023: 456, 2024: 477, 2025: 497, 2026: 625 };

export function buildMarketplace(faker: Faker, t: FakeTaxpayer): Marketplace1095A[] | undefined {
  const takes = faker.datatype.boolean({ probability: 0.08 });
  const priceFactor = faker.number.float({ min: 0.75, max: 1.25, fractionDigits: 3 });
  const incomeMiss = faker.number.float({ min: 0.85, max: 1.15, fractionDigits: 3 });
  const ages = [t.dateOfBirth, t.filingStatus === "MFJ" ? t.spouseDateOfBirth : null]
    .filter((d): d is string => !!d)
    .map((d) => t.taxYear - Number(d.split("/")[2]));
  if (!takes || t.filingStatus === "MFS" || ages.some((a) => a >= 65)) return undefined;

  const base = SLCSP_40[t.taxYear] ?? 497;
  const kids = t.dependents.filter((d) => d.birthYear <= t.taxYear);
  const monthlySlcsp = round2(
    ages.reduce((s, a) => s + base * Math.min(3, Math.max(0.6, 0.6 + (a - 21) * 0.05)), 0)
    + kids.reduce((s, d) => s + base * (t.taxYear - d.birthYear < 21 ? 0.6 : 0.8), 0),
  );
  const monthlyPremium = round2(monthlySlcsp * priceFactor);
  // What the Marketplace expected: the same formula as Form 8962 on a projected income.
  const projected = (t.totalWages + Math.max(0, t.businessIncome ?? 0)) * incomeMiss;
  const fpl = povertyLine(t, ages.length + kids.length).amount;
  const pct = projected > fpl * 4 ? 401 : Math.floor((projected * 100) / fpl);
  if (pct < 100) return undefined;
  const monthlyContribution = Math.round(Math.round(projected * applicableFigure(pct, t.taxYear)) / 12);
  // 2026 on: no PTC over 400% of the poverty line, so the Marketplace pays no advance (no new draw).
  const monthlyAdvance = t.taxYear >= 2026 && pct > 400 ? 0 : Math.max(0, Math.min(monthlyPremium, round2(monthlySlcsp - monthlyContribution)));
  return [{
    marketplaceId: `${t.state}-${faker.string.numeric(6)}`,
    policyNumber: faker.string.alphanumeric({ length: 10, casing: "upper" }),
    issuer: `${faker.company.name()} Health Plans`,
    annualPremium: round2(monthlyPremium * 12),
    annualSlcsp: round2(monthlySlcsp * 12),
    annualAdvancePayments: round2(monthlyAdvance * 12),
  }];
}
