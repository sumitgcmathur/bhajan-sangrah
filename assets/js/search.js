(function () {
  var input = document.getElementById('bhajan-search');
  var list = document.getElementById('bhajan-search-results');
  var sidebar = document.getElementById('site-sidebar');
  var toggle = document.querySelector('.sidebar-toggle');
  if (!input || !list) return;

  var index = null;
  var indexPromise = null;
  var activeIndex = -1;
  var MAX_RESULTS = 15;

  function siteBase() {
    var base = document.body.getAttribute('data-site-base') || '/';
    return base.endsWith('/') ? base : base + '/';
  }

  function indexUrl() {
    return siteBase() + 'assets/search-index.json';
  }

  function norm(s) {
    return String(s)
      .replace(/\u200c|\u200d/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** भोले also matches भोला, भोल (drop trailing matra for Hindi prefix search). */
  function queryKeys(query) {
    var q = norm(query);
    if (!q) return [];
    var keys = [q];
    if (q.length >= 3) keys.push(q.slice(0, -1));
    if (q.length >= 4) keys.push(q.slice(0, -2));
    return keys.filter(function (k, i, arr) {
      return k.length >= 2 && arr.indexOf(k) === i;
    });
  }

  function itemHaystack(item) {
    return norm((item.title || '') + ' ' + (item.section || '') + ' ' + (item.text || ''));
  }

  function matchesItem(item, keys) {
    var hay = itemHaystack(item);
    for (var i = 0; i < keys.length; i++) {
      if (hay.indexOf(keys[i]) !== -1) return true;
    }
    return false;
  }

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (indexPromise) return indexPromise;
    indexPromise = fetch(indexUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('search index');
        return res.json();
      })
      .then(function (data) {
        index = data;
        return index;
      })
      .catch(function () {
        index = [];
        return index;
      });
    return indexPromise;
  }

  function filterItems(query) {
    var keys = queryKeys(query);
    if (!keys.length) return [];
    var out = [];
    for (var i = 0; i < index.length && out.length < MAX_RESULTS; i++) {
      if (matchesItem(index[i], keys)) out.push(index[i]);
    }
    return out;
  }

  function closeSidebarOnMobile() {
    if (!sidebar || !toggle) return;
    if (sidebar.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function go(item) {
    closeSidebarOnMobile();
    input.value = '';
    hideResults();
    window.location.href = item.href;
  }

  function hideResults() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function showResults(items) {
    list.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'sidebar-search__empty';
      empty.textContent = 'कोई भजन नहीं मिला';
      empty.setAttribute('role', 'presentation');
      list.appendChild(empty);
    } else {
      items.forEach(function (item, i) {
        var li = document.createElement('li');
        li.className = 'sidebar-search__item';
        li.setAttribute('role', 'option');
        li.id = 'bhajan-search-opt-' + i;
        var a = document.createElement('a');
        a.href = item.href;
        a.innerHTML =
          escapeHtml(item.title) +
          '<span class="sidebar-search__meta">' +
          escapeHtml(item.section) +
          '</span>';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          go(item);
        });
        li.appendChild(a);
        list.appendChild(li);
      });
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activeIndex = items.length ? 0 : -1;
    updateActiveOption();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function visibleOptions() {
    return list.querySelectorAll('.sidebar-search__item a');
  }

  function updateActiveOption() {
    var links = visibleOptions();
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', i === activeIndex);
    }
    if (activeIndex >= 0 && links[activeIndex]) {
      input.setAttribute('aria-activedescendant', links[activeIndex].parentElement.id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    var q = input.value;
    if (!norm(q)) {
      hideResults();
      return;
    }
    loadIndex().then(function () {
      showResults(filterItems(q));
    });
  }

  var debounceTimer;
  input.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 120);
  });

  input.addEventListener('focus', function () {
    loadIndex().then(function () {
      if (norm(input.value)) render();
    });
  });

  input.addEventListener('keydown', function (e) {
    var links = visibleOptions();
    if (e.key === 'Escape') {
      hideResults();
      input.blur();
      return;
    }
    if (!links.length || list.hidden) {
      if (e.key === 'Enter') render();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, links.length - 1);
      updateActiveOption();
      links[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveOption();
      links[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      var item = filterItems(input.value)[activeIndex];
      if (item) go(item);
    }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.sidebar-search')) hideResults();
  });
})();
