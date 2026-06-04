/**
 * Corpus-wide spell error scan UI helpers.
 */

import {
  textsFromEditor,
  scanCorpusItems,
  ignoreWord,
  addCustomWord,
  clearSpellWordCache,
} from './spellcheck.js';

const FETCH_BATCH = 8;

export async function listAllBhajanPaths(api, signal) {
  const data = await api('/api/replace', {
    method: 'POST',
    body: JSON.stringify({ listPaths: true }),
    signal,
  });
  return data.paths || [];
}

export async function fetchEditorItems(api, paths, onProgress, signal) {
  const items = [];
  for (let i = 0; i < paths.length; i += FETCH_BATCH) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = paths.slice(i, i + FETCH_BATCH);
    const chunk = await Promise.all(
      batch.map(async (path) => {
        const data = await api(`/api/file?path=${encodeURIComponent(path)}`, { signal });
        return {
          path,
          title: (data.editor?.title || '').trim() || path.split('/').pop(),
          texts: textsFromEditor(data.editor),
        };
      }),
    );
    items.push(...chunk);
    onProgress?.(Math.min(i + FETCH_BATCH, paths.length), paths.length, 'load');
  }
  return items;
}

export async function runCorpusSpellScan(api, { onProgress, signal } = {}) {
  const paths = await listAllBhajanPaths(api, signal);
  onProgress?.(0, paths.length, 'list');
  const items = await fetchEditorItems(api, paths, onProgress, signal);
  const result = await scanCorpusItems(items, {
    onProgress: (cur, tot) => onProgress?.(cur, tot, 'spell'),
    signal,
  });
  return { ...result, pathsListed: paths.length };
}

export async function applyCorpusCorrection(api, word, replacement, paths) {
  return api('/api/spell-fix', {
    method: 'POST',
    body: JSON.stringify({ word, replacement, paths }),
  });
}

export function ignoreCorpusWord(word) {
  ignoreWord(word);
  clearSpellWordCache();
}

export function addCorpusWord(word) {
  addCustomWord(word);
  clearSpellWordCache();
}

export function removeClusterFromReport(report, word) {
  if (!report?.clusters) return report;
  const clusters = report.clusters.filter((c) => c.word !== word);
  return {
    ...report,
    clusters,
    totalOccurrences: clusters.reduce((n, c) => n + c.count, 0),
  };
}
