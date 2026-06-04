import { bindSpeechDictation, stopDictation, speechSupported } from './speech.js';
import { bindInlineSpellFields, spellCheckEditorFields } from './spellcheck.js';

const app = document.getElementById('app');

const state = {
  view: 'loading',
  login: null,
  sections: [],
  section: null,
  bhajans: [],
  groupOptions: [],
  path: null,
  sha: null,
  editor: null,
  error: null,
  paraEditMode: 'paste',
  paraBulkDraft: null,
  editOptional: { preShlok: false, dhvani: false, jabani: false },
  previewHtml: null,
  previewBusy: false,
  editPanel: 'basic',
  replace: {
    find: '',
    replace: '',
    regex: false,
    caseInsensitive: false,
    preview: null,
    busy: false,
    busyPhase: null,
    progress: null,
    abortCtrl: null,
  },
};

const HI_FIELD = 'class="hi-field" lang="hi-IN" spellcheck="false"';

const GROUP_OTHER = '__other__';

/** @type {string} last #/… hash written by syncRouteFromState */
let lastSyncedRouteHash = '';
let routeUseReplace = false;

function parseRouteHash() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const qIdx = raw.indexOf('?');
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const q = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '');
  const parts = pathPart.split('/').filter(Boolean);

  if (!parts.length || parts[0] === '') return { view: 'sections' };
  if (parts[0] === 'replace') return { view: 'replace' };

  if (parts[0] === 'edit') {
    const p = q.get('p');
    if (p && p.startsWith('content/') && !p.includes('..')) return { view: 'edit', path: p };
  }
  if (parts[0] === 'preview') {
    const p = q.get('p');
    if (p && p.startsWith('content/') && !p.includes('..')) return { view: 'preview', path: p };
  }
  if (parts[0] === 's' && parts[1]) {
    const slug = decodeURIComponent(parts[1]);
    if (parts[2] === 'new') return { view: 'edit-new', slug };
    if (parts.length === 2) return { view: 'bhajans', slug };
  }
  return { view: 'sections' };
}

function buildRouteHash() {
  if (state.view === 'login' || state.view === 'loading') return '#/';
  if (state.view === 'sections') return '#/';
  if (state.view === 'replace') return '#/replace';
  if (state.view === 'bhajans' && state.section?.slug) {
    return `#/s/${encodeURIComponent(state.section.slug)}`;
  }
  if (state.view === 'edit') {
    if (state.editPanel === 'preview' && state.path) {
      return `#/preview?p=${encodeURIComponent(state.path)}`;
    }
    if (state.path) return `#/edit?p=${encodeURIComponent(state.path)}`;
    if (state.section?.slug) return `#/s/${encodeURIComponent(state.section.slug)}/new`;
  }
  return '#/';
}

function syncRouteFromState() {
  if (state.view === 'loading' || state.view === 'login') return;
  const hash = buildRouteHash();
  if (hash === lastSyncedRouteHash) return;
  lastSyncedRouteHash = hash;
  const url = `${location.pathname}${location.search}${hash}`;
  if (routeUseReplace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  routeUseReplace = false;
}

function finishRouteSync() {
  syncRouteFromState();
}

/** Scroll in-preview card anchors without replacing admin #/… route. */
function scrollPreviewCardAnchor(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

function bindPreviewCardLinks() {
  const root = document.querySelector('.preview-site');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const link = e.target.closest('.bhajan-card__to-sthayi');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.charAt(0) !== '#') return;
    const id = href.slice(1);
    if (!scrollPreviewCardAnchor(id)) return;
    e.preventDefault();
  });
}

function sectionSlugFromPath(filePath) {
  const m = String(filePath || '').match(/^content\/([^/]+)\//);
  return m ? m[1] : null;
}

async function ensureSectionForPath(filePath) {
  const slug = sectionSlugFromPath(filePath);
  if (!slug) return;
  if (state.section?.slug === slug && state.bhajans?.length) return;
  await loadBhajans(slug);
}

async function applyRouteFromHash() {
  routeUseReplace = true;
  lastSyncedRouteHash = '';
  const route = parseRouteHash();

  if (route.view === 'sections') {
    state.view = 'sections';
    state.error = null;
    render();
    return;
  }

  if (route.view === 'replace') {
    endReplaceOp();
    state.error = null;
    state.replace.preview = null;
    state.view = 'replace';
    render();
    return;
  }

  if (route.view === 'bhajans') {
    const sec = state.sections.find((s) => s.slug === route.slug);
    if (!sec) {
      state.view = 'sections';
      render();
      return;
    }
    await loadBhajans(route.slug);
    state.view = 'bhajans';
    state.error = null;
    render();
    return;
  }

  if (route.view === 'edit-new') {
    const sec = state.sections.find((s) => s.slug === route.slug);
    if (!sec) {
      state.view = 'sections';
      render();
      return;
    }
    await loadBhajans(route.slug);
    state.path = null;
    state.sha = null;
    state.editor = emptyEditor();
    resetParagraphEditor();
    initEditOptionalFromEditor(state.editor);
    state.view = 'edit';
    state.error = null;
    render();
    return;
  }

  if (route.view === 'edit' && route.path) {
    try {
      await loadEditorFromPath(route.path);
      state.view = 'edit';
      state.error = null;
      render();
    } catch (e) {
      state.error = e.message;
      state.view = 'sections';
      render();
    }
    return;
  }

  if (route.view === 'preview' && route.path) {
    try {
      await loadEditorFromPath(route.path);
      state.view = 'edit';
      state.editPanel = 'preview';
      state.error = null;
      render();
      await refreshPreview();
    } catch (e) {
      state.previewBusy = false;
      state.error = e.message;
      state.view = 'sections';
      render();
    }
    return;
  }

  state.view = 'sections';
  render();
}

function emptyEditor() {
  return {
    title: '',
    tarz: '',
    group: '',
    swarachit: false,
    jabani: '',
    lyrics: {
      sthayi: '',
      sthayi_connect: false,
      sthayi_connect_text: '',
      pre_shlok: '',
      dhvani: '',
      paragraphs: [{ type: 'antara', text: '' }],
      parts: null,
    },
    legacyLyricsText: '',
  };
}

async function api(path, opts = {}) {
  const { signal, ...fetchOpts } = opts;
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: fetchOpts.body ? { 'Content-Type': 'application/json' } : {},
    signal,
    ...fetchOpts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const REPLACE_BATCH = 10;

function isReplaceAborted(err) {
  return err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''));
}

