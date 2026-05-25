const { escapeHtml, lyricsToHtml, jabaniToHtml } = require('./escape');
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
      return `<li><a class="sidebar-link${active}" href="${href}">${escapeHtml(s.title)}</a></li>`;
    })
    .join('\n');
}

function renderSidebar(config, sections, base, currentSlug) {
  const home = pageUrl(base, 'index.html');
  const iconSrc = config.site_icon || 'assets/icons/favicon.jpg';
  const icon = pageUrl(base, iconSrc);
  return `<aside class="site-sidebar" id="site-sidebar" aria-label="साइट मार्गदर्शन">
  <div class="sidebar-brand">
    <a class="sidebar-brand__link" href="${home}">
      <img class="sidebar-brand__icon" src="${icon}" width="48" height="48" alt="">
      <span class="sidebar-brand__title">${escapeHtml(config.site_title)}</span>
    </a>
  </div>
  <nav class="sidebar-nav" aria-label="विभाग">
    <p class="sidebar-nav__label">${escapeHtml(config.site_title)}</p>
    <ul class="sidebar-nav__list">${renderNav(sections, base, currentSlug)}</ul>
  </nav>
</aside>`;
}

function renderSearchPanel() {
  return `<div id="bhajan-search-backdrop" class="bhajan-search-backdrop" hidden></div>
<aside id="bhajan-search-panel" class="bhajan-search-panel" aria-label="भजन खोजें" aria-hidden="true">
  <div class="bhajan-search-panel__head">
    <h2 class="bhajan-search-panel__title">भजन खोजें</h2>
    <button type="button" class="bhajan-search-panel__close" aria-label="बंद करें">&times;</button>
  </div>
  <div class="bhajan-search-panel__body">
    <label class="visually-hidden" for="bhajan-search">भजन खोजें</label>
    <input type="search" id="bhajan-search" class="bhajan-search__input" placeholder="भजन खोजें…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="bhajan-search-results" aria-autocomplete="list">
    <ul id="bhajan-search-results" class="bhajan-search__results" role="listbox" hidden></ul>
  </div>
</aside>`;
}

function renderFooter() {
  return '<footer class="site-footer"><p>भक्ति भजन संग्रह</p></footer>';
}

function iconTypeFromHref(href) {
  if (/\.jpe?g$/i.test(href)) return 'image/jpeg';
  if (/\.png$/i.test(href)) return 'image/png';
  if (/\.svg$/i.test(href)) return 'image/svg+xml';
  if (/\.ico$/i.test(href)) return 'image/x-icon';
  return '';
}

function renderIconLinks(base, config) {
  const iconSrc = config?.site_icon || 'assets/icons/favicon.jpg';
  const iconHref = pageUrl(base, iconSrc);
  if (!iconHref) return '';
  const type = iconTypeFromHref(iconHref);
  const typeAttr = type ? ` type="${type}"` : '';
  // iOS needs apple-touch-icon for home screen; rel=icon for Safari tabs (PNG most reliable).
  return (
    `<link rel="icon"${typeAttr} href="${iconHref}">\n` +
    `<link rel="apple-touch-icon" sizes="180x180" href="${iconHref}">\n`
  );
}

function renderHead(pageTitle, base, config) {
  const css = pageUrl(base, 'assets/css/site.css');
  const favicon = renderIconLinks(base, config);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1565c0">
<title>${escapeHtml(pageTitle)}</title>
${favicon}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;
}

function renderPage(opts) {
  const { pageTitle, body, config, sections, base, currentSlug, bodyClass = '' } = opts;
  return `<!DOCTYPE html>
<html lang="hi">
<head>
${renderHead(pageTitle, base, config)}
</head>
<body class="has-sidebar ${bodyClass}" data-site-base="${escapeHtml(base)}">
<button type="button" class="sidebar-toggle" aria-expanded="false" aria-controls="site-sidebar">&#9776;</button>
<div class="site-shell">
${renderSidebar(config, sections, base, currentSlug)}
<div class="site-content">
${body}
${renderFooter()}
</div>
</div>
<button type="button" class="search-toggle" aria-expanded="false" aria-controls="bhajan-search-panel" aria-label="भजन खोजें"><span class="search-toggle__icon" aria-hidden="true">&#128269;</span></button>
${renderSearchPanel()}
<script src="${pageUrl(base, 'assets/js/nav.js')}"></script>
<script src="${pageUrl(base, 'assets/js/search.js')}"></script>
</body>
</html>`;
}

function renderSectionIndexList(sections, base) {
  const items = sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      return `<li><a href="${href}">${escapeHtml(s.title)}</a></li>`;
    })
    .join('\n');
  return `<ul class="content-index">${items}</ul>`;
}

function bhajansByGroup(bhajans) {
  const groups = [];
  const seen = new Map();
  for (const b of bhajans) {
    const title = b.group || '';
    if (!seen.has(title)) {
      const entry = { title, items: [] };
      seen.set(title, entry);
      groups.push(entry);
    }
    seen.get(title).items.push(b);
  }
  return groups;
}

