const { escapeHtml, lyricsToHtml, jabaniToHtml } = require('./escape');
const { anchorId } = require('./slug');
const { toDevaNum } = require('./lyrics-structure');

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
  <div class="sidebar-tools">
    <button type="button" class="sidebar-search-open search-toggle" aria-expanded="false" aria-controls="bhajan-search-panel">
      <span class="sidebar-search-open__icon" aria-hidden="true">⌕</span>
      <span>भजन खोजें</span>
    </button>
  </div>
  <nav class="sidebar-nav" aria-label="विभाग">
    <p class="sidebar-nav__label">विभाग</p>
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
<meta name="theme-color" content="#8b3a4a" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#2a1218" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(pageTitle)}</title>
${favicon}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;
}

function renderMobileBar(isSectionPage) {
  const indexBtn = isSectionPage
    ? `<button type="button" class="mobile-bar__btn mobile-bar__btn--index" data-action="index" aria-label="भजन सूची"><span class="mobile-bar__icon" aria-hidden="true">☰</span><span class="mobile-bar__label">सूची</span></button>`
    : '';
  return `<nav class="mobile-bar" aria-label="मुख्य मेनू">
  <button type="button" class="mobile-bar__btn sidebar-toggle" data-action="menu" aria-expanded="false" aria-controls="site-sidebar"><span class="mobile-bar__icon" aria-hidden="true">≡</span><span class="mobile-bar__label">मेनू</span></button>
  <button type="button" class="mobile-bar__btn search-toggle" data-action="search" aria-expanded="false" aria-controls="bhajan-search-panel"><span class="mobile-bar__icon" aria-hidden="true">⌕</span><span class="mobile-bar__label">खोज</span></button>
  <button type="button" class="mobile-bar__btn" data-action="reading-mode" aria-pressed="false" aria-label="पढ़ने का मोड"><span class="mobile-bar__icon" aria-hidden="true">अ</span><span class="mobile-bar__label">पढ़ें</span></button>
  ${indexBtn}
</nav>`;
}

function renderSectionScrollHeader(sectionTitle, total) {
  return `<div class="section-scroll-header" id="section-scroll-header" hidden aria-live="polite">
  <span class="section-scroll-header__title">${escapeHtml(sectionTitle)}</span>
  <span class="section-scroll-header__progress" id="section-scroll-progress">१ / ${total}</span>
</div>`;
}

function renderBhajanPager() {
  return `<nav class="bhajan-pager" id="bhajan-pager" aria-label="पिछला अगला भजन" hidden>
  <a class="bhajan-pager__link bhajan-pager__prev" id="bhajan-pager-prev" href="#">← पिछला</a>
  <span class="bhajan-pager__status" id="bhajan-pager-status"></span>
  <a class="bhajan-pager__link bhajan-pager__next" id="bhajan-pager-next" href="#">अगला →</a>
</nav>`;
}

function renderPage(opts) {
  const { pageTitle, body, config, sections, base, currentSlug, bodyClass = '' } = opts;
  const isSectionPage = bodyClass.includes('page-section');
  return `<!DOCTYPE html>
<html lang="hi">
<head>
${renderHead(pageTitle, base, config)}
</head>
<body class="has-sidebar ${bodyClass}" data-site-base="${escapeHtml(base)}">
<div class="site-shell">
${renderSidebar(config, sections, base, currentSlug)}
<div class="site-content">
${body}
${renderFooter()}
</div>
</div>
${renderMobileBar(isSectionPage)}
${renderSearchPanel()}
<script src="${pageUrl(base, 'assets/js/nav.js')}"></script>
<script src="${pageUrl(base, 'assets/js/search.js')}"></script>
<script src="${pageUrl(base, 'assets/js/ui.js')}"></script>
</body>
</html>`;
}

const { landingBannerPath, landingHomeBannerPath } = require('./banner-thumbs');

function sectionCardImage(section, base, config) {
  if (section.banner) return pageUrl(base, landingBannerPath(section));
  if (config.site_icon) return pageUrl(base, config.site_icon);
  return '';
}

function renderSectionCardBanner(src, alt) {
  if (!src) {
    return '<div class="section-card__media section-card__media--empty" aria-hidden="true"></div>';
  }
  return `<div class="section-card__media content-banner content-banner--card">
  <img class="content-banner__img" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
</div>`;
}

function formatBhajanCount(n) {
  return `${toDevaNum(n)} भजन`;
}

function renderHomeStats(totalBhajans, sectionCount) {
  return `<p class="home-stats" aria-label="कुल ${totalBhajans} भजन, ${sectionCount} श्रेणियाँ">
  <span class="home-stats__item">कुल <strong>${toDevaNum(totalBhajans)}</strong> भजन</span>
  <span class="home-stats__sep" aria-hidden="true">·</span>
  <span class="home-stats__item"><strong>${toDevaNum(sectionCount)}</strong> श्रेणियाँ</span>
</p>`;
}

function renderSectionGrid(sections, base, config, sectionCounts) {
  const countBySlug = new Map(sectionCounts.map((c) => [c.slug, c.count]));
  const cards = sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      const img = sectionCardImage(s, base, config);
      const count = countBySlug.get(s.slug) ?? 0;
      const countHtml = `<span class="section-card__count">${formatBhajanCount(count)}</span>`;
      return `<a class="section-card" href="${href}" aria-label="${escapeHtml(s.title)}, ${count} भजन">
  ${renderSectionCardBanner(img, s.title)}
  <span class="section-card__foot">${countHtml}</span>
</a>`;
    })
    .join('\n');
  return `<div class="section-grid">${cards}</div>`;
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

