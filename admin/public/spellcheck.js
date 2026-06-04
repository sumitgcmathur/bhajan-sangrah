/**
 * Inline Hindi spell check (Espells + Shreeshrii hindi-hunspell via CDN).
 * Red wavy underlines in editor fields; context menu: correct / ignore / add.
 */

import { normWord, tokenizeHindiWithOffsets } from './spell-tokens.js';

const ESPELLS_URL = 'https://esm.sh/espells@0.4.1';
const DICT_AFF =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.aff';
const DICT_DIC =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.dic';
const DICT_PROBE_WORD = 'जय';

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

let checkerPromise = null;
let menuEl = null;
let activeTarget = null;
let wordCache = new Map();
const fieldTimers = new WeakMap();

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

function shouldSkip(word) {
  if (DEFAULT_IGNORE.has(word)) return true;
  if (loadWordSet(IGNORE_KEY).has(word)) return true;
  if (loadWordSet(CUSTOM_KEY).has(word)) return true;
  if (/^[०१२३४५६७८९\d]+$/.test(word)) return true;
  return false;
}

async function getChecker() {
  if (!checkerPromise) {
    checkerPromise = (async () => {
      const { Espells } = await import(ESPELLS_URL);
      if (!Espells?.fromURL) throw new Error('Espells failed to load');
      const spell = await Espells.fromURL({ aff: DICT_AFF, dic: DICT_DIC });
      const probe = spell.lookup(normWord(DICT_PROBE_WORD));
      if (!probe.correct) {
        throw new Error('Hindi dictionary failed to load');
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
  if (shouldSkip(word)) {
    const ok = { ok: true, suggestions: [] };
    wordCache.set(word, ok);
    return ok;
  }
  const spell = await getChecker();
  const { correct, forbidden } = spell.lookup(word);
  const result = {
    ok: correct && !forbidden,
    suggestions: correct ? [] : spell.suggest(word).slice(0, MAX_SUGGESTIONS),
  };
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

function wordAtSelection(input) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start == null || end == null) return null;
  if (start !== end) {
    const sel = input.value.slice(start, end);
    const w = normWord(sel);
    if (/^[\u0900-\u097F]+$/.test(w)) return { word: w, start, end };
  }
  const text = input.value;
  const re = /[\u0900-\u097F]+/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index < end && m.index + m[0].length > start) {
      return { word: m[0], start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
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
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  let left = clientX;
  let top = clientY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;

  menu.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
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
    });
  });
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

  input.addEventListener('contextmenu', (e) => {
    const hit = wordAtSelection(input);
    if (!hit) return;
    e.preventDefault();
    lookupWord(normWord(hit.word)).then(({ ok }) => {
      if (ok) return;
      showMenuForWord(input, hit, e.clientX, e.clientY);
    });
  });

  input.addEventListener('mouseup', () => {
    const hit = wordAtSelection(input);
    if (!hit || input.selectionStart === input.selectionEnd) return;
    lookupWord(normWord(hit.word)).then(({ ok }) => {
      if (ok) return;
      const rect = input.getBoundingClientRect();
      showMenuForWord(input, hit, rect.left + 12, rect.top + 12);
    });
  });

  scheduleFieldCheck(input);
}

/** Attach inline spell check to Hindi fields under `root`. */
export function bindInlineSpellFields(root = document) {
  if (!root) return;
  ensureMenu();
  root.querySelectorAll('textarea.hi-field, input.hi-field[type="text"]').forEach(wrapField);
  getChecker().catch(() => {});
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
