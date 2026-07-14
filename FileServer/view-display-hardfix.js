(() => {
  'use strict';

  function install() {
    const content = document.getElementById('content');
    const table = document.getElementById('table');
    const grid = document.getElementById('grid');
    const activity = document.getElementById('activityView');
    const toggle = document.getElementById('viewToggle');

    if (!content || !table || !grid) return;

    function currentMode() {
      return localStorage.getItem('fs-view') === 'grid' ? 'grid' : 'list';
    }

    function setDisplay(element, value) {
      if (!element) return;
      if (element.style.getPropertyValue('display') !== value || element.style.getPropertyPriority('display') !== 'important') {
        element.style.setProperty('display', value, 'important');
      }
    }

    function apply() {
      const inActivity = Boolean(activity && !activity.hidden);
      const mode = currentMode();

      if (inActivity) {
        setDisplay(table, 'none');
        setDisplay(grid, 'none');
        setDisplay(activity, 'block');
        return;
      }

      setDisplay(activity, 'none');
      if (mode === 'grid') {
        setDisplay(table, 'none');
        setDisplay(grid, 'grid');
      } else {
        setDisplay(table, 'table');
        setDisplay(grid, 'none');
      }
    }

    let scheduled = false;
    function scheduleApply() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    }

    // explorer-v2 changes localStorage and hidden attributes during rendering.
    // Re-apply after those changes, while observing only attributes that this
    // hard fix does not write itself, preventing recursive rendering loops.
    toggle?.addEventListener('click', () => setTimeout(scheduleApply, 0), true);
    window.addEventListener('storage', event => {
      if (event.key === 'fs-view') scheduleApply();
    });

    const observer = new MutationObserver(scheduleApply);
    observer.observe(table, { attributes: true, attributeFilter: ['hidden'] });
    observer.observe(grid, { attributes: true, attributeFilter: ['hidden'] });
    if (activity) observer.observe(activity, { attributes: true, attributeFilter: ['hidden'] });

    // Rendering replaces rows and tiles but not the two view containers. This
    // observer catches mode changes triggered through context-menu helpers.
    observer.observe(content, { childList: true, subtree: false });

    apply();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
