(function () {
  var input = document.getElementById('bhajan-search');
  var list = document.getElementById('bhajan-search-results');
  var panel = document.getElementById('bhajan-search-panel');
  var backdrop = document.getElementById('bhajan-search-backdrop');
  var searchToggle = document.querySelector('.search-toggle');
  var closeBtn = document.querySelector('.bhajan-search-panel__close');
  var sidebar = document.getElementById('site-sidebar');
  var sidebarToggle = document.querySelector('.sidebar-toggle');
  if (!input || !list || !panel) return;

  var index = null;
  var indexPromise = null;
  var activeIndex = -1;
  var MAX_RESULTS = 15;
  var SNIPPET_MAX = 100;

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

  function itemLines(item) {
    if (Array.isArray(item.lines) && item.lines.length) return item.lines;
    if (item.text) {
      return String(item.text)
        .split('\n')
        .map(function (line) {
          return line.replace(/\s+/g, ' ').trim();
        })
        .filter(Boolean);
    }
    return [];
  }

  function hayContains(hay, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (hay.indexOf(keys[i]) !== -1) return true;
    }
    return false;
  }

  function lineMatches(line, keys) {
    return hayContains(norm(line), keys);
  }

  function firstMatchingLine(item, keys) {
    var lines = itemLines(item);
    for (var i = 0; i < lines.length; i++) {
      if (lineMatches(lines[i], keys)) return lines[i];
    }
    return '';
  }

  function matchesItem(item, keys) {
    if (hayContains(norm(item.title || ''), keys)) return true;
    var lines = itemLines(item);
    for (var i = 0; i < lines.length; i++) {
      if (lineMatches(lines[i], keys)) return true;
    }
    return false;
  }

  function truncateSnippet(s) {
    var t = String(s).trim();
    if (t.length <= SNIPPET_MAX) return t;
    return t.slice(0, SNIPPET_MAX - 1) + '…';
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
      var item = index[i];
      if (!matchesItem(item, keys)) continue;
      out.push({
        item: item,
        snippet: truncateSnippet(firstMatchingLine(item, keys)),
      });
    }
    return out;
  }

  function closeSidebar() {
    if (!sidebar || !sidebarToggle) return;
    if (sidebar.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
      sidebarToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function setPanelOpen(open) {
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (searchToggle) searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (backdrop) backdrop.hidden = !open;
    if (open) {
      closeSidebar();
      window.setTimeout(function () {
        input.focus();
      }, 80);
    } else {
      hideResults();
      input.blur();
    }
  }

  function go(entry) {
    setPanelOpen(false);
    input.value = '';
    hideResults();
    window.location.href = entry.item.href;
  }

  function hideResults() {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  function showResults(entries) {
    list.innerHTML = '';
    if (!entries.length) {
      var empty = document.createElement('li');
      empty.className = 'bhajan-search__empty';
      empty.textContent = 'कोई भजन नहीं मिला';
      empty.setAttribute('role', 'presentation');
      list.appendChild(empty);
    } else {
      entries.forEach(function (entry, i) {
        var item = entry.item;
        var li = document.createElement('li');
        li.className = 'bhajan-search__item';
        li.setAttribute('role', 'option');
        li.id = 'bhajan-search-opt-' + i;
        var a = document.createElement('a');
        a.href = item.href;
        var html = escapeHtml(item.title);
        if (entry.snippet) {
          html += '<span class="bhajan-search__meta">' + escapeHtml(entry.snippet) + '</span>';
        }
        a.innerHTML = html;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          go(entry);
        });
        li.appendChild(a);
        list.appendChild(li);
      });
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    activeIndex = entries.length ? 0 : -1;
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
    return list.querySelectorAll('.bhajan-search__item a');
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

  if (searchToggle) {
    searchToggle.addEventListener('click', function () {
      setPanelOpen(!panel.classList.contains('is-open'));
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      setPanelOpen(false);
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', function () {
      setPanelOpen(false);
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
      if (!list.hidden) {
        hideResults();
      } else {
        setPanelOpen(false);
      }
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
      var entry = filterItems(input.value)[activeIndex];
      if (entry) go(entry);
    }
  });

  document.addEventListener('click', function (e) {
    if (panel.contains(e.target) || (searchToggle && searchToggle.contains(e.target))) return;
    if (!list.hidden && !e.target.closest('.bhajan-search__results')) hideResults();
  });
})();
