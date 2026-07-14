(() => {
  'use strict';

  const table = document.getElementById('table');
  const grid = document.getElementById('grid');
  const activity = document.getElementById('activityView');
  const toggle = document.getElementById('viewToggle');

  if (!table || !grid || !toggle) return;

  const listIcon = '<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14"/><circle cx="3" cy="6" r=".7"/><circle cx="3" cy="12" r=".7"/><circle cx="3" cy="18" r=".7"/></svg></span>';
  const gridIcon = '<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></span>';

  function currentMode() {
    return localStorage.getItem('fs-view') === 'grid' ? 'grid' : 'list';
  }

  function setHidden(element, hidden) {
    if (element.hidden !== hidden) element.hidden = hidden;
  }

  function apply(mode = currentMode()) {
    const inActivity = Boolean(activity && !activity.hidden);

    if (inActivity) {
      setHidden(table, true);
      setHidden(grid, true);
    } else if (mode === 'grid') {
      setHidden(table, true);
      setHidden(grid, false);
    } else {
      setHidden(table, false);
      setHidden(grid, true);
    }

    const title = mode === 'grid' ? '목록형 자세히 보기로 전환' : '큰 아이콘 보기로 전환';
    if (toggle.dataset.singleViewMode !== mode) {
      toggle.innerHTML = mode === 'grid' ? listIcon : gridIcon;
      toggle.dataset.singleViewMode = mode;
    }
    if (toggle.title !== title) toggle.title = title;
    if (toggle.getAttribute('aria-label') !== title) toggle.setAttribute('aria-label', title);
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply(currentMode());
    });
  }

  toggle.addEventListener('click', scheduleApply, true);

  const observer = new MutationObserver(scheduleApply);
  observer.observe(table, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(grid, { attributes: true, attributeFilter: ['hidden'] });
  if (activity) observer.observe(activity, { attributes: true, attributeFilter: ['hidden'] });

  window.addEventListener('storage', event => {
    if (event.key === 'fs-view') scheduleApply();
  });

  apply();
})();
