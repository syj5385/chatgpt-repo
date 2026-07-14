(() => {
  'use strict';

  const toolbar = document.querySelector('.toolbar');
  const originalFolder = document.getElementById('newFolder');
  const originalFile = document.getElementById('newFile');
  const uploadFiles = document.getElementById('uploadFiles');
  const uploadFolder = document.getElementById('uploadFolder');

  if (!toolbar || !originalFolder || !originalFile || !uploadFiles || !uploadFolder) return;

  const icon = path => `<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  const icons = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    folder: '<path d="M3 6.5h6l1.7 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/>'
  };

  function waitForOriginalHandlers() {
    return new Promise(resolve => {
      const started = performance.now();
      const check = () => {
        if (typeof originalFolder.onclick === 'function' && typeof originalFile.onclick === 'function') return resolve();
        if (performance.now() - started > 5000) return resolve();
        requestAnimationFrame(check);
      };
      check();
    });
  }

  function createMenuButton(label, iconPath, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.innerHTML = `${icon(iconPath)}<span>${label}</span>`;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      action();
    });
    return button;
  }

  let proxy = null;
  let menu = null;

  function positionMenu() {
    if (!proxy || !menu || menu.hidden) return;
    const rect = proxy.getBoundingClientRect();
    const width = Math.max(190, rect.width);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - width - 6))}px`;
    const top = rect.bottom + 6;
    menu.style.top = `${Math.max(6, Math.min(top, innerHeight - menu.offsetHeight - 6))}px`;
  }

  function openMenu() {
    if (!menu || !proxy) return;
    menu.hidden = false;
    proxy.setAttribute('aria-expanded', 'true');
    positionMenu();
    menu.querySelector('button')?.focus();
  }

  function closeMenu() {
    if (!menu || !proxy) return;
    menu.hidden = true;
    proxy.setAttribute('aria-expanded', 'false');
  }

  async function install() {
    await waitForOriginalHandlers();

    document.querySelector('.create-menu-popup')?.remove();
    document.getElementById('newMenuButton')?.remove();
    document.getElementById('newCreateAction')?.remove();
    document.querySelector('.mobile-create-menu')?.remove();

    originalFolder.hidden = true;
    originalFile.hidden = true;
    originalFolder.setAttribute('aria-hidden', 'true');
    originalFile.setAttribute('aria-hidden', 'true');

    proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.id = 'newCreateAction';
    proxy.className = 'cmd';
    proxy.title = '새 파일 또는 새 폴더 만들기';
    proxy.setAttribute('aria-haspopup', 'menu');
    proxy.setAttribute('aria-expanded', 'false');
    proxy.innerHTML = `${icon(icons.plus)}<span class="create-label">새로 만들기</span><span class="create-chevron">${icon(icons.chevron)}</span>`;

    menu = document.createElement('div');
    menu.className = 'mobile-create-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    const folderItem = createMenuButton('새 폴더', icons.folder, () => {
      if (typeof originalFolder.onclick === 'function') originalFolder.onclick.call(originalFolder, new MouseEvent('click'));
      else originalFolder.click();
    });
    const fileItem = createMenuButton('새 파일', icons.file, () => {
      if (typeof originalFile.onclick === 'function') originalFile.onclick.call(originalFile, new MouseEvent('click'));
      else originalFile.click();
    });
    menu.append(folderItem, fileItem);

    toolbar.insertBefore(proxy, originalFolder);
    document.body.append(menu);

    proxy.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      menu.hidden ? openMenu() : closeMenu();
    }, true);

    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !proxy.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        closeMenu();
        proxy.focus();
      }
    });
    window.addEventListener('resize', () => menu.hidden ? undefined : positionMenu(), { passive: true });
    document.addEventListener('scroll', closeMenu, true);
  }

  install();
})();
