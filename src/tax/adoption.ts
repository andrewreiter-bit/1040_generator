/**
 * Form 8839 Part II, adoption credit, 2025 on (2025 Form 8839 and instructions; § 23 as amended by
 * the OBBBA, which made up to $5,000 per child refundable from 2025).
 *
 *   Line 2   maximum credit per child ($17,280 for 2025, $17,670 for 2026)
 *   Line 3   expenses used for a credit for this child in a prior year; line 4 = 2 − 3
 *   Line 5   qualified adoption expenses: for a U.S. adoption that became final this year, those
 *            paid last year and this year (if it isn't final yet, last year's; if final earlier,
 *            this year's). A child with special needs whose adoption became final this year: line 4
 *            regardless of expenses.
 *   Line 6   smaller of 4 and 5
 *   Lines 7–10  MAGI (AGI; no exclusions modelled) over the phase-out start ÷ $40,000, to three
 *            places, not more than 1.000, times each child's line 6
 *   Line 11a 6 − 10; 11b the smaller of 11a and the refundable limit; 11c their total
 *   Line 12  total of 11a; line 13 = 11c, the refundable credit → Form 1040 line 30 (2025)
 *   Lines 14–18  12 − 13, plus any carryforward (line 15), limited by the Credit Limit Worksheet
 *            (Form 1040 line 18 less line 19 and Schedule 3 lines 1–4, 5b, 6d, 6f, 6g, 6l, 6m) →
 *            Schedule 3 line 6c; the rest carries forward as a nonrefundable credit.
 *
 * Order (§§ 23(c), 24(b)(3)): the child tax credit and the other Schedule 3 credits come first, so
 * the adoption credit's limit is what they leave. Not modelled: foreign adoptions, unsuccessful
 * adoptions, employer-provided adoption benefits (Part III) and more than three children.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { ADOPTION } from "../config/tax-year";
import { Rounder, sumWith } from "./rounding";

export interface Form8839Child { dependentIndex: number; line2: number; line3: number; line4: number; line5: number; line6: number; line10: number; line11a: number; line11b: number }
export interface Form8839Lines {
  children: Form8839Child[];
  line7: number;
  /** Line 8 (MAGI over the start) and line 9 (the fraction); undefined when MAGI isn't over it. */
  line8?: number; line9?: number;
  line11c: number; line12: number; line13: number; line14: number; line15: number; line16: number; line17: number; line18: number;
  /** Nonrefundable credit left to carry forward (line 16 − line 18). */
  carryforward: number;
  unsupported: string[];
}

/** Lines 2–16 and 13 (the refundable credit); lines 17–18 wait for the credit limit (`limitAdoptionCredit`). */
export function form8839(t: FakeTaxpayer, magi: number, R: Rounder): Form8839Lines | undefined {
  const c = ADOPTION[t.taxYear];
  const adoptions = t.adoptions ?? [];
  if ((!adoptions.length && !t.adoptionCreditCarryforward) || !c) {
    return adoptions.length ? { children: [], line7: 0, line11c: 0, line12: 0, line13: 0, line14: 0, line15: 0, line16: 0, line17: 0, line18: 0, carryforward: 0, unsupported: ["adoption credit before 2025 (Form 8839, not modelled)"] } : undefined;
  }
  const sum = (xs: number[]) => sumWith(R, xs);
  const unsupported: string[] = [];
  if (adoptions.length > 3) unsupported.push("adoption credit for more than three children (Form 8839 continuation)");
  const line7 = R(magi);
  const over = line7 - c.phaseoutStart;
  const line8 = over > 0 ? R(over) : undefined;
  const line9 = line8 === undefined ? undefined : Math.min(1, Math.round((line8 / c.phaseoutRange) * 1000) / 1000);
  const children = adoptions.slice(0, 3).map((a): Form8839Child => {
    const line2 = c.max, line3 = R(a.priorYearCredit ?? 0), line4 = Math.max(0, R(line2 - line3));
    const finalNow = a.finalYear === t.taxYear;
    const line5 = finalNow && a.specialNeeds ? line4
      : R(finalNow ? a.expensesPaidPriorYear + a.expensesPaidThisYear : a.finalYear < t.taxYear ? a.expensesPaidThisYear : a.expensesPaidPriorYear);
    const line6 = Math.min(line4, line5);
    const line10 = line9 === undefined ? 0 : R(line6 * line9);
    const line11a = Math.max(0, R(line6 - line10));
    const line11b = Math.min(line11a, c.refundable);
    return { dependentIndex: a.dependentIndex, line2, line3, line4, line5, line6, line10, line11a, line11b };
  });
  const line11c = sum(children.map((x) => x.line11b));
  const line12 = sum(children.map((x) => x.line11a));
  const line13 = line11c;
  const line14 = Math.max(0, R(line12 - line13));
  const line15 = R(t.adoptionCreditCarryforward ?? 0);
  const line16 = sum([line14, line15]);
  return { children, line7, line8, line9, line11c, line12, line13, line14, line15, line16, line17: 0, line18: 0, carryforward: line16, unsupported };
}

/** Credit Limit Worksheet (line 17) and line 18: `available` = Form 1040 line 18 less line 19 and the earlier Schedule 3 credits. */
export function limitAdoptionCredit(f: Form8839Lines, available: number, R: Rounder): Form8839Lines {
  const line17 = Math.min(f.line16, Math.max(0, R(available)));
  const line18 = Math.min(f.line16, line17);
  return { ...f, line17, line18, carryforward: Math.max(0, R(f.line16 - line18)) };
}
