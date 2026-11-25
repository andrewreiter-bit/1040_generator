/**
 * Form 8880, Credit for Qualified Retirement Savings Contributions (Saver's credit),
 * 2023–2025. Each year's form (page 2 holds the instructions) gives:
 *
 *   Eligibility (per person): born on or before January 1 of the tax year minus 17, not a
 *     full-time student, not claimed as a dependent (the model has no such flag). An
 *     ineligible person's column is 0.
 *   Line 1  traditional / Roth IRA contributions (the model has Roth only)
 *   Line 2  elective deferrals: W-2 box 12 codes D, E, F, G, H, S, AA, BB, EE
 *   Line 4  distributions from IRAs and plans in the testing period, rollovers excluded
 *           (code G). On a joint return BOTH spouses' distributions go in BOTH columns.
 *           Only the current year's Forms 1099-R are known; the two prior years and the
 *           filing season are assumed to have none.
 *   Lines 5–7  max(0, 3 − 4), at most $2,000 per person, added
 *   Line 9  rate from the year's AGI table (single, MFS and QSS share a column)
 *   Line 11 Credit Limit Worksheet: Form 1040 line 18 less Schedule 3 lines 1–3, 6d and 6l
 *           (none modelled), so line 18
 *   Line 12 smaller of 10 and 11 → Schedule 3 line 4. The child tax credit comes after
 *           it: Schedule 8812 Credit Limit Worksheet A subtracts Schedule 3 line 4.
 */
import { FakeTaxpayer, W2Record } from "../faker/taxpayer";
import { saversCreditRate } from "../config/tax-year";
import { RetirementRecord } from "./retirement";
import { Rounder } from "./rounding";

export const ELECTIVE_DEFERRAL_CODES = new Set(["D", "E", "F", "G", "H", "S", "AA", "BB", "EE"]);
const PER_PERSON_LIMIT = 2000;

type Pair = [number, number];

export interface Form8880Lines {
  eligible: [boolean, boolean];
  line1: Pair; line2: Pair; line3: Pair; line4: Pair; line5: Pair; line6: Pair;
  line7: number; line8: number; line9: number; line10: number; line11: number; line12: number;
  /** Filed only when there is a credit (lines 7, 9 and 11 all above zero). */
  required: boolean;
}

/** Born after January 1 of (tax year − 17) → too young (e.g. after 1/1/2006 for 2023). */
function oldEnough(dob: string | null, taxYear: number): boolean {
  if (!dob) return false;
  const [m, d, y] = dob.split("/").map(Number);
  const cutoff = taxYear - 17;
  return y < cutoff || (y === cutoff && m === 1 && d === 1);
}

export function form8880(
  t: FakeTaxpayer, w2s: W2Record[], distributions: RetirementRecord[], agi: number, line18: number, R: Rounder,
): Form8880Lines {
  const joint = t.filingStatus === "MFJ";
  const people = ["primary", "spouse"] as const;
  const eligible = people.map((p, i) =>
    (i === 0 || joint)
    && oldEnough(i === 0 ? t.dateOfBirth : t.spouseDateOfBirth, t.taxYear)
    && !t.fullTimeStudent?.[p]) as [boolean, boolean];
  const col = (f: (p: "primary" | "spouse") => number): Pair => people.map((p, i) => (eligible[i] ? R(f(p)) : 0)) as Pair;

  const line1 = col((p) => t.rothIraContributions?.[p] ?? 0);
  const line2 = col((p) => w2s
    .filter((w) => (w.employee ?? "primary") === p)
    .flatMap((w) => w.box12 ?? [])
    .filter((e) => ELECTIVE_DEFERRAL_CODES.has(e.code))
    .reduce((s, e) => s + e.amount, 0));
  const line3 = [R(line1[0] + line2[0]), R(line1[1] + line2[1])] as Pair;
  // Rollovers (code G) aren't counted; on a joint return each column takes both spouses' amounts.
  const counted = distributions.filter((x) => x.r.distributionCode !== "G");
  const own = (p: "primary" | "spouse") => counted.filter((x) => (x.r.recipient ?? "primary") === p).reduce((s, x) => s + x.r.grossDistribution, 0);
  const both = own("primary") + own("spouse");
  const line4 = col((p) => (joint ? both : own(p)));
  const line5 = line3.map((v, i) => Math.max(0, R(v - line4[i]))) as Pair;
  const line6 = line5.map((v) => Math.min(v, PER_PERSON_LIMIT)) as Pair;
  const line7 = R(line6[0] + line6[1]);
  const line8 = R(agi);
  const line9 = line7 > 0 ? saversCreditRate(t.taxYear, t.filingStatus, line8) : 0;
  const line10 = R(line7 * line9);
  const line11 = Math.max(0, R(line18));
  const line12 = Math.min(line10, line11);
  return {
    eligible, line1, line2, line3, line4, line5, line6, line7, line8, line9, line10, line11, line12,
    required: line12 > 0,
  };
}
