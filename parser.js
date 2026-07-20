const fs = require('node:fs');
const path = require('node:path');

function extractUserText(payload) {
  if (!payload || payload.type !== 'message' || payload.role !== 'user') {
    return '';
  }

  const parts = Array.isArray(payload.content) ? payload.content : [];
  return parts
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n');
}

function computeRiskFlags(messages) {
  const joined = messages.join('\n');
  const flags = [];

  if (messages.length >= 3 && /再|另外|还要|加一个|顺便/i.test(joined)) {
    flags.push('scope-expansion');
  }

  const questionCount = messages.reduce((count, text) => count + ((text.match(/[?？]/g) || []).length), 0);
  if (questionCount >= 2) {
    flags.push('repeated-questioning');
  }

  return flags;
}

function computeScore(messages, riskFlags) {
  const avgLength = messages.length
    ? messages.reduce((sum, text) => sum + text.length, 0) / messages.length
    : 0;

  let score = 86;
  if (avgLength < 18) score -= 10;
  if (avgLength > 120) score -= 8;
  score -= riskFlags.length * 12;

  return Math.max(24, Math.min(96, Math.round(score)));
}

function isTrivialSession(summary) {
  if (!summary.userMessages.length) return true;
  const normalizedMessages = summary.userMessages
    .map((text) => text.trim().toLowerCase())
    .filter(Boolean);
  const meaningfulMessages = normalizedMessages.filter((text) => !text.startsWith('<environment_context>'));
  const probeLikeMessages = meaningfulMessages.filter((text) =>
    /^(hello|hi|test|ping|ok|okay|thanks|thank you)$/.test(text) ||
    /^unexpected status\b/.test(text) ||
    /\bunknown error\b/.test(text)
  );

  if (!meaningfulMessages.length) return true;

  if (meaningfulMessages.length <= 3) {
    const joined = meaningfulMessages.join(' ').trim();
    if (/^(hello|hi|test|ping|ok|okay|thanks|thank you)(\s+(hello|hi|test|ping|ok|okay|thanks|thank you))*$/.test(joined)) {
      return true;
    }
  }

  if (meaningfulMessages.length <= 4 && probeLikeMessages.length === meaningfulMessages.length) {
    return true;
  }

  return false;
}

function makeReason(summary) {
  if (summary.riskFlags.includes('scope-expansion')) {
    return '后面几轮里，这段对话开始加入新的目标，原来的重点被挤散了。';
  }

  if (summary.riskFlags.includes('repeated-questioning')) {
    return '这段对话里出现了重复确认，说明你可能还没有把真正想做的事说稳。';
  }

  if (summary.userTurnCount >= 6) {
    return '这段对话已经聊得比较长，但目标还算集中，值得继续往前推进。';
  }

  return '这段对话的目标相对单一，没有明显跑偏，继续推进的成本更低。';
}

function makeNextStep(summary) {
  if (summary.riskFlags.includes('scope-expansion')) {
    return '新开一个对话，只保留现在最想推进的那一件事，别把旁支目标一起带进去。';
  }

  if (summary.riskFlags.includes('repeated-questioning')) {
    return '先用一句话重新说目标，再让 Codex 复述一遍它理解到的任务。';
  }

  return '继续这个对话，但下一句只补最关键的输入或验收条件，不要再扩大范围。';
}

function buildReviewCards(threads) {
  return threads.slice(0, 3).map((thread) => {
    const restart = thread.riskFlags.includes('scope-expansion');
    return {
      sessionId: thread.sessionId,
      title: restart ? '这段对话建议重开' : '这段对话还值得继续',
      reason: makeReason(thread),
      nextStep: makeNextStep(thread),
      evidencePreview: restart
        ? '后面加入了新的目标，之后没有再稳定回到原来的重点。'
        : '目前没有明显跑偏，内容还围着同一个方向在推进。',
    };
  });
}

function parseSessionFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  let sessionId = path.basename(filePath);
  let startedAt = null;
  let cwd = '';
  let lastTimestamp = null;
  const userMessages = [];

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.type === 'session_meta' && record.payload) {
      sessionId = record.payload.session_id || record.payload.id || sessionId;
      startedAt = record.payload.timestamp || record.timestamp || startedAt;
      cwd = record.payload.cwd || cwd;
    }

    if (record.type === 'response_item' && record.payload) {
      const text = extractUserText(record.payload);
      if (text) {
        userMessages.push(text);
        lastTimestamp = record.timestamp || lastTimestamp;
      }
    }
  }

  const avgPromptLength = userMessages.length
    ? Math.round(userMessages.reduce((sum, text) => sum + text.length, 0) / userMessages.length)
    : 0;
  const riskFlags = computeRiskFlags(userMessages);
  const score = computeScore(userMessages, riskFlags);

  return {
    sessionId,
    sourcePath: filePath,
    startedAt,
    lastActivityAt: lastTimestamp || startedAt,
    cwd,
    userMessages,
    userTurnCount: userMessages.length,
    avgPromptLength,
    lastUserPrompt: userMessages[userMessages.length - 1] || '',
    riskFlags,
    score,
  };
}

function scanSessionFiles(rootPaths, limit = 40) {
  const matches = [];

  function walk(currentPath) {
    if (matches.length >= limit) return;

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= limit) return;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /^rollout-.*\.jsonl$/i.test(entry.name)) {
        matches.push(fullPath);
      }
    }
  }

  for (const rootPath of rootPaths) {
    if (!rootPath || !fs.existsSync(rootPath)) continue;
    walk(rootPath);
  }

  return matches
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.filePath);
}

function buildSignals(threads) {
  const highRisk = threads.filter((thread) => thread.riskFlags.includes('scope-expansion')).length;
  const repeated = threads.filter((thread) => thread.riskFlags.includes('repeated-questioning')).length;
  const longThreads = threads.filter((thread) => thread.userTurnCount >= 8).length;

  const signals = [];
  if (highRisk) {
    signals.push({
      key: 'scope-expansion',
      title: '目标后移',
      detail: `${highRisk} 个线程存在连续加需求或扩题迹象。`,
    });
  }
  if (repeated) {
    signals.push({
      key: 'repeated-questioning',
      title: '反复追问',
      detail: `${repeated} 个线程出现重复提问或多次确认。`,
    });
  }
  if (longThreads) {
    signals.push({
      key: 'long-thread',
      title: '长线程堆积',
      detail: `${longThreads} 个线程的用户轮次较长，适合评估是否重开。`,
    });
  }

  return signals;
}

function recommendedAction(threads) {
  const drifting = threads.find((thread) => thread.riskFlags.includes('scope-expansion'));
  if (drifting) {
    return '先冻结目标，再把最高漂移线程重述成单一交付。';
  }

  return '保持一个主线程推进，把侧向想法收敛到独立线程。';
}

function summarizeSessions(rootPaths, limit = 24) {
  const files = scanSessionFiles(rootPaths, limit);
  const threads = files
    .map(parseSessionFile)
    .filter((thread) => !isTrivialSession(thread));
  const avgClarityScore = threads.length
    ? Math.round(threads.reduce((sum, thread) => sum + thread.score, 0) / threads.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalThreads: threads.length,
      avgClarityScore,
      riskyThreads: threads.filter((thread) => thread.riskFlags.length > 0).length,
      recommendedAction: recommendedAction(threads),
    },
    signals: buildSignals(threads),
    reviewCards: buildReviewCards(threads),
    threads: threads
      .sort((a, b) => {
        if (b.riskFlags.length !== a.riskFlags.length) {
          return b.riskFlags.length - a.riskFlags.length;
        }
        return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '');
      }),
  };
}

module.exports = {
  parseSessionFile,
  scanSessionFiles,
  summarizeSessions,
};
