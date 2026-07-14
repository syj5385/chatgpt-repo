(() => {
  'use strict';

  const menu = document.getElementById('menu');
  if (!menu) return;

  function hasLabel(label) {
    return [...menu.querySelectorAll('button')].some(button => button.textContent.trim() === label);
  }

  function appendToolbarActions() {
    if (!menu.classList.contains('show') || menu.querySelector('[data-compact-toolbar-action]')) return;

    const divider = document.createElement('hr');
    divider.dataset.compactToolbarAction = 'true';

    const view = document.createElement('button');
    view.dataset.compactToolbarAction = 'true';
    view.textContent = '보기 방식 전환';
    view.onclick = () => {
      document.getElementById('viewToggle')?.click();
      menu.classList.remove('show');
    };

    const refresh = document.createElement('button');
    refresh.dataset.compactToolbarAction = 'true';
    refresh.textContent = '새로고침';
    refresh.onclick = () => {
      document.getElementById('refresh')?.click();
      menu.classList.remove('show');
    };

    menu.append(divider, view);
    if (!hasLabel('새로고침')) menu.append(refresh);
  }

  const observer = new MutationObserver(() => queueMicrotask(appendToolbarActions));
  observer.observe(menu, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
})();
