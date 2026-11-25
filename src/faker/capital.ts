/**
 * Synthetic brokerage sales for the profiles.
 *
 * A profile first draws its net capital gain/loss (the existing `capitalGains`
 * draw, unchanged so seeds keep their households), then calls
 * `buildCapitalSales` AFTER all its other draws. The sales' Form 8949 column (h)
 * amounts add up to that drawn figure exactly (capital gain distributions from
 * 1099-DIVs stay separate, on Schedule D line 13).
 *
 * Most sales are "covered" (basis reported to the IRS) with no adjustments, so
 * they go straight to Schedule D lines 1a / 8a; some have basis not reported
 * (box B / E) or a wash-sale loss add-back (code W), which needs Form 8949.
 * Broker names, TINs and securities are synthetic.
 */
import { Faker } from "@faker-js/faker";
import { CapitalAssetSale } from "./taxpayer";
import { form8949Row } from "../tax/capital";
import { cents } from "../tax/rounding";

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const date = (y: number, m: number, d: number) => `${pad(m)}/${pad(d)}/${y}`;

export function buildCapitalSales(faker: Faker, targetNet: number, taxYear: number): CapitalAssetSale[] {
  const count = faker.number.int({ min: 1, max: 4 });
  const brokers = Array.from({ length: faker.number.int({ min: 1, max: Math.min(2, count) }) }, () => ({
    name: `${faker.person.lastName()} Securities LLC`,
    tin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
  }));

  // Column (h) gains: count − 1 free draws, the last one closes to the target.
  const gains: number[] = [];
  for (let i = 0; i < count - 1; i++) gains.push(round2(faker.number.float({ min: -2500, max: 6000, fractionDigits: 2 })));
  gains.push(round2(targetNet - gains.reduce((a, b) => a + b, 0)));

  const sales = gains.map((gain): CapitalAssetSale => {
    const broker = faker.helpers.arrayElement(brokers);
    const long = faker.datatype.boolean({ probability: 0.6 });
    const soldMonth = faker.number.int({ min: 1, max: 12 });
    const soldDay = faker.number.int({ min: 1, max: 28 });
    // Short-term: 1–11 months before the sale; long-term: 2–8 years before.
    const back = long ? faker.number.int({ min: 24, max: 96 }) : faker.number.int({ min: 1, max: 11 });
    const acqTotal = taxYear * 12 + (soldMonth - 1) - back;
    const acquired = date(Math.floor(acqTotal / 12), (acqTotal % 12) + 1, faker.number.int({ min: 1, max: 28 }));
    const shares = faker.number.int({ min: 5, max: 400 });
    const reporting: CapitalAssetSale["reporting"] = faker.datatype.boolean({ probability: 0.8 }) ? "basisReported" : "basisNotReported";
    // A wash-sale add-back only on a loss sale: the reported loss is larger, the add-back brings it to `gain`.
    const wash = gain < 0 && faker.datatype.boolean({ probability: 0.25 })
      ? round2(faker.number.float({ min: 0.1, max: 0.5, fractionDigits: 2 }) * -gain)
      : 0;
    const before = round2(gain - wash);
    const basis = round2(faker.number.float({ min: 800, max: 20000, fractionDigits: 2 }) + Math.max(0, -before));
    return {
      owner: "primary",
      brokerName: broker.name,
      brokerTin: broker.tin,
      description: `${shares} sh ${faker.company.name().replace(/[,.]/g, "")} common`,
      dateAcquired: acquired,
      dateSold: date(taxYear, soldMonth, soldDay),
      proceeds: round2(basis + before),
      costBasis: basis,
      reporting,
      washSaleDisallowed: wash || undefined,
    };
  });

  // Reconcile to the cent against the engine's own Form 8949 arithmetic.
  const total = round2(sales.reduce((s, x) => s + form8949Row(x, cents).gain, 0));
  const drift = round2(targetNet - total);
  if (drift !== 0) sales[sales.length - 1].proceeds = round2(sales[sales.length - 1].proceeds + drift);
  return sales;
}
