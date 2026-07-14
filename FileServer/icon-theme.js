(() => {
  'use strict';

  const paths = {
    folder: '<path d="M3 6.5h6l1.7 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/>',
    note: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
    folderUpload: '<path d="M3 7h6l1.7 2H21v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5.5 10.5V21h13V10.5"/><path d="M10 21v-6h4v6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    recent: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    activity: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M12 10v4M16 16v4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    forward: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
    move: '<path d="M5 12h14M14 7l5 5-5 5"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    archive: '<path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3zM9 11h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.2-2L20 12M4 12l2.7 6a7 7 0 0 0 11.2-2"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
    audio: '<path d="M9 18V6l9-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="15" cy="16" r="3"/>',
    pdf: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9 16h6M9 12h4"/>',
    chevronDown: '<path d="m8 10 4 4 4-4"/>'
  };

  function icon(name, label = '') {
    return `<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name] || paths.file}</svg></span>${label ? `<span>${label}</span>` : ''}`;
  }

  function set(el, name, label = '') {
    const key = `${name}:${label}`;
    if (!el || el.dataset.iconThemeDone === key) return false;
    el.innerHTML = icon(name, label);
    el.dataset.iconThemeDone = key;
    return true;
  }

  function applyStatic() {
    set(document.querySelector('.app > .bar:first-child > span:first-child'), 'folder');

    const map = {
      uploadFiles: ['upload', '업로드'], uploadFolder: ['folderUpload', '폴더 업로드'],
      download: ['download', '다운로드'], move: ['move', '이동'], copy: ['copy', '복사'],
      archive: ['archive', '압축'], remove: ['trash', '삭제'], details: ['info', '정보'],
      refresh: ['refresh', '새로고침'], viewToggle: ['grid', '보기']
    };
    for (const [id, [name, label]] of Object.entries(map)) set(document.getElementById(id), name, label);

    set(document.getElementById('back'), 'back');
    set(document.getElementById('forward'), 'forward');
    set(document.getElementById('up'), 'up');

    const address = document.querySelector('.address');
    if (address && address.firstChild?.nodeType === Node.TEXT_NODE) address.firstChild.remove();
    if (address && !address.querySelector('.fs-icon')) address.insertAdjacentHTML('afterbegin', icon('folder'));

    const search = document.querySelector('.search');
    if (search && search.firstChild?.nodeType === Node.TEXT_NODE) search.firstChild.remove();
    if (search && !search.querySelector('.fs-icon')) search.insertAdjacentHTML('afterbegin', icon('search'));

    const sideMap = [['home','home'],['shared','users'],['recent','recent'],['favorites','star'],['activity','activity'],['trash','trash']];
    for (const [view, name] of sideMap) {
      const button = document.querySelector(`.side button[data-view="${view}"]`);
      if (!button || button.dataset.iconThemeDone) continue;
      const label = button.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
      set(button, name, label);
    }
    set(document.getElementById('sharesButton'), 'link', '공유 링크 관리');
    set(document.getElementById('themeButton'), 'theme', '테마 변경');
  }

  function replaceFileIcons() {
    document.querySelectorAll('.file-icon').forEach(el => {
      if (el.querySelector('.fs-icon')) return;
      const row = el.closest('[data-path]');
      const path = (row?.dataset.path || '').toLowerCase();
      const text = el.textContent;
      let name = 'file';
      if (text.includes('📁')) name = 'folder';
      else if (text.includes('🖼')) name = 'image';
      else if (text.includes('🎞')) name = 'video';
      else if (text.includes('🎵')) name = 'audio';
      else if (text.includes('📕') || path.endsWith('.pdf')) name = 'pdf';
      else if (text.includes('🗜')) name = 'archive';
      el.innerHTML = icon(name);
      el.dataset.iconThemeDone = name;
    });

    document.querySelectorAll('.thumb').forEach(el => {
      if (el.querySelector('img,video,.fs-icon')) return;
      const text = el.textContent;
      const name = text.includes('📁') ? 'folder' : text.includes('🖼') ? 'image' : text.includes('🎞') ? 'video' : text.includes('🎵') ? 'audio' : text.includes('🗜') ? 'archive' : 'file';
      el.innerHTML = icon(name);
      el.dataset.iconThemeDone = name;
    });
  }

  function replaceMenuIcons() {
    const menuMap = new Map([
      ['열기','eye'],['다운로드','download'],['정보 및 활동','info'],['공유 링크','link'],
      ['이동','move'],['복사','copy'],['ZIP으로 압축','archive'],['압축 풀기','folder'],
      ['삭제','trash'],['영구 삭제','trash'],['보기 방식 전환','grid'],['새로고침','refresh'],
      ['새 폴더','folder'],['새 파일','note'],['업로드','upload']
    ]);
    document.querySelectorAll('#menu button, #newCreateMenu button').forEach(button => {
      if (button.dataset.iconThemeDone) return;
      const label = button.textContent.trim();
      const name = menuMap.get(label);
      if (name) set(button, name, label);
    });

    const plus = document.getElementById('newMenuButton');
    if (plus) {
      const wide = window.innerWidth > 780;
      const key = `new-menu:${wide ? 'wide' : 'compact'}`;
      if (plus.dataset.iconThemeDone !== key) {
        plus.innerHTML = icon('plus', wide ? '새로 만들기' : '') + icon('chevronDown');
        plus.dataset.iconThemeDone = key;
      }
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyStatic();
      replaceFileIcons();
      replaceMenuIcons();
    });
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleApply, { passive: true });
  scheduleApply();
})();
