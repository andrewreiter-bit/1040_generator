/**
 * documentsFor — how many copies of a form a household produces, and the
 * taxpayer "view" each copy is filled from.
 *
 *   fw2       one per W-2 on the return; a spouse W-2 carries the spouse's name/SSN
 *   f1099int  one per interest payer (none → no document)
 *   f1099div  one per dividend payer (none → no document)
 *   f1040sc   one per business on the return (view.document.scheduleCIndex)
 *   f1040sse  one per person who owes SE tax (view.document.person)
 *   f1040s1 / s2 / s3 / sa / sd / se / f8995 / f8959 / f8960   one when the return needs it, otherwise none
 *   f1099b    one per sale reported on a 1099-B (Form 8949 box A/B/D/E)
 *   f1099r    one per pension / IRA distribution on the return (view.document.retirementIndex)
 *   f8949     one per copy needed (one short-term and one long-term box per copy, 11 rows each)
 *   others    one, filled from the household
 *
 * A schedule the return needs but whose year has no field map (the PDF in that
 * year's folder is the wrong revision) produces no document; `scheduleGaps`
 * reports those so the validator can fail them instead of shipping a blank form.
 *
 * Shared by runBatch and the validator so both check the same documents.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { getFieldMap } from "../fieldmaps";
import { form8949Copies } from "../fieldmaps/capital";
import { reportedSales } from "../fieldmaps/f1099b";
import { students1098T } from "../fieldmaps/education";
import { includedIsoExercises } from "../fieldmaps/amt";
import { hsaDistributionPeople } from "../fieldmaps/hsa";
import { computeReturn } from "./compute";
import { includedW2s } from "./household";

export interface DocumentSpec {
  /** 1-based index among this form's documents. */
  index: number;
  /** How many documents of this form the household has. */
  count: number;
  /** Short description for logs, e.g. "W-2 #2 (spouse, Graham - Hermiston)". */
  label: string;
  /** Taxpayer as seen by this one document. */
  view: FakeTaxpayer;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Supporting schedules computeReturn says this return needs. */
export function neededSchedules(t: FakeTaxpayer): string[] {
  const r = computeReturn(t);
  const out: string[] = [];
  if (r.itemizes && r.scheduleA) out.push("f1040sa");
  if (r.scheduleE) out.push("f1040se");
  if (r.form8582?.required) out.push("f8582");
  if (r.capital.scheduleD) out.push("f1040sd");
  if (r.capital.rows.some((x) => !x.directToScheduleD)) out.push("f8949");
  if (r.schedule1.required) out.push("f1040s1");
  if (r.additionalDeductions > 0) out.push("f1040s1a");
  if (r.schedule2.required) out.push("f1040s2");
  if (r.schedule3.required) out.push("f1040s3");
  if (r.form8880) out.push("f8880");
  if (r.form2441) out.push("f2441");
  if (r.form8863) out.push("f8863");
  if (r.form8962) out.push("f8962");
  if (r.schedule1.hsa?.forms.length) out.push("f8889");
  if (r.form4952?.required) out.push("f4952");
  // Form 6251 is attached when line 7 is more than line 10 (i.e. AMT is owed; no AMT foreign tax credit).
  if (r.form6251.line7 > r.form6251.line10) out.push("f6251");
  if (r.scheduleC.length) out.push("f1040sc");
  if (r.scheduleSE.some((s) => !s.belowMinimum)) out.push("f1040sse");
  if (r.form8995 && !r.form8995.overThreshold) out.push("f8995");
  if (r.form8995A) out.push("f8995a");
  if (r.form8995A?.scheduleANeeded) out.push("f8995aa");
  if (r.form8995A?.scheduleC) out.push("f8995ac");
  if (r.form8959.required) out.push("f8959");
  if (r.form8960.tax > 0) out.push("f8960");
  // Schedule 8812 backs line 19 and line 28; Schedule EIC lists the children behind line 27.
  if (r.schedule8812.required) out.push("f1040s8");
  if (r.earnedIncomeCredit > 0 && r.eic.qualifyingChildren > 0) out.push("f1040sei");
  return out;
}

