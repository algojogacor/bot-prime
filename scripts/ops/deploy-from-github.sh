#!/usr/bin/env bash
# Deploy bot-prime on the Azure VM from an EXACT GitHub main commit.
# GitHub-first flow: the code is fetched from origin (never from local
# patches/tarballs), built on the VM, then swapped into the live directory.
#
# Usage:  bash scripts/ops/deploy-from-github.sh <full-sha>
# Prereq: a git clone of the repo with origin set (any dir; pass its path as
#         $SRC, default /home/azureuser/verify-bp) and node_modules present
#         (symlink to the live install is fine when package.json is unchanged
#         — the script verifies that).
set -euo pipefail

SHA="$1"
LIVE="${LIVE:-/home/azureuser/bot-prime}"
SRC="${SRC:-/home/azureuser/verify-bp}"
TS=$(date +%Y%m%d-%H%M%S)
BK="/home/azureuser/bot-prime-backups/pre-${SHA:0:7}-$TS"

echo "== 1. fetch & verify SHA on GitHub main =="
cd "$SRC"
git fetch -q origin
ORIGIN_MAIN=$(git rev-parse origin/main)
if [ "$ORIGIN_MAIN" != "$SHA" ]; then
  echo "FATAL: origin/main ($ORIGIN_MAIN) != requested SHA ($SHA)"; exit 1
fi
git checkout -q "$SHA"
git log --oneline -1

echo "== 2. build (dist) =="
rm -rf dist
npx tsc -p tsconfig.build.json
test -f dist/index.js && test -f dist/whatsapp/service.js

echo "== 3. backup current deployment =="
mkdir -p "$BK"
cp -a "$LIVE/dist" "$BK/dist"
cp -a "$LIVE/data/bot.db" "$BK/bot.db"
cp -a "$LIVE/.env" "$BK/env.backup"
cp -a "$LIVE/package.json" "$BK/package.json"
cat "$LIVE/DEPLOYED_SHA" > "$BK/DEPLOYED_SHA" 2>/dev/null || true
echo "backup at $BK"

echo "== 3b. verify dependency manifest unchanged (node_modules reuse is safe) =="
if ! cmp -s "$SRC/package.json" "$LIVE/package.json"; then
  echo "FATAL: package.json differs between commit and live dir — node_modules reuse unsafe"; exit 1
fi
echo "package.json identical — reusing live node_modules"

echo "== 4. swap code into live dir =="
rsync -a --delete "$SRC/dist/" "$LIVE/dist/"
rsync -a --delete "$SRC/src/" "$LIVE/src/"
rsync -a --delete "$SRC/tests/" "$LIVE/tests/"
# ops/ is copied INTO scripts/ (no --delete): the live scripts/ dir also holds
# VM-only tooling (dry-run suite) that is not part of the repo.
mkdir -p "$LIVE/scripts/ops"
rsync -a "$SRC/scripts/ops/" "$LIVE/scripts/ops/"
cp -a "$SRC/package.json" "$LIVE/package.json"
cp -a "$SRC/tsconfig.json" "$SRC/tsconfig.build.json" "$SRC/vitest.config.ts" "$LIVE/"
cp -a "$SRC/eslint.config.js" "$LIVE/"
mkdir -p "$LIVE/.github"
rsync -a --delete "$SRC/.github/" "$LIVE/.github/"
echo "$SHA" > "$LIVE/DEPLOYED_SHA"
echo "DEPLOYED_SHA now: $(cat "$LIVE/DEPLOYED_SHA")"

echo "== 5. one-time data repair: 1970-epoch rows (seconds stored as ms) =="
python3 - << 'EOF'
import sqlite3
con = sqlite3.connect('/home/azureuser/bot-prime/data/bot.db')
before = con.execute("select count(*) from messages where timestamp < 100000000000").fetchone()[0]
con.execute("update messages set timestamp = timestamp*1000 where timestamp < 100000000000")
con.commit()
print(f'backfilled {before} mis-stamped rows (x1000)')
EOF

echo "== 6. restart under PM2 (same ecosystem limits) =="
pm2 restart bot-prime --update-env >/dev/null
sleep 6
pm2 list | grep -E 'bot-prime|flashpeak' || true

echo "== DEPLOY DONE =="
