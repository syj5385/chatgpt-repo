(() => {
  'use strict';

  const FAVORITES_KEY = 'fileserver-favorites';
  const SIDEBAR_KEY = 'fileserver-sidebar-collapsed';

  const sidebar = document.querySelector('.side');
  const work = document.querySelector('.work');
  const homeButton = document.getElementById('home');
  const trashButton = document.getElementById('trash');
  const backButton = document.getElementById('back');
  const addressBox = document.querySelector('.address');

  if (!sidebar || !work || !homeButton || !trashButton || !backButton || !addressBox) return;

  const style = document.createElement('style');
  style.textContent = `
    .work.fs-sidebar-collapsed{grid-template-columns:1fr}
    .work.fs-sidebar-collapsed>.side{display:none}
    .fs-sidebar-toggle{font-size:16px}
    .fs-favorites-title{display:flex!important;align-items:center;justify-content:space-between;margin-top:8px}
    .fs-favorites-list{display:grid;gap:2px}
    .fs-favorite-row{display:grid;grid-template-columns:minmax(0,1fr) 28px;align-items:center;border-radius:6px}
    .fs-favorite-row.active{background:var(--fs-selected,#e7f2ff)}
    .fs-favorite-open{min-width:0!important;display:flex;align-items:center;gap:8px;overflow:hidden}
    .fs-favorite-open span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fs-favorite-remove{width:28px!important;height:28px!important;padding:0!important;text-align:center!important;opacity:0;color:var(--fs-text-muted,#666)}
    .fs-favorite-row:hover .fs-favorite-remove,.fs-favorite-remove:focus{opacity:1}
    .fs-favorite-empty{padding:8px 12px 12px;color:var(--fs-text-muted,#666);font-size:12px;line-height:1.45}
    .fs-favorite-toggle{flex:0 0 auto;width:30px;height:30px;border:0;border-radius:5px;background:transparent;color:var(--fs-text-muted,#666);cursor:pointer;display:grid;place-items:center;font-size:17px;margin-left:2px}
    .fs-favorite-toggle:hover{background:var(--fs-surface-hover,#ededed);color:var(--fs-text,#202020)}
    .fs-favorite-toggle.active{color:#d99b00}
    .fs-favorite-toggle:disabled{opacity:.35;cursor:default;background:transparent}
    @media(max-width:720px){.fs-sidebar-toggle{display:none!important}}
  `;
  document.head.append(style);

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function currentPath() {
    const raw = location.hash.replace(/^#\/?/, '');
    const segments = raw.split('/').filter(Boolean);
    return segments.length ? `${segments.join('/')}/` : '';
  }

  function displayPath(path) {
    if (!path) return 'Home';
    return path.split('/').filter(Boolean).map(safeDecode).join(' / ');
  }

  function displayName(path) {
    if (!path) return 'Home';
    const segments = path.split('/').filter(Boolean);
    return safeDecode(segments.at(-1) || 'Home');
  }

  function readFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      const unique = new Set();
      return parsed
        .filter(item => typeof item === 'string')
        .map(item => item.replace(/^\/+/, '').replace(/\/*$/, '/'))
        .filter(item => item && !unique.has(item) && unique.add(item));
    } catch {
      return [];
    }
  }

  function writeFavorites(favorites) {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Favorites remain available for this page even if storage is unavailable.
    }
  }

  function readCollapsed() {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function writeCollapsed(collapsed) {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed));
    } catch {
      // The sidebar still changes for the current page.
    }
  }

  function notify(message) {
    const container = document.getElementById('toasts');
    if (!container) return;
    const item = document.createElement('div');
    item.textContent = message;
    container.append(item);
    setTimeout(() => item.remove(), 3000);
  }

  const title = document.createElement('small');
  title.className = 'fs-favorites-title';
  title.textContent = 'FAVORITE';

  const list = document.createElement('div');
  list.className = 'fs-favorites-list';
  list.setAttribute('aria-label', '즐겨찾기 경로');

  trashButton.insertAdjacentElement('afterend', title);
  title.insertAdjacentElement('afterend', list);

  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = 'fs-favorite-toggle';
  favoriteButton.setAttribute('aria-label', '현재 경로를 즐겨찾기에 추가');
  favoriteButton.textContent = '☆';

  const editButton = addressBox.querySelector('.fs-breadcrumb-edit');
  if (editButton) addressBox.insertBefore(favoriteButton, editButton);
  else addressBox.append(favoriteButton);

  const sidebarToggle = document.createElement('button');
  sidebarToggle.type = 'button';
  sidebarToggle.className = 'nav fs-sidebar-toggle';
  sidebarToggle.textContent = '☰';
  backButton.parentElement?.insertBefore(sidebarToggle, backButton);

  let favorites = readFavorites();

  function navigate(path) {
    location.hash = path ? `/${path}` : '/';
  }

  function renderFavorites() {
    const path = currentPath();
    const nodes = [];

    for (const favorite of favorites) {
      const row = document.createElement('div');
      row.className = `fs-favorite-row${favorite === path ? ' active' : ''}`;

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'fs-favorite-open';
      open.title = displayPath(favorite);
      const icon = document.createElement('span');
      icon.textContent = '★';
      const label = document.createElement('span');
      label.textContent = displayName(favorite);
      open.append(icon, label);
      open.addEventListener('click', () => navigate(favorite));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fs-favorite-remove';
      remove.setAttribute('aria-label', `${displayName(favorite)} 즐겨찾기 삭제`);
      remove.title = '즐겨찾기 삭제';
      remove.textContent = '×';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        favorites = favorites.filter(item => item !== favorite);
        writeFavorites(favorites);
        render();
        notify('즐겨찾기에서 제거했습니다.');
      });

      row.append(open, remove);
      nodes.push(row);
    }

    if (!nodes.length) {
      const empty = document.createElement('div');
      empty.className = 'fs-favorite-empty';
      empty.textContent = '경로 표시창의 ☆ 버튼을 눌러 현재 폴더를 추가하세요.';
      nodes.push(empty);
    }

    list.replaceChildren(...nodes);
  }

  function renderFavoriteButton() {
    const path = currentPath();
    const active = Boolean(path) && favorites.includes(path);
    favoriteButton.disabled = !path;
    favoriteButton.classList.toggle('active', active);
    favoriteButton.textContent = active ? '★' : '☆';
    favoriteButton.setAttribute(
      'aria-label',
      !path ? 'Home은 Quick access에서 사용할 수 있습니다.' : active ? '현재 경로를 즐겨찾기에서 제거' : '현재 경로를 즐겨찾기에 추가'
    );
    favoriteButton.title = favoriteButton.getAttribute('aria-label');
  }

  function setSidebarCollapsed(collapsed, persist = true) {
    work.classList.toggle('fs-sidebar-collapsed', collapsed);
    sidebarToggle.textContent = collapsed ? '☷' : '☰';
    sidebarToggle.setAttribute('aria-pressed', String(collapsed));
    sidebarToggle.setAttribute('aria-label', collapsed ? '왼쪽 영역 표시' : '왼쪽 영역 숨기기');
    sidebarToggle.title = collapsed ? '왼쪽 영역 표시' : '왼쪽 영역 숨기기';
    if (persist) writeCollapsed(collapsed);
  }

  function render() {
    renderFavorites();
    renderFavoriteButton();
  }

  favoriteButton.addEventListener('click', event => {
    event.stopPropagation();
    const path = currentPath();
    if (!path) return;

    if (favorites.includes(path)) {
      favorites = favorites.filter(item => item !== path);
      notify('즐겨찾기에서 제거했습니다.');
    } else {
      favorites.push(path);
      notify('현재 경로를 즐겨찾기에 추가했습니다.');
    }

    writeFavorites(favorites);
    render();
  });

  sidebarToggle.addEventListener('click', () => {
    setSidebarCollapsed(!work.classList.contains('fs-sidebar-collapsed'));
  });

  addEventListener('hashchange', render);
  addEventListener('storage', event => {
    if (event.key === FAVORITES_KEY) {
      favorites = readFavorites();
      render();
    }
    if (event.key === SIDEBAR_KEY) {
      setSidebarCollapsed(readCollapsed(), false);
    }
  });

  setSidebarCollapsed(readCollapsed(), false);
  render();
})();