/** Needed schedules with no field map for the tax year (so no document is produced). */
export function scheduleGaps(t: FakeTaxpayer): string[] {
  return neededSchedules(t).filter((f) => !getFieldMap(f, t.taxYear));
}

const single = (formId: string, t: FakeTaxpayer, label: string): DocumentSpec[] =>
  neededSchedules(t).includes(formId) && getFieldMap(formId, t.taxYear)
    ? [{ index: 1, count: 1, label, view: { ...t, document: { source: t } } }]
    : [];

export function documentsFor(formId: string, t: FakeTaxpayer): DocumentSpec[] {
  switch (formId) {
    case "f1040s1": return single(formId, t, "Schedule 1");
    case "f1040s2": return single(formId, t, "Schedule 2");
    case "f1040s3": return single(formId, t, "Schedule 3");
    case "f1040s1a": return single(formId, t, "Schedule 1-A");
    case "f8995":   return single(formId, t, "Form 8995");
    case "f8995a":  return single(formId, t, "Form 8995-A");
    case "f8995aa": return single(formId, t, "Schedule A (Form 8995-A)");
    case "f8995ac": return single(formId, t, "Schedule C (Form 8995-A)");
    case "f1040sd": return single(formId, t, "Schedule D");
    case "f1040sa": return single(formId, t, "Schedule A");
    case "f1040se": return single(formId, t, "Schedule E");
    case "f8582":   return single(formId, t, "Form 8582");
    case "f8880":   return single(formId, t, "Form 8880");
    case "f2441":   return single(formId, t, "Form 2441");
    case "f8962":   return single(formId, t, "Form 8962");
    case "f6251":   return single(formId, t, "Form 6251");
    case "f4952":   return single(formId, t, "Form 4952");
    case "f8889": {
      const fs = computeReturn(t).schedule1.hsa?.forms ?? [];
      if (!getFieldMap("f8889", t.taxYear)) return [];
      return fs.map((f, i) => ({ index: i + 1, count: fs.length, label: `Form 8889 #${i + 1} (${f.person})`, view: { ...t, document: { source: t, hsaPerson: f.person } } }));
    }
    case "f1099sa": {
      if (!getFieldMap("f1099sa", t.taxYear)) return [];
      const ps = hsaDistributionPeople(t);
      return ps.map((p, i) => ({ index: i + 1, count: ps.length, label: `1099-SA #${i + 1} (${p})`, view: { ...t, document: { source: t, hsaPerson: p } } }));
    }
    case "f3921": {
      if (!getFieldMap("f3921", t.taxYear)) return [];
      const xs = includedIsoExercises(t);
      return xs.map((x, i) => ({
        index: i + 1, count: xs.length, label: `3921 #${i + 1} (${x.corporation.name})`,
        view: { ...t, document: { source: t, isoIndex: i } },
      }));
    }
    case "f1095a": {
      if (!getFieldMap("f1095a", t.taxYear)) return [];
      const ps = t.marketplace1095As ?? [];
      return ps.map((p, i) => ({
        index: i + 1, count: ps.length, label: `1095-A #${i + 1} (${p.issuer})`,
        view: { ...t, document: { source: t, policyIndex: i } },
      }));
    }
    case "f8863": {
      // One Form 8863 per student (page 1 is filled on the first only).
      const f = computeReturn(t).form8863;
      if (!f || !getFieldMap("f8863", t.taxYear)) return [];
      return f.students.map((s, i) => ({
        index: i + 1, count: f.students.length, label: `Form 8863 #${i + 1} (student ${s.index + 1}${s.aotc ? ", AOTC" : ", LLC"})`,
        view: { ...t, document: { source: t, educationIndex: s.index } },
      }));
    }
    case "f1098t": {
      if (!getFieldMap("f1098t", t.taxYear)) return [];
      const idx = students1098T(t);
      return idx.map((e, i) => ({
        index: i + 1, count: idx.length, label: `1098-T #${i + 1} (${t.education!.students[e].institution.name})`,
        view: { ...t, document: { source: t, educationIndex: e } },
      }));
    }
    case "f1099b": {
      if (!getFieldMap("f1099b", t.taxYear)) return [];
      const sales = reportedSales(t);
      return sales.map((r, i) => ({
        index: i + 1,
        count: sales.length,
        label: `1099-B #${i + 1} (${r.sale.brokerName}, box ${r.box})`,
        view: { ...t, document: { source: t, saleIndex: i } },
      }));
    }
    case "f1099r": {
      if (!getFieldMap("f1099r", t.taxYear)) return [];
      const rs = computeReturn(t).retirement.records;
      return rs.map((x, i) => ({
        index: i + 1,
        count: rs.length,
        label: `1099-R #${i + 1} (${x.r.recipient ?? "primary"}, code ${x.r.distributionCode}${x.r.iraSepSimple ? ", IRA" : ""})`,
        view: { ...t, document: { source: t, retirementIndex: i } },
      }));
    }
    case "f1040s8": return single(formId, t, "Schedule 8812");
    case "f1040sei": return single(formId, t, "Schedule EIC");
    case "f8949": {
      if (!neededSchedules(t).includes("f8949") || !getFieldMap("f8949", t.taxYear)) return [];
      const copies = form8949Copies(t);
      return copies.map((c, i) => ({
        index: i + 1,
        count: copies.length,
        label: `Form 8949 #${i + 1} (${[c.short?.box, c.long?.box].filter(Boolean).join("/")})`,
        view: { ...t, document: { source: t, form8949Copy: i } },
      }));
    }
    case "f8959":   return single(formId, t, "Form 8959");
    case "f8960":   return single(formId, t, "Form 8960");
    case "f1040sc": {
      const cs = computeReturn(t).scheduleC;
      return cs.map((c, i) => ({
        index: i + 1,
        count: cs.length,
        label: `Schedule C #${i + 1} (${c.owner}, ${c.business.businessName || c.business.principalBusiness})`,
        view: { ...t, document: { source: t, scheduleCIndex: i } },
      }));
    }
    case "f1040sse": {
      const ses = computeReturn(t).scheduleSE.filter((s) => !s.belowMinimum);
      return ses.map((s, i) => ({
        index: i + 1,
        count: ses.length,
        label: `Schedule SE #${i + 1} (${s.owner})`,
        view: { ...t, document: { source: t, person: s.owner } },
      }));
    }
    case "fw2": {
      const w2s = includedW2s(t);
      return w2s.map((w, i) => {
        const isSpouse = w.employee === "spouse";
        const identity = isSpouse
          ? {
              firstName: t.spouseFirstName ?? "",
              middleInitial: "",
              lastName: t.spouseLastName ?? t.lastName,
              ssn: t.spouseSSN ?? "",
            }
          : {};
        return {
          index: i + 1,
          count: w2s.length,
          label: `W-2 #${i + 1} (${isSpouse ? "spouse" : "primary"}, ${w.employerName})`,
          view: { ...t, ...identity, w2Records: [w], totalWages: round2(w.wages) },
        };
      });
    }
    case "f1099int":
      return t.interest1099s.map((p, i, all) => ({
        index: i + 1,
        count: all.length,
        label: `1099-INT #${i + 1} (${p.payerName})`,
        view: { ...t, interest1099s: [p], totalInterest: round2(p.interestIncome) },
      }));
    case "f1099div":
      return t.dividend1099s.map((p, i, all) => ({
        index: i + 1,
        count: all.length,
        label: `1099-DIV #${i + 1} (${p.payerName})`,
        view: {
          ...t,
          dividend1099s: [p],
          totalDividends: round2(p.ordinaryDividends),
          totalQualifiedDividends: round2(p.qualifiedDividends),
        },
      }));
    default:
      return [{ index: 1, count: 1, label: formId, view: t }];
  }
}
