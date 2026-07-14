(() => {
  'use strict';

  const STORAGE_KEY = 'fileserver-theme';
  const THEMES = new Set(['light', 'dark']);

  const style = document.createElement('style');
  style.textContent = `
    :root{
      --fs-page:#f3f3f3;
      --fs-surface:#ffffff;
      --fs-surface-soft:#fafafa;
      --fs-surface-hover:#ededed;
      --fs-text:#202020;
      --fs-text-muted:#666666;
      --fs-border:#e5e5e5;
      --fs-border-strong:#b9b9b9;
      --fs-shadow:#0003;
      --fs-overlay:#0005;
      --fs-input:#ffffff;
      --fs-accent:#0067c0;
      --fs-selected:#e7f2ff;
      --fs-row-hover:#f3f7fb;
      --fs-drop:#f5f9fd;
      --fs-drop-active:#e8f3ff;
      color-scheme:light;
    }

    html[data-theme="dark"]{
      --fs-page:#171717;
      --fs-surface:#202020;
      --fs-surface-soft:#252525;
      --fs-surface-hover:#323232;
      --fs-text:#f2f2f2;
      --fs-text-muted:#b8b8b8;
      --fs-border:#3b3b3b;
      --fs-border-strong:#5b5b5b;
      --fs-shadow:#0008;
      --fs-overlay:#0009;
      --fs-input:#292929;
      --fs-accent:#60aefc;
      --fs-selected:#173a5d;
      --fs-row-hover:#292f35;
      --fs-drop:#202d39;
      --fs-drop-active:#163b5e;
      color-scheme:dark;
    }

    html,body{background:var(--fs-page)!important;color:var(--fs-text)!important}
    .bar{background:color-mix(in srgb,var(--fs-surface) 92%,transparent)!important;border-color:var(--fs-border)!important}
    .cmd,.nav,.side button,.close{color:var(--fs-text)!important}
    .cmd:hover,.nav:hover,.side button:hover,.close:hover{background:var(--fs-surface-hover)!important}
    .box{background:var(--fs-input)!important;border-color:var(--fs-border-strong)!important;color:var(--fs-text)!important}
    .box input,.input,.editor textarea{color:var(--fs-text)!important}
    .side{background:var(--fs-surface-soft)!important;border-color:var(--fs-border)!important}
    .side small,.status,.props b,.editinfo,.state{color:var(--fs-text-muted)!important}
    .side button.active{background:var(--fs-surface-hover)!important}
    .main,.list,thead{background:var(--fs-surface)!important}
    th{color:var(--fs-text-muted)!important;border-color:var(--fs-border)!important}
    th+th{border-color:var(--fs-border)!important}
    tr.item:hover{background:var(--fs-row-hover)!important}
    tr.item.selected{background:var(--fs-selected)!important}
    .status{border-color:var(--fs-border)!important}
    .menu,.modal,.toast div{background:var(--fs-surface)!important;color:var(--fs-text)!important;border-color:var(--fs-border-strong)!important;box-shadow:0 10px 28px var(--fs-shadow)!important}
    .menu button{color:var(--fs-text)!important}
    .menu button:hover{background:var(--fs-surface-hover)!important}
    .menu hr,.mh,.mf,.editinfo{border-color:var(--fs-border)!important}
    .shade{background:var(--fs-overlay)!important}
    .btn,.input{background:var(--fs-input)!important;color:var(--fs-text)!important;border-color:var(--fs-border-strong)!important}
    .btn.primary{background:var(--fs-accent)!important;border-color:var(--fs-accent)!important;color:#fff!important}
    .drop-hint{background:var(--fs-drop)!important;border-color:var(--fs-border-strong)!important;color:var(--fs-text-muted)!important}
    .drop-hint:hover,.drop-hint.active{background:var(--fs-drop-active)!important;border-color:var(--fs-accent)!important;color:var(--fs-accent)!important}
    .drop{background:color-mix(in srgb,var(--fs-drop-active) 88%,transparent)!important;color:var(--fs-accent)!important;border-color:var(--fs-accent)!important}

    html[data-theme] .fs-action-dialog{background:var(--fs-surface)!important;color:var(--fs-text)!important;border-color:var(--fs-border-strong)!important;box-shadow:0 18px 50px var(--fs-shadow)!important}
    html[data-theme] .fs-action-head,html[data-theme] .fs-editor-meta,html[data-theme] .fs-editor-foot{border-color:var(--fs-border)!important}
    html[data-theme] .fs-action-close,html[data-theme] .fs-action-choice,html[data-theme] .fs-editor-button{background:var(--fs-input)!important;color:var(--fs-text)!important;border-color:var(--fs-border-strong)!important}
    html[data-theme] .fs-action-close:hover,html[data-theme] .fs-action-choice:hover:not(:disabled){background:var(--fs-surface-hover)!important}
    html[data-theme] .fs-file-meta,html[data-theme] .fs-action-note,html[data-theme] .fs-editor-meta{color:var(--fs-text-muted)!important}
    html[data-theme] .fs-editor-area{background:var(--fs-surface)!important;color:var(--fs-text)!important}
    html[data-theme] .fs-editor-button.primary{background:var(--fs-accent)!important;border-color:var(--fs-accent)!important;color:#fff!important}

    .fs-settings-anchor{position:fixed;left:16px;bottom:42px;z-index:105;display:flex;align-items:flex-end;gap:10px}
    .fs-settings-button{width:44px;height:44px;border:1px solid var(--fs-border-strong);border-radius:50%;background:var(--fs-surface);color:var(--fs-text);box-shadow:0 7px 22px var(--fs-shadow);cursor:pointer;font-size:20px;display:grid;place-items:center;transition:transform .15s ease,background .15s ease}
    .fs-settings-button:hover{background:var(--fs-surface-hover);transform:translateY(-1px)}
    .fs-settings-button[aria-expanded="true"]{background:var(--fs-selected);color:var(--fs-accent)}
    .fs-settings-panel{display:none;width:min(320px,calc(100vw - 82px));max-height:min(560px,calc(100vh - 100px));overflow:auto;background:var(--fs-surface);color:var(--fs-text);border:1px solid var(--fs-border-strong);border-radius:12px;box-shadow:0 12px 34px var(--fs-shadow)}
    .fs-settings-panel.show{display:block;animation:fs-settings-in .14s ease-out}
    @keyframes fs-settings-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
    .fs-settings-header{min-height:52px;display:flex;align-items:center;padding:0 14px;border-bottom:1px solid var(--fs-border)}
    .fs-settings-header strong{font-size:15px}
    .fs-settings-close{margin-left:auto;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:var(--fs-text);cursor:pointer}
    .fs-settings-close:hover{background:var(--fs-surface-hover)}
    .fs-settings-content{padding:14px;display:grid;gap:18px}
    .fs-settings-section{display:grid;gap:9px}
    .fs-settings-section-title{font-size:13px;font-weight:600}
    .fs-settings-section-description{font-size:12px;color:var(--fs-text-muted);line-height:1.45}
    .fs-theme-options{display:grid;grid-template-columns:1fr 1fr;gap:9px}
    .fs-theme-option{position:relative;min-height:78px;border:1px solid var(--fs-border-strong);border-radius:9px;background:var(--fs-input);color:var(--fs-text);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px}
    .fs-theme-option:hover{background:var(--fs-surface-hover)}
    .fs-theme-option.selected{border-color:var(--fs-accent);outline:2px solid color-mix(in srgb,var(--fs-accent) 28%,transparent);background:var(--fs-selected)}
    .fs-theme-option-icon{font-size:23px}
    .fs-theme-option-label{font-size:13px;font-weight:600}
    .fs-theme-option-check{position:absolute;right:8px;top:7px;color:var(--fs-accent);font-weight:700;opacity:0}
    .fs-theme-option.selected .fs-theme-option-check{opacity:1}

    @media(max-width:720px){
      .fs-settings-anchor{left:10px;bottom:36px}
      .fs-settings-button{width:42px;height:42px}
      .fs-settings-panel{width:min(300px,calc(100vw - 64px));max-height:calc(100vh - 86px)}
    }
  `;
  document.head.append(style);

  function readTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return THEMES.has(stored) ? stored : 'light';
    } catch {
      return 'light';
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // The theme still applies for the current page when storage is unavailable.
    }
  }

  function applyTheme(theme, persist = true) {
    const next = THEMES.has(theme) ? theme : 'light';
    document.documentElement.dataset.theme = next;
    if (persist) saveTheme(next);
    document.querySelectorAll('.fs-theme-option').forEach(option => {
      const selected = option.dataset.themeValue === next;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
    window.dispatchEvent(new CustomEvent('fileserver-theme-change', { detail: { theme: next } }));
  }

  applyTheme(readTheme(), false);

  const anchor = document.createElement('div');
  anchor.className = 'fs-settings-anchor';

  const panel = document.createElement('section');
  panel.className = 'fs-settings-panel';
  panel.id = 'fileserver-settings-panel';
  panel.setAttribute('aria-label', 'FileServer 설정');

  const header = document.createElement('div');
  header.className = 'fs-settings-header';
  const heading = document.createElement('strong');
  heading.textContent = '설정';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'fs-settings-close';
  closeButton.setAttribute('aria-label', '설정 닫기');
  closeButton.textContent = '✕';
  header.append(heading, closeButton);

  const content = document.createElement('div');
  content.className = 'fs-settings-content';
  panel.append(header, content);

  const floatingButton = document.createElement('button');
  floatingButton.type = 'button';
  floatingButton.className = 'fs-settings-button';
  floatingButton.setAttribute('aria-label', '설정 열기');
  floatingButton.setAttribute('aria-controls', panel.id);
  floatingButton.setAttribute('aria-expanded', 'false');
  floatingButton.title = '설정';
  floatingButton.textContent = '⚙';

  function setPanelOpen(open) {
    panel.classList.toggle('show', open);
    floatingButton.setAttribute('aria-expanded', String(open));
    floatingButton.setAttribute('aria-label', open ? '설정 닫기' : '설정 열기');
  }

  floatingButton.addEventListener('click', event => {
    event.stopPropagation();
    setPanelOpen(!panel.classList.contains('show'));
  });
  closeButton.addEventListener('click', () => setPanelOpen(false));
  panel.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => setPanelOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('show')) {
      setPanelOpen(false);
      floatingButton.focus();
    }
  });

  function createThemeSection() {
    const section = document.createElement('section');
    section.className = 'fs-settings-section';
    section.dataset.settingsSection = 'appearance';

    const title = document.createElement('div');
    title.className = 'fs-settings-section-title';
    title.textContent = '테마';
    const description = document.createElement('div');
    description.className = 'fs-settings-section-description';
    description.textContent = 'FileServer 화면의 밝기를 선택합니다.';
    const options = document.createElement('div');
    options.className = 'fs-theme-options';

    const choices = [
      { value: 'light', icon: '☀', label: '라이트' },
      { value: 'dark', icon: '☾', label: '다크' }
    ];

    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fs-theme-option';
      button.dataset.themeValue = choice.value;
      button.setAttribute('aria-pressed', 'false');

      const check = document.createElement('span');
      check.className = 'fs-theme-option-check';
      check.textContent = '✓';
      const icon = document.createElement('span');
      icon.className = 'fs-theme-option-icon';
      icon.textContent = choice.icon;
      const label = document.createElement('span');
      label.className = 'fs-theme-option-label';
      label.textContent = choice.label;
      button.append(check, icon, label);
      button.addEventListener('click', () => applyTheme(choice.value));
      options.append(button);
    }

    section.append(title, description, options);
    return section;
  }

  function registerSection(section, options = {}) {
    if (!(section instanceof HTMLElement)) {
      throw new TypeError('설정 섹션은 HTMLElement여야 합니다.');
    }
    if (options.prepend) content.prepend(section);
    else content.append(section);
    return section;
  }

  registerSection(createThemeSection());
  anchor.append(panel, floatingButton);
  document.body.append(anchor);
  applyTheme(document.documentElement.dataset.theme || readTheme(), false);

  window.FileServerSettings = Object.freeze({
    registerSection,
    getTheme: () => document.documentElement.dataset.theme || 'light',
    setTheme: theme => applyTheme(theme),
    open: () => setPanelOpen(true),
    close: () => setPanelOpen(false)
  });
})();
