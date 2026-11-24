import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown } from "pdf-lib";
import fs from "fs-extra";
import path from "path";
import { FormTemplate, FieldDefinition } from "../templates/schema";
import { FakeTaxpayer } from "../faker/taxpayer";
import { resolveField } from "../faker/resolver";
import { buildLineIndex } from "../templates/line-index";
import { evaluateFormula } from "./formula-evaluator";
import { formsDir, outputDir } from "../config/paths";
import { getFieldMap, OFF, BLANK } from "../fieldmaps";

export interface FillResult {
  formId: string;
  outputPath: string;
  /** Fields that received a non-empty value (text set, box checked, option chosen). */
  filledCount: number;
  /** Fields intentionally left blank or unchecked. */
  blankCount: number;
  /** Fields that could not be written (missing in PDF, unsupported type, bad option). */
  skippedCount: number;
  /** Fields whose value came from a formula. */
  calculatedCount: number;
  /** Fields whose value came from a per-year field map. */
  mappedCount: number;
  warnings: string[];
  /** pdfFieldName → value written ("Yes"/"Off" for checkboxes). */
  fieldValues: Record<string, string>;
}

const SEPARATED_ID = /^[\d\s()\-]+$/;

/**
 * Fills a single form PDF with data from `taxpayer`.
 *
 *   Pass 1 — per-year field map (if any), then non-calculated fields via the resolver
 *   Pass 2 — calculated fields evaluated from pass-1 values (retried for dependency chains)
 *
 * @param template  The parsed form template (field definitions)
 * @param taxpayer  The fake taxpayer whose data populates the fields
 * @param runId     Optional suffix for output filename (e.g. run index for batch mode)
 */
