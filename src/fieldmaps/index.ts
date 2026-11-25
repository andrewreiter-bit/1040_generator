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

export * from "./types";

const ALL_MAPS: FieldMap[] = [
  ...F1040_MAPS, ...F1040SB_MAPS, ...FW4_MAPS, ...SCHEDULE_C_MAPS, ...SCHEDULE_SE_MAPS, ...SCHEDULE_1_2_3_MAPS, ...CAPITAL_MAPS, ...CREDIT_MAPS, ...F1099B_MAPS, ...SCHEDULE_A_E_MAPS, ...FORM_8582_MAPS, ...QBI_MAPS,
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
