const app = document.getElementById('app');

const state = {
  view: 'loading',
  login: null,
  sections: [],
  section: null,
  bhajans: [],
  path: null,
  sha: null,
  editor: null,
  error: null,
};

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
    not_allowed: 'यह GitHub खाता अनुमत नहीं है।',
    invalid_state: 'लॉगिन समाप्त — पुनः प्रयास करें।',
    access_denied: 'GitHub लॉगिन रद्द।',
  };
  return map[code] || code;
}

function render() {
  if (state.view === 'loading') {
    app.innerHTML = '<p class="loading">लोड हो रहा है…</p>';
    return;
  }

  if (state.view === 'login') {
    const q = new URLSearchParams(location.search);
    const err = q.get('error');
    app.innerHTML = `
      <main>
        <div class="login-card">
          <h1>भजन संग्रह Admin</h1>
          ${err ? `<p class="err">${escapeHtml(errMsg(err))}</p>` : ''}
          <p>संपादन के लिए GitHub से लॉगिन करें। केवल अनुमत खाता बदलाव कर सकता है।</p>
          <a class="btn btn-primary" href="/api/auth/login">GitHub से लॉगिन</a>
        </div>
      </main>`;
    return;
  }

  if (state.view === 'sections') {
    app.innerHTML = `
      ${topbar('विभाग', '')}
      <main>
        <p class="hint">विभाग चुनें — भजन संपादित करें। बदलाव <code>main</code> पर commit होंगे।</p>
        <div class="section-grid">
          ${state.sections.map((s) => `<button type="button" class="list-btn" data-slug="${escapeAttr(s.slug)}">${escapeHtml(s.title)}</button>`).join('')}
        </div>
      </main>`;
    app.querySelectorAll('[data-slug]').forEach((btn) => {
      btn.addEventListener('click', () => openSection(btn.dataset.slug));
    });
    return;
  }

  if (state.view === 'bhajans') {
    app.innerHTML = `
      ${topbar(state.section.title, 'sections')}
      <main>
        <button type="button" class="btn btn-primary" id="add-bhajan" style="width:100%;margin-bottom:0.75rem">+ नया भजन</button>
        ${state.bhajans.map((b) => `
          <div class="bhajan-item">
            <button type="button" class="list-btn" data-path="${escapeAttr(b.path)}">${escapeHtml(b.name.replace(/^\d+-/, '').replace(/\.yaml$/, '').replace(/-/g, ' '))}</button>
          </div>`).join('') || '<p class="hint">कोई भजन नहीं।</p>'}
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
    app.innerHTML = `
      ${topbar(e.title || 'भजन', 'bhajans')}
      <main>
        ${state.error ? `<p class="err">${escapeHtml(state.error)}</p>` : ''}
        <div class="form-section">
          <h2>मूल</h2>
          <label>शीर्षक</label>
          <input type="text" id="f-title" value="${escapeAttr(e.title)}">
          <label>तर्ज</label>
          <input type="text" id="f-tarz" value="${escapeAttr(e.tarz)}">
          <label>समूह (grouped sections)</label>
          <input type="text" id="f-group" value="${escapeAttr(e.group)}">
          <div class="check-row"><input type="checkbox" id="f-swarachit" ${e.swarachit ? 'checked' : ''}><label for="f-swarachit">स्वरचित</label></div>
        </div>
        <div class="form-section">
          <h2>स्थायी</h2>
          <textarea id="f-sthayi">${escapeHtml(L.sthayi)}</textarea>
          <label>स्थायी marker (advanced)</label>
          <input type="text" id="f-sthayi-marker" value="${escapeAttr(L.sthayi_marker)}">
          <div class="check-row"><input type="checkbox" id="f-connect-off" ${L.sthayi_connect === false ? 'checked' : ''}><label for="f-connect-off">sthayi_connect बंद करें</label></div>
          <label>sthayi_connect_text</label>
          <input type="text" id="f-connect-text" value="${escapeAttr(L.sthayi_connect_text)}">
        </div>
        <div class="form-section">
          <h2>प्रारंभिक श्लोक</h2>
          <textarea id="f-pre-shlok">${escapeHtml(L.pre_shlok)}</textarea>
        </div>
        <div class="form-section">
          <h2>अंतरे</h2>
          <div id="paras">${(L.paragraphs || []).map((p, i) => paraHtml(p, i)).join('')}</div>
          <button type="button" class="btn" id="add-antara">+ अंतरा</button>
          <button type="button" class="btn" id="add-commentary">+ टीका</button>
        </div>
        <div class="form-section">
          <h2>ध्वनि</h2>
          <textarea id="f-dhvani">${escapeHtml(L.dhvani)}</textarea>
        </div>
        <div class="form-section">
          <h2>जबानी</h2>
          <textarea id="f-jabani">${escapeHtml(e.jabani)}</textarea>
        </div>
        ${e.legacyLyricsText ? `<div class="form-section"><h2>Legacy lyrics</h2><textarea id="f-legacy">${escapeHtml(e.legacyLyricsText)}</textarea></div>` : ''}
        <div class="sticky-actions">
          <button type="button" class="btn btn-primary" id="save">प्रकाशित करें</button>
          ${state.path ? '<button type="button" class="btn btn-danger" id="delete">हटाएँ</button>' : ''}
        </div>
      </main>`;
    bindEditor();
    return;
  }
}

function topbar(title, back) {
  const backBtn =
    back === 'sections'
      ? '<button type="button" class="btn" data-back="sections">← विभाग</button>'
      : back === 'bhajans'
        ? '<button type="button" class="btn" data-back="bhajans">← सूची</button>'
        : '';
  return `<header class="topbar">
    ${backBtn}
    <h1>${escapeHtml(title)}</h1>
    <a class="btn" href="/api/auth/logout">लॉगआउट</a>
  </header>`;
}

function paraHtml(p, i) {
  return `<div class="para-card" data-i="${i}">
    <label>प्रकार</label>
    <select class="para-type"><option value="antara" ${p.type === 'antara' ? 'selected' : ''}>अंतरा</option><option value="commentary" ${p.type === 'commentary' ? 'selected' : ''}>टीका</option></select>
    <label>पाठ</label>
    <textarea class="para-text">${escapeHtml(p.text || '')}</textarea>
    <div class="para-actions">
      <button type="button" class="btn para-up">↑</button>
      <button type="button" class="btn para-down">↓</button>
      <button type="button" class="btn btn-danger para-del">हटाएँ</button>
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
  e.group = document.getElementById('f-group').value.trim();
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
    alert('प्रकाशित — GitHub Actions से साइट अपडेट होगी।');
    state.view = 'bhajans';
    await loadBhajans(state.section.slug);
    render();
  } catch (e) {
    state.error = e.message;
    render();
  }
}

async function deleteEditor() {
  if (!state.path || !confirm('यह भजन हटाएँ?')) return;
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
