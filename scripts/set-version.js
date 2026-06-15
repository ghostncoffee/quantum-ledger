#!/usr/bin/env node
// Sets the version field in every package.json / package-lock.json across
// the monorepo to a single value, so a release can't leave one sub-project
// behind. Edits files as text (not JSON.parse/stringify) so existing
// formatting, line endings, and key order are left untouched.
//
// Usage: node scripts/set-version.js <version>
//   e.g. node scripts/set-version.js 1.2.0

const fs = require('fs');
const path = require('path');

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: node scripts/set-version.js <version>  (e.g. 1.2.0)');
  process.exit(1);
}

// package.json has one top-level "version" field.
// package-lock.json (lockfileVersion 3) has two: the top-level one and
// packages[""].version, both near the top of the file, in that order.
const targets = [
  { path: 'quantum-ledger/package.json', occurrences: 1 },
  { path: 'quantum-ledger/package-lock.json', occurrences: 2 },
  { path: 'quantum-ledger/electron/package.json', occurrences: 1 },
  { path: 'quantum-ledger/electron/package-lock.json', occurrences: 2 },
  { path: 'quantum-ledger/server/package.json', occurrences: 1 },
  { path: 'quantum-ledger/server/package-lock.json', occurrences: 2 },
  { path: 'quantum-ledger/client/package.json', occurrences: 1 },
  { path: 'quantum-ledger/client/package-lock.json', occurrences: 2 },
  { path: 'quantum-org-server/package.json', occurrences: 1 },
  { path: 'quantum-org-server/package-lock.json', occurrences: 2 },
  { path: 'quantum-discord-bot/package.json', occurrences: 1 },
  { path: 'quantum-discord-bot/package-lock.json', occurrences: 2 },
];

const VERSION_LINE = /^(\s*"version":\s*)"[^"]*"/gm;

const root = path.join(__dirname, '..');

for (const { path: relPath, occurrences } of targets) {
  const filePath = path.join(root, relPath);
  const text = fs.readFileSync(filePath, 'utf8');

  let remaining = occurrences;
  const updated = text.replace(VERSION_LINE, (match, prefix) => {
    if (remaining <= 0) return match;
    remaining--;
    return `${prefix}"${version}"`;
  });

  if (remaining > 0) {
    throw new Error(`Expected ${occurrences} "version" field(s) in ${relPath}, only found ${occurrences - remaining}`);
  }

  fs.writeFileSync(filePath, updated);
  console.log(`Updated ${relPath} -> ${version}`);
}

console.log('\nDone. Review with "git diff", then update the relevant CHANGELOG(s) before committing.');
