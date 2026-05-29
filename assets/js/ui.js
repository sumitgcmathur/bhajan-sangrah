(function () {
  var STORAGE_INDEX_OPEN = 'bhajan-sangrah-index-open';

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function scrollToBhajanElement(el) {
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function scrollToBhajanById(hashId, delayMs) {
    var target = document.getElementById(hashId);
    if (!target) return;
    if (delayMs) {
      window.setTimeout(function () {
        scrollToBhajanElement(target);
      }, delayMs);
    } else {
      scrollToBhajanElement(target);
    }
  }

  function syncHeroViewBar(showIndex) {
    document.querySelectorAll('[data-action="hero-view"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', showIndex ? 'true' : 'false');
      btn.setAttribute('aria-label', showIndex ? 'चित्र दिखाएँ' : 'भजन सूची दिखाएँ');
      var whenBanner = btn.querySelector('.mobile-bar__when-banner');
      var whenIndex = btn.querySelector('.mobile-bar__when-index');
      if (whenBanner) whenBanner.hidden = showIndex;
      if (whenIndex) whenIndex.hidden = !showIndex;
    });
  }

  function collapseSectionHeroIndex() {
    var hero = document.getElementById('section-hero');
    if (!hero) return;
    hero.classList.remove('is-index');
    var indexView = hero.querySelector('.section-hero__view--index');
    if (indexView) indexView.hidden = true;
    syncHeroViewBar(false);
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
      indexLinks[i].addEventListener('click', function (e) {
        var href = e.currentTarget.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        var id = href.slice(1);
        var target = document.getElementById(id);
        if (!target || !target.classList.contains('bhajan-card')) return;
        e.preventDefault();
        if (isMobile()) setOpen(false);
        if (document.getElementById('section-hero')) collapseSectionHeroIndex();
        history.pushState(null, '', href);
        scrollToBhajanById(id);
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

  /* ---- Section hero: banner ↔ index (bottom bar toggle) ---- */
  function setSectionHeroIndexMode(showIndex) {
    var hero = document.getElementById('section-hero');
    if (!hero) return;
    hero.classList.toggle('is-index', showIndex);
    var indexView = hero.querySelector('.section-hero__view--index');
    if (indexView) indexView.hidden = !showIndex;
    syncHeroViewBar(showIndex);
  }

  function scrollToSectionHero() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function initSectionHeroToggle() {
    var hero = document.getElementById('section-hero');
    if (!hero) return;

    setSectionHeroIndexMode(false);
    scrollToSectionHero();
    syncHeroPagerLayout();

    hero.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        var id = href.slice(1);
        var target = document.getElementById(id);
        if (!target || !target.classList.contains('bhajan-card')) return;
        e.preventDefault();
        setSectionHeroIndexMode(false);
        history.pushState(null, '', href);
        scrollToBhajanById(id);
      });
    });

    document.querySelectorAll('[data-action="hero-view"]').forEach(function (barBtn) {
      barBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var showIndex = !hero.classList.contains('is-index');
        setSectionHeroIndexMode(showIndex);
        scrollToSectionHero();
      });
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

  function syncHeroPagerLayout() {
    var hero = document.getElementById('section-hero');
    var pager = document.getElementById('bhajan-pager');
    if (!hero) return;
    var pastHero = hero.getBoundingClientRect().bottom <= window.innerHeight * 0.88;
    document.body.classList.toggle('pager-visible', pastHero);
    if (pager) pager.hidden = !pastHero;
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

    if (document.getElementById('section-hero')) {
      syncHeroPagerLayout();
      window.addEventListener('scroll', syncHeroPagerLayout, { passive: true });
      window.addEventListener('resize', syncHeroPagerLayout);
    } else if (pager) {
      document.body.classList.add('pager-visible');
      pager.hidden = false;
    }

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
        scrollToBhajanById(hashId, document.getElementById('section-hero') ? 220 : 50);
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
      pager.hidden = false;
      pager.addEventListener('click', function (e) {
        var a = e.target.closest('.bhajan-pager__link');
        if (!a || a.classList.contains('is-disabled')) {
          e.preventDefault();
          return;
        }
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        e.preventDefault();
        var id = href.slice(1);
        history.pushState(null, '', href);
        scrollToBhajanById(id);
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

  initCollapsibleIndex();
  initSectionHeroToggle();
  initSectionScrollUi();
  initIndexAnchorScroll();
})();
