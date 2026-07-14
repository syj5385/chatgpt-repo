(() => {
  'use strict';
  let csrf = '';

  function bytes(value) {
    let n = Number(value || 0), index = 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    while (n >= 1024 && index < units.length - 1) { n /= 1024; index++; }
    return `${n.toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
  }

  async function json(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.detail?.message || `HTTP ${response.status}`);
    return data;
  }

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrf);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { cache: 'no-store', ...options, headers });
    if (response.status === 204) return null;
    return json(response);
  }

  function metric(label, value) {
    const box = document.createElement('div');
    box.className = 'metric';
    box.append(label, Object.assign(document.createElement('b'), { textContent: value }));
    return box;
  }

  async function render() {
    const data = await api('/api/admin/storage');
    let panel = document.getElementById('storagePanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'storagePanel';
      panel.className = 'panel';
      document.querySelector('.admin-shell')?.append(panel);
    }
    panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'panel-head';
    head.innerHTML = '<h2>저장 공간 및 사용자 할당량</h2>';
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.style.padding = '14px';
    summary.append(metric('전체 디스크', bytes(data.disk.total)), metric('사용 중', bytes(data.disk.used)), metric('남은 공간', bytes(data.disk.free)), metric('활성 공유 링크', String(data.active_shares)));
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>사용자</th><th>상태</th><th>사용량</th><th>할당량(GB, 0=무제한)</th><th>작업</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const user of data.users) {
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = user.username;
      const status = document.createElement('td'); status.textContent = user.status;
      const used = document.createElement('td'); used.textContent = bytes(user.used_bytes);
      const quotaCell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.step = '1'; input.className = 'input'; input.style.width = '130px';
      input.value = user.quota_bytes ? String(Math.round(user.quota_bytes / 1024 ** 3)) : '0';
      quotaCell.append(input);
      const action = document.createElement('td');
      const save = document.createElement('button'); save.className = 'small-button primary'; save.textContent = '저장';
      save.onclick = async () => {
        save.disabled = true;
        try {
          await api(`/api/admin/storage/${user.id}/quota`, { method: 'POST', body: JSON.stringify({ quota_bytes: Math.max(0, Number(input.value || 0)) * 1024 ** 3 }) });
          save.textContent = '완료'; setTimeout(() => save.textContent = '저장', 1200);
        } catch (error) { alert(error.message); }
        finally { save.disabled = false; }
      };
      action.append(save); tr.append(name, status, used, quotaCell, action); tbody.append(tr);
    }
    table.append(tbody); wrap.append(table); panel.append(head, summary, wrap);
  }

  async function initialize() {
    try {
      const me = await json(await fetch('/api/auth/me', { cache: 'no-store' }));
      if (me.user?.role !== 'admin') return;
      csrf = me.csrf_token;
      await render();
    } catch (error) { console.error('Storage admin panel:', error); }
  }

  initialize();
})();
