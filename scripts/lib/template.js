const { escapeHtml, lyricsToHtml } = require('./escape');
const { anchorId } = require('./slug');

function pageUrl(base, page) {
  if (!page) return base || './';
  return `${base || './'}${page}`;
}

function renderNav(sections, base, currentSlug) {
  return sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      const active = s.slug === currentSlug ? ' is-active' : '';
      return `<a class="nav-link${active}" href="${href}">${escapeHtml(s.title)}</a>`;
    })
    .join('\n');
}

function renderHeader(config, sections, base, currentSlug) {
  const home = pageUrl(base, 'index.html');
  return `<header class="site-header">
  <div class="header-inner">
    <a class="site-brand" href="${home}">
      <span class="site-brand__title">${escapeHtml(config.site_title)}</span>
    </a>
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav">&#9776;</button>
  </div>
  <nav id="site-nav" class="site-nav" aria-label="विभाग">${renderNav(sections, base, currentSlug)}</nav>
</header>`;
}

function renderFooter() {
  return '<footer class="site-footer"><p>भक्ति भजन संग्रह</p></footer>';
}

function renderHead(pageTitle, base) {
  const css = pageUrl(base, 'assets/css/site.css');
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#6b2d0a">
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;
}

function renderPage(opts) {
  const { pageTitle, body, config, sections, base, currentSlug, bodyClass = '' } = opts;
  return `<!DOCTYPE html>
<html lang="hi">
<head>
${renderHead(pageTitle, base)}
</head>
<body class="${bodyClass}">
${renderHeader(config, sections, base, currentSlug)}
${body}
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
        ? `<div class="section-card__img-wrap"><img class="section-card__banner" src="${pageUrl(base, s.banner)}" alt="" loading="lazy"></div>`
        : '<div class="section-card__img-wrap section-card__img-wrap--placeholder"></div>';
      return `<a class="section-card" href="${href}">${banner}<span class="section-card__title">${escapeHtml(s.title)}</span></a>`;
    })
    .join('\n');

  const body = `<div class="home-hero">
  <div class="home-hero__inner">
    <h1>${escapeHtml(config.site_title)}</h1>
    <p class="home-hero__tagline">भक्ति भजन — पढ़ने के लिए विभाग चुनें</p>
  </div>
</div>
<main class="site-main site-main--home">
  <section class="section-grid" aria-label="सभी विभाग">${cards}</section>
</main>`;

  return renderPage({
    pageTitle: config.site_title,
    body,
    config,
    sections,
    base,
    currentSlug: null,
    bodyClass: 'page-home',
  });
}

function renderSectionPage(section, bhajans, config, sections, base) {
  const banner = section.banner
    ? `<img class="section-hero__banner" src="${pageUrl(base, section.banner)}" alt="">`
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
        ? `<p class="bhajan-tarz"><span class="label">तर्ज</span> ${escapeHtml(b.tarz)}</p>`
        : '';
      const sw = b.swarachit ? '<span class="bhajan-badge">स्वरचित</span>' : '';
      return `<article class="bhajan-card" id="${id}">
  <h2 class="bhajan-card__title">${escapeHtml(b.title)}${sw}</h2>
  ${tarz}
  <div class="bhajan-card__lyrics">${lyricsToHtml(b.lyrics)}</div>
</article>`;
    })
    .join('\n');

  const body = `<div class="section-hero">
  ${banner}
  <div class="section-hero__overlay">
    <h1 class="section-hero__title">${escapeHtml(section.title)}</h1>
  </div>
</div>
<main class="site-main site-main--section">
  <div class="section-layout">
    <aside class="bhajan-toc" aria-label="भजन सूची">
      <h2 class="bhajan-toc__heading">भजन सूची</h2>
      <ul>${toc}</ul>
    </aside>
    <div class="bhajan-list">${articles}</div>
  </div>
</main>`;

  return renderPage({
    pageTitle: section.title,
    body,
    config,
    sections,
    base,
    currentSlug: section.slug,
    bodyClass: 'page-section',
  });
}

module.exports = { pageUrl, renderPage, renderIndex, renderSectionPage, anchorId };
