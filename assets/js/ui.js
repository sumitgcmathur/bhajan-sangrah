(function () {
  var STORAGE_READING = 'bhajan-sangrah-reading-mode';
  var STORAGE_LAST = 'bhajan-sangrah-last';
  var STORAGE_INDEX_OPEN = 'bhajan-sangrah-index-open';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function siteBase() {
    var base = document.body.getAttribute('data-site-base') || '/';
    return base.endsWith('/') ? base : base + '/';
  }

  function resolveHref(href) {
    try {
      return new URL(href, window.location.href).href;
    } catch (e) {
      return href;
    }
  }

  /* ---- Reading mode ---- */
  function setReadingMode(on) {
    document.body.classList.toggle('reading-mode', on);
    var buttons = document.querySelectorAll('[data-action="reading-mode"], .reading-mode-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    try {
      localStorage.setItem(STORAGE_READING, on ? '1' : '0');
    } catch (e) {}
  }

  function initReadingMode() {
    var on = false;
    try {
      on = localStorage.getItem(STORAGE_READING) === '1';
    } catch (e) {}
    setReadingMode(on);
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="reading-mode"], .reading-mode-toggle');
      if (!btn) return;
      setReadingMode(!document.body.classList.contains('reading-mode'));
    });
  }

  /* ---- Collapsible bhajan index ---- */
  function initCollapsibleIndex() {
    var nav = document.getElementById('bhajan-index');
    if (!nav || !nav.classList.contains('bhajan-index--collapsible')) return;
    var toggle = nav.querySelector('.bhajan-index__toggle');
    var panel = document.getElementById('bhajan-index-panel');
    if (!toggle || !panel) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
      toggle.querySelector('.bhajan-index__toggle-text').textContent = open
        ? 'भजन सूची छिपाएँ'
        : 'भजन सूची दिखाएँ';
      try {
        localStorage.setItem(STORAGE_INDEX_OPEN, open ? '1' : '0');
      } catch (e) {}
    }

    var defaultOpen = false;
    if (!isMobile()) defaultOpen = true;
    try {
      var saved = localStorage.getItem(STORAGE_INDEX_OPEN);
      if (saved === '1') defaultOpen = true;
      if (saved === '0') defaultOpen = false;
    } catch (e) {}
    if (window.location.hash && nav.querySelector('a[href="' + window.location.hash + '"]')) {
      defaultOpen = true;
    }
    setOpen(defaultOpen);

    toggle.addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    var indexLinks = panel.querySelectorAll('a[href^="#"]');
    for (var i = 0; i < indexLinks.length; i++) {
      indexLinks[i].addEventListener('click', function () {
        if (isMobile()) setOpen(false);
      });
    }

    document.querySelectorAll('[data-action="index"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (!isMobile()) return;
        if (document.getElementById('section-hero')) return;
        e.preventDefault();
        setOpen(true);
        nav.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* ---- Section hero: banner ↔ index ---- */
  function setSectionHeroIndexMode(showIndex) {
    var hero = document.getElementById('section-hero');
    var btn = document.getElementById('section-hero-toggle');
    if (!hero) return;
    hero.classList.toggle('is-index', showIndex);
    var indexView = hero.querySelector('.section-hero__view--index');
    if (indexView) indexView.hidden = !showIndex;
    if (btn) {
      btn.setAttribute('aria-expanded', showIndex ? 'true' : 'false');
      var whenBanner = btn.querySelector('.section-hero__toggle-when-banner');
      var whenIndex = btn.querySelector('.section-hero__toggle-when-index');
      if (whenBanner) whenBanner.hidden = showIndex;
      if (whenIndex) whenIndex.hidden = !showIndex;
    }
    try {
      localStorage.setItem('bhajan-sangrah-hero-index', showIndex ? '1' : '0');
    } catch (e) {}
  }

  function initSectionHeroToggle() {
    var hero = document.getElementById('section-hero');
    var btn = document.getElementById('section-hero-toggle');
    if (!hero || !btn) return;

    var showIndex = false;
    if (window.location.hash && hero.querySelector('a[href="' + window.location.hash + '"]')) {
      showIndex = false;
    } else {
      try {
        showIndex = localStorage.getItem('bhajan-sangrah-hero-index') === '1';
      } catch (e) {}
    }
    setSectionHeroIndexMode(showIndex);

    btn.addEventListener('click', function () {
      setSectionHeroIndexMode(!hero.classList.contains('is-index'));
    });

    hero.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function () {
        if (isMobile()) setSectionHeroIndexMode(false);
      });
    });

    document.querySelectorAll('[data-action="index"]').forEach(function (barBtn) {
      barBtn.addEventListener('click', function (e) {
        e.preventDefault();
        setSectionHeroIndexMode(true);
        hero.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* ---- Continue reading ---- */
  function saveLastRead(entry) {
    try {
      localStorage.setItem(STORAGE_LAST, JSON.stringify(entry));
    } catch (e) {}
    renderContinueReading();
  }

  function loadLastRead() {
    try {
      var raw = localStorage.getItem(STORAGE_LAST);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function renderContinueReading() {
    var box = document.getElementById('continue-reading');
    var link = document.getElementById('continue-reading-link');
    if (!box || !link) return;
    var last = loadLastRead();
    if (!last || !last.href) {
      box.hidden = true;
      return;
    }
    var current = resolveHref(window.location.href);
    var target = resolveHref(last.href);
    if (current === target) {
      box.hidden = true;
      return;
    }
    var label = last.bhajanTitle || last.sectionTitle || 'पिछला स्थान';
    link.href = last.href;
    link.textContent = 'जहाँ छोड़ा था: ' + label;
    box.hidden = false;
  }

  function initContinueReading() {
    renderContinueReading();
    var main = document.querySelector('.content-main--section');
    if (!main) return;

    var cards = document.querySelectorAll('.bhajan-card');
    if (!cards.length) return;

    var sectionTitle = main.getAttribute('data-section-title') || '';
    var pageHref = window.location.pathname + window.location.search;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) return;
          var card = entry.target;
          var titleEl = card.querySelector('.bhajan-card__title');
          var title = titleEl ? titleEl.textContent.replace(/^\d+\.\s*/, '').trim() : '';
          saveLastRead({
            href: pageHref + '#' + card.id,
            sectionTitle: sectionTitle,
            bhajanTitle: title,
            ts: Date.now(),
          });
        });
      },
      { root: null, rootMargin: '-20% 0px -55% 0px', threshold: [0.35, 0.5, 0.75] }
    );

    cards.forEach(function (card) {
      if (card.id) observer.observe(card);
    });
  }

  /* ---- Section sticky header + pager ---- */
  function parseBhajanNav() {
    var main = document.querySelector('.content-main--section');
    if (!main) return [];
    var raw = main.getAttribute('data-bhajan-nav');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  function toDevaNum(n) {
    var deva = '०१२३४५६७८९';
    return String(n)
      .split('')
      .map(function (d) {
        return deva[Number(d)] || d;
      })
      .join('');
  }

  function initSectionScrollUi() {
    var nav = parseBhajanNav();
    if (!nav.length) return;

    var header = document.getElementById('section-scroll-header');
    var progress = document.getElementById('section-scroll-progress');
    var pager = document.getElementById('bhajan-pager');
    var prevLink = document.getElementById('bhajan-pager-prev');
    var nextLink = document.getElementById('bhajan-pager-next');
    var pagerStatus = document.getElementById('bhajan-pager-status');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.bhajan-card'));
    var sectionTitle = document.querySelector('.content-main--section');
    sectionTitle = sectionTitle ? sectionTitle.getAttribute('data-section-title') : '';

    var currentIndex = 0;

    function updateUi(index) {
      if (index < 0 || index >= nav.length) return;
      currentIndex = index;
      var item = nav[index];
      if (progress && header) {
        progress.textContent = toDevaNum(item.num) + ' / ' + toDevaNum(nav.length);
        header.hidden = false;
      }
      if (pager && prevLink && nextLink) {
        pager.hidden = false;
        var hasPrev = index > 0;
        var hasNext = index < nav.length - 1;
        prevLink.href = hasPrev ? '#' + nav[index - 1].id : '#';
        nextLink.href = hasNext ? '#' + nav[index + 1].id : '#';
        prevLink.classList.toggle('is-disabled', !hasPrev);
        nextLink.classList.toggle('is-disabled', !hasNext);
        if (pagerStatus) {
          pagerStatus.textContent = item.num + '. ' + item.title;
        }
      }
    }

    if (header) {
      var titleEl = header.querySelector('.section-scroll-header__title');
      if (titleEl && sectionTitle) titleEl.textContent = sectionTitle;
    }

    var scrollObserver = new IntersectionObserver(
      function (entries) {
        var best = null;
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { el: entry.target, ratio: entry.intersectionRatio };
          }
        });
        if (!best) return;
        var idx = cards.indexOf(best.el);
        if (idx >= 0) updateUi(idx);
      },
      { root: null, rootMargin: '-18% 0px -50% 0px', threshold: [0.15, 0.35, 0.55] }
    );

    cards.forEach(function (card) {
      scrollObserver.observe(card);
    });

    if (window.location.hash) {
      var hashId = window.location.hash.slice(1);
      var hashIdx = -1;
      for (var h = 0; h < nav.length; h++) {
        if (nav[h].id === hashId) {
          hashIdx = h;
          break;
        }
      }
      if (hashIdx >= 0) {
        updateUi(hashIdx);
        var target = document.getElementById(hashId);
        if (target) {
          window.setTimeout(function () {
            target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
          }, 80);
        }
      } else if (cards.length) {
        updateUi(0);
      }
    } else if (cards.length) {
      updateUi(0);
    }

    var mainTitle = document.querySelector('.section-title');
    if (header && mainTitle) {
      var titleObserver = new IntersectionObserver(
        function (entries) {
          var past = entries[0] && !entries[0].isIntersecting;
          header.classList.toggle('is-visible', past);
        },
        { root: null, threshold: 0 }
      );
      titleObserver.observe(mainTitle);
    }

    if (pager) {
      pager.addEventListener('click', function (e) {
        var a = e.target.closest('.bhajan-pager__link');
        if (!a || a.classList.contains('is-disabled')) {
          e.preventDefault();
        }
      });
    }
  }

  /* ---- Mobile index link: smooth scroll ---- */
  function initIndexAnchorScroll() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href="#bhajan-index"]');
      if (!a || a.getAttribute('data-action') === 'index') return;
      var hero = document.getElementById('section-hero');
      if (hero) return;
      var nav = document.getElementById('bhajan-index');
      if (!nav) return;
      e.preventDefault();
      nav.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  initReadingMode();
  initCollapsibleIndex();
  initSectionHeroToggle();
  initContinueReading();
  initSectionScrollUi();
  initIndexAnchorScroll();
})();
