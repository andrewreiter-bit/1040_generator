/**
 * Passive activity loss limits for Schedule E rentals and royalties (Form 8582, 2023–2025
 * layout; § 469; 2025 Form 8582 instructions). Each Schedule E column is classed first:
 *
 * - nonpassive (not on Form 8582): a royalty that isn't from a trade or business (portfolio
 *   income); a rental a real estate professional materially participated in (§ 469(c)(7));
 *   a self-rental's net income (Reg. 1.469-2(f)(6): rented to a trade or business the
 *   taxpayer materially participates in; only net income is recharacterized, so a net loss
 *   stays passive).
 * - line 1 / Part IV: rental real estate with active participation.
 * - line 2 / Part V: all other passive activities: rental real estate without active
 *   participation, passive royalties, and every rental when married filing separately and
 *   living with the spouse ("must use Part V instead of Part IV").
 *
 * No Form 8582 when the exception applies: only line-1 activities, total loss ≤ $25,000
 * ($12,500 MFS living apart), modified AGI ≤ $100,000 ($50,000), not MFS living together.
 * Otherwise Part I nets lines 1 and 2; if line 3 is zero or more every loss is allowed. If
 * it's a loss, Part II gives the special allowance for line-1 losses — $25,000 less 50% of
 * modified AGI over $100,000 ($12,500 / $50,000 for MFS living apart) — and Part III adds
 * passive income (line 10 = lines 1a + 2a). Part VI allocates the allowance ratably among
 * line-1 losses; Part VII spreads the unallowed remainder ratably over every loss left
 * (both lines); Part VIII gives each activity's allowed loss for Schedule E. Prior-year
 * unallowed losses and passive credits aren't modelled (computeReturn reports them).
 */
import { FakeTaxpayer, RentalProperty } from "../faker/taxpayer";
import { Rounder, sumWith } from "./rounding";

export const PASSIVE = {
  specialAllowance: { other: 25000, mfsApart: 12500 },
  phaseoutStart: { other: 100000, mfsApart: 50000 },
  line5: { other: 150000, mfsApart: 75000 },
  phaseoutRate: 0.5,
};

export type PassiveClass = "nonpassive" | "line1" | "line2";

/** Schedule E line 1b code 6: royalty property. */
export const isRoyalty = (p: RentalProperty) => p.propertyType === 6;
/** Schedule E line 1b code 7: self-rental. */
export const isSelfRental = (p: RentalProperty) => p.propertyType === 7;

export function passiveClass(t: FakeTaxpayer, p: RentalProperty, net: number): PassiveClass {
  if (isRoyalty(p)) return p.royaltyPassive ? "line2" : "nonpassive";
  if (t.realEstateProfessional && p.materialParticipation) return "nonpassive";
  if (isSelfRental(p) && net > 0) return "nonpassive";
  const together = t.filingStatus === "MFS" && t.mfsLivedWithSpouse !== false;
  return p.activeParticipation === false || together ? "line2" : "line1";
}

export interface Form8582Activity {
  cls: PassiveClass;
  net: number; loss: number; ratio: number; specialAllowance: number; afterAllowance: number; unallowed: number; allowed: number;
}

export interface Form8582Lines {
  required: boolean;
  /** Why no form is needed / no limit applies ("" when the limit is applied). */
  note: string;
  line1a: number; line1b: number; line1c: number; line1d: number;
  line2a: number; line2b: number; line2c: number; line2d: number;
  line3: number;
  /** Part II (only when line 3 and line 1d are losses and MFS didn't live with the spouse). */
  partII?: { line4: number; line5: number; line6: number; line7: number; line8: number; line9: number };
  line10: number;
  line11: number;
  /** Per Schedule E column, index-aligned with the rentals. Nonpassive columns are fully allowed. */
  activities: Form8582Activity[];
  modifiedAgi: number;
  unallowedCarryforward: number;
}

/**
 * @param columns Schedule E line 21 and the passive class for each column.
 * @param modifiedAgi Form 8582 line 6 modified AGI (AGI without passive losses, a real estate
 *   professional's rental losses, taxable Social Security, the SE-tax deduction and the IRA /
 *   student loan interest deductions).
 */
