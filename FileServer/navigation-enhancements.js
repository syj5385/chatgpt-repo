(() => {
  'use strict';

  const addressBox = document.querySelector('.address');
  const addressInput = document.getElementById('address');
  const pathStatus = document.getElementById('pathStatus');
  const loading = document.getElementById('loading');
  const homeButton = document.querySelector('.side button[data-view="home"]');
  const sharedButton = document.querySelector('.side button[data-view="shared"]');
  const trashButton = document.querySelector('.side button[data-view="trash"]');
  const filePicker = document.getElementById('filePicker');
  const dropOverlay = document.getElementById('dropOverlay');
  const content = document.getElementById('content');
  const toastHost = document.getElementById('toasts');

  if (!addressBox || !addressInput || !pathStatus || !content) return;

  let workspace = null;
  let breadcrumbHost = null;
  let historyPrimed = false;
  let hashRouting = false;
  const originalDrop = document.ondrop;

  function toast(message) {
    if (!toastHost) return;
    const item = document.createElement('div');
    item.textContent = message;
    toastHost.append(item);
    setTimeout(() => item.remove(), 4500);
  }

  function normalize(path = '') {
    let value = String(path || '');
    try { value = decodeURIComponent(value); } catch { /* keep original */ }
    value = value.replace(/^#\/?/, '').replace(/^\/files\/?/, '').replace(/^\/+/, '').replace(/\\/g, '/');
    const parts = [];
    for (const part of value.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') continue;
      parts.push(part);
    }
    return parts.join('/');
  }

  function directory(path = '') {
    const value = normalize(path);
    return value ? value + '/' : '';
  }

  function currentPath() {
    const text = pathStatus.textContent || '';
    return text.startsWith('/') ? normalize(text) : null;
  }

  function pathFromHash() {
    return normalize(location.hash);
  }

  function encodeFilePath(path) {
    return normalize(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function fileUrl(path) {
    return `${location.origin}/files/${encodeFilePath(path)}`;
  }

  function startsInside(path, root) {
    const normalizedPath = normalize(path);
    const normalizedRoot = normalize(root);
    return !normalizedRoot || normalizedPath === normalizedRoot || normalizedPath.startsWith(normalizedRoot + '/');
  }

  async function loadWorkspace() {
    try {
      const response = await fetch('/api/files/workspace', { cache: 'no-store' });
      if (response.ok) workspace = await response.json();
    } catch {
      workspace = null;
    }
  }

  function waitForNavigation(timeout = 5000) {
    return new Promise(resolve => {
      const started = performance.now();
      let sawLoading = Boolean(loading?.classList.contains('show'));
      const tick = () => {
        const active = Boolean(loading?.classList.contains('show'));
        sawLoading ||= active;
        if ((!active && sawLoading) || performance.now() - started > timeout) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  async function switchAreaForPath(path) {
    if (!workspace) return;
    let button = homeButton;
    if (startsInside(path, workspace.shared) && normalize(workspace.shared)) button = sharedButton;
    else if (startsInside(path, workspace.trash) && normalize(workspace.trash)) button = trashButton;

    if (button && !button.classList.contains('active')) {
      button.click();
      await waitForNavigation();
    }
  }

  async function navigateTo(path) {
    const target = directory(path);
    await switchAreaForPath(target);
    addressBox.classList.add('is-editing');
    addressInput.focus();
    addressInput.value = '/' + normalize(target);
    addressInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true
    }));
  }

  function rootAndSegments(path) {
    const normalized = normalize(path);
    if (!workspace) return { rootLabel: '파일', rootPath: '', segments: normalized.split('/').filter(Boolean) };

    const shared = normalize(workspace.shared);
    const trash = normalize(workspace.trash);
    const home = normalize(workspace.home);

    if (shared && startsInside(normalized, shared)) {
      return {
        rootLabel: '공용 폴더',
        rootPath: directory(shared),
        segments: normalized.slice(shared.length).split('/').filter(Boolean)
      };
    }
    if (trash && startsInside(normalized, trash)) {
      return {
        rootLabel: '휴지통',
        rootPath: directory(trash),
        segments: normalized.slice(trash.length).split('/').filter(Boolean)
      };
    }
    if (home && startsInside(normalized, home)) {
      return {
        rootLabel: '내 파일',
        rootPath: directory(home),
        segments: normalized.slice(home.length).split('/').filter(Boolean)
      };
    }
    return {
      rootLabel: workspace.role === 'admin' ? '전체 파일' : '내 파일',
      rootPath: directory(home),
      segments: normalized.split('/').filter(Boolean)
    };
  }

  function addCrumb(label, path, current = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fs-breadcrumb' + (current ? ' current' : '');
    button.textContent = label;
    button.title = label;
    button.setAttribute('aria-current', current ? 'page' : 'false');
    button.onclick = event => {
      event.stopPropagation();
      if (normalize(path) !== currentPath()) navigateTo(path);
    };
    breadcrumbHost.append(button);
  }

  function addSeparator() {
    const separator = document.createElement('span');
    separator.className = 'fs-breadcrumb-separator';
    separator.textContent = '›';
    separator.setAttribute('aria-hidden', 'true');
    breadcrumbHost.append(separator);
  }

  function renderBreadcrumbs() {
    const path = currentPath();
    if (path === null) {
      addressBox.classList.remove('has-breadcrumbs');
      breadcrumbHost?.replaceChildren();
      return;
    }

    if (!breadcrumbHost) {
      breadcrumbHost = document.createElement('nav');
      breadcrumbHost.className = 'fs-breadcrumbs';
      breadcrumbHost.setAttribute('aria-label', '현재 폴더 경로');
      addressBox.append(breadcrumbHost);
    }

    const { rootLabel, rootPath, segments } = rootAndSegments(path);
    breadcrumbHost.replaceChildren();
    addCrumb(rootLabel, rootPath, segments.length === 0);

    let accumulated = directory(rootPath);
    segments.forEach((segment, index) => {
      addSeparator();
      accumulated = directory(accumulated + segment);
      addCrumb(segment, accumulated, index === segments.length - 1);
    });

    addressBox.classList.add('has-breadcrumbs');
    requestAnimationFrame(() => { breadcrumbHost.scrollLeft = breadcrumbHost.scrollWidth; });
  }

  function bindBreadcrumbEditing() {
    addressInput.addEventListener('focus', () => addressBox.classList.add('is-editing'));
    addressInput.addEventListener('blur', () => {
      setTimeout(() => {
        addressBox.classList.remove('is-editing');
        renderBreadcrumbs();
      }, 80);
    });
    addressBox.addEventListener('click', event => {
      if (event.target.closest('.fs-breadcrumb')) return;
      addressBox.classList.add('is-editing');
      addressInput.focus();
    });
  }

  async function primeExplorerHistory() {
    if (historyPrimed || !workspace || !homeButton) return;
    const path = currentPath();
    if (path === null) return;
    if (normalize(path) !== normalize(workspace.home)) return;
    historyPrimed = true;
    homeButton.click();
    await waitForNavigation();
  }

  async function handleHashNavigation() {
    if (hashRouting) return;
    const target = pathFromHash();
    const current = currentPath();
    if (current === null || normalize(current) === normalize(target)) return;

    hashRouting = true;
    try {
      await navigateTo(target);
      await waitForNavigation();
    } finally {
      setTimeout(() => { hashRouting = false; }, 80);
    }
  }

  function withRelativePath(file, relativePath) {
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: relativePath
      });
      return file;
    } catch {
      const copy = new File([file], file.name, {
        type: file.type,
        lastModified: file.lastModified
      });
      try {
        Object.defineProperty(copy, 'webkitRelativePath', {
          configurable: true,
          value: relativePath
        });
      } catch { /* browser will upload the base file name */ }
      return copy;
    }
  }

  function entryFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  function readEntries(reader) {
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  }

  async function allDirectoryEntries(reader) {
    const result = [];
    while (true) {
      const batch = await readEntries(reader);
      if (!batch.length) return result;
      result.push(...batch);
    }
  }

  async function collectEntry(entry, prefix = '') {
    if (entry.isFile) {
      const file = await entryFile(entry);
      return [withRelativePath(file, prefix + file.name)];
    }
    if (!entry.isDirectory) return [];

    const nextPrefix = prefix + entry.name + '/';
    const children = await allDirectoryEntries(entry.createReader());
    const nested = [];
    for (const child of children) nested.push(...await collectEntry(child, nextPrefix));
    return nested;
  }

  function uploadThroughPicker(files) {
    if (!filePicker || !files.length) return false;
    try {
      const transfer = new DataTransfer();
      files.forEach(file => transfer.items.add(file));
      filePicker.files = transfer.files;
      filePicker.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  function installFolderDropUpload() {
    document.ondrop = async event => {
      const items = [...(event.dataTransfer?.items || [])];
      const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
      const hasDirectory = entries.some(entry => entry.isDirectory);

      if (!hasDirectory) {
        if (originalDrop) return originalDrop.call(document, event);
        return;
      }

      event.preventDefault();
      dropOverlay?.classList.remove('show');
      try {
        const files = [];
        for (const entry of entries) files.push(...await collectEntry(entry));
        if (!files.length) return toast('업로드할 파일이 없습니다.');
        if (!uploadThroughPicker(files)) return toast('이 브라우저에서는 폴더 드롭 업로드를 지원하지 않습니다.');
        toast(`${files.length}개 파일의 폴더 업로드를 시작했습니다.`);
      } catch (error) {
        toast(`폴더 업로드 실패: ${error.message || error}`);
      }
    };
  }

  function mimeFor(path) {
    const extension = normalize(path).split('.').pop()?.toLowerCase();
    return ({
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
      mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
      pdf: 'application/pdf', txt: 'text/plain', json: 'application/json', csv: 'text/csv',
      zip: 'application/zip'
    })[extension] || 'application/octet-stream';
  }

  function prepareDragDownloads() {
    content.querySelectorAll('[data-path]').forEach(element => {
      const path = element.dataset.path || '';
      if (!path || path.endsWith('/') || element.dataset.dragDownloadReady) return;

      element.dataset.dragDownloadReady = 'true';
      element.draggable = true;
      element.classList.add('fs-drag-download');
      element.addEventListener('dragstart', event => {
        const name = normalize(path).split('/').pop() || 'download';
        const url = fileUrl(path);
        element.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('DownloadURL', `${mimeFor(path)}:${name}:${url}`);
        event.dataTransfer.setData('text/uri-list', url);
        event.dataTransfer.setData('text/plain', url);
      });
      element.addEventListener('dragend', () => element.classList.remove('dragging'));
    });
  }

  async function initialize() {
    await loadWorkspace();
    bindBreadcrumbEditing();
    installFolderDropUpload();

    const pathObserver = new MutationObserver(() => {
      renderBreadcrumbs();
      primeExplorerHistory();
    });
    pathObserver.observe(pathStatus, { childList: true, characterData: true, subtree: true });

    const contentObserver = new MutationObserver(prepareDragDownloads);
    contentObserver.observe(content, { childList: true, subtree: true });

    window.addEventListener('hashchange', handleHashNavigation);
    renderBreadcrumbs();
    prepareDragDownloads();
    setTimeout(primeExplorerHistory, 250);
  }

  initialize();
})();
