(() => {
  'use strict';

  // explorer-v2.js reads E.closeDrawer even though closeDrawer is missing from
  // its local element map. Provide a non-enumerable data value rather than a
  // getter/setter so Safari platform-object conversions cannot execute user
  // code unexpectedly.
  const closeDrawer = document.getElementById('closeDrawer');
  if (!closeDrawer) return;

  if (!Object.prototype.hasOwnProperty.call(Object.prototype, 'closeDrawer')) {
    Object.defineProperty(Object.prototype, 'closeDrawer', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: closeDrawer
    });

    // bootstrap() is asynchronous. Keep the compatibility value until the
    // explorer has actually attached the close handler, then remove it.
    let checks = 0;
    const timer = window.setInterval(() => {
      checks += 1;
      if (typeof closeDrawer.onclick === 'function' || checks >= 200) {
        window.clearInterval(timer);
        try {
          delete Object.prototype.closeDrawer;
        } catch (error) {
          console.error('Failed to remove closeDrawer compatibility property', error);
        }
      }
    }, 25);
  }
})();