function beginReplaceOp(phase) {
  state.replace.abortCtrl?.abort();
  const ac = new AbortController();
  state.replace.abortCtrl = ac;
  state.replace.busy = true;
  state.replace.busyPhase = phase;
  state.replace.progress = { current: 0, total: 0, phase, matches: 0, updated: 0 };
  return ac;
}

function endReplaceOp() {
  state.replace.busy = false;
  state.replace.busyPhase = null;
  state.replace.progress = null;
  state.replace.abortCtrl = null;
}

function cancelReplaceOp() {
  const phase = state.replace.busyPhase;
  state.replace.abortCtrl?.abort();
  endReplaceOp();
  state.error =
    phase === 'apply'
      ? 'Apply cancelled. Files already committed in finished batches were not reverted.'
      : 'Search cancelled.';
  render();
}

function replaceProgressHtml(r) {
  if (!r.busy || !r.progress) return '';
  const { current, total, phase, matches = 0, updated = 0, listing } = r.progress;
  if (listing || total === 0) {
    return `<div class="replace-progress" role="status" aria-live="polite">
      <div class="replace-progress-track" aria-hidden="true"><div class="replace-progress-fill replace-progress-fill--pulse"></div></div>
      <p class="replace-progress-label">${escapeHtml(phase === 'apply' ? 'Preparing apply…' : 'Loading file list…')}</p>
    </div>`;
  }
  const pct = Math.min(100, Math.round((current / total) * 100));
  const label =
    phase === 'apply'
      ? `Applying… ${current} / ${total} files (${updated} updated, ${matches} replacement${matches === 1 ? '' : 's'})`
      : `Searching… ${current} / ${total} files (${matches} match${matches === 1 ? '' : 'es'} so far)`;
  return `<div class="replace-progress" role="status" aria-live="polite">
    <div class="replace-progress-track" aria-hidden="true"><div class="replace-progress-fill" style="width:${pct}%"></div></div>
    <p class="replace-progress-label">${escapeHtml(label)}</p>
  </div>`;
}

async function replaceListPaths(signal) {
  const data = await api('/api/replace', {
    method: 'POST',
    signal,
    body: JSON.stringify({ listPaths: true }),
  });
  return data.paths || [];
}

async function replaceScanBatch(paths, payload, signal) {
  return api('/api/replace', {
    method: 'POST',
    signal,
    body: JSON.stringify({ ...payload, dryRun: true, paths }),
  });
}

async function replaceApplyBatch(paths, payload, signal) {
  return api('/api/replace', {
    method: 'POST',
    signal,
    body: JSON.stringify({ ...payload, dryRun: false, paths }),
  });
}

function errMsg(code) {
  const map = {
    not_allowed: 'This GitHub account is not allowed.',
    invalid_state: 'Login expired — please try again.',
    access_denied: 'GitHub login was cancelled.',
  };
  return map[code] || code;
}

function groupChoices() {
  const fromSection = (state.groupOptions || []).filter(Boolean);
  const fromTitles = (state.sections || []).map((s) => s.title).filter(Boolean);
  return [...new Set([...fromSection, ...fromTitles])].sort((a, b) => a.localeCompare(b, 'hi'));
}

function groupFieldHtml(current) {
  const choices = groupChoices();
  const known = !current || choices.includes(current);
  const selectValue = known ? current || '' : GROUP_OTHER;
  const options = [
    '<option value="">— None —</option>',
    ...choices.map(
      (g) => `<option value="${escapeAttr(g)}" ${g === current && known ? 'selected' : ''}>${escapeHtml(g)}</option>`,
    ),
    `<option value="${GROUP_OTHER}" ${!known ? 'selected' : ''}>Other (custom)…</option>`,
  ].join('');
  return `
    <label>Group (subsection)</label>
    <select id="f-group-select">${options}</select>
    <div id="f-group-other-wrap" class="${known ? 'is-hidden' : ''}">
      <label>Custom group name</label>
      <input type="text" id="f-group-other" class="hi-field" lang="hi-IN" value="${escapeAttr(known ? '' : current)}">
    </div>`;
}

function bindGroupField() {
  const sel = document.getElementById('f-group-select');
  const wrap = document.getElementById('f-group-other-wrap');
  if (!sel || !wrap) return;
  const sync = () => {
    wrap.classList.toggle('is-hidden', sel.value !== GROUP_OTHER);
  };
  sel.addEventListener('change', sync);
  sync();
}

function readGroupValue() {
  const sel = document.getElementById('f-group-select');
  if (!sel) return '';
  if (sel.value === GROUP_OTHER) {
    return (document.getElementById('f-group-other')?.value || '').trim();
  }
  return sel.value.trim();
}

/** One block per antara; blank line separates blocks. Commentary blocks start with [commentary]. */
function bulkTextToParagraphs(text) {
  return String(text || '')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      if (lines[0].trim().toLowerCase() === '[commentary]') {
        return {
          type: 'commentary',
          text: lines.slice(1).join('\n').trim() || lines.slice(1).join('\n'),
        };
      }
      return { type: 'antara', text: block };
    });
}

