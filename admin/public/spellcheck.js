/**
 * Hindi spell check UI for bhajan editor (calls /api/spell).
 */

const IGNORE_KEY = 'bhajan-admin-spell-ignore';

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

export async function runSpellCheck(texts) {
  const res = await fetch('/api/spell', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, ignoreWords: getIgnoredWords() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
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
      '<p class="spell-ok">No unknown words found (dictionary may still miss some bhajan terms).</p>';
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
