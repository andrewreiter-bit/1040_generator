import { Faker, en } from "@faker-js/faker";
import { FieldDefinition } from "../templates/schema";
import { FieldType } from "../templates/classifier";
import { FakeTaxpayer } from "./taxpayer";

const faker = new Faker({ locale: [en] });

export interface ResolveContext {
  /** Form being filled, e.g. "fw2", "f1099div". Lets labels shared across forms resolve correctly. */
  formId?: string;
}

/**
 * Fields the taxpayer model has no data for are left blank by default, so a
 * generated return only shows amounts that tie back to the household.
 * Set FILL_UNMAPPED=random to restore the old "fill every box" behaviour
 * (useful for OCR/layout stress tests, not for consistent returns).
 */
function randomFallback(): boolean {
  return (process.env.FILL_UNMAPPED ?? "").toLowerCase() === "random";
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toFixed(2);
}

const sum = <T>(items: T[], pick: (x: T) => number): number =>
  Math.round(items.reduce((s, x) => s + pick(x), 0) * 100) / 100;

/**
 * Resolves a single FieldDefinition to a string value using the taxpayer data.
 * Uses the XFA labelHint for context-aware resolution (e.g. which dependent, spouse vs self).
 */
export function resolveField(field: FieldDefinition, taxpayer: FakeTaxpayer, ctx: ResolveContext = {}): string {
  faker.seed(taxpayer.seed + hashStr(field.pdfFieldName));

  if (field.fakerOverride) {
    const val = resolvePath(taxpayer as unknown, field.fakerOverride);
    if (val !== undefined) return String(val ?? "");
  }

  return resolveByType(field.fieldType, taxpayer, field, ctx);
}

/**
 * True for labels that describe an amount line even though they mention a
 * filing status, "state", or "social security number" in their instructions
 * (e.g. W-4 worksheet "1b. … $300,000 if married filing jointly").
 */
function isAmountLine(label: string): boolean {
  return /\$\s?\d|\$\.?\s*$|\bincome\b|\bcredit\b|\brefund\b|\bcompensation\b/.test(label);
}

function fullName(t: FakeTaxpayer): string {
  return `${t.firstName} ${t.middleInitial} ${t.lastName}`.replace(/\s+/g, " ").trim();
}

function spouseName(t: FakeTaxpayer): string {
  if (!t.spouseFirstName) return "";
  return `${t.spouseFirstName} ${t.spouseLastName ?? t.lastName}`.trim();
}

function cityStateZip(t: FakeTaxpayer): string {
  return `${t.city}, ${t.state} ${t.zipCode}`;
}

