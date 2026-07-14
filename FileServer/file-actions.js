(() => {
  'use strict';

  const MAX_EDIT_BYTES = 5 * 1024 * 1024;
  const OPENABLE_EXTENSIONS = new Set([
    'html', 'htm', 'xhtml', 'txt', 'css', 'js', 'mjs', 'json', 'xml',
    'pdf', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico',
    'avif', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'mp4', 'webm', 'mov',
    'm4v', 'ogv'
  ]);
  const OPENABLE_MIME_TYPES = new Set([
    'application/pdf',
    'application/json',
    'application/xml',
    'application/xhtml+xml',
    'image/svg+xml'
  ]);

  const style = document.createElement('style');
  style.textContent = `
    .fs-action-shade{position:fixed;inset:0;z-index:120;background:#0006;display:flex;align-items:center;justify-content:center;padding:18px}
    .fs-action-dialog{width:min(560px,100%);background:#fff;border:1px solid #ccc;border-radius:12px;box-shadow:0 18px 50px #0005;overflow:hidden;color:#202020}
    .fs-action-head{min-height:54px;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:1px solid #e5e5e5}
    .fs-action-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fs-action-close{margin-left:auto;width:34px;height:34px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:16px}
    .fs-action-close:hover{background:#eee}
    .fs-action-body{padding:18px}
    .fs-file-summary{display:flex;align-items:center;gap:14px;margin-bottom:18px}
    .fs-file-icon{font-size:38px;line-height:1}
    .fs-file-text{min-width:0}
    .fs-file-name{font-weight:600;overflow-wrap:anywhere}
    .fs-file-meta{margin-top:5px;color:#666;font-size:12px}
    .fs-action-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .fs-action-choice{min-height:88px;border:1px solid #bbb;border-radius:9px;background:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:10px}
    .fs-action-choice:hover:not(:disabled){background:#eef6ff;border-color:#5b9bd5}
    .fs-action-choice:disabled{opacity:.42;cursor:not-allowed}
    .fs-action-choice span:first-child{font-size:24px}
    .fs-action-note{min-height:18px;margin-top:12px;color:#666;font-size:12px}
    .fs-editor-dialog{width:min(920px,100%);height:min(760px,86vh);display:flex;flex-direction:column}
    .fs-editor-meta{padding:8px 14px;border-bottom:1px solid #e5e5e5;color:#666;font-size:12px}
    .fs-editor-area{flex:1;min-height:0;width:100%;border:0;outline:0;resize:none;padding:15px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:2}
    .fs-editor-foot{min-height:56px;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 14px;border-top:1px solid #e5e5e5}
    .fs-editor-button{height:36px;min-width:86px;border:1px solid #aaa;border-radius:7px;background:#fff;cursor:pointer}
    .fs-editor-button.primary{background:#0067c0;border-color:#0067c0;color:#fff}
    @media(max-width:620px){.fs-action-grid{grid-template-columns:1fr}.fs-action-choice{min-height:60px;flex-direction:row}.fs-action-dialog{max-height:92vh;overflow:auto}}
  `;
  document.head.append(style);

  function currentDirectory() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    return raw ? raw.replace(/^\/+/, '').replace(/\/*$/, '/') : '';
  }

  function encodePath(path) {
    return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function fileUrl(fileName) {
    const path = [currentDirectory(), fileName].filter(Boolean).join('/');
    return `/files/${encodePath(path)}`;
  }

  function extension(fileName) {
    const index = fileName.lastIndexOf('.');
    return index > 0 ? fileName.slice(index + 1).toLowerCase() : '';
  }

  function fileIcon(fileName, mimeType = '') {
    const mime = mimeType.toLowerCase();
    const ext = extension(fileName);
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return '🎞️';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
    if (mime === 'application/pdf' || ext === 'pdf') return '📕';
    return '📄';
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return '크기 알 수 없음';
    if (bytes === 0) return '0 bytes';
    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
  }

  function isBrowserOpenable(fileName, mimeType) {
    const mime = String(mimeType || '').split(';', 1)[0].trim().toLowerCase();
    return mime.startsWith('text/') || mime.startsWith('image/') ||
      mime.startsWith('audio/') || mime.startsWith('video/') ||
      OPENABLE_MIME_TYPES.has(mime) || OPENABLE_EXTENSIONS.has(extension(fileName));
  }

  async function getMetadata(fileName) {
    const response = await fetch(fileUrl(fileName), { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) throw new Error(`파일 정보를 읽을 수 없습니다. (HTTP ${response.status})`);
    return {
      size: Number(response.headers.get('content-length')),
      mimeType: response.headers.get('content-type') || ''
    };
  }

  function closeDialog(dialog) {
    dialog?.remove();
  }

  function createShade(className = '') {
    const shade = document.createElement('div');
    shade.className = `fs-action-shade ${className}`.trim();
    shade.addEventListener('mousedown', event => {
      if (event.target === shade) closeDialog(shade);
    });
    document.body.append(shade);
    return shade;
  }

  function triggerDownload(fileName) {
    const link = document.createElement('a');
    link.href = fileUrl(fileName);
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function openInBrowser(fileName) {
    window.open(fileUrl(fileName), '_blank', 'noopener');
  }

  async function openEditor(fileName, metadata) {
    if (!Number.isFinite(metadata.size) || metadata.size > MAX_EDIT_BYTES) return;

    const response = await fetch(fileUrl(fileName), { cache: 'no-store' });
    if (!response.ok) throw new Error(`파일을 불러올 수 없습니다. (HTTP ${response.status})`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_EDIT_BYTES) throw new Error('5MB 이하 파일만 편집할 수 있습니다.');

    const sample = new Uint8Array(buffer.slice(0, 4096));
    if (sample.includes(0)) throw new Error('바이너리 파일은 텍스트 편집기로 편집할 수 없습니다.');

    const originalText = new TextDecoder().decode(buffer);
    const shade = createShade();
    const dialog = document.createElement('section');
    dialog.className = 'fs-action-dialog fs-editor-dialog';

    const head = document.createElement('div');
    head.className = 'fs-action-head';
    const title = document.createElement('strong');
    title.textContent = `편집 — ${fileName}`;
    const close = document.createElement('button');
    close.className = 'fs-action-close';
    close.type = 'button';
    close.textContent = '✕';
    head.append(title, close);

    const meta = document.createElement('div');
    meta.className = 'fs-editor-meta';
    const area = document.createElement('textarea');
    area.className = 'fs-editor-area';
    area.value = originalText;
    area.spellcheck = false;

    const foot = document.createElement('div');
    foot.className = 'fs-editor-foot';
    const cancel = document.createElement('button');
    cancel.className = 'fs-editor-button';
    cancel.type = 'button';
    cancel.textContent = '취소';
    const save = document.createElement('button');
    save.className = 'fs-editor-button primary';
    save.type = 'button';
    save.textContent = '저장';
    foot.append(cancel, save);

    const updateMeta = () => {
      const modified = area.value !== originalText ? ' · 수정됨' : '';
      meta.textContent = `${formatBytes(new Blob([area.value]).size)} · ${area.value.split('\n').length}줄${modified}`;
    };
    updateMeta();
    area.addEventListener('input', updateMeta);
    area.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
        updateMeta();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save.click();
      }
    });

    const requestClose = () => {
      if (area.value !== originalText && !window.confirm('변경사항을 저장하지 않고 닫으시겠습니까?')) return;
      closeDialog(shade);
    };
    close.addEventListener('click', requestClose);
    cancel.addEventListener('click', requestClose);
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const put = await fetch(fileUrl(fileName), {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: area.value
        });
        if (!put.ok) throw new Error(`파일을 저장할 수 없습니다. (HTTP ${put.status})`);
        closeDialog(shade);
        document.getElementById('refresh')?.click();
      } catch (error) {
        window.alert(error.message);
      } finally {
        save.disabled = false;
      }
    });

    dialog.append(head, meta, area, foot);
    shade.append(dialog);
    setTimeout(() => area.focus());
  }

  async function showFileActions(fileName) {
    let metadata;
    try {
      metadata = await getMetadata(fileName);
    } catch (error) {
      window.alert(error.message);
      return;
    }

    const canOpen = isBrowserOpenable(fileName, metadata.mimeType);
    const canEdit = Number.isFinite(metadata.size) && metadata.size <= MAX_EDIT_BYTES;
    const shade = createShade();
    const dialog = document.createElement('section');
    dialog.className = 'fs-action-dialog';

    const head = document.createElement('div');
    head.className = 'fs-action-head';
    const title = document.createElement('strong');
    title.textContent = '파일 작업 선택';
    const close = document.createElement('button');
    close.className = 'fs-action-close';
    close.type = 'button';
    close.textContent = '✕';
    close.addEventListener('click', () => closeDialog(shade));
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'fs-action-body';
    const summary = document.createElement('div');
    summary.className = 'fs-file-summary';
    const icon = document.createElement('div');
    icon.className = 'fs-file-icon';
    icon.textContent = fileIcon(fileName, metadata.mimeType);
    const text = document.createElement('div');
    text.className = 'fs-file-text';
    const name = document.createElement('div');
    name.className = 'fs-file-name';
    name.textContent = fileName;
    const meta = document.createElement('div');
    meta.className = 'fs-file-meta';
    meta.textContent = `${formatBytes(metadata.size)} · ${metadata.mimeType || '파일 형식 알 수 없음'}`;
    text.append(name, meta);
    summary.append(icon, text);

    const grid = document.createElement('div');
    grid.className = 'fs-action-grid';
    const makeChoice = (emoji, label, disabled, action, titleText) => {
      const button = document.createElement('button');
      button.className = 'fs-action-choice';
      button.type = 'button';
      button.disabled = disabled;
      button.title = titleText || '';
      const iconSpan = document.createElement('span');
      iconSpan.textContent = emoji;
      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      button.append(iconSpan, labelSpan);
      button.addEventListener('click', () => {
        closeDialog(shade);
        action();
      });
      return button;
    };

    grid.append(
      makeChoice('↗', '열기', !canOpen, () => openInBrowser(fileName), canOpen ? '' : '브라우저에서 바로 열 수 없는 파일 형식입니다.'),
      makeChoice('✎', '편집', !canEdit, () => openEditor(fileName, metadata).catch(error => window.alert(error.message)), canEdit ? '' : '5MB 이하 파일만 편집할 수 있습니다.'),
      makeChoice('⤓', '다운로드', false, () => triggerDownload(fileName), '')
    );

    const note = document.createElement('div');
    note.className = 'fs-action-note';
    if (!canOpen && !canEdit) note.textContent = '이 파일은 다운로드만 가능합니다.';
    else if (!canOpen) note.textContent = '브라우저에서 지원하지 않는 형식이므로 열기는 사용할 수 없습니다.';
    else if (!canEdit) note.textContent = '5MB를 초과하여 편집은 사용할 수 없습니다.';

    body.append(summary, grid, note);
    dialog.append(head, body);
    shade.append(dialog);
  }

  document.addEventListener('dblclick', event => {
    const row = event.target.closest('tr.item');
    if (!row) return;
    const typeCell = row.children[2];
    if (typeCell?.textContent.trim() === 'File folder') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showFileActions(row.dataset.name);
  }, true);
})();
