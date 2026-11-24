import { FieldMap } from "./types";
import { F1040_MAPS } from "./f1040";
import { FW4_MAPS } from "./fw4";

export * from "./types";

const ALL_MAPS: FieldMap[] = [...F1040_MAPS, ...FW4_MAPS];

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
