/**
 * Form 1040 field maps for 2023–2025.
 *
 * The IRS PDFs give most 1040 checkboxes (and many text fields) no usable
 * label, and field numbering shifts every year, so label heuristics cannot
 * place filing status, dependents, or income lines reliably. Each year gets an
 * explicit layout (field names verified against the PDF widget positions), and
 * the map is strict: anything not listed here and not computed by a formula is
 * left blank / unchecked.
 */
import { FakeTaxpayer, FilingStatus } from "../faker/taxpayer";
import { standardDeduction } from "../config/tax-year";
import { BLANK, CHECK, FieldMap, FieldValue, MappedField, OFF, checkIf, money } from "./types";

const P1 = "topmostSubform[0].Page1[0].";
const P2 = "topmostSubform[0].Page2[0].";
const STATUSES: FilingStatus[] = ["Single", "MFJ", "MFS", "HOH", "QSS"];

interface DependentSlot {
  /** Combined "first last" field (2023/2024). */
  name?: string;
  first?: string;
  last?: string;
  ssn: string;
  relationship: string;
  ctc: string;
  odc: string;
  /** 2025: "lived with you more than half the year" (a) Yes / (b) in the U.S. */
  livedWithYou?: string;
  livedInUS?: string;
  student?: string;
  disabled?: string;
}

interface Layout1040 {
  /** Text fields: semantic key → field name. */
  text: Record<string, string>;
  /** Checkbox fields: semantic key → field name. */
  checkbox: Record<string, string>;
  filingStatus: Record<FilingStatus, string>;
  dependents: DependentSlot[];
  /** Formula lines that need a stable key for validation only. */
  computed: Record<string, string>;
}

// ── Shared value helpers ──────────────────────────────────────────────────────

const hasJointSpouse = (t: FakeTaxpayer) => t.filingStatus === "MFJ";
const spouseOnReturn = (t: FakeTaxpayer) => t.filingStatus === "MFJ" || t.filingStatus === "MFS";
const spouseFullName = (t: FakeTaxpayer) =>
  [t.spouseFirstName, t.spouseLastName ?? t.lastName].filter(Boolean).join(" ");

export function deductionAmount(t: FakeTaxpayer): number {
  return t.takesStandardDeduction || t.itemizedDeductionTotal == null
    ? standardDeduction(t.taxYear, t.filingStatus)
    : t.itemizedDeductionTotal;
}

const TEXT_VALUES: Record<string, FieldValue> = {
  firstName:        (t) => `${t.firstName} ${t.middleInitial}`.trim(),
  lastName:         (t) => t.lastName,
  ssn:              (t) => t.ssn,
  // Spouse name boxes are "If joint return…"; an MFS spouse's name goes on the MFS line.
  spouseFirstName:  (t) => (hasJointSpouse(t) ? t.spouseFirstName ?? BLANK : BLANK),
  spouseLastName:   (t) => (hasJointSpouse(t) ? t.spouseLastName ?? t.lastName : BLANK),
  spouseSsn:        (t) => (spouseOnReturn(t) ? t.spouseSSN ?? BLANK : BLANK),
  street:           (t) => t.streetAddress,
  apt:              (t) => t.aptNumber ?? BLANK,
  city:             (t) => t.city,
  state:            (t) => t.state,
  zip:              (t) => t.zipCode,
  mfsSpouseName:    (t) => (t.filingStatus === "MFS" ? spouseFullName(t) : BLANK),
  line1a:           (t) => money(t.totalWages),
  line2b:           (t) => money(t.totalInterest),
  line3a:           (t) => money(t.totalQualifiedDividends),
  line3b:           (t) => money(t.totalDividends),
  line6a:           (t) => money(t.socialSecurityBenefits),
  line7:            (t) => money(t.capitalGains),
  line12:           (t) => money(deductionAmount(t)),
  line25a:          (t) => money(t.w2Records.reduce((s, w) => s + w.federalWithheld, 0)),
  routing:          (t) => t.routingNumber,
  account:          (t) => t.accountNumber,
  occupation:       (t) => t.occupation,
  spouseOccupation: (t) => (hasJointSpouse(t) ? t.spouseOccupation ?? BLANK : BLANK),
  phone:            (t) => t.phone,
  email:            () => undefined, // generic resolver builds one from the name
  preparerName:     (t) => (t.preparerPtin ? undefined : BLANK),
  preparerPtin:     (t) => t.preparerPtin ?? BLANK,
};

