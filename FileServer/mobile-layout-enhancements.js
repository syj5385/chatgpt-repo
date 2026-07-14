(() => {
  'use strict';

  const toggle = document.getElementById('mobileSidebarToggle');
  const sidebar = document.querySelector('.side');
  if (!toggle || !sidebar) return;

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mobile-sidebar-backdrop';
  backdrop.setAttribute('aria-label', '사이드바 닫기');
  document.body.append(backdrop);

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('show');
    document.body.classList.add('mobile-sidebar-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
    document.body.classList.remove('mobile-sidebar-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    sidebar.classList.contains('mobile-open') ? closeSidebar() : openSidebar();
  });

  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSidebar();
  });

  sidebar.addEventListener('click', event => {
    if (event.target.closest('button')) closeSidebar();
  });

  const media = matchMedia('(min-width: 781px)');
  media.addEventListener?.('change', event => {
    if (event.matches) closeSidebar();
  });
})();
