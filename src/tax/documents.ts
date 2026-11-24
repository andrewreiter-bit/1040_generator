/**
 * documentsFor — how many copies of a form a household produces, and the
 * taxpayer "view" each copy is filled from.
 *
 *   fw2       one per W-2 on the return; a spouse W-2 carries the spouse's name/SSN
 *   f1099int  one per interest payer (none → no document)
 *   f1099div  one per dividend payer (none → no document)
 *   f1040sc   one per business on the return (view.document.scheduleCIndex)
 *   f1040sse  one per person who owes SE tax (view.document.person)
 *   f1040s1 / s2 / s3 / f8995 / f8959 / f8960   one when the return needs it, otherwise none
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
  if (r.schedule1.required) out.push("f1040s1");
  if (r.schedule2.required) out.push("f1040s2");
  if (r.schedule3.required) out.push("f1040s3");
  if (r.scheduleC.length) out.push("f1040sc");
  if (r.scheduleSE.some((s) => !s.belowMinimum)) out.push("f1040sse");
  if (r.form8995 && !r.form8995.overThreshold) out.push("f8995");
  if (r.form8959.required) out.push("f8959");
  if (r.form8960.tax > 0) out.push("f8960");
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
    case "f8995":   return single(formId, t, "Form 8995");
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
