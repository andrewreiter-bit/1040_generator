/**
 * Form 8889, health savings accounts, 2023–2025 (each year's form and instructions). One
 * Part I/II per person with an HSA (each spouse on a joint return files their own).
 *
 *   Line 3   the year's self-only or family limit, + $1,000 catch-up at 55+ unless married
 *            with family coverage (then line 7). Part-year eligibility uses the Line 3
 *            Limitation Chart: each eligible month's amount, totalled and divided by 12. Rule 1:
 *            the family amount applies when the person OR the spouse had family coverage (a
 *            spouse's family HSA counts even on a separate return). The last-month rule applies
 *            only when elected (`lastMonthRule`; rule 4 takes the greater of the chart and the
 *            December coverage's full limit).
 *   Line 6   spouses with separate HSAs and family coverage: line 5 split equally, or, when
 *            family coverage wasn't every month, the instructions' Steps 1–4
 *   Line 7   married, 55+, family coverage: $1,000 × family months ÷ 12
 *   Line 9   employer contributions: the person's W-2 box 12 code W (incl. cafeteria plan)
 *   Line 13  deduction = smaller of line 2 (own contributions) and line 12 (room left)
 *            → Schedule 1 line 13
 *   Line 16  distributions not used for qualified medical expenses → Schedule 1 line 8f;
 *   Line 17b 20% additional tax on them → Schedule 2 line 17c, except at 65+ (line 17a)
 *
 * Reported as unsupported: excess contributions (Form 5329), an HSA alongside Medicare (65+)
 * or Marketplace coverage, where eligibility can't be confirmed, and a spouse with family
 * coverage for only part of the year (the months can't be matched up).
 */
import { FakeTaxpayer, HsaAccount, W2Record } from "../faker/taxpayer";
import { HSA_CATCH_UP, HSA_LIMIT } from "../config/tax-year";
import { Rounder } from "./rounding";

type Person = "primary" | "spouse";

export interface Form8889Lines {
  person: Person;
  coverage: "self" | "family";
  line2: number; line3: number; line5: number; line6: number; line7: number; line8: number;
  line9: number; line11: number; line12: number; line13: number;
  line14a: number; line14c: number; line15: number; line16: number;
  exception17a: boolean; line17b: number;
}

export interface HsaLines {
  forms: Form8889Lines[];
  deduction: number;        // Schedule 1 line 13
  taxableDistributions: number; // Schedule 1 line 8f
  additionalTax: number;    // Schedule 2 line 17c
  unsupported: string[];
}

const age = (t: FakeTaxpayer, p: Person) =>
  t.taxYear - Number(((p === "primary" ? t.dateOfBirth : t.spouseDateOfBirth) ?? "").split("/")[2]);

/** W-2 box 12 code W for a person's W-2s on the return. */
export const employerHsa = (w2s: W2Record[], p: Person) =>
  w2s.filter((w) => (w.employee ?? "primary") === p).flatMap((w) => w.box12 ?? []).filter((e) => e.code === "W").reduce((s, e) => s + e.amount, 0);

