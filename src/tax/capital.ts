/**
 * Capital gains: Form 8949 rows and Schedule D (2023–2025 layout).
 *
 * - Term comes from the dates: long-term only when sold after the first
 *   anniversary of the acquisition date (§ 1222; the holding period starts the
 *   day after acquisition). `sale.term` decides only for "VARIOUS" / missing dates.
 * - Adjustments (column g): a disallowed wash-sale loss is added back (code W);
 *   accrued market discount is ordinary income up to the gain (code D, § 1276),
 *   reported as interest instead.
 * - Exception 1: a box A / D sale with no adjustments goes straight to Schedule D
 *   line 1a / 8a instead of Form 8949.
 * - Net capital gain (§ 1(h)(11)/(3)) for the QDCG worksheet and Form 8995: the
 *   smaller of Schedule D lines 15 and 16 when both are gains, otherwise zero.
 */
import { CapitalAssetSale, FakeTaxpayer } from "../faker/taxpayer";
import { CAPITAL_LOSS_LIMIT } from "../config/tax-year";
import { Rounder, sumWith } from "./rounding";

export type Form8949Box = "A" | "B" | "C" | "D" | "E" | "F";

export interface Form8949Row {
  sale: CapitalAssetSale;
  term: "short" | "long";
  box: Form8949Box;
  proceeds: number;          // (d)
  basis: number;             // (e)
  codes: string;             // (f), alphabetical
  adjustment: number;        // (g)
  gain: number;              // (h)
  /** Recognized accrued market discount (reported as interest). */
  marketDiscount: number;
  /** Exception 1: reported directly on Schedule D line 1a / 8a. */
  directToScheduleD: boolean;
}

export interface LineTotals { proceeds: number; basis: number; adjustment: number; gain: number }

export interface ScheduleDLines {
  line1a: LineTotals; line1b: LineTotals; line2: LineTotals; line3: LineTotals;
  line6: number;             // short-term carryover (≤ 0)
  line7: number;             // net short-term
  line8a: LineTotals; line8b: LineTotals; line9: LineTotals; line10: LineTotals;
  line13: number;            // capital gain distributions
  line14: number;            // long-term carryover (≤ 0)
  line15: number;            // net long-term
  line16: number;
  line21: number;            // allowed loss (≤ 0) when line 16 is a loss
  /** Line 20 "Yes" path: both line 15 and 16 are gains. */
  bothGains: boolean;
  toForm1040: number;        // line 16 gain, or line 21 loss → Form 1040 line 7
}

export interface CapitalResult {
  rows: Form8949Row[];
  scheduleD?: ScheduleDLines;   // undefined when Schedule D isn't required
  /** Form 1040 line 7. */
  capitalGain: number;
  /** § 1(h) net capital gain (before qualified dividends). */
  netCapitalGain: number;
  /** Recognized market discount, added to taxable interest. */
  marketDiscountInterest: number;
  federalWithheld: number;
  /** Line 7 box: only capital gain distributions, no Schedule D. */
  distributionsOnly: boolean;
}

const parse = (d: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d ?? "");
  return m ? { m: Number(m[1]), d: Number(m[2]), y: Number(m[3]) } : null;
};

/** Long-term when sold after the first anniversary of the acquisition date. */
export function holdingTerm(sale: CapitalAssetSale): "short" | "long" {
  const a = parse(sale.dateAcquired), s = parse(sale.dateSold);
  if (!a || !s) return sale.term ?? "short";
  const anniversary = [a.y + 1, a.m, a.d];
  const sold = [s.y, s.m, s.d];
  for (let i = 0; i < 3; i++) if (sold[i] !== anniversary[i]) return sold[i] > anniversary[i] ? "long" : "short";
  return "short"; // sold on the anniversary: held exactly one year
}

const BOX: Record<"short" | "long", Record<CapitalAssetSale["reporting"], Form8949Box>> = {
  short: { basisReported: "A", basisNotReported: "B", noForm1099B: "C" },
  long:  { basisReported: "D", basisNotReported: "E", noForm1099B: "F" },
};

/** Sales on this return: a spouse's count only on a joint return. */
export function includedSales(t: FakeTaxpayer): CapitalAssetSale[] {
  return (t.capitalSales ?? []).filter((s) => s.owner !== "spouse" || t.filingStatus === "MFJ");
}

