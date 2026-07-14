(() => {
  'use strict';

  const toolbar = document.querySelector('.toolbar');
  const originalFolder = document.getElementById('newFolder');
  const originalFile = document.getElementById('newFile');
  const originalUploadFiles = document.getElementById('uploadFiles');
  const originalUploadFolder = document.getElementById('uploadFolder');
  const originalViewToggle = document.getElementById('viewToggle');
  const createTrigger = document.getElementById('newCreateAction');
  const uploadTrigger = document.getElementById('newUploadAction');
  const listTrigger = document.getElementById('listViewAction');
  const gridTrigger = document.getElementById('gridViewAction');

  if (!toolbar || !originalFolder || !originalFile || !originalUploadFiles || !originalUploadFolder || !originalViewToggle || !createTrigger || !uploadTrigger || !listTrigger || !gridTrigger) return;

  const icon = path => `<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  const icons = {
    folder: '<path d="M3 6.5h6l1.7 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/>',
    uploadFile: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
    uploadFolder: '<path d="M3 7h6l1.7 2H21v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>'
  };

  function waitForOriginalHandlers() {
    return new Promise(resolve => {
      const started = performance.now();
      const check = () => {
        const ready = [originalFolder, originalFile, originalUploadFiles, originalUploadFolder, originalViewToggle]
          .every(button => typeof button.onclick === 'function');
        if (ready || performance.now() - started > 5000) return resolve();
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

  function createMenu(className) {
    document.querySelector(`.${className}`)?.remove();
    const menu = document.createElement('div');
    menu.className = `mobile-action-menu ${className}`;
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.append(menu);
    return menu;
  }

  function createItem(label, iconPath, action, close) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.innerHTML = `${icon(iconPath)}<span>${label}</span>`;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      close();
      action();
    });
    return button;
  }

  function attachMenu(trigger, menu, items) {
    items.forEach(item => menu.append(item));

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
      menu.querySelector('button')?.focus();
    }

    function close() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      menu.hidden ? open() : close();
    }, true);

    document.addEventListener('click', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !menu.hidden) {
        close();
        trigger.focus();
      }
    });
    window.addEventListener('resize', position, { passive: true });
    document.addEventListener('scroll', close, true);
    return close;
  }

  function setView(mode) {
    const current = localStorage.getItem('fs-view') === 'grid' ? 'grid' : 'list';
    if (current !== mode) invokeOriginal(originalViewToggle);
    localStorage.setItem('fs-view', mode);
    updateViewButtons();
    window.dispatchEvent(new StorageEvent('storage', { key: 'fs-view', newValue: mode }));
  }

  function updateViewButtons() {
    const mode = localStorage.getItem('fs-view') === 'grid' ? 'grid' : 'list';
    listTrigger.classList.toggle('active', mode === 'list');
    gridTrigger.classList.toggle('active', mode === 'grid');
    listTrigger.setAttribute('aria-pressed', String(mode === 'list'));
    gridTrigger.setAttribute('aria-pressed', String(mode === 'grid'));
  }

  async function install() {
    await waitForOriginalHandlers();

    [originalFolder, originalFile, originalUploadFiles, originalUploadFolder, originalViewToggle].forEach(button => {
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
    });

    const createMenu = createMenu('mobile-create-menu');
    let closeCreate;
    const createItems = [
      createItem('새 폴더', icons.folder, () => invokeOriginal(originalFolder), () => closeCreate?.()),
      createItem('새 파일', icons.file, () => invokeOriginal(originalFile), () => closeCreate?.())
    ];
    closeCreate = attachMenu(createTrigger, createMenu, createItems);

    const uploadMenu = createMenu('mobile-upload-menu');
    let closeUpload;
    const uploadItems = [
      createItem('파일 업로드', icons.uploadFile, () => invokeOriginal(originalUploadFiles), () => closeUpload?.()),
      createItem('폴더 업로드', icons.uploadFolder, () => invokeOriginal(originalUploadFolder), () => closeUpload?.())
    ];
    closeUpload = attachMenu(uploadTrigger, uploadMenu, uploadItems);

    listTrigger.addEventListener('click', event => {
      event.preventDefault();
      setView('list');
    });
    gridTrigger.addEventListener('click', event => {
      event.preventDefault();
      setView('grid');
    });

    updateViewButtons();
    window.addEventListener('storage', event => {
      if (event.key === 'fs-view') updateViewButtons();
    });
  }

  install();
})();
