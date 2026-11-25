/**
 * Passive activity loss limits for rental real estate (Form 8582, 2023–2025
 * layout; § 469). Every rental is a passive activity with active participation;
 * there are no other passive activities, prior-year unallowed losses or credits
 * (computeReturn reports those as unsupported).
 *
 * - No Form 8582 when the exception applies: only active-participation rentals,
 *   total loss ≤ $25,000 ($12,500 MFS living apart), modified AGI ≤ $100,000
 *   ($50,000), not MFS living together. All losses are then allowed.
 * - Otherwise Part I nets income and losses; if line 3 is zero or more every
 *   loss is allowed. If it's a loss, Part II gives the special allowance —
 *   $25,000 less 50% of modified AGI over $100,000 ($12,500 / $50,000 for MFS
 *   living apart; none for MFS living together) — and Part III adds passive
 *   income. Parts VI–VIII allocate: the allowance ratably by loss, then the
 *   unallowed remainder ratably by what's left, giving each property's allowed
 *   loss for Schedule E line 22. The unallowed part carries forward.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { Rounder, sumWith } from "./rounding";

export const PASSIVE = {
  specialAllowance: { other: 25000, mfsApart: 12500 },
  phaseoutStart: { other: 100000, mfsApart: 50000 },
  line5: { other: 150000, mfsApart: 75000 },
  phaseoutRate: 0.5,
};

export interface Form8582Lines {
  required: boolean;
  /** Why no form is needed / no limit applies ("" when the limit is applied). */
  note: string;
  line1a: number; line1b: number; line1c: number; line1d: number; line3: number;
  /** Part II (only when line 3 and line 1d are losses and MFS didn't live with the spouse). */
  partII?: { line4: number; line5: number; line6: number; line7: number; line8: number; line9: number };
  line10: number;
  line11: number;
  /** Per Schedule E column, index-aligned with the rentals: net result and the Part VI–VIII allocation. */
  activities: Array<{ net: number; loss: number; ratio: number; specialAllowance: number; afterAllowance: number; unallowed: number; allowed: number }>;
  modifiedAgi: number;
  unallowedCarryforward: number;
}

/**
 * @param nets Schedule E line 21 for each rental.
 * @param modifiedAgi Form 8582 line 6 modified AGI (AGI without the passive loss,
 *   taxable Social Security, the SE-tax deduction, IRA and student loan interest deductions).
 */
export function form8582(t: FakeTaxpayer, nets: number[], modifiedAgi: number, R: Rounder): Form8582Lines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const mfs = t.filingStatus === "MFS";
  const together = mfs && t.mfsLivedWithSpouse !== false;
  const line1a = sum(nets.filter((n) => n > 0));
  const line1b = sum(nets.filter((n) => n < 0));      // ≤ 0
  const line1c = 0;
  const line1d = R(line1a + line1b + line1c);
  const line3 = line1d;
  const losses = nets.map((n) => (n < 0 ? -n : 0));
  const totalLoss = sum(losses);
  const allAllowed = (note: string, required: boolean): Form8582Lines => ({
    required, note, line1a, line1b, line1c, line1d, line3, line10: line1a, line11: R(line1a + totalLoss),
    activities: nets.map((net, i) => ({ net, loss: losses[i], ratio: 0, specialAllowance: 0, afterAllowance: losses[i], unallowed: 0, allowed: losses[i] })),
    modifiedAgi, unallowedCarryforward: 0,
  });

  if (!totalLoss) return allAllowed("no rental loss", false);
  const cap = mfs ? PASSIVE.specialAllowance.mfsApart : PASSIVE.specialAllowance.other;
  const magiLimit = mfs ? PASSIVE.phaseoutStart.mfsApart : PASSIVE.phaseoutStart.other;
  if (!together && -line3 <= cap && modifiedAgi <= magiLimit) {
    return allAllowed("exception: active-participation rentals only, loss and modified AGI within the limits", false);
  }
  if (line3 >= 0) return allAllowed("line 3 is zero or more: all losses allowed", true);

  // Part II — special allowance (none when MFS lived with the spouse).
  let partII: Form8582Lines["partII"];
  let line9 = 0;
  if (!together && line1d < 0) {
    const line4 = Math.min(-line1d, -line3);
    const line5 = mfs ? PASSIVE.line5.mfsApart : PASSIVE.line5.other;
    const line6 = Math.max(0, R(modifiedAgi));
    const line7 = line6 >= line5 ? 0 : R(line5 - line6);
    const line8 = line6 >= line5 ? 0 : Math.min(R(line7 * PASSIVE.phaseoutRate), cap);
    line9 = Math.min(line4, line8);
    partII = { line4, line5, line6, line7, line8, line9 };
  }
  const line10 = line1a;
  const line11 = R(line9 + line10);

  // Part VI: special allowance by loss; Part VII: unallowed remainder by what's left; Part VIII: allowed.
  const ratios = losses.map((l) => l / totalLoss);
  const special = ratios.map((r) => R(line9 * r));
  const after = losses.map((l, i) => R(l - special[i]));
  const afterTotal = sum(after);
  const totalUnallowed = Math.max(0, R(totalLoss - line11));
  const unallowed = after.map((a) => (afterTotal ? R(totalUnallowed * (a / afterTotal)) : 0));
  const activities = nets.map((net, i) => ({
    net, loss: losses[i], ratio: ratios[i], specialAllowance: special[i], afterAllowance: after[i],
    unallowed: unallowed[i], allowed: R(losses[i] - unallowed[i]),
  }));
  return {
    required: true, note: "", line1a, line1b, line1c, line1d, line3, partII, line10, line11, activities,
    modifiedAgi, unallowedCarryforward: sum(unallowed),
  };
}