export function form8889(t: FakeTaxpayer, w2s: W2Record[], R: Rounder): HsaLines | undefined {
  const joint = t.filingStatus === "MFJ";
  const people: Person[] = joint ? ["primary", "spouse"] : ["primary"];
  const accounts = people.map((p) => [p, t.hsa?.[p]] as const).filter((x): x is [Person, HsaAccount] => !!x[1]);
  const hasW = people.some((p) => employerHsa(w2s, p) > 0);
  if (!accounts.length && !hasW) return undefined;
  const unsupported: string[] = [];
  if (hasW && people.some((p) => employerHsa(w2s, p) > 0 && !t.hsa?.[p])) unsupported.push("W-2 HSA contributions (code W) without HSA details (Form 8889)");
  if (t.marketplace1095As?.length) unsupported.push("HSA with Marketplace coverage (HDHP eligibility)");
  const limits = HSA_LIMIT[t.taxYear];
  const married = t.filingStatus === "MFJ" || t.filingStatus === "MFS";
  const forms = accounts.map(([p, a]): Form8889Lines => {
    if (age(t, p) >= 65) unsupported.push("HSA contributions at 65 or older (Medicare)");
    const fifty5 = age(t, p) >= 55;
    const other: Person = p === "primary" ? "spouse" : "primary";
    const spouseHsa = married ? t.hsa?.[other] : undefined;
    // Rule 1: a spouse's family coverage puts this person on the family amount. The spouse's
    // months aren't matched against this person's, so only a full-year spouse is supported.
    const spouseFamily = spouseHsa?.coverage === "family" || (spouseHsa?.months?.family ?? 0) > 0;
    if (spouseFamily && spouseHsa?.months && spouseHsa.months.family < 12) unsupported.push("spouse with family HDHP coverage for part of the year (Form 8889 line 3)");
    // Eligible months by coverage type (Line 3 Limitation Chart).
    let selfMonths = a.months ? a.months.self : a.coverage === "self" ? 12 : 0;
    let familyMonths = a.months ? a.months.family : a.coverage === "family" ? 12 : 0;
    if (selfMonths + familyMonths > 12) unsupported.push("more than 12 months of HDHP coverage (Form 8889 line 3)");
    if (spouseFamily) { familyMonths += selfMonths; selfMonths = 0; }
    const selfAmount = limits.self + (fifty5 ? HSA_CATCH_UP : 0);
    const familyAmount = limits.family + (fifty5 && !married ? HSA_CATCH_UP : 0);
    const chart = (selfMonths * selfAmount + familyMonths * familyAmount) / 12;
    let line3: number;
    let treatedFamilyAllYear = familyMonths === 12;
    if (a.lastMonthRule && a.decemberCoverage) {
      // Rules 2 and 4: eligible all year with December's coverage; family on Dec 1 → the family
      // limit, otherwise the greater of the chart and the self-only limit.
      const decFamily = a.decemberCoverage === "family" || spouseFamily;
      line3 = decFamily ? familyAmount : Math.max(R(chart), selfAmount);
      if (decFamily) { familyMonths = 12; selfMonths = 0; treatedFamilyAllYear = true; }
      else if (familyMonths + selfMonths < 12) selfMonths = 12 - familyMonths;
    } else {
      line3 = R(chart);
    }
    const line5 = line3; // line 4 (Archer MSA contributions) isn't modelled
    // Line 6: spouses with separate HSAs and family coverage at any time.
    const split = married && !!t.hsa?.[other] && familyMonths > 0 && (spouseFamily || a.coverage === "family" || (a.months?.family ?? 0) > 0);
    let line6 = line5;
    if (split) {
      if (treatedFamilyAllYear) line6 = R(line5 / 2);
      else {
        const step1 = R((familyMonths * familyAmount) / 12);          // line 5 refigured for family months only
        const step3 = R(step1 - R(step1 / 2));                       // less the spouse's equal share
        line6 = R(step3 + (selfMonths * selfAmount) / 12);           // plus the self-only months' limit
      }
    }
    const line7 = fifty5 && married && familyMonths > 0 ? R((HSA_CATCH_UP * familyMonths) / 12) : 0;
    const line8 = R(line6 + line7);
    const line2 = R(a.contributions);
    const line9 = R(employerHsa(w2s, p));
    const line11 = line9;
    const line12 = Math.max(0, R(line8 - line11));
    const line13 = Math.min(line2, line12);
    if (line2 > line12 || line9 > line8) unsupported.push("excess HSA contributions (Form 5329)");
    const d = a.distribution;
    const line14a = R(d?.gross ?? 0);
    const line14c = line14a;
    const line15 = Math.min(line14c, R(d?.qualifiedMedical ?? 0));
    const line16 = Math.max(0, R(line14c - line15));
    const exception17a = line16 > 0 && age(t, p) >= 65;
    const line17b = line16 > 0 && !exception17a ? R(line16 * 0.2) : 0;
    return {
      person: p, coverage: a.coverage, line2, line3, line5, line6, line7, line8, line9, line11, line12, line13,
      line14a, line14c, line15, line16, exception17a, line17b,
    };
  });
  return {
    forms,
    deduction: R(forms.reduce((s, f) => s + f.line13, 0)),
    taxableDistributions: R(forms.reduce((s, f) => s + f.line16, 0)),
    additionalTax: R(forms.reduce((s, f) => s + f.line17b, 0)),
    unsupported,
  };
}
