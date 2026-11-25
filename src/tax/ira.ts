/**
 * Traditional IRA deduction (Schedule 1 line 20), the IRA Deduction Worksheet in each year's
 * Form 1040 instructions (2023, 2024; 2025 amounts from Pub 590-A):
 *
 *   1a/1b  covered by a workplace plan (W-2 box 13 "Retirement plan")
 *   Nobody covered → line 7 is the contribution limit (+ catch-up at 50).
 *   2  phase-out end: single/HOH/MFS apart; joint (and QSS), but the not-covered spouse of a
 *      covered person gets the higher figure; MFS living together $10,000
 *   5  modified AGI = Form 1040 line 9 less Schedule 1 lines 11–19a, 23 and 25 (the IRA and
 *      student loan interest deductions are left out)
 *   6/7  room = line 2 − line 5; at or above the range width the full limit, otherwise room ×
 *      limit / width, rounded up to the next $10, at least $200; nothing when room ≤ 0
 *   8–10 compensation: wages plus net self-employment earnings less the SE-tax deduction
 *   12  per person the smallest of line 7, line 10 and the contribution
 *
 * Reported as unsupported (Pub 590-A territory): nondeductible contributions (Form 8606), a
 * joint return with both traditional and Roth contributions, someone covered while the
 * household gets Social Security (the two worksheets depend on each other; Appendix B), and a
 * joint return whose compensation is below the worksheet's caution threshold.
 */
import { FakeTaxpayer, W2Record } from "../faker/taxpayer";
import { IRA_CATCH_UP, IRA_CONTRIBUTION_LIMIT, IRA_PHASEOUT_END } from "../config/tax-year";
import { ELECTIVE_DEFERRAL_CODES } from "./savers-credit";
import { ScheduleSELines } from "./business";
import { Rounder, sumWith } from "./rounding";

type Person = "primary" | "spouse";

export interface IraDeductionLines {
  covered: [boolean, boolean];
  line2: [number, number];
  line5: number;
  line7: [number, number];
  line10: number;
  line11: [number, number];
  line12: [number, number];
  deduction: number;
  unsupported: string[];
}

/** W-2 box 13: covered by a retirement plan at work. */
export const coveredByPlan = (w: W2Record): boolean =>
  w.retirementPlan ?? (w.box12 ?? []).some((e) => ELECTIVE_DEFERRAL_CODES.has(e.code));

/**
 * @param line9 Form 1040 line 9 (total income)
 * @param otherAdjustments Schedule 1 lines 11–19a, 23 and 25
 * @param hasSocialSecurity the return reports Social Security benefits
 */
export function iraDeduction(
  t: FakeTaxpayer, w2s: W2Record[], ses: ScheduleSELines[], line9: number, otherAdjustments: number,
  hasSocialSecurity: boolean, R: Rounder,
): IraDeductionLines | undefined {
  const c = t.traditionalIraContributions;
  const joint = t.filingStatus === "MFJ";
  const contrib: [number, number] = [R(c?.primary ?? 0), joint ? R(c?.spouse ?? 0) : 0];
  if (contrib[0] + contrib[1] <= 0) return undefined;
  const sum = (xs: number[]) => sumWith(R, xs);
  const unsupported: string[] = [];
  const people: Person[] = ["primary", "spouse"];
  const covered = people.map((p, i) => (i === 0 || joint) && w2s.some((w) => (w.employee ?? "primary") === p && coveredByPlan(w))) as [boolean, boolean];
  const age = (p: Person) => t.taxYear - Number(((p === "primary" ? t.dateOfBirth : t.spouseDateOfBirth) ?? "").split("/")[2]);
  const limitOf = (i: number) => IRA_CONTRIBUTION_LIMIT[t.taxYear] + (age(people[i]) >= 50 ? IRA_CATCH_UP : 0);
  const ends = IRA_PHASEOUT_END[t.taxYear];
  const mfsTogether = t.filingStatus === "MFS" && t.mfsLivedWithSpouse !== false;
  const line5 = R(line9 - otherAdjustments);
  const anyCovered = covered[0] || covered[1];
  if (anyCovered && hasSocialSecurity) unsupported.push("IRA deduction with workplace-plan coverage and Social Security benefits (Pub 590-A, Appendix B)");
  const line2 = [0, 1].map((i) => {
    if (!anyCovered) return 0;
    if (mfsTogether) return ends.mfsTogether;
    if (joint || t.filingStatus === "QSS") return joint && !covered[i] ? ends.spouseCovered : ends.joint;
    return ends.single;
  }) as [number, number];
  const line7 = [0, 1].map((i) => {
    const limit = limitOf(i);
    if (!anyCovered) return limit;
    const width = (joint || t.filingStatus === "QSS") && covered[i] ? 20000 : 10000;
    const room = R(line2[i] - line5);
    if (room <= 0) return 0;
    if (room >= width) return limit;
    return Math.max(200, Math.ceil((room * limit) / width / 10) * 10);
  }) as [number, number];
  const earned = (p: Person) => sum(w2s.filter((w) => (w.employee ?? "primary") === p).map((w) => w.wages))
    + sum(ses.filter((s) => s.owner === p).map((s) => s.combined - s.deduction));
  const line10 = Math.max(0, R(earned("primary") + (joint ? earned("spouse") : 0)));
  if (joint && line10 < 2 * IRA_CONTRIBUTION_LIMIT[t.taxYear] + [0, 1].filter((i) => age(people[i]) >= 50).length * IRA_CATCH_UP) {
    unsupported.push("joint IRA deduction with compensation below the worksheet's limit (Pub 590-A)");
  }
  const line12 = [0, 1].map((i) => Math.min(line7[i], line10, contrib[i])) as [number, number];
  const deduction = R(line12[0] + line12[1]);
  if (R(contrib[0] + contrib[1]) > deduction) unsupported.push("nondeductible traditional IRA contributions (Form 8606)");
  if (joint && (t.rothIraContributions?.primary || t.rothIraContributions?.spouse)) {
    unsupported.push("joint return with both traditional and Roth IRA contributions (Pub 590-A)");
  }
  return { covered, line2, line5, line7, line10, line11: contrib, line12, deduction, unsupported };
}
