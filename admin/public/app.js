import { bindSpeechDictation, stopDictation, speechSupported } from './speech.js';
import { bindInlineSpellFields, spellCheckEditorFields, textsFromEditor } from './spellcheck.js';
import {
  runCorpusSpellScan,
  listSectionBhajanPaths,
  applyCorpusCorrection,
  ignoreCorpusWord,
  addCorpusWord,
  removeClusterFromReport,
} from './spell-errors.js';

const app = document.getElementById('app');

const state = {
  view: 'loading',
  login: null,
  sections: [],
  homeBanner: '',
  github: { owner: '', repo: '' },
  bannerPreviewTs: 0,
  bannerUploadBusy: false,
  section: null,
  bhajans: [],
  groupOptions: [],
  path: null,
  sha: null,
  editor: null,
  error: null,
  paraEditMode: 'paste',
  paraBulkDraft: null,
  editOptional: { preShlok: false, postShlok: false },
  previewHtml: null,
  previewBusy: false,
  saving: false,
  pageBusy: false,
  pageBusyMessage: '',
  sectionOrderBusy: false,
  editorBaseline: null,
  editPanel: 'basic',
  replace: {
    find: '',
    replace: '',
    regex: false,
    caseInsensitive: false,
    preview: null,
    selectedPaths: new Set(),
    busy: false,
    busyPhase: null,
    progress: null,
    abortCtrl: null,
  },
  spellCorpus: {
    scope: 'all',
    sectionSlug: null,
    sectionTitle: null,
    scanning: false,
    phase: '',
    progress: { current: 0, total: 0 },
    report: null,
    busyWord: null,
    abortCtrl: null,
  },
};

const HI_FIELD = 'class="hi-field" lang="hi-IN" spellcheck="false"';

const GROUP_OTHER = '__other__';

/** @type {string} last #/… hash written by syncRouteFromState */
let lastSyncedRouteHash = '';
let routeUseReplace = false;

function parseRouteFromHash(hash) {
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const qIdx = raw.indexOf('?');
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const q = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '');
  const parts = pathPart.split('/').filter(Boolean);

  if (!parts.length || parts[0] === '') return { view: 'sections' };
  if (parts[0] === 'replace') return { view: 'replace' };
  if (parts[0] === 'spell-errors') {
    if (parts[1] === 's' && parts[2]) {
      return { view: 'spell-errors', slug: decodeURIComponent(parts[2]) };
    }
    return { view: 'spell-errors' };
  }

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

function parseRouteHash() {
  return parseRouteFromHash(location.hash);
}

function loadingBlock(message, large = false) {
  const spinnerClass = large ? 'spinner spinner--lg' : 'spinner';
  return `<div class="loading-block" role="status" aria-live="polite"><span class="${spinnerClass}" aria-hidden="true"></span><p class="loading-block__text">${escapeHtml(message)}</p></div>`;
}

function pageBusyOverlayHtml() {
  if (!state.pageBusy) return '';
  return `<div class="page-busy">${loadingBlock(state.pageBusyMessage || 'Loading…', true)}</div>`;
}

/** Append overlay without replacing innerHTML (+= would drop click handlers). */
function attachPageBusyOverlay() {
  app.querySelector('.page-busy')?.remove();
  if (!state.pageBusy) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = pageBusyOverlayHtml();
  const overlay = tpl.content.firstElementChild;
  if (overlay) app.appendChild(overlay);
}

function setPageBusy(message) {
  state.pageBusy = true;
  state.pageBusyMessage = message || 'Loading…';
}

function clearPageBusy() {
  state.pageBusy = false;
  state.pageBusyMessage = '';
}

function editorSnapshot(editor) {
  const e = editor || {};
  const L = e.lyrics || {};
  return JSON.stringify({
    title: (e.title || '').trim(),
    tarz: (e.tarz || '').trim(),
    group: (e.group || '').trim(),
    legacyLyricsText: e.legacyLyricsText || '',
    lyrics: {
      sthayi: (L.sthayi || '').trim(),
      sthayi_connect: L.sthayi_connect,
      sthayi_connect_text: (L.sthayi_connect_text || '').trim(),
      pre_shlok: (L.pre_shlok || '').trim(),
      post_shlok: (L.post_shlok || '').trim(),
      paragraphs: (L.paragraphs || []).map((p) => ({
        type: p.type,
        text: p.text || '',
      })),
    },
  });
}

function markEditorSaved() {
  if (state.view === 'edit' && state.editor) {
    syncEditorFromDom();
    state.editorBaseline = editorSnapshot(state.editor);
  } else {
    state.editorBaseline = null;
  }
}

function isEditorDirty() {
  if (state.view !== 'edit' || !state.editor || state.editorBaseline == null) return false;
  syncEditorFromDom();
  return editorSnapshot(state.editor) !== state.editorBaseline;
}

function confirmLeaveEdit() {
  return confirm('You have unsaved changes. Leave without publishing?');
}

function isSameEditContext(route) {
  if (!route) return false;
  if (state.path) {
    if (route.view === 'edit' && route.path === state.path) return true;
    if (route.view === 'preview' && route.path === state.path) return true;
    return false;
  }
  if (route.view === 'edit-new' && route.slug === state.section?.slug) return true;
  return false;
}

function shouldConfirmLeave(targetRoute) {
  return state.view === 'edit' && isEditorDirty() && !isSameEditContext(targetRoute);
}

function navigateTo(hash) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  const targetRoute = parseRouteFromHash(normalized);
  if (shouldConfirmLeave(targetRoute) && !confirmLeaveEdit()) return false;
  location.hash = normalized;
  return true;
}

