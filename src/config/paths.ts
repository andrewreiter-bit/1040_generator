import path from "path";

/**
 * Working directories, resolved at call time so callers (e.g. the validator)
 * can point a run at a year snapshot via env vars without swapping folders:
 *
 *   FORMS_DIR=forms_2024 TEMPLATES_DIR=templates_2024 OUTPUT_DIR=/tmp/out
 */
function dirFromEnv(envVar: string, fallback: string): string {
  const v = process.env[envVar];
  return path.resolve(process.cwd(), v && v.trim() ? v : fallback);
}

export const formsDir     = (): string => dirFromEnv("FORMS_DIR", "forms");
export const templatesDir = (): string => dirFromEnv("TEMPLATES_DIR", "templates");
export const outputDir    = (): string => dirFromEnv("OUTPUT_DIR", "output");
