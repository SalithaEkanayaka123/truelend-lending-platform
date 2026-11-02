#!/usr/bin/env node

'use strict';

// PreToolUse gate: money in backend/src is fixed-point (NFR-01).
//
// Blocks a Write/Edit/MultiEdit to backend/src/**/*.py whose NEW text either
//   - calls float(...), or
//   - declares a money-named field, parameter or return as float
//     (`amount: float`, `principal: Optional[float]`, `def emi(...) -> float`), or
//   - maps a money-named column to Float/REAL.
//
// Only the text being written is scanned, so an unrelated edit to a file that
// already holds a legacy float is not held hostage. Line numbers are relative to
// that new text. Not covered: multi-line signatures, Decimal(<float literal>),
// and SQL migrations (backend/migrations) — NFR-01's static scan owns those.
//
// Escapes: `# money-float-ok: <why>` on the line (for a non-money float such as
// a latency), or HARNESS_MONEY_FLOAT=off for the whole session. Fails open on
// malformed input or any internal error — a broken guard must not block work.

const { reportFailure } = require('./lib/common');

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const SRC_PY = /(?:^|\/)backend\/src\/.+\.py$/;
const MONEY = '(?:amount|principal|interest|emi|balance|outstanding|payable|installment|income|salary|fee|charge|overdue|price|rate|total|paid|disbursed|funding)';

const RULES = [
  { re: /(?<!\w)float\s*\(/, what: 'float() call' },
  {
    re: new RegExp(String.raw`\b\w*${MONEY}\w*\s*:\s*[^=\n]*\bfloat\b`, 'i'),
    what: 'money-named field or parameter typed float',
  },
  {
    re: new RegExp(String.raw`\bdef\s+\w*${MONEY}\w*\s*\(.*\)\s*->\s*[^:]*\bfloat\b`, 'i'),
    what: 'money-named function returning float',
  },
  {
    re: new RegExp(String.raw`\b\w*${MONEY}\w*\s*(?::[^=\n]*)?=\s*(?:mapped_column|Column)\(\s*(?:Float|REAL)\b`, 'i'),
    what: 'money-named column mapped to Float/REAL',
  },
];

/** The text a write-shaped call is about to put on disk, or null. */
function newText(input) {
  const ti = input.tool_input || {};
  if (input.tool_name === 'Write') return typeof ti.content === 'string' ? ti.content : null;
  if (input.tool_name === 'Edit') return typeof ti.new_string === 'string' ? ti.new_string : null;
  if (input.tool_name === 'MultiEdit' && Array.isArray(ti.edits)) {
    return ti.edits.map((e) => (e && typeof e.new_string === 'string' ? e.new_string : '')).join('\n');
  }
  return null;
}

/** Findings in a block of new text: [{line, what, text}]. */
function scan(text) {
  const findings = [];
  text.split('\n').forEach((raw, i) => {
    if (raw.includes('money-float-ok')) return;
    const code = raw.replace(/#.*$/, '');
    for (const rule of RULES) {
      if (rule.re.test(code)) {
        findings.push({ line: i + 1, what: rule.what, text: raw.trim() });
        return;
      }
    }
  });
  return findings;
}

/** Findings for a hook event, or null when the event is not this gate's business. */
function decide(input) {
  if (!input || !WRITE_TOOLS.has(input.tool_name || '')) return null;
  const file = (input.tool_input && input.tool_input.file_path) || '';
  if (!SRC_PY.test(String(file).split(String.fromCharCode(92)).join('/'))) return null;
  const text = newText(input);
  if (text === null) return null;
  const findings = scan(text);
  return findings.length ? { file: String(file), findings } : null;
}

function message({ file, findings }) {
  const lines = findings.map((f) => `  line ${f.line}: ${f.what} — ${f.text}`);
  return (
    `BLOCKED: floating-point money in ${file} (NFR-01).\n${lines.join('\n')}\n` +
    'Use Decimal built from a string or int, serialise as a 2-decimal string (see skill truelend-domain).\n' +
    'A float that is not money: add `# money-float-ok: <why>` on that line.\n'
  );
}

function main() {
  if ((process.env.HARNESS_MONEY_FLOAT || '').toLowerCase() === 'off') return;
  let input;
  try { input = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch (_) { return; }
  const result = decide(input);
  if (result) {
    process.stderr.write(message(result));
    process.exit(2);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    reportFailure('money-float-guard', err);
    // Fail open.
  }
}

module.exports = { decide, scan, newText };