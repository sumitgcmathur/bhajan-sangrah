(function () {
  if (!('serviceWorker' in navigator)) return;

  var base = document.body.getAttribute('data-site-base') || '/';
  if (!base.endsWith('/')) base += '/';

  function showUpdateBanner(registration) {
    if (document.getElementById('pwa-update')) return;
    var bar = document.createElement('div');
    bar.id = 'pwa-update';
    bar.className = 'pwa-update';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<p class="pwa-update__text">नया संस्करण उपलब्ध है — ताज़ा भजन लोड करें।</p>' +
      '<button type="button" class="pwa-update__btn">रीफ़्रेश</button>';
    bar.querySelector('.pwa-update__btn').addEventListener('click', function () {
      var waiting = registration.waiting;
      if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
      window.location.reload();
    });
    document.body.appendChild(bar);
  }

  function trackWaitingWorker(registration) {
    if (registration.waiting) {
      showUpdateBanner(registration);
      return;
    }
    registration.addEventListener('updatefound', function () {
      var worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', function () {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(registration);
        }
      });
    });
  }

  var reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register(base + 'sw.js', { scope: base })
      .then(function (registration) {
        trackWaitingWorker(registration);
        setInterval(function () {
          registration.update();
        }, 60 * 60 * 1000);
      })
      .catch(function () {
        /* SW optional — site works without it */
      });
  });
})();
