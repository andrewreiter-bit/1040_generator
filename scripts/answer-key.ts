#!/usr/bin/env ts-node
/**
 * scripts/answer-key.ts — score computeReturn against TaxCalcBench's hand-built
 * federal answer keys (github.com/column-tax/tax-calc-bench): TY24, and TY25's federal
 * cases (ty25-us-*, whose W-2s and 1099s are PDFs read with scripts/pdf-fill-text.py, which
 * needs python3 with pypdf).
 *
 * The dataset is NOT vendored here (it is evaluation-only data; see
 * src/answerkey/taxcalcbench.ts). Point the script at a local clone:
 *
 *   git clone --depth 1 https://github.com/column-tax/tax-calc-bench.git ../tax-calc-bench
 *   npm run answer-key -- --bench-dir ../tax-calc-bench
 *   TAXCALCBENCH_DIR=../tax-calc-bench npm run answer-key -- --case single-w2-minimal-wages-alaska --verbose
 *
 * Scoring mirrors TaxCalcBench: 19 Form 1040 lines, "strict" = whole-dollar
 * match on every line, "lenient" = every line within ±$5. A few supporting-form
 * lines the 1040 can't see into (Form 8889) count too, except where the engine
 * follows the IRS instructions and the benchmark doesn't (KNOWN_DIFFERENCES).
 * Cases whose inputs use anything our model can't represent are listed as out of scope.
 */
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { computeReturn } from "../src/tax/compute";
import {
  CHECKED_FORM_LINES, DETAIL_LINES, KNOWN_BAD_CASES, KNOWN_DIFFERENCES, SCORED_LINES, expectedAmount, expectedAmounts,
  loadTy24Cases, loadTy25Cases, toTaxpayer,
} from "../src/answerkey/taxcalcbench";

const program = new Command();
program
  .option("-b, --bench-dir <dir>", "Local clone of column-tax/tax-calc-bench (or set TAXCALCBENCH_DIR)")
  .option("-c, --case <name>", "Only run cases whose name contains this text")
  .option("-v, --verbose", "Print every scored line for in-scope cases")
  .option("-y, --year <year>", "2024, 2025 or all", "all")
  .option("--json <file>", "Write per-case results to a JSON file")
  .parse(process.argv);
const opts = program.opts();

interface CaseResult {
  name: string;
  status: "pass" | "lenient" | "fail" | "out-of-scope" | "known-bad";
  reasons: string[];
  lines: Array<{ line: string; expected: number; actual: number; diff: number }>;
}

(async () => {
  const benchDir = opts.benchDir ?? process.env.TAXCALCBENCH_DIR;
  if (!benchDir) {
    console.error(chalk.red("Set --bench-dir or TAXCALCBENCH_DIR to a local clone of github.com/column-tax/tax-calc-bench"));
    process.exit(2);
  }
  const years = opts.year === "all" ? [2024, 2025] : [Number(opts.year)];
  let anyFail = false;
  const allResults: Array<CaseResult & { year: number }> = [];
  for (const year of years) {
    let cases: ReturnType<typeof loadTy24Cases>;
    try {
      cases = (year === 2024 ? loadTy24Cases : loadTy25Cases)(path.resolve(benchDir)).filter((c) => !opts.case || c.name.includes(opts.case));
    } catch (err) {
      // TY25 reads its PDFs with python3 + pypdf; without them, still score the other year.
      if (year !== 2025 || opts.year === "2025") throw err;
      console.log(chalk.yellow(`\n── TY25 skipped: ${String((err as Error).message).split("\n")[0]} (needs python3 with pypdf)`));
      continue;
    }
    const results = runYear(cases, year);
    anyFail ||= results.some((r) => r.status === "fail");
    allResults.push(...results.map((r) => ({ ...r, year })));
  }
  if (opts.json) await fs.writeJson(path.resolve(opts.json), allResults, { spaces: 1 });
  process.exit(anyFail ? 1 : 0);
})().catch((err) => {
  console.error(chalk.red(err.stack ?? String(err)));
  process.exit(2);
});

