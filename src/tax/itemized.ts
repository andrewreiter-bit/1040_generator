/**
 * Schedule A (itemized deductions), 2023–2025 layout. Only the lines the model
 * carries: medical (with the 7.5% floor), state and local taxes (with the SALT
 * cap), home mortgage interest and points, gifts to charity with the carryover
 * (line 13), and gambling losses up to gambling winnings (line 16). Home
 * acquisition debt is assumed within the § 163(h)(3) limit.
 *
 * Charity AGI limits (Pub 526): 60% cash to 50%-limit organizations, 50% other
 * gifts to them, 30% to other organizations and capital gain property, 20%
 * capital gain property to other organizations. Pub 526 Worksheet 2 isn't
 * modelled, so `charityLimitMayApply` is set (and reported as unsupported) when
 * a limit could bind: gifts plus carryover over 20% of AGI, unless they're all
 * 60% cash within 60%.
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { MEDICAL_AGI_FLOOR, saltCap } from "../config/tax-year";
import { includedW2s } from "./household";
import { Rounder, sumWith } from "./rounding";

export interface ScheduleALines {
  line1: number; line2: number; line3: number; line4: number;
  line5a: number; salesTaxElected: boolean; line5b: number; line5c: number; line5d: number;
  saltCap: number; line5e: number; line7: number;
  line8a: number; line8c: number; line8e: number; line10: number;
  line11: number; line12: number; line13: number; line14: number; line16: number;
  line17: number;
  electToItemize: boolean;
  charityLimitMayApply: boolean;
}

export function scheduleA(t: FakeTaxpayer, agi: number, R: Rounder, gamblingWinnings = 0): ScheduleALines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const it = t.itemized ?? {};
  const line1 = R(it.medicalExpenses ?? 0);
  const line2 = R(agi);
  const line3 = R(line2 * MEDICAL_AGI_FLOOR);
  const line4 = Math.max(0, R(line1 - line3));
  const line5a = R(it.stateLocalTax?.amount ?? sum(includedW2s(t).map((w) => w.stateWithheld)));
  const line5b = R(it.realEstateTax ?? 0);
  const line5c = R(it.personalPropertyTax ?? 0);
  const line5d = sum([line5a, line5b, line5c]);
  const cap = R(saltCap(t.taxYear, t.filingStatus, agi));
  const line5e = Math.min(line5d, cap);
  const line7 = line5e;
  const line8a = R(it.mortgageInterest1098 ?? 0);
  const line8c = R(it.mortgagePoints ?? 0);
  const line8e = sum([line8a, line8c]);
  const line10 = line8e;
  const by = it.charityByLimit;
  const line11 = by ? sum([by.cash60 ?? 0, by.cash30 ?? 0]) : R(it.charityCash ?? 0);
  const line12 = by ? sum([by.nonCash50 ?? 0, by.nonCash30 ?? 0, by.capitalGain30 ?? 0, by.capitalGain20 ?? 0]) : R(it.charityNonCash ?? 0);
  const line13 = R(it.charityCarryover ?? 0);
  const line14 = sum([line11, line12, line13]);
  let charityLimitMayApply: boolean;
  if (by) {
    const onlyCash60 = line13 === 0 && line14 === R(by.cash60 ?? 0);
    charityLimitMayApply = line14 > agi * 0.2 && !(onlyCash60 && line14 <= agi * 0.6);
  } else {
    charityLimitMayApply = line11 > agi * 0.6 || line12 > agi * 0.3 || (line13 > 0 && line14 > agi * 0.2);
  }
  const line16 = Math.min(R(it.gamblingLosses ?? 0), R(gamblingWinnings));
  const line17 = sum([line4, line7, line10, line14, line16]);
  return {
    line1, line2, line3, line4, line5a, salesTaxElected: it.stateLocalTax?.kind === "sales", line5b, line5c, line5d,
    saltCap: cap, line5e, line7, line8a, line8c, line8e, line10, line11, line12, line13, line14, line16, line17,
    electToItemize: !!it.electToItemize, charityLimitMayApply,
  };
}
