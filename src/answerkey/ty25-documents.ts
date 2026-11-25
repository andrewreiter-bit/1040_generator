/**
 * TaxCalcBench TY25 source documents → the TY24-style answers `toTaxpayer` reads.
 *
 * TY25 cases give the W-2s and 1099s as flattened PDFs and only the other answers as JSON
 * (`remaining_data.json`, the same layout as TY24's input.json). `scripts/pdf-fill-text.py`
 * returns each typed-in value with its position plus the form's printed box numbers; a value
 * belongs to the nearest box number above it in its column. The documents read here become the
 * answers TY24 would have had (`w2[]`, `irs1040_scheduleb.irs1099_int[]` …), so every
 * scope rule in taxcalcbench.ts applies unchanged. A non-zero box that isn't modelled, and any
 * document type not read here, is added as its own answer path so the case reports it as out
 * of scope rather than silently dropping it.
 *
 * DATA USE: evaluation only (see taxcalcbench.ts). Documents are read at run time from the
 * local clone; nothing is cached or copied into this repo.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

interface Run { page: number; x: number; y: number; lines: string[] }
interface Label { page: number; x: number; y: number; text: string }

const HELPER = path.resolve(__dirname, "../../scripts/pdf-fill-text.py");

function readPdf(file: string): { values: Run[]; labels: Label[] } {
  return JSON.parse(execFileSync("python3", ["-I", HELPER, file], { encoding: "utf8", maxBuffer: 16 << 20 }));
}

// Box numbers with a letter: up to 1h (1099-B uses 1a–1g; W-2 12a–12d).
const BOX = /^(\d{1,2}[a-h]?)\b/;

/** Boxes where more than one amount landed (a misread layout); collected per case. */
let ambiguousBoxes: string[] = [];

/** Box number → the values under it (by position: nearest box number above, in the same column). */
function boxes(doc: { values: Run[]; labels: Label[] }): Map<string, Run[]> {
  const numbered = doc.labels.map((l) => ({ ...l, box: BOX.exec(l.text)?.[1] })).filter((l): l is Label & { box: string } => !!l.box);
  const out = new Map<string, Run[]>();
  for (const v of doc.values) {
    // The form's calendar-year entry ("2025") sits inside box 1's column on some layouts; amounts
    // of $1,000 or more are always printed with a comma, so a bare year is never an amount.
    if (/^20\d\d$/.test(v.lines[0] ?? "")) continue;
    // …and W-2G prints the year as a "20" label followed by the entered "25".
    if (doc.labels.some((l) => l.page === v.page && l.text === "20" && Math.abs(l.y - v.y) <= 1.5 && v.x > l.x && v.x - l.x <= 15)) continue;
    let best: (Label & { box: string }) | undefined;
    for (const l of numbered) {
      if (l.page !== v.page || l.y <= v.y || l.y - v.y > 40 || l.x > v.x + 8) continue;
      if (!best || l.y - v.y < best.y - v.y - 0.5 || (Math.abs(l.y - best.y) <= 0.5 && l.x > best.x)) best = l;
    }
    if (best) out.set(best.box, [...(out.get(best.box) ?? []), v]);
  }
  return out;
}

const money = (s: string | undefined): number => {
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s.trim()) || s.trim().startsWith("-");
  const n = Number(s.replace(/[$,()\s-]/g, ""));
  return isNaN(n) ? NaN : neg ? -n : n;
};
const leaf = (value: unknown) => ({ value });