function buildRouteHash() {
  if (state.view === 'login' || state.view === 'loading') return '#/';
  if (state.view === 'sections') return '#/';
  if (state.view === 'replace') return '#/replace';
  if (state.view === 'spell-errors') {
    if (state.spellCorpus.scope === 'section' && state.spellCorpus.sectionSlug) {
      return `#/spell-errors/s/${encodeURIComponent(state.spellCorpus.sectionSlug)}`;
    }
    return '#/spell-errors';
  }
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
    state.replace.selectedPaths = new Set();
    state.view = 'replace';
    render();
    return;
  }

  if (route.view === 'spell-errors') {
    endSpellCorpusOp();
    state.error = null;
    if (route.slug) {
      const sec = state.sections.find((s) => s.slug === route.slug);
      state.spellCorpus.scope = 'section';
      state.spellCorpus.sectionSlug = route.slug;
      state.spellCorpus.sectionTitle = sec?.title || route.slug;
      if (sec) state.section = sec;
      setPageBusy('Loading section…');
      render();
      try {
        await loadBhajans(route.slug);
      } catch {
        /* back link still works via sectionSlug */
      } finally {
        clearPageBusy();
      }
    } else {
      state.spellCorpus.scope = 'all';
      state.spellCorpus.sectionSlug = null;
      state.spellCorpus.sectionTitle = null;
    }
    state.view = 'spell-errors';
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
    setPageBusy('Loading section…');
    render();
    try {
      await loadBhajans(route.slug);
      state.view = 'bhajans';
      state.error = null;
    } finally {
      clearPageBusy();
    }
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
    setPageBusy('Opening new bhajan…');
    render();
    try {
      await loadBhajans(route.slug);
      state.path = null;
      state.sha = null;
      state.editor = emptyEditor();
      resetParagraphEditor();
      initEditOptionalFromEditor(state.editor);
      state.view = 'edit';
      state.error = null;
      markEditorSaved();
    } finally {
      clearPageBusy();
    }
    render();
    return;
  }

  if (route.view === 'edit' && route.path) {
    setPageBusy('Loading bhajan…');
    render();
    try {
      await loadEditorFromPath(route.path);
      state.view = 'edit';
      state.error = null;
      markEditorSaved();
    } catch (e) {
      state.error = e.message;
      state.view = 'sections';
    } finally {
      clearPageBusy();
      render();
    }
    return;
  }

  if (route.view === 'preview' && route.path) {
    setPageBusy('Loading preview…');
    render();
    try {
      await loadEditorFromPath(route.path);
      state.view = 'edit';
      state.editPanel = 'preview';
      state.error = null;
      markEditorSaved();
      clearPageBusy();
      render();
      await refreshPreview();
    } catch (e) {
      state.previewBusy = false;
      state.error = e.message;
      state.view = 'sections';
      clearPageBusy();
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
    lyrics: {
      sthayi: '',
      sthayi_connect_text: '',
      pre_shlok: '',
      post_shlok: '',
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
      <div class="spell-corpus-progress__row"><span class="spinner" aria-hidden="true"></span><p class="replace-progress-label">${escapeHtml(phase === 'apply' ? 'Preparing apply…' : 'Loading file list…')}</p></div>
      <div class="replace-progress-track" aria-hidden="true"><div class="replace-progress-fill replace-progress-fill--pulse"></div></div>
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

function assetPreviewUrl(relPath) {
  const p = String(relPath || '').trim();
  const { owner, repo } = state.github || {};
  if (!p || !owner || !repo) return '';
  const t = state.bannerPreviewTs || 0;
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${p}${t ? `?t=${t}` : ''}`;
}

const BANNER_MAX_BYTES = 3 * 1024 * 1024;

function bannerUploadPanelHtml({ inputId, label, iconPath, thumbPath, menuPath, busy }) {
  const iconUrl = assetPreviewUrl(iconPath);
  const thumbUrl = assetPreviewUrl(thumbPath);
  const menuUrl = assetPreviewUrl(menuPath);
  return `<div class="banner-upload">
    <h3 class="banner-upload__title">${escapeHtml(label)}</h3>
    <div class="banner-upload__previews">
      <figure class="banner-upload__fig">
        <figcaption>Hero / PDF</figcaption>
        ${iconUrl ? `<img class="banner-upload__hero" src="${escapeAttr(iconUrl)}" alt="">` : '<p class="hint">No image yet</p>'}
      </figure>
      <figure class="banner-upload__fig">
        <figcaption>Landing tile</figcaption>
        ${thumbUrl ? `<img class="banner-upload__thumb" src="${escapeAttr(thumbUrl)}" alt="">` : '<p class="hint">—</p>'}
      </figure>
      <figure class="banner-upload__fig">
        <figcaption>Menu icon</figcaption>
        ${menuUrl ? `<img class="banner-upload__menu" src="${escapeAttr(menuUrl)}" alt="">` : '<p class="hint">—</p>'}
      </figure>
    </div>
    <label class="btn ${busy ? '' : 'btn-primary'} banner-upload__pick">
      ${busy ? '<span class="spinner" aria-hidden="true"></span> Uploading…' : 'Update image'}
      <input type="file" id="${inputId}" accept="image/jpeg,image/png,image/webp,image/gif" class="banner-upload__input" ${busy ? 'disabled' : ''}>
    </label>
    <p class="hint banner-upload__hint">Any photo (max 3 MB) — resized to 704×1522 (hero &amp; PDF), landing tile 352×761, menu 40×40. Commits to <code>main</code>.</p>
  </div>`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function uploadBannerForTarget(target, file) {
  if (!file || state.bannerUploadBusy) return;
  if (file.size > 12 * 1024 * 1024) {
    state.error = 'Image too large (max 12 MB).';
    render();
    return;
  }

  state.bannerUploadBusy = true;
  state.error = null;
  render();

  try {
    const image = await fileToBase64(file);
    await api('/api/banner-upload', {
      method: 'POST',
      body: JSON.stringify({ target, image }),
    });
    const data = await api('/api/sections');
    state.sections = data.sections;
    state.homeBanner = data.home_banner || '';
    state.github = data.github || state.github;
    state.bannerPreviewTs = Date.now();
    if (target !== 'home' && state.section?.slug === target) {
      const sec = data.sections.find((s) => s.slug === target);
      if (sec) {
        state.section = { ...state.section, ...sec };
      }
      await loadBhajans(target);
    }
    state.bannerUploadBusy = false;
    render();
  } catch (e) {
    state.bannerUploadBusy = false;
    state.error = e.message;
    render();
  }
}

function bindBannerUpload(inputId, target) {
  document.getElementById(inputId)?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadBannerForTarget(target, file);
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
  const L = e.lyrics;
  const sthayiEl = document.getElementById('f-sthayi');
  if (sthayiEl) L.sthayi = sthayiEl.value.trim();
  const connectOff = document.getElementById('f-connect-off');
  if (connectOff) L.sthayi_connect = connectOff.checked ? false : undefined;
  const connectTextEl = document.getElementById('f-connect-text');
  if (connectTextEl) L.sthayi_connect_text = connectTextEl.value.trim();
  const preEl = document.getElementById('f-pre-shlok');
  if (preEl) L.pre_shlok = preEl.value.trim();
  const postEl = document.getElementById('f-post-shlok');
  if (postEl) L.post_shlok = postEl.value.trim();
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
    postShlok: Boolean((L.post_shlok || '').trim()),
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
    state.editOptional.postShlok;
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
  if (o.postShlok) {
    blocks.push(`<div class="lyrics-block">
      <h3>Post shlok</h3>
      <textarea id="f-post-shlok" class="hi-field" lang="hi-IN" rows="4">${escapeHtml(L.post_shlok)}</textarea>
    </div>`);
  }
  const adds = [];
  if (!o.preShlok) {
    adds.push(
      '<button type="button" class="btn btn-add-optional" data-show-optional="preShlok">+ Opening shloka</button>',
    );
  }
  if (!o.postShlok) {
    adds.push(
      '<button type="button" class="btn btn-add-optional" data-show-optional="postShlok">+ Post shlok</button>',
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
    return loadingBlock('Building preview…');
  }
  if (state.previewHtml) {
    return `<div class="preview-site preview-site--section">${state.previewHtml}</div>
      <button type="button" class="btn" id="refresh-preview" style="margin-top:0.65rem">Refresh preview</button>`;
  }
  return loadingBlock('Building preview…');
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
  document.querySelector('[data-nav-home]')?.addEventListener('click', () => {
    if (opts.abortReplaceOnLeave) state.replace.abortCtrl?.abort();
    if (opts.abortSpellOnLeave) state.spellCorpus.abortCtrl?.abort();
    if (state.view === 'replace') endReplaceOp();
    if (state.view === 'spell-errors') endSpellCorpusOp();
    state.error = null;
    navigateTo('#/');
  });
  document.querySelector('[data-back="sections"]')?.addEventListener('click', () => {
    if (opts.abortReplaceOnLeave) state.replace.abortCtrl?.abort();
    if (opts.abortSpellOnLeave) state.spellCorpus.abortCtrl?.abort();
    if (state.view === 'replace') endReplaceOp();
    if (state.view === 'spell-errors') endSpellCorpusOp();
    state.error = null;
    navigateTo('#/');
  });
  document.querySelector('[data-back="bhajans"]')?.addEventListener('click', () => {
    if (opts.abortReplaceOnLeave) state.replace.abortCtrl?.abort();
    if (opts.abortSpellOnLeave) state.spellCorpus.abortCtrl?.abort();
    state.error = null;
    const slug = state.section?.slug || state.spellCorpus.sectionSlug;
    if (slug) navigateTo(`#/s/${encodeURIComponent(slug)}`);
    else navigateTo('#/');
  });
  document.querySelector('[data-back="edit"]')?.addEventListener('click', () => {
    state.error = null;
    state.previewHtml = null;
    state.previewBusy = false;
    state.editPanel = 'basic';
    if (state.path) navigateTo(`#/edit?p=${encodeURIComponent(state.path)}`);
    else if (state.section?.slug) navigateTo(`#/s/${encodeURIComponent(state.section.slug)}/new`);
    else navigateTo('#/');
  });
}

function renderInner() {
  stopDictation();
  const showPreviewCss = state.view === 'edit' && state.editPanel === 'preview';
  setPreviewStylesheet(showPreviewCss);
  if (state.view === 'sections') {
    state.error = null;
  }
  if (state.view === 'loading') {
    app.innerHTML = loadingBlock('Loading…', true);
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
    const homeIcon = state.homeBanner || 'assets/icons/LandingPage.jpg';
    app.innerHTML = `
      ${topbar('Sections', '')}
      <main>
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        ${bannerUploadPanelHtml({
          inputId: 'banner-upload-home',
          label: 'Landing page image',
          iconPath: homeIcon,
          thumbPath: 'assets/banners/home.jpg',
          menuPath: 'assets/menu/home.jpg',
          busy: state.bannerUploadBusy,
        })}
        <p class="hint">Choose a section to edit bhajans. Saves are committed to <code>main</code>.</p>
        <label for="section-pick">Section</label>
        <select id="section-pick" class="section-pick">${options}</select>
        <button type="button" class="btn btn-primary" id="open-section" style="width:100%;margin-top:0.65rem">Open section</button>
        <button type="button" class="btn" id="go-replace" style="width:100%;margin-top:0.5rem">Find &amp; replace (all YAML)</button>
        <button type="button" class="btn" id="go-spell-errors" style="width:100%;margin-top:0.5rem">Spell errors (all bhajans)</button>
      </main>`;
    document.getElementById('open-section').addEventListener('click', () => {
      const slug = document.getElementById('section-pick').value;
      if (slug) navigateTo(`#/s/${encodeURIComponent(slug)}`);
    });
    document.getElementById('go-replace').addEventListener('click', () => {
      navigateTo('#/replace');
    });
    document.getElementById('go-spell-errors')?.addEventListener('click', () => {
      navigateTo('#/spell-errors');
    });
    bindTopbar();
    bindBannerUpload('banner-upload-home', 'home');
    attachPageBusyOverlay();
    return;
  }

  if (state.view === 'spell-errors') {
    const spellTitle =
      state.spellCorpus.scope === 'section' && state.spellCorpus.sectionTitle
        ? `Spell errors — ${state.spellCorpus.sectionTitle}`
        : 'Spell errors (all)';
    const spellBack = state.spellCorpus.scope === 'section' ? 'bhajans' : 'sections';
    app.innerHTML = `
      ${topbar(spellTitle, spellBack)}
      <main class="spell-corpus-main">
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        ${renderSpellCorpusBody()}
      </main>`;
    bindTopbar({ abortSpellOnLeave: state.spellCorpus.scanning });
    bindSpellCorpusView();
    attachPageBusyOverlay();
    return;
  }

  if (state.view === 'replace') {
    const r = state.replace;
    const prev = r.preview;
    const busy = r.busy;
    const disabled = busy ? 'disabled' : '';
    const previewLabel =
      busy && r.busyPhase === 'preview' ? 'Searching…' : 'Preview matches';
    const selectedCount = r.selectedPaths?.size ?? 0;
    const applyAllLabel =
      busy && r.busyPhase === 'apply' ? 'Applying…' : `Apply all (${prev?.filesAffected || 0})`;
    const applySelLabel =
      busy && r.busyPhase === 'apply'
        ? 'Applying…'
        : `Apply selected (${selectedCount})`;
    app.innerHTML = `
      ${topbar('Find & replace', 'sections')}
      <main class="replace-main">
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <p class="hint">Search and replace across bhajan YAML under <code>content/</code>. Preview matches, tick the bhajans you want, then <strong>Apply all</strong> or <strong>Apply selected</strong>. Each changed file gets its own commit on <code>main</code>.</p>
        <label for="rep-find">Find</label>
        <textarea id="rep-find" class="replace-field" rows="3" ${disabled} placeholder="Text to find (min. 2 characters)">${escapeHtml(r.find)}</textarea>
        <label for="rep-replace">Replace with</label>
        <textarea id="rep-replace" class="replace-field" rows="3" ${disabled} placeholder="Leave empty to delete matches">${escapeHtml(r.replace)}</textarea>
        <div class="check-row"><input type="checkbox" id="rep-regex" ${r.regex ? 'checked' : ''} ${disabled}><label for="rep-regex">Regular expression</label></div>
        <div class="check-row"><input type="checkbox" id="rep-ci" ${r.caseInsensitive ? 'checked' : ''} ${disabled}><label for="rep-ci">Case insensitive</label></div>
        ${busy ? replaceProgressHtml(r) : ''}
        <div class="replace-actions">
          <button type="button" class="btn btn-primary" id="rep-preview" ${busy ? 'disabled' : ''}>${previewLabel}</button>
          <button type="button" class="btn" id="rep-apply-all" ${busy || !prev?.filesAffected ? 'disabled' : ''}>${applyAllLabel}</button>
          <button type="button" class="btn" id="rep-apply-selected" ${busy || !prev?.filesAffected || selectedCount === 0 ? 'disabled' : ''}>${applySelLabel}</button>
          ${busy ? '<button type="button" class="btn btn-danger" id="rep-cancel">Cancel</button>' : ''}
        </div>
        ${prev && !busy ? renderReplacePreview(prev) : ''}
      </main>`;
    bindTopbar({ abortReplaceOnLeave: busy });
    document.getElementById('rep-preview')?.addEventListener('click', previewReplace);
    document.getElementById('rep-apply-all')?.addEventListener('click', () => applyReplace('all'));
    document.getElementById('rep-apply-selected')?.addEventListener('click', () => applyReplace('selected'));
    document.getElementById('rep-cancel')?.addEventListener('click', cancelReplaceOp);
    bindReplaceForm();
    bindReplacePreview();
    attachPageBusyOverlay();
    return;
  }

  if (state.view === 'bhajans') {
    const bhajanOrder = state.section?.bhajan_order === 'file' ? 'file' : 'title';
    const orderBusy = state.sectionOrderBusy;
    const secSlug = state.section?.slug || '';
    const secIcon = state.section?.banner || `assets/icons/${secSlug}.jpg`;
    const secThumb = secSlug ? `assets/banners/${secSlug}.jpg` : '';
    app.innerHTML = `
      ${topbar(state.section.title, 'sections')}
      <main>
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        ${bannerUploadPanelHtml({
          inputId: 'banner-upload-section',
          label: 'Section banner image',
          iconPath: secIcon,
          thumbPath: secThumb,
          menuPath: secSlug ? `assets/menu/${secSlug}.jpg` : '',
          busy: state.bannerUploadBusy,
        })}
        <div class="section-order-bar">
          <label for="section-bhajan-order">Bhajan index on site</label>
          <div class="section-order-bar__row">
            <select id="section-bhajan-order" class="section-order-pick" ${orderBusy ? 'disabled' : ''}>
              <option value="title" ${bhajanOrder === 'title' ? 'selected' : ''}>Title order (देवनागरी)</option>
              <option value="file" ${bhajanOrder === 'file' ? 'selected' : ''}>Filename order (001-, 002-…)</option>
            </select>
            ${orderBusy ? '<span class="spinner" aria-hidden="true"></span>' : ''}
          </div>
          <p class="hint section-order-hint">Controls numbering on the public section page. Rebuild deploys after commit to <code>main</code>.</p>
        </div>
        <button type="button" class="btn btn-primary" id="add-bhajan" style="width:100%;margin-bottom:0.75rem">+ New bhajan</button>
        <button type="button" class="btn" id="go-spell-section" style="width:100%;margin-bottom:0.75rem">Spell errors (this section)</button>
        ${state.bhajans.map((b) => `
          <div class="bhajan-item">
            <a class="list-btn" href="#/edit?p=${encodeURIComponent(b.path)}">${escapeHtml(bhajanDisplayName(b))}</a>
          </div>`).join('') || '<p class="hint">No bhajans in this section yet.</p>'}
      </main>`;
    bindTopbar();
    document.getElementById('add-bhajan').addEventListener('click', () => {
      if (!state.section?.slug) return;
      navigateTo(`#/s/${encodeURIComponent(state.section.slug)}/new`);
    });
    document.getElementById('go-spell-section')?.addEventListener('click', () => {
      if (!state.section?.slug) return;
      navigateTo(`#/spell-errors/s/${encodeURIComponent(state.section.slug)}`);
    });
    document.getElementById('section-bhajan-order')?.addEventListener('change', (e) => {
      saveSectionBhajanOrder(e.target.value);
    });
    bindBannerUpload('banner-upload-section', secSlug);
    attachPageBusyOverlay();
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
              <p class="hint">Optional opening or post shlok.</p>
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
          ${state.editPanel === 'preview' ? publishBtnHtml() : ''}
          ${state.path ? '<button type="button" class="btn btn-danger" id="delete">Delete</button>' : ''}
        </div>
      </main>`;
    bindEditor();
    attachPageBusyOverlay();
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

function replaceSelectedPaths() {
  return state.replace.selectedPaths || new Set();
}

function replacePathsForMode(mode) {
  const prev = state.replace.preview;
  if (!prev?.files?.length) return [];
  const allPaths = prev.files.map((f) => f.path).filter(Boolean);
  if (mode === 'all') return allPaths;
  const selected = replaceSelectedPaths();
  return allPaths.filter((p) => selected.has(p));
}

function replaceMatchStats(paths) {
  const prev = state.replace.preview;
  const set = new Set(paths);
  const files = (prev?.files || []).filter((f) => set.has(f.path));
  return {
    filesAffected: files.length,
    totalMatches: files.reduce((n, f) => n + (f.count || 0), 0),
  };
}

function renderReplacePreview(prev) {
  if (!prev.filesAffected) {
    return '<p class="hint replace-summary">No matches in ' + prev.filesScanned + ' file(s).</p>';
  }
  const selected = replaceSelectedPaths();
  const rows = prev.files
    .map((f) => {
      const checked = selected.has(f.path);
      return `<li class="replace-hit">
        <label class="replace-hit__pick">
          <input type="checkbox" class="rep-pick" data-path="${escapeAttr(f.path)}" ${checked ? 'checked' : ''}>
          <span class="replace-hit__label"><strong>${escapeHtml(f.name)}</strong> — ${f.count} match${f.count === 1 ? '' : 'es'}</span>
        </label>
        ${f.snippets?.length ? `<ul class="replace-snippets">${f.snippets.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      </li>`;
    })
    .join('');
  return `<div class="replace-results">
    <p class="replace-summary"><strong>${prev.totalMatches}</strong> match(es) in <strong>${prev.filesAffected}</strong> of ${prev.filesScanned} bhajan file(s).</p>
    <div class="replace-pick-actions">
      <button type="button" class="btn" id="rep-select-all">Select all</button>
      <button type="button" class="btn" id="rep-select-none">Select none</button>
    </div>
    <ul class="replace-list">${rows}</ul>
  </div>`;
}

function syncReplaceSelectionFromDom() {
  const selected = new Set();
  document.querySelectorAll('.rep-pick:checked').forEach((el) => {
    const p = el.dataset.path;
    if (p) selected.add(p);
  });
  state.replace.selectedPaths = selected;
}

function updateReplaceApplyButtons() {
  const selectedCount = replaceSelectedPaths().size;
  const prev = state.replace.preview;
  const applySel = document.getElementById('rep-apply-selected');
  const applyAll = document.getElementById('rep-apply-all');
  if (applySel) {
    applySel.disabled =
      state.replace.busy || !prev?.filesAffected || selectedCount === 0;
    if (!state.replace.busy) {
      applySel.textContent = `Apply selected (${selectedCount})`;
    }
  }
  if (applyAll && !state.replace.busy && prev?.filesAffected) {
    applyAll.textContent = `Apply all (${prev.filesAffected})`;
  }
}

function bindReplacePreview() {
  document.getElementById('rep-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.rep-pick').forEach((el) => {
      el.checked = true;
    });
    syncReplaceSelectionFromDom();
    updateReplaceApplyButtons();
  });
  document.getElementById('rep-select-none')?.addEventListener('click', () => {
    document.querySelectorAll('.rep-pick').forEach((el) => {
      el.checked = false;
    });
    syncReplaceSelectionFromDom();
    updateReplaceApplyButtons();
  });
  document.querySelectorAll('.rep-pick').forEach((el) => {
    el.addEventListener('change', () => {
      syncReplaceSelectionFromDom();
      updateReplaceApplyButtons();
    });
  });
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
  state.replace.selectedPaths = new Set();
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
    state.replace.selectedPaths = new Set(merged.files.map((f) => f.path).filter(Boolean));
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

