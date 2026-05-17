const { escapeHtml, lyricsToHtml } = require('./escape');
const { anchorId } = require('./slug');

function pageUrl(base, page) {
  if (!page) return base || './';
  return `${base || './'}${page}`;
}

function renderNav(sections, base, currentSlug) {
  const items = sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      const active = s.slug === currentSlug ? ' aria-current="page"' : '';
      return `<li><a href="${href}"${active}>${escapeHtml(s.title)}</a></li>`;
    })
    .join('\n');
  return `<nav class="site-nav" aria-label="विभाग"><ul class="nav-list">${items}</ul></nav>`;
}

function renderHeader(config, sections, base, currentSlug) {
  const home = pageUrl(base, 'index.html');
  return `<header class="site-header">
  <a class="site-title" href="${home}">${escapeHtml(config.site_title)}</a>
  <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav-panel">☰</button>
  <div id="site-nav-panel" class="nav-panel">
  ${renderNav(sections, base, currentSlug)}
  </div>
</header>`;
}

function renderFooter() {
  return '<footer class="site-footer"><p>भजन संग्रह</p></footer>';
}

function renderHead(pageTitle, base) {
  const css = pageUrl(base, 'assets/css/site.css');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;
}

function renderPage({ pageTitle, body, config, sections, base, currentSlug }) {
  return `<!DOCTYPE html>
<html lang="hi">
<head>
${renderHead(pageTitle, base)}
</head>
<body>
${renderHeader(config, sections, base, currentSlug)}
<main class="site-main">
${body}
</main>
${renderFooter()}
<script src="${pageUrl(base, 'assets/js/nav.js')}"></script>
</body>
</html>`;
}

function renderIndex(config, sections, base) {
  const cards = sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      const banner = s.banner
        ? `<img class="section-card__banner" src="${pageUrl(base, s.banner)}" alt="" loading="lazy">`
        : '';
      return `<a class="section-card" href="${href}">${banner}<span class="section-card__title">${escapeHtml(s.title)}</span></a>`;
    })
    .join('\n');
  const body = `<div class="hero"><h1>${escapeHtml(config.site_title)}</h1></div>
<section class="section-grid">${cards}</section>`;
  return renderPage({
    pageTitle: config.site_title,
    body,
    config,
    sections,
    base,
    currentSlug: null,
  });
}

function renderSectionPage(section, bhajans, config, sections, base) {
  const banner = section.banner
    ? `<img class="section-banner" src="${pageUrl(base, section.banner)}" alt="${escapeHtml(section.title)}">`
    : '';
  const toc = bhajans
    .map((b, i) => {
      const id = b.id || anchorId(section.slug, b.title, i);
      return `<li><a href="#${id}">${escapeHtml(b.title)}</a></li>`;
    })
    .join('\n');
  const articles = bhajans
    .map((b, i) => {
      const id = b.id || anchorId(section.slug, b.title, i);
      const tarz = b.tarz
        ? `<p class="bhajan-tarz"><span class="label">तर्ज:</span> ${escapeHtml(b.tarz)}</p>`
        : '';
      const sw = b.swarachit ? '<span class="bhajan-badge">स्वरचित</span>' : '';
      return `<article class="bhajan" id="${id}">
  <h2 class="bhajan-title">${escapeHtml(b.title)}${sw}</h2>
  ${tarz}
  <div class="bhajan-lyrics">${lyricsToHtml(b.lyrics)}</div>
</article>`;
    })
    .join('\n');
  const body = `${banner}
<h1 class="section-title">${escapeHtml(section.title)}</h1>
<nav class="bhajan-toc" aria-label="भजन सूची"><ul>${toc}</ul></nav>
${articles}`;
  return renderPage({
    pageTitle: section.title,
    body,
    config,
    sections,
    base,
    currentSlug: section.slug,
  });
}

module.exports = { pageUrl, renderPage, renderIndex, renderSectionPage, anchorId };