const CHECKBOX_VALUES: Record<string, FieldValue> = {
  digitalAssetsYes: () => OFF,
  digitalAssetsNo:  () => CHECK,
  moreThan4Deps:    (t) => checkIf(t.dependents.length > 4),
  checking:         (t) => checkIf(t.accountType === "Checking"),
  savings:          (t) => checkIf(t.accountType === "Savings"),
  designeeYes:      () => OFF,
  designeeNo:       () => CHECK,
  mainHomeInUS:     () => CHECK,
};

function buildMap(taxYear: number, layout: Layout1040): FieldMap {
  const fields: Record<string, MappedField> = {};
  const add = (name: string, key: string, value?: FieldValue) => {
    if (fields[name]) throw new Error(`f1040 ${taxYear}: field mapped twice: ${name}`);
    fields[name] = { key, value };
  };

  for (const [key, name] of Object.entries(layout.text)) {
    const value = TEXT_VALUES[key];
    if (!value) throw new Error(`f1040 ${taxYear}: no value for text key ${key}`);
    add(name, key, value);
  }
  for (const [key, name] of Object.entries(layout.checkbox)) {
    const value = CHECKBOX_VALUES[key];
    if (!value) throw new Error(`f1040 ${taxYear}: no value for checkbox key ${key}`);
    add(name, key, value);
  }
  for (const status of STATUSES) {
    add(layout.filingStatus[status], `filingStatus.${status}`, (t) => checkIf(t.filingStatus === status));
  }
  layout.dependents.forEach((slot, i) => {
    const k = `dep${i + 1}`;
    const dep = (t: FakeTaxpayer) => t.dependents[i];
    if (slot.name)  add(slot.name,  `${k}.name`,  (t) => (dep(t) ? `${dep(t).firstName} ${dep(t).lastName}` : BLANK));
    if (slot.first) add(slot.first, `${k}.first`, (t) => dep(t)?.firstName ?? BLANK);
    if (slot.last)  add(slot.last,  `${k}.last`,  (t) => dep(t)?.lastName ?? BLANK);
    add(slot.ssn,          `${k}.ssn`,          (t) => dep(t)?.ssn ?? BLANK);
    add(slot.relationship, `${k}.relationship`, (t) => dep(t)?.relationship ?? BLANK);
    add(slot.ctc,          `${k}.ctc`,          (t) => checkIf(!!dep(t)?.qualifiesChildTaxCredit));
    add(slot.odc,          `${k}.odc`,          (t) => checkIf(!!dep(t)?.qualifiesOtherDependent));
    const livedHalfYear = (t: FakeTaxpayer) => checkIf(!!dep(t) && dep(t).monthsInHome > 6);
    if (slot.livedWithYou) add(slot.livedWithYou, `${k}.livedWithYou`, livedHalfYear);
    if (slot.livedInUS)    add(slot.livedInUS,    `${k}.livedInUS`,    livedHalfYear);
    if (slot.student)      add(slot.student,      `${k}.student`,  () => OFF);
    if (slot.disabled)     add(slot.disabled,     `${k}.disabled`, () => OFF);
  });
  for (const [key, name] of Object.entries(layout.computed)) add(name, key);

  return { formId: "f1040", taxYear, strict: true, fields };
}

// ── 2023 ──────────────────────────────────────────────────────────────────────

const L4 = `${P1}Line4a-11_ReadOrder[0].`;
const ADDR = `${P1}Address_ReadOrder[0].`;
const DEPS = `${P1}Table_Dependents[0].`;

/** 2023/2024 page 2 share field names. */
const PAGE2_2023_2024 = {
  text: {
    line25a: `${P2}f2_11[0]`,
    routing: `${P2}RoutingNo[0].f2_25[0]`,
    account: `${P2}AccountNo[0].f2_26[0]`,
    occupation: `${P2}f2_33[0]`,
    spouseOccupation: `${P2}f2_35[0]`,
    phone: `${P2}f2_37[0]`,
    email: `${P2}f2_38[0]`,
    preparerName: `${P2}f2_39[0]`,
    preparerPtin: `${P2}f2_40[0]`,
  },
  checkbox: {
    checking: `${P2}c2_5[0]`,
    savings: `${P2}c2_5[1]`,
    designeeYes: `${P2}c2_6[0]`,
    designeeNo: `${P2}c2_6[1]`,
  },
  computed: {
    line33: `${P2}f2_22[0]`,
    line34: `${P2}f2_23[0]`,
    line37: `${P2}f2_28[0]`,
  },
};

