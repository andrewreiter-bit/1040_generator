/**
 * Form 1040 lines 4a–5b from Forms 1099-R, and the 10% additional tax on early
 * distributions (Schedule 2 line 8).
 *
 * Line placement (Form 1040 instructions, lines 4a/4b and 5a/5b, 2023–2025):
 *   - IRA/SEP/SIMPLE box checked → lines 4a/4b; otherwise pensions and annuities → 5a/5b.
 *   - A fully taxable distribution goes on 4b (5b) only; 4a (5a) is left blank. 2025 says
 *     so for both lines, 2023 for both, 2024 for pensions (its IRA text is silent and is
 *     treated the same way).
 *   - Otherwise (rollover, qualified Roth distribution, partly taxable pension) 4a/5a is the
 *     total of all distributions on that line and 4b/5b the total taxable part
 *     ("More than one distribution").
 *   - Code G (direct rollover): box 2a is 0, so the taxable part is 0; 2025 checks box 1 on
 *     line 4c/5c (2023/2024 write "Rollover" beside the line, which has no PDF field).
 *   - Code Q (qualified Roth IRA distribution): 4a total, 4b 0 (Exception 2).
 *
 * Schedule 2 line 8 (Schedule 2 instructions, "Exception"): when only early distributions
 * apply and code 1 is shown on ALL of a person's Forms 1099-R, Form 5329 isn't required:
 * line 8 is 10% of the taxable amount reported on line 4b/5b for those distributions, with
 * the line 8 box checked. Form 5329 is per person, so a spouse's other codes don't matter.
 * A person with code 1 next to another code would need Form 5329 (not modelled): the
 * profiles never draw that, and other input is reported in `unsupported`.
 *
 * Pension and IRA distributions are neither earned income nor EIC investment income, and
 * are excluded from net investment income (Form 8960); they do count in AGI-based tests
 * (Social Security worksheet, Form 8582 modified AGI, the senior deduction).
 */
import { FakeTaxpayer, Retirement1099R } from "../faker/taxpayer";
import { Rounder, sumWith } from "./rounding";

export interface RetirementRecord {
  r: Retirement1099R;
  line: "ira" | "pension";
  /** Amount that goes on 4b/5b for this distribution. */
  taxable: number;
  /** Fully taxable with no exception: on its own it would leave 4a/5a blank. */
  fullyTaxable: boolean;
  rollover: boolean;
  /** 10% additional tax (code 1). */
  earlyTax: number;
}

export interface RetirementLines {
  records: RetirementRecord[];
  line4a: number;   // 0 = blank
  line4b: number;
  line4aBlank: boolean;
  line5a: number;
  line5b: number;
  line5aBlank: boolean;
  /** 2025 line 4c / 5c box 1. */
  iraRollover: boolean;
  pensionRollover: boolean;
  /** Schedule 2 line 8 (no Form 5329: code 1 on every early distribution). */
  additionalTax: number;
  /** A person has code 1 alongside another code (Form 5329 would be required). */
  needsForm5329: boolean;
  federalWithheld: number;
}

/** 1099-Rs on this return (a spouse's only when filing jointly). */
export function includedRetirement1099Rs(t: FakeTaxpayer): Retirement1099R[] {
  return (t.retirement1099Rs ?? []).filter((r) => r.recipient !== "spouse" || t.filingStatus === "MFJ");
}

export function retirementDistributions(t: FakeTaxpayer, R: Rounder): RetirementLines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const records: RetirementRecord[] = includedRetirement1099Rs(t).map((r) => {
    const code = r.distributionCode;
    const taxable = code === "G" || code === "Q" ? 0 : R(r.taxableAmount);
    const rollover = code === "G";
    return {
      r,
      line: r.iraSepSimple ? "ira" : "pension",
      taxable,
      fullyTaxable: !rollover && code !== "Q" && taxable === R(r.grossDistribution),
      rollover,
      earlyTax: 0,
    };
  });
  const early = records.filter((x) => x.r.distributionCode === "1");
  const person = (x: RetirementRecord) => x.r.recipient ?? "primary";
  const needsForm5329 = early.some((e) => records.some((x) => person(x) === person(e) && x.r.distributionCode !== "1"));
  // 10% of the taxable amount of the code 1 distributions, as one line-8 figure.
  const additionalTax = early.length ? R(sum(early.map((x) => x.taxable)) * 0.1) : 0;
  for (const x of early) x.earlyTax = R(x.taxable * 0.1);

  const side = (line: "ira" | "pension") => {
    const xs = records.filter((x) => x.line === line);
    const blank = xs.every((x) => x.fullyTaxable);
    return {
      gross: blank ? 0 : sum(xs.map((x) => x.r.grossDistribution)),
      taxable: sum(xs.map((x) => x.taxable)),
      blank,
      rollover: xs.some((x) => x.rollover),
    };
  };
  const ira = side("ira");
  const pension = side("pension");
  return {
    records,
    line4a: ira.gross, line4b: ira.taxable, line4aBlank: ira.blank,
    line5a: pension.gross, line5b: pension.taxable, line5aBlank: pension.blank,
    iraRollover: ira.rollover, pensionRollover: pension.rollover,
    additionalTax,
    needsForm5329,
    federalWithheld: sum(records.map((x) => x.r.federalWithheld)),
  };
}
