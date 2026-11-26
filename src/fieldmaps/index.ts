import { FieldMap } from "./types";
import { F1040_MAPS } from "./f1040";
import { FW4_MAPS } from "./fw4";
import { F1040SB_MAPS } from "./f1040sb";
import { SCHEDULE_C_MAPS, SCHEDULE_SE_MAPS } from "./business";
import { SCHEDULE_1_2_3_MAPS } from "./schedules-1-2-3";
import { CAPITAL_MAPS } from "./capital";
import { CREDIT_MAPS } from "./credits";
import { F1099B_MAPS } from "./f1099b";
import { FORM_8582_MAPS, SCHEDULE_A_E_MAPS } from "./schedules-ae";
import { QBI_MAPS } from "./qbi";
import { F1099R_MAPS } from "./f1099r";
import { SAVERS_CREDIT_MAPS } from "./savers-credit";
import { FORM_2441_MAPS } from "./dependent-care";
import { EDUCATION_MAPS } from "./education";
import { PREMIUM_TAX_CREDIT_MAPS } from "./premium-tax-credit";
import { AMT_MAPS } from "./amt";
import { HSA_MAPS } from "./hsa";
import { INVESTMENT_INTEREST_MAPS } from "./investment-interest";
import { ELDERLY_IRA_CASUALTY_NONCASH_MAPS } from "./elderly-ira-casualty-noncash";
import { W2G_MAPS } from "./w2g";

export * from "./types";

const ALL_MAPS: FieldMap[] = [
  ...F1040_MAPS, ...F1040SB_MAPS, ...FW4_MAPS, ...SCHEDULE_C_MAPS, ...SCHEDULE_SE_MAPS, ...SCHEDULE_1_2_3_MAPS, ...CAPITAL_MAPS, ...CREDIT_MAPS, ...F1099B_MAPS, ...SCHEDULE_A_E_MAPS, ...FORM_8582_MAPS, ...QBI_MAPS, ...F1099R_MAPS, ...SAVERS_CREDIT_MAPS, ...FORM_2441_MAPS, ...EDUCATION_MAPS, ...PREMIUM_TAX_CREDIT_MAPS, ...AMT_MAPS, ...HSA_MAPS, ...INVESTMENT_INTEREST_MAPS, ...ELDERLY_IRA_CASUALTY_NONCASH_MAPS, ...W2G_MAPS,
];

export function getFieldMap(formId: string, taxYear: number): FieldMap | undefined {
  return ALL_MAPS.find((m) => m.formId === formId && m.taxYear === taxYear);
}

/** Reverse lookup: semantic key → pdfFieldName. */
export function fieldNameForKey(map: FieldMap, key: string): string | undefined {
  for (const [name, entry] of Object.entries(map.fields)) {
    if (entry.key === key) return name;
  }
  return undefined;
}
