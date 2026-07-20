function formatDate(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function summarizeSessionLabel(thread) {
  if (thread.riskFlags.includes('scope-expansion')) return '建议重开';
  if (thread.riskFlags.includes('repeated-questioning')) return '先收一下';
  return '可以继续';
}

function renderOverview(overview) {
  const cards = [
    ['最近有效对话', overview.totalThreads, '自动跳过明显测试型内容后，剩下的可用对话数量'],
    ['当前容易跑偏的对话', overview.riskyThreads, '说明你最近有一些对话已经开始加范围而不是加清晰度'],
    ['整体清晰度', overview.avgClarityScore, '这是一个粗略分数，只用来提醒，不用来评判你'],
  ];

  return cards.map(([title, value, detail]) => `
    <article class="stat-card">
      <p class="label">${title}</p>
      <h3>${value}</h3>
      <p>${detail}</p>
    </article>
  `).join('');
}

function renderReviewCards(cards) {
  if (!cards.length) {
    return '<div class="empty">最近没有足够的有效对话可以生成复盘建议。</div>';
  }

  return cards.map((card) => `
    <article class="review-card">
      <div class="review-head">
        <h3>${card.title}</h3>
        <span class="mini-pill">${card.sessionId}</span>
      </div>
      <p class="reason">${card.reason}</p>
      <div class="evidence-box">
        <strong>为什么这么说</strong>
        <p>${card.evidencePreview}</p>
      </div>
      <div class="step-box">
        <strong>你可以直接这样继续</strong>
        <p>${card.nextStep}</p>
      </div>
    </article>
  `).join('');
}

function renderSignals(signals) {
  if (!signals.length) {
    return '<div class="empty">最近没有特别明显的共性问题。</div>';
  }

  return signals.map((signal) => `
    <article class="signal-item">
      <h3>${signal.title}</h3>
      <p>${signal.detail}</p>
    </article>
  `).join('');
}

function renderSessionList(threads) {
  if (!threads.length) {
    return '<div class="empty">没有可展示的有效对话。</div>';
  }

  return threads.slice(0, 5).map((thread) => `
    <article class="session-card">
      <div class="session-top">
        <h3>${summarizeSessionLabel(thread)}</h3>
        <span>${formatDate(thread.lastActivityAt)}</span>
      </div>
      <p>${thread.lastUserPrompt || '没有提取到用户输入。'}</p>
      <div class="session-meta">
        <span>${thread.userTurnCount} 轮用户输入</span>
        <span>平均 ${thread.avgPromptLength} 字</span>
      </div>
    </article>
  `).join('');
}

async function loadDashboard() {
  const status = document.getElementById('status');
  const overview = document.getElementById('overview');
  const reviewCards = document.getElementById('reviewCards');
  const signals = document.getElementById('signals');
  const sessionList = document.getElementById('sessionList');
  const actionBlock = document.getElementById('actionBlock');
  const rootHint = document.getElementById('rootHint');

  try {
    const response = await fetch('/api/summary?limit=12');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'Unknown error');
    }

    status.className = 'status-card ready';
    status.textContent = `已读取 ${payload.overview.totalThreads} 个有效对话，生成时间 ${formatDate(payload.generatedAt)}。`;
    overview.innerHTML = renderOverview(payload.overview);
    reviewCards.innerHTML = renderReviewCards(payload.reviewCards || []);
    signals.innerHTML = renderSignals(payload.signals || []);
    sessionList.innerHTML = renderSessionList(payload.threads || []);
    actionBlock.textContent = payload.overview.recommendedAction;
    rootHint.textContent = '默认只显示整理后的摘要建议，不直接展开原始对话。';
  } catch (error) {
    status.className = 'status-card error';
    status.textContent = `读取失败：${error.message}`;
    overview.innerHTML = '';
    reviewCards.innerHTML = '<div class="empty">暂时无法生成复盘建议。</div>';
    signals.innerHTML = '<div class="empty">当前没有可展示的数据。</div>';
    sessionList.innerHTML = '<div class="empty">请确认本机存在可读取的 Codex 会话目录。</div>';
    actionBlock.textContent = '先修复数据接入，再继续做复盘。';
    rootHint.textContent = '';
  }
}

loadDashboard();
