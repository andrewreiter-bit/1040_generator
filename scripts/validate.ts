#!/usr/bin/env ts-node
/**
 * scripts/validate.ts — consistency checks for generated returns across years.
 *
 * Fills the common form set for each profile × year straight from the
 * forms_<year>/templates_<year> snapshots (nothing in forms/, templates/ or
 * src/faker/factory.ts is touched) and checks household / cross-form invariants.
 *
 * Usage:
 *   npm run validate
 *   npm run validate -- --profiles jordan_single --years 2025
 *   npm run validate -- --gate 2          # also fail on checks owned by Phase 2
 *   npm run validate -- --json report.json --keep
 *
 * Each check carries the phase of the fix plan that should make it pass.
 * The exit code is non-zero only when a check with phase <= --gate fails.
 */
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { FakeTaxpayer } from "../src/faker/taxpayer";
import { FormTemplate, FieldDefinition } from "../src/templates/schema";
import { loadTemplate } from "../src/templates/store";
import { fillForm, FillResult } from "../src/filler/index";
import { getFieldMap, fieldNameForKey, FieldMap } from "../src/fieldmaps";
import { deductionAmount } from "../src/fieldmaps/f1040";
import { w4ChildrenAmount, w4OtherDependentsAmount } from "../src/fieldmaps/fw4";
import { scheduleBDividendTotal, scheduleBInterestRows, scheduleBInterestTotal } from "../src/fieldmaps/f1040sb";
import { form8949Copies } from "../src/fieldmaps/capital";
import { scheduleEicChildren } from "../src/fieldmaps/credits";
import { computeReturn } from "../src/tax/compute";
import { documentsFor, neededSchedules, scheduleGaps } from "../src/tax/documents";
import { EXPENSE_LINES } from "../src/tax/business";
import { includedW2s, qualifiesForChildTaxCredit } from "../src/tax/household";

const COMMON_FORMS = [
  "f1040", "f1040s1", "f1040s1a", "f1040s2", "f1040s3", "f1040sa", "f1040sb", "f1040sc", "f1040sd", "f1040se", "f1040sse", "f8995",
  "f8959", "f8960", "f8949", "f8582", "f8995a", "f8995aa", "f8995ac", "f1040s8", "f1040sei",
  "fw2", "f1099int", "f1099div", "f1099b", "f1099r", "fw4",
];
const DEFAULT_PROFILES = ["jordan_single", "rivera_mfj"];

const program = new Command();
program
  .option("-p, --profiles <names>", "Comma-separated profile names (from profiles/factory_<name>.ts)", DEFAULT_PROFILES.join(","))
  .option("-y, --years <years>", "Comma-separated tax years", "2023,2024,2025")
  .option("-s, --base-seed <n>", "Base seed; 2023/2024/2025 use base+1/+2/+3, like generate_returns.sh", "100")
  .option("-g, --gate <phase>", "Fail on failing checks whose phase is <= this", "1")
  .option("--json <file>", "Write full results (checks, metrics, field values) to a JSON file")
  .option("--keep", "Keep the filled PDFs (printed path) instead of deleting them")
  .parse(process.argv);
const opts = program.opts();

// ── Types & helpers ───────────────────────────────────────────────────────────

interface Check { phase: number; id: string; ok: boolean; detail?: string }

interface FormRun { template: FormTemplate; result: FillResult; label: string; view: FakeTaxpayer }

const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return isNaN(n) ? NaN : n;
};
const n0 = (s: string | undefined) => num(s) ?? 0;
const money = (n: number) => n.toFixed(2);
const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

function firstByLine(run: FormRun, line: string): string | undefined {
  const f = run.template.fields.find((x) => x.lineNumber === line);
  return f ? run.result.fieldValues[f.pdfFieldName] : undefined;
}

function firstByLabel(run: FormRun, re: RegExp): string | undefined {
  const f = run.template.fields.find((x) => re.test(x.labelHint));
  return f ? run.result.fieldValues[f.pdfFieldName] : undefined;
}

function byKey(run: FormRun, map: FieldMap, key: string): string | undefined {
  const name = fieldNameForKey(map, key);
  return name ? run.result.fieldValues[name] : undefined;
}

