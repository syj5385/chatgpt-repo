(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  function svg(path) { return '<span class="fs-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + path + '</svg></span>'; }

  function toast(message) {
    var host = byId('toasts');
    if (!host) return;
    var item = document.createElement('div');
    item.textContent = message;
    host.appendChild(item);
    window.setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 3500);
  }

  function clickElement(id) {
    var element = byId(id);
    if (!element) return toast('기능 요소를 찾지 못했습니다.');
    element.click();
  }

  function createPopup(triggerId, className, items) {
    var trigger = byId(triggerId);
    if (!trigger) return;

    var old = document.querySelector('.' + className);
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var menu = document.createElement('div');
    menu.className = 'mobile-action-menu ' + className;
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    function closeMenu() {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }

    items.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.innerHTML = item.html;
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        item.action();
      });
      menu.appendChild(button);
    });
    document.body.appendChild(menu);

    function positionMenu() {
      if (menu.hidden) return;
      var rect = trigger.getBoundingClientRect();
      var width = 190;
      menu.style.width = width + 'px';
      menu.style.left = Math.max(6, Math.min(rect.left, window.innerWidth - width - 6)) + 'px';
      menu.style.top = Math.max(6, Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 6)) + 'px';
    }

    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var willOpen = menu.hidden;
      var menus = document.querySelectorAll('.mobile-action-menu');
      for (var i = 0; i < menus.length; i += 1) menus[i].hidden = true;
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) positionMenu();
    });

    document.addEventListener('click', function (event) {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) closeMenu();
    });
    window.addEventListener('resize', positionMenu);
    document.addEventListener('scroll', closeMenu, true);
  }

  function setupToolbar() {
    createPopup('newCreateAction', 'mobile-create-menu', [
      { html: svg('<path d="M3 6.5h6l1.7 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8.5h18"/>') + '<span>새 폴더</span>', action: function () { clickElement('newFolder'); } },
      { html: svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 12h5M10 16h5"/>') + '<span>새 파일</span>', action: function () { clickElement('newFile'); } }
    ]);

    createPopup('newUploadAction', 'mobile-upload-menu', [
      { html: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>') + '<span>파일 업로드</span>', action: function () { clickElement('filePicker'); } },
      { html: svg('<path d="M3 7h6l1.7 2H21v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>') + '<span>폴더 업로드</span>', action: function () { clickElement('folderPicker'); } }
    ]);

    var listButton = byId('listViewAction');
    var gridButton = byId('gridViewAction');
    var viewToggle = byId('viewToggle');

    function currentView() {
      var grid = byId('grid');
      return grid && !grid.hidden ? 'grid' : 'list';
    }

    function updateViewButtons() {
      var mode = currentView();
      if (listButton) listButton.classList.toggle('active', mode === 'list');
      if (gridButton) gridButton.classList.toggle('active', mode === 'grid');
    }

    function requestView(mode) {
      if (!viewToggle) return toast('보기 전환 기능을 찾지 못했습니다.');
      if (currentView() !== mode) viewToggle.click();
      window.setTimeout(updateViewButtons, 0);
    }

    if (listButton) listButton.addEventListener('click', function (event) { event.preventDefault(); requestView('list'); });
    if (gridButton) gridButton.addEventListener('click', function (event) { event.preventDefault(); requestView('grid'); });
    updateViewButtons();
  }

  function setupSidebar() {
    var topBar = document.querySelector('.app > .bar:first-child');
    var sidebar = document.querySelector('.side');
    if (!topBar || !sidebar) return;

    var toggle = byId('mobileSidebarToggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'mobileSidebarToggle';
      toggle.title = '사이드바 열기';
      toggle.setAttribute('aria-label', '사이드바 열기');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = svg('<path d="M4 6h16M4 12h16M4 18h16"/>');
    }
    topBar.insertBefore(toggle, topBar.firstChild);

    if (!sidebar.id) sidebar.id = 'mobileSidebar';
    toggle.setAttribute('aria-controls', sidebar.id);

    var previousBackdrop = document.querySelector('.mobile-sidebar-backdrop');
    if (previousBackdrop && previousBackdrop.parentNode) previousBackdrop.parentNode.removeChild(previousBackdrop);

    var backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'mobile-sidebar-backdrop';
    backdrop.setAttribute('aria-label', '사이드바 닫기');
    document.body.appendChild(backdrop);

    function closeSidebar() {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('show');
      document.body.classList.remove('mobile-sidebar-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function (event) {
      event.preventDefault();
      var open = !sidebar.classList.contains('mobile-open');
      sidebar.classList.toggle('mobile-open', open);
      backdrop.classList.toggle('show', open);
      document.body.classList.toggle('mobile-sidebar-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    backdrop.addEventListener('click', closeSidebar);
  }

  function moveToolsToBottom() {
    var sidebar = document.querySelector('.side');
    var shares = byId('sharesButton');
    var theme = byId('themeButton');
    if (!sidebar || !shares || !theme) return;

    var headings = sidebar.getElementsByTagName('small');
    var toolsHeading = null;
    for (var i = 0; i < headings.length; i += 1) {
      if (headings[i].textContent.replace(/^\s+|\s+$/g, '') === '도구') {
        toolsHeading = headings[i];
        break;
      }
    }
    if (!toolsHeading) return;

    sidebar.appendChild(toolsHeading);
    sidebar.appendChild(shares);
    sidebar.appendChild(theme);
  }

  function initializeAfterExplorer() {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      var ready = byId('body') && byId('grid') && byId('newFolder') && byId('newFile') && byId('viewToggle');
      var connected = byId('conn') && byId('conn').textContent !== 'Ready';
      if ((ready && connected) || attempts >= 40) {
        window.clearInterval(timer);
        try { setupToolbar(); } catch (error) { console.error('toolbar setup failed', error); }
        try { setupSidebar(); } catch (error) { console.error('sidebar setup failed', error); }
        try { moveToolsToBottom(); } catch (error) { console.error('tool section move failed', error); }
      }
    }, 100);
  }

  if (document.readyState === 'complete') initializeAfterExplorer();
  else window.addEventListener('load', initializeAfterExplorer);
})();
