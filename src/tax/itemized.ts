/**
 * Schedule A (itemized deductions), 2023–2025 layout, with the 2026 rule changes (OBBBA; 2026
 * draft Form 1040 instructions, What's New): gambling losses limited to 90% of the losses (and to
 * winnings, § 165(d)); charitable gifts deductible only above 0.5% of AGI (§ 170(b)(1)(I)) —
 * applied here to the year's gifts (lines 11–12), not the carryover; and State declared disasters
 * counted like Federally declared ones (§ 165(h)(5)). The § 68 limit is applied in computeReturn. Only the lines the model
 * carries: medical (with the 7.5% floor), state and local taxes (with the SALT
 * cap), home mortgage interest and points, investment interest (Form 4952,
 * line 9), gifts to charity with the carryover
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
import { MEDICAL_AGI_FLOOR, OBBBA_2026, saltCap } from "../config/tax-year";
import { includedW2s } from "./household";
import { Rounder, sumWith } from "./rounding";

export interface ScheduleALines {
  line1: number; line2: number; line3: number; line4: number;
  line5a: number; salesTaxElected: boolean; line5b: number; line5c: number; line5d: number;
  saltCap: number; line5e: number; line7: number;
  line8a: number; line8c: number; line8e: number; line9: number; line10: number;
  line11: number; line12: number; line13: number; line14: number;
  /** 2026 on: the 0.5%-of-AGI floor taken off the year's gifts (§ 170(b)(1)(I)). */
  charityFloor: number;
  /** Line 15: casualty and theft losses from federally declared disasters (Form 4684 line 18). */
  line15: number;
  /** Line 16: gambling losses plus a net qualified disaster loss (Form 4684 line 15). */
  line16: number;
  gamblingLosses: number;
  /** Net qualified disaster loss: on line 16 when itemizing, or added to the standard deduction. */
  qualifiedDisasterLoss: number;
  /** Form 4684 Section A totals (lines 14–18), when there are casualty events. */
  form4684?: { events: Array<{ kind: string; loss: number; floor: number; net: number }>; line14: number; line15: number; line16: number; line17: number; line18: number };
  casualtyUnsupported: string[];
  line17: number;
  electToItemize: boolean;
  charityLimitMayApply: boolean;
}

export function scheduleA(t: FakeTaxpayer, agi: number, R: Rounder, gamblingWinnings = 0, investmentInterest = 0): ScheduleALines {
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
  const line9 = R(investmentInterest);   // Form 4952 line 8
  const line10 = sum([line8e, line9]);
  const by = it.charityByLimit;
  const line11 = by ? sum([by.cash60 ?? 0, by.cash30 ?? 0]) : R(it.charityCash ?? 0);
  const line12 = by ? sum([by.nonCash50 ?? 0, by.nonCash30 ?? 0, by.capitalGain30 ?? 0, by.capitalGain20 ?? 0]) : R(it.charityNonCash ?? 0);
  const line13 = R(it.charityCarryover ?? 0);
  const y26 = t.taxYear >= OBBBA_2026.firstYear;
  const charityFloor = y26 ? Math.min(sum([line11, line12]), R(agi * OBBBA_2026.charityFloorRate)) : 0;
  const line14 = R(sum([line11, line12, line13]) - charityFloor);
  let charityLimitMayApply: boolean;
  if (by) {
    const onlyCash60 = line13 === 0 && line14 === R(by.cash60 ?? 0);
    charityLimitMayApply = line14 > agi * 0.2 && !(onlyCash60 && line14 <= agi * 0.6);
  } else {
    charityLimitMayApply = line11 > agi * 0.6 || line12 > agi * 0.3 || (line13 > 0 && line14 > agi * 0.2);
  }
  const gamblingLosses = Math.min(R((it.gamblingLosses ?? 0) * (y26 ? OBBBA_2026.wageringLossRate : 1)), R(gamblingWinnings));
  // Form 4684 Section A, per event: the smaller of basis or the drop in value, less insurance;
  // less $100 ($500 for a qualified disaster loss). Losses not from a federally declared disaster
  // offset only casualty gains (2018–2025), and there are none modelled, so they drop out.
  const casualtyUnsupported: string[] = [];
  let form4684: ScheduleALines["form4684"];
  let qualifiedDisasterLoss = 0, line15 = 0;
  if (it.casualtyEvents?.length) {
    const events = it.casualtyEvents.map((e) => {
      const loss = sum(e.items.map((x) => {
        if (x.insurance > x.basis) casualtyUnsupported.push("casualty gain (insurance above basis)");
        return Math.max(0, R(Math.min(x.basis, Math.max(0, x.fmvBefore - x.fmvAfter)) - x.insurance));
      }));
      const floor = e.kind === "qualified" ? 500 : 100;
      return { kind: e.kind, loss, floor, net: Math.max(0, R(loss - floor)) };
    });
    // From 2026 a State declared disaster counts like a Federally declared one; before, it drops out.
    const fed = sum(events.filter((e) => e.kind === "federal" || (y26 && e.kind === "state")).map((e) => e.net));
    qualifiedDisasterLoss = sum(events.filter((e) => e.kind === "qualified").map((e) => e.net));
    const l14 = sum([fed, qualifiedDisasterLoss]);
    const l17 = R(agi * 0.1);
    line15 = Math.max(0, R(fed - l17));
    form4684 = { events, line14: l14, line15: qualifiedDisasterLoss, line16: fed, line17: l17, line18: line15 };
  }
  const line16 = sum([gamblingLosses, qualifiedDisasterLoss]);
  const line17 = sum([line4, line7, line10, line14, line15, line16]);
  return {
    line1, line2, line3, line4, line5a, salesTaxElected: it.stateLocalTax?.kind === "sales", line5b, line5c, line5d,
    saltCap: cap, line5e, line7, line8a, line8c, line8e, line9, line10, line11, line12, line13, line14, charityFloor, line15, line16, line17,
    gamblingLosses, qualifiedDisasterLoss, form4684, casualtyUnsupported,
    electToItemize: !!it.electToItemize, charityLimitMayApply,
  };
}
