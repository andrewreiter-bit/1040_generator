/**
 * Profile draws for features the answer key brought in, run AFTER every other draw (seeds keep
 * their households). Every random value is drawn up front, unconditionally and in a fixed order;
 * the conditions only decide whether a value is used. No computeReturn here (it's memoized per
 * taxpayer object, so a call mid-construction would cache a stale return).
 *
 * - IRA basis (Form 8606): ~60% of households with a traditional IRA code 7 distribution, for
 *   one person with no code 1 distribution. The distributions are line 7, nothing converted.
 * - Disability pension (code 3, Form 1040 line 1h; Schedule R when income allows): ~4% of
 *   filers under 60 with wages, not filing separately, with no code 1 distribution.
 * - Marketplace coverage on a separate return without the line A exception (Form 8962 repays
 *   the advance payments): ~25% of separate filers under 65 without a policy.
 * - Separated spouse: separate filers (90% of those with an EIC child, 40% of the rest) live apart
 *   from the spouse for the last 6 months (60%; 85% of those paid over half the cost of the home)
 *   or are legally separated (40%), so EIC with a qualifying child is allowed (§ 32(d)(2)).
 *   Separated separate filers who work and have a child under 13 get the usual care draw (45%);
 *   Form 2441 allows the credit only to those considered unmarried (§ 21(e)(4)).
 * - Part-year HSA coverage (Form 8889 Line 3 Limitation Chart): ~25% of HSA holders, 6–11
 *   months; skipped when the employer's code W is over the prorated limit, and the holder's
 *   contribution is capped at the prorated limit less code W (never an excess).
 * - Gambling winnings (Form W-2G): ~5% of households; 35% are lottery prizes (24% withheld over
 *   $5,000), the rest slots, keno, bingo or poker tournaments (no regular withholding).
 * - Itemizers only, each moved out of an existing Schedule A line so line 17 (the profile's drawn
 *   itemized total) doesn't change:
 *   - gambling losses up to the winnings, out of mortgage interest;
 *   - noncash gifts over $500 with Form 8283 rows (the existing ≤ $500 noncash gift is the first
 *     row), out of cash gifts;
 *   - a charity carryover (line 13), out of cash gifts, kept well under 20% of wages;
 *   - investment interest with a prior-year carryover (Form 4952 required), no more than interest
 *     plus nonqualified dividends so it's fully deductible, out of mortgage interest;
 *   - a federally declared disaster casualty loss (Form 4684) sized under 4.5% of wages, so the
 *     10%-of-AGI floor takes line 18 to $0.
 */
import { Faker } from "@faker-js/faker";
import { FakeTaxpayer, Retirement1099R } from "./taxpayer";
import { HSA_CATCH_UP, HSA_LIMIT } from "../config/tax-year";
import { eicChildren } from "../tax/household";
import { buildDependentCare } from "./dependent-care";
import { cityStateZip, zipInState } from "./zip";

const round2 = (n: number) => Math.round(n * 100) / 100;
const dollars = (faker: Faker, min: number, max: number) => round2(faker.number.float({ min, max, fractionDigits: 2 }));
const age = (dob: string | null | undefined, y: number) => (dob ? y - Number(dob.split("/")[2]) : NaN);