function paragraphsToBulkText(paragraphs) {
  return (paragraphs || [])
    .map((p) => {
      const text = String(p.text || '').trim();
      if (!text) return '';
      if (p.type === 'commentary') return `[commentary]\n${text}`;
      return text;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Keep in-memory editor in sync with the form before any re-render. */
function syncEditorFromDom() {
  if (state.view !== 'edit' || !state.editor) return;
  const titleEl = document.getElementById('f-title');
  if (!titleEl) return;
  const e = state.editor;
  e.title = titleEl.value.trim();
  e.tarz = document.getElementById('f-tarz')?.value.trim() || '';
  if (document.getElementById('f-group-select')) {
    e.group = readGroupValue();
  }
  e.swarachit = document.getElementById('f-swarachit')?.checked || false;
  const jabEl = document.getElementById('f-jabani');
  if (jabEl) e.jabani = jabEl.value.trim();
  const L = e.lyrics;
  const sthayiEl = document.getElementById('f-sthayi');
  if (sthayiEl) L.sthayi = sthayiEl.value.trim();
  const connectOff = document.getElementById('f-connect-off');
  if (connectOff) L.sthayi_connect = connectOff.checked ? false : undefined;
  const connectTextEl = document.getElementById('f-connect-text');
  if (connectTextEl) L.sthayi_connect_text = connectTextEl.value.trim();
  const preEl = document.getElementById('f-pre-shlok');
  if (preEl) L.pre_shlok = preEl.value.trim();
  const dhvEl = document.getElementById('f-dhvani');
  if (dhvEl) L.dhvani = dhvEl.value.trim();
  const legacy = document.getElementById('f-legacy');
  if (legacy) e.legacyLyricsText = legacy.value;
  flushParagraphEdits();
}

function flushParagraphEdits() {
  if (state.view !== 'edit' || !state.editor) return;
  const pastePanel = document.getElementById('paras-paste');
  if (pastePanel && !pastePanel.classList.contains('is-hidden')) {
    const bulk = document.getElementById('f-paras-bulk');
    const raw = bulk?.value ?? state.paraBulkDraft ?? '';
    state.paraBulkDraft = raw;
    const parsed = bulkTextToParagraphs(raw);
    state.editor.lyrics.paragraphs = parsed.length ? parsed : [{ type: 'antara', text: '' }];
    return;
  }
  const cards = document.querySelectorAll('.para-row');
  if (cards.length) {
    state.editor.lyrics.paragraphs = [...cards].map((card) => ({
      type: card.querySelector('.para-type').value,
      text: card.querySelector('.para-text').value,
    }));
  }
  state.paraBulkDraft = paragraphsToBulkText(state.editor.lyrics.paragraphs);
}

function versesSectionHtml(paragraphs) {
  const mode = state.paraEditMode || 'paste';
  const bulk =
    state.paraBulkDraft != null ? state.paraBulkDraft : paragraphsToBulkText(paragraphs);
  const structuredHidden = mode === 'paste' ? 'is-hidden' : '';
  const pasteHidden = mode === 'structured' ? 'is-hidden' : '';
  return `
    <div class="para-mode-bar">
      <button type="button" class="btn para-mode-btn ${mode === 'structured' ? 'is-active' : ''}" data-para-mode="structured">By paragraph</button>
      <button type="button" class="btn para-mode-btn ${mode === 'paste' ? 'is-active' : ''}" data-para-mode="paste">Paste full text</button>
    </div>
    <div id="paras-structured" class="${structuredHidden}">
      <div id="paras">${(paragraphs || []).map((p, i) => paraHtml(p, i)).join('')}</div>
      <button type="button" class="btn" id="add-antara">+ Antara</button>
      <button type="button" class="btn" id="add-commentary">+ Commentary</button>
    </div>
    <div id="paras-paste" class="${pasteHidden}">
      <p class="hint">One verse (antara) per block. Put a <strong>blank line</strong> between blocks. Line breaks inside a block are kept. For commentary, put <code>[commentary]</code> alone on the first line, then the text.</p>
      <textarea id="f-paras-bulk" class="paras-bulk hi-field" lang="hi-IN" rows="14">${escapeHtml(bulk)}</textarea>
      <button type="button" class="btn" id="parse-paras-bulk">Parse into paragraphs</button>
    </div>`;
}

function resetParagraphEditor() {
  state.paraEditMode = 'paste';
  state.paraBulkDraft = null;
  state.editPanel = 'basic';
}

function initEditOptionalFromEditor(editor) {
  const L = editor?.lyrics || {};
  state.editOptional = {
    preShlok: Boolean((L.pre_shlok || '').trim()),
    dhvani: Boolean((L.dhvani || '').trim()),
    jabani: Boolean((editor?.jabani || '').trim()),
  };
}

function hasSthayiAdvanced(L) {
  return Boolean(L.sthayi_connect === false || (L.sthayi_connect_text || '').trim());
}

function editPanelHidden(panel) {
  return state.editPanel === panel ? '' : ' is-hidden';
}

function editNavHtml(e) {
  const active = state.editPanel || 'basic';
  const hasMoreContent =
    state.editOptional.preShlok ||
    state.editOptional.dhvani ||
    state.editOptional.jabani;
  const moreBadge = hasMoreContent ? '<span class="edit-nav__badge" title="Has optional content">•</span>' : '';
  const items = [
    { id: 'basic', label: 'Basic' },
    { id: 'sthayi', label: 'स्थायी' },
    { id: 'verses', label: 'Antaras' },
    { id: 'more', label: 'More', badge: moreBadge },
    { id: 'preview', label: 'Preview' },
  ];
  if (e.legacyLyricsText) items.push({ id: 'legacy', label: 'Legacy' });
  const parts = [];
  if (speechSupported()) parts.push('Mic → focused field');
  const coarse =
    typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  parts.push(
    coarse
      ? 'Spell: long-press flagged word, or select it'
      : 'Spell: right-click, double-click, or select flagged word',
  );
  const hint = parts.join(' · ');
  const buttons = items
    .map(
      (p) =>
        `<button type="button" class="edit-nav__btn${active === p.id ? ' is-active' : ''}" data-edit-panel="${p.id}" aria-current="${active === p.id ? 'page' : 'false'}">${escapeHtml(p.label)}${p.badge || ''}</button>`,
    )
    .join('');
  const navHint =
    active === 'preview' ? '' : `<p class="edit-nav__hint">${escapeHtml(hint)}</p>`;
  return `<nav class="edit-nav" aria-label="Edit sections">${buttons}${navHint}</nav>`;
}

function optionalLyricsHtml(e, L) {
  const o = state.editOptional;
  const blocks = [];
  if (o.preShlok) {
    blocks.push(`<div class="lyrics-block">
      <h3>Opening shloka</h3>
      <textarea id="f-pre-shlok" class="hi-field" lang="hi-IN" rows="3">${escapeHtml(L.pre_shlok)}</textarea>
    </div>`);
  }
  if (o.dhvani) {
    blocks.push(`<div class="lyrics-block">
      <h3>Dhvani</h3>
      <textarea id="f-dhvani" class="hi-field" lang="hi-IN" rows="3">${escapeHtml(L.dhvani)}</textarea>
    </div>`);
  }
  if (o.jabani) {
    blocks.push(`<div class="lyrics-block">
      <h3>Jabani (explanation)</h3>
      <textarea id="f-jabani" class="hi-field" lang="hi-IN" rows="4">${escapeHtml(e.jabani)}</textarea>
    </div>`);
  }
  const adds = [];
  if (!o.preShlok) {
    adds.push(
      '<button type="button" class="btn btn-add-optional" data-show-optional="preShlok">+ Opening shloka</button>',
    );
  }
  if (!o.dhvani) {
    adds.push(
      '<button type="button" class="btn btn-add-optional" data-show-optional="dhvani">+ Dhvani</button>',
    );
  }
  if (!o.jabani) {
    adds.push(
      '<button type="button" class="btn btn-add-optional" data-show-optional="jabani">+ Jabani</button>',
    );
  }
  if (!blocks.length && !adds.length) {
    return `<div class="optional-add-bar">${adds.join('')}</div>`;
  }
  return `${blocks.join('')}${adds.length ? `<div class="optional-add-bar">${adds.join('')}</div>` : ''}`;
}

function previewListContext() {
  const list = state.bhajans || [];
  if (!state.path) {
    const total = Math.max(1, list.length + 1);
    return { index: list.length, total };
  }
  const i = list.findIndex((b) => b.path === state.path);
  if (i >= 0) return { index: i, total: Math.max(1, list.length) };
  return { index: 0, total: Math.max(1, list.length) };
}

function previewPanelHtml() {
  if (state.previewBusy) {
    return '<p class="loading">Building preview…</p>';
  }
  if (state.previewHtml) {
    return `<div class="preview-site preview-site--section">${state.previewHtml}</div>
      <button type="button" class="btn" id="refresh-preview" style="margin-top:0.65rem">Refresh preview</button>`;
  }
  return '<p class="loading">Building preview…</p>';
}

function dictationStickyBtnHtml() {
  if (!speechSupported()) return '';
  return `<button type="button" class="btn dictation-global" id="dictation-global" aria-label="Dictate into focused field (Hindi)" aria-pressed="false" title="Dictate into focused field">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-4.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
  </button>`;
}

function bhajanDisplayName(b) {
  const title = (b.title || '').trim();
  if (title) return title;
  return b.name.replace(/^\d+-/, '').replace(/\.ya?ml$/i, '').replace(/-/g, ' ');
}

function bindTopbar(opts = {}) {
  document.querySelector('[data-back="sections"]')?.addEventListener('click', () => {
    if (opts.abortReplaceOnLeave) state.replace.abortCtrl?.abort();
    if (state.view === 'replace') endReplaceOp();
    state.error = null;
    location.hash = '#/';
  });
  document.querySelector('[data-back="bhajans"]')?.addEventListener('click', () => {
    if (opts.abortReplaceOnLeave) state.replace.abortCtrl?.abort();
    state.error = null;
    if (state.section?.slug) location.hash = `#/s/${encodeURIComponent(state.section.slug)}`;
    else location.hash = '#/';
  });
  document.querySelector('[data-back="edit"]')?.addEventListener('click', () => {
    state.error = null;
    state.previewHtml = null;
    state.previewBusy = false;
    state.editPanel = 'basic';
    if (state.path) location.hash = `#/edit?p=${encodeURIComponent(state.path)}`;
    else if (state.section?.slug) location.hash = `#/s/${encodeURIComponent(state.section.slug)}/new`;
    else location.hash = '#/';
  });
}

function renderInner() {
  stopDictation();
  const showPreviewCss = state.view === 'edit' && state.editPanel === 'preview';
  setPreviewStylesheet(showPreviewCss);
  if (state.view !== 'edit' && state.view !== 'replace') {
    state.error = null;
  }
  if (state.view === 'loading') {
    app.innerHTML = '<p class="loading">Loading…</p>';
    return;
  }

  if (state.view === 'login') {
    const q = new URLSearchParams(location.search);
    const err = q.get('error');
    app.innerHTML = `
      <main>
        <div class="login-card">
          <h1>Bhajan Sangrah Admin</h1>
          ${err ? `<p class="err">${escapeHtml(errMsg(err))}</p>` : ''}
          <p>Sign in with GitHub to edit content. Only the allowed account can make changes.</p>
          <a class="btn btn-primary" href="/api/auth/login">Sign in with GitHub</a>
        </div>
      </main>`;
    return;
  }

  if (state.view === 'sections') {
    const options = state.sections
      .map((s) => `<option value="${escapeAttr(s.slug)}">${escapeHtml(s.title)}</option>`)
      .join('');
    app.innerHTML = `
      ${topbar('Sections', '')}
      <main>
        <p class="hint">Choose a section to edit bhajans. Saves are committed to <code>main</code>.</p>
        <label for="section-pick">Section</label>
        <select id="section-pick" class="section-pick">${options}</select>
        <button type="button" class="btn btn-primary" id="open-section" style="width:100%;margin-top:0.65rem">Open section</button>
        <button type="button" class="btn" id="go-replace" style="width:100%;margin-top:0.5rem">Find &amp; replace (all YAML)</button>
      </main>`;
    document.getElementById('open-section').addEventListener('click', () => {
      const slug = document.getElementById('section-pick').value;
      if (slug) location.hash = `#/s/${encodeURIComponent(slug)}`;
    });
    document.getElementById('go-replace').addEventListener('click', () => {
      location.hash = '#/replace';
    });
    return;
  }

  if (state.view === 'replace') {
    const r = state.replace;
    const prev = r.preview;
    const busy = r.busy;
    const disabled = busy ? 'disabled' : '';
    const previewLabel =
      busy && r.busyPhase === 'preview' ? 'Searching…' : 'Preview matches';
    const applyLabel = busy && r.busyPhase === 'apply' ? 'Applying…' : 'Apply to all matches';
    app.innerHTML = `
      ${topbar('Find & replace', 'sections')}
      <main class="replace-main">
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <p class="hint">Search and replace across every bhajan YAML under <code>content/</code>. Preview first, then apply. Each changed file gets its own commit on <code>main</code>.</p>
        <label for="rep-find">Find</label>
        <textarea id="rep-find" class="replace-field" rows="3" ${disabled} placeholder="Text to find (min. 2 characters)">${escapeHtml(r.find)}</textarea>
        <label for="rep-replace">Replace with</label>
        <textarea id="rep-replace" class="replace-field" rows="3" ${disabled} placeholder="Leave empty to delete matches">${escapeHtml(r.replace)}</textarea>
        <div class="check-row"><input type="checkbox" id="rep-regex" ${r.regex ? 'checked' : ''} ${disabled}><label for="rep-regex">Regular expression</label></div>
        <div class="check-row"><input type="checkbox" id="rep-ci" ${r.caseInsensitive ? 'checked' : ''} ${disabled}><label for="rep-ci">Case insensitive</label></div>
        ${busy ? replaceProgressHtml(r) : ''}
        <div class="replace-actions">
          <button type="button" class="btn btn-primary" id="rep-preview" ${busy ? 'disabled' : ''}>${previewLabel}</button>
          <button type="button" class="btn" id="rep-apply" ${busy || !prev?.filesAffected ? 'disabled' : ''}>${applyLabel}</button>
          ${busy ? '<button type="button" class="btn btn-danger" id="rep-cancel">Cancel</button>' : ''}
        </div>
        ${prev && !busy ? renderReplacePreview(prev) : ''}
      </main>`;
    bindTopbar({ abortReplaceOnLeave: busy });
    document.getElementById('rep-preview')?.addEventListener('click', previewReplace);
    document.getElementById('rep-apply')?.addEventListener('click', applyReplace);
    document.getElementById('rep-cancel')?.addEventListener('click', cancelReplaceOp);
    bindReplaceForm();
    return;
  }

  if (state.view === 'bhajans') {
    app.innerHTML = `
      ${topbar(state.section.title, 'sections')}
      <main>
        <button type="button" class="btn btn-primary" id="add-bhajan" style="width:100%;margin-bottom:0.75rem">+ New bhajan</button>
        ${state.bhajans.map((b) => `
          <div class="bhajan-item">
            <a class="list-btn" href="#/edit?p=${encodeURIComponent(b.path)}">${escapeHtml(bhajanDisplayName(b))}</a>
          </div>`).join('') || '<p class="hint">No bhajans in this section yet.</p>'}
      </main>`;
    bindTopbar();
    document.getElementById('add-bhajan').addEventListener('click', () => {
      if (!state.section?.slug) return;
      location.hash = `#/s/${encodeURIComponent(state.section.slug)}/new`;
    });
    return;
  }

  if (state.view === 'edit') {
    syncEditorFromDom();
    const e = state.editor;
    const L = e.lyrics;
    if (state.editPanel === 'legacy' && !e.legacyLyricsText) state.editPanel = 'basic';
    const showGroup = Boolean(state.section?.grouped);
    const advOpen = hasSthayiAdvanced(L) ? ' open' : '';
    const groupBlock = showGroup
      ? `<div class="basic-grid__group">${groupFieldHtml(e.group)}</div>`
      : '';
    app.innerHTML = `
      ${topbar(e.title || 'Bhajan', 'bhajans')}
      <main class="edit-main">
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <div class="edit-layout">
          ${editNavHtml(e)}
          <div class="edit-panels">
            <div class="form-section edit-panel${editPanelHidden('basic')}" id="edit-panel-basic">
              <h2>Basic</h2>
              <div class="basic-grid">
                <div class="basic-grid__title">
                  <label for="f-title">Title</label>
                  <input type="text" id="f-title" ${HI_FIELD} value="${escapeAttr(e.title)}">
                </div>
                <div class="basic-grid__row2${showGroup ? ' basic-grid__row2--group' : ''}">
                  <div class="basic-grid__tarz">
                    <label for="f-tarz">Tarz (tune line)</label>
                    <input type="text" id="f-tarz" ${HI_FIELD} value="${escapeAttr(e.tarz)}">
                  </div>
                  ${groupBlock}
                  <div class="check-row basic-grid__swarachit">
                    <input type="checkbox" id="f-swarachit" ${e.swarachit ? 'checked' : ''}>
                    <label for="f-swarachit">Swarachit</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-section edit-panel${editPanelHidden('sthayi')}" id="edit-panel-sthayi">
              <h2>स्थायी (refrain)</h2>
              <textarea id="f-sthayi" class="hi-field" lang="hi-IN" rows="8">${escapeHtml(L.sthayi)}</textarea>
              <details class="sthayi-advanced"${advOpen}>
                <summary>Advanced refrain options</summary>
                <div class="check-row">
                  <input type="checkbox" id="f-connect-off" ${L.sthayi_connect === false ? 'checked' : ''}>
                  <label for="f-connect-off">Disable sthayi_connect</label>
                </div>
                <label for="f-connect-text">sthayi_connect_text</label>
                <input type="text" id="f-connect-text" class="hi-field" lang="hi-IN" value="${escapeAttr(L.sthayi_connect_text)}">
              </details>
            </div>
            <div class="form-section edit-panel${editPanelHidden('verses')}" id="edit-panel-verses">
              <h2>Antaras</h2>
              ${versesSectionHtml(L.paragraphs)}
            </div>
            <div class="form-section edit-panel${editPanelHidden('more')}" id="edit-panel-more">
              <h2>More</h2>
              <p class="hint">Optional opening shloka, dhvani, or jabani.</p>
              ${optionalLyricsHtml(e, L)}
            </div>
            <div class="form-section edit-panel edit-panel--preview${editPanelHidden('preview')}" id="edit-panel-preview">
              <h2>Preview</h2>
              ${previewPanelHtml()}
            </div>
            ${e.legacyLyricsText ? `<div class="form-section edit-panel${editPanelHidden('legacy')}" id="edit-panel-legacy"><h2>Legacy lyrics</h2><textarea id="f-legacy" class="hi-field" lang="hi-IN" rows="12">${escapeHtml(e.legacyLyricsText)}</textarea></div>` : ''}
          </div>
        </div>
        <div class="sticky-actions">
          ${state.editPanel === 'preview' ? '' : dictationStickyBtnHtml()}
          ${state.editPanel === 'preview' ? '<button type="button" class="btn btn-primary" id="save">Publish</button>' : ''}
          ${state.path ? '<button type="button" class="btn btn-danger" id="delete">Delete</button>' : ''}
        </div>
      </main>`;
    bindEditor();
    return;
  }
}

function render() {
  renderInner();
  finishRouteSync();
}

function setPreviewStylesheet(on) {
  const link = document.getElementById('site-preview-css');
  if (!link) return;
  link.media = on ? 'all' : 'not all';
}

function renderReplacePreview(prev) {
  if (!prev.filesAffected) {
    return '<p class="hint replace-summary">No matches in ' + prev.filesScanned + ' file(s).</p>';
  }
  const rows = prev.files
    .map(
      (f) => `<li class="replace-hit">
        <strong>${escapeHtml(f.name)}</strong> — ${f.count} match${f.count === 1 ? '' : 'es'}
        ${f.snippets?.length ? `<ul class="replace-snippets">${f.snippets.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      </li>`,
    )
    .join('');
  return `<div class="replace-results">
    <p class="replace-summary"><strong>${prev.totalMatches}</strong> match(es) in <strong>${prev.filesAffected}</strong> of ${prev.filesScanned} bhajan file(s).</p>
    <ul class="replace-list">${rows}</ul>
  </div>`;
}

function replaceFindLength(text) {
  return [...String(text || '').trim()].length;
}

function readReplaceForm() {
  state.replace.find = document.getElementById('rep-find')?.value ?? '';
  state.replace.replace = document.getElementById('rep-replace')?.value ?? '';
  state.replace.regex = Boolean(document.getElementById('rep-regex')?.checked);
  state.replace.caseInsensitive = Boolean(document.getElementById('rep-ci')?.checked);
}

function bindReplaceForm() {
  const clearErr = () => {
    if (state.error) {
      state.error = null;
      const banner = document.querySelector('.replace-main .err');
      if (banner) banner.remove();
    }
  };
  document.getElementById('rep-find')?.addEventListener('input', clearErr);
  document.getElementById('rep-replace')?.addEventListener('input', clearErr);
  document.getElementById('rep-regex')?.addEventListener('change', clearErr);
  document.getElementById('rep-ci')?.addEventListener('change', clearErr);
}

async function previewReplace() {
  readReplaceForm();
  state.error = null;
  if (replaceFindLength(state.replace.find) < 2) {
    state.error = 'Find text must be at least 2 characters (letters or marks).';
    render();
    return;
  }

  const ac = beginReplaceOp('preview');
  state.replace.preview = null;
  render();

  const payload = {
    find: state.replace.find,
    replace: state.replace.replace,
    regex: state.replace.regex,
    caseInsensitive: state.replace.caseInsensitive,
  };

  try {
    state.replace.progress.listing = true;
    render();
    const paths = await replaceListPaths(ac.signal);
    const total = paths.length;
    state.replace.progress.listing = false;
    state.replace.progress.total = total;
    render();

    const merged = { files: [], totalMatches: 0, filesScanned: 0, filesAffected: 0 };

    for (let i = 0; i < paths.length; i += REPLACE_BATCH) {
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const batch = paths.slice(i, i + REPLACE_BATCH);
      const data = await replaceScanBatch(batch, payload, ac.signal);
      merged.files.push(...(data.files || []));
      merged.totalMatches += data.totalMatches || 0;
      merged.filesScanned += data.filesScanned || batch.length;
      state.replace.progress.current = Math.min(i + REPLACE_BATCH, total);
      state.replace.progress.matches = merged.totalMatches;
      render();
    }

    merged.files.sort((a, b) => b.count - a.count);
    merged.filesAffected = merged.files.length;
    state.replace.preview = merged;
    endReplaceOp();
    state.error = null;
    render();
  } catch (e) {
    endReplaceOp();
    if (isReplaceAborted(e)) {
      if (!state.error) state.error = 'Search cancelled.';
    } else {
      state.error = e.message;
    }
    render();
  }
}

async function applyReplace() {
  readReplaceForm();
  const prev = state.replace.preview;
  if (!prev?.filesAffected) return;
  const msg =
    `Replace «${state.replace.find.slice(0, 60)}» in ${prev.filesAffected} file(s) (${prev.totalMatches} total)?\n\n` +
    'This commits each changed file to main.';
  if (!confirm(msg)) return;

  const ac = beginReplaceOp('apply');
  state.error = null;
  render();

  const payload = {
    find: state.replace.find,
    replace: state.replace.replace,
    regex: state.replace.regex,
    caseInsensitive: state.replace.caseInsensitive,
  };

  try {
    let paths = (prev.files || []).map((f) => f.path).filter(Boolean);
    if (!paths.length) {
      state.replace.progress.listing = true;
      render();
      paths = await replaceListPaths(ac.signal);
    }
    const total = paths.length;
    state.replace.progress.listing = false;
    state.replace.progress.total = total;
    render();

    let totalMatches = 0;
    let filesUpdated = 0;

    for (let i = 0; i < paths.length; i += REPLACE_BATCH) {
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const batch = paths.slice(i, i + REPLACE_BATCH);
      const data = await replaceApplyBatch(batch, payload, ac.signal);
      totalMatches += data.totalMatches || 0;
      filesUpdated += data.filesUpdated || 0;
      state.replace.progress.current = Math.min(i + REPLACE_BATCH, total);
      state.replace.progress.matches = totalMatches;
      state.replace.progress.updated = filesUpdated;
      render();
    }

    endReplaceOp();
    state.replace.preview = null;
    alert(
      `Done: ${totalMatches} replacement(s) in ${filesUpdated} file(s).\n\nGitHub Actions will rebuild the site.`,
    );
    render();
  } catch (e) {
    endReplaceOp();
    if (isReplaceAborted(e)) {
      if (!state.error) {
        state.error =
          'Apply cancelled. Files already committed in finished batches were not reverted.';
      }
    } else {
      state.error = e.message;
    }
    render();
  }
}

function topbar(title, back) {
  const backBtn =
    back === 'sections'
      ? '<button type="button" class="btn" data-back="sections">← Sections</button>'
      : back === 'bhajans'
        ? '<button type="button" class="btn" data-back="bhajans">← List</button>'
        : back === 'edit'
          ? '<button type="button" class="btn" data-back="edit">← Edit</button>'
          : '';
  return `<header class="topbar">
    ${backBtn}
    <h1>${escapeHtml(title)}</h1>
    <a class="btn" href="/api/auth/logout">Log out</a>
  </header>`;
}

function paraHtml(p, i) {
  return `<div class="para-row" data-i="${i}">
    <div class="para-row__head">
      <span class="para-row__num">${i + 1}</span>
      <select class="para-type" title="Paragraph type" aria-label="Paragraph ${i + 1} type">
        <option value="antara" ${p.type === 'antara' ? 'selected' : ''}>Antara</option>
        <option value="commentary" ${p.type === 'commentary' ? 'selected' : ''}>Commentary</option>
      </select>
      <div class="para-row__tools">
        <button type="button" class="btn btn-icon para-up" aria-label="Move up">↑</button>
        <button type="button" class="btn btn-icon para-down" aria-label="Move down">↓</button>
        <button type="button" class="btn btn-icon btn-danger para-del" aria-label="Delete">✕</button>
      </div>
    </div>
    <textarea class="para-text hi-field" lang="hi-IN" spellcheck="false" rows="3">${escapeHtml(p.text || '')}</textarea>
  </div>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function collectEditor() {
  syncEditorFromDom();
  return state.editor;
}

function bindEditor() {
  bindGroupField();
  bindTopbar();

  document.querySelectorAll('[data-para-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.paraMode;
      if (next === state.paraEditMode) return;
      syncEditorFromDom();
      state.paraEditMode = next;
      if (next === 'paste') {
        state.paraBulkDraft = paragraphsToBulkText(state.editor.lyrics.paragraphs);
      }
      render();
    });
  });

  document.getElementById('parse-paras-bulk')?.addEventListener('click', () => {
    syncEditorFromDom();
    state.paraEditMode = 'structured';
    state.paraBulkDraft = paragraphsToBulkText(state.editor.lyrics.paragraphs);
    render();
  });

  document.getElementById('add-antara')?.addEventListener('click', () => {
    syncEditorFromDom();
    state.paraEditMode = 'structured';
    state.editor.lyrics.paragraphs.push({ type: 'antara', text: '' });
    render();
  });
  document.getElementById('add-commentary')?.addEventListener('click', () => {
    syncEditorFromDom();
    state.paraEditMode = 'structured';
    state.editor.lyrics.paragraphs.push({ type: 'commentary', text: '' });
    render();
  });

  document.querySelectorAll('[data-show-optional]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncEditorFromDom();
      const key = btn.dataset.showOptional;
      if (key && key in state.editOptional) state.editOptional[key] = true;
      state.editPanel = 'more';
      render();
    });
  });

  document.querySelectorAll('[data-edit-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.editPanel;
      if (!next || next === state.editPanel) return;
      syncEditorFromDom();
      state.editPanel = next;
      render();
      if (next === 'preview') refreshPreview();
    });
  });

  document.getElementById('refresh-preview')?.addEventListener('click', () => refreshPreview());
  bindPreviewCardLinks();

  document.querySelectorAll('.para-row').forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector('.para-del')?.addEventListener('click', () => {
      syncEditorFromDom();
      state.editor.lyrics.paragraphs.splice(i, 1);
      if (!state.editor.lyrics.paragraphs.length) state.editor.lyrics.paragraphs.push({ type: 'antara', text: '' });
      render();
    });
    card.querySelector('.para-up')?.addEventListener('click', () => {
      if (i === 0) return;
      syncEditorFromDom();
      const arr = state.editor.lyrics.paragraphs;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      render();
    });
    card.querySelector('.para-down')?.addEventListener('click', () => {
      syncEditorFromDom();
      const arr = state.editor.lyrics.paragraphs;
      if (i >= arr.length - 1) return;
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      render();
    });
  });

  document.getElementById('save')?.addEventListener('click', () => commitPublish());
  document.getElementById('delete')?.addEventListener('click', deleteEditor);
  bindSpeechDictation(app);
  bindInlineSpellFields(app);
}

