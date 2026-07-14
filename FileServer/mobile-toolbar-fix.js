(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const toastHost = byId('toasts');

  function toast(message) {
    if (!toastHost) return;
    const item = document.createElement('div');
    item.textContent = message;
    toastHost.append(item);
    setTimeout(() => item.remove(), 3500);
  }

  function clickOriginal(id) {
    const button = byId(id);
    if (!button) {
      toast('기능 버튼을 찾을 수 없습니다.');
      return;
    }
    button.click();
  }

  function createMenu(className, trigger, items) {
    if (!trigger) return;
    document.querySelector(`.${className}`)?.remove();

    const menu = document.createElement('div');
    menu.className = `mobile-action-menu ${className}`;
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.innerHTML = item.html;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        close();
        item.action();
      });
      menu.append(button);
    }
    document.body.append(menu);

    function position() {
      if (menu.hidden) return;
      const rect = trigger.getBoundingClientRect();
      const width = 190;
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - width - 6))}px`;
      menu.style.top = `${Math.max(6, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 6))}px`;
    }

    function open() {
      document.querySelectorAll('.mobile-action-menu').forEach(other => {
        if (other !== menu) other.hidden = true;
      });
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      position();
    }

    function close() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      menu.hidden ? open() : close();
    });

    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
    });
    window.addEventListener('resize', position, { passive: true });
    document.addEventListener('scroll', close, true);
  }

  const svg = path => `<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;

  createMenu('mobile-create-menu', byId('newCreateAction'), [
    {
      html: `${svg('<path d="M3 6.5h6l1.7 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>')}<span>새 폴더</span>`,
      action: () => clickOriginal('newFolder')
    },
    {
      html: `${svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/>')}<span>새 파일</span>`,
      action: () => clickOriginal('newFile')
    }
  ]);

  createMenu('mobile-upload-menu', byId('newUploadAction'), [
    {
      html: `${svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>')}<span>파일 업로드</span>`,
      action: () => byId('filePicker')?.click()
    },
    {
      html: `${svg('<path d="M3 7h6l1.7 2H21v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>')}<span>폴더 업로드</span>`,
      action: () => byId('folderPicker')?.click()
    }
  ]);

  const table = byId('table');
  const grid = byId('grid');
  const listButton = byId('listViewAction');
  const gridButton = byId('gridViewAction');

  function applyView(mode) {
    mode = mode === 'grid' ? 'grid' : 'list';
    localStorage.setItem('fs-view', mode);

    if (table) {
      table.hidden = mode !== 'list';
      table.style.setProperty('display', mode === 'list' ? 'table' : 'none', 'important');
    }
    if (grid) {
      grid.hidden = mode !== 'grid';
      grid.style.setProperty('display', mode === 'grid' ? 'grid' : 'none', 'important');
    }

    listButton?.classList.toggle('active', mode === 'list');
    gridButton?.classList.toggle('active', mode === 'grid');
    listButton?.setAttribute('aria-pressed', String(mode === 'list'));
    gridButton?.setAttribute('aria-pressed', String(mode === 'grid'));
  }

  listButton?.addEventListener('click', event => {
    event.preventDefault();
    applyView('list');
  });
  gridButton?.addEventListener('click', event => {
    event.preventDefault();
    applyView('grid');
  });
  applyView(localStorage.getItem('fs-view'));

  const topBar = document.querySelector('.app > .bar:first-child');
  const sidebar = document.querySelector('.side');
  if (topBar && sidebar) {
    let toggle = byId('mobileSidebarToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'mobileSidebarToggle';
      toggle.title = '사이드바 열기';
      toggle.setAttribute('aria-label', '사이드바 열기');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = svg('<path d="M4 6h16M4 12h16M4 18h16"/>');
    }
    topBar.prepend(toggle);

    sidebar.id ||= 'mobileSidebar';
    toggle.setAttribute('aria-controls', sidebar.id);

    document.querySelector('.mobile-sidebar-backdrop')?.remove();
    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'mobile-sidebar-backdrop';
    backdrop.setAttribute('aria-label', '사이드바 닫기');
    document.body.append(backdrop);

    function closeSidebar() {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('show');
      document.body.classList.remove('mobile-sidebar-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', event => {
      event.preventDefault();
      const open = !sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open', open);
      backdrop.classList.toggle('show', open);
      document.body.classList.toggle('mobile-sidebar-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    backdrop.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
    });
  }
})();
