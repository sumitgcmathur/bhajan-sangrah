import { bindSpeechDictation, stopDictation } from './speech.js';

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
  paraEditMode: 'structured',
  paraBulkDraft: null,
  replace: {
    find: '',
    replace: '',
    regex: false,
    caseInsensitive: false,
    preview: null,
    busy: false,
  },
};

const GROUP_OTHER = '__other__';

function emptyEditor() {
  return {
    title: '',
    tarz: '',
    group: '',
    swarachit: false,
    jabani: '',
    lyrics: {
      sthayi: '',
      sthayi_marker: '',
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
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
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
      <input type="text" id="f-group-other" value="${escapeAttr(known ? '' : current)}">
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
  e.jabani = document.getElementById('f-jabani')?.value.trim() || '';
  const L = e.lyrics;
  L.sthayi = document.getElementById('f-sthayi')?.value.trim() || '';
  L.sthayi_marker = document.getElementById('f-sthayi-marker')?.value.trim() || '';
  L.sthayi_connect = document.getElementById('f-connect-off')?.checked ? false : undefined;
  L.sthayi_connect_text = document.getElementById('f-connect-text')?.value.trim() || '';
  L.pre_shlok = document.getElementById('f-pre-shlok')?.value.trim() || '';
  L.dhvani = document.getElementById('f-dhvani')?.value.trim() || '';
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
  const cards = document.querySelectorAll('.para-card');
  if (cards.length) {
    state.editor.lyrics.paragraphs = [...cards].map((card) => ({
      type: card.querySelector('.para-type').value,
      text: card.querySelector('.para-text').value,
    }));
  }
  state.paraBulkDraft = paragraphsToBulkText(state.editor.lyrics.paragraphs);
}

function versesSectionHtml(paragraphs) {
  const mode = state.paraEditMode || 'structured';
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
      <textarea id="f-paras-bulk" class="paras-bulk" rows="14">${escapeHtml(bulk)}</textarea>
      <button type="button" class="btn" id="parse-paras-bulk">Parse into paragraphs</button>
    </div>`;
}

function resetParagraphEditor() {
  state.paraEditMode = 'structured';
  state.paraBulkDraft = null;
}

function bhajanDisplayName(b) {
  const title = (b.title || '').trim();
  if (title) return title;
  return b.name.replace(/^\d+-/, '').replace(/\.ya?ml$/i, '').replace(/-/g, ' ');
}

function bindTopbar() {
  document.querySelector('[data-back="sections"]')?.addEventListener('click', () => {
    state.view = 'sections';
    render();
  });
  document.querySelector('[data-back="bhajans"]')?.addEventListener('click', () => {
    state.view = 'bhajans';
    render();
  });
}

function render() {
  stopDictation();
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
      if (slug) openSection(slug);
    });
    document.getElementById('go-replace').addEventListener('click', () => {
      state.error = null;
      state.replace.preview = null;
      state.view = 'replace';
      render();
    });
    return;
  }

  if (state.view === 'replace') {
    const r = state.replace;
    const prev = r.preview;
    app.innerHTML = `
      ${topbar('Find & replace', 'sections')}
      <main class="replace-main">
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <p class="hint">Search and replace across every bhajan YAML under <code>content/</code>. Preview first, then apply. Each changed file gets its own commit on <code>main</code>.</p>
        <label for="rep-find">Find</label>
        <textarea id="rep-find" class="replace-field" rows="3" placeholder="Text to find (min. 2 characters)">${escapeHtml(r.find)}</textarea>
        <label for="rep-replace">Replace with</label>
        <textarea id="rep-replace" class="replace-field" rows="3" placeholder="Leave empty to delete matches">${escapeHtml(r.replace)}</textarea>
        <div class="check-row"><input type="checkbox" id="rep-regex" ${r.regex ? 'checked' : ''}><label for="rep-regex">Regular expression</label></div>
        <div class="check-row"><input type="checkbox" id="rep-ci" ${r.caseInsensitive ? 'checked' : ''}><label for="rep-ci">Case insensitive</label></div>
        <div class="replace-actions">
          <button type="button" class="btn btn-primary" id="rep-preview" ${r.busy ? 'disabled' : ''}>Preview matches</button>
          <button type="button" class="btn" id="rep-apply" ${r.busy || !prev ? 'disabled' : ''}>Apply to all matches</button>
        </div>
        ${prev ? renderReplacePreview(prev) : ''}
      </main>`;
    bindTopbar();
    document.getElementById('rep-preview')?.addEventListener('click', previewReplace);
    document.getElementById('rep-apply')?.addEventListener('click', applyReplace);
    return;
  }

  if (state.view === 'bhajans') {
    app.innerHTML = `
      ${topbar(state.section.title, 'sections')}
      <main>
        <button type="button" class="btn btn-primary" id="add-bhajan" style="width:100%;margin-bottom:0.75rem">+ New bhajan</button>
        ${state.bhajans.map((b) => `
          <div class="bhajan-item">
            <button type="button" class="list-btn" data-path="${escapeAttr(b.path)}">${escapeHtml(bhajanDisplayName(b))}</button>
          </div>`).join('') || '<p class="hint">No bhajans in this section yet.</p>'}
      </main>`;
    bindTopbar();
    document.getElementById('add-bhajan').addEventListener('click', () => {
      state.path = null;
      state.sha = null;
      state.editor = emptyEditor();
      resetParagraphEditor();
      state.view = 'edit';
      render();
    });
    app.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => openFile(btn.dataset.path));
    });
    return;
  }

  if (state.view === 'edit') {
    syncEditorFromDom();
    const e = state.editor;
    const L = e.lyrics;
    const showGroup = Boolean(state.section?.grouped);
    app.innerHTML = `
      ${topbar(e.title || 'Bhajan', 'bhajans')}
      <main>
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <div class="form-section">
          <h2>Basic</h2>
          <label>Title</label>
          <input type="text" id="f-title" value="${escapeAttr(e.title)}">
          <label>Tarz (tune line)</label>
          <input type="text" id="f-tarz" value="${escapeAttr(e.tarz)}">
          ${showGroup ? groupFieldHtml(e.group) : ''}
          <div class="check-row"><input type="checkbox" id="f-swarachit" ${e.swarachit ? 'checked' : ''}><label for="f-swarachit">Swarachit (composed)</label></div>
        </div>
        <div class="form-section">
          <h2>Refrain (sthayi)</h2>
          <textarea id="f-sthayi">${escapeHtml(L.sthayi)}</textarea>
          <label>Refrain marker (advanced)</label>
          <input type="text" id="f-sthayi-marker" value="${escapeAttr(L.sthayi_marker)}">
          <div class="check-row"><input type="checkbox" id="f-connect-off" ${L.sthayi_connect === false ? 'checked' : ''}><label for="f-connect-off">Disable sthayi_connect</label></div>
          <label>sthayi_connect_text</label>
          <input type="text" id="f-connect-text" value="${escapeAttr(L.sthayi_connect_text)}">
        </div>
        <div class="form-section">
          <h2>Opening shloka</h2>
          <textarea id="f-pre-shlok">${escapeHtml(L.pre_shlok)}</textarea>
        </div>
        <div class="form-section">
          <h2>Verses (antaras)</h2>
          ${versesSectionHtml(L.paragraphs)}
        </div>
        <div class="form-section">
          <h2>Dhvani</h2>
          <textarea id="f-dhvani">${escapeHtml(L.dhvani)}</textarea>
        </div>
        <div class="form-section">
          <h2>Jabani (explanation)</h2>
          <textarea id="f-jabani">${escapeHtml(e.jabani)}</textarea>
        </div>
        ${e.legacyLyricsText ? `<div class="form-section"><h2>Legacy lyrics</h2><textarea id="f-legacy">${escapeHtml(e.legacyLyricsText)}</textarea></div>` : ''}
        <div class="sticky-actions">
          <button type="button" class="btn btn-primary" id="save">Publish</button>
          ${state.path ? '<button type="button" class="btn btn-danger" id="delete">Delete</button>' : ''}
        </div>
      </main>`;
    bindEditor();
    return;
  }
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

function readReplaceForm() {
  state.replace.find = document.getElementById('rep-find')?.value ?? '';
  state.replace.replace = document.getElementById('rep-replace')?.value ?? '';
  state.replace.regex = Boolean(document.getElementById('rep-regex')?.checked);
  state.replace.caseInsensitive = Boolean(document.getElementById('rep-ci')?.checked);
}

async function previewReplace() {
  readReplaceForm();
  state.error = null;
  if (state.replace.find.trim().length < 2) {
    state.error = 'Find text must be at least 2 characters.';
    render();
    return;
  }
  state.replace.busy = true;
  render();
  try {
    const data = await api('/api/replace', {
      method: 'POST',
      body: JSON.stringify({
        find: state.replace.find,
        replace: state.replace.replace,
        regex: state.replace.regex,
        caseInsensitive: state.replace.caseInsensitive,
        dryRun: true,
      }),
    });
    state.replace.preview = data;
    state.replace.busy = false;
    render();
  } catch (e) {
    state.replace.busy = false;
    state.error = e.message;
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

  state.replace.busy = true;
  state.error = null;
  render();
  try {
    const data = await api('/api/replace', {
      method: 'POST',
      body: JSON.stringify({
        find: state.replace.find,
        replace: state.replace.replace,
        regex: state.replace.regex,
        caseInsensitive: state.replace.caseInsensitive,
        dryRun: false,
      }),
    });
    state.replace.busy = false;
    state.replace.preview = null;
    alert(
      `Done: ${data.totalMatches} replacement(s) in ${data.filesUpdated} file(s).\n\nGitHub Actions will rebuild the site.`,
    );
    render();
  } catch (e) {
    state.replace.busy = false;
    state.error = e.message;
    render();
  }
}

function topbar(title, back) {
  const backBtn =
    back === 'sections'
      ? '<button type="button" class="btn" data-back="sections">← Sections</button>'
      : back === 'bhajans'
        ? '<button type="button" class="btn" data-back="bhajans">← List</button>'
        : '';
  return `<header class="topbar">
    ${backBtn}
    <h1>${escapeHtml(title)}</h1>
    <a class="btn" href="/api/auth/logout">Log out</a>
  </header>`;
}

function paraHtml(p, i) {
  return `<div class="para-card" data-i="${i}">
    <label>Type</label>
    <select class="para-type"><option value="antara" ${p.type === 'antara' ? 'selected' : ''}>Antara (verse)</option><option value="commentary" ${p.type === 'commentary' ? 'selected' : ''}>Commentary</option></select>
    <label>Text</label>
    <textarea class="para-text">${escapeHtml(p.text || '')}</textarea>
    <div class="para-actions">
      <button type="button" class="btn para-up">↑</button>
      <button type="button" class="btn para-down">↓</button>
      <button type="button" class="btn btn-danger para-del">Delete</button>
    </div>
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

  document.querySelectorAll('.para-card').forEach((card) => {
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

  document.getElementById('save')?.addEventListener('click', saveEditor);
  document.getElementById('delete')?.addEventListener('click', deleteEditor);
  bindSpeechDictation(app);
}

async function saveEditor() {
  state.error = null;
  collectEditor();
  if (!state.editor.title.trim()) {
    state.error = 'Title is required before publishing.';
    render();
    return;
  }
  try {
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
    alert(`Published — GitHub Actions will rebuild the public site.${renameNote}`);
    state.view = 'bhajans';
    await loadBhajans(state.section.slug);
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function deleteEditor() {
  if (!state.path || !confirm('Delete this bhajan?')) return;
  try {
    await api(`/api/file?path=${encodeURIComponent(state.path)}&sha=${encodeURIComponent(state.sha)}`, {
      method: 'DELETE',
    });
    state.view = 'bhajans';
    await loadBhajans(state.section.slug);
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function openSection(slug) {
  state.section = state.sections.find((s) => s.slug === slug);
  await loadBhajans(slug);
  state.view = 'bhajans';
  render();
}

async function loadBhajans(slug) {
  const data = await api(`/api/bhajans?section=${encodeURIComponent(slug)}`);
  state.bhajans = data.bhajans;
  state.section = data.section;
  state.groupOptions = data.groups || [];
}

async function openFile(path) {
  const data = await api(`/api/file?path=${encodeURIComponent(path)}`);
  state.path = data.path;
  state.sha = data.sha;
  state.editor = data.editor;
  resetParagraphEditor();
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
    state.view = 'sections';
    history.replaceState(null, '', location.pathname);
    render();
  } catch {
    state.view = 'login';
    render();
  }
}

init();
