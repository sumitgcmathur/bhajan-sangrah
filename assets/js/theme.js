(function () {
  var STORAGE_KEY = 'bhajan-sangrah-theme';
  var THEME_COLOR_LIGHT = '#8b3a4a';
  var THEME_COLOR_DARK = '#2a1218';

  function readStored() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return t === 'dark' || t === 'light' ? t : null;
    } catch (e) {
      return null;
    }
  }

  function systemPrefersDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function effectiveTheme() {
    var stored = readStored();
    if (stored) return stored;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function setThemeColor(theme) {
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (!metas.length) return;
    var color = theme === 'dark' ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
    metas.forEach(function (meta) {
      meta.setAttribute('content', color);
    });
  }

  function applyTheme(theme, persist) {
    var root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
      if (persist) {
        try {
          localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
          /* ignore */
        }
      }
    } else {
      root.removeAttribute('data-theme');
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        /* ignore */
      }
      theme = systemPrefersDark() ? 'dark' : 'light';
    }
    syncThemeButtons(theme);
    setThemeColor(theme);
  }

  function syncThemeButtons(theme) {
    var isDark = theme === 'dark';
    document.querySelectorAll('[data-action="theme"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('aria-label', isDark ? 'सामान्य रंग (हल्का)' : 'गहरा रंग');
      var icon = btn.querySelector('.mobile-bar__icon--theme');
      if (icon) icon.textContent = isDark ? '\u2600' : '\u263E';
    });
  }

  function init() {
    var stored = readStored();
    if (stored) {
      applyTheme(stored, false);
    } else {
      syncThemeButtons(effectiveTheme());
      setThemeColor(effectiveTheme());
    }

    document.querySelectorAll('[data-action="theme"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next, true);
      });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!readStored()) {
        syncThemeButtons(effectiveTheme());
        setThemeColor(effectiveTheme());
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
