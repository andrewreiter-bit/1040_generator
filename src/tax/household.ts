/**
 * Household facts derived from a FakeTaxpayer that several forms need to agree
 * on (which W-2s are on the return, who qualifies for the child tax credit,
 * who is 65 or older). Keep these in one place so the 1040, W-4 and validator
 * can't drift apart.
 */
import { Dependent, FakeTaxpayer, W2Record } from "../faker/taxpayer";

/** W-2s reported on this return: the spouse's W-2s count only on a joint return. */
export function includedW2s(t: FakeTaxpayer): W2Record[] {
  return t.w2Records.filter((w) => w.employee !== "spouse" || t.filingStatus === "MFJ");
}

/** Age at the end of the tax year (Dec 31). */
export function ageAtYearEnd(birthYear: number, taxYear: number): number {
  return taxYear - birthYear;
}

/** Under 17 at the end of the tax year → child tax credit; otherwise credit for other dependents. */
export function qualifiesForChildTaxCredit(dep: Dependent, taxYear: number): boolean {
  return ageAtYearEnd(dep.birthYear, taxYear) < 17;
}

export function qualifiesForOtherDependentCredit(dep: Dependent, taxYear: number): boolean {
  return !qualifiesForChildTaxCredit(dep, taxYear);
}

export function childTaxCreditCount(t: FakeTaxpayer): number {
  return t.dependents.filter((d) => qualifiesForChildTaxCredit(d, t.taxYear)).length;
}

export function otherDependentCount(t: FakeTaxpayer): number {
  return t.dependents.filter((d) => qualifiesForOtherDependentCredit(d, t.taxYear)).length;
}

/**
 * 65 or older for standard-deduction purposes: born before January 2 of
 * (tax year − 64), i.e. the "Were born before January 2, 19xx" box.
 */
export function is65OrOlder(dateOfBirth: string | null | undefined, taxYear: number): boolean {
  if (!dateOfBirth) return false;
  const [m, d, y] = dateOfBirth.split("/").map(Number);
  const cutoffYear = taxYear - 64;
  return y < cutoffYear || (y === cutoffYear && m === 1 && d === 1);
}

/** Name line for schedules: "Alex J & Casey Rivera" on a joint return. */
export function namesOnReturn(t: FakeTaxpayer): string {
  const primary = `${t.firstName} ${t.middleInitial}`.trim();
  if (t.filingStatus !== "MFJ" || !t.spouseFirstName) return `${primary} ${t.lastName}`;
  const spouseLast = t.spouseLastName ?? t.lastName;
  return spouseLast === t.lastName
    ? `${primary} & ${t.spouseFirstName} ${t.lastName}`
    : `${primary} ${t.lastName} & ${t.spouseFirstName} ${spouseLast}`;
}