export function addExtras(faker: Faker, t: FakeTaxpayer): void {
  const y = t.taxYear;
  const joint = t.filingStatus === "MFJ";
  // ── Draws (fixed order) ──
  const basisGo = faker.datatype.boolean({ probability: 0.6 });
  const basisAmt = dollars(faker, 2000, 25000);
  const basisValue = dollars(faker, 20000, 250000);
  const disGo = faker.datatype.boolean({ probability: 0.04 });
  const disAmt = dollars(faker, 6000, 22000);
  const disWithhold = faker.datatype.boolean({ probability: 0.5 });
  const disPayer = { name: `${faker.company.name()} Disability Plan`, tin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
    street: faker.location.streetAddress(), city: cityStateZip(faker), acct: faker.string.numeric(10) };
  const mfsPtcGo = faker.datatype.boolean({ probability: 0.25 });
  const mfsPremium = dollars(faker, 4000, 9000);
  const mfsSlcspFactor = faker.number.float({ min: 0.8, max: 1.2, fractionDigits: 3 });
  const mfsAdvanceShare = faker.number.float({ min: 0.3, max: 0.8, fractionDigits: 3 });
  const mfsIds = { id: faker.string.numeric(6), policy: faker.string.alphanumeric({ length: 10, casing: "upper" }), issuer: `${faker.company.name()} Health Plans` };
  const hsaPartGo = faker.datatype.boolean({ probability: 0.25 });
  const hsaMonths = faker.number.int({ min: 6, max: 11 });
  const gambleGo = faker.datatype.boolean({ probability: 0.05 });
  const gambleAmt = dollars(faker, 1200, 18000);
  const gambleLottery = faker.datatype.boolean({ probability: 0.35 });
  const gambleSpouse = faker.datatype.boolean({ probability: 0.3 });
  const gamblePayer = { name: `${faker.company.name()} Casino`, tin: `${faker.number.int({ min: 10, max: 99 })}-${faker.string.numeric(7)}`,
    street: faker.location.streetAddress(), city: cityStateZip(faker) };
  const gambleMonth = faker.number.int({ min: 1, max: 12 }), gambleDay = faker.number.int({ min: 1, max: 28 });
  const gambleType = faker.helpers.arrayElement(["Slots", "Keno", "Bingo", "Poker tournament"]);
  const lossesGo = faker.datatype.boolean({ probability: 0.5 });
  const lossesShare = faker.number.float({ min: 0.2, max: 1, fractionDigits: 3 });
  const noncashGo = faker.datatype.boolean({ probability: 0.2 });
  const noncashTotal = dollars(faker, 600, 4000);
  const noncashCount = faker.number.int({ min: 1, max: 3 });
  const noncashItems = Array.from({ length: 4 }, () => ({
    donee: `${faker.company.name()} ${faker.helpers.arrayElement(["Thrift Store", "Charities", "Foundation", "Rescue Mission"])}`,
    address: `${faker.location.streetAddress()}, ${cityStateZip(faker)}`,
    description: faker.helpers.arrayElement(["Used clothing, good condition", "Household goods, good condition", "Furniture, fair condition", "Books, good condition"]),
    month: faker.number.int({ min: 1, max: 12 }), day: faker.number.int({ min: 1, max: 28 }), costFactor: faker.number.float({ min: 1.5, max: 4, fractionDigits: 2 }),
  }));
  const carryGo = faker.datatype.boolean({ probability: 0.08 });
  const carryShare = faker.number.float({ min: 0.1, max: 0.5, fractionDigits: 3 });
  const invGo = faker.datatype.boolean({ probability: 0.15 });
  const invShare = faker.number.float({ min: 0.3, max: 0.6, fractionDigits: 3 });
  const casGo = faker.datatype.boolean({ probability: 0.15 });
  const casBasis = dollars(faker, 20000, 200000);
  const casShare = faker.number.float({ min: 0.3, max: 0.9, fractionDigits: 3 });
  const casFema = `DR-${faker.number.int({ min: 4600, max: 4899 })}`;
  const casDesc = faker.helpers.arrayElement(["Detached garage", "Personal vehicle", "Home contents", "Storage shed"]);
  const sepRoll = faker.number.float({ min: 0, max: 1, fractionDigits: 4 });
  const sepLegal = faker.datatype.boolean({ probability: 0.4 });
  const halfCostGo = faker.datatype.boolean({ probability: 0.85 });

  // ── IRA basis (Form 8606) ──
  const rs = t.retirement1099Rs ?? [];
  const who = (r: Retirement1099R) => r.recipient ?? "primary";
  const hasCode1 = (p: "primary" | "spouse") => rs.some((r) => who(r) === p && r.distributionCode === "1");
  const iraHolder = (["primary", "spouse"] as const).find((p) => (p === "primary" || joint) && !hasCode1(p)
    && rs.some((r) => who(r) === p && r.iraSepSimple && r.distributionCode === "7"));
  if (basisGo && iraHolder) {
    const dist = round2(rs.filter((r) => who(r) === iraHolder && r.iraSepSimple && r.distributionCode === "7").reduce((a, r) => a + r.grossDistribution, 0));
    t.form8606 = { [iraHolder]: { priorBasis: basisAmt, yearEndValue: basisValue, distributions: dist, conversions: 0 } };
  }

  // ── Disability pension before retirement age (code 3) ──
  const primaryAge = age(t.dateOfBirth, y);
  if (disGo && primaryAge < 60 && t.totalWages > 0 && t.filingStatus !== "MFS" && !hasCode1("primary") && !t.form8606) {
    const r: Retirement1099R = {
      recipient: "primary", payerName: disPayer.name, payerTin: disPayer.tin, payerStreet: disPayer.street, payerCity: disPayer.city,
      accountNumber: disPayer.acct, grossDistribution: disAmt, taxableAmount: disAmt, taxableAmountNotDetermined: false,
      totalDistribution: false, federalWithheld: disWithhold ? round2(disAmt * 0.1) : 0, distributionCode: "3", iraSepSimple: false,
      disabilityBeforeRetirementAge: true,
    };
    t.retirement1099Rs = [...rs, r];
    t.permanentlyDisabled = { primary: true };
  }

  // ── Marketplace coverage on a separate return (no line A exception) ──
  if (mfsPtcGo && t.filingStatus === "MFS" && !t.marketplace1095As?.length && primaryAge < 65 && !t.hsa) {
    const slcsp = round2(mfsPremium * mfsSlcspFactor);
    t.marketplace1095As = [{
      marketplaceId: `${t.state}-${mfsIds.id}`, policyNumber: mfsIds.policy, issuer: mfsIds.issuer,
      annualPremium: mfsPremium, annualSlcsp: slcsp, annualAdvancePayments: round2(Math.min(mfsPremium, slcsp) * mfsAdvanceShare),
    }];
  }

  // ── Part-year HSA coverage ──
  const holder = t.hsa?.primary ? "primary" : t.hsa?.spouse ? "spouse" : undefined;
  if (hsaPartGo && holder) {
    const a = t.hsa![holder]!;
    const fifty5 = age(holder === "primary" ? t.dateOfBirth : t.spouseDateOfBirth, y) >= 55;
    const lim = HSA_LIMIT[y];
    const prorated = ((a.coverage === "family" ? lim.family : lim.self) + (fifty5 ? HSA_CATCH_UP : 0)) * hsaMonths / 12;
    const codeW = round2(t.w2Records.filter((w) => (w.employee ?? "primary") === holder).flatMap((w) => w.box12 ?? []).filter((e) => e.code === "W").reduce((s, e) => s + e.amount, 0));
    if (codeW <= prorated - 1) {
      a.months = { self: a.coverage === "self" ? hsaMonths : 0, family: a.coverage === "family" ? hsaMonths : 0 };
      a.contributions = Math.min(a.contributions, Math.max(0, Math.floor(prorated - codeW - 1)));
    }
  }

  // ── Gambling winnings (W-2G) ──
  const winnings = gambleGo ? gambleAmt : 0;
  if (gambleGo) {
    // W-2G instructions: bingo, keno and slots are exempt from regular gambling withholding (only
    // backup withholding, when the winner gives no TIN, which ours always do), and box 3 names the
    // wager and its amount. A poker tournament shows zero withheld. Regular 24% withholding is for
    // lotteries (and similar) when winnings less the wager are over $5,000, at 24% of that net.
    // Reporting thresholds (2025 General Instructions for Certain Information Returns): $1,200
    // bingo/slots, $1,500 keno (net of the wager), $600 otherwise (lotteries: 300× the wager too).
    // No poker figure is stated; poker is drawn only over $5,000, to stay clear of any threshold.
    const kind = gambleLottery ? "Lottery" : gambleType === "Poker tournament" && gambleAmt <= 5000 ? "Slots"
      : gambleType === "Keno" && gambleAmt < 1500 ? "Slots" : gambleType;
    const wager: Record<string, string> = { Slots: "Slot machine, $5.00 wager", Keno: "Keno, $5.00 wager", Bingo: "Bingo, $10.00 wager",
      "Poker tournament": "Poker tournament", Lottery: "State lottery, $2.00 ticket" };
    t.gamblingWinnings = [{
      recipient: joint && gambleSpouse ? "spouse" : "primary",
      payerName: kind === "Lottery" ? `${t.state} State Lottery` : gamblePayer.name, payerTin: gamblePayer.tin,
      payerStreet: gamblePayer.street, payerCity: kind === "Lottery" ? gamblePayer.city.replace(/, [A-Z]{2} (\d{5})$/, (_m, z: string) => `, ${t.state} ${zipInState(t.state, z)}`) : gamblePayer.city,
      dateWon: `${String(gambleMonth).padStart(2, "0")}/${String(gambleDay).padStart(2, "0")}/${y}`, wagerType: wager[kind],
      winnings: gambleAmt, federalWithheld: kind === "Lottery" && gambleAmt > 5000 ? round2(gambleAmt * 0.24) : 0,
    }];
  }

  // ── Separated spouse (EIC on a separate return, § 32(d)(2)) ──
  // Living apart for the last 6 months, or legally separated; either way the spouses shared a home
  // earlier in the year (mfsLivedWithSpouse stays unset), so only EIC and the separated-spouse box change.
  if (t.filingStatus === "MFS" && sepRoll < (eicChildren(t).length ? 0.9 : 0.4)) {
    if (sepLegal) t.mfsLegallySeparated = true;
    else { t.mfsApartLast6Months = true; t.mfsPaidOverHalfHomeCost = halfCostGo; }
  }
  // Child care for separated separate filers (Form 2441 line A). The care draws come after every
  // value above (all drawn up front), so their varying count moves nothing else.
  if (t.filingStatus === "MFS" && (t.mfsApartLast6Months || t.mfsLegallySeparated) && !t.dependentCare) {
    const care = buildDependentCare(faker, t, true);
    if (care) t.dependentCare = care;
  }

  // ── Itemizers: reallocations that keep Schedule A line 17 ──
  const it = t.itemized;
  if (!it || t.takesStandardDeduction) return;
  const mortgage = () => it.mortgageInterest1098 ?? 0;
  if (winnings && lossesGo) {
    const losses = round2(winnings * lossesShare);
    if (mortgage() >= losses) { it.gamblingLosses = losses; it.mortgageInterest1098 = round2(mortgage() - losses); }
  }
  const cash = () => it.charityCash ?? 0;
  if (noncashGo && cash() >= noncashTotal + 500) {
    const existing = it.charityNonCash ?? 0;
    const parts = noncashItems.slice(0, noncashCount);
    const each = round2(noncashTotal / noncashCount);
    const amounts = parts.map((_, i) => (i === noncashCount - 1 ? round2(noncashTotal - each * (noncashCount - 1)) : each));
    const rows = parts.map((p, i) => ({
      donee: p.donee, doneeAddress: p.address, description: p.description,
      dateContributed: `${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}/${y}`, dateAcquired: "Various",
      howAcquired: "Purchased", cost: round2(amounts[i] * p.costFactor), fmv: amounts[i], method: "Thrift shop value",
    }));
    // The existing (≤ $500) gift is its own row, from the fourth drawn item (new rows use at most three).
    const own = noncashItems[3];
    if (existing > 0) rows.unshift({ ...rows[0], donee: own.donee, doneeAddress: own.address, description: "Household goods, good condition",
      dateContributed: `${String(own.month).padStart(2, "0")}/${String(own.day).padStart(2, "0")}/${y}`, cost: round2(existing * 2), fmv: existing });
    it.noncashGifts = rows;
    it.charityNonCash = round2(existing + noncashTotal);
    it.charityCash = round2(cash() - noncashTotal);
  }
  if (carryGo && cash() >= 1000) {
    const carry = round2(Math.min(1500, cash() * carryShare));
    const total = cash() + (it.charityNonCash ?? 0);
    if (total <= t.totalWages * 0.15) { it.charityCarryover = carry; it.charityCash = round2(cash() - carry); }
  }
  const fourC = round2(t.totalInterest + Math.max(0, t.totalDividends - t.totalQualifiedDividends));
  if (invGo && fourC >= 400) {
    const totalInv = round2(fourC * invShare);
    const carry = round2(totalInv * 0.25);
    const paid = round2(totalInv - carry);
    if (mortgage() >= totalInv && paid > 0) {
      t.investmentInterest = { paid, priorYearDisallowed: carry };
      it.mortgageInterest1098 = round2(mortgage() - totalInv);
    }
  }
  if (casGo && t.totalWages >= 30000) {
    const lossTarget = round2(t.totalWages * 0.045 * casShare);
    const drop = round2(Math.min(casBasis, lossTarget * 3));
    const insurance = round2(drop - lossTarget);
    if (insurance >= 0 && insurance <= casBasis) {
      it.casualtyEvents = [{ kind: "federal", description: "Federally declared disaster", femaNumber: casFema,
        items: [{ basis: casBasis, fmvBefore: round2(casBasis * 1.1), fmvAfter: round2(casBasis * 1.1 - drop), insurance,
          description: casDesc, location: `${t.city}, ${t.state}`, zip: t.zipCode, dateAcquired: `01/01/${y - 6}` }] }];
    }
  }
}
