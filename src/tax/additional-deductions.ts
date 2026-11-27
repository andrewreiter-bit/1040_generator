/**
 * Schedule 1-A (Form 1040) Parts II–IV, tax years 2025–2028 (Public Law 119-21; 2025 Schedule 1-A and
 * its instructions in the 2025 Form 1040 instructions). Each part's deduction is below the line
 * (Form 1040 line 13b for 2025, 13a for 2026), allowed whether or not the filer itemizes.
 *
 * Part II, qualified tips (§ 224). Employee tips: the W-2 box 7 Social Security tips of a W-2 in a
 * tipped occupation (2025 method 1; one employer → line 4a, more than one → the Qualified Tips From
 * More Than One Employer Worksheet total on line 4c). No Form 4137 (line 4b) or self-employed tips
 * (line 5). Line 7: at most $25,000 per return, even on a joint return. Lines 8–13: less $100 for each
 * full $1,000 of MAGI over $150,000 ($300,000 joint).
 *
 * Part III, qualified overtime compensation (§ 225): the FLSA premium in W-2 box 1 (line 14a); no
 * 1099 overtime (14b). Line 15: at most $12,500 ($25,000 joint); lines 16–21 phase out like tips.
 *
 * Tips and overtime need the recipient's SSN, and a married filer must file jointly.
 *
 * Part IV, qualified passenger vehicle loan interest (§ 163(h)(4)): interest on a loan originated
 * after 2024 for a new, U.S.-assembled vehicle for personal use, secured by a first lien. Line 22
 * column (iii) is the interest less any part deducted elsewhere. Line 24: at most $10,000. Lines
 * 25–30: less $200 for each $1,000 of MAGI, or part of $1,000, over $100,000 ($200,000 joint).
 * No joint-return requirement.
 */
import { FakeTaxpayer, VehicleLoan } from "../faker/taxpayer";
import { includedW2s } from "./household";
import { Rounder, sumWith } from "./rounding";

export const ADDITIONAL_DEDUCTIONS = {
  firstYear: 2025, lastYear: 2028,
  tips: { cap: 25000, threshold: { joint: 300000, other: 150000 }, perThousand: 100 },
  overtime: { cap: { joint: 25000, other: 12500 }, threshold: { joint: 300000, other: 150000 }, perThousand: 100 },
  carLoan: { cap: 10000, threshold: { joint: 200000, other: 100000 }, perThousand: 200 },
};

export interface Schedule1APartsIIToIV {
  tips?: { line4a: number; line4b: number; line4c: number; line5: number; line6: number; line7: number; line8: number; line9: number; line10: number; line11: number; line12: number; line13: number; employers: number };
  overtime?: { line14a: number; line14b: number; line14c: number; line15: number; line16: number; line17: number; line18: number; line19: number; line20: number; line21: number };
  carLoan?: { rows: Array<{ vin: string; deductedElsewhere: number; schedule1A: number }>; line23: number; line24: number; line25: number; line26: number; line27: number; line28: number; line29: number; line30: number };
}

/** Qualified passenger vehicle loan interest (§ 163(h)(4)(B)) for this loan. */
export function qualifiedVehicleLoan(loan: VehicleLoan): boolean {
  const year = Number(loan.originated.split("/")[2]);
  return year >= 2025 && loan.newVehicle && loan.usAssembly && loan.personalUse && loan.firstLien;
}

/** Lines 10–13 (or 18–21, 27–30): the deduction after the MAGI reduction. */
function phaseOut(allowed: number, magi: number, threshold: number, perThousand: number, roundUp: boolean) {
  const over = Math.max(0, magi - threshold);
  const thousands = over > 0 ? (roundUp ? Math.ceil(over / 1000) : Math.floor(over / 1000)) : 0;
  const reduction = thousands * perThousand;
  return { over, thousands, reduction, deduction: over > 0 ? Math.max(0, allowed - reduction) : allowed };
}

export function schedule1APartsIIToIV(t: FakeTaxpayer, magi: number, R: Rounder): Schedule1APartsIIToIV {
  const c = ADDITIONAL_DEDUCTIONS;
  if (t.taxYear < c.firstYear || t.taxYear > c.lastYear) return {};
  const sum = (xs: number[]) => sumWith(R, xs);
  const joint = t.filingStatus === "MFJ";
  // Tips and overtime: a married filer must file jointly, and the recipient needs an SSN.
  const married = joint || t.filingStatus === "MFS";
  const w2s = includedW2s(t).filter((w) => (w.employee === "spouse" ? !!t.spouseSSN : !!t.ssn));
  const out: Schedule1APartsIIToIV = {};

  const tipped = w2s.filter((w) => w.tippedOccupation && (w.socialSecurityTips ?? 0) > 0);
  if (tipped.length && (!married || joint)) {
    const total = sum(tipped.map((w) => w.socialSecurityTips ?? 0));
    const one = tipped.length === 1;
    const line4a = one ? total : 0, line4b = 0, line4c = total, line5 = 0;
    const line6 = sum([line4c, line5]);
    const line7 = Math.min(line6, c.tips.cap);
    const line9 = joint ? c.tips.threshold.joint : c.tips.threshold.other;
    const p = phaseOut(line7, magi, line9, c.tips.perThousand, false);
    out.tips = { line4a, line4b, line4c, line5, line6, line7, line8: magi, line9, line10: R(p.over), line11: p.thousands, line12: p.reduction, line13: R(p.deduction), employers: tipped.length };
  }

  const overtime = w2s.filter((w) => (w.qualifiedOvertime ?? 0) > 0);
  if (overtime.length && (!married || joint)) {
    const line14a = sum(overtime.map((w) => w.qualifiedOvertime ?? 0)), line14b = 0;
    const line14c = sum([line14a, line14b]);
    const line15 = Math.min(line14c, joint ? c.overtime.cap.joint : c.overtime.cap.other);
    const line17 = joint ? c.overtime.threshold.joint : c.overtime.threshold.other;
    const p = phaseOut(line15, magi, line17, c.overtime.perThousand, false);
    out.overtime = { line14a, line14b, line14c, line15, line16: magi, line17, line18: R(p.over), line19: p.thousands, line20: p.reduction, line21: R(p.deduction) };
  }

  const loans = (t.vehicleLoans ?? []).filter(qualifiedVehicleLoan);
  if (loans.length) {
    const rows = loans.map((l) => ({ vin: l.vin, deductedElsewhere: R(l.deductedElsewhere ?? 0), schedule1A: Math.max(0, R(l.interestPaid - (l.deductedElsewhere ?? 0))) }));
    const line23 = sum(rows.map((r) => r.schedule1A));
    const line24 = Math.min(line23, c.carLoan.cap);
    const line26 = joint ? c.carLoan.threshold.joint : c.carLoan.threshold.other;
    const p = phaseOut(line24, magi, line26, c.carLoan.perThousand, true);
    out.carLoan = { rows, line23, line24, line25: magi, line26, line27: R(p.over), line28: p.thousands, line29: p.reduction, line30: R(p.deduction) };
  }
  return out;
}
