/**
 * documentsFor — how many copies of a form a household produces, and the
 * taxpayer "view" each copy is filled from.
 *
 *   fw2       one per W-2 on the return; a spouse W-2 carries the spouse's name/SSN
 *   f1099int  one per interest payer (none → no document)
 *   f1099div  one per dividend payer (none → no document)
 *   others    one, filled from the household
 *
 * Shared by runBatch and the validator so both check the same documents.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
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

export function documentsFor(formId: string, t: FakeTaxpayer): DocumentSpec[] {
  switch (formId) {
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
