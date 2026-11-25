# 1040 Form Builder

A Node.js/TypeScript application that downloads IRS tax forms, analyzes their fields, and fills them with realistic fake data for testing, development, and dataset generation.

Covers **173 IRS and SSA forms** across 14 categories — from core 1040 returns to W-2s, 1099s, business returns, international filings, and payroll forms. Generated PDFs contain semantically correct data: names in name fields, SSNs in SSN fields, addresses in address fields, and calculated totals that satisfy IRS line formulas.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Option A: VS Code Dev Container (recommended)](#option-a-vs-code-dev-container-recommended)
  - [Option B: Local Development](#option-b-local-development)
- [npm Scripts](#npm-scripts)
- [Usage](#usage)
  - [Full Pipeline](#full-pipeline)
  - [Step-by-Step](#step-by-step)
  - [Fill Specific Forms](#fill-specific-forms)
  - [Per-Form Counts](#per-form-counts)
  - [Reproducible Output](#reproducible-output)
  - [Batch Generation](#batch-generation)
  - [Merging into One PDF](#merging-into-one-pdf)
- [CLI Reference](#cli-reference)
- [How It Works](#how-it-works)
  - [Phase 1 — Download](#phase-1--download)
  - [Phase 2 — Analyze](#phase-2--analyze)
  - [Phase 3 — Fill](#phase-3--fill)
  - [Formula Resolution](#formula-resolution)
- [Project Structure](#project-structure)
- [Supported Forms](#supported-forms)
- [Template Format](#template-format)
- [Output Files](#output-files)
- [Troubleshooting](#troubleshooting)

---

## Features

- **173 forms** — 1040, W-2, 1099 series, Schedules A–SE, business returns (1065, 1120), payroll (940/941), international (FBAR, 5471), and more
- **Realistic fake data** — context-aware field resolution: names, SSNs, EINs, addresses, dates, dollar amounts all look authentic
- **Formula-aware fills** — calculated fields (totals, subtractions, percentages) are computed from their source lines rather than filled randomly
- **Per-form counts** — generate a different number of copies per form type in a single command (`f1040:3,fw2:5`)
- **PDF bundling** — merge all generated PDFs into a single document with `--merge`
- **Seed-based reproducibility** — the same seed always produces the same PDFs
- **JSON templates** — each form's field structure is persisted so re-analysis is not needed on every run
- **Dev Container ready** — zero-config setup in VS Code

---

## Prerequisites

**Option A — Dev Container:** VS Code + Docker Desktop (no local Node.js required)

**Option B — Local:** Node.js 20+, npm 9+

---

## Getting Started

### Option A: VS Code Dev Container (recommended)

1. Install [VS Code](https://code.visualstudio.com/) and the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/)
3. Open this repository in VS Code
4. When prompted **"Reopen in Container"**, click it — or run **Dev Containers: Reopen in Container** from the Command Palette
5. Wait for the container to build and `npm install` to complete
6. Open a terminal inside VS Code and run:

```bash
npm run dev
```

### Option B: Local Development

```bash
git clone <repo-url>
cd 1040FormBuilder
npm install
npm run dev
```

---

## npm Scripts

All functionality is available through `npm run` commands. Pass additional flags after `--`.

| Script | Description |
|---|---|
| `npm run dev` | Full pipeline: download → analyze → fill all forms (1 submission) |
| `npm run download` | Download PDFs from IRS/SSA into `/forms/` |
| `npm run analyze` | Parse PDFs and generate JSON templates in `/templates/` |
| `npm run fill` | Fill forms with fake data, output to `/output/` |
| `npm run fill:batch` | Fill all forms with 5 unique submissions |
| `npm run fill:common` | Fill the 10 most common forms (1040, W-2, Schedules A–SE, 1099s) |
| `npm run fill:merge` | Fill all forms and merge output into one PDF |
| `npm run forms` | List all available form IDs and display names |
| `npm run validate` | Fill the common forms for each profile × year (2023–2025) and check household/cross-form consistency |
| `npm run build` | Compile TypeScript to `/dist/` |
| `npm run start` | Run the compiled build |

**Passing flags:** append `--` then your flags to any script:

```bash
npm run fill -- --forms f1040,fw2 --count 3 --seed 42
npm run fill -- --forms "f1040:3,fw2:5" --merge --merge-name bundle.pdf
npm run download -- --forms fw2,f1099int
npm run analyze -- --forms f1040
npm run dev -- --forms f1040,fw2 --count 5 --seed 99
```

---

## Usage

### Full Pipeline

Downloads missing forms, builds templates if needed, then generates one filled submission for every supported form:

```bash
npm run dev
```

This runs: download → analyze → fill for all 173 forms.

---

### Step-by-Step

Run each phase independently for more control:

```bash
# Step 1: Download PDFs from IRS/SSA into /forms/
npm run download

# Step 2: Analyze each PDF and save field metadata to /templates/
npm run analyze

# Step 3: Fill forms with fake data, write PDFs to /output/
npm run fill
```

---

### Fill Specific Forms

Pass a comma-separated list of form IDs with `--forms`:

```bash
npm run fill -- --forms f1040,fw2,f1040sa,f1040sb
```

To see all available form IDs:

```bash
npm run forms
```

Common form IDs:

| ID | Form |
|---|---|
| `f1040` | Form 1040 — Individual Income Tax Return |
| `fw2` | Form W-2 — Wages and Tax Statement |
| `fw4` | Form W-4 — Employee's Withholding Certificate |
| `fw9` | Form W-9 — Request for Taxpayer Identification |
| `f1040sa` | Schedule A — Itemized Deductions |
| `f1040sb` | Schedule B — Interest and Ordinary Dividends |
| `f1040sc` | Schedule C — Profit or Loss from Business |
| `f1040sd` | Schedule D — Capital Gains and Losses |
| `f1040se` | Schedule E — Supplemental Income and Loss |
| `f1099int` | Form 1099-INT — Interest Income |
| `f1099div` | Form 1099-DIV — Dividends and Distributions |
| `f1099nec` | Form 1099-NEC — Nonemployee Compensation |
| `f1099msc` | Form 1099-MISC — Miscellaneous Information |
| `f1099r` | Form 1099-R — Retirement Distributions |
| `f1040x` | Form 1040-X — Amended Return |
| `f1040es` | Form 1040-ES — Estimated Tax |
| `f2441` | Form 2441 — Child and Dependent Care |
| `f8863` | Form 8863 — Education Credits |
| `f8949` | Form 8949 — Capital Asset Sales |
| `f4868` | Form 4868 — Extension of Time to File |

Or fill the 10 most common forms in one command:

```bash
npm run fill:common
```

---

### Per-Form Counts

Append `:N` to any form ID to generate exactly N copies of that form, independent of the global `--count`:

```bash
# 3 copies of 1040, 5 copies of W-2, 1 copy of Schedule A
npm run fill -- --forms "f1040:3,fw2:5,f1040sa:1" --seed 50
```

Mix per-form counts with plain IDs — plain IDs fall back to the global `--count`:

```bash
# f1040 gets 4 copies, fw2 uses global count (2)
npm run fill -- --forms "f1040:4,fw2" --count 2 --seed 10
```

---

### Reproducible Output

Use `--seed` to pin the random data. The same seed always produces identical PDFs:

```bash
npm run fill -- --forms f1040,fw2 --seed 42
# Produces f1040_seed42.pdf and fw2_seed42.pdf — identical on every run
```

---

### Batch Generation

Generate multiple unique submissions (each with a different taxpayer profile):

```bash
# 5 unique submissions for the top 10 forms
npm run fill:common -- --count 5 --seed 100

# Or manually specify forms and count
npm run fill -- --forms f1040,fw2,f1040sa --count 3 --seed 100
```

Shortcut for 5 submissions of all forms:

```bash
npm run fill:batch
```

---

### Merging into One PDF

Use `--merge` to combine all generated PDFs into a single multi-page document. Pages are ordered by form ID then submission index.

```bash
# Fill and bundle into one PDF
npm run fill -- --forms f1040,fw2,f1040sa --seed 77 --merge

# Give the bundle a specific name
npm run fill -- --forms f1040,fw2 --count 3 --merge --merge-name taxpayer_bundle.pdf

# Use the fill:merge shortcut (fills all forms, merges output)
npm run fill:merge
```

Combine per-form counts with merge for a fully custom bundle:

```bash
npm run fill -- --forms "f1040:2,fw2:3,f1040sa:1,f1099int:2" --seed 100 --merge --merge-name full_submission.pdf
```

---

## CLI Reference

All flags work the same way on `npm run dev` and `npm run fill`.

| Flag | Default | Description |
|---|---|---|
| `-c, --count <n>` | `1` | Global number of unique submissions per form |
| `-f, --forms <ids>` | all | Forms to fill. Use `id` or `id:N` for per-form counts |
| `-s, --seed <n>` | random | Base seed for reproducible output |
| `-y, --year <n>` | `2025` | Tax year |
| `-j, --concurrency <n>` | `3` | Max parallel operations |
| `-m, --merge` | off | Merge all generated PDFs into a single bundled PDF |
| `--merge-name <name>` | timestamped | Output filename for the merged PDF |
| `--download-only` | off | Download PDFs only; skip analyze and fill |
| `--analyze-only` | off | Download and build templates; skip fill |
| `--force-reanalyze` | off | Rebuild templates even if they already exist |

`npm run analyze` and `npm run download` accept a subset:

| Flag | Applies to | Description |
|---|---|---|
| `-f, --forms <ids>` | both | Comma-separated form IDs |
| `-y, --year <n>` | `analyze` | Tax year to stamp on templates |

---

## How It Works

### Phase 1 — Download

PDFs are fetched from `https://www.irs.gov/pub/irs-pdf/{slug}.pdf` (and `ssa.gov` for SSA-1099) with:

- **Caching** — forms are saved to `/cache/` and copied to `/forms/`; already-cached forms are not re-downloaded
- **Retry logic** — up to 3 retries with exponential backoff
- **Rate limiting** — 600ms stagger between requests to avoid IRS throttling

### Phase 2 — Analyze

Each PDF goes through a multi-step analysis:

1. **XFA extraction** — IRS PDFs embed their form structure in a compressed XFA (XML Forms Architecture) stream. Before pdf-lib loads the file (which strips XFA), the raw bytes are scanned for compressed streams. The XFA XML is decompressed with zlib and parsed to extract `<speak>` accessibility labels — the most accurate field descriptions available.

2. **Classification** — each AcroForm field is matched against 50+ regex rules using the XFA label as the primary signal. Fields are classified into semantic types: `first_name`, `last_name`, `ssn`, `dollar_amount`, `date`, `checkbox`, `signature`, etc.

3. **Formula detection** — XFA labels containing IRS calculation language ("Add lines 1a through 1h", "Subtract line 10 from line 9", "Multiply line 2 by 7.5%") are parsed into typed formula objects and stored in the template.

4. **Line number indexing** — IRS line numbers (e.g. `1a`, `11b`, `25d`) are extracted from labels using multiple patterns: direct prefix (`1b. text`), `Row:` prefix, `Page N.` / `Part I I.` / `Section B—` prefix stripping, bold `**Line N.**` format, `Caution:` prefix stripping, and a fallback scan for line numbers embedded mid-label. A secondary pass infers line numbers from the AcroForm field path (e.g. `.Line4b[`) for fields with generic labels, and a tertiary adjacency pass assigns `Xa` to fields immediately preceding an `Xb` field.

Results are saved as JSON templates in `/templates/{formId}.json`.

### Phase 3 — Fill

Filling uses a two-pass approach:

**Pass 1 — Non-calculated fields:** Every field without a formula is resolved using a context-aware resolver that uses the stored XFA label (`labelHint`) to pick the right value:

| Field type | Resolution logic |
|---|---|
| `first_name` | Spouse's name if label contains "spouse"; dependent's name if "Dependent N" |
| `ssn` | Spouse SSN or dependent SSN based on label context |
| `street_address` | Employer address if label mentions "employer"; apt number if "apt" |
| `dollar_amount` | Maps label keywords (wages, interest, dividends, capital gains) to taxpayer income totals |
| `employer_ein` | Returns second W-2's EIN if label says "employer 2" |
| `checkbox` | Always checked if `required`; 50% probability otherwise |

**Pass 2 — Calculated fields:** Formulas are evaluated against the values filled in Pass 1:

| Formula type | Example label |
|---|---|
| `add_range` | "Add lines 1a through 1h" |
| `add_list` | "Add lines 1z, 2b, 3b, 4b, 5b, 6b, 7a, and 8" |
| `subtract` | "Subtract line 10 from line 9" |
| `multiply` | "Multiply line 2 by 7.5% (0.075)" |
| `multiply_two_lines` | "Multiply line 3c by line 3f" |
| `divide_two_lines` | "Divide line 3d by line 3e" |
| `divide_const` | "Divide line 7 by 3.0" |
| `min_line_const` | "Enter the smaller of line 5d or $40,000" |
| `min_two_lines` | "Enter the smaller of line 6 or line 9" |
| `max_two_lines` | "Enter the larger of line 10a or line 10c" |
| `conditional_subtract` | "If line 33 is more than line 24, subtract line 24 from line 33" |
| `reference` | "Amount from line 11a" |

Pass 2 retries up to 3 times to handle dependency chains (e.g. line 15 depends on 11b which depends on 11a).

### Formula Resolution

Across all 173 forms, the system detects **1,435 calculated fields** with a **100% resolution and evaluation rate**. The formula engine handles every IRS calculation pattern found across the form library, including edge cases like skipped line numbers (lines absent from a form's AcroForm layer are treated as 0, matching IRS intent). The 12 supported formula types are:

| Formula type | Example label |
|---|---|
| `add_range` | "Add lines 1a through 1h" |
| `add_list` | "Add lines 1z, 2b, 3b, 4b, 5b, 6b, 7a, and 8" |
| `subtract` | "Subtract line 10 from line 9" |
| `multiply` | "Multiply line 2 by 7.5% (0.075)" |
| `multiply_two_lines` | "Multiply line 3c by line 3f" |
| `divide_two_lines` | "Divide line 3d by line 3e" |
| `divide_const` | "Divide line 7 by 3.0" |
| `min_line_const` | "Enter the smaller of line 5d or $40,000" |
| `min_two_lines` | "Enter the smaller of line 6 or line 9" |
| `max_two_lines` | "Enter the larger of line 10a or line 10c" |
| `conditional_subtract` | "If line 33 is more than line 24, subtract line 24 from line 33" |
| `reference` | "Amount from line 11a" |

Unresolvable formulas (where a referenced line number can't be found in the template) fall back to faker-generated values with a warning logged.

---

## Project Structure

```text
1040FormBuilder/
├── src/
│   ├── main.ts                    # Primary CLI entry point
│   ├── analyzer/
│   │   ├── index.ts               # PDF field extraction & classification
│   │   └── xfa-extractor.ts       # XFA XML decompression & label extraction
│   ├── downloader/
│   │   └── index.ts               # IRS/SSA PDF downloader with caching
│   ├── faker/
│   │   ├── taxpayer.ts            # FakeTaxpayer interface
│   │   ├── factory.ts             # createTaxpayer() — generates realistic fake data
│   │   └── resolver.ts            # Context-aware field value resolution
│   ├── filler/
│   │   ├── index.ts               # Two-pass PDF filler
│   │   └── formula-evaluator.ts   # IRS formula computation engine
│   ├── merger/
│   │   └── index.ts               # mergePdfs() — combines PDFs into one document
│   ├── pipeline/
│   │   ├── runner.ts              # Single-form pipeline orchestration
│   │   └── batch.ts               # Batch runner with FormSpec and parseFormSpecs
│   ├── registry/
│   │   └── forms.ts               # 173-form registry with URLs and categories
│   └── templates/
│       ├── classifier.ts          # Field type classification rules
│       ├── formula-parser.ts      # XFA label → formula object parser
│       ├── line-index.ts          # IRS line number ↔ PDF field name index
│       ├── schema.ts              # TypeScript types for templates and formulas
│       └── store.ts               # Template save/load/build
├── scripts/
│   ├── download.ts                # CLI: download forms
│   ├── analyze.ts                 # CLI: analyze PDFs → templates
│   ├── fill.ts                    # CLI: fill forms with fake data
│   └── download_missing.ts        # One-shot: download all missing forms
├── forms/                         # Downloaded IRS PDF files (not committed)
├── templates/                     # Generated JSON templates (173 files)
├── cache/                         # PDF download cache (not committed)
├── output/                        # Filled PDF output (not committed)
├── docs/
│   └── forms.md                   # Comprehensive form inventory reference
├── .devcontainer/                 # VS Code Dev Container configuration
├── package.json
└── tsconfig.json
```

---

## Supported Forms

173 forms across 14 categories:

| Category | Count | Examples |
|---|---|---|
| Core returns | 5 | 1040, 1040-SR, 1040-NR, 1040-X, 1040-ES |
| Schedules | 12 | A, B, C, D, E, F, H, J, SE, 1, 2, 3 |
| Supporting | 33 | 2106, 2210, 2441, 4562, 8283, 8863, 8949 |
| Information returns | 21 | 1099-INT, 1099-DIV, 1099-NEC, 1099-MISC, 1099-R |
| Schedule K-1 | 3 | K-1 (1065), K-1 (1120-S), K-1 (1041) |
| Business | 25 | 1065, 1120, 1120-S, 1125-A, 8594, 8886 |
| Fiduciary / Estate | 6 | 706, 709, 1041, 5227, 8971 |
| Exempt organizations | 8 | 990, 990-EZ, 990-PF, 1023, 4720, 8868 |
| Payroll | 16 | 940, 941, 944, W-2, W-3, W-4, W-9, W-7 |
| Retirement / ACA | 5 | 5498, 5500, 1094-B/C, 1095-A/B/C |
| International | 17 | 926, 1042, 3520, 5471, 8288, 8833, 8854, 8938 |
| Excise | 6 | 720, 730, 2290, 8027, 8611, 8849 |
| Admin / Practitioner | 13 | 2848, 3115, 7004, 8275, 8300, 8821, 8832, 8879 |
| ACA | 5 | 1094-B, 1094-C, 1095-A, 1095-B, 1095-C |

For the full list of form IDs: `npm run forms`

---

## Template Format

Each analyzed form produces a JSON template at `templates/{formId}.json`:

```json
{
  "formId": "f1040",
  "displayName": "Form 1040",
  "taxYear": 2025,
  "sourceUrl": "https://www.irs.gov/pub/irs-pdf/f1040.pdf",
  "generatedAt": "2026-04-07T00:00:00.000Z",
  "fields": [
    {
      "pdfFieldName": "topmostSubform[0].Page1[0].f1_47[0]",
      "fieldType": "dollar_amount",
      "labelHint": "Income. Attach Form(s) W-2 here...",
      "lineNumber": "1a",
      "required": false,
      "maxLength": 14
    },
    {
      "pdfFieldName": "topmostSubform[0].Page1[0].f1_57[0]",
      "fieldType": "dollar_amount",
      "labelHint": "1z. Add lines 1a through 1h.",
      "lineNumber": "1z",
      "required": false,
      "formula": {
        "op": { "kind": "add_range", "start": "1a", "end": "1h" },
        "floorAtZero": false,
        "rawLabel": "1z. Add lines 1a through 1h."
      }
    }
  ]
}
```

**Field types:** `first_name`, `last_name`, `full_name`, `ssn`, `ein`, `employer_ein`, `payer_tin`, `itin`, `ptin`, `ip_pin`, `street_address`, `city`, `state`, `zip_code`, `country`, `date`, `tax_year`, `dollar_amount`, `percentage`, `shares`, `phone_number`, `email`, `routing_number`, `account_number`, `filing_status`, `occupation`, `dependent_name`, `dependent_ssn`, `relationship`, `employer_name`, `payer_name`, `entity_name`, `business_name`, `checkbox`, `radio`, `signature`, `generic_number`, `generic_text`

**Formula types:** `add_range`, `add_list`, `subtract`, `multiply`, `multiply_two_lines`, `divide_two_lines`, `divide_const`, `min_line_const`, `min_two_lines`, `max_two_lines`, `conditional_subtract`, `reference`

---

## Output Files

Filled PDFs are written to `/output/` with the naming convention:

```text
{formId}_seed{seed}.pdf            # single submission
{formId}_seed{seed}_{index}.pdf    # batch submission (--count > 1)
merged_{timestamp}.pdf             # merged bundle (--merge)
```

The PDFs are **flattened** — form fields are rendered into the page content so values are visible in any PDF viewer without interactive form support.

### Blank vs. random fields

Fields that don't correspond to taxpayer data (e.g. Form 1040 line 1c tip income, W-2 box 14) are left **blank**, and checkboxes are left unchecked unless a rule sets them, so every amount on a return ties back to the household. Form 1040 uses an explicit per-year field map (`src/fieldmaps/f1040.ts`) for filing status, spouse, dependents, and the income/deduction lines.

Each household gets one W-2 per W-2 record (a spouse's W-2 carries the spouse's name and SSN on joint returns) and one 1099-INT / 1099-DIV per payer and one 1099-R per pension or IRA distribution; with several documents the files are named `{formId}_seed{seed}_doc{n}.pdf`. A form with no matching records (e.g. no interest payers) produces no 1099-INT. Form 1040 tax, credits, refund, and amount owed come from `src/tax/compute.ts`, which uses the verified 2023–2025 constants in `src/config/tax-year.ts` (brackets, Tax Table rule, qualified dividend/capital gain thresholds, CTC, standard deduction). Income it cannot yet carry to the 1040 (prior-year passive loss carryovers, rentals without active participation) is reported by `npm run validate` as `household-within-supported-scope` rather than dropped silently.

**Self-employment and the numbered schedules.** A profile's net business figure is broken into a full Schedule C (receipts, expense lines, standard-mileage vehicle, simplified home office) by `src/faker/schedule-c.ts`; line 31 always equals the drawn net figure. From that, `computeReturn` builds Schedule SE (per person), Schedule 1 (business income, unemployment, educator expenses, SE-tax and SE-health-insurance deductions, student loan interest), Form 8995 (QBI below the § 199A threshold), Schedule 2 (SE tax, Additional Medicare Tax / Form 8959, NIIT / Form 8960, both attached) and Schedule 3 (excess Social Security withheld, per employer EIN). Only the schedules a return needs are generated: one Schedule C per business, one Schedule SE per person who owes SE tax. Amounts keep cents by default; set `wholeDollars: true` on a taxpayer to round every line to whole dollars as e-filed returns do.

**Vehicle costs, non-qualified businesses and uncollected payroll tax.**
- *Vehicle costs.* About half of the standard-mileage vehicles drawn by the profiles also carry car loan interest, and most of those a personal property tax. Under the Schedule C line 9 instructions, line 9 holds only business miles × the rate plus parking and tolls. Pub 463 lets a self-employed person also deduct the business share (business ÷ total miles) of the interest and tax, so it goes on line 16b (interest) and line 23 (taxes). Gross receipts rise by that share, so line 31 still equals the drawn figure. TaxCalcBench reports the same share inside line 9. The totals agree to the cent, but with whole-dollar rounding the two separately rounded lines can be $1 off its single line 9 figure. That's why its two vehicle cases score within $1 rather than exactly.
- *Non-qualified businesses.* A Schedule C business marked `notQualifiedForQbi` stays on Schedules C, SE and 1 but is left out of Forms 8995 / 8995-A, including loss netting. Each QBI row keeps its Schedule C index (`businessIndex`), so names stay correct. The profiles don't draw this; it comes from the answer key's input.
- *Uncollected payroll tax.* W-2 box 12 codes A/B (uncollected Social Security / Medicare tax on tips) and M/N (the same on group-term life insurance) go to Schedule 2 line 13 and into Schedule 8812 line 22. Only the answer key supplies these codes: the profiles don't draw them, even though the W-2 map now fills box 12 (see the Saver's credit).

**Social Security benefits.** Profiles turn the drawn net benefits into a Form SSA-1099 (box 5, with Form W-4V withholding for about a third). Lines 6a/6b follow the Social Security Benefits Worksheet in the Form 1040 instructions: base amounts $25,000 / $32,000 joint, second tier $6,000 / $9,000, at most 85% taxable; married filing separately is assumed to have lived with the spouse (base $0) unless `mfsLivedWithSpouse: false`. Box 6 withholding goes on line 25b. Taxpayers can also be blind (additional standard deduction and the "blind" boxes). No SSA-1099 PDF is generated (the SSA issues it; there's no fillable IRS form).

**Pensions and IRAs (Form 1099-R).** After every other draw, `src/faker/retirement.ts` gives each person on the return (a spouse only when filing jointly) distributions that fit their age at year end: at 73+ an IRA required minimum distribution (code 7), often a pension and sometimes a qualified Roth distribution (code Q); at 61–72 sometimes a pension or IRA distribution; at 25–58 occasionally an early distribution (code 1, or code 2 when an exception applies) or a 401(k) direct rollover to an IRA (code G). Ages 59–60 draw nothing, so no code 7 falls before 59½. A quarter of pensions include employee contributions (box 5), making them partly taxable. `src/tax/retirement.ts` follows the Form 1040 instructions for lines 4a–5b. The IRA/SEP/SIMPLE box sends a distribution to lines 4a/4b, otherwise 5a/5b. When every distribution on the line is fully taxable, the total goes on 4b/5b and 4a/5a is left blank; otherwise 4a/5a is the total and 4b/5b the taxable part (0 for code G and Q). The 2025 form's line 4c/5c box 1 marks a rollover; 2023/2024 have no field for the "Rollover" note. Code 1 distributions owe the 10% additional tax on their taxable amount on Schedule 2 line 8, with the "Form 5329 not required" box checked, so Form 5329 is never needed. Box 4 withholding is part of line 25b. Distributions count in total income and in the Social Security worksheet and Form 8582 modified AGI, but not in earned income, EIC investment income or net investment income. One Form 1099-R per distribution is filled for 2023–2025 from that year's own PDF (the 2023/2024 copies are the irs.gov prior-year forms); its field names come from `src/fieldmaps/f1099r.layout.ts`, generated by `npx ts-node scripts/gen-1099r-map.ts`.

**Alternative minimum tax (Form 6251, Form 3921).** `src/tax/amt.ts` follows each year's Form 6251 and its instructions (amounts in `AMT`):
- *AMTI.* Line 1 is AGI less total deductions. In 2025, line 1a/1b adds back the Schedule 1-A senior deduction, which the AMT treats as a personal exemption. Line 2a adds back Schedule A taxes, or the standard deduction when not itemizing. Line 2i adds the incentive-stock-option spread on shares exercised and held. The other adjustments aren't modelled.
- *Exemption.* The year's exemption less 25% of AMTI over the phase-out start.
- *Tax.* 26%/28% with the year's breakpoint, or Part III's maximum capital gains rates when there are qualified dividends or a net capital gain. Part III reuses the regular Qualified Dividends and Capital Gain Tax Worksheet's lines 4 and 5, with no unrecaptured § 1250 gain.
- *AMT.* Tentative minimum tax less (regular tax + excess advance PTC repayment). It goes on Schedule 2 line 1 (2023) or line 2 (2024–2025), then into line 3 and 1040 line 17, so it also raises every credit limit after line 18. AMT is figured on every return; Form 6251 is attached when it's owed.
- *Why ISO exercises.* Profile households never owe AMT from income and the SALT/standard deduction add-back alone. So after every other draw, about 5% of households with a $90,000+ W-2 earner exercise an incentive stock option from that employer and hold the shares. One Form 3921 per exercise; the spread is $20,000–$350,000. About 3–4% of returns then owe AMT, typically $5,000–$80,000.
- *PDFs.* Form 3921 is a continuous-use form. Only the April 2025 revision is on irs.gov (the 2023/2024 prior-year links return 404), so it's used for all three years; box 2's date carries the year. The 2023/2024 Form 6251 PDFs are the irs.gov prior-year forms.

**Health savings accounts (Form 8889, Form 1099-SA).** `src/tax/hsa.ts` follows each year's Form 8889 and its instructions (limits in `HSA_LIMIT`, `HSA_CATCH_UP`), with one Part I and Part II per spouse who has an HSA:
- *Contributions (Part I).* Line 3 is the year's self-only or family limit ($3,850/$7,750, $4,150/$8,300, $4,300/$8,550), plus the $1,000 catch-up at 55+ (except under married family coverage, below). A person eligible for only part of the year (`HsaAccount.months`) gets the Line 3 Limitation Chart: each eligible month's amount, totalled and divided by 12. The family amount applies when the person or the spouse had family coverage (rule 1), including a spouse's family HSA on a separate return. The last-month rule is applied only when elected (`lastMonthRule`), since the 2025 instructions say you "may" treat yourself as eligible all year; the testing period (Part III) isn't modelled. When spouses have separate HSAs and family coverage, line 6 is split equally (the default; spouses may agree on another split), using the instructions' Steps 1–4 when family coverage wasn't every month, and a 55+ spouse's catch-up goes on line 7 (prorated by family months). Profiles give each household one HSA, so this two-HSA path is checked by a constructed case, not by seeds. Line 9 is the employer's contribution from W-2 box 12 code W. Line 13, the deduction, is the smaller of line 2 and line 12; it goes on Schedule 1 line 13 and is subtracted in the Form 8582 MAGI.
- *Distributions (Part II).* Line 14a is the 1099-SA's box 1, and line 15 is the part spent on qualified medical expenses. The taxable rest (line 16) goes on Schedule 1 line 8f, and the 20% additional tax (line 17b, waived at 65+) goes on Schedule 2 line 17c.
- *Profiles.* After every other draw, about 15% of households where everyone is under 65 and nobody has a Marketplace policy get an HSA, held by the main earner. Coverage is family on a joint return or with dependents. 60% also get an employer contribution of $250–$2,000 (code W). The holder contributes part of the remaining room, so there's never an excess. 45% take a distribution of $150–$4,000, and about 1 in 10 of those is partly non-medical.
- *Not modelled* (reported as unsupported): excess contributions (Form 5329), contributions at 65 or older, an HSA alongside Marketplace coverage, code W without HSA details, a spouse with family coverage for only part of the year, Part III (failing to stay HDHP-eligible), qualified HSA funding distributions and rollovers. Profiles draw full-year coverage only.
- *PDFs.* Form 1099-SA is a continuous-use form, so the April 2025 revision is used for all three years. The 2023/2024 Form 8889 PDFs are the irs.gov prior-year forms.

**Gambling winnings (Form W-2G).** `FakeTaxpayer.gamblingWinnings` puts each W-2G's box 1 on Schedule 1 line 8b and its box 4 withholding on Form 1040 line 25c. Gambling losses go on Schedule A line 16, up to the winnings. Only the answer key supplies W-2Gs: the profiles don't draw them, and the W-2G itself isn't filled.

**Premium tax credit (Form 8962, Form 1095-A).** `src/tax/premium-tax-credit.ts` follows each year's Form 8962 and its instructions:
- *Household income.* Family size is the filer, the spouse on a joint return, and the dependents. Household income is AGI plus Social Security benefits not included in income (tax-exempt interest isn't modelled).
- *Poverty line.* Line 4 uses the prior year's table for Alaska, Hawaii, or the other 48 states and DC (`PTC_POVERTY_LINE`). Line 5 is the percentage, truncated; over 400% → 401.
- *Applicable figure.* Line 7 follows Table 2's enhanced schedule (0% up to 150%, up to 8.5% at 400% and above). It's reproduced exactly, including the round-half-up rows; all 251 rows match each year's table.
- *Contribution.* Line 8a is household income × line 7, rounded half up in exact integers.
- *Annual calculation.* Line 11 uses one full-year policy: PTC = min(premiums, SLCSP − contribution).
- *Reconciliation.* A net PTC goes to Schedule 3 line 9 → line 15 → 1040 line 31. Excess advance payments are repaid up to the year's Table 5 limit (`PTC_REPAYMENT_LIMIT`; no limit at 400%+) on Schedule 2 line 2 (2023) or line 1a (2024–2025) → line 3 → 1040 line 17. That amount is also part of line 18, so it raises every credit limit after it.
- *When Form 8962 is filed.* Only when there's a credit or advance payments to reconcile.
- *Not modelled* (reported as unsupported): married filing separately, household income under 100% of the poverty line, monthly amounts, policy allocation and the year-of-marriage election.
- *Profiles.* After every other draw, about 8% of households take a full-year Marketplace policy, when everyone is under 65 and the return isn't MFS. The SLCSP is age-rated from a 40-year-old's premium, and the enrolled plan costs 75–125% of it. The advance payments are what the Marketplace would figure from a projected income off by up to ±15%, so returns usually reconcile a small credit or repayment. The draw assumes no affordable employer coverage was offered, which the model can't represent.
- *Forms.* One Form 1095-A per policy (a twelfth of each amount per month, with December taking the rounding) and Form 8962 are mapped for 2023–2025. The 2023/2024 PDFs are the irs.gov prior-year forms.

**Education credits (Form 8863, Form 1098-T).** `src/tax/education.ts` follows each year's Form 8863 and its instructions (2023–2025 are the same):
- *Which credit.* Each student gets the American opportunity credit (AOTC) if eligible: the AOTC wasn't claimed for 4 prior years, the student was at least half-time in a degree program, hadn't finished 4 years of postsecondary education, and has no felony drug conviction. Otherwise the student falls back to the lifetime learning credit (LLC).
- *Expenses.* Adjusted expenses are 1098-T box 1 less box 5 (scholarships), plus course materials bought elsewhere (AOTC only).
- *AOTC amount.* 100% of the first $2,000 plus 25% of the next $2,000, phased out between $80,000 and $90,000 of MAGI ($160,000–$180,000 joint). 40% is refundable (1040 line 29) unless the under-24 conditions apply.
- *LLC amount.* 20% of up to $10,000, with the same phase-out.
- *Limit and order.* The nonrefundable part is capped by the Credit Limit Worksheet at 1040 line 18 less Schedule 3 line 2, and goes to Schedule 3 line 3. The order is now Form 2441 → Form 8863 → Form 8880 → the child tax credit.
- *Married filing separately.* No credit.
- *Profiles.* After every other draw, about 25% of filers 38 and older (not MFS) gain a college-age child, 18–23 and a full-time student. That child is appended after the existing dependents, since profiles otherwise draw only children 0–17. About 70% of student dependents get a 1098-T: tuition $4,000–$30,000, scholarships for about 40%, and course materials. Year in college follows age (a 22- or 23-year-old is a graduate student on the LLC). About 5% of filers and spouses aged 24–50 take part-time graduate courses (LLC).
- *Forms.* One Form 1098-T per student. One Form 8863 per student, with page 1 filled on the first copy only (more students → more copies of page 2). A second institution (line 22b) isn't modelled.
- *PDFs.* The 2023/2024 Forms 8863 and the 2023–2025 Forms 1098-T are the irs.gov prior-year forms (the installed 1098-T had been the 2026 one). The 1098-T map comes from `src/fieldmaps/f1098t.layout.ts`, generated by `npx ts-node scripts/gen-1098t-map.ts`.

**Child and dependent care credit (Form 2441).** `src/tax/dependent-care.ts` follows each year's Form 2441 and its instructions (checked for 2023 and 2025; the 2023, 2024 and 2025 forms print the same line 8 table):
- *Qualifying persons.* A qualifying child (the same relationship, residency and age tests as the child tax credit and EIC) under 13 at year end, or a disabled dependent who lived with the filer more than half the year.
- *Lines 3–6.* Line 3 is capped at $3,000 for one qualifying person or $6,000 for two or more. Earned income on lines 4/5 is each person's W-2 wages plus Schedule SE line 3 less the SE-tax deduction (line 5 is the spouse on a joint return, else line 4). Line 6 is the smallest of the three.
- *Lines 8–11.* The line 8 rate is 35% at AGI up to $15,000, down 1 point per $2,000, to 20% over $43,000. Line 10 is 1040 line 18 (Schedule 3 lines 1 and 6l aren't modelled). Line 11 goes to Schedule 3 line 2.
- *Married filing separately.* Only a filer who lived apart from the spouse can claim it (line A).
- *Credit order.* This credit comes first. Form 8880's limit is line 18 less Schedule 3 line 2, and the child tax credit's limit (Schedule 8812 line 13) is line 18 less Schedule 3 lines 2 and 4.
- *Not modelled.* Part III (employer dependent care benefits, W-2 box 10), household-employee providers (Schedule H), deemed income for a student or disabled spouse, and line 9b (prior-year expenses). Those are reported as unsupported when they would change the credit.
- *Profiles.* After every other draw, about 45% of households with a qualifying child under 13 pay for care, as long as everyone who must work does and the return isn't married filing separately. That's $1,500–$9,000 per child, paid to one or two providers: a daycare center with an EIN, or a sitter with an SSN.
- *PDFs.* Form 2441 is mapped for 2023–2025 (2023/2024 share a layout; 2025 merges each provider's address into one field). The 2023/2024 PDFs are the irs.gov prior-year forms.

**Traditional IRA deduction (Schedule 1 line 20).** `src/tax/ira.ts` follows the IRA Deduction Worksheet in the 2023/2024 Form 1040 instructions, with 2025 amounts from Pub 590-A (`IRA_CONTRIBUTION_LIMIT`, `IRA_PHASEOUT_END`):
- *Nobody covered.* When neither spouse is covered by a workplace plan (W-2 box 13, which defaults to checked when box 12 shows a deferral), the deduction is the contribution, up to the limit and compensation.
- *Someone covered.* Modified AGI (line 9 less Schedule 1 lines 11–19a, 23, 25) is measured against the year's range: single, joint, the not-covered spouse of a covered person, or MFS living together. The deduction is the room × limit / range width, rounded up to $10 with a $200 minimum.
- *Linked figures.* The Social Security worksheet runs again with the deduction. Student loan interest MAGI subtracts it. Form 8880 line 1 counts traditional contributions.
- *Pub 590-A cases* (reported as unsupported): nondeductible contributions (Form 8606), a joint return with both traditional and Roth contributions, coverage plus Social Security benefits (Appendix B), and low joint compensation.
- *Profiles.* After every other draw, about 12% of people with wages contribute, only where nobody on the return is covered and nobody made Roth contributions. Those contributions are always fully deductible. The phase-out arithmetic is tested against hand-worked cases rather than profile draws.

**Saver's credit (Form 8880).** Each year's Form 8880 (its page 2 holds the instructions) drives `src/tax/savers-credit.ts`:
- *Eligibility.* Each person must be born on or before January 1 of the tax year minus 17 and not a full-time student (`fullTimeStudent`). Being claimed as a dependent also disqualifies, but the model has no flag for that.
- *Contributions.* Line 1 is Roth IRA contributions; traditional IRA contributions (and their deduction) aren't modelled. Line 2 is W-2 box 12 elective deferrals (codes D, E, F, G, H, S, AA, BB, EE).
- *Distributions.* Line 4 is the current year's Form 1099-R box 1 amounts other than rollovers (code G). On a joint return both spouses' amounts go in both columns. The two prior years and the filing season are assumed to have no distributions.
- *Credit.* Lines 5–7 cap each person at $2,000, and line 9 takes the rate from that year's AGI table (single, MFS and QSS share a column). Line 11 is Form 1040 line 18, because none of the Schedule 3 lines 1–3, 6d or 6l credits are modelled. Line 12 goes to Schedule 3 line 4, then line 8, then 1040 line 20.
- *Ordering with the child tax credit.* The child tax credit is limited to line 18 less the Saver's credit (Schedule 8812 Credit Limit Worksheet A, line 13).
- *Profiles.* After every other draw, about 40% of W-2s get a 401(k) deferral (box 12 code D, within the § 402(g) limit). Box 1 stays as drawn, boxes 3 and 5 rise by the deferral, and boxes 4 and 6 are refigured. The § 402(g) limit applies per person across all their W-2s. About 10% of people in households well under the Roth phase-out contribute to a Roth IRA, except a married-filing-separately filer who lived with their spouse (their phase-out is $0–$10,000).
- *W-2 map.* A non-strict W-2 map fills box 12a–d and box 13 "Retirement plan" (the W-2's `retirementPlan`, or a deferral in box 12); the resolver still fills every other box.
- *PDFs.* The 2023/2024 Form 8880 PDFs are the irs.gov prior-year forms.

**Alaska Permanent Fund dividends.** Every person on an Alaska household's return (a spouse only when filing jointly) receives that year's dividend, including any energy relief paid with it: $1,312 for 2023, $1,702 for 2024 and $1,000 for 2025 (`ALASKA_PFD` in `src/config/tax-year.ts`; no random draws, so seeds are unchanged). It goes on Schedule 1 line 8g and through line 9 to line 10. It counts in AGI, the Social Security worksheet and Form 8582 modified AGI, but it isn't earned income, EIC investment income or net investment income (the Form 8960 instructions exclude it).

**2025 senior deduction.** Schedule 1-A Part V (line 38 → Form 1040 line 13b): $6,000 for each spouse born before January 2, 1961 with an SSN, less 6% of modified AGI over $75,000 ($150,000 joint), not on separate returns. It applies whether or not the household itemizes, and Form 8995's "taxable income before QBI" is figured after it. Parts II–IV (tips, overtime, car loan interest) are not modelled. Schedule 1-A is filled for 2025 (Parts I, V and VI).

**Itemized deductions and rentals.** Line 12 is the larger of the standard deduction (with the 65+ add-on) and Schedule A; Schedule A is filed only when it wins, unless the filer elects to itemize a smaller amount (`electToItemize`, line 18 box). A separate filer whose spouse itemizes has a $0 standard deduction (§ 63(c)(6)(A); `spouseItemizes`). Schedule A line 5a is the state income tax withheld on the return's own W-2s (box 17), or general sales taxes when elected (the line 5a box); with real estate and personal property tax it is capped at the year's SALT limit: $10,000 ($5,000 MFS) for 2023–2024. For 2025 it's $40,000 less 30% of AGI over $500,000, never below $10,000; a separate filer gets half the worksheet result, so $20,000 less 15% of AGI over $250,000, never below $5,000. Medical expenses are deductible above 7.5% of AGI.
- *Charity.* Lines 11–12 can be given by Pub 526 limit category (`charityByLimit`: 60% cash, 50% noncash, 30% cash/noncash/capital gain property), with the prior-year carryover on line 13. Pub 526 Worksheet 2 isn't modelled, so a return is reported as unsupported when a limit could bind: gifts plus carryover over 20% of AGI, unless they're all 60% cash within 60%.
- *Gambling losses* (line 16) are deductible up to the gambling winnings on Schedule 1 line 8b.
- The profiles don't draw elections, carryovers, limit categories or gambling losses; those come from the answer key.

**Profile Schedule A and rentals.** Profiles build Schedule A detail whose line 17 equals the drawn itemized total (or the capped SALT, if that is larger), and a rental property whose Schedule E line 21 equals the drawn rental figure (27.5-year straight-line depreciation on a building placed in service in an earlier year). Rental income flows through Schedule 1 line 5 and counts as net investment income (Form 8960 line 4a) and as EIC investment income; rentals are not treated as a § 199A trade or business.

**QBI above the threshold (Form 8995-A).** When taxable income before the QBI deduction is over the § 199A threshold, the deduction per business is the smaller of 20% of QBI and the greater of 50% of W-2 wages or 25% of W-2 wages plus 2.5% of UBIA; inside the $50,000 ($100,000 joint) phase-in range Part III phases that limit in, and a specified service business is scaled by its applicable percentage (Schedule A) and drops out above the range. Losses are netted against profitable businesses pro rata (Schedule C). Profiles mark consulting and bookkeeping businesses as SSTBs, and about 30% of businesses have employees (Schedule C line 26 wages = W-2 wages, with an EIN) or qualified property (UBIA). Form 8995-A, Schedule A (Form 8995-A) and Schedule C (Form 8995-A, Rev. December 2022) are mapped for 2023–2025. irs.gov has no standalone 2023 Schedule A, so `forms_2023/f8995aa.pdf` is page 4 of the 2023 Form 8995/8995-A package, extracted with only that page's fields; its field numbers run two lower than 2024's and are zero-padded, which the map translates.

**Rental losses (Form 8582).** About a quarter of profile rentals run at a loss. Losses are limited by the passive activity rules: no Form 8582 when the exception applies (active-participation rentals only, loss ≤ $25,000 and modified AGI ≤ $100,000; halved for MFS living apart); otherwise the $25,000 special allowance is reduced by 50% of modified AGI over $100,000 (none for MFS living with the spouse), passive income is added, and Parts VI–VIII allocate the allowed loss to each rental for Schedule E line 22. The unallowed part is carried forward (not yet tracked across years). Modified AGI follows the Form 8582 line 6 instructions (no passive loss, taxable Social Security, SE-tax deduction, IRA or student loan interest deductions). Form 8582 is mapped for 2023–2025: the 2023/2024 maps are the 2025 map translated by short field name through `src/fieldmaps/f8582.index.ts`, generated by `npx ts-node scripts/gen-field-index.ts f8582`.

**Capital gains.** A profile's net capital gain is broken into 1–4 synthetic brokerage sales (`src/faker/capital.ts`) whose Form 8949 column (h) amounts add up to the drawn figure exactly. `src/tax/capital.ts` sets each sale's term from its dates (long-term only when sold after the first anniversary of purchase), applies wash-sale add-backs (code W) and accrued market discount (code D, taxed as interest on Schedule B), and builds Schedule D with capital loss carryovers and the $3,000 / $1,500 loss limit. Covered sales with no adjustments go straight to Schedule D lines 1a / 8a (Exception 1); everything else is listed on Form 8949, one copy per box pair, 11 rows per part. Only the § 1(h) net capital gain — the smaller of Schedule D lines 15 and 16 — gets the capital-gains tax rate, so short-term gains are taxed as ordinary income.

**Child tax credit, EIC and ACTC.** Dependents are sorted by the qualifying-child tests in `src/tax/household.ts` (relationship; under 19, under 24 and a student, or disabled; younger than the taxpayer or spouse; more than half the year in the U.S. home; an SSN valid for employment for CTC and EIC). The earned income credit (line 27) follows EIC Worksheet A/B with the EIC Table rule ($50 rows taxed at the midpoint); the additional child tax credit (line 28) follows Schedule 8812 Part II-A and II-B. Parameters are from Rev. Procs 2022-38 / 2023-34 / 2024-40 § 3.05–3.07. A separate (MFS) return claims no EIC; it is flagged only when the separated-spouse rule could change that.

**Year-specific PDFs.** Every form the generator fills has a field map for 2023, 2024 and 2025, built against that year's own PDF (`forms_<year>/`). If a future year's folder gets a needed schedule without a map, the 1040 totals still include it, but the schedule is left out of the merged PDF; `fill` prints a `NOT INCLUDED` warning and `npm run validate` fails `needed-schedules-have-year-maps`. To add a year: put its PDFs in `forms_<year>/`, run `FORMS_DIR=forms_<year> TEMPLATES_DIR=templates_<year> npm run analyze -- --year <year> --forms <ids>`, and extend the per-year field tables in `src/fieldmaps/`. Form 1099-B's map is generated from the templates by `npx ts-node scripts/gen-1099b-map.ts`. `f8812.pdf` is the old standalone Form 8812; Schedule 8812 is `f1040s8`.

To restore the old behaviour of filling every box with random values (useful for OCR/layout stress tests), set `FILL_UNMAPPED=random`.

### Consistency checks

`npm run validate` fills the common form set straight from the `forms_<year>` / `templates_<year>` snapshots (it does not touch `forms/`, `templates/`, or `src/faker/factory.ts`) and prints per-form metrics plus checks such as "exactly one filing status", "W-2 box 1 = 1040 line 1a", and "no text in numeric fields". Each check is tagged with the fix-plan phase that owns it; the command exits non-zero only for failing checks at or below `--gate` (default `1`).

```bash
npm run validate
npm run validate -- --profiles rivera_mfj --years 2025 --keep   # keep the filled PDFs
npm run validate -- --gate 2 --json report.json
```

### External answer key (TaxCalcBench)

`npm run answer-key` scores the federal calculation in `src/tax/compute.ts` against the hand-built TY2024 answer key in [TaxCalcBench](https://github.com/column-tax/tax-calc-bench) (51 federal returns, 19 Form 1040 lines each). The dataset is **not** included in this repo: TaxCalcBench is published for evaluation only and asks that its inputs and outputs never be used for model training or synthetic training-data generation. Keep a separate local clone and never copy its data into generated returns.

```bash
git clone --depth 1 https://github.com/column-tax/tax-calc-bench.git ../tax-calc-bench
TAXCALCBENCH_DIR=../tax-calc-bench npm run answer-key
npm run answer-key -- --bench-dir ../tax-calc-bench --case single-w2 --verbose
```

A case is scored only when every answer in its input is something the taxpayer model represents; the rest are listed as out of scope with the reason (e.g. Form 8949, Schedule 8812 Part II, EIC the household may qualify for), and the summary ranks those reasons to show what to support next. Cases the TaxCalcBench README lists as known issues are reported separately. The adapter rounds every line to whole dollars (`wholeDollars`), like MeF. `--verbose` (and any mismatch) also compares supporting-form amounts — Schedule C line 31, Schedule SE line 12, Schedule 1/2/3 totals, Form 8959, the QBI deduction — to show where a 1040 difference starts.

`single-eic-non-dependent-child` is kept out of scope: TaxCalcBench drops a child because the taxpayer "did not provide at least half of this person's support", but the qualifying-child tests have no such test (the child must not have supported themselves), so the law gives the 1-child EIC rather than the no-child amount the dataset expects.

Known ±$1 difference: `mfj-multiple-w2-schedule-c-qbi-income` — TaxCalcBench files Form 8995-A, which rounds 20% per business; Form 8995 (correct below the threshold) takes 20% of the total.

**TY2025 cases.** The run also scores TaxCalcBench's 10 TY2025 federal cases (`ty25-us-*`; `--year 2024|2025|all`). The 40 state cases aren't loaded: their expected output is the state return only, with no Form 1040 lines.
- *Source documents.* TY2025 gives the W-2s and 1099s as flattened PDFs; only the other answers are JSON (`remaining_data.json`, in TY2024's layout). `scripts/pdf-fill-text.py` (needs `python3` with `pypdf` installed for that interpreter; it runs with `-I`, so a `pip install --user` copy isn't seen, and the dev container doesn't include it. Without it the TY2025 run is skipped and TY2024 still scores) returns each typed-in value with its position plus the form's printed box numbers, and `src/answerkey/ty25-documents.ts` assigns each value to the nearest box number above it, then writes the answers TY2024 would have had. It reads W-2s, 1099-INTs, 1099-DIVs, W-2Gs and 1099-NECs (onto a sole Schedule C). Any other document type, or a non-zero box that isn't modelled, puts the case out of scope. On a joint return, a W-2 or W-2G belongs to whoever's first name matches the prior-year Form 1040 (the cases share one SSN). Read at run time; nothing is cached.
- *Reader check.* Every W-2 and W-2G read from the PDFs matches the copy echoed in the case's expected return: 12 documents, including W-2 box 12 codes and box 13. 1099-INT box 1, 1099-DIV boxes 1a/1b, W-2 box 2 and 1099-NEC box 1 match the expected Form 1040 and Schedule C totals in every federal case. Two 1099 withholding totals differ, both explained: Social Security withholding (from the JSON) and a 1099-R the reader skips. In every case 1099-DIV boxes 1a and 1b are equal, so a swap of the two wouldn't show.
- *Form 8889.* Lines 3, 5, 6, 8, 9, 11 and 12 count toward the result like the 1040 lines (line 13 reaches line 10 through Schedule 1 line 13).
- *Results.* 2 cases are in scope and match strictly: `ty25-us-006` (the HSA case) and `ty25-us-008` (a separate filer who itemizes: SALT, charity in three limit categories and a carryover). The other 8 need investment interest (Form 4952), casualty losses (Form 4684), Form 8606, Schedule R, Forms 1098/1099-B/1099-R or premium tax credit on a separate return, among others.
- *Schedule A answers.* `deduction_override` "maximize_deduction" takes the larger (us-004 notes "standard" yet its expected return itemizes the larger amount); "force_itemized" elects to itemize a smaller amount. `mfs_deduction` "spouse_itemized" zeroes a separate filer's standard deduction. `scha_gft.qualifiedContrCash` stays out of scope: its label doesn't say which limit applies. Living apart or legal separation on a separate return is accepted only when the return has no Social Security benefits, IRA deduction, EIC or dependents. Line 5a takes W-2 box 17 only, so an itemizing case with local income tax (W-2 box 19) or 1099 state withholding is put out of scope (none of the federal cases has either).
- *Known difference.* In `ty25-us-006` the filer files separately with 6 months of self-only coverage while the spouse has a family HSA. Rule 1 of the 2025 Form 8889 line 3 instructions ("use the family coverage amount if you or your spouse had an HDHP with family coverage"), and 26 U.S.C. 223(b)(5), which takes marital status from section 7703 (so it reaches a separate filer living with the spouse), put the filer on the family amount, and line 6 splits it with the spouse. So line 3 is $4,275 and line 12 is $137, where the benchmark has $2,150 and $150. Lines 9, 11 and 13 and every 1040 line agree. Those five lines are listed in `KNOWN_DIFFERENCES` and printed as "disagrees with benchmark" rather than failing the case.

`FORMS_DIR`, `TEMPLATES_DIR`, and `OUTPUT_DIR` env vars override the default `forms/`, `templates/`, and `output/` directories for any command.

---

## Troubleshooting

**`Error: PDF not found: forms/fXXXX.pdf`**
Run `npm run download` first, or use `npm run dev` which runs all phases automatically.

**`Error: No template found for fXXXX`**
Run `npm run analyze` to generate templates, or use `npm run dev` which runs all phases.

**Form has only generic numbers, not realistic data**
Re-run `npm run analyze` to regenerate templates with the latest classifier. Templates generated before XFA extraction was added won't have `labelHint` values.

**IRS download returns 403 or empty file**
A small number of IRS forms are not available as standalone PDFs (embedded in instruction booklets or require online submission). These are marked `pdfAvailable: false` in `src/registry/forms.ts` and skipped automatically.

**Calculated fields show wrong values**
Re-run `npm run analyze` to regenerate templates with the latest formula parser. Templates without `formula` or `lineNumber` fields will use faker for all values.

**Downloaded PDFs look correct but fields aren't filled**
Some IRS forms are XFA-only (no AcroForm layer). pdf-lib cannot write to these. The analyzer will report 0 fields and the filler will skip them.

**Container won't start**
Make sure Docker Desktop is running. On Apple Silicon, ensure the Docker image supports `linux/arm64` (the devcontainer Dockerfile uses `node:20-bookworm` which does).