function resolveByType(type: FieldType, t: FakeTaxpayer, field: FieldDefinition, ctx: ResolveContext): string {
  const label = (field.labelHint ?? "").toLowerCase();
  const formId = ctx.formId ?? "";
  const isDivForm = formId === "f1099div";

  switch (type) {
    // ── Identity numbers ──────────────────────────────────────────────────
    case "ssn": {
      if (/former spouse/.test(label) || isAmountLine(label)) return "";
      if (/spouse/.test(label)) return t.spouseSSN ?? "";
      const depIdx = dependentIndex(label);
      if (depIdx >= 0) return t.dependents[depIdx]?.ssn ?? "";
      return t.ssn;
    }
    case "itin":         return t.ssn;
    case "ein":
    case "employer_ein": {
      if (/firm/.test(label)) return ""; // paid-preparer firm EIN: no data
      // Use second W-2 employer EIN if label mentions second employer
      if (/employer 2|second employer/.test(label)) return t.w2Records[1]?.employerEin ?? fakeEIN();
      return t.w2Records[0]?.employerEin ?? fakeEIN();
    }
    case "payer_tin": {
      const payer = isDivForm ? t.dividend1099s[0] : t.interest1099s[0];
      return payer?.payerTin ?? fakeEIN();
    }
    case "ptin":         return t.preparerPtin ?? "";
    case "ip_pin":       return "";

    // ── Names ─────────────────────────────────────────────────────────────
    case "first_name": {
      if (/spouse/.test(label)) return t.spouseFirstName ?? "";
      const depIdx = dependentIndex(label);
      if (depIdx >= 0) return t.dependents[depIdx]?.firstName ?? "";
      return t.firstName;
    }
    case "last_name": {
      const depIdx = dependentIndex(label);
      if (depIdx >= 0) {
        const dep = t.dependents[depIdx];
        if (!dep) return "";
        // 2023/2024 1040: one box holds "First name. Last name."
        return /first name/.test(label) ? `${dep.firstName} ${dep.lastName}` : dep.lastName;
      }
      if (/spouse/.test(label)) return t.spouseFirstName ? t.spouseLastName ?? t.lastName : "";
      return t.lastName;
    }
    case "full_name": {
      if (/foreign country|locality/.test(label)) return "";
      if (/spouse/.test(label)) return spouseName(t);
      if (/designee|third.party|third party/.test(label)) return "";
      if (/firm/.test(label)) return "";
      if (/preparer/.test(label)) return t.preparerPtin ? faker.person.fullName() : "";
      return fullName(t);
    }
    case "employer_name": {
      const w2 = /employer 2|second/.test(label) ? t.w2Records[1] : t.w2Records[0];
      if (!w2) return faker.company.name();
      // W-2 box c: "Employer's name, address, and ZIP code"
      if (/address/.test(label)) {
        return `${w2.employerName}\n${w2.employerStreet}\n${w2.employerCity}, ${w2.employerState} ${w2.employerZip}`;
      }
      return w2.employerName;
    }
    case "payer_name": {
      if (/recipient/.test(label)) return fullName(t);
      const payer = isDivForm ? t.dividend1099s[0] : t.interest1099s[0];
      return payer?.payerName ?? faker.company.name();
    }
    case "entity_name":
    case "business_name": return faker.company.name();

    // ── Address ───────────────────────────────────────────────────────────
    case "street_address": {
      // Apt / suite number (label is just "Apt. no." — not "street address (including apt. no.)")
      if (/^\s*(apt\.?\s*(no|num)|suite\b|unit\b)/.test(label)) return t.aptNumber ?? "";
      // Foreign province / postal
      if (/foreign province|foreign postal/.test(label)) return "";
      if (/firm/.test(label)) return "";
      // Employer or payer address
      if (/employer|payer/.test(label)) return t.w2Records[0]?.employerStreet ?? faker.location.streetAddress();
      return t.aptNumber ? `${t.streetAddress} ${t.aptNumber}` : t.streetAddress;
    }
    case "city": {
      if (/employer|payer|firm/.test(label)) return t.w2Records[0]?.employerCity ?? faker.location.city();
      // 1099 recipient block: "City or town, state or province, country, and ZIP"
      if (/state|zip|z i p/.test(label)) return cityStateZip(t);
      return t.city;
    }
    case "state": {
      if (/foreign province/.test(label)) return "";
      // Second state row on W-2 / 1099s ("15. State. 2.", "14. 2. State."): single-state households leave it blank
      if (/\.\s*2\.\s*$|^\d+\.\s*2\./.test(label)) return "";
      // W-2 / 1099 state boxes that are classified "state" but hold amounts or IDs
      if (/wages/.test(label)) return fmt(t.totalWages);
      if (/income tax|tax withheld/.test(label)) {
        return formId === "fw2" ? fmt(sum(t.w2Records, (w) => w.stateWithheld)) : "";
      }
      if (/identification|\bi\s*d\b|real estate|personal property|taxes/.test(label) || isAmountLine(label)) return "";
      if (/employer|payer|firm/.test(label)) return t.w2Records[0]?.employerState ?? t.state;
      return t.state;
    }
    case "zip_code": {
      if (/foreign postal/.test(label)) return "";
      if (/employer|payer|firm/.test(label)) return t.w2Records[0]?.employerZip ?? t.zipCode;
      // W-2 box f: "Employee's address and ZIP code"
      if (/address/.test(label)) return `${t.streetAddress}\n${cityStateZip(t)}`;
      return t.zipCode;
    }
    case "country":      return /foreign/.test(label) ? "" : "United States";

    // ── Dates ─────────────────────────────────────────────────────────────
    case "date": {
      if (/spouse.*birth/.test(label)) return t.spouseDateOfBirth ?? "";
      if (/birth|born/.test(label)) return t.dateOfBirth;
      if (/death|deceased/.test(label)) return "";
      // Fiscal-year dates and date components: calendar-year filers leave blank
      if (/ending|beginning|\bm\s*m\b|\bd\s*d\b|\by\s*y\s*y\s*y\b/.test(label)) return "";
      return fakeDateInYear(t.taxYear);
    }
    case "tax_year": {
      if (/carryover|beginning|ending|2 digit/.test(label)) return "";
      if (field.maxLength !== undefined && field.maxLength < 4) return ""; // date-part boxes
      return String(t.taxYear);
    }

    // ── Contact ───────────────────────────────────────────────────────────
    case "phone_number": {
      if (/designee|third.party|preparer|firm/.test(label)) return "";
      return t.phone;
    }
    case "email":        return `${t.firstName}.${t.lastName}@example.com`.toLowerCase();

    // ── Banking ───────────────────────────────────────────────────────────
    case "routing_number": return t.routingNumber;
    case "account_number": return t.accountNumber;

    // ── Status / roles ────────────────────────────────────────────────────
    case "filing_status":
      // Misclassified amount lines (e.g. "Standard deduction for— Single or …")
      if (/deduction|amount|smaller|larger|line \d/.test(label) || isAmountLine(label)) return "";
      return t.filingStatus;
    case "occupation": {
      if (/tipped|code/.test(label)) return "";
      if (/spouse/.test(label)) return t.spouseOccupation ?? "";
      return t.occupation;
    }

    // ── Dependents ────────────────────────────────────────────────────────
    case "dependent_name": {
      const dep = t.dependents[dependentIndex(label)];
      return dep ? `${dep.firstName} ${dep.lastName}` : "";
    }
    case "dependent_ssn":
      return t.dependents[dependentIndex(label)]?.ssn ?? "";
    case "relationship":
      return t.dependents[dependentIndex(label)]?.relationship ?? "";

    // ── Financial ─────────────────────────────────────────────────────────
    case "dollar_amount":
      return resolveDollar(label, t, formId);
    case "percentage":
      return randomFallback() ? faker.number.float({ min: 0, max: 100, fractionDigits: 2 }).toFixed(2) : "";
    case "shares":
      return randomFallback() ? faker.number.int({ min: 1, max: 10000 }).toString() : "";

    // ── Form controls ─────────────────────────────────────────────────────
    case "checkbox":
      if (!randomFallback()) return pickCheckboxOff(field);
      return field.required
        ? pickCheckboxOn(field)
        : faker.datatype.boolean({ probability: 0.5 }) ? pickCheckboxOn(field) : pickCheckboxOff(field);
    case "radio":
      if (!randomFallback()) return "";
      return field.options?.[faker.number.int({ min: 0, max: (field.options.length - 1) })] ?? "1";

    // ── Signature ─────────────────────────────────────────────────────────
    case "signature":    return `${t.firstName} ${t.lastName}`;

    // ── Fallbacks ─────────────────────────────────────────────────────────
    case "generic_number":
      return randomFallback() ? faker.number.int({ min: 0, max: 99999 }).toString() : "";
    case "generic_text":
    default:
      return randomFallback() ? faker.lorem.words(2) : "";
  }
}

