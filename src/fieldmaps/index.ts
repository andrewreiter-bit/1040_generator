import { FieldMap } from "./types";
import { F1040_MAPS } from "./f1040";
import { FW4_MAPS } from "./fw4";
import { F1040SB_MAPS } from "./f1040sb";
import { SCHEDULE_C_MAPS, SCHEDULE_SE_MAPS } from "./business";
import { SCHEDULE_1_2_3_MAPS } from "./schedules-1-2-3";

export * from "./types";

const ALL_MAPS: FieldMap[] = [
  ...F1040_MAPS, ...F1040SB_MAPS, ...FW4_MAPS, ...SCHEDULE_C_MAPS, ...SCHEDULE_SE_MAPS, ...SCHEDULE_1_2_3_MAPS,
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
