function scoreTone(score) {
  if (score >= 80) return 'good';
  if (score >= 64) return 'warn';
  return 'danger';
}

function formatDate(value) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function renderOverview(overview) {
  const cards = [
    ['Recent Threads', overview.totalThreads, '最近读取到的本地线程数'],
    ['Avg Clarity', overview.avgClarityScore, '提示词清晰度均分'],
    ['Risky Threads', overview.riskyThreads, '存在扩题或反复追问的线程'],
  ];

  return cards.map(([label, value, detail]) => `
    <article class="stat-card">
      <p class="label">${label}</p>
      <h3>${value}</h3>
      <p>${detail}</p>
    </article>
  `).join('');
}

function renderSignals(signals) {
  if (!signals.length) {
    return '<div class="empty">最近线程没有明显风险信号。</div>';
  }

  return signals.map((signal) => `
    <article class="signal-item">
      <h3>${signal.title}</h3>
      <p>${signal.detail}</p>
    </article>
  `).join('');
}

function renderThreads(threads) {
  if (!threads.length) {
    return '<div class="empty">没有找到可读取的本地会话。</div>';
  }

  return threads.map((thread) => {
    const tone = scoreTone(thread.score);
    const flags = thread.riskFlags.length
      ? thread.riskFlags.map((flag) => `<span class="mini-pill">${flag}</span>`).join('')
      : '<span class="mini-pill neutral">stable</span>';

    return `
      <article class="thread-item ${tone}">
        <div class="thread-main">
          <div class="thread-top">
            <div>
              <h3>${thread.sessionId}</h3>
              <p class="subtle">${thread.cwd || 'unknown cwd'}</p>
            </div>
            <div class="score-box">
              <strong>${thread.score}</strong>
              <span>score</span>
            </div>
          </div>
          <p class="thread-prompt">${thread.lastUserPrompt || 'No user prompt found.'}</p>
          <div class="thread-meta">
            <span>${thread.userTurnCount} user turns</span>
            <span>avg ${thread.avgPromptLength} chars</span>
            <span>last ${formatDate(thread.lastActivityAt)}</span>
          </div>
          <div class="flag-row">${flags}</div>
        </div>
      </article>
    `;
  }).join('');
}

async function loadDashboard() {
  const status = document.getElementById('status');
  const overview = document.getElementById('overview');
  const signals = document.getElementById('signals');
  const threadList = document.getElementById('threadList');
  const actionBlock = document.getElementById('actionBlock');
  const rootHint = document.getElementById('rootHint');

  try {
    const response = await fetch('/api/summary?limit=12');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'Unknown error');
    }

    status.className = 'status-card ready';
    status.textContent = `已读取 ${payload.overview.totalThreads} 个本地线程，生成时间 ${formatDate(payload.generatedAt)}。`;
    overview.innerHTML = renderOverview(payload.overview);
    signals.innerHTML = renderSignals(payload.signals);
    threadList.innerHTML = renderThreads(payload.threads);
    actionBlock.textContent = payload.overview.recommendedAction;
    rootHint.textContent = payload.roots.join(' | ');
  } catch (error) {
    status.className = 'status-card error';
    status.textContent = `读取失败：${error.message}`;
    overview.innerHTML = '';
    signals.innerHTML = '<div class="empty">当前没有可展示的数据。</div>';
    threadList.innerHTML = '<div class="empty">请确认本机存在 .codex 会话目录。</div>';
    actionBlock.textContent = '先修复数据接入，再继续做复盘。';
    rootHint.textContent = '';
  }
}

loadDashboard();