export async function fillForm(
  template: FormTemplate,
  taxpayer: FakeTaxpayer,
  runId?: string | number
): Promise<FillResult> {
  const OUTPUT_DIR = outputDir();
  await fs.ensureDir(OUTPUT_DIR);

  const pdfPath = path.join(formsDir(), `${template.formId}.pdf`);
  if (!(await fs.pathExists(pdfPath))) {
    throw new Error(`PDF not found: ${pdfPath}. Run 'npm run download' first.`);
  }

  const bytes  = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  let form: PDFForm;
  try {
    form = pdfDoc.getForm();
  } catch {
    throw new Error(`${template.formId}: Cannot get form fields (may be XFA-only PDF).`);
  }

  let filledCount     = 0;
  let blankCount      = 0;
  let skippedCount    = 0;
  let calculatedCount = 0;
  let mappedCount     = 0;
  const warnings: string[] = [];
  const fieldValues: Record<string, string> = {};

  if (template.taxYear !== taxpayer.taxYear) {
    warnings.push(
      `Template ${template.formId} is for tax year ${template.taxYear} but taxpayer is ${taxpayer.taxYear}`
    );
  }

  const fieldMap = getFieldMap(template.formId, taxpayer.taxYear);

  // Numeric values of filled fields — used for formula evaluation
  const filledValues = new Map<string, number>();

  const lineIndex = buildLineIndex(template.fields);

  // ── Helper: fit a value into a text field's max length ──────────────────────
  function fitToMaxLength(fieldDef: FieldDefinition, value: string, maxLen: number | undefined): string {
    if (!maxLen || value.length <= maxLen) return value;
    // SSN / EIN / phone in a fixed-width comb field: drop the separators.
    const digits = value.replace(/\D/g, "");
    if (SEPARATED_ID.test(value) && digits.length <= maxLen) return digits;
    warnings.push(`Truncated value for ${fieldDef.pdfFieldName} ("${value}" → max ${maxLen} chars)`);
    return value.slice(0, maxLen);
  }

  // ── Helper: apply one value to the PDF and record numeric value ─────────────
  function applyField(fieldDef: FieldDefinition, value: string): void {
    try {
      const field = form.getField(fieldDef.pdfFieldName);

      if (field instanceof PDFTextField) {
        const text = fitToMaxLength(fieldDef, value, field.getMaxLength());
        field.setText(text);
        fieldValues[fieldDef.pdfFieldName] = text;
        text === "" ? blankCount++ : filledCount++;
        const num = parseFloat(text.replace(/,/g, ""));
        // Always record a numeric value for formula-referenceable fields so
        // downstream add_list/add_range operands don't defer when the value
        // is legitimately blank (e.g. taxpayer has no capital gains → 0).
        if (!isNaN(num)) {
          filledValues.set(fieldDef.pdfFieldName, num);
        } else if (fieldDef.lineNumber) {
          filledValues.set(fieldDef.pdfFieldName, 0);
        }

      } else if (field instanceof PDFCheckBox) {
        const shouldCheck = value !== "Off" && value !== "0" && value !== "false" && value !== "";
        shouldCheck ? field.check() : field.uncheck();
        fieldValues[fieldDef.pdfFieldName] = shouldCheck ? "Yes" : "Off";
        shouldCheck ? filledCount++ : blankCount++;

      } else if (field instanceof PDFRadioGroup) {
        const options = field.getOptions();
        if (value === "" || value === "Off") { blankCount++; return; }
        const chosen  = options.includes(value) ? value : options[0];
        if (chosen) { field.select(chosen); fieldValues[fieldDef.pdfFieldName] = chosen; filledCount++; }
        else skippedCount++;

      } else if (field instanceof PDFDropdown) {
        const options = field.getOptions();
        if (value === "") { blankCount++; return; }
        if (options.includes(value)) { field.select(value); fieldValues[fieldDef.pdfFieldName] = value; filledCount++; }
        else skippedCount++;

      } else {
        skippedCount++;
      }
    } catch (err) {
      skippedCount++;
      warnings.push(`Could not write ${fieldDef.pdfFieldName}: ${(err as Error).message}`);
    }
  }

  // ── Pass 1: mapped fields, then all non-calculated fields ───────────────────
  const pending: FieldDefinition[] = [];
  const ctx = { formId: template.formId };

  for (const fieldDef of template.fields) {
    const mapped = fieldMap?.fields[fieldDef.pdfFieldName];
    if (mapped?.value) {
      const v = mapped.value(taxpayer);
      if (v !== undefined) {
        applyField(fieldDef, v);
        mappedCount++;
        continue;
      }
    }

    if (fieldDef.formula && fieldDef.formula.op.kind !== "unresolved") {
      pending.push(fieldDef);
      continue;
    }

    if (fieldMap?.strict && !mapped) {
      applyField(fieldDef, fieldDef.fieldType === "checkbox" ? OFF : BLANK);
      continue;
    }

    applyField(fieldDef, resolveField(fieldDef, taxpayer, ctx));
  }

  if (fieldMap) {
    const templateNames = new Set(template.fields.map((f) => f.pdfFieldName));
    for (const name of Object.keys(fieldMap.fields)) {
      if (!templateNames.has(name)) warnings.push(`Field map entry not in template: ${name}`);
    }
  }

  // ── Pass 2: evaluate calculated fields (retry up to 3× for dependency chains)
  let remaining = pending;
  for (let pass = 0; pass < 3 && remaining.length > 0; pass++) {
    const nextRound: FieldDefinition[] = [];
    for (const fieldDef of remaining) {
      const result = evaluateFormula(fieldDef.formula!, filledValues, lineIndex);
      if (result !== null) {
        const value = result.toFixed(2);
        applyField(fieldDef, value);
        calculatedCount++;
      } else {
        nextRound.push(fieldDef);
      }
    }
    remaining = nextRound;
  }

  // ── Fallback: any still-unresolved calculated fields are left blank ─────────
  for (const fieldDef of remaining) {
    warnings.push(`Formula unresolved for ${fieldDef.pdfFieldName} ("${fieldDef.labelHint.slice(0, 60)}")`);
    applyField(fieldDef, BLANK);
  }

  // Flatten to lock in values
  form.flatten();

  const suffix      = runId !== undefined ? `_${runId}` : "";
  const outFileName = `${template.formId}_seed${taxpayer.seed}${suffix}.pdf`;
  const outPath     = path.join(OUTPUT_DIR, outFileName);
  await fs.writeFile(outPath, await pdfDoc.save());

  return {
    formId: template.formId,
    outputPath: outPath,
    filledCount,
    blankCount,
    skippedCount,
    calculatedCount,
    mappedCount,
    warnings,
    fieldValues,
  };
}
