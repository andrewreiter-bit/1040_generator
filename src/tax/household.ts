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

const birthYearOf = (dob: string | null | undefined) => (dob ? Number(dob.split("/")[2]) : NaN);

/** Relationships that can make someone a qualifying child (§ 152(c)(2)). */
const CHILD_RELATIONSHIPS = new Set<Dependent["relationship"]>([
  "Child", "Stepchild", "Foster child", "Grandchild", "Sibling", "Niece", "Nephew",
]);

/**
 * Qualifying child (§ 152(c)), the test shared by the child tax credit and the
 * EIC: a qualifying relationship; under 19, or under 24 and a full-time student,
 * or permanently disabled; younger than the taxpayer (or spouse on a joint
 * return) unless disabled; and living with the taxpayer in the U.S. more than
 * half the year. (No support-by-taxpayer test: the child must not have provided
 * over half of their own support, which the model assumes.)
 */
export function isQualifyingChild(dep: Dependent, t: FakeTaxpayer): boolean {
  if (!CHILD_RELATIONSHIPS.has(dep.relationship)) return false;
  if (dep.birthYear > t.taxYear) return false; // not yet born in the tax year
  const age = ageAtYearEnd(dep.birthYear, t.taxYear);
  const ageOk = dep.disabled || age < 19 || (age < 24 && !!dep.fullTimeStudent);
  if (!ageOk) return false;
  if (!dep.disabled) {
    // Younger than the taxpayer OR the spouse (joint return), i.e. younger than the older of the two.
    // With only birth years, a same-year birth counts as not younger.
    const years = [birthYearOf(t.dateOfBirth), t.filingStatus === "MFJ" ? birthYearOf(t.spouseDateOfBirth) : NaN]
      .filter((y) => Number.isFinite(y));
    if (years.length && dep.birthYear <= Math.min(...years)) return false;
  }
  // A child born during the year who lived with the taxpayer the whole time alive meets the
  // residency test (the profile's months can't tell a newborn's months apart, so trust the birth year).
  return dep.monthsInHome > 6 || dep.birthYear === t.taxYear;
}

/** Child tax credit: a qualifying child under 17 with an SSN valid for employment (§ 24(c), (h)(7)). */
export function qualifiesForChildTaxCredit(dep: Dependent, t: FakeTaxpayer): boolean {
  return isQualifyingChild(dep, t) && ageAtYearEnd(dep.birthYear, t.taxYear) < 17 && dep.ssnValidForEmployment !== false;
}

/** Every other dependent on the return gets the $500 credit for other dependents. */
export function qualifiesForOtherDependentCredit(dep: Dependent, t: FakeTaxpayer): boolean {
  if (dep.birthYear > t.taxYear) return false; // listed but not yet born: no credit at all
  return !qualifiesForChildTaxCredit(dep, t);
}

/** EIC qualifying child: qualifying child with an SSN valid for employment (§ 32(c)(3)(D), (m)). */
export function qualifiesForEic(dep: Dependent, t: FakeTaxpayer): boolean {
  return isQualifyingChild(dep, t) && dep.ssnValidForEmployment !== false;
}

export function childTaxCreditCount(t: FakeTaxpayer): number {
  return t.dependents.filter((d) => qualifiesForChildTaxCredit(d, t)).length;
}

export function otherDependentCount(t: FakeTaxpayer): number {
  return t.dependents.filter((d) => qualifiesForOtherDependentCredit(d, t)).length;
}

/**
 * Separated spouse (§ 32(d)(2)(B)(ii)): a separate filer who lived apart from the spouse for the
 * last 6 months of the year (apart all year counts), or is legally separated under a written
 * agreement or decree and not in the spouse's household at year end. With a qualifying child who
 * lived with them more than half the year, such a filer isn't treated as married for EIC.
 */
export function separatedSpouse(t: FakeTaxpayer): boolean {
  return t.filingStatus === "MFS" && (!!t.mfsApartLast6Months || !!t.mfsLegallySeparated || t.mfsLivedWithSpouse === false);
}

/**
 * Considered unmarried for the dependent care credit (§ 21(e)(4); Form 2441 instructions, "Married
 * Persons Filing Separately"): a separate filer whose spouse didn't live in the home during the last
 * 6 months of the year (apart all year counts), who paid more than half the cost of keeping up the
 * home, and whose home was the qualifying person's main home for more than half the year (every
 * qualifying person's is). Unlike EIC, a written separation agreement alone doesn't count.
 */
export function mfsUnmarriedForCare(t: FakeTaxpayer): boolean {
  return t.filingStatus === "MFS" && (!!t.mfsApartLast6Months || t.mfsLivedWithSpouse === false) && t.mfsPaidOverHalfHomeCost === true;
}

export function eicChildren(t: FakeTaxpayer): Dependent[] {
  return t.dependents.filter((d) => qualifiesForEic(d, t));
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