function loadProfile(name: string): (seed?: number, year?: number) => FakeTaxpayer {
  const file = path.resolve(process.cwd(), "profiles", `factory_${name}.ts`);
  if (!fs.existsSync(file)) throw new Error(`Profile not found: ${file}`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(file).createTaxpayer;
}

/** Fields that must hold numbers: dollar fields and every line a formula reads. */
function numericFields(template: FormTemplate): FieldDefinition[] {
  const operandLines = new Set<string>();
  for (const f of template.fields) {
    const op = f.formula?.op as Record<string, unknown> | undefined;
    if (!op) continue;
    for (const v of Object.values(op)) {
      if (typeof v === "string" && v !== op.kind) operandLines.add(v);
      if (Array.isArray(v)) v.forEach((x) => typeof x === "string" && operandLines.add(x));
    }
  }
  const seen = new Set<string>();
  const out: FieldDefinition[] = [];
  for (const f of template.fields) {
    if (f.fieldType === "checkbox") continue;
    const isOperand = f.lineNumber && operandLines.has(f.lineNumber) && !seen.has(f.lineNumber);
    if (f.lineNumber) seen.add(f.lineNumber);
    if (f.fieldType === "dollar_amount" || isOperand) out.push(f);
  }
  return out;
}

// ── Checks ────────────────────────────────────────────────────────────────────

function genericChecks(allRuns: FormRun[]): Check[] {
  const checks: Check[] = [];
  const runs = allRuns;
  const allWarnings = runs.flatMap((r) => r.result.warnings.map((w) => `${r.label}: ${w}`));
  const list = (ws: string[]) => (ws.length ? ws.slice(0, 4).join(" | ") + (ws.length > 4 ? ` (+${ws.length - 4} more)` : "") : undefined);

  const yearW = allWarnings.filter((w) => /is for tax year/.test(w));
  checks.push({ phase: 1, id: "templates-match-year", ok: !yearW.length, detail: list(yearW) });

  const mapW = allWarnings.filter((w) => /Field map entry not in template/.test(w));
  checks.push({ phase: 1, id: "field-map-matches-template", ok: !mapW.length, detail: list(mapW) });

  const truncW = allWarnings.filter((w) => /Truncated value/.test(w));
  checks.push({ phase: 1, id: "no-truncated-values", ok: !truncW.length, detail: list(truncW) });

  const writeW = allWarnings.filter((w) => /Could not write/.test(w));
  const skipped = runs.reduce((s, r) => s + r.result.skippedCount, 0);
  checks.push({ phase: 1, id: "no-write-errors", ok: !writeW.length && skipped === 0, detail: list(writeW) ?? (skipped ? `${skipped} skipped` : undefined) });

  const formulaW = allWarnings.filter((w) => /Formula unresolved/.test(w));
  checks.push({ phase: 1, id: "formulas-resolve", ok: !formulaW.length, detail: list(formulaW) });

  const textInNumeric: string[] = [];
  for (const run of runs) {
    const textFields = getFieldMap(run.template.formId, run.view.taxYear)?.fields ?? {};
    for (const f of numericFields(run.template)) {
      if (textFields[f.pdfFieldName]?.text) continue;
      const v = run.result.fieldValues[f.pdfFieldName];
      if (v !== undefined && v !== "" && isNaN(num(v) as number)) {
        textInNumeric.push(`${run.template.formId} ${f.lineNumber ?? ""} "${v}"`);
      }
    }
  }
  checks.push({ phase: 1, id: "numeric-fields-hold-numbers", ok: !textInNumeric.length, detail: list(textInNumeric) });

  const negFloor: string[] = [];
  for (const run of runs) {
    for (const f of run.template.fields) {
      if (!f.formula?.floorAtZero) continue;
      const v = num(run.result.fieldValues[f.pdfFieldName]);
      if (v !== null && v < 0) negFloor.push(`${run.template.formId} line ${f.lineNumber}: ${v}`);
    }
  }
  checks.push({ phase: 1, id: "floored-lines-nonnegative", ok: !negFloor.length, detail: list(negFloor) });

  return checks;
}

function f1040Checks(t: FakeTaxpayer, runs: Record<string, FormRun>): Check[] {
  const checks: Check[] = [];
  const run = runs.f1040;
  const map = getFieldMap("f1040", t.taxYear);
  if (!run || !map) {
    checks.push({ phase: 1, id: "f1040-field-map-exists", ok: false, detail: `no f1040 field map for ${t.taxYear}` });
    return checks;
  }
  const k = (key: string) => byKey(run, map, key);
  const eq = (phase: number, id: string, actual: string | undefined, expected: number) =>
    checks.push({ phase, id, ok: near(num(actual) ?? 0, round2(expected)), detail: `got ${actual === "" ? "(blank)" : actual}, expected ${money(expected)}` });

  // Filing status
  const statuses = ["Single", "MFJ", "MFS", "HOH", "QSS"];
  const checked = statuses.filter((s) => k(`filingStatus.${s}`) === "Yes");
  checks.push({
    phase: 1, id: "1040-filing-status",
    ok: checked.length === 1 && checked[0] === t.filingStatus,
    detail: `checked [${checked.join(", ")}], profile ${t.filingStatus}`,
  });

  // Identity
  checks.push({ phase: 1, id: "1040-primary-ssn", ok: digits(k("ssn")) === digits(t.ssn), detail: `got "${k("ssn")}"` });
  if (t.filingStatus === "MFJ") {
    const ok = digits(k("spouseSsn")) === digits(t.spouseSSN ?? "") && (k("spouseFirstName") ?? "").startsWith(t.spouseFirstName ?? "?");
    checks.push({ phase: 1, id: "1040-spouse-fields", ok, detail: `spouse "${k("spouseFirstName")}" ssn "${k("spouseSsn")}"` });
  } else if (t.filingStatus === "MFS") {
    const ok = digits(k("spouseSsn")) === digits(t.spouseSSN ?? "") && !k("spouseFirstName") && (k("mfsSpouseName") ?? "").includes(t.spouseFirstName ?? "?");
    checks.push({ phase: 1, id: "1040-mfs-spouse-fields", ok, detail: `ssn "${k("spouseSsn")}" MFS name "${k("mfsSpouseName")}"` });
  } else {
    const filled = ["spouseFirstName", "spouseLastName", "spouseSsn", "spouseOccupation"].filter((x) => (k(x) ?? "") !== "");
    checks.push({ phase: 1, id: "1040-no-spouse-fields", ok: !filled.length, detail: filled.length ? `filled: ${filled.join(", ")}` : undefined });
  }

  // Dependents
  const depProblems: string[] = [];
  for (let i = 0; i < 4; i++) {
    const dep = t.dependents[i];
    const ssn = k(`dep${i + 1}.ssn`);
    const name = k(`dep${i + 1}.name`) ?? k(`dep${i + 1}.first`) ?? "";
    if (digits(ssn) !== digits(dep?.ssn)) depProblems.push(`dep${i + 1} ssn "${ssn}"`);
    if (dep ? !name.includes(dep.firstName) : name !== "") depProblems.push(`dep${i + 1} name "${name}"`);
    if ((k(`dep${i + 1}.ctc`) === "Yes") !== (!!dep && qualifiesForChildTaxCredit(dep, t))) depProblems.push(`dep${i + 1} CTC box`);
    if ((k(`dep${i + 1}.relationship`) ?? "") !== (dep?.relationship ?? "")) depProblems.push(`dep${i + 1} relationship`);
  }
  checks.push({ phase: 1, id: "1040-dependents", ok: !depProblems.length, detail: depProblems.join("; ") || `${t.dependents.length} dependent(s)` });

  // Yes/No questions need exactly one answer; checking/savings at most one (none without a refund)
  const exactlyOne: Array<[string, string]> = [["digitalAssetsYes", "digitalAssetsNo"], ["designeeYes", "designeeNo"]];
  const badPairs = [
    ...exactlyOne.filter(([a, b]) => (k(a) === "Yes") === (k(b) === "Yes")).map(([a, b]) => `${a}/${b}`),
    ...(k("checking") === "Yes" && k("savings") === "Yes" ? ["checking/savings"] : []),
  ];
  checks.push({ phase: 1, id: "1040-exclusive-checkboxes", ok: !badPairs.length, detail: badPairs.join(", ") || undefined });

  // Income and deduction lines tie to the household
  const w2s = includedW2s(t);
  const fedWithheld = w2s.reduce((s, w) => s + w.federalWithheld, 0);
  eq(1, "1040-1a-wages", k("line1a"), w2s.reduce((s, w) => s + w.wages, 0));
  eq(1, "1040-2b-interest", k("line2b"), t.totalInterest);
  eq(1, "1040-3a-qualified-div", k("line3a"), t.totalQualifiedDividends);
  eq(1, "1040-3b-ordinary-div", k("line3b"), t.totalDividends);
  eq(1, "1040-25a-withholding", k("line25a"), fedWithheld);
  eq(1, "1040-12-deduction", k("line12"), deductionAmount(t));

  // Arithmetic chain
  eq(1, "1040-9-total-income", k("line9"), n0(k("line1a")) + n0(k("line2b")) + n0(k("line3b")) + n0(k("line4b")) + n0(k("line5b")) + n0(k("line6b")) + n0(k("line7")) + n0(k("line8")));
  eq(1, "1040-15-taxable-income", k("line15"), Math.max(0, n0(k("line11")) - n0(k("line14"))));

  // A dependent can't be born after the tax year
  const unborn = t.dependents.filter((d) => d.birthYear > t.taxYear).map((d) => `${d.firstName} born ${d.birthYear}`);
  checks.push({ phase: 2, id: "dependents-born-by-year-end", ok: !unborn.length, detail: unborn.join(", ") || undefined });

  // Refund / amount owed are mutually exclusive
  const l34 = n0(k("line34"));
  const l37 = n0(k("line37"));
  checks.push({ phase: 2, id: "1040-refund-xor-owed", ok: l37 >= 0 && !(l34 > 0 && l37 > 0), detail: `34=${money(l34)} 37=${money(l37)}` });

  // Tax, credits and payments: the PDF's own formulas must agree with computeReturn
  const r = computeReturn(t);
  eq(2, "1040-7-capital-gain", k("line7"), r.capitalGain);
  const lineChecks: Array<[string, string, number]> = [
    ["4b", "line4b", r.retirement.line4b], ["5b", "line5b", r.retirement.line5b],
    ["6a", "line6a", r.socialSecurity.line1], ["6b", "line6b", r.socialSecurity.taxable],
    ["8", "line8", r.additionalIncome], ["9", "line9", r.totalIncome], ["10", "line10", r.adjustments],
    ["11", "line11", r.agi], ["13", "line13", r.qbiDeduction], ["13b", "line13b", r.additionalDeductions], ["14", "line14", r.totalDeductions],
    ["15", "line15", r.taxableIncome], ["16", "line16", r.tax], ["18", "line18", r.taxBeforeCredits],
    ["19", "line19", r.childAndOtherDependentCredit], ["22", "line22", r.taxAfterCredits], ["23", "line23", r.otherTaxes],
    ["24", "line24", r.totalTax], ["25b", "line25b", r.form1099Withholding], ["25c", "line25c", r.otherWithholding], ["25d", "line25d", r.totalWithholding],
    ["27", "line27", r.earnedIncomeCredit], ["28", "line28", r.additionalChildTaxCredit],
    ["31", "line31", r.scheduleThreePayments], ["32", "line32", r.refundableCredits], ["33", "line33", r.totalPayments],
    ["34", "line34", r.overpaid], ["35a", "line35a", r.refund], ["37", "line37", r.amountOwed],
  ];
  const mismatched = lineChecks
    .filter(([, key, expected]) => !near(num(k(key)) ?? 0, round2(expected)))
    .map(([line, key, expected]) => `line ${line}: ${k(key) || "(blank)"} ≠ ${money(expected)}`);
  checks.push({ phase: 2, id: "1040-lines-match-computeReturn", ok: !mismatched.length, detail: mismatched.join("; ") || `tax ${money(r.tax)}, refund ${money(r.refund)}, owed ${money(r.amountOwed)}` });

  const banking = ["routing", "account"].every((x) => (k(x) ?? "") !== "");
  checks.push({ phase: 2, id: "1040-direct-deposit-only-with-refund", ok: banking === r.refund > 0, detail: `refund ${money(r.refund)}, banking ${banking ? "filled" : "blank"}` });
  const ageOk = (k("youBornBefore") === "Yes") === r.youAre65 && (k("spouseBornBefore") === "Yes") === r.spouseIs65 &&
    (k("youBlind") === "Yes") === r.youBlind && (k("spouseBlind") === "Yes") === r.spouseBlind;
  checks.push({ phase: 2, id: "1040-age-65-and-blind-boxes", ok: ageOk, detail: `you ${r.youAre65 ? "65+" : "<65"}${r.youBlind ? " blind" : ""}, spouse ${r.spouseIs65 ? "65+" : "<65"}${r.spouseBlind ? " blind" : ""}` });
  if (t.socialSecurityBenefits != null && t.ssa1099s?.length) {
    eq(2, "1040-6a-equals-profile-benefits", k("line6a"), t.socialSecurityBenefits);
  }

  // Income the generator cannot yet carry through to the 1040
  checks.push({ phase: 2, id: "household-within-supported-scope", ok: !r.unsupported.length, detail: r.unsupported.join("; ") || undefined });

  return checks;
}

function documentChecks(t: FakeTaxpayer, docs: Record<string, FormRun[]>): Check[] {
  const checks: Check[] = [];
  const map = getFieldMap("f1040", t.taxYear);
  const f1040 = docs.f1040?.[0];
  const line = (key: string) => (f1040 && map ? byKey(f1040, map, key) : undefined);
  const fullName = `${t.firstName} ${t.middleInitial} ${t.lastName}`;
  const sumBy = (runs: FormRun[], pick: (r: FormRun) => string | undefined) => round2(runs.reduce((s, r) => s + n0(pick(r)), 0));

  // Single-state households: the second state row on W-2 / 1099s stays blank
  const row2: string[] = [];
  for (const id of ["fw2", "f1099int", "f1099div"]) {
    for (const run of docs[id] ?? []) {
      for (const f of run.template.fields) {
        if (f.fieldType === "checkbox" || !/state/i.test(f.labelHint)) continue;
        if (!/\.\s*2\.\s*$|^\d+\.\s*2\./.test(f.labelHint)) continue;
        const v = run.result.fieldValues[f.pdfFieldName];
        if (v) row2.push(`${run.label} "${f.labelHint}" = ${v}`);
      }
    }
  }
  checks.push({ phase: 1, id: "state-row-2-blank", ok: !row2.length, detail: row2.slice(0, 3).join(" | ") || undefined });

  // ── W-2s ────────────────────────────────────────────────────────────────────
  const w2Docs = docs.fw2 ?? [];
  const w2Records = includedW2s(t);
  if (w2Docs.length) {
    const box1 = sumBy(w2Docs, (r) => firstByLabel(r, /^1\. Wages, tips, other compensation/));
    const box2 = sumBy(w2Docs, (r) => firstByLabel(r, /^2\. Federal income tax withheld/));
    checks.push({ phase: 1, id: "w2-box1-total-equals-1040-1a", ok: near(box1, n0(line("line1a"))), detail: `Σ W-2 ${money(box1)} vs 1040 ${line("line1a")}` });
    checks.push({ phase: 1, id: "w2-box2-total-equals-1040-25a", ok: near(box2, n0(line("line25a"))), detail: `Σ W-2 ${money(box2)} vs 1040 ${line("line25a")}` });
    const badEmployee = w2Docs.filter((r, i) => {
      const rec = w2Records[i];
      const expected = rec?.employee === "spouse" ? t.spouseSSN : t.ssn;
      return digits(firstByLabel(r, /^a\. Employee's social security number/)) !== digits(expected ?? "") ||
        near(num(firstByLabel(r, /^1\. Wages, tips, other compensation/)), rec?.wages ?? NaN) === false;
    }).map((r) => r.label);
    checks.push({ phase: 2, id: "w2-each-matches-its-record", ok: !badEmployee.length, detail: badEmployee.join(", ") || w2Docs.map((r) => r.label).join("; ") });
  }
  checks.push({ phase: 2, id: "w2-one-per-record", ok: w2Docs.length === w2Records.length, detail: `${w2Docs.length} W-2 document(s), return has ${w2Records.length}` });

  // ── W-4 ─────────────────────────────────────────────────────────────────────
  const w4 = docs.fw4?.[0];
  const w4Map = getFieldMap("fw4", t.taxYear);
  if (w4 && w4Map) {
    const k = (key: string) => byKey(w4, w4Map, key);
    const want = t.filingStatus === "MFJ" || t.filingStatus === "QSS" ? "joint" : t.filingStatus === "HOH" ? "hoh" : "single";
    const checked = ["single", "joint", "hoh"].filter((s) => k(`filingStatus.${s}`) === "Yes");
    checks.push({ phase: 1, id: "w4-filing-status", ok: checked.length === 1 && checked[0] === want, detail: `checked [${checked.join(", ")}], expected ${want}` });
    checks.push({ phase: 1, id: "w4-ssn", ok: digits(k("ssn")) === digits(t.ssn) });
    const expected = w4ChildrenAmount(t) + w4OtherDependentsAmount(t);
    checks.push({ phase: 1, id: "w4-step3-dependents", ok: near(n0(k("line3")), expected), detail: `got ${k("line3") || "(blank)"}, expected ${money(expected)}` });
  }

  // ── 1099s ───────────────────────────────────────────────────────────────────
  const intDocs = docs.f1099int ?? [];
  checks.push({ phase: 2, id: "1099int-one-per-payer", ok: intDocs.length === t.interest1099s.length, detail: `${intDocs.length} document(s), profile has ${t.interest1099s.length} payer(s)` });
  if (intDocs.length) {
    const badRecipient = intDocs.filter((r) => {
      const recipient = firstByLabel(r, /RECIPIENT.S name/i) ?? "";
      return recipient !== fullName || recipient === (firstByLabel(r, /PAYER.S name/i) ?? "");
    }).map((r) => r.label);
    checks.push({ phase: 1, id: "1099int-recipient-is-taxpayer", ok: !badRecipient.length, detail: badRecipient.join(", ") || undefined });
    const box1 = sumBy(intDocs, (r) => firstByLabel(r, /^1\. Interest income/));
    // Line 2b also carries accrued market discount recognized on sales (Schedule B, no 1099-INT).
    const lessDiscount = round2(n0(line("line2b")) - computeReturn(t).capital.marketDiscountInterest);
    checks.push({ phase: 1, id: "1099int-box1-total-equals-1040-2b", ok: near(box1, lessDiscount), detail: `Σ ${money(box1)} vs ${line("line2b")}` });
    const badPayer = intDocs.filter((r, i) => (firstByLabel(r, /PAYER.S name/i) ?? "") !== t.interest1099s[i]?.payerName).map((r) => r.label);
    checks.push({ phase: 2, id: "1099int-payers-match-records", ok: !badPayer.length, detail: badPayer.join(", ") || undefined });
  }
  const divDocs = docs.f1099div ?? [];
  checks.push({ phase: 2, id: "1099div-one-per-payer", ok: divDocs.length === t.dividend1099s.length, detail: `${divDocs.length} document(s), profile has ${t.dividend1099s.length} payer(s)` });
  if (divDocs.length) {
    const badRecipient = divDocs.filter((r) => (firstByLabel(r, /RECIPIENT.S name/i) ?? "") !== fullName).map((r) => r.label);
    checks.push({ phase: 1, id: "1099div-recipient-is-taxpayer", ok: !badRecipient.length, detail: badRecipient.join(", ") || undefined });
    const badPayer = divDocs.filter((r, i) => (firstByLabel(r, /PAYER.S name/i) ?? "") !== t.dividend1099s[i]?.payerName).map((r) => r.label);
    checks.push({ phase: 1, id: "1099div-payers-match-records", ok: !badPayer.length, detail: badPayer.join(", ") || undefined });
    const box1a = sumBy(divDocs, (r) => firstByLine(r, "1a"));
    checks.push({ phase: 1, id: "1099div-box1a-total-equals-1040-3b", ok: near(box1a, n0(line("line3b"))), detail: `Σ ${money(box1a)} vs ${line("line3b")}` });
    const box2a = sumBy(divDocs, (r) => firstByLine(r, "2a"));
    const distributions = t.dividend1099s.reduce((s, d) => s + d.totalCapitalGain, 0);
    checks.push({ phase: 2, id: "1099div-box2a-total-equals-distributions", ok: near(box2a, round2(distributions)), detail: `Σ ${money(box2a)} vs ${money(distributions)}` });
  }

  // ── Schedule B ──────────────────────────────────────────────────────────────
  const schB = docs.f1040sb?.[0];
  if (schB) {
    const schBMap = getFieldMap("f1040sb", t.taxYear);
    const kb = (key: string) => (schBMap ? byKey(schB, schBMap, key) : undefined);
    checks.push({ phase: 2, id: "schB-2-equals-payer-total", ok: near(num(kb("line2")) ?? 0, scheduleBInterestTotal(t)), detail: `line 2 ${kb("line2") || "(blank)"}` });
    checks.push({ phase: 2, id: "schB-4-equals-1040-2b", ok: near(n0(firstByLine(schB, "4")), n0(line("line2b"))), detail: `Sch B ${firstByLine(schB, "4")} vs ${line("line2b")}` });
    checks.push({ phase: 2, id: "schB-6-equals-1040-3b", ok: near(n0(kb("line6")), n0(line("line3b"))) && near(n0(kb("line6")), scheduleBDividendTotal(t)), detail: `Sch B ${kb("line6") || "(blank)"} vs ${line("line3b")}` });
    const rowProblems: string[] = [];
    const intRows = scheduleBInterestRows(t);
    intRows.forEach((p, i) => { if (kb(`int${i + 1}.payer`) !== p.payer || !near(num(kb(`int${i + 1}.amount`)), p.amount)) rowProblems.push(`interest row ${i + 1}`); });
    t.dividend1099s.forEach((p, i) => { if (kb(`div${i + 1}.payer`) !== p.payerName || !near(num(kb(`div${i + 1}.amount`)), p.ordinaryDividends)) rowProblems.push(`dividend row ${i + 1}`); });
    if (kb(`int${intRows.length + 1}.payer`)) rowProblems.push("extra interest row");
    if (kb(`div${t.dividend1099s.length + 1}.payer`)) rowProblems.push("extra dividend row");
    checks.push({ phase: 2, id: "schB-payer-rows", ok: !rowProblems.length, detail: rowProblems.join(", ") || undefined });
  }

  // ── Schedules 1/2/3, C, SE, 8995 ───────────────────────────────────────────
  const r = computeReturn(t);
  const gaps = scheduleGaps(t);
  checks.push({
    phase: 2, id: "needed-schedules-have-year-maps", ok: !gaps.length,
    detail: gaps.length ? `${gaps.join(", ")}: no ${t.taxYear} field map (that year's PDF is missing or the wrong revision)` : undefined,
  });
  const keyed = (run: FormRun | undefined, formId: string) => {
    const m = getFieldMap(formId, t.taxYear);
    return (key: string) => (run && m ? byKey(run, m, key) : undefined);
  };
  const tie = (phase: number, id: string, a: number, b: number, what: string) =>
    checks.push({ phase, id, ok: near(a, round2(b)), detail: `${what}: ${money(a)} vs ${money(b)}` });

  const cDocs = docs.f1040sc ?? [];
  if (r.scheduleC.length) {
    checks.push({ phase: 2, id: "schC-one-per-business", ok: cDocs.length === r.scheduleC.length, detail: `${cDocs.length} Schedule C(s), return has ${r.scheduleC.length} business(es)` });
    const arith: string[] = [];
    cDocs.forEach((run, i) => {
      const c = keyed(run, "f1040sc");
      const L = (x: string) => n0(c(`line${x}`));
      const expenses = round2([...EXPENSE_LINES.map(([l]) => l), "9", "24b"].reduce((s, l) => s + L(l), 0));
      const bad = [
        !near(L("3"), round2(L("1") - L("2"))) && "3", !near(L("5"), round2(L("3") - L("4"))) && "5",
        !near(L("7"), round2(L("5") + L("6"))) && "7", !near(L("28"), expenses) && "28",
        !near(L("29"), round2(L("7") - L("28"))) && "29", !near(L("31"), round2(L("29") - L("30"))) && "31",
        !near(L("48"), L("27a")) && "48",
        digits(c("ssn")) !== digits(r.scheduleC[i]?.owner === "spouse" ? t.spouseSSN ?? "" : t.ssn) && "ssn",
      ].filter(Boolean);
      if (bad.length) arith.push(`${run.label} line(s) ${bad.join(", ")}`);
    });
    checks.push({ phase: 2, id: "schC-lines-tie-out", ok: !arith.length, detail: arith.join("; ") || undefined });
    // Standard mileage: the business share (business ÷ total miles) of the car loan interest and
    // personal property tax sits on 16b / 23 on top of the listed amounts; line 9 holds neither.
    const veh: string[] = [];
    cDocs.forEach((run, i) => {
      const b = r.scheduleC[i]?.business;
      const v = b?.vehicle;
      if (!b || !v || !(v.loanInterest || v.personalPropertyTax)) return;
      const c = keyed(run, "f1040sc");
      const miles = v.businessMiles + v.commutingMiles + v.otherMiles;
      const pct = miles > 0 ? v.businessMiles / miles : 0;
      const want16b = round2((b.expenses.otherInterest ?? 0) + (v.loanInterest ?? 0) * pct);
      const want23 = round2((b.expenses.taxesLicenses ?? 0) + (v.personalPropertyTax ?? 0) * pct);
      if (!near(n0(c("line16b")), want16b) || !near(n0(c("line23")), want23)) veh.push(`${run.label}: 16b ${c("line16b") || "(blank)"} vs ${money(want16b)}, 23 ${c("line23") || "(blank)"} vs ${money(want23)}`);
    });
    checks.push({ phase: 2, id: "schC-vehicle-costs-on-16b-23", ok: !veh.length, detail: veh.join("; ") || undefined });
    const total31 = sumBy(cDocs, (run) => keyed(run, "f1040sc")("line31"));
    tie(2, "schC-31-total-equals-sch1-3", total31, r.schedule1.businessIncome, "Σ Sch C 31 vs Schedule 1 line 3");
    // The profile drew a net figure first; its Schedule C detail must add back up to it.
    if (t.businessIncome != null) tie(2, "schC-31-equals-profile-net", total31, t.businessIncome, "Σ Sch C 31 vs profile businessIncome");
  }

  const seDocs = docs.f1040sse ?? [];
  const seNeeded = r.scheduleSE.filter((x) => !x.belowMinimum);
  if (seNeeded.length || seDocs.length) {
    checks.push({ phase: 2, id: "schSE-one-per-person", ok: seDocs.length === seNeeded.length, detail: `${seDocs.length} Schedule SE(s), ${seNeeded.length} person(s) owe SE tax` });
    tie(2, "schSE-12-total-equals-sch2-4", sumBy(seDocs, (run) => keyed(run, "f1040sse")("line12")), r.schedule2.seTax, "Σ SE 12 vs Schedule 2 line 4");
    tie(2, "schSE-13-total-equals-sch1-15", sumBy(seDocs, (run) => keyed(run, "f1040sse")("line13")), r.schedule1.seTaxDeduction, "Σ SE 13 vs Schedule 1 line 15");
  }

  const s1 = keyed(docs.f1040s1?.[0], "f1040s1");
  if (docs.f1040s1?.length) {
    tie(2, "sch1-10-equals-1040-8", n0(s1("line10")), n0(line("line8")), "Schedule 1 line 10 vs 1040 line 8");
    tie(2, "sch1-26-equals-1040-10", n0(s1("line26")), n0(line("line10")), "Schedule 1 line 26 vs 1040 line 10");
    tie(2, "sch1-3-equals-schC-total", n0(s1("line3")), r.schedule1.businessIncome, "Schedule 1 line 3 vs Σ Sch C 31");
    // Line 8g: the household's Alaska Permanent Fund dividends (a spouse's only on a joint return).
    const pfd = (t.alaskaPermanentFundDividends?.primary ?? 0) + (t.filingStatus === "MFJ" ? t.alaskaPermanentFundDividends?.spouse ?? 0 : 0);
    tie(2, "sch1-8g-equals-alaska-pfd", n0(s1("line8g")), pfd, "Schedule 1 line 8g vs household PFD");
    tie(2, "sch1-9-equals-8a-8z", n0(s1("line9")), n0(s1("line8g")), "Schedule 1 line 9 vs line 8g (only 8g modelled)");
  }
  const s1a = keyed(docs.f1040s1a?.[0], "f1040s1a");
  if (docs.f1040s1a?.length) tie(2, "sch1A-38-equals-1040-13b", n0(s1a("line38")), n0(line("line13b")), "Schedule 1-A line 38 vs 1040 line 13b");
  const s2 = keyed(docs.f1040s2?.[0], "f1040s2");
  if (docs.f1040s2?.length) tie(2, "sch2-21-equals-1040-23", n0(s2("line21")), n0(line("line23")), "Schedule 2 line 21 vs 1040 line 23");
  // ── Forms 1099-R → 1040 lines 4a–5b, 25b and Schedule 2 line 8 ─────────────
  const rDocs = (docs.f1099r ?? []).map((run) => keyed(run, "f1099r"));
  checks.push({ phase: 2, id: "1099r-one-per-distribution", ok: rDocs.length === r.retirement.records.length, detail: `${rDocs.length} 1099-R(s), return has ${r.retirement.records.length}` });
  if (rDocs.length) {
    const box = (d: (k: string) => string | undefined, k: string) => d(`CopyB.${k}`);
    const isIra = (d: (k: string) => string | undefined) => box(d, "box7.iraSepSimple") === "Yes";
    const code = (d: (k: string) => string | undefined) => box(d, "box7") ?? "";
    // What each 1099-R puts on 4b/5b: box 2a, but nothing for a rollover (G) or qualified Roth (Q).
    const taxable = (d: (k: string) => string | undefined) => (["G", "Q"].includes(code(d)) ? 0 : n0(box(d, "box2a")));
    const fully = (d: (k: string) => string | undefined) => !["G", "Q"].includes(code(d)) && near(taxable(d), n0(box(d, "box1")));
    const ties: string[] = [];
    for (const [side, a, b] of [["ira", "line4a", "line4b"], ["pension", "line5a", "line5b"]] as const) {
      const ds = rDocs.filter((d) => isIra(d) === (side === "ira"));
      const gross = round2(ds.reduce((s, d) => s + n0(box(d, "box1")), 0));
      const tax = round2(ds.reduce((s, d) => s + taxable(d), 0));
      const blank = ds.every(fully);
      if (!near(n0(line(b)), tax) || (ds.length > 0) !== ((line(b) ?? "") !== "")) ties.push(`${b} ${line(b) || "(blank)"} vs Σ taxable ${money(tax)}`);
      if (blank ? (line(a) ?? "") !== "" : !near(n0(line(a)), gross)) ties.push(`${a} ${line(a) || "(blank)"} vs ${blank ? "blank (all fully taxable)" : `Σ box 1 ${money(gross)}`}`);
    }
    checks.push({ phase: 2, id: "1099r-boxes-feed-1040-4-5", ok: !ties.length, detail: ties.join("; ") || undefined });
    tie(2, "1099r-box4-in-1040-25b", round2(rDocs.reduce((s, d) => s + n0(box(d, "box4")), 0)), r.retirement.federalWithheld, "Σ 1099-R box 4 vs return's 1099-R withholding");
    const code1 = round2(rDocs.filter((d) => code(d) === "1").reduce((s, d) => s + taxable(d), 0));
    const line8 = n0(s2("line8"));
    const want8 = Math.round(code1 * 0.1 * 100) / 100;
    checks.push({
      phase: 2, id: "sch2-8-is-10pct-of-code-1", ok: near(line8, t.wholeDollars ? Math.round(want8) : want8) && (s2("line8.noForm5329") === "Yes") === line8 > 0,
      detail: `line 8 ${s2("line8") || "(blank)"}, 10% of code 1 taxable ${money(want8)}, box ${s2("line8.noForm5329") || "off"}`,
    });
    // Codes have to fit the recipient's age at year end (59½ rule; 73 for RMDs isn't a code).
    const birthYear = (dob: string | null) => Number((dob ?? "").split("/")[2]);
    const badCode = r.retirement.records.filter((x) => {
      const age = t.taxYear - birthYear(x.r.recipient === "spouse" ? t.spouseDateOfBirth : t.dateOfBirth);
      const c = x.r.distributionCode;
      return ((c === "7" || c === "Q") && age < 60) || ((c === "1" || c === "2") && age > 59);
    }).map((x) => `${x.r.payerName} code ${x.r.distributionCode}`);
    checks.push({ phase: 2, id: "1099r-code-fits-age", ok: !badCode.length, detail: badCode.join(", ") || undefined });
    const badRecipient = r.retirement.records.filter((x, i) => {
      const spouse = x.r.recipient === "spouse";
      return digits(box(rDocs[i], "recipientTin") ?? "") !== digits((spouse ? t.spouseSSN : t.ssn) ?? "") || (spouse && t.filingStatus !== "MFJ");
    }).map((x) => x.r.payerName);
    checks.push({ phase: 1, id: "1099r-recipient-matches", ok: !badRecipient.length, detail: badRecipient.join(", ") || undefined });
  }
  // Schedule 2 line 13: W-2 box 12 codes A, B, M and N on the return's W-2s.
  const box12 = round2(includedW2s(t).flatMap((w) => w.box12 ?? []).filter((e) => ["A", "B", "M", "N"].includes(e.code)).reduce((x, e) => x + e.amount, 0));
  if (box12 || docs.f1040s2?.length) tie(2, "sch2-13-equals-w2-box12-abmn", n0(s2("line13")), box12, "Schedule 2 line 13 vs W-2 box 12 A/B/M/N");
  const s3 = keyed(docs.f1040s3?.[0], "f1040s3");
  if (docs.f1040s3?.length) tie(2, "sch3-15-equals-1040-31", n0(s3("line15")), n0(line("line31")), "Schedule 3 line 15 vs 1040 line 31");
  const m59 = keyed(docs.f8959?.[0], "f8959");
  if (docs.f8959?.length) {
    tie(2, "8959-18-equals-sch2-11", n0(m59("line18")), n0(s2("line11")), "Form 8959 line 18 vs Schedule 2 line 11");
    tie(2, "8959-24-equals-1040-25c", n0(m59("line24")), n0(line("line25c")), "Form 8959 line 24 vs 1040 line 25c");
  }
  const m60 = keyed(docs.f8960?.[0], "f8960");
  if (docs.f8960?.length) tie(2, "8960-17-equals-sch2-12", n0(m60("line17")), n0(s2("line12")), "Form 8960 line 17 vs Schedule 2 line 12");
  const qa = keyed(docs.f8995a?.[0], "f8995a");
  if (docs.f8995a?.length) {
    tie(2, "8995a-39-equals-1040-13", n0(qa("line39")), n0(line("line13")), "Form 8995-A line 39 vs 1040 line 13");
    const colBad = ["A", "B", "C"].filter((k) => {
      if (!qa(`line2.${k}`)) return false;
      const l3 = n0(qa(`line3.${k}`)), l10 = n0(qa(`line10.${k}`)), l11 = n0(qa(`line11.${k}`)), l12 = n0(qa(`line12.${k}`));
      return !near(l11, Math.min(l3, l10)) || !near(n0(qa(`line13.${k}`)), Math.max(l11, l12));
    });
    checks.push({ phase: 2, id: "8995a-columns-tie-out", ok: !colBad.length, detail: colBad.length ? `column(s) ${colBad.join(", ")}` : undefined });
    const nA = r.form8995A!.businesses.length;
    checks.push({ phase: 2, id: "8995a-businesses-fit", ok: nA <= 3, detail: `${nA} qualified business(es); Form 8995-A has 3 columns` });
    const sa = keyed(docs.f8995aa?.[0], "f8995aa");
    if (docs.f8995aa?.length) {
      const sstbCols = r.form8995A!.businesses.map((b, i) => ({ b, k: ["A", "B", "C"][i] })).filter((x) => x.b.sstb);
      const bad = sstbCols.filter((x, j) => !near(n0(sa(`line11.${["A", "B", "C"][j]}`)), r.form8995A!.scheduleC ? x.b.qbi : n0(qa(`line2.${x.k}`))));
      checks.push({ phase: 2, id: "8995aa-11-feeds-8995a-2", ok: !bad.length, detail: bad.length ? bad.map((x) => x.k).join(", ") : undefined });
    }
    const sc = keyed(docs.f8995ac?.[0], "f8995ac");
    if (docs.f8995ac?.length) {
      const bad = ["A", "B", "C"].filter((k, i) => qa(`line2.${k}`) && !near(n0(sc(`line1.${i + 1}.c`)), n0(qa(`line2.${k}`))));
      checks.push({ phase: 2, id: "8995ac-c-feeds-8995a-2", ok: !bad.length, detail: bad.length ? bad.join(", ") : undefined });
    }
  }
  const q = keyed(docs.f8995?.[0], "f8995");
  if (docs.f8995?.length) {
    tie(2, "8995-15-equals-1040-13", n0(q("line15")), n0(line("line13")), "Form 8995 line 15 vs 1040 line 13");
    const n8 = r.form8995?.businessIndex.length ?? 0;
    checks.push({ phase: 2, id: "8995-businesses-fit", ok: n8 <= 5, detail: `${n8} qualified business(es); Form 8995 has 5 rows` });
  }

  // ── Schedule D / Form 8949 ──────────────────────────────────────────────────
  const cap = r.capital;
  if (cap.rows.length) {
    const badDates = cap.rows.filter((x) => {
      const sold = x.sale.dateSold.split("/"), acq = x.sale.dateAcquired.split("/");
      const soldKey = `${sold[2]}${sold[0]}${sold[1]}`, acqKey = `${acq[2]}${acq[0]}${acq[1]}`;
      return Number(sold[2]) !== t.taxYear || (x.sale.dateAcquired !== "VARIOUS" && acqKey > soldKey);
    }).map((x) => x.sale.description);
    checks.push({ phase: 2, id: "capital-sale-dates", ok: !badDates.length, detail: badDates.join("; ") || undefined });
    if (t.capitalGains != null) {
      tie(2, "capital-sales-equal-profile-net", round2(cap.rows.reduce((a, x) => a + x.gain, 0)), t.capitalGains, "Σ Form 8949 (h) vs profile capitalGains");
    }
  }
  const sdRun = docs.f1040sd?.[0];
  if (sdRun) {
    const sd = keyed(sdRun, "f1040sd");
    const l16 = n0(sd("line16"));
    const toLine7 = l16 > 0 ? l16 : -n0(sd("line21"));
    tie(2, "schD-16-or-21-equals-1040-7", toLine7, n0(line("line7")), "Schedule D line 16 / 21 vs 1040 line 7");
    tie(2, "schD-13-equals-1099div-2a", n0(sd("line13")), t.dividend1099s.reduce((a, d) => a + d.totalCapitalGain, 0), "Schedule D line 13 vs Σ 1099-DIV 2a");
    const l7 = round2(["line1a", "line1b", "line2", "line3"].reduce((a, x) => a + n0(sd(`${x}.h`)), 0) - n0(sd("line6")));
    const l15 = round2(["line8a", "line8b", "line9", "line10"].reduce((a, x) => a + n0(sd(`${x}.h`)), 0) + n0(sd("line13")) - n0(sd("line14")));
    checks.push({ phase: 2, id: "schD-lines-tie-out", ok: near(n0(sd("line7")), l7) && near(n0(sd("line15")), l15) && near(l16, round2(l7 + l15)),
      detail: `7 ${sd("line7")} (Σ ${money(l7)}), 15 ${sd("line15")} (Σ ${money(l15)}), 16 ${sd("line16")}` });
    // Form 8949 copies add up to the Schedule D line for each box.
    const f8949 = docs.f8949 ?? [];
    if (f8949.length) {
      const copies = form8949Copies(t);
      const byBox: Record<string, number> = {};
      f8949.forEach((run, i) => {
        const q = keyed(run, "f8949");
        if (copies[i]?.short) byBox[copies[i].short!.box] = round2((byBox[copies[i].short!.box] ?? 0) + n0(q("p1.total.h")));
        if (copies[i]?.long) byBox[copies[i].long!.box] = round2((byBox[copies[i].long!.box] ?? 0) + n0(q("p2.total.h")));
      });
      const LINE: Record<string, string> = { A: "line1b", B: "line2", C: "line3", D: "line8b", E: "line9", F: "line10" };
      const bad = Object.entries(LINE).filter(([box, l]) => !near(byBox[box] ?? 0, n0(sd(`${l}.h`)))).map(([box, l]) => `box ${box}: 8949 ${money(byBox[box] ?? 0)} vs ${l} ${sd(`${l}.h`) || "(blank)"}`);
      checks.push({ phase: 2, id: "8949-totals-equal-schD", ok: !bad.length, detail: bad.join("; ") || undefined });
    }
    // One Form 1099-B per sale the broker reported; their proceeds tie to the return.
    const bDocs = docs.f1099b ?? [];
    const reported = cap.rows.filter((x) => x.sale.reporting !== "noForm1099B");
    if (getFieldMap("f1099b", t.taxYear)) {
      checks.push({ phase: 2, id: "1099b-one-per-reported-sale", ok: bDocs.length === reported.length, detail: `${bDocs.length} 1099-B(s), ${reported.length} reported sale(s)` });
      const box1d = round2(bDocs.reduce((a, run) => {
        const m = getFieldMap("f1099b", t.taxYear)!;
        const name = Object.entries(m.fields).find(([, v]) => v.key === "CopyB.box1d")?.[0];
        return a + n0(name ? run.result.fieldValues[name] : undefined);
      }, 0));
      const schDProceeds = round2(["line1a", "line1b", "line2", "line8a", "line8b", "line9"].reduce((a, x) => a + n0(sd(`${x}.d`)), 0));
      tie(2, "1099b-proceeds-equal-schD", box1d, schDProceeds, "Σ 1099-B box 1d vs Schedule D (d), boxes A/B/D/E");
    }
  }

  // ── Schedule A / Schedule E ─────────────────────────────────────────────────
  const saRun = docs.f1040sa?.[0];
  if (saRun && r.scheduleA) {
    const sa = keyed(saRun, "f1040sa");
    tie(2, "schA-17-equals-1040-12", n0(sa("line17")), n0(line("line12")), "Schedule A line 17 vs 1040 line 12");
    const box17 = round2(includedW2s(t).reduce((a, w) => a + w.stateWithheld, 0));
    if (!t.itemized?.stateLocalTax) tie(2, "schA-5a-equals-w2-box17", n0(sa("line5a")), box17, "Schedule A line 5a vs Σ W-2 box 17");
    tie(2, "schA-5e-salt-cap", n0(sa("line5e")), Math.min(n0(sa("line5d")), r.scheduleA.saltCap), `Schedule A 5e vs min(5d, cap ${money(r.scheduleA.saltCap)})`);
    tie(2, "schA-4-medical-floor", n0(sa("line4")), Math.max(0, round2(n0(sa("line1")) - round2(r.agi * 0.075))), "Schedule A line 4 vs line 1 − 7.5% AGI");
    const sum17 = round2(["line4", "line7", "line10", "line14"].reduce((a, x) => a + n0(sa(x)), 0));
    tie(2, "schA-17-adds-up", n0(sa("line17")), sum17, "Schedule A 17 vs 4 + 7 + 10 + 14");
    if (t.itemizedDeductionTotal != null) {
      tie(2, "schA-17-equals-profile-rule", n0(sa("line17")), Math.max(t.itemizedDeductionTotal, r.scheduleA.line5e), "Schedule A 17 vs max(profile total, capped SALT)");
    }
  }
  checks.push({ phase: 2, id: "itemizes-only-when-larger", ok: !r.itemizes || r.deduction > r.standardDeductionAmount,
    detail: `${r.itemizes ? "itemized" : "standard"} ${money(r.deduction)} (standard ${money(r.standardDeductionAmount)})` });
  const seRun = docs.f1040se?.[0];
  if (seRun && r.scheduleE) {
    const se = keyed(seRun, "f1040se");
    tie(2, "schE-26-equals-sch1-5", n0(se("line26")), n0(s1("line5")), "Schedule E line 26 vs Schedule 1 line 5");
    if (t.rentalIncome != null) tie(2, "schE-21-equals-profile-net", round2(["A", "B", "C"].reduce((a, k) => a + n0(se(`line21.${k}`)), 0)), t.rentalIncome, "Σ Schedule E line 21 vs profile rentalIncome");
    const colBad = ["A", "B", "C"].filter((k) => {
      const exp = round2(Array.from({ length: 15 }, (_, i) => n0(se(`line${i + 5}.${k}`))).reduce((a, b) => a + b, 0));
      return !near(n0(se(`line20.${k}`)), exp) || !near(n0(se(`line21.${k}`)), round2(n0(se(`line3.${k}`)) + n0(se(`line4.${k}`)) - n0(se(`line20.${k}`))));
    });
    checks.push({ phase: 2, id: "schE-columns-tie-out", ok: !colBad.length, detail: colBad.length ? `column(s) ${colBad.join(", ")}` : undefined });
    if (docs.f8960?.length) tie(2, "8960-4a-equals-schE-26", n0(m60("line4a")), n0(se("line26")), "Form 8960 line 4a vs Schedule E line 26");
    // Schedule E line 22 = the loss allowed after the passive limits (Form 8582 Part VIII, or all of it).
    const line22 = round2(["A", "B", "C"].reduce((a, k) => a + n0(se(`line22.${k}`)), 0));
    const allowed = r.form8582 ? r.form8582.activities.reduce((a, x) => a + x.allowed, 0) : 0;
    tie(2, "schE-22-equals-allowed-loss", -line22, allowed, "−Σ Schedule E line 22 vs allowed passive loss");
    const f8582run = docs.f8582?.[0];
    if (f8582run && r.form8582!.line3 < 0) {
      const q8 = keyed(f8582run, "f8582");
      tie(2, "8582-11-equals-9-plus-10", n0(q8("line11")), round2(n0(q8("line9")) + n0(q8("line10"))), "Form 8582 line 11 vs 9 + 10");
      if (r.form8582!.unallowedCarryforward > 0) tie(2, "8582-partVIII-equals-schE-22", n0(q8("partVIII.total.c")), -line22, "Form 8582 Part VIII allowed vs −Σ Schedule E line 22");
    }
  }

  // ── Schedule 8812 / Schedule EIC ────────────────────────────────────────────
  const s8 = keyed(docs.f1040s8?.[0], "f1040s8");
  if (docs.f1040s8?.length) {
    tie(2, "sch8812-14-equals-1040-19", n0(s8("line14")), n0(line("line19")), "Schedule 8812 line 14 vs 1040 line 19");
    tie(2, "sch8812-27-equals-1040-28", n0(s8("line27")), n0(line("line28")), "Schedule 8812 line 27 vs 1040 line 28");
  }
  const sei = keyed(docs.f1040sei?.[0], "f1040sei");
  if (docs.f1040sei?.length) {
    const kids = scheduleEicChildren(t);
    const bad = [0, 1, 2].filter((i) => digits(sei(`child${i + 1}.ssn`)) !== digits(kids[i]?.ssn ?? "")).map((i) => `child ${i + 1}`);
    checks.push({ phase: 2, id: "schEIC-lists-qualifying-children", ok: !bad.length, detail: bad.length ? bad.join(", ") : `${kids.length} child(ren)` });
  }

  // ── Form selection (Phase 3): only include schedules the household needs ──
  const included = (id: string) => (docs[id]?.length ?? 0) > 0;
  const needed = neededSchedules(t);
  const needs: Array<[string, boolean]> = [
    ...["f1040s1", "f1040s1a", "f1040s2", "f1040s3", "f1040sa", "f1040sc", "f1040sd", "f1040se", "f8949", "f1040sse", "f8995", "f8995a", "f8995aa", "f8995ac", "f8959", "f8960", "f8582", "f1040s8", "f1040sei"]
      .filter((id) => !gaps.includes(id))
      .map((id): [string, boolean] => [id, needed.includes(id)]),
  ];
  const wrong = needs.filter(([id, need]) => included(id) !== need).map(([id, need]) => `${id} ${need ? "missing" : "not needed"}`);
  checks.push({ phase: 3, id: "form-set-matches-household", ok: !wrong.length, detail: wrong.join(", ") || undefined });

  return checks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  const profiles: string[] = String(opts.profiles).split(",").map((s) => s.trim()).filter(Boolean);
  const years: number[] = String(opts.years).split(",").map((s) => parseInt(s, 10));
  const baseSeed = parseInt(opts.baseSeed, 10);
  const gate = parseInt(opts.gate, 10);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "1040-validate-"));
  process.env.OUTPUT_DIR = outDir;

  // pdf-lib logs this once per form; it is expected (all fields are AcroForm).
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => { if (!/Removing XFA form data/.test(String(a[0]))) origWarn(...a); };

  const report: unknown[] = [];
  let gatedFailures = 0;
  const failuresByPhase: Record<number, number> = {};

  for (const profile of profiles) {
    const createTaxpayer = loadProfile(profile);
    for (const year of years) {
      const seed = baseSeed + (year - 2022); // same seed per year as generate_returns.sh
      process.env.FORMS_DIR = `forms_${year}`;
      process.env.TEMPLATES_DIR = `templates_${year}`;
      process.env.OUTPUT_DIR = path.join(outDir, `${profile}_${year}`);
      const t = createTaxpayer(seed, year);

      const docs: Record<string, FormRun[]> = {};
      const errors: string[] = [];
      for (const formId of COMMON_FORMS) {
        try {
          docs[formId] = [];
          const needed = documentsFor(formId, t);
          if (!needed.length) continue;   // e.g. a 2025-only schedule on a 2023 return: no template needed
          const template = await loadTemplate(formId);
          for (const doc of needed) {
            const result = await fillForm(template, doc.view, undefined, doc.count > 1 ? `doc${doc.index}` : undefined);
            docs[formId].push({ template, result, label: doc.count > 1 ? `${formId}#${doc.index}` : formId, view: doc.view });
          }
        } catch (err) {
          errors.push(`${formId}: ${(err as Error).message}`);
        }
      }
      const allRuns = Object.values(docs).flat();
      const runs: Record<string, FormRun> = Object.fromEntries(
        Object.entries(docs).filter(([, list]) => list.length).map(([id, list]) => [id, list[0]])
      );

      const checks: Check[] = [
        { phase: 1, id: "all-forms-filled", ok: !errors.length, detail: errors.join(" | ") || undefined },
        ...genericChecks(allRuns),
        ...f1040Checks(t, runs),
        ...documentChecks(t, docs),
      ];

      // ── Print ────────────────────────────────────────────────────────────
      console.log(chalk.bold(`\n${profile} ${year} (seed ${seed}, ${t.filingStatus}, ${t.dependents.length} dep)`));
      console.log(chalk.gray("  form         filled  blank  mapped  calc  skipped  warnings"));
      for (const r of allRuns) {
        const m = r.result;
        console.log(chalk.gray(
          `  ${r.label.padEnd(11)} ${String(m.filledCount).padStart(6)} ${String(m.blankCount).padStart(6)} ${String(m.mappedCount).padStart(7)} ${String(m.calculatedCount).padStart(5)} ${String(m.skippedCount).padStart(8)} ${String(m.warnings.length).padStart(9)}`
        ));
      }
      for (const c of checks) {
        const tag = `P${c.phase}`;
        if (c.ok) {
          console.log(`  ${chalk.green("✓")} ${chalk.gray(tag)} ${c.id}`);
        } else {
          const gated = c.phase <= gate;
          if (gated) gatedFailures++;
          failuresByPhase[c.phase] = (failuresByPhase[c.phase] ?? 0) + 1;
          const mark = gated ? chalk.red("✗") : chalk.yellow("○");
          console.log(`  ${mark} ${chalk.gray(tag)} ${c.id}${c.detail ? chalk.gray(` — ${c.detail}`) : ""}`);
        }
      }

      report.push({
        profile, year, seed, taxpayer: t, checks,
        forms: Object.fromEntries(allRuns.map((r) => [r.label, {
          filledCount: r.result.filledCount, blankCount: r.result.blankCount, mappedCount: r.result.mappedCount,
          calculatedCount: r.result.calculatedCount, skippedCount: r.result.skippedCount,
          warnings: r.result.warnings, fieldValues: r.result.fieldValues,
        }])),
      });
    }
  }

  if (opts.json) {
    await fs.writeJson(path.resolve(opts.json), report, { spaces: 1 });
    console.log(chalk.gray(`\nFull results → ${path.resolve(opts.json)}`));
  }
  if (opts.keep) console.log(chalk.gray(`Filled PDFs → ${outDir}`));
  else await fs.remove(outDir);

  const byPhase = Object.entries(failuresByPhase).map(([p, n]) => `P${p}: ${n}`).join(", ") || "none";
  console.log(chalk.bold(`\nFailing checks by phase — ${byPhase}`));
  console.log(chalk.gray(`(✗ = fails the gate (phase <= ${gate}); ○ = owned by a later phase of the fix plan)`));
  if (gatedFailures) {
    console.log(chalk.red(`✗ ${gatedFailures} gated check(s) failed`));
    process.exit(1);
  }
  console.log(chalk.green("✓ all gated checks passed"));
})().catch((err) => {
  console.error(chalk.red(err.stack ?? String(err)));
  process.exit(2);
});