const IDENTITY_2023_2024 = {
  firstName: `${P1}f1_04[0]`,
  lastName: `${P1}f1_05[0]`,
  ssn: `${P1}f1_06[0]`,
  spouseFirstName: `${P1}f1_07[0]`,
  spouseLastName: `${P1}f1_08[0]`,
  spouseSsn: `${P1}f1_09[0]`,
  street: `${ADDR}f1_10[0]`,
  apt: `${ADDR}f1_11[0]`,
  city: `${ADDR}f1_12[0]`,
  state: `${ADDR}f1_13[0]`,
  zip: `${ADDR}f1_14[0]`,
  mfsSpouseName: `${P1}f1_18[0]`,
};

function depSlots2023_2024(firstText: number, firstCheckbox: number): DependentSlot[] {
  return [0, 1, 2, 3].map((i) => {
    const row = `${DEPS}Row${i + 1}[0].`;
    const f = (n: number) => `${row}f1_${String(n).padStart(2, "0")}[0]`;
    const c = (n: number) => `${row}c1_${n}[0]`;
    return {
      name: f(firstText + i * 3),
      ssn: f(firstText + i * 3 + 1),
      relationship: f(firstText + i * 3 + 2),
      ctc: c(firstCheckbox + i * 2),
      odc: c(firstCheckbox + i * 2 + 1),
    };
  });
}

const LAYOUT_2023: Layout1040 = {
  text: {
    ...IDENTITY_2023_2024,
    line1a: `${P1}f1_31[0]`,
    line2b: `${P1}f1_42[0]`,
    line3a: `${P1}f1_43[0]`,
    line3b: `${P1}f1_44[0]`,
    line6a: `${L4}f1_49[0]`,
    line7: `${L4}f1_51[0]`,
    line12: `${P1}f1_56[0]`,
    ...PAGE2_2023_2024.text,
  },
  checkbox: {
    digitalAssetsYes: `${P1}c1_4[0]`,
    digitalAssetsNo: `${P1}c1_4[1]`,
    moreThan4Deps: `${P1}Dependents_ReadOrder[0].c1_12[0]`,
    ...PAGE2_2023_2024.checkbox,
  },
  // 2023 numbers the five boxes left column then right column out of order.
  filingStatus: {
    Single: `${P1}c1_3[0]`,
    HOH:    `${P1}c1_3[1]`,
    MFJ:    `${P1}c1_3[2]`,
    MFS:    `${P1}c1_3[3]`,
    QSS:    `${P1}c1_3[4]`,
  },
  dependents: depSlots2023_2024(19, 13),
  computed: {
    line9: `${L4}f1_53[0]`,
    line11: `${L4}f1_55[0]`,
    line14: `${P1}f1_58[0]`,
    line15: `${P1}f1_59[0]`,
    ...PAGE2_2023_2024.computed,
  },
};

// ── 2024 ──────────────────────────────────────────────────────────────────────

const LAYOUT_2024: Layout1040 = {
  text: {
    ...IDENTITY_2023_2024,
    line1a: `${P1}f1_32[0]`,
    line2b: `${P1}f1_43[0]`,
    line3a: `${P1}f1_44[0]`,
    line3b: `${P1}f1_45[0]`,
    line6a: `${L4}f1_50[0]`,
    line7: `${L4}f1_52[0]`,
    line12: `${P1}f1_57[0]`,
    ...PAGE2_2023_2024.text,
  },
  checkbox: {
    digitalAssetsYes: `${P1}c1_5[0]`,
    digitalAssetsNo: `${P1}c1_5[1]`,
    moreThan4Deps: `${P1}Dependents_ReadOrder[0].c1_13[0]`,
    ...PAGE2_2023_2024.checkbox,
  },
  filingStatus: {
    Single: `${P1}FilingStatus_ReadOrder[0].c1_3[0]`,
    MFJ:    `${P1}FilingStatus_ReadOrder[0].c1_3[1]`,
    MFS:    `${P1}FilingStatus_ReadOrder[0].c1_3[2]`,
    HOH:    `${P1}c1_3[0]`,
    QSS:    `${P1}c1_3[1]`,
  },
  dependents: depSlots2023_2024(20, 14),
  computed: {
    line9: `${L4}f1_54[0]`,
    line11: `${L4}f1_56[0]`,
    line14: `${P1}f1_59[0]`,
    line15: `${P1}f1_60[0]`,
    ...PAGE2_2023_2024.computed,
  },
};

