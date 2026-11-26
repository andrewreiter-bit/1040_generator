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
import { Form8606Lines, form8606 } from "./ira-basis";
import { Rounder, sumWith } from "./rounding";

export interface RetirementRecord {
  r: Retirement1099R;
  /** "wages": a disability pension before minimum retirement age (Form 1040 line 1h). */
  line: "ira" | "pension" | "wages";
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
  /** Form 1040 line 1h: disability pensions before minimum retirement age, per person. */
  disabilityPension: { primary: number; spouse: number };
  /** Form 8606 per person with basis (its lines 15c + 18 replace box 2a for that person's IRAs). */
  form8606: { primary?: Form8606Lines; spouse?: Form8606Lines };
  unsupported: string[];
}

/** 1099-Rs on this return (a spouse's only when filing jointly). */
export function includedRetirement1099Rs(t: FakeTaxpayer): Retirement1099R[] {
  return (t.retirement1099Rs ?? []).filter((r) => r.recipient !== "spouse" || t.filingStatus === "MFJ");
}

export function retirementDistributions(t: FakeTaxpayer, R: Rounder): RetirementLines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const joint = t.filingStatus === "MFJ";
  const f8606: RetirementLines["form8606"] = {
    primary: t.form8606?.primary ? form8606(t.form8606.primary, R) : undefined,
    spouse: joint && t.form8606?.spouse ? form8606(t.form8606.spouse, R) : undefined,
  };
  const unsupported: string[] = [];
  const records: RetirementRecord[] = includedRetirement1099Rs(t).map((r) => {
    const code = r.distributionCode;
    const who = r.recipient ?? "primary";
    const disability = code === "3" && !!r.disabilityBeforeRetirementAge;
    // A person with Form 8606 basis: the form, not box 2a, gives the IRA's taxable part.
    const viaForm8606 = r.iraSepSimple && !!f8606[who];
    const taxable = code === "G" || code === "Q" || viaForm8606 ? 0 : R(r.taxableAmount);
    const rollover = code === "G";
    return {
      r,
      line: disability ? "wages" : r.iraSepSimple ? "ira" : "pension",
      taxable,
      fullyTaxable: !rollover && code !== "Q" && !viaForm8606 && taxable === R(r.grossDistribution),
      rollover,
      earlyTax: 0,
    };
  });
  const early = records.filter((x) => x.r.distributionCode === "1");
  if (early.some((x) => x.r.iraSepSimple && f8606[x.r.recipient ?? "primary"] && f8606[x.r.recipient ?? "primary"]!.taxable > 0)) {
    unsupported.push("code 1 IRA distribution with Form 8606 basis (Form 5329)");
  }
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
      taxable: R(sum(xs.map((x) => x.taxable)) + (line === "ira" ? sum([f8606.primary?.taxable ?? 0, f8606.spouse?.taxable ?? 0]) : 0)),
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
    disabilityPension: {
      primary: sum(records.filter((x) => x.line === "wages" && (x.r.recipient ?? "primary") === "primary").map((x) => x.taxable)),
      spouse: sum(records.filter((x) => x.line === "wages" && x.r.recipient === "spouse").map((x) => x.taxable)),
    },
    form8606: f8606,
    unsupported,
  };
}
