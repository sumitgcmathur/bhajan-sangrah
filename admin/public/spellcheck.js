/**
 * Corpus-primary spell check: bhajan vocabulary + hi_IN + sa_IN Hunspell (Espells).
 * Flags only words outside the sangrah that have plausible typo suggestions.
 */

import { normWord, tokenizeHindiWithOffsets } from './spell-tokens.js';
import { BHAJAN_EXTRA, CORPUS_COMMON_WORDS } from './spell-allowlist.js';

const ESPELLS_URL = 'https://esm.sh/espells@0.4.1';
const DICT_AFF =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.aff';
const DICT_DIC_HI =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.dic';
const DICT_DIC_SA = '/sanskrit-words.dic';
const CORPUS_JSON_URL = '/corpus-dictionary.json';
const CORPUS_DIC_URL = '/corpus.dic';
const DICT_PROBE_WORD = 'जय';
const DICT_PROBE_SANSKRIT = 'त्र्यम्बकं';

const MIN_WORD_LEN = 2;
const MAX_SUGGESTIONS = 8;
const IGNORE_KEY = 'bhajan-admin-spell-ignore';
const CUSTOM_KEY = 'bhajan-admin-spell-custom';
const DEBOUNCE_MS = 450;

const DEFAULT_IGNORE = new Set([
  'टेर',
  'तेर',
  'स्थायी',
  'अंतरा',
  'तर्ज',
  'जबानी',
  'ध्वनि',
  'श्लोक',
  'श्लोका',
  'श्लोकम्',
  'श्री',
  'श्रीमती',
  'श्रीमान',
  'शुम्भ',
  'निशुम्भ',
  'नवरात्रि',
  'कालिका',
  'अम्बिका',
  'जगदम्बे',
  'जगदम्बा',
  'भवानी',
  'भवानीजी',
  'देवी',
  'देवीजी',
  'महाराज',
  'महाराजा',
  'महारानी',
  'दैत्य',
  'दानव',
  'राक्षस',
  'ब्रह्माजी',
  'भृगुजी',
  'तथास्तु',
  'कछु',
  'कछ',
]);

const ALLOWLIST = new Set([
  ...DEFAULT_IGNORE,
  ...BHAJAN_EXTRA.map((w) => normWord(w)),
  ...CORPUS_COMMON_WORDS.map((w) => normWord(w)),
]);

let checkerPromise = null;
let corpusPromise = null;
let corpusWordSet = null;
let menuEl = null;
let activeTarget = null;
let wordCache = new Map();
const fieldTimers = new WeakMap();
let lastMenuOpenedAt = 0;

const LONG_PRESS_MS = 550;
const SELECTION_MENU_DELAY_MS = 400;

function loadWordSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map((w) => normWord(w).trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveWordSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function getIgnoredWords() {
  return [...loadWordSet(IGNORE_KEY)];
}

export function getCustomWords() {
  return [...loadWordSet(CUSTOM_KEY)];
}

export function ignoreWord(word) {
  const w = normWord(word).trim();
  if (!w) return;
  const set = loadWordSet(IGNORE_KEY);
  set.add(w);
  saveWordSet(IGNORE_KEY, set);
  wordCache.delete(w);
}

export function addCustomWord(word) {
  const w = normWord(word).trim();
  if (!w) return;
  const set = loadWordSet(CUSTOM_KEY);
  set.add(w);
  saveWordSet(CUSTOM_KEY, set);
  wordCache.delete(w);
}

export function clearSpellWordCache() {
  wordCache.clear();
}

/** Text fields from editor JSON (same coverage as publish spell check). */
export function textsFromEditor(editor) {
  const e = editor || {};
  const L = e.lyrics || {};
  const texts = [
    { field: 'title', text: e.title || '' },
    { field: 'tarz', text: e.tarz || '' },
    { field: 'lyrics.sthayi', text: L.sthayi || '' },
    { field: 'lyrics.pre_shlok', text: L.pre_shlok || '' },
    { field: 'lyrics.post_shlok', text: L.post_shlok || '' },
    { field: 'lyrics.sthayi_connect_text', text: L.sthayi_connect_text || '' },
  ];
  for (const p of L.paragraphs || []) texts.push({ field: 'paragraph', text: p.text || '' });
  if (e.legacyLyricsText) texts.push({ field: 'legacy', text: e.legacyLyricsText });
  return texts;
}

function clusterOccurrences(occurrences) {
  const map = new Map();
  for (const o of occurrences) {
    if (!map.has(o.word)) {
      map.set(o.word, {
        word: o.word,
        count: 0,
        suggestions: o.suggestions || [],
        byPath: new Map(),
      });
    }
    const c = map.get(o.word);
    c.count += 1;
    if (!c.byPath.has(o.path)) {
      c.byPath.set(o.path, { path: o.path, title: o.title, fields: new Map() });
    }
    const row = c.byPath.get(o.path);
    row.fields.set(o.field, (row.fields.get(o.field) || 0) + 1);
  }
  return [...map.values()]
    .map((c) => ({
      word: c.word,
      count: c.count,
      suggestions: c.suggestions,
      paths: [...c.byPath.values()].map((p) => ({
        path: p.path,
        title: p.title,
        fields: [...p.fields.entries()].map(([field, n]) => ({ field, count: n })),
      })),
    }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'hi'));
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * @param {Array<{ path: string, title: string, texts: Array<{field:string,text:string}> }>} items
 */
/** Load corpus word list (all published bhajan tokens). */
export async function ensureCorpusDictionary(signal) {
  if (corpusWordSet) return corpusWordSet;
  if (!corpusPromise) {
    corpusPromise = (async () => {
      try {
        const res = await fetch(CORPUS_JSON_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const set = new Set((data.words || []).map((w) => normWord(w)).filter(Boolean));
        if (!set.size) throw new Error('empty word list');
        corpusWordSet = set;
        return set;
      } catch (e) {
        console.warn('spell: corpus dictionary unavailable, using Hunspell only', e);
        corpusWordSet = new Set();
        return corpusWordSet;
      }
    })();
  }
  abortIfNeeded(signal);
  return corpusPromise;
}

/** Load corpus + Hunspell (hi + sa + corpus.dic). */
export async function ensureSpellDictionary(onProgress, signal) {
  onProgress?.(0, 0, 'corpus');
  const corpusStarted = Date.now();
  const corpusTick = setInterval(() => {
    if (signal?.aborted) return;
    const sec = Math.floor((Date.now() - corpusStarted) / 1000);
    onProgress?.(sec, 0, 'corpus');
  }, 500);
  try {
    abortIfNeeded(signal);
    await ensureCorpusDictionary(signal);
  } finally {
    clearInterval(corpusTick);
  }

  onProgress?.(0, 0, 'dict');
  const started = Date.now();
  const tick = setInterval(() => {
    if (signal?.aborted) return;
    const sec = Math.floor((Date.now() - started) / 1000);
    onProgress?.(sec, 0, 'dict');
  }, 500);
  try {
    abortIfNeeded(signal);
    await getChecker();
  } finally {
    clearInterval(tick);
  }
}

export async function scanCorpusItems(items, { onProgress, signal, dictionaryReady = false } = {}) {
  if (!dictionaryReady) {
    await ensureSpellDictionary(onProgress, signal);
  }
  abortIfNeeded(signal);

  onProgress?.(0, 1, 'tokenize');
  const uniqueWords = new Set();
  for (const { texts } of items) {
    for (const { text } of texts) {
      for (const tok of tokenizeHindiWithOffsets(text || '', MIN_WORD_LEN)) {
        uniqueWords.add(tok.word);
      }
    }
  }

  const words = [...uniqueWords];
  const wordHits = new Map();
  let corpusSkipped = 0;
  for (let i = 0; i < words.length; i++) {
    abortIfNeeded(signal);
    const w = words[i];
    if (isInCorpus(w)) corpusSkipped += 1;
    wordHits.set(w, await lookupWord(w));
    if (i % 15 === 0 || i === words.length - 1) {
      onProgress?.(i + 1, words.length, 'words');
    }
    if (i % 20 === 0) await yieldToMain();
  }

  const occurrences = [];
  for (let i = 0; i < items.length; i++) {
    abortIfNeeded(signal);
    const { path, title, texts } = items[i];
    for (const { field, text } of texts) {
      for (const tok of tokenizeHindiWithOffsets(text || '', MIN_WORD_LEN)) {
        const hit = wordHits.get(tok.word);
        if (!hit || hit.ok) continue;
        occurrences.push({
          word: tok.word,
          path,
          title,
          field,
          suggestions: hit.suggestions || [],
        });
      }
    }
    onProgress?.(i + 1, items.length, 'spell');
    if (i % 8 === 0) await yieldToMain();
  }

  return {
    clusters: clusterOccurrences(occurrences),
    totalOccurrences: occurrences.length,
    filesScanned: items.length,
    uniqueWordsChecked: words.length,
    corpusWords: corpusWordSet?.size ?? 0,
    corpusSkipped,
  };
}

export function getCorpusWordCount() {
  return corpusWordSet?.size ?? 0;
}

function isInCorpus(word) {
  return Boolean(corpusWordSet?.has(word));
}

function shouldSkip(word) {
  if (isInCorpus(word)) return true;
  if (ALLOWLIST.has(word)) return true;
  if (loadWordSet(IGNORE_KEY).has(word)) return true;
  if (loadWordSet(CUSTOM_KEY).has(word)) return true;
  if (/^[०१२३४५६७८९\d]+$/.test(word)) return true;
  return false;
}

/** Grapheme-wise edit distance (Devanagari-safe). */
function levenshtein(a, b) {
  const sa = [...normWord(a)];
  const sb = [...normWord(b)];
  const m = sa.length;
  const n = sb.length;
  if (!m) return n;
  if (!n) return m;
  let prev = [...Array(n + 1).keys()];
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function maxEditDistance(word) {
  const len = [...word].length;
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  return Math.max(2, Math.floor(len * 0.32));
}

/** Drop Hunspell guesses that are unrelated (e.g. हारे → हरो). */
function filterPlausibleSuggestions(word, suggestions) {
  const maxD = maxEditDistance(word);
  return (suggestions || []).filter((s) => levenshtein(word, s) <= maxD);
}

async function getChecker() {
  if (!checkerPromise) {
    checkerPromise = (async () => {
      const { Espells } = await import(ESPELLS_URL);
      if (!Espells?.fromURL) throw new Error('Espells failed to load');
      const spell = await Espells.fromURL({
        aff: DICT_AFF,
        dic: [DICT_DIC_HI, DICT_DIC_SA, CORPUS_DIC_URL],
      });
      const probeHi = spell.lookup(normWord(DICT_PROBE_WORD));
      if (!probeHi.correct) {
        throw new Error('Hindi dictionary failed to load');
      }
      const probeSa = spell.lookup(normWord(DICT_PROBE_SANSKRIT));
      if (!probeSa.correct) {
        console.warn('spell: Sanskrit dictionary extension may not have loaded');
      }
      return spell;
    })().catch((e) => {
      checkerPromise = null;
      throw e;
    });
  }
  return checkerPromise;
}

async function lookupWord(word) {
  if (wordCache.has(word)) return wordCache.get(word);
  await ensureCorpusDictionary();
  if (shouldSkip(word)) {
    const ok = { ok: true, suggestions: [] };
    wordCache.set(word, ok);
    return ok;
  }
  const spell = await getChecker();
  const { correct, forbidden } = spell.lookup(word);
  if (correct && !forbidden) {
    const ok = { ok: true, suggestions: [] };
    wordCache.set(word, ok);
    return ok;
  }
  let suggestions = filterPlausibleSuggestions(word, spell.suggest(word).slice(0, MAX_SUGGESTIONS));
  if (!suggestions.length) {
    const ok = { ok: true, suggestions: [] };
    wordCache.set(word, ok);
    return ok;
  }
  const result = { ok: false, suggestions };
  wordCache.set(word, result);
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMirrorHtml(text, errors) {
  if (!errors.length) return escapeHtml(text);
  const sorted = [...errors].sort((a, b) => a.start - b.start);
  let html = '';
  let i = 0;
  for (const err of sorted) {
    if (err.start < i) continue;
    html += escapeHtml(text.slice(i, err.start));
    html += `<mark class="spell-err">${escapeHtml(text.slice(err.start, err.end))}</mark>`;
    i = err.end;
  }
  html += escapeHtml(text.slice(i));
  return html;
}

async function scanFieldErrors(text) {
  const tokens = tokenizeHindiWithOffsets(text, MIN_WORD_LEN);
  const wordOk = new Map();
  const errors = [];
  for (const tok of tokens) {
    if (!wordOk.has(tok.word)) {
      const { ok } = await lookupWord(tok.word);
      wordOk.set(tok.word, ok);
    }
    if (!wordOk.get(tok.word)) errors.push(tok);
  }
  return errors;
}

function syncMirrorScroll(input, mirror) {
  mirror.scrollTop = input.scrollTop;
  mirror.scrollLeft = input.scrollLeft;
}

function copyFieldMetrics(input, mirror) {
  const cs = getComputedStyle(input);
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.padding = cs.padding;
  mirror.style.borderWidth = cs.borderWidth;
  mirror.style.boxSizing = cs.boxSizing;
}

async function refreshField(input) {
  const wrap = input.closest('.spell-wrap');
  const mirror = wrap?.querySelector('.spell-wrap__mirror');
  if (!mirror) return;
  const text = input.value;
  try {
    const errors = await scanFieldErrors(text);
    mirror.innerHTML = buildMirrorHtml(text, errors);
    syncMirrorScroll(input, mirror);
    input.dataset.spellReady = '1';
    input.removeAttribute('data-spell-loading');
  } catch {
    input.dataset.spellError = '1';
    input.removeAttribute('data-spell-loading');
    mirror.innerHTML = escapeHtml(text);
  }
}

function scheduleFieldCheck(input) {
  const prev = fieldTimers.get(input);
  if (prev) clearTimeout(prev);
  input.setAttribute('data-spell-loading', '');
  fieldTimers.set(
    input,
    setTimeout(() => {
      refreshField(input);
    }, DEBOUNCE_MS),
  );
}

function wordAtIndex(text, index) {
  const re = /[\u0900-\u097F]+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index <= index && m.index + m[0].length > index) {
      return { word: m[0], start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

function wordAtSelection(input) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start == null || end == null) return null;
  if (start !== end) {
    const sel = input.value.slice(start, end);
    const w = normWord(sel);
    if (/^[\u0900-\u097F]+$/.test(w)) return { word: w, start, end };
  }
  return wordAtIndex(input.value, end);
}

/** Map touch coordinates to a caret index (for long-press on phones). */
function caretIndexAtPoint(textarea, clientX, clientY) {
  const text = textarea.value;
  if (!text.length) return 0;

  const mirror = document.createElement('div');
  const cs = getComputedStyle(textarea);
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText =
    'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;overflow:visible;';
  for (const prop of [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'width',
  ]) {
    mirror.style[prop] = cs[prop];
  }
  document.body.appendChild(mirror);

  try {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      mirror.textContent = text.slice(0, mid);
      const probe = document.createElement('span');
      probe.textContent = text[mid] || ' ';
      mirror.appendChild(probe);
      const r = probe.getBoundingClientRect();
      mirror.textContent = '';
      const py = r.top + r.height / 2;
      const px = r.left;
      if (py < clientY || (Math.abs(py - clientY) < 3 && px < clientX)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  } finally {
    mirror.remove();
  }
}

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.id = 'spell-menu';
  menuEl.className = 'spell-menu';
  menuEl.hidden = true;
  menuEl.setAttribute('role', 'menu');
  document.body.appendChild(menuEl);

  document.addEventListener('click', (e) => {
    if (!menuEl.hidden && !menuEl.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideMenu();
  });
  return menuEl;
}

function hideMenu() {
  if (!menuEl) return;
  menuEl.hidden = true;
  menuEl.innerHTML = '';
  activeTarget = null;
}

function applyReplacement(input, start, end, replacement) {
  const val = input.value;
  input.value = val.slice(0, start) + replacement + val.slice(end);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  scheduleFieldCheck(input);
  input.focus();
  const pos = start + replacement.length;
  input.setSelectionRange(pos, pos);
}

async function showMenuForWord(input, hit, clientX, clientY) {
  const w = normWord(hit.word);
  if (!w) return;
  const { ok, suggestions } = await lookupWord(w);
  if (ok) return;

  const menu = ensureMenu();
  activeTarget = { input, hit: { ...hit, word: w } };

  const sugBtns = (suggestions || [])
    .map(
      (s) =>
        `<button type="button" class="spell-menu__item" role="menuitem" data-action="replace" data-text="${escapeHtml(s)}">${escapeHtml(s)}</button>`,
    )
    .join('');

  menu.innerHTML = `
    <p class="spell-menu__word">${escapeHtml(w)}</p>
    ${sugBtns || '<p class="spell-menu__muted">No suggestions</p>'}
    <button type="button" class="spell-menu__item" role="menuitem" data-action="ignore">Ignore</button>
    <button type="button" class="spell-menu__item" role="menuitem" data-action="add">Add to dictionary</button>`;

  menu.hidden = false;
  lastMenuOpenedAt = Date.now();
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = clientX;
  let top = clientY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;

  menu.querySelectorAll('[data-action]').forEach((btn) => {
    const onPick = (e) => {
      if (e?.type === 'touchend') e.preventDefault();
      const { input: ta, hit: h } = activeTarget || {};
      if (!ta || !h) return hideMenu();
      const action = btn.dataset.action;
      if (action === 'replace') {
        applyReplacement(ta, h.start, h.end, btn.dataset.text || '');
      } else if (action === 'ignore') {
        ignoreWord(h.word);
        document.querySelectorAll('.spell-wrap__input').forEach((el) => scheduleFieldCheck(el));
      } else if (action === 'add') {
        addCustomWord(h.word);
        document.querySelectorAll('.spell-wrap__input').forEach((el) => scheduleFieldCheck(el));
      }
      hideMenu();
    };
    btn.addEventListener('click', onPick);
    btn.addEventListener('touchend', onPick, { passive: false });
  });
}

function bindTouchSpell(input, openMenuIfFlagged) {
  let pressTimer = null;
  let pressTouch = null;
  let selTimer = null;

  const maybeOpenFromSelection = () => {
    if (Date.now() - lastMenuOpenedAt < 700) return;
    const hit = wordAtSelection(input);
    if (!hit || input.selectionStart === input.selectionEnd) return;
    if (document.activeElement !== input) return;
    const rect = input.getBoundingClientRect();
    openMenuIfFlagged(hit, rect.left + 12, Math.min(rect.top + 48, window.innerHeight * 0.35));
  };

  const scheduleSelectionMenu = () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(maybeOpenFromSelection, SELECTION_MENU_DELAY_MS);
  };

  input.addEventListener('select', scheduleSelectionMenu);
  input.addEventListener('keyup', scheduleSelectionMenu);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === input) scheduleSelectionMenu();
  });

  input.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      pressTouch = { x: t.clientX, y: t.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!pressTouch) return;
        input.focus();
        const idx = caretIndexAtPoint(input, pressTouch.x, pressTouch.y);
        const hit = wordAtIndex(input.value, idx);
        if (!hit) return;
        input.setSelectionRange(hit.start, hit.end);
        openMenuIfFlagged(hit, pressTouch.x, pressTouch.y);
        pressTouch = null;
      }, LONG_PRESS_MS);
    },
    { passive: true },
  );

  input.addEventListener(
    'touchmove',
    (e) => {
      if (!pressTouch || !pressTimer || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - pressTouch.x, t.clientY - pressTouch.y) > 14) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    },
    { passive: true },
  );

  const endPress = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressTouch = null;
  };
  input.addEventListener('touchend', endPress);
  input.addEventListener('touchcancel', endPress);
}