async function applyReplace(mode = 'all') {
  readReplaceForm();
  syncReplaceSelectionFromDom();
  const prev = state.replace.preview;
  if (!prev?.filesAffected) return;

  const paths = replacePathsForMode(mode);
  if (!paths.length) {
    state.error = mode === 'selected' ? 'Select at least one bhajan.' : 'No files to update.';
    render();
    return;
  }

  const { filesAffected, totalMatches } = replaceMatchStats(paths);
  const scope =
    mode === 'selected'
      ? `${filesAffected} selected bhajan(s)`
      : `all ${filesAffected} matching bhajan(s)`;
  const msg =
    `Replace «${state.replace.find.slice(0, 60)}» in ${scope} (${totalMatches} match${totalMatches === 1 ? '' : 'es'})?\n\n` +
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
    const total = paths.length;
    state.replace.progress.total = total;
    render();

    let appliedMatches = 0;
    let filesUpdated = 0;

    for (let i = 0; i < paths.length; i += REPLACE_BATCH) {
      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const batch = paths.slice(i, i + REPLACE_BATCH);
      const data = await replaceApplyBatch(batch, payload, ac.signal);
      appliedMatches += data.totalMatches || 0;
      filesUpdated += data.filesUpdated || 0;
      state.replace.progress.current = Math.min(i + REPLACE_BATCH, total);
      state.replace.progress.matches = appliedMatches;
      state.replace.progress.updated = filesUpdated;
      render();
    }

    endReplaceOp();
    state.replace.preview = null;
    state.replace.selectedPaths = new Set();
    alert(
      `Done: ${appliedMatches} replacement(s) in ${filesUpdated} file(s).\n\nGitHub Actions will rebuild the site.`,
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
    <button type="button" class="topbar-home" data-nav-home aria-label="Sections home" title="Home">
      <img src="/favicon-32.png" alt="" width="24" height="24">
    </button>
    ${backBtn}
    <h1>${escapeHtml(title)}</h1>
    <a class="btn" href="/api/auth/logout">Log out</a>
  </header>`;
}

function publishBtnHtml() {
  if (state.saving) {
    return '<button type="button" class="btn btn-primary" id="save" disabled><span class="spinner" aria-hidden="true"></span> Publishing…</button>';
  }
  return '<button type="button" class="btn btn-primary" id="save">Publish</button>';
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

function endSpellCorpusOp() {
  state.spellCorpus.abortCtrl?.abort();
  state.spellCorpus.abortCtrl = null;
  state.spellCorpus.scanning = false;
  state.spellCorpus.busyWord = null;
}

function spellCorpusProgressLabel(sc) {
  const { phase, progress } = sc;
  const { current, total } = progress;
  if (phase === 'corpus') {
    return current
      ? `Loading bhajan word list… (${current}s)`
      : 'Loading bhajan word list…';
  }
  if (phase === 'dict') {
    return current
      ? `Loading Hindi + Sanskrit dictionaries… (${current}s — first time may take 1–2 min)`
      : 'Loading Hindi + Sanskrit dictionaries… (first time may take 1–2 min)';
  }
  if (phase === 'list') return 'Listing bhajan files…';
  if (phase === 'load') return `Loading bhajan text from GitHub… ${current}/${total}`;
  if (phase === 'tokenize') return 'Collecting words from all bhajans…';
  if (phase === 'words') {
    return total
      ? `Spell-checking unique words… ${current}/${total}`
      : 'Spell-checking unique words…';
  }
  if (phase === 'spell') return `Building error list… ${current}/${total}`;
  return `Working… (${phase || 'unknown'})`;
}

function renderSpellCorpusBody() {
  const sc = state.spellCorpus;
  if (sc.scanning) {
    const p = sc.progress;
    const indeterminate =
      sc.phase === 'corpus' || sc.phase === 'dict' || sc.phase === 'list' || sc.phase === 'tokenize';
    const pct = indeterminate ? 0 : p.total ? Math.round((p.current / p.total) * 100) : 0;
    const barClass = indeterminate
      ? 'spell-corpus-progress__bar spell-corpus-progress__bar--indeterminate'
      : 'spell-corpus-progress__bar';
    return `<div class="spell-corpus-progress__row"><span class="spinner" aria-hidden="true"></span><p class="loading-block__text">${escapeHtml(spellCorpusProgressLabel(sc))}</p></div>
      <div class="spell-corpus-progress${indeterminate ? ' spell-corpus-progress--indeterminate' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="${barClass}" style="width:${indeterminate ? '40%' : `${pct}%`}"></div>
      </div>
      <button type="button" class="btn btn-danger" id="spell-corpus-cancel">Cancel</button>`;
  }
  const sectionScope = sc.scope === 'section' && sc.sectionTitle;
  const scanPrimaryLabel = sectionScope
    ? `Scan ${sc.sectionTitle}`
    : 'Scan all bhajans';
  const actions = `<div class="spell-corpus-actions">
    <button type="button" class="btn btn-primary" id="spell-corpus-scan">${escapeHtml(scanPrimaryLabel)}</button>
    ${sectionScope ? '<button type="button" class="btn" id="spell-corpus-scan-all">Scan all bhajans</button>' : ''}
  </div>`;
  const report = sc.report;
  if (!report) {
    const hint = sectionScope
      ? `Tap <strong>${escapeHtml(scanPrimaryLabel)}</strong> to check only this section, or <strong>Scan all bhajans</strong>. Uses the published word list first, then Hindi + Sanskrit Hunspell.`
      : 'Tap <strong>Scan all bhajans</strong>. Uses the published bhajan word list first, then Hindi + Sanskrit Hunspell. Only flags words <em>not</em> in the sangrah that have plausible typo fixes.';
    return `${actions}<p class="hint">${hint} Use Cancel anytime.</p>`;
  }
  if (!report.clusters.length) {
    const corpusNote = report.corpusWords
      ? ` (${report.corpusWords.toLocaleString()} corpus words accepted)`
      : '';
    return `${actions}<p class="spell-ok">No likely typos in ${report.filesScanned} bhajan(s)${corpusNote}.</p>`;
  }
  const rows = report.clusters
    .map((c) => {
      const busy = sc.busyWord === c.word;
      const sugOpts = (c.suggestions || [])
        .map(
          (s) =>
            `<option value="${escapeAttr(s)}"${c.suggestions[0] === s ? ' selected' : ''}>${escapeHtml(s)}</option>`,
        )
        .join('');
      const pathRows = c.paths
        .map((p) => {
          const fields = p.fields.map((f) => `${escapeHtml(f.field)} (${f.count})`).join(', ');
          return `<li class="spell-corpus-hit">
            <a href="#/edit?p=${encodeURIComponent(p.path)}">${escapeHtml(p.title)}</a>
            <span class="spell-corpus-hit__meta">${fields}</span>
          </li>`;
        })
        .join('');
      return `<article class="spell-corpus-cluster" data-word="${escapeAttr(c.word)}">
        <header class="spell-corpus-cluster__head">
          <h3 class="spell-corpus-cluster__word">${escapeHtml(c.word)}</h3>
          <span class="spell-corpus-cluster__count">${c.count} use${c.count === 1 ? '' : 's'}</span>
        </header>
        <div class="spell-corpus-cluster__actions">
          <label class="spell-corpus-sug-label">Correct to
            <select class="spell-corpus-sug" data-word="${escapeAttr(c.word)}" ${busy ? 'disabled' : ''}>
              ${sugOpts || '<option value="">—</option>'}
            </select>
          </label>
          <button type="button" class="btn btn-primary spell-corpus-fix" data-word="${escapeAttr(c.word)}" ${busy || !c.suggestions?.length ? 'disabled' : ''}>Correct all</button>
          <button type="button" class="btn spell-corpus-ignore" data-word="${escapeAttr(c.word)}" ${busy ? 'disabled' : ''}>Ignore all</button>
          <button type="button" class="btn spell-corpus-add" data-word="${escapeAttr(c.word)}" ${busy ? 'disabled' : ''}>Add all</button>
        </div>
        <ul class="spell-corpus-paths">${pathRows}</ul>
      </article>`;
    })
    .join('');
  return `${actions}
    <p class="spell-corpus-summary"><strong>${report.clusters.length}</strong> unknown word(s), <strong>${report.totalOccurrences}</strong> occurrence(s) in <strong>${report.filesScanned}</strong> bhajan file(s).</p>
    <div class="spell-corpus-list">${rows}</div>`;
}

function bindSpellCorpusView() {
  document.getElementById('spell-corpus-scan')?.addEventListener('click', () => startSpellCorpusScan('current'));
  document.getElementById('spell-corpus-scan-all')?.addEventListener('click', () => startSpellCorpusScan('all'));
  document.getElementById('spell-corpus-cancel')?.addEventListener('click', () => {
    state.spellCorpus.abortCtrl?.abort();
    endSpellCorpusOp();
    state.error = 'Scan cancelled.';
    render();
  });

  document.querySelectorAll('.spell-corpus-ignore').forEach((btn) => {
    btn.addEventListener('click', () => {
      const word = btn.dataset.word;
      if (!word) return;
      ignoreCorpusWord(word);
      state.spellCorpus.report = removeClusterFromReport(state.spellCorpus.report, word);
      render();
    });
  });

  document.querySelectorAll('.spell-corpus-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const word = btn.dataset.word;
      if (!word) return;
      addCorpusWord(word);
      state.spellCorpus.report = removeClusterFromReport(state.spellCorpus.report, word);
      render();
    });
  });

  document.querySelectorAll('.spell-corpus-fix').forEach((btn) => {
    btn.addEventListener('click', () => corpusCorrectWord(btn.dataset.word));
  });
}

async function startSpellCorpusScan(scanMode = 'current') {
  endSpellCorpusOp();
  state.error = null;
  state.spellCorpus.scanning = true;
  state.spellCorpus.phase = 'list';
  state.spellCorpus.progress = { current: 0, total: 0 };
  state.spellCorpus.report = null;
  state.spellCorpus.abortCtrl = new AbortController();
  render();

  try {
    let pathsOnly;
    if (scanMode === 'all') {
      state.spellCorpus.scope = 'all';
      state.spellCorpus.sectionSlug = null;
      state.spellCorpus.sectionTitle = null;
      pathsOnly = null;
    } else if (state.spellCorpus.scope === 'section' && state.spellCorpus.sectionSlug) {
      pathsOnly = await listSectionBhajanPaths(
        api,
        state.spellCorpus.sectionSlug,
        state.spellCorpus.abortCtrl.signal,
      );
    } else {
      pathsOnly = null;
    }

    const report = await runCorpusSpellScan(api, {
      signal: state.spellCorpus.abortCtrl.signal,
      paths: pathsOnly,
      onProgress: (current, total, phase) => {
        if (phase) state.spellCorpus.phase = phase;
        state.spellCorpus.progress = { current, total };
        render();
      },
    });
    endSpellCorpusOp();
    state.spellCorpus.report = report;
    render();
  } catch (e) {
    endSpellCorpusOp();
    if (e.name === 'AbortError') {
      if (!state.error) state.error = 'Scan cancelled.';
    } else {
      state.error = e.message;
    }
    render();
  }
}

async function corpusCorrectWord(word) {
  const cluster = state.spellCorpus.report?.clusters?.find((c) => c.word === word);
  if (!cluster) return;
  const article = [...document.querySelectorAll('.spell-corpus-cluster')].find(
    (el) => el.dataset.word === word,
  );
  const sel = article?.querySelector('.spell-corpus-sug');
  const replacement = sel?.value?.trim();
  if (!replacement) {
    state.error = 'Choose a suggestion first.';
    render();
    return;
  }
  const paths = cluster.paths.map((p) => p.path);
  const msg = `Replace «${word}» with «${replacement}» in ${paths.length} file(s) (${cluster.count} occurrence(s))?`;
  if (!confirm(msg)) return;

  state.spellCorpus.busyWord = word;
  state.error = null;
  render();
  try {
    await applyCorpusCorrection(api, word, replacement, paths);
    state.spellCorpus.report = removeClusterFromReport(state.spellCorpus.report, word);
    state.spellCorpus.busyWord = null;
    alert(`Updated ${paths.length} file(s) on main.`);
    render();
  } catch (e) {
    state.spellCorpus.busyWord = null;
    state.error = e.message;
    render();
  }
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

  state.saving = true;
  render();

  try {
    try {
      const { totalIssues } = await spellCheckEditorFields(textsFromEditor(state.editor));
      if (totalIssues > 0) {
        const ok = confirm(
          `Spell check: ${totalIssues} possible misspelling(s) (red underlines). Publish anyway?`,
        );
        if (!ok) {
          state.saving = false;
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
    state.saving = false;
    markEditorSaved();
    alert(`Published — GitHub Actions will rebuild the public site.${renameNote}`);
    if (state.section?.slug) {
      await loadBhajans(state.section.slug);
      navigateTo(`#/s/${encodeURIComponent(state.section.slug)}`);
    } else {
      navigateTo('#/');
    }
  } catch (e) {
    state.error = e.message;
    state.saving = false;
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
      navigateTo(`#/s/${encodeURIComponent(state.section.slug)}`);
    } else {
      navigateTo('#/');
    }
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function loadBhajans(slug) {
  const data = await api(`/api/bhajans?section=${encodeURIComponent(slug)}`);
  state.bhajans = data.bhajans;
  const order = data.section?.bhajan_order === 'file' ? 'file' : 'title';
  state.section = { ...data.section, bhajan_order: order };
  state.groupOptions = data.groups || [];
  const i = state.sections.findIndex((s) => s.slug === slug);
  if (i >= 0) state.sections[i] = { ...state.sections[i], bhajan_order: order };
}

