/**
 * Form 2441 Part II, credit for child and dependent care expenses, 2023–2025 (each
 * year's form prints the same line 8 table; instructions checked for 2023 and 2025).
 *
 *   Qualifying person: a qualifying child (relationship, residency, age tests — the same
 *     test as the child tax credit and EIC) under 13 at year end, or a disabled dependent
 *     who lived with the filer more than half the year. (A child who turned 13 during the
 *     year qualifies for part of it only; expenses for one are reported as unsupported.)
 *   Line 3  expenses, at most $3,000 for one qualifying person or $6,000 for two or more
 *   Lines 4/5  earned income: each person's W-2 wages (line 1z) plus Schedule SE line 3
 *     less the SE-tax deduction; line 5 is the spouse on a joint return, else line 4.
 *     (Deemed income for a student or disabled spouse isn't modelled.)
 *   Line 8  35% at AGI up to $15,000, one point less per $2,000 (or part), 20% over $43,000
 *   Line 10 Credit Limit Worksheet: Form 1040 line 18 less Schedule 3 line 1 and 6l
 *     (neither modelled)
 *   Line 11 smaller of 9c and 10 → Schedule 3 line 2
 *
 * Married filing separately: only a filer considered unmarried (§ 21(e)(4): the spouse not in the
 * home for the last 6 months, over half the cost of the home paid, line A checked) can claim it;
 * any other separate filer gets no credit. Part III
 * (employer-provided benefits, W-2 box 10) and Schedule H (household employees) aren't
 * modelled; line 9b (prior-year expenses) is 0 and flagged when it could change the credit.
 */
import { FakeTaxpayer, W2Record } from "../faker/taxpayer";
import { ScheduleSELines } from "./business";
import { isQualifyingChild, mfsUnmarriedForCare } from "./household";
import { Rounder, sumWith } from "./rounding";

export interface Form2441Person { dependentIndex: number; amount: number }

export interface Form2441Lines {
  /** Line 2 rows: qualifying persons with expenses. */
  persons: Form2441Person[];
  line3: number; line4: number; line5: number; line6: number; line7: number; line8: number;
  line9a: number; line9b: number; line9c: number; line10: number; line11: number;
  /** Line A: married filing separately and treated as unmarried. */
  lineA: boolean;
  required: boolean;
  unsupported: string[];
}

export function dependentCareRate(agi: number): number {
  if (agi <= 15000) return 0.35;
  return Math.max(20, 35 - Math.ceil((agi - 15000) / 2000)) / 100;
}

export function isQualifyingCarePerson(t: FakeTaxpayer, i: number): boolean {
  const d = t.dependents[i];
  if (!d) return false;
  if (d.birthYear > t.taxYear) return false;
  return (isQualifyingChild(d, t) && t.taxYear - d.birthYear < 13) || (!!d.disabled && d.monthsInHome > 6);
}

export function form2441(
  t: FakeTaxpayer, w2s: W2Record[], ses: ScheduleSELines[], agi: number, line18: number, R: Rounder,
  /** Other earned income per person (Form 1040 line 1h, e.g. disability pensions before retirement age). */
  otherEarned: { primary: number; spouse: number } = { primary: 0, spouse: 0 },
): Form2441Lines | undefined {
  const care = t.dependentCare;
  if (!care) return undefined;
  const sum = (xs: number[]) => sumWith(R, xs);
  const unsupported: string[] = [];
  if (care.providers.some((p) => p.householdEmployee)) unsupported.push("household employee care provider (Schedule H)");
  for (const e of care.expenses) {
    const d = t.dependents[e.dependentIndex];
    if (d && e.amount > 0 && !isQualifyingCarePerson(t, e.dependentIndex) && t.taxYear - d.birthYear === 13) {
      unsupported.push("care expenses for a child who turned 13 during the year (part-year qualifying person)");
    }
  }
  const persons = care.expenses.filter((e) => e.amount > 0 && isQualifyingCarePerson(t, e.dependentIndex));
  const mfsTogether = t.filingStatus === "MFS" && !mfsUnmarriedForCare(t);
  const earned = (who: "primary" | "spouse") => R(
    sum(w2s.filter((w) => (w.employee ?? "primary") === who).map((w) => w.wages))
    + sum(ses.filter((s) => s.owner === who).map((s) => s.combined - s.deduction))
    + otherEarned[who],
  );
  const line3 = Math.min(sum(persons.map((p) => p.amount)), persons.length >= 2 ? 6000 : 3000);
  const line4 = Math.max(0, earned("primary"));
  const line5 = t.filingStatus === "MFJ" ? Math.max(0, earned("spouse")) : line4;
  const line6 = Math.min(line3, line4, line5);
  const line7 = R(agi);
  const line8 = dependentCareRate(line7);
  const line9a = R(line6 * line8);
  const line10 = Math.max(0, R(line18));
  if ((care.priorYearExpensesPaid ?? 0) > 0 && line10 > line9a) {
    unsupported.push("prior-year dependent care expenses paid this year (Form 2441 line 9b, Worksheet A)");
  }
  const line9b = 0;
  const line9c = R(line9a + line9b);
  const line11 = mfsTogether || !persons.length ? 0 : Math.min(line9c, line10);
  return {
    persons, line3, line4, line5, line6, line7, line8, line9a, line9b, line9c, line10, line11,
    lineA: t.filingStatus === "MFS" && !mfsTogether,
    required: line11 > 0,
    unsupported,
  };
}
