(() => {
  'use strict';

  const menu = document.getElementById('menu');
  if (!menu) return;

  function hasLabel(label) {
    return [...menu.querySelectorAll('button')].some(button => button.textContent.trim() === label);
  }

  function appendToolbarActions() {
    if (!menu.classList.contains('show') || menu.querySelector('[data-compact-toolbar-action]')) return;

    const divider = document.createElement('hr');
    divider.dataset.compactToolbarAction = 'true';

    const view = document.createElement('button');
    view.dataset.compactToolbarAction = 'true';
    view.textContent = '보기 방식 전환';
    view.onclick = () => {
      document.getElementById('viewToggle')?.click();
      menu.classList.remove('show');
    };

    const refresh = document.createElement('button');
    refresh.dataset.compactToolbarAction = 'true';
    refresh.textContent = '새로고침';
    refresh.onclick = () => {
      document.getElementById('refresh')?.click();
      menu.classList.remove('show');
    };

    menu.append(divider, view);
    if (!hasLabel('새로고침')) menu.append(refresh);
  }

  const observer = new MutationObserver(() => queueMicrotask(appendToolbarActions));
  observer.observe(menu, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
})();

(() => {
  'use strict';

  const sidebar = document.querySelector('.side');
  const themeButton = document.getElementById('themeButton');
  const pathStatus = document.getElementById('pathStatus');
  const toastHost = document.getElementById('toasts');
  if (!sidebar || !themeButton || !pathStatus) return;

  let copiedPaths = [];
  let csrf = '';

  function toast(message) {
    if (!toastHost) return;
    const item = document.createElement('div');
    item.textContent = message;
    toastHost.append(item);
    setTimeout(() => item.remove(), 4000);
  }

  async function loadCsrf() {
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.ok) csrf = (await response.json()).csrf_token || '';
    } catch { /* public mode or transient auth error */ }
  }

  function selectedPaths() {
    return [...document.querySelectorAll('#content [data-path].selected')]
      .map(element => element.dataset.path)
      .filter(Boolean)
      .filter((path, index, array) => array.indexOf(path) === index);
  }

  function currentFolder() {
    const text = pathStatus.textContent || '';
    return text.startsWith('/') ? text.slice(1).replace(/\/+$/, '') + '/' : '';
  }

  async function pasteCopied() {
    if (!copiedPaths.length) return toast('복사한 파일이나 폴더가 없습니다.');
    const destination = currentFolder();
    if (!destination) return toast('현재 위치에는 붙여넣을 수 없습니다.');

    try {
      const response = await fetch('/api/files/copy', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {})
        },
        body: JSON.stringify({ paths: copiedPaths, destination, overwrite: false })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.detail?.message || `HTTP ${response.status}`);
      toast(`${copiedPaths.length}개 항목을 붙여넣었습니다.`);
      document.getElementById('refresh')?.click();
    } catch (error) {
      toast(`붙여넣기 실패: ${error.message}`);
    }
  }

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;

    const key = event.key.toLowerCase();
    if (key === 'c') {
      const paths = selectedPaths();
      if (!paths.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      copiedPaths = paths;
      toast(`${paths.length}개 항목을 복사했습니다.`);
    }

    if (key === 'v') {
      event.preventDefault();
      event.stopImmediatePropagation();
      pasteCopied();
    }
  }, true);

  function moveToolsToBottom() {
    const headings = [...sidebar.querySelectorAll('small')];
    const toolsHeading = headings.find(item => item.textContent.trim() === '도구');
    if (!toolsHeading) return;
    const shares = document.getElementById('sharesButton');
    const theme = document.getElementById('themeButton');
    if (!shares || !theme) return;
    sidebar.append(toolsHeading, shares, theme);
  }

  const themeMenu = document.createElement('div');
  themeMenu.className = 'mobile-action-menu theme-choice-menu';
  themeMenu.hidden = true;
  themeMenu.setAttribute('role', 'menu');

  const choices = [
    ['auto', '시스템 설정'],
    ['light', '밝은 테마'],
    ['dark', '어두운 테마']
  ];

  function applyTheme(value) {
    if (value === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    localStorage.setItem('fs-theme', value);
    themeMenu.hidden = true;
    themeButton.setAttribute('aria-expanded', 'false');
    toast(`테마: ${choices.find(choice => choice[0] === value)?.[1] || value}`);
  }

  for (const [value, label] of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.textContent = label;
    button.onclick = event => {
      event.stopPropagation();
      applyTheme(value);
    };
    themeMenu.append(button);
  }
  document.body.append(themeMenu);

  function positionThemeMenu() {
    const rect = themeButton.getBoundingClientRect();
    const width = 190;
    themeMenu.style.width = `${width}px`;
    themeMenu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - width - 6))}px`;
    themeMenu.style.top = `${Math.max(6, Math.min(rect.bottom + 5, innerHeight - themeMenu.offsetHeight - 6))}px`;
  }

  themeButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    themeMenu.hidden = !themeMenu.hidden;
    themeButton.setAttribute('aria-expanded', String(!themeMenu.hidden));
    if (!themeMenu.hidden) positionThemeMenu();
  }, true);

  document.addEventListener('click', event => {
    if (!themeMenu.contains(event.target) && event.target !== themeButton) {
      themeMenu.hidden = true;
      themeButton.setAttribute('aria-expanded', 'false');
    }
  });

  themeButton.setAttribute('aria-haspopup', 'menu');
  themeButton.setAttribute('aria-expanded', 'false');
  moveToolsToBottom();
  loadCsrf();
})();