export function form8949Row(sale: CapitalAssetSale, R: Rounder): Form8949Row {
  const term = holdingTerm(sale);
  const box = BOX[term][sale.reporting];
  const proceeds = R(sale.proceeds);
  const basis = R(sale.costBasis);
  const before = R(proceeds - basis);
  const wash = R(sale.washSaleDisallowed ?? 0);
  const marketDiscount = before > 0 ? Math.min(R(sale.accruedMarketDiscount ?? 0), before) : 0;
  const adjustment = R(wash - marketDiscount);
  const codes = [marketDiscount ? "D" : "", wash ? "W" : ""].join("");
  const gain = R(before + adjustment);
  const directToScheduleD = (box === "A" || box === "D") && !codes;
  return { sale, term, box, proceeds, basis, codes, adjustment, gain, marketDiscount, directToScheduleD };
}

export function computeCapital(t: FakeTaxpayer, capitalGainDistributions: number, R: Rounder): CapitalResult {
  const sum = (xs: number[]) => sumWith(R, xs);
  const sales = includedSales(t);
  const rows = sales.map((s) => form8949Row(s, R));
  const carry = t.capitalLossCarryover;
  const lossLimit = t.filingStatus === "MFS" ? CAPITAL_LOSS_LIMIT.mfs : CAPITAL_LOSS_LIMIT.other;
  const federalWithheld = sum(sales.map((s) => s.federalWithheld ?? 0));
  const marketDiscountInterest = sum(rows.map((r) => r.marketDiscount));

  // No sales and no carryover: line 7 is the capital gain distributions alone (no Schedule D).
  if (!rows.length && !carry?.shortTerm && !carry?.longTerm) {
    if (t.capitalGains != null) {
      // Legacy bare net figure: line 7 only, no detail (reported unsupported by computeReturn).
      const net = R(t.capitalGains + capitalGainDistributions);
      const capitalGain = net >= 0 ? net : Math.max(net, -lossLimit);
      return { rows, capitalGain, netCapitalGain: Math.max(0, capitalGain), marketDiscountInterest: 0, federalWithheld: 0, distributionsOnly: false };
    }
    const capitalGain = R(capitalGainDistributions);
    return { rows, capitalGain, netCapitalGain: Math.max(0, capitalGain), marketDiscountInterest: 0, federalWithheld: 0, distributionsOnly: capitalGain !== 0 };
  }

  const totals = (pick: (r: Form8949Row) => boolean): LineTotals => {
    const rs = rows.filter(pick);
    return {
      proceeds: sum(rs.map((r) => r.proceeds)), basis: sum(rs.map((r) => r.basis)),
      adjustment: sum(rs.map((r) => r.adjustment)), gain: sum(rs.map((r) => r.gain)),
    };
  };
  const line1a = totals((r) => r.box === "A" && r.directToScheduleD);
  const line1b = totals((r) => r.box === "A" && !r.directToScheduleD);
  const line2 = totals((r) => r.box === "B");
  const line3 = totals((r) => r.box === "C");
  const line6 = -R(carry?.shortTerm ?? 0);
  const line7 = sum([line1a.gain, line1b.gain, line2.gain, line3.gain, line6]);
  const line8a = totals((r) => r.box === "D" && r.directToScheduleD);
  const line8b = totals((r) => r.box === "D" && !r.directToScheduleD);
  const line9 = totals((r) => r.box === "E");
  const line10 = totals((r) => r.box === "F");
  const line13 = R(capitalGainDistributions);
  const line14 = -R(carry?.longTerm ?? 0);
  const line15 = sum([line8a.gain, line8b.gain, line9.gain, line10.gain, line13, line14]);
  const line16 = R(line7 + line15);
  const line21 = line16 < 0 ? Math.max(line16, -lossLimit) : 0;
  const bothGains = line15 > 0 && line16 > 0;
  const toForm1040 = line16 > 0 ? line16 : line21;
  return {
    rows,
    scheduleD: { line1a, line1b, line2, line3, line6, line7, line8a, line8b, line9, line10, line13, line14, line15, line16, line21, bothGains, toForm1040 },
    capitalGain: toForm1040,
    netCapitalGain: bothGains ? Math.min(line15, line16) : 0,
    marketDiscountInterest,
    federalWithheld,
    distributionsOnly: false,
  };
}
