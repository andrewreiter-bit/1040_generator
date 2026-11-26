/**
 * Schedule R, credit for the elderly or the disabled (§ 22; Schedule R instructions). A person
 * qualifies at 65 or older, or under 65 when retired on permanent and total disability with
 * taxable disability income (here: code 3 pensions before minimum retirement age).
 *
 *   Part I box   1 single/HOH/QSS 65+; 2 single/HOH/QSS under 65 disabled; 3 MFJ both 65+;
 *                4 MFJ both under 65, one disabled; 5 MFJ both under 65, both disabled;
 *                6 MFJ one 65+, the other under 65 disabled; 7 MFJ one 65+, the other under 65
 *                not disabled; 8 MFS (lived apart all year) 65+; 9 MFS (lived apart) under 65
 *                disabled. MFS living with the spouse can't take the credit.
 *   Line 10      $5,000 (boxes 1, 2, 4, 7), $7,500 (3, 5, 6), $3,750 (8, 9)
 *   Line 11/12   under 65: the taxable disability income (box 6: $5,000 + the under-65
 *                spouse's), and line 12 is the smaller of lines 10 and 11
 *   Line 13      nontaxable Social Security (13a); other nontaxable pensions (13b) not modelled
 *   Lines 14–17  half of AGI over $7,500 ($10,000 MFJ, $5,000 MFS)
 *   Lines 18–20  line 12 less lines 13c + 17, times 15%
 *   Line 21/22   limited to Form 1040 line 18 less Schedule 3 lines 1, 2 and 6l → Schedule 3
 *                line 6d
 */
import { FakeTaxpayer } from "../faker/taxpayer";
import { Rounder } from "./rounding";

export interface ScheduleRLines {
  box: number;
  line10: number; line11?: number; line12: number;
  line13a: number; line13c: number;
  line14: number; line15: number; line16: number; line17: number; line18: number;
  line19: number; line20: number; line21: number; line22: number;
}

export function scheduleR(
  t: FakeTaxpayer,
  args: { ages: { primary: number; spouse: number | null }; disabilityIncome: { primary: number; spouse: number };
    nontaxableSocialSecurity: number; agi: number; creditLimit: number },
  R: Rounder,
): ScheduleRLines | undefined {
  const fs = t.filingStatus;
  const elderly = (who: "primary" | "spouse") => (who === "primary" ? args.ages.primary : args.ages.spouse ?? 0) >= 65;
  const disabled = (who: "primary" | "spouse") => !elderly(who) && !!t.permanentlyDisabled?.[who] && args.disabilityIncome[who] > 0;
  let box = 0;
  if (fs === "Single" || fs === "HOH" || fs === "QSS") box = elderly("primary") ? 1 : disabled("primary") ? 2 : 0;
  else if (fs === "MFS") box = t.mfsLivedWithSpouse !== false ? 0 : elderly("primary") ? 8 : disabled("primary") ? 9 : 0;
  else {
    const e1 = elderly("primary"), e2 = elderly("spouse"), d1 = disabled("primary"), d2 = disabled("spouse");
    if (e1 && e2) box = 3;
    else if (!e1 && !e2) box = d1 && d2 ? 5 : d1 || d2 ? 4 : 0;
    else {
      const youngDisabled = e1 ? d2 : d1;
      box = youngDisabled ? 6 : 7;
    }
  }
  if (!box) return undefined;
  const line10 = [1, 2, 4, 7].includes(box) ? 5000 : [3, 5, 6].includes(box) ? 7500 : 3750;
  let line11: number | undefined;
  if (box === 2 || box === 9) line11 = R(args.disabilityIncome.primary);
  else if (box === 4) line11 = R(disabled("primary") ? args.disabilityIncome.primary : args.disabilityIncome.spouse);
  else if (box === 5) line11 = R(args.disabilityIncome.primary + args.disabilityIncome.spouse);
  else if (box === 6) line11 = R(5000 + (elderly("primary") ? args.disabilityIncome.spouse : args.disabilityIncome.primary));
  const line12 = line11 === undefined ? line10 : Math.min(line10, line11);
  const line13a = Math.max(0, R(args.nontaxableSocialSecurity));
  const line13c = line13a;
  const line14 = R(args.agi);
  const line15 = fs === "MFJ" ? 10000 : fs === "MFS" ? 5000 : 7500;
  const line16 = Math.max(0, R(line14 - line15));
  const line17 = R(line16 / 2);
  const line18 = R(line13c + line17);
  const line19 = Math.max(0, R(line12 - line18));
  const line20 = R(line19 * 0.15);
  const line21 = Math.max(0, R(args.creditLimit));
  const line22 = Math.min(line20, line21);
  return { box, line10, line11, line12, line13a, line13c, line14, line15, line16, line17, line18, line19, line20, line21, line22 };
}