// ── 2025 ──────────────────────────────────────────────────────────────────────

function depSlots2025(): DependentSlot[] {
  return [0, 1, 2, 3].map((i) => {
    const f = (row: number, n: number) => `${DEPS}Row${row}[0].f1_${n}[0]`;
    const c = (row: number, n: number, idx = 0) => `${DEPS}Row${row}[0].Dependent${i + 1}[0].c1_${n}[${idx}]`;
    return {
      first: f(1, 31 + i),
      last: f(2, 35 + i),
      ssn: f(3, 39 + i),
      relationship: f(4, 43 + i),
      livedWithYou: c(5, 12 + i * 2),
      livedInUS: c(5, 13 + i * 2),
      student: c(6, 20 + i * 2),
      disabled: c(6, 21 + i * 2),
      ctc: c(7, 28 + i, 0),
      odc: c(7, 28 + i, 1),
    };
  });
}

const LAYOUT_2025: Layout1040 = {
  text: {
    firstName: `${P1}f1_14[0]`,
    lastName: `${P1}f1_15[0]`,
    ssn: `${P1}f1_16[0]`,
    spouseFirstName: `${P1}f1_17[0]`,
    spouseLastName: `${P1}f1_18[0]`,
    spouseSsn: `${P1}f1_19[0]`,
    street: `${ADDR}f1_20[0]`,
    apt: `${ADDR}f1_21[0]`,
    city: `${ADDR}f1_22[0]`,
    state: `${ADDR}f1_23[0]`,
    zip: `${ADDR}f1_24[0]`,
    mfsSpouseName: `${P1}Checkbox_ReadOrder[0].f1_28[0]`,
    line1a: `${P1}f1_47[0]`,
    line2b: `${P1}f1_59[0]`,
    line3a: `${P1}f1_60[0]`,
    line3b: `${P1}f1_61[0]`,
    line6a: `${P1}f1_68[0]`,
    line7: `${P1}f1_70[0]`,
    line12: `${P2}f2_02[0]`,
    line25a: `${P2}f2_17[0]`,
    routing: `${P2}RoutingNo[0].f2_32[0]`,
    account: `${P2}AccountNo[0].f2_33[0]`,
    occupation: `${P2}f2_40[0]`,
    spouseOccupation: `${P2}f2_42[0]`,
    phone: `${P2}f2_44[0]`,
    email: `${P2}f2_45[0]`,
    preparerName: `${P2}f2_46[0]`,
    preparerPtin: `${P2}f2_47[0]`,
  },
  checkbox: {
    mainHomeInUS: `${P1}c1_5[0]`,
    digitalAssetsYes: `${P1}c1_10[0]`,
    digitalAssetsNo: `${P1}c1_10[1]`,
    moreThan4Deps: `${P1}Dependents_ReadOrder[0].c1_11[0]`,
    checking: `${P2}c2_16[0]`,
    savings: `${P2}c2_16[1]`,
    designeeYes: `${P2}c2_17[0]`,
    designeeNo: `${P2}c2_17[1]`,
  },
  filingStatus: {
    Single: `${P1}Checkbox_ReadOrder[0].c1_8[0]`,
    MFJ:    `${P1}Checkbox_ReadOrder[0].c1_8[1]`,
    MFS:    `${P1}Checkbox_ReadOrder[0].c1_8[2]`,
    HOH:    `${P1}c1_8[0]`,
    QSS:    `${P1}c1_8[1]`,
  },
  dependents: depSlots2025(),
  computed: {
    line9: `${P1}f1_73[0]`,
    line11: `${P1}f1_75[0]`,
    line14: `${P2}f2_05[0]`,
    line15: `${P2}f2_06[0]`,
    line33: `${P2}f2_29[0]`,
    line34: `${P2}f2_30[0]`,
    line37: `${P2}f2_35[0]`,
  },
};

export const F1040_MAPS: FieldMap[] = [
  buildMap(2023, LAYOUT_2023),
  buildMap(2024, LAYOUT_2024),
  buildMap(2025, LAYOUT_2025),
];
