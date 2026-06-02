const { escapeHtml, lyricsToHtml, jabaniToHtml, lyricsHasSthayi } = require('./escape');
const { anchorId } = require('./slug');
const { toDevaNum } = require('./lyrics-structure');
const { landingBannerPath, sidebarMenuIconPath, sidebarMenuHomePath } = require('./banner-thumbs');

function pageUrl(base, page) {
  if (!page) return base || './';
  return `${base || './'}${page}`;
}

function formatBhajanCount(n) {
  return `${toDevaNum(n)} भजन`;
}

function formatSidebarCount(n) {
  return `(${toDevaNum(n)})`;
}

function renderSidebarMenuIcon(src) {
  if (!src) {
    return '<span class="sidebar-link__icon sidebar-link__icon--empty" aria-hidden="true"></span>';
  }
  return `<img class="sidebar-link__icon" src="${src}" width="28" height="28" alt="" loading="lazy" decoding="async">`;
}

function renderSidebarLinkIcon(section, base) {
  if (!section.banner) {
    return renderSidebarMenuIcon('');
  }
  return renderSidebarMenuIcon(pageUrl(base, sidebarMenuIconPath(section)));
}

function renderSidebarHomeItem(config, base, home, currentSlug) {
  const active = currentSlug == null ? ' is-active' : '';
  const src = config.home_banner ? pageUrl(base, sidebarMenuHomePath()) : '';
  return `<li class="sidebar-nav__item sidebar-nav__item--home">
  <a class="sidebar-link sidebar-link--home${active}" href="${home}">
  ${renderSidebarMenuIcon(src)}
  <span class="sidebar-link__body">
    <span class="sidebar-link__label">${escapeHtml(config.site_title)}</span>
  </span>
</a>
</li>`;
}

function renderNav(sections, base, currentSlug, sectionCounts) {
  const countBySlug = new Map((sectionCounts || []).map((c) => [c.slug, c.count]));
  return sections
    .map((s) => {
      const href = pageUrl(base, `${s.slug}.html`);
      const active = s.slug === currentSlug ? ' is-active' : '';
      const count = countBySlug.get(s.slug) ?? 0;
      const countHtml = `<span class="sidebar-link__count">${formatSidebarCount(count)}</span>`;
      return `<li><a class="sidebar-link${active}" href="${href}" aria-label="${escapeHtml(s.title)}, ${count} भजन">
  ${renderSidebarLinkIcon(s, base)}
  <span class="sidebar-link__body">
    <span class="sidebar-link__label">${escapeHtml(s.title)}</span>
    ${countHtml}
  </span>
</a></li>`;
    })
    .join('\n');
}

