(() => {
  'use strict';

  const folderButton = document.getElementById('newFolder');
  const fileButton = document.getElementById('newFile');
  const toolbar = document.querySelector('.toolbar');
  if (!folderButton || !fileButton || !toolbar) return;

  const createFolder = folderButton.onclick;
  const createFile = fileButton.onclick;

  folderButton.innerHTML = '<span class="create-plus-symbol">＋</span><span>새로 만들기</span><span class="create-menu-arrow">⌄</span>';
  folderButton.title = '새 폴더 또는 새 파일 만들기';
  folderButton.setAttribute('aria-haspopup', 'menu');
  folderButton.setAttribute('aria-expanded', 'false');
  folderButton.classList.add('create-menu-button');

  fileButton.hidden = true;
  fileButton.setAttribute('aria-hidden', 'true');

  const menu = document.createElement('div');
  menu.className = 'create-menu-popup';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  function item(icon, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.innerHTML = `<span class="create-menu-icon">${icon}</span><span>${label}</span>`;
    button.onclick = event => {
      event.stopPropagation();
      closeMenu();
      if (typeof action === 'function') action.call(event.currentTarget, event);
    };
    return button;
  }

  const newFolderItem = item('📁', '새 폴더', createFolder);
  const newFileItem = item('📄', '새 파일', createFile);
  menu.append(newFolderItem, newFileItem);
  document.body.append(menu);

  function positionMenu() {
    const rect = folderButton.getBoundingClientRect();
    const width = Math.max(190, rect.width);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(6, Math.min(rect.left, window.innerWidth - width - 6))}px`;
    menu.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - menu.offsetHeight - 6)}px`;
  }

  function openMenu() {
    menu.hidden = false;
    menu.classList.add('show');
    folderButton.setAttribute('aria-expanded', 'true');
    positionMenu();
    newFolderItem.focus();
  }

  function closeMenu() {
    menu.classList.remove('show');
    menu.hidden = true;
    folderButton.setAttribute('aria-expanded', 'false');
  }

  folderButton.onclick = event => {
    event.stopPropagation();
    menu.hidden ? openMenu() : closeMenu();
  };

  document.addEventListener('click', event => {
    if (!menu.contains(event.target) && event.target !== folderButton) closeMenu();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      folderButton.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (!menu.hidden) positionMenu();
  });
  document.addEventListener('scroll', () => {
    if (!menu.hidden) closeMenu();
  }, true);
})();
