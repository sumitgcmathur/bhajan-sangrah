/** Slug for YAML filenames and HTML anchor ids */
function slugify(text) {
  return (
    text
      .normalize('NFC')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'bhajan'
  );
}

function anchorId(sectionSlug, title, index) {
  const base = slugify(title);
  return `${sectionSlug}-${base}-${String(index + 1).padStart(2, '0')}`;
}

function bhajanFilename(title, index, existing) {
  const prefix = String(index + 1).padStart(3, '0');
  let slug = slugify(title);
  let name = `${prefix}-${slug}.yaml`;
  let n = 2;
  while (existing.has(name)) {
    name = `${prefix}-${slug}-${n}.yaml`;
    n += 1;
  }
  return name;
}

module.exports = { slugify, anchorId, bhajanFilename };