function renderSidebar(config, sections, base, currentSlug, sectionCounts) {
  const home = pageUrl(base, 'index.html');
  return `<aside class="site-sidebar" id="site-sidebar" aria-label="साइट मार्गदर्शन">
  <nav class="sidebar-nav" aria-label="विभाग सूची">
    <ul class="sidebar-nav__list sidebar-nav__list--sections">
      ${renderSidebarHomeItem(config, base, home, currentSlug)}
      ${renderNav(sections, base, currentSlug, sectionCounts)}
    </ul>
  </nav>
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
  const pwa192 = pageUrl(base, 'assets/icons/pwa-192.png');
  const pwa512 = pageUrl(base, 'assets/icons/pwa-512.png');
  const manifest = pageUrl(base, 'manifest.webmanifest');
  if (!iconHref) return '';
  const type = iconTypeFromHref(iconHref);
  const typeAttr = type ? ` type="${type}"` : '';
  return (
    `<link rel="icon"${typeAttr} href="${iconHref}">\n` +
    `<link rel="apple-touch-icon" sizes="180x180" href="${pwa192 || iconHref}">\n` +
    `<link rel="manifest" href="${manifest}">\n`
  );
}

function renderThemeBootScript() {
  return `<script>(function(){try{var t=localStorage.getItem("bhajan-sangrah-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>`;
}

function renderHead(pageTitle, base, config) {
  const css = pageUrl(base, 'assets/css/site.css');
  const favicon = renderIconLinks(base, config);
  return `<meta charset="utf-8">
${renderThemeBootScript()}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#8b3a4a" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#2a1218" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(config?.site_title || 'भजन संग्रह')}">
<meta name="description" content="भक्ति भजन संग्रह">
<title>${escapeHtml(pageTitle)}</title>
${favicon}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}">`;
}

function renderToolbarSearchIcon() {
  return `<svg class="mobile-bar__icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10.5" cy="10.5" r="5.75" stroke="currentColor" stroke-width="1.75"/>
  <path d="M15.2 15.2L20 20" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
</svg>`;
}

function renderSearchPanel() {
  return `<div class="bhajan-search-backdrop" id="bhajan-search-backdrop" hidden></div>
<aside class="bhajan-search-panel" id="bhajan-search-panel" aria-hidden="true" aria-label="भजन खोज">
  <div class="bhajan-search-panel__head">
    <p class="bhajan-search-panel__title">भजन खोजें</p>
    <button type="button" class="bhajan-search-panel__close" aria-label="बंद करें">×</button>
  </div>
  <div class="bhajan-search-panel__body">
    <label class="visually-hidden" for="bhajan-search">भजन खोजें</label>
    <input type="search" id="bhajan-search" class="bhajan-search__input" placeholder="शब्द या पंक्ति लिखें…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="bhajan-search-results" aria-autocomplete="list">
    <ul id="bhajan-search-results" class="bhajan-search__results" role="listbox" hidden></ul>
  </div>
</aside>`;
}

function renderToolbarIndexIcon() {
  return `<svg class="mobile-bar__icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M5.25 4.25h10.85L17.75 6v13.25H5.25V4.25z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
  <path d="M15.9 4.25V6.35h2.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M15.9 4.25 17.75 6.35 15.9 6.35z" fill="var(--surface)" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>
  <rect x="7.1" y="7.85" width="9.4" height="2.15" rx="0.45" fill="var(--accent)" opacity="0.88"/>
  <circle cx="7.85" cy="11.85" r="0.75" fill="currentColor"/>
  <path d="M9.35 11.85h5.1" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M15.35 11.85h1.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="7.85" cy="14.15" r="0.75" fill="currentColor"/>
  <path d="M9.35 14.15h5.1" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M15.35 14.15h1.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="7.85" cy="16.45" r="0.75" fill="currentColor"/>
  <path d="M9.35 16.45h5.1" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M15.35 16.45h1.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}

function renderMobileBar(isSectionPage) {
  const indexBtn = isSectionPage
    ? `<button type="button" class="mobile-bar__btn" data-action="index" aria-label="भजन सूची पर जाएँ">${renderToolbarIndexIcon()}</button>`
    : '';
  return `<nav class="mobile-bar" aria-label="मुख्य मेनू">
  <button type="button" class="mobile-bar__btn sidebar-toggle" data-action="menu" aria-expanded="false" aria-controls="site-sidebar" aria-label="मेनू"><span class="mobile-bar__icon" aria-hidden="true">≡</span></button>
  ${indexBtn}
  <button type="button" class="mobile-bar__btn search-toggle" aria-expanded="false" aria-controls="bhajan-search-panel" aria-label="भजन खोजें">${renderToolbarSearchIcon()}</button>
  <button type="button" class="mobile-bar__btn" data-action="theme" aria-pressed="false" aria-label="गहरा रंग"><span class="mobile-bar__icon mobile-bar__icon--theme" aria-hidden="true">☽</span></button>
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
  const { pageTitle, body, config, sections, base, currentSlug, bodyClass = '', sectionCounts } =
    opts;
  const isSectionPage = bodyClass.includes('page-section');
  return `<!DOCTYPE html>
<html lang="hi">
<head>
${renderHead(pageTitle, base, config)}
</head>
<body class="has-sidebar ${bodyClass}" data-site-base="${escapeHtml(base)}">
<div class="site-shell">
${renderSidebar(config, sections, base, currentSlug, sectionCounts)}
<div class="site-content">
${body}
${renderFooter()}
</div>
</div>
${renderMobileBar(isSectionPage)}
${renderSearchPanel()}
<script src="${pageUrl(base, 'assets/js/nav.js')}"></script>
<script src="${pageUrl(base, 'assets/js/theme.js')}"></script>
<script src="${pageUrl(base, 'assets/js/ui.js')}"></script>
<script src="${pageUrl(base, 'assets/js/search.js')}"></script>
<script src="${pageUrl(base, 'assets/js/pwa.js')}"></script>
</body>
</html>`;
}

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
  <div class="section-hero__banner">${banner}</div>
  <nav class="section-hero__index bhajan-index bhajan-index--inline" id="bhajan-index" aria-label="भजन सूची">
    ${indexPanelHtml}
  </nav>
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
  const sthayiAnchor = `${id}-sthayi`;
  const hasSthayi = lyricsHasSthayi(b.lyrics);
  const toSthayi = hasSthayi
    ? `<a href="#${sthayiAnchor}" class="bhajan-card__to-sthayi">↑ स्थायी</a>`
    : '';
  return `<article class="bhajan-card" id="${id}">
  <header class="bhajan-card__head">
    <h3 class="bhajan-card__title"><span class="bhajan-card__num">${bhajanNumberLabel(num)}</span> ${escapeHtml(b.title)}${sw}</h3>
  </header>
  <div class="bhajan-card__lyrics">${lyricsToHtml(b.lyrics, b.tarz, { sthayiAnchorId: hasSthayi ? sthayiAnchor : null })}</div>
  ${toSthayi}
  ${jabaniToHtml(b.jabani)}
</article>`;
}

function renderPageBanner(src, alt, { hero = false } = {}) {
  if (!src) return '';
  const heroClass = hero ? ' content-banner--hero' : '';
  const backdrop = hero
    ? `<div class="content-banner__backdrop" aria-hidden="true">
  <img class="content-banner__ambient" src="${src}" alt="" loading="lazy" decoding="async">
  <img class="content-banner__wing content-banner__wing--left" src="${src}" alt="" loading="lazy" decoding="async">
  <img class="content-banner__wing content-banner__wing--right" src="${src}" alt="" loading="lazy" decoding="async">
  <img class="content-banner__bg" src="${src}" alt="" loading="lazy" decoding="async">
</div>`
    : `<img class="content-banner__bg" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
  return `<div class="content-banner${heroClass}">
  ${backdrop}
  <img class="content-banner__img" src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
</div>`;
}

function renderHomeBanner(config, base) {
  const src = config.home_banner ? pageUrl(base, config.home_banner) : '';
  return renderPageBanner(src, config.site_title, { hero: true });
}

function renderSectionBanner(section, base) {
  if (!section.banner) return '';
  return renderPageBanner(pageUrl(base, section.banner), section.title, { hero: true });
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
    sectionCounts: counts,
  });
}

function renderSectionPage(section, bhajans, config, sections, base, sectionCounts) {
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
    sectionCounts,
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