async function runPreviewRequest() {
  const ctx = previewListContext();
  const data = await api('/api/preview', {
    method: 'POST',
    body: JSON.stringify({
      editor: state.editor,
      sectionSlug: state.section?.slug,
      sectionTitle: state.section?.title,
      bhajanIndex: ctx.index,
      bhajanTotal: ctx.total,
    }),
  });
  state.previewHtml = data.html || '';
  state.previewBusy = false;
  render();
}

async function refreshPreview() {
  state.error = null;
  collectEditor();
  if (!state.editor?.title?.trim()) {
    state.error = 'Title is required for preview.';
    state.editPanel = 'basic';
    render();
    return;
  }

  state.previewHtml = null;
  state.previewBusy = true;
  render();

  try {
    await runPreviewRequest();
  } catch (e) {
    state.previewBusy = false;
    state.error = e.message;
    render();
  }
}

function editorTextsForSpell() {
  const e = state.editor;
  if (!e) return [];
  const L = e.lyrics || {};
  const texts = [
    { id: 'title', text: e.title || '' },
    { id: 'tarz', text: e.tarz || '' },
    { id: 'jabani', text: e.jabani || '' },
    { id: 'sthayi', text: L.sthayi || '' },
    { id: 'pre_shlok', text: L.pre_shlok || '' },
    { id: 'dhvani', text: L.dhvani || '' },
    { id: 'connect', text: L.sthayi_connect_text || '' },
  ];
  for (const p of L.paragraphs || []) texts.push({ id: 'para', text: p.text || '' });
  if (e.legacyLyricsText) texts.push({ id: 'legacy', text: e.legacyLyricsText });
  return texts;
}