async function saveSectionBhajanOrder(order) {
  if (!state.section?.slug || state.sectionOrderBusy) return;
  const next = order === 'file' ? 'file' : 'title';
  if (state.section.bhajan_order === next) return;

  state.sectionOrderBusy = true;
  state.error = null;
  render();

  try {
    const data = await api('/api/section-settings', {
      method: 'PATCH',
      body: JSON.stringify({ slug: state.section.slug, bhajan_order: next }),
    });
    state.section = { ...state.section, ...data.section, bhajan_order: next };
    const i = state.sections.findIndex((s) => s.slug === state.section.slug);
    if (i >= 0) state.sections[i] = { ...state.sections[i], bhajan_order: next };
    await loadBhajans(state.section.slug);
    state.sectionOrderBusy = false;
    render();
  } catch (e) {
    state.sectionOrderBusy = false;
    state.error = e.message;
    render();
  }
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
  markEditorSaved();
  render();
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.login = me.login;
    const data = await api('/api/sections');
    state.sections = data.sections;
    state.homeBanner = data.home_banner || '';
    state.github = data.github || { owner: '', repo: '' };
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
  const targetRoute = parseRouteFromHash(location.hash);
  if (shouldConfirmLeave(targetRoute)) {
    if (!confirmLeaveEdit()) {
      routeUseReplace = true;
      location.hash = lastSyncedRouteHash || buildRouteHash();
      return;
    }
  }
  applyRouteFromHash();
});

window.addEventListener('beforeunload', (e) => {
  if (isEditorDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

init();