function sectionUsesGroups(section, bhajans) {
  return section.grouped === true || section.grouped === 'true' || bhajans.some((b) => b.group);
}

function bhajanNumberLabel(num) {
  return `${num}.`;
}

function renderBhajanIndex(bhajans, section) {
  const items = bhajans
    .map((b, i) => {
      const id = b.id || anchorId(section.slug, b.title, i);
      const num = i + 1;
      return `<li><a href="#${id}"><span class="bhajan-index__num">${bhajanNumberLabel(num)}</span> ${escapeHtml(b.title)}</a></li>`;
    })
    .join('\n');
  return `<nav class="bhajan-index" id="bhajan-index" aria-label="भजन सूची">
  <ul class="content-index">${items}</ul>
</nav>`;
}

function renderGroupedBhajanIndex(groups) {
  let num = 1;
  const blocks = groups
    .filter((g) => g.title)
    .map((g) => {
      const items = g.items
        .map((b) => {
          const label = bhajanNumberLabel(num);
          num += 1;
          return `<li><a href="#${b.id}"><span class="bhajan-index__num">${label}</span> ${escapeHtml(b.title)}</a></li>`;
        })
        .join('\n');
      return `<section class="index-group">
  <h2 class="index-group__title">${escapeHtml(g.title)}</h2>
  <ul class="content-index content-index--nested">${items}</ul>
</section>`;
    })
    .join('\n');
  return `<nav class="bhajan-index bhajan-index--grouped" id="bhajan-index" aria-label="भजन सूची">
${blocks}
</nav>`;
}

function renderBhajanCard(b, section, index, showSwarachitBadge) {
  const id = b.id || anchorId(section.slug, b.title, index);
  const num = index + 1;
  const sw = showSwarachitBadge && b.swarachit ? '<span class="bhajan-badge">स्वरचित</span>' : '';
  return `<article class="bhajan-card" id="${id}">
  <header class="bhajan-card__head">
    <h3 class="bhajan-card__title"><span class="bhajan-card__num">${bhajanNumberLabel(num)}</span> ${escapeHtml(b.title)}${sw}</h3>
  </header>
  <div class="bhajan-card__lyrics">${lyricsToHtml(b.lyrics, b.tarz)}</div>
  ${jabaniToHtml(b.jabani)}
</article>`;
}

function renderPageBanner(src, alt) {
  if (!src) return '';
  return `<div class="content-banner">
  <img class="content-banner__bg" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async">
  <img class="content-banner__img" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
</div>`;
}

function renderHomeBanner(config, base) {
  const src = config.home_banner ? pageUrl(base, config.home_banner) : '';
  return renderPageBanner(src, config.site_title);
}

function renderSectionBanner(section, base) {
  if (!section.banner) return '';
  return renderPageBanner(pageUrl(base, section.banner), section.title);
}

function renderIndex(config, sections, base) {
  const body = `${renderHomeBanner(config, base)}
<main class="content-main content-main--home">
  <h1 class="visually-hidden">${escapeHtml(config.site_title)}</h1>
  ${renderSectionIndexList(sections, base)}
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
  const showSwarachitBadge = section.slug !== 'swarachit';
  const grouped = sectionUsesGroups(section, bhajans);
  const groups = grouped ? bhajansByGroup(bhajans) : [];

  let indexHtml;
  let articlesHtml;
  if (grouped && groups.some((g) => g.title)) {
    indexHtml = renderGroupedBhajanIndex(groups);
    let bhajanIndex = 0;
    articlesHtml = groups
      .filter((g) => g.title)
      .map((g) => {
        const cards = g.items
          .map((b) => renderBhajanCard(b, section, bhajanIndex++, showSwarachitBadge))
          .join('\n');
        return `<section class="bhajan-group">
  <h2 class="bhajan-group__title">${escapeHtml(g.title)}</h2>
  <div class="bhajan-list">${cards}</div>
</section>`;
      })
      .join('\n');
  } else {
    indexHtml = renderBhajanIndex(bhajans, section);
    articlesHtml = `<div class="bhajan-list">${bhajans
      .map((b, i) => renderBhajanCard(b, section, i, showSwarachitBadge))
      .join('\n')}</div>`;
  }

  const body = `${renderSectionBanner(section, base)}
<main class="content-main content-main--section">
  <h1 class="section-title">${escapeHtml(section.title)}</h1>
  ${indexHtml}
  ${articlesHtml}
  <a href="#bhajan-index" class="bhajan-index-fab" aria-label="भजन सूची पर जाएँ">सूची ↑</a>
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

module.exports = {
  pageUrl,
  renderPage,
  renderIndex,
  renderSectionPage,
  anchorId,
  escapeHtml,
  bhajanNumberLabel,
  bhajansByGroup,
  sectionUsesGroups,
  renderBhajanIndex,
  renderGroupedBhajanIndex,
  renderBhajanCard,
};
