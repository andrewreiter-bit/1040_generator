/**
 * ZIP codes that belong to their state. Faker's en locale draws ZIPs without regard to the state,
 * so a drawn ZIP is remapped into the state's USPS three-digit prefix range (the first prefix range
 * each state is assigned; not every prefix inside a range is in use). The remap is deterministic
 * and draws nothing, so every seed keeps its sequence of draws; only the ZIP's value changes.
 */
import { Faker } from "@faker-js/faker";

/** First and last three-digit ZIP prefix per state (USPS). */
export const ZIP_PREFIX: Record<string, [number, number]> = {
  AL: [350, 369], AK: [995, 999], AZ: [850, 865], AR: [716, 729], CA: [900, 961], CO: [800, 816],
  CT: [60, 69], DE: [197, 199], DC: [200, 205], FL: [320, 349], GA: [300, 319], HI: [967, 968],
  ID: [832, 838], IL: [600, 629], IN: [460, 479], IA: [500, 528], KS: [660, 679], KY: [400, 427],
  LA: [700, 714], ME: [39, 49], MD: [206, 219], MA: [10, 27], MI: [480, 499], MN: [550, 567],
  MS: [386, 397], MO: [630, 658], MT: [590, 599], NE: [680, 693], NV: [889, 898], NH: [30, 38],
  NJ: [70, 89], NM: [870, 884], NY: [100, 149], NC: [270, 289], ND: [580, 588], OH: [430, 459],
  OK: [730, 749], OR: [970, 979], PA: [150, 196], RI: [28, 29], SC: [290, 299], SD: [570, 577],
  TN: [370, 385], TX: [750, 799], UT: [840, 847], VT: [50, 59], VA: [220, 246], WA: [980, 994],
  WV: [247, 268], WI: [530, 549], WY: [820, 831],
};

/** Move a drawn ZIP (`#####` or `#####-####`) into `state`'s prefix range, keeping its last two digits and any +4. */
export function zipInState(state: string, drawn: string): string {
  const range = ZIP_PREFIX[state];
  if (!range) return drawn;
  const [five, plus4] = drawn.split("-");
  const n = parseInt(five, 10);
  const prefix = range[0] + (Math.floor(n / 100) % (range[1] - range[0] + 1));
  return `${String(prefix).padStart(3, "0")}${String(n % 100).padStart(2, "0")}${plus4 ? `-${plus4}` : ""}`;
}

/** The three-digit prefix check used by the validator. */
export function zipMatchesState(state: string, zip: string): boolean {
  const range = ZIP_PREFIX[state];
  if (!range) return true;
  const p = parseInt(zip.slice(0, 3), 10);
  return p >= range[0] && p <= range[1];
}

/** "City, ST 12345", drawn as city, state, ZIP (the order every call site used), with the ZIP in that state. */
export function cityStateZip(faker: Faker): string {
  const city = faker.location.city();
  const state = faker.location.state({ abbreviated: true });
  return `${city}, ${state} ${zipInState(state, faker.location.zipCode("#####"))}`;
}
