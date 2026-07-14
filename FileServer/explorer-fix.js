(() => {
  'use strict';

  // explorer-v2.js reads E.closeDrawer even though closeDrawer is missing from
  // its local element map. Provide the value without a getter/setter so Safari
  // WebIDL conversions cannot trigger user code while constructing Headers,
  // Requests, URLs, or other platform objects.
  const closeDrawer = document.getElementById('closeDrawer');
  if (!closeDrawer) return;

  if (!Object.prototype.hasOwnProperty.call(Object.prototype, 'closeDrawer')) {
    Object.defineProperty(Object.prototype, 'closeDrawer', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: closeDrawer
    });

    // explorer-v2 binds synchronously when its script executes immediately
    // after this one. Remove the temporary compatibility property afterward.
    window.setTimeout(() => {
      try {
        delete Object.prototype.closeDrawer;
      } catch (error) {
        console.error('Failed to remove closeDrawer compatibility property', error);
      }
    }, 0);
  }
})();
