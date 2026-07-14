(() => {
  'use strict';

  const toolbar = document.querySelector('.toolbar');
  const originalFolder = document.getElementById('newFolder');
  const originalFile = document.getElementById('newFile');
  const uploadFiles = document.getElementById('uploadFiles');
  const uploadFolder = document.getElementById('uploadFolder');
  const trigger = document.getElementById('newCreateAction');

  if (!toolbar || !originalFolder || !originalFile || !uploadFiles || !uploadFolder || !trigger) return;

  const icon = path => `<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  const icons = {
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

  function invokeOriginal(button) {
    if (typeof button.onclick === 'function') {
      button.onclick.call(button, new MouseEvent('click', { bubbles: false, cancelable: true }));
    } else {
      button.click();
    }
  }

  let menu = document.querySelector('.mobile-create-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.className = 'mobile-create-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  function createItem(label, iconPath, action) {
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

  const folderItem = createItem('새 폴더', icons.folder, () => invokeOriginal(originalFolder));
  const fileItem = createItem('새 파일', icons.file, () => invokeOriginal(originalFile));
  menu.append(folderItem, fileItem);
  document.body.append(menu);

  function positionMenu() {
    if (menu.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const width = 190;
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - width - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 6))}px`;
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionMenu();
    folderItem.focus();
  }

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  async function install() {
    await waitForOriginalHandlers();
    originalFolder.hidden = true;
    originalFile.hidden = true;
    originalFolder.setAttribute('aria-hidden', 'true');
    originalFile.setAttribute('aria-hidden', 'true');

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      menu.hidden ? openMenu() : closeMenu();
    }, true);

    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        closeMenu();
        trigger.focus();
      }
    });
    window.addEventListener('resize', positionMenu, { passive: true });
    document.addEventListener('scroll', closeMenu, true);
  }

  install();
})();
