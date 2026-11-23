#!/usr/bin/env bash
# Reproduce the entire AVOID PRIME | FT dataset from the original WhatsApp export.
# Usage: bash scripts/dataset/run_all.sh [SOURCE_ARCHIVE] [SEED_DIR]
set -euo pipefail
cd "$(dirname "$0")/../../"   # repo root

SOURCE="${1:-/home/z/my-project/.work/archive-avoid-prime/WhatsApp Chat with AVOID PRIME  FT.txt}"
SEED="${2:-data/seed}"

for stage in 01_parse_export 02_participants 03_statistics 04_summaries 05_lore 06_semantic_index 07_quality_report; do
  echo "=== $stage ==="
  python3 -I "scripts/dataset/$stage.py" --source "$SOURCE" --out "$SEED"
done

echo "=== done ==="
python3 -I -c "import json;q=json.load(open('$SEED/quality-report.json'));print('quality:', 'ALL CHECKS PASSED' if q['all_checks_passed'] else 'FAILURES');print('old-vs-new:', q['old_vs_new']['match'], 'match /', q['old_vs_new']['diff'], 'diff')"
