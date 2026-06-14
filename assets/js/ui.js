(function () {
  var STORAGE_INDEX_OPEN = 'bhajan-sangrah-index-open';
  var sectionNavApi = null;

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

  function bindBhajanIndexLinks(root) {
    if (!root) return;
    root.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) !== '#') return;
        var id = href.slice(1);
        var target = document.getElementById(id);
        if (!target || !target.classList.contains('bhajan-card')) return;
        e.preventDefault();
        if (sectionNavApi) sectionNavApi.navigateToBhajan(id);
        else {
          history.pushState(null, '', href);
          scrollToBhajanById(id);
        }
      });
    });
  }

  /* ---- Collapsible bhajan index (sections without banner) ---- */
  function initCollapsibleIndex() {
    document.querySelectorAll('.bhajan-index--collapsible').forEach(function (nav) {
      var toggle = nav.querySelector('.bhajan-index__toggle');
      var panel = nav.querySelector('.bhajan-index__panel');
      if (!toggle || !panel) return;
      var storageKey =
        nav.id === 'master-bhajan-index'
          ? 'bhajan-sangrah-master-index-open'
          : STORAGE_INDEX_OPEN;

      function setOpen(open) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
        toggle.querySelector('.bhajan-index__toggle-text').textContent = open
          ? 'भजन सूची छिपाएँ'
          : 'भजन सूची दिखाएँ';
        try {
          localStorage.setItem(storageKey, open ? '1' : '0');
        } catch (e) {}
      }

      var defaultOpen = nav.id === 'master-bhajan-index' ? false : !isMobile();
      try {
        var saved = localStorage.getItem(storageKey);
        if (saved === '1') defaultOpen = true;
        if (saved === '0') defaultOpen = false;
      } catch (e) {}
      if (window.location.hash && panel.querySelector('a[href="' + window.location.hash + '"]')) {
        defaultOpen = true;
      }
      setOpen(defaultOpen);

      toggle.addEventListener('click', function () {
        setOpen(panel.hidden);
      });

      bindBhajanIndexLinks(panel);
    });
  }

  function getIndexNav() {
    return document.getElementById('bhajan-index') || document.getElementById('master-bhajan-index');
  }

  function openCollapsibleIndexIfNeeded() {
    var nav = getIndexNav();
    if (!nav || !nav.classList.contains('bhajan-index--collapsible')) return;
    var panel = nav.querySelector('.bhajan-index__panel');
    var toggle = nav.querySelector('.bhajan-index__toggle');
    if (!panel || !toggle || !panel.hidden) return;
    toggle.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    var label = toggle.querySelector('.bhajan-index__toggle-text');
    if (label) label.textContent = 'भजन सूची छिपाएँ';
    try {
      var storageKey =
        nav.id === 'master-bhajan-index'
          ? 'bhajan-sangrah-master-index-open'
          : STORAGE_INDEX_OPEN;
      localStorage.setItem(storageKey, '1');
    } catch (e) {}
  }

  /* ---- Hindi / English title toggle on indexes ---- */
  var INDEX_SCRIPT = 'hindi';

  function compareSortKeys(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  }

  function renumberIndexList(ul) {
    ul.querySelectorAll(':scope > li').forEach(function (li, i) {
      var num = li.querySelector('.bhajan-index__num');
      if (num) num.textContent = i + 1 + '.';
    });
  }

  function sortIndexList(ul, script) {
    var items = Array.prototype.slice.call(ul.querySelectorAll(':scope > li'));
    if (items.length < 2) return;
    items.sort(function (a, b) {
      var ka = a.getAttribute('data-sort-' + (script === 'english' ? 'roman' : 'deva')) || '';
      var kb = b.getAttribute('data-sort-' + (script === 'english' ? 'roman' : 'deva')) || '';
      return compareSortKeys(ka, kb);
    });
    items.forEach(function (li) {
      ul.appendChild(li);
    });
    renumberIndexList(ul);
  }

  function applyScriptToIndexNav(nav, script) {
    nav.querySelectorAll('.script-toggle__btn').forEach(function (btn) {
      var active = btn.getAttribute('data-script') === script;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    nav.querySelectorAll('.bhajan-index__title[data-title-deva]').forEach(function (el) {
      var deva = el.getAttribute('data-title-deva') || '';
      var roman = el.getAttribute('data-title-roman') || deva;
      el.textContent = script === 'english' ? roman : deva;
    });

    if (nav.getAttribute('data-title-order') === 'true' && script === 'english') {
      nav.querySelectorAll('.content-index').forEach(function (ul) {
        sortIndexList(ul, 'english');
      });
    } else if (nav.getAttribute('data-title-order') === 'true' && script === 'hindi') {
      nav.querySelectorAll('.content-index').forEach(function (ul) {
        sortIndexList(ul, 'hindi');
      });
    }
  }

  function initScriptToggle() {
    INDEX_SCRIPT = 'hindi';
    document.querySelectorAll('.bhajan-index').forEach(function (nav) {
      applyScriptToIndexNav(nav, INDEX_SCRIPT);
      nav.querySelectorAll('.script-toggle__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = btn.getAttribute('data-script');
          if (!next || next === INDEX_SCRIPT) return;
          INDEX_SCRIPT = next;
          document.querySelectorAll('.bhajan-index').forEach(function (n) {
            applyScriptToIndexNav(n, next);
          });
        });
      });
    });
  }

  function scrollToElementTop(el) {
    if (!el) return;
    var scrollMargin = 0;
    try {
      scrollMargin = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
    } catch (e) {}
    var top = el.getBoundingClientRect().top + window.scrollY - scrollMargin;
    window.scrollTo({
      top: Math.max(0, top),
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function scrollToBhajanIndex() {
    var nav = getIndexNav();
    if (!nav) return;
    openCollapsibleIndexIfNeeded();
    /* Drop #bhajan-* hash so the browser does not snap back to the card */
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    scrollToElementTop(nav);
  }

  function initToolbarIndexButton() {
    document.querySelectorAll('[data-action="index"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToBhajanIndex();
      });
    });
  }

  /* ---- Section hero: banner then index (always visible) ---- */
  function initSectionHeroIndex() {
    var hero = document.getElementById('section-hero');
    if (!hero) return;
    var indexNav = document.getElementById('bhajan-index');
    if (!indexNav || !hero.contains(indexNav)) return;
    bindBhajanIndexLinks(indexNav);
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

    function scrollAnchorTop() {
      if (header && header.classList.contains('is-visible')) {
        return header.getBoundingClientRect().bottom + 4;
      }
      return 72;
    }

    function indexForId(id) {
      for (var i = 0; i < nav.length; i++) {
        if (nav[i].id === id) return i;
      }
      return -1;
    }

    function activeCardIndexFromScroll() {
      if (!cards.length) return 0;
      var nearBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 80;
      if (nearBottom) return cards.length - 1;

      var anchor = scrollAnchorTop();
      var idx = 0;
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getBoundingClientRect().top <= anchor + 12) idx = i;
      }
      return idx;
    }

    var pinScrollSyncUntil = 0;

    function updateUi(index) {
      if (index < 0 || index >= nav.length) return;
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

    function updateUiFromScroll() {
      if (Date.now() < pinScrollSyncUntil) return;
      updateUi(activeCardIndexFromScroll());
    }

    function navigateToBhajan(id) {
      var idx = indexForId(id);
      if (idx >= 0) {
        updateUi(idx);
        pinScrollSyncUntil = Date.now() + (prefersReducedMotion() ? 120 : 900);
      }
      history.pushState(null, '', '#' + id);
      scrollToBhajanById(id, prefersReducedMotion() ? 0 : 80);
      window.setTimeout(updateUiFromScroll, prefersReducedMotion() ? 80 : 950);
    }

    sectionNavApi = { navigateToBhajan: navigateToBhajan, indexForId: indexForId };

    if (header) {
      var titleEl = header.querySelector('.section-scroll-header__title');
      if (titleEl && sectionTitle) titleEl.textContent = sectionTitle;
    }

    window.addEventListener('scroll', updateUiFromScroll, { passive: true });
    window.addEventListener('resize', updateUiFromScroll);

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
      var hashIdx = indexForId(hashId);
      if (hashIdx >= 0) {
        updateUi(hashIdx);
        pinScrollSyncUntil = Date.now() + 500;
        scrollToBhajanById(hashId, prefersReducedMotion() ? 0 : 80);
        window.setTimeout(updateUiFromScroll, 600);
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
          updateUiFromScroll();
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
        navigateToBhajan(href.slice(1));
      });
    }
  }

  /* ---- Index anchor: smooth scroll ---- */
  function initIndexAnchorScroll() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href="#bhajan-index"]');
      if (!a || a.getAttribute('data-action') === 'index') return;
      e.preventDefault();
      scrollToBhajanIndex();
    });
  }

  /** ↑ स्थायी — jump to bhajan title (sthayi is just below). */
  function initBhajanSthayiJumpLinks() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('.bhajan-card__to-sthayi');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = document.getElementById(href.slice(1));
      var card = target && target.closest('.bhajan-card');
      if (!card) return;
      e.preventDefault();
      if (sectionNavApi) sectionNavApi.navigateToBhajan(card.id);
      else {
        history.pushState(null, '', '#' + card.id);
        scrollToElementTop(target);
      }
    });
  }

  initCollapsibleIndex();
  initScriptToggle();
  initToolbarIndexButton();
  initSectionScrollUi();
  initSectionHeroIndex();
  initIndexAnchorScroll();
  initBhajanSthayiJumpLinks();
})();
