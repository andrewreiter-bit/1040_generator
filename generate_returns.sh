#!/usr/bin/env bash
set -euo pipefail

# Always run from the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ $# -lt 1 ]; then
  echo "Usage: ./generate_returns.sh <profile_name> [base_seed]"
  echo "Example: ./generate_returns.sh jordan_single 100"
  echo ""
  echo "Available profiles:"
  ls -1 profiles/factory_*.ts 2>/dev/null | sed "s|^profiles/||" | sed 's/^factory_//; s/\.ts$//' | sed 's/^/  - /' || echo "  (none found in profiles/)"
  exit 1
fi

RAW_NAME="$1"
BASE_SEED="${2:-100}"

# Normalize input so 'jordan_single', 'factory_jordan_single.ts', or full path all work
CLEAN_NAME="${RAW_NAME##*/}"
CLEAN_NAME="${CLEAN_NAME#factory_}"
CLEAN_NAME="${CLEAN_NAME%.ts}"

PROFILE_FILE="profiles/factory_${CLEAN_NAME}.ts"

# Pre-flight safety checks before modifying active folders
if [ ! -f "$PROFILE_FILE" ]; then
  echo "Error: Profile not found at '$PROFILE_FILE'"
  exit 1
fi

YEARS=(2023 2024 2025)
for YEAR in "${YEARS[@]}"; do
  if [ ! -d "forms_${YEAR}" ] || [ ! -d "templates_${YEAR}" ]; then
    echo "Error: Missing backup folder 'forms_${YEAR}' or 'templates_${YEAR}'."
    echo "Make sure all three year backups exist before running this script."
    exit 1
  fi
done

echo "Activating profile: $PROFILE_FILE"
cp "$PROFILE_FILE" src/faker/factory.ts

INDEX=1
for YEAR in "${YEARS[@]}"; do
  YEAR_SEED=$((BASE_SEED + INDEX))
  OUT_FILE="${CLEAN_NAME}_${YEAR}_return.pdf"

  echo "------------------------------------------------------------"
  echo "Generating ${YEAR} return for '${CLEAN_NAME}' (seed: ${YEAR_SEED})..."
  echo "------------------------------------------------------------"

  rm -rf forms templates
  cp -R "forms_${YEAR}" forms
  cp -R "templates_${YEAR}" templates

  npm run fill:common -- -y "$YEAR" --seed "$YEAR_SEED" --merge --merge-name "$OUT_FILE"

  INDEX=$((INDEX + 1))
done

# Restore 2025 as the active default
rm -rf forms templates
cp -R forms_2025 forms
cp -R templates_2025 templates

echo "============================================================"
echo "Done! Created 3 merged returns in output/:"
for YEAR in "${YEARS[@]}"; do
  echo "  - output/${CLEAN_NAME}_${YEAR}_return.pdf"
done