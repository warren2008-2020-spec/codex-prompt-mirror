const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const fixturePath = path.join(__dirname, 'fixtures', 'sample-session.jsonl');

test('parseSessionFile extracts user prompts and heuristics from one session file', () => {
  const { parseSessionFile } = require('./parser');
  const summary = parseSessionFile(fixturePath);

  assert.equal(summary.sessionId, 'session-1');
  assert.equal(summary.userTurnCount, 3);
  assert.equal(summary.cwd, 'E:\\下载\\codex文件夹');
  assert.match(summary.lastUserPrompt, /仪表盘/);
  assert.ok(summary.avgPromptLength > 10);
  assert.ok(summary.riskFlags.includes('scope-expansion'));
});

test('summarizeSessions aggregates top-level dashboard data across session roots', () => {
  const { summarizeSessions } = require('./parser');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-mirror-test-'));
  const nestedDir = path.join(tempRoot, '2026', '07', '20');
  fs.mkdirSync(nestedDir, { recursive: true });

  const target = path.join(nestedDir, 'rollout-sample.jsonl');
  fs.copyFileSync(fixturePath, target);

  const dashboard = summarizeSessions([tempRoot], 10);

  assert.equal(dashboard.overview.totalThreads, 1);
  assert.equal(dashboard.threads.length, 1);
  assert.match(dashboard.overview.recommendedAction, /重述|冻结|收敛/);
  assert.ok(dashboard.overview.avgClarityScore >= 0);
  assert.ok(Array.isArray(dashboard.signals));
});
