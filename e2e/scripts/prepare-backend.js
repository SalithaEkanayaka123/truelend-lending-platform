'use strict';
// Resets e2e/.tmp before the backend starts: a fresh SQLite DB path and a
// private copy of the seed policy, so POST /api/policies never writes into
// the real backend/policies/ and every run starts from the seeded state.

const fs = require('node:fs');
const path = require('node:path');

const e2eDir = path.resolve(__dirname, '..');
const tmpDir = path.join(e2eDir, '.tmp');
const policiesDir = path.join(tmpDir, 'policies');
const seedPolicy = path.resolve(e2eDir, '..', 'backend', 'policies', 'policy_v0001.json');

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(policiesDir, { recursive: true });
fs.copyFileSync(seedPolicy, path.join(policiesDir, 'policy_v0001.json'));
console.log(`e2e: fresh state in ${tmpDir}`);
