#!/usr/bin/env node
// Fast dataset integrity check for CI (no full reprocessing).
// Verifies: source hash matches the recorded provenance, every derived artifact
// exists non-empty, counts agree across artifacts, and the quality report passed.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

const SEED = 'data/seed';
const SOURCE = 'data/source';
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const meta = JSON.parse(readFileSync(`${SEED}/dataset-meta.json`, 'utf-8'));

// 1. Immutable source, hash-verified.
const txtPath = `${SOURCE}/WhatsApp Chat with AVOID PRIME  FT.txt`;
check('source archive present', existsSync(txtPath));
if (existsSync(txtPath)) {
  const sha = createHash('sha256').update(readFileSync(txtPath)).digest('hex');
  check('source sha256 matches recorded provenance', sha === meta.source_sha256, sha.slice(0, 16) + '…');
}

// 2. Required derived artifacts exist and are non-empty.
const required = [
  'normalized-messages.jsonl', 'participants.json', 'statistics.json', 'language-profile.json',
  'community-lore.json', 'conversation-summaries.json', 'semantic-index.jsonl',
  'semantic-index.sqlite', 'quality-report.json', 'quality-report.md', 'dataset-meta.json',
  'parse-summary.json', 'comparison.json',
];
for (const f of required) {
  const p = `${SEED}/${f}`;
  const ok = existsSync(p) && statSync(p).size > 0;
  check(`artifact ${f}`, ok);
}

// 3. Cross-artifact count agreement.
const summary = JSON.parse(readFileSync(`${SEED}/parse-summary.json`, 'utf-8'));
const participants = JSON.parse(readFileSync(`${SEED}/participants.json`, 'utf-8'));
check('participants count = 25', participants.count === 25, String(participants.count));
const quality = JSON.parse(readFileSync(`${SEED}/quality-report.json`, 'utf-8'));
check('quality report: all checks passed', quality.all_checks_passed === true);
check('parse diagnostics = 0', summary.diagnostics_count === 0, String(summary.diagnostics_count));

// 4. Message rows line up with the parse summary.
let lines = 0;
if (existsSync(`${SEED}/normalized-messages.jsonl`)) {
  lines = readFileSync(`${SEED}/normalized-messages.jsonl`, 'utf-8').split('\n').filter((l) => l.trim()).length;
}
check('normalized record count = parse summary', lines === summary.parse.records, `${lines} vs ${summary.parse.records}`);

// 5. Curated lore present and citation-verified by the pipeline.
const lore = JSON.parse(readFileSync(`${SEED}/community-lore.json`, 'utf-8'));
check('curated lore entries present', Array.isArray(lore.curated) && lore.curated.length === 10, String(lore.curated?.length));
check('lore citations verified by pipeline', lore.curated_citations_all_verified === true);

if (failures > 0) {
  console.error(`dataset verify: ${failures} failure(s)`);
  process.exit(1);
}
console.log('dataset verify: ALL PASS');
