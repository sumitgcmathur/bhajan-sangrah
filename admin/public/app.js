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

function render() {
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
      </main>`;
    document.getElementById('open-section').addEventListener('click', () => {
      const slug = document.getElementById('section-pick').value;
      if (slug) openSection(slug);
    });
    return;
  }

  if (state.view === 'bhajans') {
    app.innerHTML = `
      ${topbar(state.section.title, 'sections')}
      <main>
        <button type="button" class="btn btn-primary" id="add-bhajan" style="width:100%;margin-bottom:0.75rem">+ New bhajan</button>
        ${state.bhajans.map((b) => `
          <div class="bhajan-item">
            <button type="button" class="list-btn" data-path="${escapeAttr(b.path)}">${escapeHtml(b.name.replace(/^\d+-/, '').replace(/\.yaml$/, '').replace(/-/g, ' '))}</button>
          </div>`).join('') || '<p class="hint">No bhajans in this section yet.</p>'}
      </main>`;
    document.getElementById('add-bhajan').addEventListener('click', () => {
      state.path = null;
      state.sha = null;
      state.editor = emptyEditor();
      state.view = 'edit';
      render();
    });
    app.querySelectorAll('[data-path]').forEach((btn) => {
      btn.addEventListener('click', () => openFile(btn.dataset.path));
    });
    return;
  }

  if (state.view === 'edit') {
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
          <div id="paras">${(L.paragraphs || []).map((p, i) => paraHtml(p, i)).join('')}</div>
          <button type="button" class="btn" id="add-antara">+ Antara</button>
          <button type="button" class="btn" id="add-commentary">+ Commentary</button>
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
  const e = state.editor;
  e.title = document.getElementById('f-title').value.trim();
  e.tarz = document.getElementById('f-tarz').value.trim();
  if (document.getElementById('f-group-select')) {
    e.group = readGroupValue();
  }
  e.swarachit = document.getElementById('f-swarachit').checked;
  e.jabani = document.getElementById('f-jabani').value.trim();
  const L = e.lyrics;
  L.sthayi = document.getElementById('f-sthayi').value.trim();
  L.sthayi_marker = document.getElementById('f-sthayi-marker').value.trim();
  L.sthayi_connect = document.getElementById('f-connect-off').checked ? false : undefined;
  L.sthayi_connect_text = document.getElementById('f-connect-text').value.trim();
  L.pre_shlok = document.getElementById('f-pre-shlok').value.trim();
  L.dhvani = document.getElementById('f-dhvani').value.trim();
  const legacy = document.getElementById('f-legacy');
  if (legacy) e.legacyLyricsText = legacy.value;
  L.paragraphs = [...document.querySelectorAll('.para-card')].map((card) => ({
    type: card.querySelector('.para-type').value,
    text: card.querySelector('.para-text').value,
  }));
  return e;
}

function bindEditor() {
  bindGroupField();

  document.querySelector('[data-back="sections"]')?.addEventListener('click', () => {
    state.view = 'sections';
    render();
  });
  document.querySelector('[data-back="bhajans"]')?.addEventListener('click', () => {
    state.view = 'bhajans';
    render();
  });

  document.getElementById('add-antara')?.addEventListener('click', () => {
    state.editor.lyrics.paragraphs.push({ type: 'antara', text: '' });
    render();
  });
  document.getElementById('add-commentary')?.addEventListener('click', () => {
    state.editor.lyrics.paragraphs.push({ type: 'commentary', text: '' });
    render();
  });

  document.querySelectorAll('.para-card').forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelector('.para-del')?.addEventListener('click', () => {
      state.editor.lyrics.paragraphs.splice(i, 1);
      if (!state.editor.lyrics.paragraphs.length) state.editor.lyrics.paragraphs.push({ type: 'antara', text: '' });
      render();
    });
    card.querySelector('.para-up')?.addEventListener('click', () => {
      if (i === 0) return;
      const arr = state.editor.lyrics.paragraphs;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      render();
    });
    card.querySelector('.para-down')?.addEventListener('click', () => {
      const arr = state.editor.lyrics.paragraphs;
      if (i >= arr.length - 1) return;
      [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      render();
    });
  });

  document.getElementById('save')?.addEventListener('click', saveEditor);
  document.getElementById('delete')?.addEventListener('click', deleteEditor);
}

async function saveEditor() {
  state.error = null;
  collectEditor();
  try {
    if (state.path) {
      await api('/api/file', {
        method: 'PUT',
        body: JSON.stringify({
          path: state.path,
          sha: state.sha,
          editor: state.editor,
          message: `admin: update ${state.editor.title}`,
        }),
      });
    } else {
      const res = await api('/api/file', {
        method: 'POST',
        body: JSON.stringify({
          section: state.section.slug,
          editor: state.editor,
          message: `admin: add ${state.editor.title}`,
        }),
      });
      state.path = res.path;
    }
    alert('Published — GitHub Actions will rebuild the public site.');
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
