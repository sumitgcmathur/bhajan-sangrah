(function () {
  var PENDING_KEY = 'bhajan-spellcheck-pending';

  var filterInput = document.getElementById('spellcheck-filter');
  var statsEl = document.getElementById('spellcheck-stats');
  var wordListEl = document.getElementById('spellcheck-word-list');
  var detailEl = document.getElementById('spellcheck-detail');
  var pendingListEl = document.getElementById('spellcheck-pending-list');
  var exportBtn = document.getElementById('spellcheck-export');
  var refreshBtn = document.getElementById('spellcheck-refresh');
  var selectFilteredBtn = document.getElementById('spellcheck-select-filtered');
  var clearSelectionBtn = document.getElementById('spellcheck-clear-selection');
  var bulkAddBtn = document.getElementById('spellcheck-bulk-add');

  var data = null;
  var unknown = [];
  var selectedWord = null;
  var selectedWords = new Set();
  var lastListIndex = -1;
  var pending = loadPending();

  function siteBase() {
    var base = document.body.getAttribute('data-site-base') || '/';
    return base.endsWith('/') ? base : base + '/';
  }

  function dataUrl() {
    return siteBase() + 'assets/spellcheck-data.json';
  }

  function loadPending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return { dictionaryAdd: [], replacements: [] };
      var p = JSON.parse(raw);
      return {
        dictionaryAdd: p.dictionaryAdd || [],
        replacements: p.replacements || [],
      };
    } catch (e) {
      return { dictionaryAdd: [], replacements: [] };
    }
  }

  function savePending() {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    renderPending();
    updateBulkUI();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadData() {
    fetch(dataUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('data');
        return res.json();
      })
      .then(function (json) {
        data = json;
        unknown = (json.unknown || []).slice();
        applyPendingToUnknown();
        pruneSelection();
        renderStats();
        renderWordList();
        updateBulkUI();
        if (selectedWord) selectWord(selectedWord);
      })
      .catch(function () {
        statsEl.textContent = 'डेटा लोड नहीं हुआ — पहले node scripts/spellcheck-ui.js चलाएँ।';
      });
  }

  function applyPendingToUnknown() {
    var skip = new Set(pending.dictionaryAdd);
    for (var i = 0; i < pending.replacements.length; i++) {
      skip.add(pending.replacements[i].from);
    }
    unknown = unknown.filter(function (item) {
      return !skip.has(item.word);
    });
  }

  function pruneSelection() {
    var known = new Set(unknown.map(function (x) {
      return x.word;
    }));
    selectedWords.forEach(function (w) {
      if (!known.has(w)) selectedWords.delete(w);
    });
  }

  function renderStats() {
    if (!data) return;
    var sel = selectedWords.size;
    statsEl.textContent =
      unknown.length +
      ' अज्ञात' +
      (sel ? ' · ' + sel + ' चयनित' : '') +
      ' · ' +
      (data.dictionary ? data.dictionary.length : 0) +
      ' शब्दकोश';
  }

  function filteredUnknown() {
    var q = (filterInput.value || '').trim().toLowerCase();
    if (!q) return unknown;
    return unknown.filter(function (item) {
      return item.word.toLowerCase().indexOf(q) !== -1;
    });
  }

  function updateBulkUI() {
    var n = selectedWords.size;
    if (bulkAddBtn) {
      bulkAddBtn.disabled = n === 0;
      bulkAddBtn.textContent =
        n > 0 ? 'चयनित शब्दकोश में जोड़ें (' + n + ')' : 'चयनित शब्दकोश में जोड़ें';
    }
    renderStats();
  }

  function setSelected(word, on, listIndex, shiftKey) {
    var items = filteredUnknown();
    if (shiftKey && lastListIndex >= 0 && listIndex >= 0) {
      var start = Math.min(lastListIndex, listIndex);
      var end = Math.max(lastListIndex, listIndex);
      for (var i = start; i <= end; i++) {
        if (items[i]) selectedWords.add(items[i].word);
      }
    } else if (on) {
      selectedWords.add(word);
    } else {
      selectedWords.delete(word);
    }
    if (listIndex >= 0) lastListIndex = listIndex;
    updateBulkUI();
  }

  function selectAllFiltered() {
    filteredUnknown().forEach(function (item) {
      selectedWords.add(item.word);
    });
    updateBulkUI();
    renderWordList();
  }

  function clearSelection() {
    selectedWords.clear();
    lastListIndex = -1;
    updateBulkUI();
    renderWordList();
  }

  function renderWordList() {
    var items = filteredUnknown();
    wordListEl.innerHTML = '';
    if (!items.length) {
      var li = document.createElement('li');
      li.className = 'spellcheck-word-list__empty';
      li.textContent = 'कोई अज्ञात शब्द नहीं (या सूची खाली)।';
      wordListEl.appendChild(li);
      return;
    }
    items.forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'spellcheck-word-list__item';
      if (item.word === selectedWord) li.classList.add('is-active');
      if (selectedWords.has(item.word)) li.classList.add('is-checked');

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'spellcheck-word-cb';
      cb.checked = selectedWords.has(item.word);
      cb.setAttribute('aria-label', 'चुनें: ' + item.word);
      cb.addEventListener('click', function (e) {
        e.stopPropagation();
        setSelected(item.word, cb.checked, index, e.shiftKey);
        renderWordList();
      });

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spellcheck-word-btn';
      btn.innerHTML =
        '<span class="spellcheck-word-btn__word">' +
        escapeHtml(item.word) +
        '</span><span class="spellcheck-word-btn__count">' +
        item.count +
        '</span>';
      btn.addEventListener('click', function () {
        selectWord(item.word);
      });

      li.appendChild(cb);
      li.appendChild(btn);
      wordListEl.appendChild(li);
    });
  }

  function selectWord(word) {
    selectedWord = word;
    var item = unknown.find(function (x) {
      return x.word === word;
    });
    if (!item) {
      detailEl.innerHTML = '<p class="spellcheck-detail__empty">यह शब्द सूची में नहीं है।</p>';
      renderWordList();
      return;
    }

    var refsHtml = item.refs
      .map(function (r) {
        return (
          '<li class="spellcheck-ref"><span class="spellcheck-ref__path">' +
          escapeHtml(r.path) +
          '</span> <span class="spellcheck-ref__field">(' +
          escapeHtml(r.field) +
          ')</span><br><span class="spellcheck-ref__snippet">' +
          escapeHtml(r.snippet) +
          '</span></li>'
        );
      })
      .join('');

    var inBulk = selectedWords.has(word);
    detailEl.innerHTML =
      '<h2 class="spellcheck-detail__word">' +
      escapeHtml(item.word) +
      '</h2>' +
      '<p class="spellcheck-detail__meta">' +
      item.count +
      ' बार · ' +
      item.refs.length +
      ' फ़ाइल(एँ) दिखाई गईं' +
      (inBulk ? ' · चयनित' : '') +
      '</p>' +
      '<div class="spellcheck-detail__actions">' +
      '<button type="button" class="spellcheck-btn" data-action="add-dict">शब्दकोश में जोड़ें</button>' +
      '<button type="button" class="spellcheck-btn" data-action="toggle-check">' +
      (inBulk ? 'चयन हटाएँ' : 'चयन में जोड़ें') +
      '</button>' +
      '<button type="button" class="spellcheck-btn spellcheck-btn--warn" data-action="replace">सभी जगह बदलें</button>' +
      '</div>' +
      '<form class="spellcheck-replace-form" id="spellcheck-replace-form" hidden>' +
      '<label>नया शब्द <input type="text" id="spellcheck-replace-to" class="spellcheck-replace-input" spellcheck="false"></label>' +
      '<button type="submit" class="spellcheck-btn">सभी भजनों में बदलें</button>' +
      '<button type="button" class="spellcheck-btn spellcheck-btn--ghost" id="spellcheck-replace-cancel">रद्द</button>' +
      '</form>' +
      '<ul class="spellcheck-ref-list">' +
      refsHtml +
      '</ul>';

    detailEl.querySelector('[data-action="add-dict"]').addEventListener('click', function () {
      addToDictionary(item.word);
    });
    detailEl.querySelector('[data-action="toggle-check"]').addEventListener('click', function () {
      var idx = filteredUnknown().findIndex(function (x) {
        return x.word === word;
      });
      setSelected(word, !selectedWords.has(word), idx, false);
      selectWord(word);
    });
    detailEl.querySelector('[data-action="replace"]').addEventListener('click', function () {
      document.getElementById('spellcheck-replace-form').hidden = false;
      document.getElementById('spellcheck-replace-to').focus();
    });
    document.getElementById('spellcheck-replace-cancel').addEventListener('click', function () {
      document.getElementById('spellcheck-replace-form').hidden = true;
    });
    document.getElementById('spellcheck-replace-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var to = document.getElementById('spellcheck-replace-to').value.trim();
      if (!to) return;
      replaceEverywhere(item.word, to);
    });

    renderWordList();
  }

  function addToDictionary(word) {
    addManyToDictionary([word]);
    selectedWords.delete(word);
    detailEl.innerHTML =
      '<p class="spellcheck-detail__empty">«' + escapeHtml(word) + '» शब्दकोश में जोड़ा (लंबित)।</p>';
    selectedWord = null;
    renderWordList();
  }

  function addManyToDictionary(words) {
    var added = 0;
    words.forEach(function (word) {
      if (pending.dictionaryAdd.indexOf(word) === -1) {
        pending.dictionaryAdd.push(word);
        added += 1;
      }
      selectedWords.delete(word);
      if (selectedWord === word) selectedWord = null;
    });
    unknown = unknown.filter(function (x) {
      return words.indexOf(x.word) === -1;
    });
    savePending();
    renderStats();
    renderWordList();
    return added;
  }

  function addSelectedToDictionary() {
    var words = Array.from(selectedWords);
    if (!words.length) return;
    var n = addManyToDictionary(words);
    detailEl.innerHTML =
      '<p class="spellcheck-detail__empty">' +
      n +
      ' शब्द शब्दकोश में जोड़े (लंबित)। बाएँ से अगला शब्द चुनें।</p>';
  }

  function replaceEverywhere(from, to) {
    if (from === to) return;
    pending.replacements.push({ from: from, to: to });
    unknown = unknown.filter(function (x) {
      return x.word !== from;
    });
    selectedWords.delete(from);
    savePending();
    renderStats();
    selectedWord = null;
    detailEl.innerHTML =
      '<p class="spellcheck-detail__empty">«' +
      escapeHtml(from) +
      '» → «' +
      escapeHtml(to) +
      '» सभी जगह (लंबित)।</p>';
    renderWordList();
  }

  function renderPending() {
    pendingListEl.innerHTML = '';
    var empty = true;
    pending.dictionaryAdd.forEach(function (w) {
      empty = false;
      var li = document.createElement('li');
      li.textContent = '+ शब्दकोश: ' + w;
      li.className = 'spellcheck-pending__item';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'spellcheck-pending__rm';
      rm.textContent = '×';
      rm.setAttribute('aria-label', 'हटाएँ');
      rm.addEventListener('click', function () {
        pending.dictionaryAdd = pending.dictionaryAdd.filter(function (x) {
          return x !== w;
        });
        savePending();
        loadData();
      });
      li.appendChild(rm);
      pendingListEl.appendChild(li);
    });
    pending.replacements.forEach(function (r, idx) {
      empty = false;
      var li = document.createElement('li');
      li.textContent = 'बदलें: ' + r.from + ' → ' + r.to;
      li.className = 'spellcheck-pending__item';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'spellcheck-pending__rm';
      rm.textContent = '×';
      rm.setAttribute('aria-label', 'हटाएँ');
      rm.addEventListener('click', function () {
        pending.replacements.splice(idx, 1);
        savePending();
        loadData();
      });
      li.appendChild(rm);
      pendingListEl.appendChild(li);
    });
    if (empty) {
      var li = document.createElement('li');
      li.className = 'spellcheck-pending__empty';
      li.textContent = 'कोई लंबित बदलाव नहीं';
      pendingListEl.appendChild(li);
    }
  }

  function exportChanges() {
    var payload = {
      exportedAt: new Date().toISOString(),
      dictionaryAdd: pending.dictionaryAdd.slice(),
      replacements: pending.replacements.slice(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spellcheck-changes.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (filterInput) {
    filterInput.addEventListener('input', function () {
      lastListIndex = -1;
      renderWordList();
    });
  }
  if (exportBtn) exportBtn.addEventListener('click', exportChanges);
  if (refreshBtn) refreshBtn.addEventListener('click', loadData);
  if (selectFilteredBtn) selectFilteredBtn.addEventListener('click', selectAllFiltered);
  if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);
  if (bulkAddBtn) bulkAddBtn.addEventListener('click', addSelectedToDictionary);

  renderPending();
  updateBulkUI();

  loadData();
})();
