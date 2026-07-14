(() => {
  'use strict';

  let me = null;
  let csrf = '';
  const drawer = document.getElementById('drawer');
  const body = document.getElementById('drawerBody');

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

  function toast(message) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const item = document.createElement('div');
    item.textContent = message;
    host.append(item);
    setTimeout(() => item.remove(), 4500);
  }

  function drawerPath() {
    const kv = body?.querySelector('.kv');
    if (!kv) return '';
    const nodes = [...kv.children];
    for (let index = 0; index < nodes.length - 1; index += 2) {
      if (nodes[index].textContent === '경로') return nodes[index + 1].textContent.replace(/^\//, '');
    }
    return '';
  }

  function drawerIsDirectory() {
    const kv = body?.querySelector('.kv');
    if (!kv) return false;
    const nodes = [...kv.children];
    for (let index = 0; index < nodes.length - 1; index += 2) {
      if (nodes[index].textContent === '유형') return nodes[index + 1].textContent === 'directory';
    }
    return false;
  }

  async function addCollaborationSection() {
    if (!me?.authenticated || !body || body.querySelector('[data-extra-collaboration]')) return;
    const path = drawerPath();
    if (!path) return;

    const section = document.createElement('section');
    section.className = 'drawer-section';
    section.dataset.extraCollaboration = 'true';
    const title = document.createElement('h3');
    title.textContent = '협업 및 잠금';
    const state = document.createElement('div');
    state.className = 'muted';
    state.textContent = '잠금 상태 확인 중…';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:10px';
    section.append(title, state, actions);
    body.append(section);

    if (!drawerIsDirectory()) {
      try {
        const data = await api('/api/files/lock?path=' + encodeURIComponent(path));
        const lock = data.lock;
        state.textContent = lock ? `${lock.username} · ${new Date(lock.expires_at).toLocaleString()}까지 잠금` : '잠금 없음';
        const button = document.createElement('button');
        button.className = 'btn';
        const mine = lock && (lock.user_id === me.user.id || me.user.role === 'admin');
        button.textContent = lock ? (mine ? '잠금 해제' : '다른 사용자가 잠금') : '1시간 잠금';
        button.disabled = !!lock && !mine;
        button.onclick = async () => {
          try {
            if (lock) await api('/api/files/lock?path=' + encodeURIComponent(path), { method: 'DELETE' });
            else await api('/api/files/lock', { method: 'POST', body: JSON.stringify({ path, minutes: 60 }) });
            toast(lock ? '파일 잠금을 해제했습니다.' : '파일을 1시간 잠갔습니다.');
            section.remove();
            addCollaborationSection();
          } catch (error) { toast(error.message); }
        };
        actions.append(button);
      } catch (error) {
        state.textContent = error.message;
      }
    } else {
      state.textContent = '폴더는 업로드 전용 제출함으로 공유할 수 있습니다.';
      const uploadShare = document.createElement('button');
      uploadShare.className = 'btn primary';
      uploadShare.textContent = '업로드 전용 링크';
      uploadShare.onclick = async () => {
        const password = prompt('공유 비밀번호를 입력하세요. 비밀번호 없이 만들려면 비워두세요.', '') ?? null;
        if (password === null) return;
        const days = Number(prompt('링크 만료 일수', '7') || 7);
        try {
          const share = await api('/api/files/shares', {
            method: 'POST',
            body: JSON.stringify({ path, permission: 'upload', password: password || null, expires_days: Math.max(1, days), max_downloads: null })
          });
          const url = new URL(share.url, location.origin).href;
          await navigator.clipboard?.writeText(url);
          toast('업로드 전용 링크를 복사했습니다: ' + url);
        } catch (error) { toast(error.message); }
      };
      actions.append(uploadShare);
    }
  }

  async function initialize() {
    try {
      const data = await json(await fetch('/api/auth/me', { cache: 'no-store' }));
      if (data.mode === 'public') return;
      me = data;
      csrf = data.csrf_token;
    } catch {
      return;
    }

    const observer = new MutationObserver(() => {
      if (drawer?.classList.contains('show')) queueMicrotask(addCollaborationSection);
    });
    if (body) observer.observe(body, { childList: true, subtree: true });

    setTimeout(() => {
      const address = document.getElementById('address');
      const home = document.querySelector('.side button[data-view="home"]');
      if (address?.value === 'FileServer' && home) home.click();
    }, 500);
  }

  initialize();
})();
