(() => {
  'use strict';

  // Keep toolbar upload and full-page drag-and-drop upload, but remove the
  // large upload instruction panel above the file list.
  document.getElementById('dropHint')?.remove();
})();
