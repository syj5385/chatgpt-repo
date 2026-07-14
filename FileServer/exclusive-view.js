(() => {
  'use strict';

  const content = document.getElementById('content');
  const activity = document.getElementById('activityView');
  const toggle = document.getElementById('viewToggle');

  if (!content) return;

  function apply() {
    const inActivity = Boolean(activity && !activity.hidden);
    const mode = localStorage.getItem('fs-view') === 'grid' ? 'grid' : 'list';

    content.classList.toggle('fs-view-activity', inActivity);
    content.classList.toggle('fs-view-grid', !inActivity && mode === 'grid');
    content.classList.toggle('fs-view-list', !inActivity && mode !== 'grid');
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  toggle?.addEventListener('click', schedule);
  window.addEventListener('storage', event => {
    if (event.key === 'fs-view') schedule();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(content, { childList: true, subtree: true });
  if (activity) observer.observe(activity, { attributes: true, attributeFilter: ['hidden'] });

  apply();
})();
