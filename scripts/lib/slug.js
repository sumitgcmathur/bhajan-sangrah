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

/** Parse `008-my-bhajan.yaml` → { prefix: '008', slug: 'my-bhajan' }. */
function parseBhajanBasename(baseName) {
  const base = String(baseName || '');
  const m = base.match(/^(\d+)-(.+)\.ya?ml$/i);
  if (!m) return { prefix: null, slug: slugify(base.replace(/\.ya?ml$/i, '')) };
  return { prefix: m[1], slug: m[2] };
}

/** True when the title’s slug differs from the slug embedded in the filename. */
function titleSlugDiffersFromPath(filePath, title) {
  const base = String(filePath || '').replace(/\\/g, '/').split('/').pop() || '';
  const { slug: fileSlug } = parseBhajanBasename(base);
  return slugify(title) !== fileSlug;
}

/**
 * Path for an existing bhajan after a title change. Keeps the numeric prefix;
 * updates the slug. Pass existing basenames (not full paths) in `existingNames`.
 */
function bhajanPathForTitle(currentPath, title, existingNames) {
  const norm = String(currentPath || '').replace(/\\/g, '/');
  const slash = norm.lastIndexOf('/');
  const dir = norm.slice(0, slash);
  const base = norm.slice(slash + 1);
  const { prefix, slug: oldSlug } = parseBhajanBasename(base);
  const newSlug = slugify(title);
  const numPrefix = prefix || '001';
  if (newSlug === oldSlug) return norm;

  let name = `${numPrefix}-${newSlug}.yaml`;
  let n = 2;
  while (existingNames.has(name) && name !== base) {
    name = `${numPrefix}-${newSlug}-${n}.yaml`;
    n += 1;
  }
  return `${dir}/${name}`;
}

module.exports = {
  slugify,
  anchorId,
  bhajanFilename,
  parseBhajanBasename,
  titleSlugDiffersFromPath,
  bhajanPathForTitle,
};