async function commitPublish() {
  state.error = null;
  collectEditor();
  if (!state.editor?.title?.trim()) {
    state.error = 'Title is required before publishing.';
    state.editPanel = 'basic';
    render();
    return;
  }

  const btn = document.getElementById('save');
  if (btn) btn.disabled = true;

  try {
    try {
      const { totalIssues } = await spellCheckEditorFields(editorTextsForSpell());
      if (totalIssues > 0) {
        const ok = confirm(
          `Spell check: ${totalIssues} possible misspelling(s) (red underlines). Publish anyway?`,
        );
        if (!ok) {
          if (btn) btn.disabled = false;
          state.editPanel = 'preview';
          render();
          return;
        }
      }
    } catch {
      /* dictionary unavailable — publish allowed */
    }
    let res;
    if (state.path) {
      res = await api('/api/file', {
        method: 'PUT',
        body: JSON.stringify({
          path: state.path,
          sha: state.sha,
          editor: state.editor,
          message: `admin: update ${state.editor.title}`,
        }),
      });
    } else {
      res = await api('/api/file', {
        method: 'POST',
        body: JSON.stringify({
          section: state.section.slug,
          editor: state.editor,
          message: `admin: add ${state.editor.title}`,
        }),
      });
    }
    if (res?.path) {
      state.path = res.path;
      state.sha = res.sha;
    }
    const renameNote = res?.renamed
      ? `\n\nFile renamed to match title:\n${res.path.split('/').pop()}`
      : '';
    state.previewHtml = null;
    alert(`Published — GitHub Actions will rebuild the public site.${renameNote}`);
    if (state.section?.slug) {
      await loadBhajans(state.section.slug);
      location.hash = `#/s/${encodeURIComponent(state.section.slug)}`;
    } else {
      location.hash = '#/';
    }
  } catch (e) {
    state.error = e.message;
    if (btn) btn.disabled = false;
    render();
  }
}