/**
 * Dollar amounts: only labels that clearly correspond to taxpayer data get a
 * value. Order matters — specific phrases must precede generic ones.
 */
function resolveDollar(label: string, t: FakeTaxpayer, formId: string): string {
  const isW2 = formId === "fw2";

  // Never-applicable / no-data amounts
  if (/tax-exempt|exempt-interest|private activity|nondividend|section 897|sec\. 1250|section 1202|collectibles/.test(label)) return "";
  if (/routing/.test(label)) return t.routingNumber; // misclassified routing field

  // W-2 boxes (household totals until per-W-2 documents land in Phase 2)
  if (isW2) {
    if (/wages, tips, other compensation/.test(label)) return fmt(t.totalWages);
    if (/federal income tax withheld/.test(label))     return fmt(sum(t.w2Records, (w) => w.federalWithheld));
    if (/social security wages/.test(label))           return fmt(sum(t.w2Records, (w) => w.socialSecurityWages));
    if (/social security tax withheld/.test(label))    return fmt(sum(t.w2Records, (w) => w.ssWithheld));
    if (/medicare wages/.test(label))                  return fmt(sum(t.w2Records, (w) => w.medicareWages));
    if (/medicare tax withheld/.test(label))           return fmt(sum(t.w2Records, (w) => w.medicareWithheld));
    return randomOrBlank();
  }

  if (/qualified dividend/.test(label))                return fmt(t.totalQualifiedDividends);
  if (/ordinary dividend/.test(label))                 return fmt(t.totalDividends);
  if (/capital gain distr/.test(label))                return fmt(sum(t.dividend1099s, (d) => d.totalCapitalGain) || null);
  if (/interest income/.test(label))                   return fmt(t.totalInterest);
  if (/social security benefits/.test(label))          return fmt(t.socialSecurityBenefits);
  if (/business income|schedule c/.test(label))        return fmt(t.businessIncome);
  if (/capital gain/.test(label) && !/distr/.test(label)) return fmt(t.capitalGains);

  return randomOrBlank();
}

function randomOrBlank(): string {
  return randomFallback() ? fmt(faker.number.float({ min: 0, max: 50000, fractionDigits: 2 })) : "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract dependent index 0-3 from label text. Handles both layouts:
 *   2025:      "Row: (3) S S N. Column: Dependent 2."
 *   2023/2024: "Row: 2. Column: (2) Social security number."
 */
function dependentIndex(label: string): number {
  const m =
    /dependent\s+(\d)/i.exec(label) ??
    /row:\s*(\d)\.\s*column/i.exec(label);
  if (!m) return -1;
  return parseInt(m[1], 10) - 1; // convert 1-based to 0-based
}

function pickCheckboxOn(field: FieldDefinition): string {
  return field.options?.find((o) => o !== "Off" && o !== "0" && o !== "false") ?? "Yes";
}

function pickCheckboxOff(field: FieldDefinition): string {
  return field.options?.find((o) => o === "Off" || o === "0") ?? "Off";
}

function fakeDateInYear(year: number): string {
  const month = faker.number.int({ min: 1, max: 12 });
  const day   = faker.number.int({ min: 1, max: 28 });
  return `${String(month).padStart(2,"0")}/${String(day).padStart(2,"0")}/${year}`;
}

function fakeEIN(): string {
  const prefixes = [10,12,11,13,14,15,16,20,21,22,23,24,25,26,27,30];
  const prefix = prefixes[faker.number.int({ min: 0, max: prefixes.length - 1 })];
  return `${prefix}-${faker.string.numeric(7)}`;
}

function resolvePath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