function runYear(cases: ReturnType<typeof loadTy24Cases>, year: number): CaseResult[] {
  const results: CaseResult[] = [];
  console.log(chalk.bold(`\n── TY${year % 100} ──`));
  for (const c of cases) {
    const { taxpayer, outOfScope, postChecks } = toTaxpayer(c.input, year);
    const r = taxpayer ? computeReturn(taxpayer) : undefined;
    const post = r ? postChecks.map((f) => f(r)).filter((x): x is string => !!x) : [];
    const reasons = [...outOfScope, ...post, ...(r?.unsupported ?? [])];
    const lines = r
      ? SCORED_LINES.map((s) => {
          const expected = expectedAmount(c.expectedXml, s.element);
          const actual = Math.round(s.pick(r) + 1e-6);
          return { line: s.line, expected, actual, diff: actual - expected };
        })
      : [];
    // Supporting-form lines that count (Form 8889), unless listed as a known difference.
    const disagreements: string[] = [];
    if (r) {
      for (const d of CHECKED_FORM_LINES) {
        const exp = expectedAmounts(c.expectedXml, d.form, d.element);
        const got = d.pick(r).map((x) => Math.round(x + 1e-6));
        if (!exp.length && !got.length) continue;
        const n = Math.max(exp.length, got.length);
        for (let i = 0; i < n; i++) {
          const e = exp[i] ?? 0, a = got[i] ?? 0;
          const known = KNOWN_DIFFERENCES[c.name]?.[d.label];
          if (known && e !== a) { disagreements.push(`${d.label}: expected ${e}, got ${a}`); continue; }
          lines.push({ line: d.label, expected: e, actual: a, diff: a - e });
        }
      }
    }

    let status: CaseResult["status"];
    if (KNOWN_BAD_CASES[c.name]) { status = "known-bad"; reasons.unshift(KNOWN_BAD_CASES[c.name]); }
    else if (reasons.length) status = "out-of-scope";
    else if (lines.every((l) => l.diff === 0)) status = "pass";
    else if (lines.every((l) => Math.abs(l.diff) <= 5)) status = "lenient";
    else status = "fail";
    results.push({ name: c.name, status, reasons, lines });

    const mark = { pass: chalk.green("✓"), lenient: chalk.yellow("≈"), fail: chalk.red("✗"), "out-of-scope": chalk.gray("–"), "known-bad": chalk.gray("!") }[status];
    console.log(`${mark} ${c.name}`);
    if (status === "out-of-scope" || status === "known-bad") {
      console.log(chalk.gray(`    ${reasons.slice(0, 4).join("; ")}${reasons.length > 4 ? ` (+${reasons.length - 4} more)` : ""}`));
    }
    if (status === "fail" || status === "lenient" || (opts.verbose && status !== "out-of-scope")) {
      for (const l of lines) {
        if (l.diff === 0 && !opts.verbose) continue;
        const color = l.diff === 0 ? chalk.gray : Math.abs(l.diff) <= 5 ? chalk.yellow : chalk.red;
        console.log(color(`    line ${l.line.padEnd(7)} expected ${String(l.expected).padStart(9)}  got ${String(l.actual).padStart(9)}  (${l.diff >= 0 ? "+" : ""}${l.diff})`));
      }
    }
    if (disagreements.length && status !== "out-of-scope" && status !== "known-bad") {
      console.log(chalk.cyan(`    disagrees with benchmark (IRS rule followed): ${disagreements.join("; ")}`));
      const why = [...new Set(Object.values(KNOWN_DIFFERENCES[c.name] ?? {}))];
      why.forEach((w) => console.log(chalk.gray(`      ${w}`)));
    }
    // Supporting forms: where a 1040 difference starts (shown for mismatches, and with --verbose).
    if (r && (status === "fail" || status === "lenient" || (opts.verbose && status !== "known-bad"))) {
      for (const d of DETAIL_LINES) {
        const exp = expectedAmounts(c.expectedXml, d.form, d.element);
        let got = d.pick(r).map((x) => Math.round(x + 1e-6));
        // A form block without the element reads as 0; nothing computed means 0 too.
        if (!got.length && exp.every((x) => x === 0)) got = exp.map(() => 0);
        if (!exp.length && got.every((x) => x === 0)) continue;
        const same = exp.length === got.length && exp.every((e, i) => e === got[i]);
        if (same && !opts.verbose) continue;
        const color = same ? chalk.gray : chalk.red;
        console.log(color(`    ${d.label.padEnd(9)} expected [${exp.join(", ")}]  got [${got.join(", ")}]`));
      }
    }
  }

  const count = (s: CaseResult["status"]) => results.filter((r) => r.status === s).length;
  const inScope = count("pass") + count("lenient") + count("fail");
  console.log(chalk.bold(`\nTY${year % 100} answer key: ${results.length} cases — ${inScope} in scope`));
  console.log(`  ${chalk.green("✓ strict match")}   ${count("pass")}/${inScope}`);
  console.log(`  ${chalk.yellow("≈ within ±$5")}    ${count("lenient")}/${inScope}`);
  console.log(`  ${chalk.red("✗ mismatch")}       ${count("fail")}/${inScope}`);
  console.log(chalk.gray(`  – out of scope ${count("out-of-scope")}, ! known dataset issues ${count("known-bad")}`));

  // What would bring the most cases into scope
  const blockers = new Map<string, number>();
  for (const r of results.filter((x) => x.status === "out-of-scope")) {
    // Group input paths by form ("irs1040_schedulec[]"), but keep 1040 questions individually
    // ("irs1040.tp_blind") since each is a separate feature.
    const seen = new Set(r.reasons.map((x) =>
      /^irs1040\./.test(x) ? x.replace(/\[\]\.[^.]+$/, "[]") : x.replace(/\[\]\.[^.]+$/, "[]").replace(/^(\w+)\..*$/, "$1")));
    seen.forEach((b) => blockers.set(b, (blockers.get(b) ?? 0) + 1));
  }
  console.log(chalk.bold("\nMost common reasons a case is out of scope:"));
  [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([b, n]) => console.log(`  ${String(n).padStart(3)}  ${b}`));
  return results;
}
