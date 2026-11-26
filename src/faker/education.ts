/**
 * Synthetic college expenses for Form 8863, drawn AFTER every other draw so seeds keep
 * their households. Never on a married-filing-separately return (no education credits).
 *
 *   About 25% of filers 38 and older (not MFS) also have a college-age child: a new
 *   dependent, 18–23, full-time student, appended after the existing dependents (so
 *   earlier indexes, e.g. dependent care, don't move). Profiles otherwise only draw
 *   children 0–17.
 *   Dependents 18–23 marked as full-time students: about 70% get a Form 1098-T. Their year
 *   in college follows their age (18 → first year), so a 22- or 23-year-old has finished 4
 *   years and the AOTC was claimed for 4 years: they're graduate students on the lifetime
 *   learning credit. Tuition $4,000–$30,000, scholarships for about 40% (up to 60% of
 *   tuition), and $200–$1,200 of course materials bought elsewhere.
 *   The filer or spouse, 24–50: about 5% take part-time graduate courses (lifetime
 *   learning credit only), $2,000–$15,000 of tuition.
 */
import { Faker } from "@faker-js/faker";
import { Education, EducationInstitution, EducationStudent, FakeTaxpayer } from "./taxpayer";
import { cityStateZip } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));

function institution(faker: Faker): EducationInstitution {
  return {
    name: `${faker.location.city()} ${faker.helpers.arrayElement(["State University", "Community College", "College", "Institute of Technology"])}`,
    street: faker.location.streetAddress(),
    city: cityStateZip(faker),
    ein: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
  };
}

export function buildEducation(faker: Faker, t: FakeTaxpayer): Education | undefined {
  const students: EducationStudent[] = [];
  const birthYear = (dob: string | null) => (dob ? Number(dob.split("/")[2]) : NaN);
  const addCollegeChild = faker.datatype.boolean({ probability: 0.25 });
  const collegeAge = faker.number.int({ min: 18, max: 23 });
  if (addCollegeChild && t.filingStatus !== "MFS" && t.taxYear - birthYear(t.dateOfBirth) >= 38) {
    t.dependents.push({
      firstName: faker.person.firstName(),
      lastName: t.lastName,
      ssn: `${faker.number.int({ min: 100, max: 665 })}-${faker.string.numeric(2)}-${faker.string.numeric(4)}`,
      relationship: "Child",
      birthYear: t.taxYear - collegeAge,
      monthsInHome: 12,               // time away at school is a temporary absence
      fullTimeStudent: true,
      qualifiesChildTaxCredit: false,
      qualifiesOtherDependent: true,
    });
  }
  t.dependents.forEach((d, i) => {
    const age = t.taxYear - d.birthYear;
    if (!faker.datatype.boolean({ probability: 0.7 }) || !d.fullTimeStudent || age < 18 || age > 23) return;
    const years = age - 18;               // years of college completed before this one
    const tuition = dollars(faker, 4000, 30000);
    const scholarships = faker.datatype.boolean({ probability: 0.4 }) ? dollars(faker, 500, tuition * 0.6) : 0;
    students.push({
      student: i, institution: institution(faker), tuitionPaid: tuition, scholarships,
      courseMaterials: dollars(faker, 200, 1200),
      halfTime: true, graduate: years >= 4, completedFirst4Years: years >= 4, aotcPriorYears: Math.min(4, years),
    });
  });
  const adults: Array<["primary" | "spouse", string | null]> = [["primary", t.dateOfBirth]];
  if (t.filingStatus === "MFJ") adults.push(["spouse", t.spouseDateOfBirth]);
  for (const [who, dob] of adults) {
    const age = t.taxYear - birthYear(dob);
    if (!faker.datatype.boolean({ probability: 0.05 }) || !(age >= 24 && age <= 50)) continue;
    students.push({
      student: who, institution: institution(faker), tuitionPaid: dollars(faker, 2000, 15000), scholarships: 0,
      halfTime: false, graduate: true, completedFirst4Years: true, aotcPriorYears: 4,
    });
  }
  return students.length && t.filingStatus !== "MFS" ? { students } : undefined;
}