/** A document's boxes, with helpers for amounts and for flagging boxes that aren't modelled. */
class Doc {
  readonly boxes: Map<string, Run[]>;
  constructor(readonly file: string, readonly raw: { values: Run[]; labels: Label[] }) { this.boxes = boxes(raw); }
  text(box: string, i = 0): string { return this.boxes.get(box)?.[i]?.lines.join(" ") ?? ""; }
  amount(box: string): number {
    const numeric = (this.boxes.get(box) ?? []).filter((r) => !isNaN(money(r.lines.join(" "))) && /\d/.test(r.lines.join("")));
    if (numeric.length > 1) ambiguousBoxes.push(`${path.basename(this.file)} box ${box}`);
    return money(this.text(box));
  }
  /** Box 12-style code/amount pairs: the alphabetic run is the code, the other the amount. */
  pairs(box: string): Array<{ code: string; amount: number }> {
    const runs = [...(this.boxes.get(box) ?? [])].sort((a, b) => a.x - b.x);
    const code = runs.find((r) => /^[A-Z]{1,2}$/.test(r.lines[0]));
    const amount = runs.find((r) => r !== code);
    return code ? [{ code: code.lines[0], amount: money(amount?.lines[0]) }] : [];
  }
  /** The first value with no box number above it whose position is (x, y) ± tolerance. */
  at(x: number, y: number, tol = 6): string {
    return this.raw.values.find((v) => Math.abs(v.x - x) <= tol && Math.abs(v.y - y) <= tol)?.lines.join(" ") ?? "";
  }
  /** Answer paths for non-zero boxes outside `modelled`, so the case reports them as out of scope. */
  unmodelled(prefix: string, modelled: string[]): Record<string, { value: unknown }> {
    const out: Record<string, { value: unknown }> = {};
    for (const [box, runs] of this.boxes) {
      if (modelled.includes(box)) continue;
      const text = runs.map((r) => r.lines.join(" ")).join(" ").trim();
      const n = money(text);
      if (text && !(n === 0)) out[`${prefix}_box_${box}`] = leaf(text);
    }
    return out;
  }
}

/** First names from the prior-year Form 1040 (the inputs carry no names or distinct SSNs). */
function priorYearNames(file: string | undefined): { tp: string; sp: string } {
  if (!file) return { tp: "", sp: "" };
  const raw = readPdf(file);
  const below = (re: RegExp) => {
    const l = raw.labels.find((x) => x.page === 0 && re.test(x.text));
    if (!l) return "";
    const v = raw.values.find((x) => x.page === 0 && x.y < l.y && l.y - x.y <= 20 && Math.abs(x.x - l.x) <= 10);
    return v?.lines[0] ?? "";
  };
  return { tp: below(/^Your first name/), sp: below(/^If joint return, spouse.s first name/) };
}

const sameName = (a: string, b: string) => !!a && !!b && a.trim().split(/\s+/)[0].toLowerCase() === b.trim().split(/\s+/)[0].toLowerCase();

/** Kinds read into answers; any other PDF makes the case out of scope. */
const READ_KINDS = new Set(["w2", "1099int", "1099div", "w2g", "1099nec", "1098", "1099b", "1040"]);

/**
 * Merge a TY25 case's source documents into its `remaining_data.json` answers, in TY24's layout.
 * `rd` is the case's `input.return_data` and is modified in place.
 */
