(() => {
  'use strict';

  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'MKCOL', 'MOVE', 'COPY']);
  const originalFetch = window.fetch.bind(window);
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  const state = { mode: 'unknown', csrfToken: '', user: null };

  function loginUrl() {
    return `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
  }

  function redirectToLogin() {
    if (!location.pathname.startsWith('/login')) location.replace(loginUrl());
  }

  function isProtectedFileRequest(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && (parsed.pathname === '/files' || parsed.pathname.startsWith('/files/'));
    } catch {
      return false;
    }
  }

  function installRequestProtection() {
    window.fetch = async (input, init = {}) => {
      const requestMethod = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const requestUrl = input instanceof Request ? input.url : String(input);
      let nextInit = init;

      if (state.mode === 'private' && state.csrfToken && MUTATING_METHODS.has(requestMethod) && isProtectedFileRequest(requestUrl)) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
        headers.set('X-CSRF-Token', state.csrfToken);
        nextInit = { ...init, headers };
      }

      const response = await originalFetch(input, nextInit);
      if (response.status === 401 && isProtectedFileRequest(requestUrl)) redirectToLogin();
      return response;
    };

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this.__fsMethod = String(method || 'GET').toUpperCase();
      this.__fsUrl = String(url || '');
      return originalXhrOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
      if (state.mode === 'private' && state.csrfToken && MUTATING_METHODS.has(this.__fsMethod) && isProtectedFileRequest(this.__fsUrl)) {
        this.setRequestHeader('X-CSRF-Token', state.csrfToken);
      }
      this.addEventListener('loadend', () => {
        if (this.status === 401 && isProtectedFileRequest(this.__fsUrl)) redirectToLogin();
      }, { once: true });
      return originalXhrSend.call(this, body);
    };
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .fs-account{position:relative;display:flex;align-items:center}
      .fs-account-button{height:30px;border:1px solid var(--fs-border-strong,#bbb);border-radius:999px;background:var(--fs-surface,#fff);color:var(--fs-text,#202020);padding:0 10px;display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;max-width:180px}
      .fs-account-button:hover{background:var(--fs-surface-hover,#ededed)}
      .fs-account-avatar{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;background:var(--fs-selected,#e7f2ff);color:var(--fs-accent,#0067c0);font-weight:700;font-size:10px}
      .fs-account-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fs-account-menu{display:none;position:absolute;right:0;top:36px;z-index:140;min-width:205px;padding:6px;background:var(--fs-surface,#fff);color:var(--fs-text,#202020);border:1px solid var(--fs-border-strong,#bbb);border-radius:9px;box-shadow:0 12px 30px var(--fs-shadow,#0003)}
      .fs-account-menu.show{display:block}
      .fs-account-summary{padding:9px 10px 10px;border-bottom:1px solid var(--fs-border,#ddd);margin-bottom:5px}
      .fs-account-summary strong,.fs-account-summary span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fs-account-summary span{font-size:11px;color:var(--fs-text-muted,#666);margin-top:3px}
      .fs-account-menu button,.fs-account-menu a{width:100%;height:34px;border:0;border-radius:6px;background:transparent;color:var(--fs-text,#202020);padding:0 10px;display:flex;align-items:center;text-align:left;text-decoration:none;cursor:pointer;font-size:13px}
      .fs-account-menu button:hover,.fs-account-menu a:hover{background:var(--fs-surface-hover,#ededed)}
      .fs-account-public{height:28px;display:inline-flex;align-items:center;gap:6px;padding:0 9px;border-radius:999px;background:var(--fs-surface-soft,#fafafa);color:var(--fs-text-muted,#666);font-size:12px}
      .fs-account-public::before{content:'';width:7px;height:7px;border-radius:50%;background:#16a34a}
      @media(max-width:600px){.fs-account-name{display:none}.fs-account-button{padding:0 7px}.fs-account{margin-left:auto}}
    `;
    document.head.append(style);
  }

  function createAccountUi() {
    const connection = document.getElementById('conn');
    const topBar = connection?.closest('.bar');
    if (!connection || !topBar) return;

    const container = document.createElement('div');
    container.className = 'fs-account';

    if (state.mode === 'public') {
      const label = document.createElement('span');
      label.className = 'fs-account-public';
      label.textContent = 'Public';
      label.title = '계정 없이 접속할 수 있는 공개 모드입니다.';
      container.append(label);
      topBar.insertBefore(container, connection);
      return;
    }

    const user = state.user;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fs-account-button';
    button.setAttribute('aria-expanded', 'false');
    const avatar = document.createElement('span');
    avatar.className = 'fs-account-avatar';
    avatar.textContent = (user.username || '?').slice(0, 1).toUpperCase();
    const name = document.createElement('span');
    name.className = 'fs-account-name';
    name.textContent = user.username;
    button.append(avatar, name, document.createTextNode('⌄'));

    const menu = document.createElement('div');
    menu.className = 'fs-account-menu';
    const summary = document.createElement('div');
    summary.className = 'fs-account-summary';
    const summaryName = document.createElement('strong');
    summaryName.textContent = user.username;
    const summaryRole = document.createElement('span');
    summaryRole.textContent = user.role === 'admin' ? '관리자 계정' : '사용자 계정';
    summary.append(summaryName, summaryRole);
    menu.append(summary);

    if (user.role === 'admin') {
      const admin = document.createElement('a');
      admin.href = '/admin';
      admin.textContent = '사용자 관리';
      menu.append(admin);
    }

    const password = document.createElement('a');
    password.href = '/change-password';
    password.textContent = '비밀번호 변경';
    menu.append(password);

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = '로그아웃';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        await originalFetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-CSRF-Token': state.csrfToken }
        });
      } finally {
        location.replace('/login');
      }
    });
    menu.append(logout);

    button.addEventListener('click', event => {
      event.stopPropagation();
      const open = !menu.classList.contains('show');
      menu.classList.toggle('show', open);
      button.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', () => {
      menu.classList.remove('show');
      button.setAttribute('aria-expanded', 'false');
    });

    container.append(button, menu);
    topBar.insertBefore(container, connection);
  }

  async function initialize() {
    try {
      const configResponse = await originalFetch('/api/auth/config', { cache: 'no-store' });
      if (!configResponse.ok) throw new Error('인증 설정을 불러올 수 없습니다.');
      const config = await configResponse.json();
      state.mode = config.mode;

      if (state.mode === 'private') {
        const meResponse = await originalFetch('/api/auth/me', { cache: 'no-store' });
        if (meResponse.status === 401) return redirectToLogin();
        if (!meResponse.ok) throw new Error('로그인 정보를 확인할 수 없습니다.');
        const me = await meResponse.json();
        state.user = me.user;
        state.csrfToken = me.csrf_token;
        if (state.user?.must_change_password && location.pathname !== '/change-password') {
          return location.replace('/change-password');
        }
      }

      installRequestProtection();
      addStyles();
      createAccountUi();
      window.FileServerAuth = Object.freeze({
        mode: state.mode,
        user: state.user,
        getCsrfToken: () => state.csrfToken
      });
    } catch (error) {
      console.error('FileServer authentication initialization failed:', error);
    }
  }

  initialize();
})();
