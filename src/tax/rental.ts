/**
 * Schedule E Part I: rental real estate (2023–2025 layout, up to three
 * properties per page). Rentals are treated as passive activities with active
 * participation and not as a § 199A trade or business (no QBI). A property with
 * a loss needs the passive activity rules (Form 8582), which computeReturn
 * reports as unsupported.
 */
import { RentalProperty } from "../faker/taxpayer";
import { Rounder, sumWith } from "./rounding";

/** Expense lines 5–19 in form order. */
export const RENTAL_EXPENSE_LINES: Array<[string, keyof RentalProperty["expenses"]]> = [
  ["5", "advertising"], ["6", "autoTravel"], ["7", "cleaningMaintenance"], ["8", "commissions"],
  ["9", "insurance"], ["10", "legalProfessional"], ["11", "managementFees"], ["12", "mortgageInterest"],
  ["13", "otherInterest"], ["14", "repairs"], ["15", "supplies"], ["16", "taxes"], ["17", "utilities"],
  ["18", "depreciation"], ["19", "other"],
];

export interface RentalColumn {
  property: RentalProperty;
  rents: number;                       // 3
  royalties: number;                   // 4
  expenseLines: Record<string, number>; // 5–19
  totalExpenses: number;               // 20
  net: number;                         // 21
  deductibleLoss: number;              // 22 (≤ 0; only when 21 is a loss)
}

export interface ScheduleELines {
  columns: RentalColumn[];
  line23a: number; line23b: number; line23c: number; line23d: number; line23e: number;
  line24: number;                      // income
  line25: number;                      // losses (≤ 0)
  line26: number;                      // → Schedule 1 line 5
}

export function scheduleE(rentals: RentalProperty[], R: Rounder): ScheduleELines {
  const sum = (xs: number[]) => sumWith(R, xs);
  const columns = rentals.map((p): RentalColumn => {
    const rents = R(p.rents);
    const royalties = R(p.royalties);
    const expenseLines: Record<string, number> = {};
    for (const [line, key] of RENTAL_EXPENSE_LINES) expenseLines[line] = R(p.expenses[key] ?? 0);
    const totalExpenses = sum(Object.values(expenseLines));
    const net = R(rents + royalties - totalExpenses);
    return { property: p, rents, royalties, expenseLines, totalExpenses, net, deductibleLoss: net < 0 ? net : 0 };
  });
  const line23a = sum(columns.map((c) => c.rents));
  const line23b = sum(columns.map((c) => c.royalties));
  const line23c = sum(columns.map((c) => c.expenseLines["12"]));
  const line23d = sum(columns.map((c) => c.expenseLines["18"]));
  const line23e = sum(columns.map((c) => c.totalExpenses));
  const line24 = sum(columns.map((c) => Math.max(0, c.net)));
  const line25 = sum(columns.map((c) => c.deductibleLoss));
  const line26 = R(line24 + line25);
  return { columns, line23a, line23b, line23c, line23d, line23e, line24, line25, line26 };
}
