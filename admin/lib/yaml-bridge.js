const path = require('path');

let loadBhajanDoc;
let dumpBhajanDoc;
let loadSectionsDoc;

function loadYamlLib() {
  if (loadBhajanDoc) return;
  const base = path.join(__dirname, '..', '..', 'scripts', 'lib', 'yaml-io');
  const mod = require(base);
  loadBhajanDoc = mod.loadBhajanDoc;
  dumpBhajanDoc = mod.dumpBhajanDoc;
  loadSectionsDoc = mod.loadSectionsDoc;
}

function parseBhajanYaml(text) {
  loadYamlLib();
  return loadBhajanDoc(text);
}

function serializeBhajanDoc(doc) {
  loadYamlLib();
  return dumpBhajanDoc(doc);
}

function parseSectionsYaml(text) {
  loadYamlLib();
  return loadSectionsDoc(text);
}

/** Editor-friendly paragraph list */
function docToEditor(doc) {
  const d = doc || {};
  const lyrics = d.lyrics;
  const out = {
    title: d.title || '',
    tarz: d.tarz || '',
    group: d.group || '',
    lyrics: {
      sthayi: '',
      sthayi_connect_text: '',
      pre_shlok: '',
      post_shlok: '',
      paragraphs: [],
      parts: null,
    },
    legacyLyricsText: '',
  };

  if (typeof lyrics === 'string') {
    out.legacyLyricsText = lyrics;
    return out;
  }

  if (!lyrics || typeof lyrics !== 'object') return out;

  out.lyrics.sthayi = lyrics.sthayi || '';
  out.lyrics.sthayi_connect =
    lyrics.sthayi_connect === true ? true : lyrics.sthayi_connect === false ? false : undefined;
  out.lyrics.sthayi_connect_text = lyrics.sthayi_connect_text || '';
  out.lyrics.pre_shlok = lyrics.pre_shlok || '';
  out.lyrics.post_shlok = lyrics.post_shlok || '';
  out.lyrics.parts = lyrics.parts?.length ? lyrics.parts : null;

  for (const item of lyrics.paragraphs || []) {
    if (item && typeof item === 'object' && item.commentary != null) {
      out.lyrics.paragraphs.push({ type: 'commentary', text: item.commentary });
    } else {
      out.lyrics.paragraphs.push({ type: 'antara', text: String(item || '') });
    }
  }
  return out;
}

function editorToDoc(editor) {
  const e = editor || {};
  if (e.legacyLyricsText && String(e.legacyLyricsText).trim()) {
    return {
      title: (e.title || '').trim(),
      ...(e.tarz ? { tarz: e.tarz } : {}),
      ...(e.group ? { group: e.group } : {}),
      lyrics: String(e.legacyLyricsText).trim(),
    };
  }

  const L = e.lyrics || {};
  const paragraphs = (L.paragraphs || []).map((p) => {
    if (p.type === 'commentary') return { commentary: p.text || '' };
    return p.text || '';
  });

  const lyrics = {
    ...(L.sthayi ? { sthayi: L.sthayi } : {}),
    ...(L.sthayi_connect === true ? { sthayi_connect: true } : L.sthayi_connect === false ? { sthayi_connect: false } : {}),
    ...(L.sthayi_connect_text ? { sthayi_connect_text: L.sthayi_connect_text } : {}),
    ...(L.pre_shlok ? { pre_shlok: L.pre_shlok } : {}),
    ...(paragraphs.length ? { paragraphs } : {}),
    ...(L.post_shlok ? { post_shlok: L.post_shlok } : {}),
    ...(L.parts?.length ? { parts: L.parts } : {}),
  };

  return {
    title: (e.title || '').trim(),
    ...(e.tarz ? { tarz: e.tarz } : {}),
    ...(e.group ? { group: e.group } : {}),
    lyrics,
  };
}

module.exports = {
  parseBhajanYaml,
  serializeBhajanDoc,
  parseSectionsYaml,
  docToEditor,
  editorToDoc,
};