function wrapCollapsibleBhajanIndex(innerHtml, count) {
  return `<nav class="bhajan-index bhajan-index--collapsible" id="bhajan-index" aria-label="भजन सूची">
  <button type="button" class="bhajan-index__toggle" aria-expanded="false" aria-controls="bhajan-index-panel">
    <span class="bhajan-index__toggle-text">भजन सूची दिखाएँ</span>
    <span class="bhajan-index__count">(${count})</span>
  </button>
  <div class="bhajan-index__panel" id="bhajan-index-panel" hidden>${innerHtml}</div>
</nav>`;
}

function renderBhajanIndexList(bhajans, section) {
  const items = bhajans
    .map((b, i) => {
      const id = b.id || anchorId(section.slug, b.title, i);
      const num = i + 1;
      return `<li><a href="#${id}"><span class="bhajan-index__num">${bhajanNumberLabel(num)}</span> ${escapeHtml(b.title)}</a></li>`;
    })
    .join('\n');
  return `<ul class="content-index">${items}</ul>`;
}

function renderGroupedBhajanIndexList(groups) {
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
  return `<div class="bhajan-index__grouped">${blocks}</div>`;
}

function renderBhajanIndex(bhajans, section) {
  return wrapCollapsibleBhajanIndex(renderBhajanIndexList(bhajans, section), bhajans.length);
}

function renderGroupedBhajanIndex(groups) {
  const total = groups.reduce((n, g) => n + (g.title ? g.items.length : 0), 0);
  return wrapCollapsibleBhajanIndex(renderGroupedBhajanIndexList(groups), total);
}

function renderSectionHero(section, base, indexPanelHtml) {
  const banner = renderSectionBanner(section, base);
  if (!banner) return '';
  return `<div class="section-hero" id="section-hero">
  <div class="section-hero__view section-hero__view--banner">${banner}</div>
  <nav class="section-hero__view section-hero__view--index bhajan-index" id="section-hero-index" hidden aria-label="भजन सूची">
    <div class="section-hero__index-scroll">${indexPanelHtml}</div>
  </nav>
  <button type="button" class="section-hero__toggle" id="section-hero-toggle" aria-expanded="false" aria-controls="section-hero-index">
    <span class="section-hero__toggle-when-banner">सूची</span>
    <span class="section-hero__toggle-when-index" hidden>चित्र</span>
  </button>
</div>`;
}

function flattenBhajansForNav(bhajans, section, grouped, groups) {
  const flat = [];
  if (grouped && groups.some((g) => g.title)) {
    for (const g of groups.filter((g) => g.title)) {
      for (const b of g.items) flat.push(b);
    }
  } else {
    flat.push(...bhajans);
  }
  let idx = 0;
  return flat.map((b) => {
    const entry = {
      id: b.id || anchorId(section.slug, b.title, idx),
      title: b.title,
      num: idx + 1,
    };
    idx += 1;
    return entry;
  });
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
  const src = config.home_banner ? pageUrl(base, landingHomeBannerPath()) : '';
  return renderPageBanner(src, config.site_title);
}

function renderSectionBanner(section, base) {
  if (!section.banner) return '';
  return renderPageBanner(pageUrl(base, section.banner), section.title);
}

function renderIndex(config, sections, base, sectionCounts) {
  const counts = sectionCounts || [];
  const totalBhajans = counts.reduce((sum, c) => sum + c.count, 0);
  const body = `${renderHomeBanner(config, base)}
<main class="content-main content-main--home">
  <h1 class="home-title">${escapeHtml(config.site_title)}</h1>
  ${renderHomeStats(totalBhajans, sections.length)}
  ${renderSectionGrid(sections, base, config, counts)}
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
  let heroHtml;
  let articlesHtml;
  const indexPanel =
    grouped && groups.some((g) => g.title)
      ? renderGroupedBhajanIndexList(groups)
      : renderBhajanIndexList(bhajans, section);
  if (section.banner) {
    heroHtml = renderSectionHero(section, base, indexPanel);
    indexHtml = '';
  } else if (grouped && groups.some((g) => g.title)) {
    indexHtml = renderGroupedBhajanIndex(groups);
  } else {
    indexHtml = renderBhajanIndex(bhajans, section);
  }
  if (grouped && groups.some((g) => g.title)) {
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
    articlesHtml = `<div class="bhajan-list">${bhajans
      .map((b, i) => renderBhajanCard(b, section, i, showSwarachitBadge))
      .join('\n')}</div>`;
  }

  const navList = flattenBhajansForNav(bhajans, section, grouped, groups);
  const navJson = escapeHtml(JSON.stringify(navList));
  const body = `${heroHtml || ''}
${renderSectionScrollHeader(section.title, navList.length)}
<main class="content-main content-main--section" data-section-title="${escapeHtml(section.title)}" data-section-slug="${escapeHtml(section.slug)}" data-bhajan-nav="${navJson}">
  <h1 class="section-title">${escapeHtml(section.title)}</h1>
  ${indexHtml}
  ${articlesHtml}
</main>
${renderBhajanPager()}`;

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
  renderBhajanIndexList,
  renderGroupedBhajanIndexList,
  renderSectionHero,
  renderBhajanCard,
};
