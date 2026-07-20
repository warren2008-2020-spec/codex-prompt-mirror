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

test('summarizeSessions filters out obviously trivial hello-style sessions', () => {
  const { summarizeSessions } = require('./parser');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-mirror-filter-'));
  const nestedDir = path.join(tempRoot, '2026', '07', '20');
  fs.mkdirSync(nestedDir, { recursive: true });

  const meaningfulPath = path.join(nestedDir, 'rollout-meaningful.jsonl');
  fs.copyFileSync(fixturePath, meaningfulPath);

  const trivialPath = path.join(nestedDir, 'rollout-trivial.jsonl');
  fs.writeFileSync(trivialPath, [
    '{"timestamp":"2026-07-20T02:00:00.000Z","type":"session_meta","payload":{"id":"hello-session","timestamp":"2026-07-20T02:00:00.000Z","cwd":"E:\\\\tmp","source":"vscode"}}',
    '{"timestamp":"2026-07-20T02:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
    '{"timestamp":"2026-07-20T02:00:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
  ].join('\n'));

  const dashboard = summarizeSessions([tempRoot], 10);

  assert.equal(dashboard.overview.totalThreads, 1);
  assert.equal(dashboard.threads[0].sessionId, 'session-1');
});

test('summarizeSessions returns beginner-friendly review cards', () => {
  const { summarizeSessions } = require('./parser');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-mirror-review-'));
  const nestedDir = path.join(tempRoot, '2026', '07', '20');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.copyFileSync(fixturePath, path.join(nestedDir, 'rollout-sample.jsonl'));

  const dashboard = summarizeSessions([tempRoot], 10);

  assert.ok(Array.isArray(dashboard.reviewCards));
  assert.ok(dashboard.reviewCards.length > 0);
  assert.match(dashboard.reviewCards[0].title, /继续|重开|收尾/);
  assert.ok(dashboard.reviewCards[0].reason.length > 10);
  assert.ok(dashboard.reviewCards[0].nextStep.length > 10);
});

test('parseSessionFile marks hello-style sessions with environment boilerplate as trivial', () => {
  const { parseSessionFile, summarizeSessions } = require('./parser');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-mirror-env-'));
  const nestedDir = path.join(tempRoot, '2026', '07', '20');
  fs.mkdirSync(nestedDir, { recursive: true });

  const noisyPath = path.join(nestedDir, 'rollout-noisy.jsonl');
  fs.writeFileSync(noisyPath, [
    '{"timestamp":"2026-07-20T02:10:00.000Z","type":"session_meta","payload":{"id":"env-hello","timestamp":"2026-07-20T02:10:00.000Z","cwd":"E:\\\\tmp","source":"vscode"}}',
    '{"timestamp":"2026-07-20T02:10:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>E:\\\\tmp</cwd>\\n</environment_context>"}]}}',
    '{"timestamp":"2026-07-20T02:10:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
    '{"timestamp":"2026-07-20T02:10:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
  ].join('\n'));

  const summary = parseSessionFile(noisyPath);
  assert.equal(summary.userTurnCount, 3);

  const dashboard = summarizeSessions([tempRoot], 10);
  assert.equal(dashboard.overview.totalThreads, 0);
});

test('summarizeSessions filters hello-plus-error probe sessions', () => {
  const { summarizeSessions } = require('./parser');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-mirror-probe-'));
  const nestedDir = path.join(tempRoot, '2026', '07', '20');
  fs.mkdirSync(nestedDir, { recursive: true });

  const probePath = path.join(nestedDir, 'rollout-probe.jsonl');
  fs.writeFileSync(probePath, [
    '{"timestamp":"2026-07-20T02:20:00.000Z","type":"session_meta","payload":{"id":"probe-session","timestamp":"2026-07-20T02:20:00.000Z","cwd":"E:\\\\tmp","source":"vscode"}}',
    '{"timestamp":"2026-07-20T02:20:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\\n  <cwd>E:\\\\tmp</cwd>\\n</environment_context>"}]}}',
    '{"timestamp":"2026-07-20T02:20:02.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
    '{"timestamp":"2026-07-20T02:20:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"unexpected status 404 Not Found: Unknown error"}]}}',
    '{"timestamp":"2026-07-20T02:20:04.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}}',
  ].join('\n'));

  const dashboard = summarizeSessions([tempRoot], 10);
  assert.equal(dashboard.overview.totalThreads, 0);
});
