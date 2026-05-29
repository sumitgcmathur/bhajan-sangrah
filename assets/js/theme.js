(function () {
  var STORAGE_KEY = 'bhajan-sangrah-theme';
  var THEMES = ['current', 'blue', 'white'];

  function applyTheme(id) {
    var theme = THEMES.indexOf(id) >= 0 ? id : 'current';
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
    document.querySelectorAll('[data-theme-pick]').forEach(function (btn) {
      var picked = btn.getAttribute('data-theme-pick') === theme;
      btn.setAttribute('aria-pressed', picked ? 'true' : 'false');
      btn.classList.toggle('is-active', picked);
    });
  }

  function init() {
    var saved = 'current';
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && THEMES.indexOf(v) >= 0) saved = v;
    } catch (e) {}
    applyTheme(saved);
    document.querySelectorAll('[data-theme-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTheme(btn.getAttribute('data-theme-pick'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
