/**
 * Hindi spell check in the browser (Espells + dictionary-hi via CDN).
 * Avoids Vercel serverless ESM bundling issues with node_modules/espells.
 */

import { normWord, tokenizeHindiForSpell } from './spell-tokens.js';

const ESPELLS_URL = 'https://esm.sh/espells@0.4.1';
/** Hindi Hunspell (~4.4 lakh words) — dictionary-hi npm package does not exist; these URLs work */
const DICT_AFF =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.aff';
const DICT_DIC =
  'https://raw.githubusercontent.com/Shreeshrii/hindi-hunspell/master/Hindi/hi_IN.dic';
const DICT_PROBE_WORD = 'जय';

const MIN_WORD_LEN = 2;
const MAX_SUGGESTIONS = 6;
const IGNORE_KEY = 'bhajan-admin-spell-ignore';

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

export function getIgnoredWords() {
  try {
    const raw = sessionStorage.getItem(IGNORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function ignoreWord(word) {
  const w = String(word || '').trim();
  if (!w) return getIgnoredWords();
  const set = new Set(getIgnoredWords());
  set.add(w);
  const list = [...set];
  sessionStorage.setItem(IGNORE_KEY, JSON.stringify(list));
  return list;
}

function tokenize(text) {
  return tokenizeHindiForSpell(text, MIN_WORD_LEN);
}

function shouldSkip(word, extraIgnore) {
  if (DEFAULT_IGNORE.has(word)) return true;
  if (extraIgnore.has(word)) return true;
  if (/^[०१२३४५६७८९\d]+$/.test(word)) return true;
  return false;
}

async function getChecker() {
  if (!checkerPromise) {
    checkerPromise = (async () => {
      const { Espells } = await import(ESPELLS_URL);
      if (!Espells?.fromURL) throw new Error('Espells failed to load from CDN');
      const spell = await Espells.fromURL({ aff: DICT_AFF, dic: DICT_DIC });
      const probe = spell.lookup(normWord(DICT_PROBE_WORD));
      if (!probe.correct) {
        throw new Error(
          'Hindi dictionary failed to load (network or blocked CDN). Try again on Wi‑Fi.',
        );
      }
      return spell;
    })().catch((e) => {
      checkerPromise = null;
      throw e;
    });
  }
  return checkerPromise;
}

/**
 * @param {Array<{ id: string, label: string, text: string }>} texts
 */
export async function runSpellCheck(texts) {
  const spell = await getChecker();
  const extraIgnore = new Set(getIgnoredWords().map((w) => String(w).trim()).filter(Boolean));
  const fields = [];
  let totalIssues = 0;

  for (const { id, label, text } of texts) {
    const issues = [];
    const seen = new Set();
    for (const word of tokenize(text)) {
      if (seen.has(word)) continue;
      seen.add(word);
      if (shouldSkip(word, extraIgnore)) continue;

      const { correct, forbidden } = spell.lookup(word);
      if (correct && !forbidden) continue;

      const suggestions = spell.suggest(word).slice(0, MAX_SUGGESTIONS);
      issues.push({ word, suggestions });
      totalIssues += 1;
    }
    issues.sort((a, b) => a.word.localeCompare(b.word, 'hi'));
    if (issues.length) fields.push({ id, label, issues });
  }

  return { fields, totalIssues, ready: true };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLElement} container
 * @param {{ fields: Array, totalIssues: number }} result
 * @param {{ onRecheck: () => void }} hooks
 */
export function renderSpellPanel(container, result, hooks = {}) {
  if (!container) return;

  if (!result) {
    container.innerHTML = '';
    container.classList.add('is-hidden');
    return;
  }

  container.classList.remove('is-hidden');

  if (!result.totalIssues) {
    container.innerHTML =
      '<p class="spell-ok">No unknown words in the Hindi dictionary (bhajan names may still need <strong>Ignore word</strong>).</p>';
    return;
  }

  const blocks = result.fields
    .map((field) => {
      const items = field.issues
        .map((issue) => {
          const sug =
            issue.suggestions?.length > 0
              ? `<span class="spell-sug">Suggestions: ${issue.suggestions.map((s) => escapeHtml(s)).join(', ')}</span>`
              : '<span class="spell-sug">No suggestions</span>';
          return `<li class="spell-issue">
            <strong>${escapeHtml(issue.word)}</strong>
            ${sug}
            <button type="button" class="btn spell-ignore-btn" data-word="${escapeHtml(issue.word)}">Ignore word</button>
          </li>`;
        })
        .join('');
      return `<section class="spell-field-block">
        <h3 class="spell-field-title">${escapeHtml(field.label)}</h3>
        <ul class="spell-issue-list">${items}</ul>
      </section>`;
    })
    .join('');

  container.innerHTML = `
    <p class="spell-summary"><strong>${result.totalIssues}</strong> possible misspelling(s). Review before publish.</p>
    ${blocks}`;

  container.querySelectorAll('.spell-ignore-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      ignoreWord(btn.dataset.word);
      hooks.onRecheck?.();
    });
  });
}
