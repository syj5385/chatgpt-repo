(() => {
  'use strict';

  const status = document.getElementById('conn');
  if (!status) return;

  const style = document.createElement('style');
  style.textContent = `
    #conn{
      display:inline-flex;
      align-items:center;
      gap:7px;
      min-width:94px;
      justify-content:flex-end;
      font-size:12px;
      color:var(--fs-text-muted,#666);
      white-space:nowrap;
    }
    #conn .fs-connection-dot{
      width:9px;
      height:9px;
      flex:0 0 9px;
      border-radius:50%;
      background:#8a8a8a;
      box-shadow:0 0 0 2px color-mix(in srgb,#8a8a8a 18%,transparent);
    }
    #conn[data-connection-state="connected"] .fs-connection-dot{
      background:#16a34a;
      box-shadow:0 0 0 2px color-mix(in srgb,#16a34a 22%,transparent);
    }
    #conn[data-connection-state="disconnected"] .fs-connection-dot{
      background:#d13438;
      box-shadow:0 0 0 2px color-mix(in srgb,#d13438 22%,transparent);
    }
    #conn[data-connection-state="checking"] .fs-connection-dot{
      background:#8a8a8a;
      box-shadow:0 0 0 2px color-mix(in srgb,#8a8a8a 18%,transparent);
    }
  `;
  document.head.append(style);

  let rendering = false;

  function readRawState() {
    return status.textContent.trim().toLowerCase();
  }

  function resolveState(raw) {
    if (raw === 'connected') {
      return {
        key: 'connected',
        label: 'Connected',
        description: '최근 파일 목록 요청이 정상적으로 완료되었습니다.'
      };
    }

    if (raw === 'offline' || raw === 'disconnected' || raw === 'error') {
      return {
        key: 'disconnected',
        label: 'Disconnected',
        description: '파일 서버와 통신하지 못했습니다. 네트워크 또는 서버 상태를 확인하세요.'
      };
    }

    return {
      key: 'checking',
      label: raw === 'loading…' || raw === 'loading...' ? 'Checking' : 'Ready',
      description: '파일 서버 연결 상태를 확인하기 전입니다.'
    };
  }

  function render() {
    if (rendering) return;
    rendering = true;

    const next = resolveState(readRawState());
    const dot = document.createElement('span');
    dot.className = 'fs-connection-dot';
    dot.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'fs-connection-label';
    label.textContent = next.label;

    status.dataset.connectionState = next.key;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-label', `${next.label}: ${next.description}`);
    status.title = next.description;
    status.replaceChildren(dot, label);

    rendering = false;
  }

  const observer = new MutationObserver(() => {
    if (!rendering) render();
  });

  observer.observe(status, {
    childList: true,
    characterData: true,
    subtree: true
  });

  render();
})();
