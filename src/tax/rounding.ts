/**
 * Line rounding. A return either keeps cents on every line or rounds every line
 * to whole dollars (Form 1040 instructions: "If you do round to whole dollars, you
 * must round all amounts"; 50¢ and up rounds away from zero). Each computed line
 * is rounded as it is entered, so later lines are computed from rounded ones —
 * the way e-filed (whole-dollar) returns are built.
 */
import { FakeTaxpayer } from "../faker/taxpayer";

export type Rounder = (n: number) => number;

const halfAway = (n: number, unit: number) => Math.sign(n) * Math.round(Math.abs(n) / unit + 1e-9) * unit;

export const cents: Rounder = (n) => Math.round(halfAway(n, 0.01) * 100) / 100;
export const dollars: Rounder = (n) => halfAway(n, 1) + 0; // + 0 turns -0 into 0

export const rounderFor = (t: FakeTaxpayer): Rounder => (t.wholeDollars ? dollars : cents);

export const sumWith = (R: Rounder, xs: number[]) => R(xs.reduce((a, b) => a + b, 0));
