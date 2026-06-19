const path = require('path');
const {
  sectionFolder,
  listBhajanFiles,
  loadBhajan,
  sortBhajansForDisplay,
} = require('./sections');

/** Map swarachit `group:` (section title) → section slug. */
function groupTitleToSlug(sections, group) {
  const g = String(group || '').trim();
  if (!g) return null;
  const match = (sections || []).find((s) => s.title === g);
  return match?.slug || null;
}

function parseAlsoIn(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  const one = String(raw).trim();
  return one ? [one] : [];
}

/**
 * Section slugs where this bhajan should also appear (excluding its primary folder).
 * Swarachit bhajans inherit targets from `group:` matching a section title.
 */
function resolveAlsoInSlugs(doc, primarySection, sections) {
  const slugs = new Set(parseAlsoIn(doc.also_in));
  if (primarySection.slug === 'swarachit' && doc.group) {
    const mapped = groupTitleToSlug(sections, doc.group);
    if (mapped) slugs.add(mapped);
  }
  slugs.delete(primarySection.slug);
  return [...slugs].filter((slug) => (sections || []).some((s) => s.slug === slug));
}

function loadPrimaryRecords(sections) {
  const records = [];
  for (const section of sections) {
    for (const f of listBhajanFiles(section)) {
      const filePath = path.join(sectionFolder(section), f);
      records.push({
        doc: loadBhajan(filePath),
        file: f,
        filePath,
        primarySection: section,
      });
    }
  }
  return records;
}

/**
 * Per-section bhajan lists: primary files + cross-listed copies.
 * Each item includes `_isCrossListed`, `_primarySection`, `_file`, `_filePath`.
 */
function buildSectionBhajanMap(sections) {
  const bySlug = new Map((sections || []).map((s) => [s.slug, []]));
  const records = loadPrimaryRecords(sections);

  for (const record of records) {
    const { doc, primarySection } = record;
    bySlug.get(primarySection.slug).push({ record, isCrossListed: false });

    for (const slug of resolveAlsoInSlugs(doc, primarySection, sections)) {
      if (!bySlug.has(slug)) continue;
      bySlug.get(slug).push({ record, isCrossListed: true });
    }
  }

  for (const section of sections) {
    const entries = bySlug.get(section.slug) || [];
    const bhajans = entries.map(({ record, isCrossListed }) => ({
      ...record.doc,
      _file: record.file,
      _filePath: record.filePath,
      _primarySection: record.primarySection,
      _isCrossListed: isCrossListed,
    }));
    bySlug.set(section.slug, sortBhajansForDisplay(section, bhajans));
  }

  return { bySlug, records, uniqueCount: records.length };
}

function countBhajansBySection(sections, bySlug) {
  return (sections || []).map((section) => ({
    slug: section.slug,
    count: (bySlug.get(section.slug) || []).length,
  }));
}

module.exports = {
  groupTitleToSlug,
  parseAlsoIn,
  resolveAlsoInSlugs,
  loadPrimaryRecords,
  buildSectionBhajanMap,
  countBhajansBySection,
};
