'use strict';
// Run with: node --test scripts   (from e2e/)

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const e2eDir = path.resolve(__dirname, '..');
const tmpDir = path.join(e2eDir, '.tmp');
const script = path.join(__dirname, 'prepare-backend.js');
const seed = path.resolve(e2eDir, '..', 'backend', 'policies', 'policy_v0001.json');

test('wipes stale state and leaves a private copy of the seed policy', () => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'e2e.db'), 'stale');

  execFileSync(process.execPath, [script]);

  assert.equal(fs.existsSync(path.join(tmpDir, 'e2e.db')), false);
  const copy = path.join(tmpDir, 'policies', 'policy_v0001.json');
  assert.deepEqual(fs.readFileSync(copy), fs.readFileSync(seed));
});

test('never touches the real backend/policies directory', () => {
  const before = fs.readdirSync(path.dirname(seed)).sort();
  execFileSync(process.execPath, [script]);
  assert.deepEqual(fs.readdirSync(path.dirname(seed)).sort(), before);
});
