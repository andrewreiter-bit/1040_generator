/**
 * Form 8863, education credits, 2023–2025 (each year's form and instructions):
 *
 *   Part III, per student: the American opportunity credit (AOTC) when the AOTC wasn't
 *     claimed for 4 prior years (line 23), the student was at least half-time in a degree
 *     program (24), hadn't completed 4 years of postsecondary education (25) and has no
 *     felony drug conviction (26): line 27 = adjusted expenses up to $4,000, line 30 =
 *     100% of the first $2,000 + 25% of the rest. Otherwise the lifetime learning credit
 *     (LLC) base, line 31 = adjusted expenses. Adjusted expenses = tuition paid (1098-T
 *     box 1) less scholarships (box 5), plus course materials bought elsewhere for the AOTC.
 *   Part I: line 6 phases the AOTC out between $80,000 and $90,000 of MAGI ($160,000–
 *     $180,000 joint), rounded to 3 decimals; line 8 (refundable, → 1040 line 29) is 40%
 *     unless the under-24 conditions apply (`aotcNonrefundableOnly`); line 9 is the rest.
 *   Part II: LLC = 20% of up to $10,000, same phase-out; line 19 = Credit Limit
 *     Worksheet: smaller of (line 18 + line 9) and Form 1040 line 18 less Schedule 3
 *     lines 1, 2, 6d and 6l (only line 2, the dependent care credit, is modelled).
 *
 * Married filing separately can't claim either credit. MAGI is AGI (no foreign income
 * exclusions are modelled). Expenses are assumed paid in the tax year for academic
 * periods beginning in it (no 1098-T box 7 prepayments).
 */
import { EducationStudent, FakeTaxpayer } from "../faker/taxpayer";
import { Rounder, sumWith } from "./rounding";

export interface Form8863Student {
  index: number;              // into t.education.students
  aotc: boolean;
  adjustedExpenses: number;
  line27: number; line28: number; line29: number; line30: number; line31: number;
}

export interface Form8863Lines {
  students: Form8863Student[];
  line1: number; line2: number; line3: number; line4: number; line5: number; line6: number;
  line7: number; line8: number; line9: number;
  line10: number; line11: number; line12: number; line13: number; line14: number; line15: number;
  line16: number; line17: number; line18: number; line19: number;
  /** Credit Limit Worksheet lines 3–6. */
  worksheet: { line3: number; line4: number; line5: number; line6: number };
  nonrefundableOnly: boolean;
  required: boolean;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function aotcEligible(s: EducationStudent): boolean {
  return s.aotcPriorYears < 4 && s.halfTime && !s.completedFirst4Years && !s.felonyDrugConviction;
}

/**
 * @param taxLine18 Form 1040 line 18 (Credit Limit Worksheet line 4)
 * @param otherCredits Schedule 3 lines 1, 2, 6d and 6l (worksheet line 5)
 */
export function form8863(t: FakeTaxpayer, agi: number, taxLine18: number, otherCredits: number, R: Rounder): Form8863Lines | undefined {
  const ed = t.education;
  if (!ed?.students.length) return undefined;
  const sum = (xs: number[]) => sumWith(R, xs);
  const joint = t.filingStatus === "MFJ";
  const mfs = t.filingStatus === "MFS";

  const students = ed.students.map((s, index): Form8863Student => {
    const aotc = aotcEligible(s);
    const adjustedExpenses = R(Math.max(0, s.tuitionPaid - s.scholarships) + (aotc ? s.courseMaterials ?? 0 : 0));
    if (!aotc) return { index, aotc, adjustedExpenses, line27: 0, line28: 0, line29: 0, line30: 0, line31: adjustedExpenses };
    const line27 = Math.min(adjustedExpenses, 4000);
    const line28 = Math.max(0, R(line27 - 2000));
    const line29 = R(line28 * 0.25);
    const line30 = line28 === 0 ? line27 : R(2000 + line29);
    return { index, aotc, adjustedExpenses, line27, line28, line29, line30, line31: 0 };
  });

  const limit = joint ? 180000 : 90000;
  const range = joint ? 20000 : 10000;
  const phase = (magi: number) => {
    const room = R(limit - magi);
    return { room, factor: room <= 0 ? 0 : room >= range ? 1 : round3(room / range) };
  };
  const line1 = sum(students.map((s) => s.line30));
  const line3 = R(agi);
  const p1 = phase(line3);
  const line4 = Math.max(0, p1.room);
  const line6 = mfs ? 0 : p1.factor;
  const line7 = R(line1 * line6);
  const nonrefundableOnly = !!ed.aotcNonrefundableOnly;
  const line8 = nonrefundableOnly ? 0 : R(line7 * 0.4);
  const line9 = R(line7 - line8);
  const line10 = sum(students.map((s) => s.line31));
  const line11 = Math.min(line10, 10000);
  const line12 = R(line11 * 0.2);
  const line14 = line3;
  const line15 = Math.max(0, p1.room);
  const line17 = mfs ? 0 : p1.factor;
  const line18 = line10 > 0 ? R(line12 * line17) : 0;
  // Credit Limit Worksheet.
  const ws3 = R(line18 + line9);
  const ws4 = R(taxLine18);
  const ws5 = R(otherCredits);
  const ws6 = Math.max(0, R(ws4 - ws5));
  const line19 = Math.min(ws3, ws6);
  return {
    students, line1, line2: limit, line3, line4, line5: range, line6, line7, line8, line9,
    line10, line11, line12, line13: limit, line14, line15, line16: range, line17, line18, line19,
    worksheet: { line3: ws3, line4: ws4, line5: ws5, line6: ws6 },
    nonrefundableOnly,
    required: line8 > 0 || line19 > 0,
  };
}