export function form8582(t: FakeTaxpayer, columns: Array<{ net: number; cls: PassiveClass }>, modifiedAgi: number, R: Rounder): Form8582Lines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const mfs = t.filingStatus === "MFS";
  const together = mfs && t.mfsLivedWithSpouse !== false;
  const of = (cls: PassiveClass) => columns.filter((c) => c.cls === cls).map((c) => c.net);
  const line1a = sum(of("line1").filter((n) => n > 0));
  const line1b = sum(of("line1").filter((n) => n < 0));      // ≤ 0
  const line1c = 0;
  const line1d = R(line1a + line1b + line1c);
  const line2a = sum(of("line2").filter((n) => n > 0));
  const line2b = sum(of("line2").filter((n) => n < 0));      // ≤ 0
  const line2c = 0;
  const line2d = R(line2a + line2b + line2c);
  const line3 = R(line1d + line2d);
  const passive = (c: { cls: PassiveClass }) => c.cls !== "nonpassive";
  const losses = columns.map((c) => (passive(c) && c.net < 0 ? -c.net : 0));
  const totalLoss = sum(losses);
  const base = { line1a, line1b, line1c, line1d, line2a, line2b, line2c, line2d, line3, modifiedAgi };
  const allAllowed = (note: string, required: boolean): Form8582Lines => ({
    ...base, required, note, line10: R(line1a + line2a), line11: R(line1a + line2a + totalLoss),
    activities: columns.map((c, i) => {
      const loss = c.net < 0 ? -c.net : 0;
      return { cls: c.cls, net: c.net, loss: passive(c) ? losses[i] : loss, ratio: 0, specialAllowance: 0, afterAllowance: loss, unallowed: 0, allowed: loss };
    }),
    unallowedCarryforward: 0,
  });

  if (!totalLoss) return allAllowed("no passive loss", false);
  const cap = mfs ? PASSIVE.specialAllowance.mfsApart : PASSIVE.specialAllowance.other;
  const magiLimit = mfs ? PASSIVE.phaseoutStart.mfsApart : PASSIVE.phaseoutStart.other;
  if (!together && !of("line2").length && -line3 <= cap && modifiedAgi <= magiLimit) {
    return allAllowed("exception: active-participation rentals only, loss and modified AGI within the limits", false);
  }
  if (line3 >= 0) return allAllowed("line 3 is zero or more: all losses allowed", true);

  // Part II — special allowance for line-1 losses (none when MFS lived with the spouse).
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
  const line10 = R(line1a + line2a);
  const line11 = R(line9 + line10);

  // Part VI: the special allowance among line-1 losses; Part VII: the unallowed remainder
  // over every loss left; Part VIII: allowed.
  const line1Losses = columns.map((c, i) => (c.cls === "line1" ? losses[i] : 0));
  const line1Total = sum(line1Losses);
  const ratios = line1Losses.map((l) => (line1Total ? l / line1Total : 0));
  const special = ratios.map((r) => R(line9 * r));
  const after = losses.map((l, i) => R(l - special[i]));
  const afterTotal = sum(after);
  const totalUnallowed = Math.max(0, R(totalLoss - line11));
  const unallowed = after.map((a) => (afterTotal ? R(totalUnallowed * (a / afterTotal)) : 0));
  const activities = columns.map((c, i): Form8582Activity => {
    if (!passive(c)) { const loss = c.net < 0 ? -c.net : 0; return { cls: c.cls, net: c.net, loss, ratio: 0, specialAllowance: 0, afterAllowance: loss, unallowed: 0, allowed: loss }; }
    return { cls: c.cls, net: c.net, loss: losses[i], ratio: ratios[i], specialAllowance: special[i], afterAllowance: after[i], unallowed: unallowed[i], allowed: R(losses[i] - unallowed[i]) };
  });
  return { ...base, required: true, note: "", partII, line10, line11, activities, unallowedCarryforward: sum(unallowed) };
}