function wrapField(input) {
  if (input.closest('.spell-wrap')) return;
  input.spellcheck = false;

  const wrap = document.createElement('div');
  wrap.className = 'spell-wrap';
  input.parentNode.insertBefore(wrap, input);

  const mirror = document.createElement('div');
  mirror.className = 'spell-wrap__mirror';
  mirror.setAttribute('aria-hidden', 'true');

  wrap.appendChild(mirror);
  wrap.appendChild(input);
  input.classList.add('spell-wrap__input');

  copyFieldMetrics(input, mirror);

  input.addEventListener('input', () => scheduleFieldCheck(input));
  input.addEventListener('scroll', () => syncMirrorScroll(input, mirror));
  window.addEventListener(
    'resize',
    () => {
      copyFieldMetrics(input, mirror);
      syncMirrorScroll(input, mirror);
    },
    { passive: true },
  );

  function openMenuIfFlagged(hit, clientX, clientY) {
    if (!hit) return;
    lookupWord(normWord(hit.word)).then(({ ok }) => {
      if (ok) return;
      showMenuForWord(input, hit, clientX, clientY);
    });
  }

  input.addEventListener('contextmenu', (e) => {
    const hit = wordAtSelection(input);
    if (!hit) return;
    e.preventDefault();
    openMenuIfFlagged(hit, e.clientX, e.clientY);
  });

  input.addEventListener('dblclick', (e) => {
    const hit = wordAtSelection(input);
    openMenuIfFlagged(hit, e.clientX, e.clientY);
  });

  input.addEventListener('mouseup', () => {
    const hit = wordAtSelection(input);
    if (!hit || input.selectionStart === input.selectionEnd) return;
    const rect = input.getBoundingClientRect();
    openMenuIfFlagged(hit, rect.left + 12, rect.top + 12);
  });

  bindTouchSpell(input, openMenuIfFlagged);

  scheduleFieldCheck(input);
}

/** Attach inline spell check to Hindi fields under `root`. */
export function bindInlineSpellFields(root = document) {
  if (!root) return;
  ensureMenu();
  const fields = [...root.querySelectorAll('textarea.hi-field, input.hi-field[type="text"]')];
  ensureSpellDictionary().catch(() => {});
  fields.forEach(wrapField);
}

/** @returns {Promise<{ totalIssues: number }>} */
export async function spellCheckEditorFields(texts) {
  let totalIssues = 0;
  for (const { text } of texts) {
    const tokens = tokenizeHindiWithOffsets(text || '', MIN_WORD_LEN);
    const seen = new Set();
    for (const tok of tokens) {
      if (seen.has(tok.word)) continue;
      seen.add(tok.word);
      const { ok } = await lookupWord(tok.word);
      if (!ok) totalIssues += 1;
    }
  }
  return { totalIssues };
}