export function mergeSourceDocuments(inputDir: string, rd: Record<string, unknown>): void {
  ambiguousBoxes = [];
  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".pdf")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const kindOf = (f: string) => f.replace(/\.pdf$/, "").replace(/_.*$/, "").replace(/^1040$/, "1040");
  const byKind = (k: string) => files.filter((f) => kindOf(f) === k).map((f) => path.join(inputDir, f));
  const unread = [...new Set(files.map(kindOf).filter((k) => !READ_KINDS.has(k)))];
  const extra: Record<string, { value: unknown }> = {};
  for (const k of unread) extra[`source_document_${k}`] = leaf(true);

  const f1040 = rd.irs1040 as Record<string, { value: unknown }> | undefined;
  const joint = f1040?.filing_status?.value === "married_jointly";
  const names = priorYearNames(byKind("1040")[0]);
  /** Whose document: on a joint return, by first name against the prior-year return. */
  const whose = (name: string, label: string): "taxpayer" | "spouse" => {
    if (!joint) return "taxpayer";
    if (sameName(name, names.sp) && !sameName(name, names.tp)) return "spouse";
    if (sameName(name, names.tp)) return "taxpayer";
    extra[`${label}_recipient_unmatched`] = leaf(name);
    return "taxpayer";
  };

  // W-2: boxes 1–6, 12 (code/amount), 13 checkboxes, 15–17. Box 14 is informational.
  const jsonW2s = Array.isArray(rd.w2) ? (rd.w2 as Array<Record<string, unknown>>) : [];
  rd.w2 = byKind("w2").map((file, i) => {
    const d = new Doc(file, readPdf(file));
    const box13 = (d.boxes.get("13") ?? []).filter((r) => /^x$/i.test(r.lines[0]));
    const captions = d.raw.labels.filter((l) => /^(Statutory|Retirement|Third-party)/.test(l.text));
    const checked = (re: RegExp) => box13.some((r) => {
      const nearest = [...captions].sort((a, b) => Math.abs(a.x - r.x) - Math.abs(b.x - r.x))[0];
      return !!nearest && re.test(nearest.text);
    });
    const employee = d.at(39.2, 592.2, 4);
    const w: Record<string, unknown> = {
      ...(jsonW2s[i] ?? {}),
      who_applies_to: leaf(whose(employee, "w2")),
      ein: leaf(d.at(39.2, 712.2, 4)),
      employer_name: leaf((d.raw.values.find((v) => Math.abs(v.x - 39.2) <= 4 && Math.abs(v.y - 687.8) <= 4)?.lines[0]) ?? ""),
      wages: leaf(d.amount("1")), withholding: leaf(d.amount("2")),
      social_security_wages: leaf(d.amount("3")), social_security_tax: leaf(d.amount("4")),
      medicare_wages_and_tips: leaf(d.amount("5")), medicare_tax_withheld: leaf(d.amount("6")),
      social_security_tips: leaf(d.amount("7")), allocated_tips: leaf(d.amount("8")),
      dependent_care_benefits: leaf(d.amount("10")), nonqualified_plan: leaf(d.amount("11")),
      statutory_employee: leaf(checked(/^Statutory/)), retirement_plan: leaf(checked(/^Retirement/)),
      third_party_sick_pay: leaf(checked(/^Third-party/)),
      employers_use_grp: ["12a", "12b", "12c", "12d"].flatMap((b) => d.pairs(b))
        .map((p) => ({ box_12_code: leaf(p.code), box_12_amount: leaf(p.amount) })),
      w2_state_local_tax_grp: d.text("15") || d.amount("16") || d.amount("17")
        ? [{ state: leaf(d.text("15").split(/\s+/)[0]), state_wages: leaf(d.amount("16")), state_income_tax: leaf(d.amount("17")) }]
        : [],
      ...d.unmodelled("w2", ["1", "2", "3", "4", "5", "6", "7", "8", "10", "11", "12a", "12b", "12c", "12d", "13", "14", "15", "16", "17", "18", "19", "20"]),
    };
    return w;
  });

  // 1099-INT and 1099-DIV: the JSON lists one entry per document (who it belongs to).
  const schB = (rd.irs1040_scheduleb ??= {}) as Record<string, unknown>;
  const mergeList = (key: string, kind: string, read: (d: Doc) => Record<string, unknown>) => {
    const json = Array.isArray(schB[key]) ? (schB[key] as Array<Record<string, unknown>>) : [];
    const docs = byKind(kind);
    if (json.length !== docs.length) extra[`${kind}_count_mismatch`] = leaf(`${docs.length} PDFs, ${json.length} answers`);
    schB[key] = docs.map((file, i) => ({ ...(json[i] ?? {}), ...read(new Doc(file, readPdf(file))) }));
  };
  mergeList("irs1099_int", "1099int", (d) => ({
    interest_1099int_payer: leaf(d.raw.values.find((v) => v.x < 100 && v.y > 700)?.lines[0] ?? ""),
    interest_1099int_interest: leaf(d.amount("1")),
    interest_1099int_early_withdrawal: leaf(d.amount("2")),
    interest_1099int_fed_inc_tax_withheld: leaf(d.amount("4")),
    ...d.unmodelled("interest_1099int", ["1", "2", "4", "14", "15", "16", "17"]),
  }));
  mergeList("irs1099_div", "1099div", (d) => ({
    dividend_1099div_payer: leaf(d.raw.values.find((v) => v.x < 100 && v.y > 700)?.lines[0] ?? ""),
    dividend_1099div_ordinary_div: leaf(d.amount("1a")),
    dividend_1099div_qualified_div: leaf(d.amount("1b")),
    dividend_1099div_capital_gain_distr: leaf(d.amount("2a")),
    dividend_1099div_nondividend_distributions: leaf(d.amount("3")),
    dividend_1099div_fed_wh: leaf(d.amount("4")),
    ...d.unmodelled("dividend_1099div", ["1a", "1b", "2a", "3", "4", "14", "15", "16"]),
  }));

  // W-2G: box 1 winnings, box 4 withholding; state boxes 13–15 are informational here.
  const jsonW2gs = Array.isArray(rd.wg2) ? (rd.wg2 as Array<Record<string, unknown>>) : [];
  rd.wg2 = byKind("w2g").map((file, i) => {
    const d = new Doc(file, readPdf(file));
    return {
      ...(jsonW2gs[i] ?? {}),
      w2g_who_applies_to: leaf(whose(d.at(53.6, 580.2, 4), "w2g")),
      w2g_payer: leaf(d.raw.values.find((v) => v.x < 100 && v.y > 720)?.lines[0] ?? ""),
      w2g_winnings: leaf(d.amount("1")),
      w2g_fed_wh: leaf(d.amount("4")),
      ...d.unmodelled("w2g", ["1", "2", "3", "4", "9", "13", "14", "15"]),
    };
  });

  // 1099-NEC: a Schedule C's receipts, when there is exactly one Schedule C to put it on.
  const necs = byKind("1099nec");
  if (necs.length) {
    const cs = Array.isArray(rd.irs1040_schedulec) ? (rd.irs1040_schedulec as Array<Record<string, unknown>>) : [];
    if (cs.length !== 1) extra.source_document_1099nec_without_one_schedule_c = leaf(true);
    else {
      cs[0].irs1099_nec = necs.map((file) => {
        const d = new Doc(file, readPdf(file));
        return {
          nec_payer_name: leaf(d.raw.values.find((v) => v.x < 100 && v.y > 715)?.lines[0] ?? ""),
          nec_comp: leaf(d.amount("1")), nec_fed_wh: leaf(d.amount("4")),
          ...d.unmodelled("nec", ["1", "4", "5", "6", "7"]),
        };
      });
    }
  }
  // Form 1098: box 1 interest and box 6 points (both Schedule A line 8a); box 2 outstanding
  // principal is kept for the § 163(h)(3) limit check; boxes 3, 7–9 and 11 are informational.
  rd.f1098 = byKind("1098").map((file) => {
    const d = new Doc(file, readPdf(file));
    return {
      mortgage_interest: leaf(d.amount("1")), outstanding_principal: leaf(d.amount("2")), points: leaf(d.amount("6")),
      ...d.unmodelled("f1098", ["1", "2", "3", "6", "7", "8", "9", "11"]),
    };
  });

  // 1099-B: one sale per form, filling the JSON's irs8949 transactions in order. The Form 8949
  // category letter printed at the top (A/B/C short-term, D/E/F long-term) gives the term and
  // whether basis was reported; box 2's checkbox is the fallback for the term.
  const sales = byKind("1099b");
  const groups = (rd.irs8949 as { irs1099_b_grp?: Array<Record<string, unknown>> } | undefined)?.irs1099_b_grp ?? [];
  const slots = groups.flatMap((g) => (Array.isArray(g.irs1099_b) ? (g.irs1099_b as Array<Record<string, unknown>>) : []).map((s) => ({ g, s })));
  if (sales.length && slots.length !== sales.length) extra.source_document_1099b_count_mismatch = leaf(`${sales.length} PDFs, ${slots.length} answers`);
  else sales.forEach((file, i) => {
    const d = new Doc(file, readPdf(file));
    const { g, s } = slots[i];
    const letter = d.at(297.4, 736.8, 4).trim().toUpperCase();
    const box2 = (d.boxes.get("2") ?? []).find((r) => /^x$/i.test(r.lines[0]));
    const captions = d.raw.labels.filter((l) => /^(Short-term|Long-term|Ordinary)/.test(l.text));
    const term = box2 ? [...captions].sort((a, b) => Math.abs(a.y - box2.y) - Math.abs(b.y - box2.y))[0]?.text ?? "" : "";
    // The holding period decides the term (§ 1222: more than one year is long-term). Some forms
    // print a category or box 2 that contradicts their own dates (us-007's "abc stock", bought and
    // sold in 2025, is marked "D"); the expected returns follow the dates, so the printed term is
    // only a fallback when a date is missing or "VARIOUS".
    const acquired = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.text("1b").trim());
    const sold = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.text("1c").trim());
    const byDates = acquired && sold
      ? new Date(+sold[3], +sold[1] - 1, +sold[2]) > new Date(+acquired[3] + 1, +acquired[1] - 1, +acquired[2])
      : undefined;
    const long = byDates ?? (/^[DEF]$/.test(letter) || (!letter && /^Long-term/.test(term)));
    if (/^Ordinary/.test(term)) extra.source_document_1099b_ordinary = leaf(true);
    const code = { A: "basis_reported", D: "basis_reported", B: "basis_not_reported", E: "basis_not_reported", C: "not_received", F: "not_received" }[letter] ?? "";
    const iso = (us: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us.trim()); return m ? `${m[3]}-${m[1]}-${m[2]}` : us.trim(); };
    g.payer_name ??= leaf(d.raw.values.find((v) => v.x < 100 && v.y > 715)?.lines[0] ?? "");
    Object.assign(s, {
      desc_of_prop: leaf(d.text("1a")), acquired_dt: leaf(iso(d.text("1b"))), sold_disposed_dt: leaf(iso(d.text("1c"))),
      proceeds: leaf(d.amount("1d")), cost_basis: leaf(d.amount("1e")),
      accrued_market_discount: leaf(d.amount("1f")), wash_sale_loss: leaf(d.amount("1g")),
      fed_inc_tax_wh: leaf(d.amount("4")),
      input_irs8949_code: leaf(code), input_sale_term: leaf(long ? "long_term" : "short_term"),
      ...d.unmodelled("b1099", ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "2", "4", "12", "14", "15", "16"]),
    });
  });

  // State and local income tax the reader doesn't place: W-2 box 19 and 1099 state withholding
  // (1099-INT box 17, 1099-DIV box 16, 1099-NEC box 5). Schedule A line 5a needs them, so an
  // itemizing case with any is put out of scope (taxcalcbench.ts).
  const otherStateLocal = [
    ...byKind("w2").map((f) => new Doc(f, readPdf(f)).amount("19")),
    ...byKind("1099int").map((f) => new Doc(f, readPdf(f)).amount("17")),
    ...byKind("1099div").map((f) => new Doc(f, readPdf(f)).amount("16")),
    ...byKind("1099nec").map((f) => new Doc(f, readPdf(f)).amount("5")),
  ].filter((n) => n > 0).reduce((a, n) => a + n, 0);
  if (otherStateLocal) extra.ty25_unplaced_state_local_income_tax = leaf(otherStateLocal);
  if (ambiguousBoxes.length) extra.source_document_ambiguous_box = leaf([...new Set(ambiguousBoxes)].join(", "));
  Object.assign(rd, extra);
}