async function deleteEditor() {
  if (!state.path || !confirm('Delete this bhajan?')) return;
  try {
    await api(`/api/file?path=${encodeURIComponent(state.path)}&sha=${encodeURIComponent(state.sha)}`, {
      method: 'DELETE',
    });
    if (state.section?.slug) {
      await loadBhajans(state.section.slug);
      location.hash = `#/s/${encodeURIComponent(state.section.slug)}`;
    } else {
      location.hash = '#/';
    }
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function loadBhajans(slug) {
  const data = await api(`/api/bhajans?section=${encodeURIComponent(slug)}`);
  state.bhajans = data.bhajans;
  state.section = data.section;
  state.groupOptions = data.groups || [];
}

async function loadEditorFromPath(path) {
  await ensureSectionForPath(path);
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  state.path = data.path;
  state.sha = data.sha;
  state.editor = data.editor;
  resetParagraphEditor();
  initEditOptionalFromEditor(state.editor);
}

async function openFile(path) {
  await loadEditorFromPath(path);
  state.view = 'edit';
  state.error = null;
  render();
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.login = me.login;
    const data = await api('/api/sections');
    state.sections = data.sections;
    state.view = 'loading';
    renderInner();
    await applyRouteFromHash();
  } catch {
    state.view = 'login';
    render();
  }
}

window.addEventListener('hashchange', () => {
  if (state.view === 'login' || state.view === 'loading') return;
  if (location.hash === lastSyncedRouteHash) return;
  const raw = (location.hash || '').replace(/^#/, '');
  // Public-site card anchors (#id-title) are not admin routes (#/…).
  if (raw && !raw.startsWith('/')) {
    if (scrollPreviewCardAnchor(raw)) {
      routeUseReplace = true;
      syncRouteFromState();
    }
    return;
  }
  applyRouteFromHash();
});

init();
