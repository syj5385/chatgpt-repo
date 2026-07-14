(() => {
  'use strict';

  // explorer-v2.js references E.closeDrawer, but the element was omitted from
  // its local element map. Supply that single missing lookup through a
  // non-enumerable, one-shot prototype getter so initialization can finish.
  // The getter removes itself immediately after the explorer reads it.
  if (!Object.prototype.hasOwnProperty('closeDrawer')) {
    Object.defineProperty(Object.prototype, 'closeDrawer', {
      configurable: true,
      enumerable: false,
      get() {
        const element = document.getElementById('closeDrawer');
        delete Object.prototype.closeDrawer;
        return element;
      },
      set(value) {
        Object.defineProperty(this, 'closeDrawer', {
          configurable: true,
          enumerable: true,
          writable: true,
          value
        });
      }
    });
  }
})();
