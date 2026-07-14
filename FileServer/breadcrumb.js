(() => {
  'use strict';

  const input = document.getElementById('address');
  const box = input?.closest('.address');
  if (!input || !box) return;

  const style = document.createElement('style');
  style.textContent = `
    .fs-breadcrumb-box{position:relative;min-width:0;overflow:hidden}
    .fs-breadcrumb-box>input{display:none}
    .fs-breadcrumb-box.fs-breadcrumb-editing>input{display:block;padding-right:38px}
    .fs-breadcrumb-nav{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;flex:1;height:100%;padding-left:5px}
    .fs-breadcrumb-nav::-webkit-scrollbar{display:none}
    .fs-breadcrumb-box.fs-breadcrumb-editing .fs-breadcrumb-nav{display:none}
    .fs-breadcrumb-segment{flex:0 0 auto;max-width:220px;height:28px;border:0;border-radius:5px;background:transparent;color:var(--fs-text,#202020);padding:0 7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fs-breadcrumb-segment:hover{background:var(--fs-surface-hover,#ededed)}
    .fs-breadcrumb-segment.current{font-weight:600}
    .fs-breadcrumb-separator{flex:0 0 auto;color:var(--fs-text-muted,#666);font-size:14px;user-select:none}
    .fs-breadcrumb-edit{flex:0 0 auto;width:30px;height:30px;border:0;border-radius:5px;background:transparent;color:var(--fs-text-muted,#666);cursor:pointer;display:grid;place-items:center;margin-left:4px}
    .fs-breadcrumb-edit:hover{background:var(--fs-surface-hover,#ededed);color:var(--fs-text,#202020)}
    .fs-breadcrumb-box.fs-breadcrumb-editing .fs-breadcrumb-edit{position:absolute;right:3px;top:2px;z-index:2}
    @media(max-width:720px){.fs-breadcrumb-segment{max-width:120px;padding:0 5px}.fs-breadcrumb-edit{width:28px}}
  `;
  document.head.append(style);

  box.classList.add('fs-breadcrumb-box');

  const nav = document.createElement('nav');
  nav.className = 'fs-breadcrumb-nav';
  nav.setAttribute('aria-label', '현재 경로');

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'fs-breadcrumb-edit';
  editButton.setAttribute('aria-label', '경로 직접 입력');
  editButton.title = '경로 직접 입력';
  editButton.textContent = '✎';

  box.insertBefore(nav, input);
  box.append(editButton);

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function encodedSegments() {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  }

  function navigateTo(index, segments) {
    if (index < 0) {
      location.hash = '/';
      return;
    }
    location.hash = `/${segments.slice(0, index + 1).join('/')}/`;
  }

  function createSegment(label, index, segments, current = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `fs-breadcrumb-segment${current ? ' current' : ''}`;
    button.textContent = label;
    button.title = index < 0 ? 'Home으로 이동' : `${label} 폴더로 이동`;
    button.addEventListener('click', event => {
      event.stopPropagation();
      navigateTo(index, segments);
    });
    return button;
  }

  function render() {
    const segments = encodedSegments();
    const nodes = [];
    nodes.push(createSegment('Home', -1, segments, segments.length === 0));

    segments.forEach((segment, index) => {
      const separator = document.createElement('span');
      separator.className = 'fs-breadcrumb-separator';
      separator.textContent = '›';
      separator.setAttribute('aria-hidden', 'true');
      nodes.push(separator);
      nodes.push(createSegment(safeDecode(segment), index, segments, index === segments.length - 1));
    });

    nav.replaceChildren(...nodes);
    requestAnimationFrame(() => {
      nav.scrollLeft = nav.scrollWidth;
    });
  }

  function startEditing() {
    box.classList.add('fs-breadcrumb-editing');
    input.value = location.hash === '#/' || !location.hash ? '/' : safeDecode(location.hash.replace(/^#/, ''));
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function stopEditing() {
    box.classList.remove('fs-breadcrumb-editing');
    render();
  }

  editButton.addEventListener('click', event => {
    event.stopPropagation();
    if (box.classList.contains('fs-breadcrumb-editing')) {
      input.blur();
    } else {
      startEditing();
    }
  });

  nav.addEventListener('dblclick', startEditing);
  input.addEventListener('blur', stopEditing);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      input.blur();
    }
    if (event.key === 'Enter') {
      requestAnimationFrame(() => input.blur());
    }
  });

  addEventListener('hashchange', () => {
    if (!box.classList.contains('fs-breadcrumb-editing')) render();
  });

  render();
})();
