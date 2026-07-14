(() => {
  'use strict';

  const app = document.querySelector('.app');
  const list = document.getElementById('list');
  const address = document.getElementById('address');
  const search = document.getElementById('search');
  const locationBar = address?.closest('.bar');

  if (!app || !list || !address || !search || !locationBar) return;

  const style = document.createElement('style');
  style.textContent = `
    .app.fs-location-responsive{
      --fs-location-row-height:50px;
      grid-template-rows:42px 49px var(--fs-location-row-height) minmax(0,1fr) 29px;
      transition:grid-template-rows .18s ease;
    }
    .fs-location-bar{
      min-height:0;
      overflow:hidden;
      transition:opacity .14s ease,transform .18s ease,padding .18s ease,border-color .18s ease;
    }
    .app.fs-location-hidden{
      grid-template-rows:42px 49px 0 minmax(0,1fr) 29px;
    }
    .app.fs-location-hidden .fs-location-bar{
      opacity:0;
      transform:translateY(-8px);
      pointer-events:none;
      padding-top:0;
      padding-bottom:0;
      border-bottom-color:transparent!important;
    }

    @media(max-width:720px){
      .app.fs-location-responsive{
        --fs-location-row-height:92px;
      }
      .fs-location-bar{
        display:grid;
        grid-template-columns:34px 34px 34px minmax(0,1fr);
        grid-template-rows:36px 36px;
        align-content:center;
        align-items:center;
        gap:6px;
        padding:7px 8px;
      }
      .fs-location-bar #back{grid-column:1;grid-row:1}
      .fs-location-bar #forward{grid-column:2;grid-row:1}
      .fs-location-bar #up{grid-column:3;grid-row:1}
      .fs-location-bar .address{
        grid-column:4;
        grid-row:1;
        width:100%;
        min-width:0;
      }
      .fs-location-bar .search{
        grid-column:1 / -1;
        grid-row:2;
        width:100%;
        min-width:0;
      }
      .app.fs-location-hidden .fs-location-bar{
        padding-top:0;
        padding-bottom:0;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .app.fs-location-responsive,.fs-location-bar{transition:none}
    }
  `;
  document.head.append(style);

  app.classList.add('fs-location-responsive');
  locationBar.classList.add('fs-location-bar');

  let frame = 0;

  function applyVisibility() {
    frame = 0;
    const hidden = list.scrollTop > 4;
    app.classList.toggle('fs-location-hidden', hidden);
    locationBar.setAttribute('aria-hidden', String(hidden));
  }

  function scheduleVisibilityUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(applyVisibility);
  }

  function resetForNavigation() {
    list.scrollTop = 0;
    app.classList.remove('fs-location-hidden');
    locationBar.setAttribute('aria-hidden', 'false');
  }

  list.addEventListener('scroll', scheduleVisibilityUpdate, { passive: true });
  addEventListener('hashchange', resetForNavigation);
  addEventListener('resize', scheduleVisibilityUpdate, { passive: true });

  applyVisibility();
})();
