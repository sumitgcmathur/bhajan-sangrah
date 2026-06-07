const path = require('path');
const { ROOT } = require('./paths');
const { toDevaNum } = require('./lyrics-structure');
const { landingBannerPath } = require('./banner-thumbs');
const { pathToFileURL } = require('./pdf-assets');
const {
  escapeHtml,
  bhajanNumberLabel,
  bhajansByGroup,
  sectionUsesGroups,
  renderBhajanCard,
  renderOmFrameDecor,
} = require('./template');

function sectionAnchorId(slug) {
  return `pdf-section-${slug}`;
}

function assetFileURL(relativePath) {
  if (!relativePath) return '';
  return pathToFileURL(path.join(ROOT, relativePath.replace(/^\//, '')));
}

function resolvePdfAsset(resolveAsset, relativePath, opts = {}) {
  const out = resolveAsset(relativePath, opts);
  if (out && typeof out === 'object') return out;
  const url = out || assetFileURL(relativePath);
  return { full: url, blur: url, thumb: url };
}

function renderPdfIndexItem(hrefId, labelHtml) {
  return `<li class="pdf-index__item">
  <a href="#${hrefId}" class="pdf-index__link">
    <span class="pdf-index__label">${labelHtml}</span>
    <span class="pdf-index__leaders" aria-hidden="true"></span>
  </a>
</li>`;
}

function assignBhajanIds(section, bhajans) {
  const grouped = sectionUsesGroups(section, bhajans);
  if (grouped && bhajansByGroup(bhajans, section).some((g) => g.title)) {
    const out = [];
    for (const g of bhajansByGroup(bhajans, section)) {
      if (!g.title) continue;
      for (const b of g.items) {
        out.push({ ...b, id: b.id });
      }
    }
    return out;
  }
  return bhajans.map((b) => ({ ...b, id: b.id }));
}

function renderPdfIndexItemsForSection(section, bhajans, numRef) {
  const showSwarachitBadge = section.slug !== 'swarachit';
  const withIds = assignBhajanIds(section, bhajans);
  const grouped = sectionUsesGroups(section, bhajans);
  const groups = grouped ? bhajansByGroup(withIds, section) : [];

  if (grouped && groups.some((g) => g.title)) {
    return groups
      .filter((g) => g.title)
      .map((g) => {
        const items = g.items
          .map((b) => {
            const num = bhajanNumberLabel(numRef.n++);
            const sw =
              showSwarachitBadge && b.swarachit
                ? ' <span class="pdf-index__badge">स्वरचित</span>'
                : '';
            return renderPdfIndexItem(
              b.id,
              `<span class="bhajan-index__num">${num}</span> ${escapeHtml(b.title)}${sw}`
            );
          })
          .join('\n');
        return `<section class="pdf-index__group">
  <h3 class="pdf-index__group-title">${escapeHtml(g.title)}</h3>
  <ul class="pdf-index__list">${items}</ul>
</section>`;
      })
      .join('\n');
  }

  return `<ul class="pdf-index__list">${withIds
    .map((b) => {
      const num = bhajanNumberLabel(numRef.n++);
      const sw =
        showSwarachitBadge && b.swarachit
          ? ' <span class="pdf-index__badge">स्वरचित</span>'
          : '';
      return renderPdfIndexItem(
        b.id,
        `<span class="bhajan-index__num">${num}</span> ${escapeHtml(b.title)}${sw}`
      );
    })
    .join('\n')}</ul>`;
}

function renderPdfSectionIndex(section, bhajans) {
  if (!bhajans.length) return '';
  const numRef = { n: 1 };
  const body = renderPdfIndexItemsForSection(section, bhajans, numRef);
  const grouped =
    sectionUsesGroups(section, bhajans) && bhajansByGroup(bhajans, section).some((g) => g.title);
  return `<nav class="pdf-section-index${grouped ? ' pdf-section-index--grouped' : ''}" aria-label="भजन सूची">
  <h2 class="pdf-section-index__title">भजन सूची</h2>
  ${body}
</nav>`;
}

function formatBhajanCount(n) {
  return `${toDevaNum(n)} भजन`;
}

function renderPdfLanding(config, sectionPayloads, resolveAsset) {
  const totalBhajans = sectionPayloads.reduce((n, p) => n + p.bhajans.length, 0);
  const cards = sectionPayloads
    .map(({ section, bhajans }) => {
      if (!bhajans.length) return '';
      const href = `#${sectionAnchorId(section.slug)}`;
      const thumbRel = section.banner ? landingBannerPath(section) : config.home_banner || '';
      const assets = thumbRel
        ? resolvePdfAsset(resolveAsset, thumbRel, { section })
        : { full: '', blur: '', thumb: '' };
      const imgSrc = assets.thumb || assets.full;
      const media = imgSrc
        ? `<div class="pdf-landing__card-media"><img class="pdf-landing__card-img" src="${imgSrc}" alt=""></div>`
        : `<div class="pdf-landing__card-media pdf-landing__card-media--empty" aria-hidden="true"></div>`;
      return `<a class="pdf-landing__card" href="${href}">
  ${media}
  <span class="pdf-landing__card-title">${escapeHtml(section.title)}</span>
  <span class="pdf-landing__card-count">${formatBhajanCount(bhajans.length)}</span>
</a>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<section class="pdf-landing" id="pdf-landing">
  <h1 class="pdf-landing__title">${escapeHtml(config.site_title || 'भजन संग्रह')}</h1>
  <p class="pdf-landing__stats">कुल <strong>${toDevaNum(totalBhajans)}</strong> भजन · <strong>${toDevaNum(sectionPayloads.length)}</strong> श्रेणियाँ</p>
  <div class="pdf-landing__grid">${cards}</div>
</section>`;
}

function renderPdfBannerFill(assets, alt) {
  if (!assets.full) return '';
  return `<figure class="pdf-banner pdf-banner--fill">
  <div class="pdf-banner__backdrop" aria-hidden="true"></div>
  <img class="pdf-banner__img" src="${assets.full}" alt="${escapeHtml(alt)}">
</figure>`;
}

function renderPdfBannerPage(section, resolveAsset) {
  if (!section.banner) return '';
  const assets = resolvePdfAsset(resolveAsset, section.banner, { section });
  if (!assets.full) return '';
  return `<section class="pdf-banner-page" aria-label="${escapeHtml(section.title)}">
  ${renderPdfBannerFill(assets, section.title)}
</section>`;
}

function pdfWatermarkStyleAttr(watermarkUrl) {
  if (!watermarkUrl) return '';
  const safe = String(watermarkUrl).replace(/'/g, '%27');
  return ` style="--pdf-watermark: url('${safe}')"`;
}

function stripBhajanCardOmFrame(html) {
  return html
    .replace(/<article class="bhajan-card om-frame"/g, '<article class="bhajan-card"')
    .replace(/\s*<div class="om-frame__ring"[\s\S]*?(?=<header class="bhajan-card__head")/g, '\n  ');
}

function renderPdfBhajanCard(b, section, index, showSwarachitBadge) {
  let html = renderBhajanCard(b, section, index, showSwarachitBadge);
  html = html.replace(/\s*<a class="bhajan-card__to-(?:index|sthayi)"[^>]*>[\s\S]*?<\/a>/g, '');
  html = html.replace('class="bhajan-badge"', 'class="bhajan-badge pdf-bhajan-badge"');
  html = stripBhajanCardOmFrame(html);
  return `${html}
<p class="pdf-bhajan-end" aria-hidden="true">********</p>`;
}

function renderPdfSection(section, bhajans, resolveAsset, watermarkBySlug = {}) {
  const showSwarachitBadge = section.slug !== 'swarachit';
  const grouped = sectionUsesGroups(section, bhajans);
  const groups = grouped ? bhajansByGroup(bhajans, section) : [];
  const secId = sectionAnchorId(section.slug);
  const watermarkUrl = watermarkBySlug[section.slug] || '';

  let articlesHtml;

  if (grouped && groups.some((g) => g.title)) {
    let bhajanIndex = 0;
    const groupsWithIds = groups
      .filter((g) => g.title)
      .map((g) => ({
        title: g.title,
        items: g.items.map((b) => {
          bhajanIndex += 1;
          return { ...b, id: b.id };
        }),
      }));
    bhajanIndex = 0;
    articlesHtml = groupsWithIds
      .map((g) => {
        const cards = g.items
          .map((b) => renderPdfBhajanCard(b, section, bhajanIndex++, showSwarachitBadge))
          .join('\n');
        return `<section class="bhajan-group">
  <h2 class="bhajan-group__title">${escapeHtml(g.title)}</h2>
  <div class="bhajan-list pdf-bhajan-list">${cards}</div>
</section>`;
      })
      .join('\n');
  } else {
    const withIds = bhajans.map((b) => ({ ...b, id: b.id }));
    articlesHtml = `<div class="bhajan-list pdf-bhajan-list">${withIds
      .map((b, i) => renderPdfBhajanCard(b, section, i, showSwarachitBadge))
      .join('\n')}</div>`;
  }

  const bannerClass = watermarkUrl ? ' pdf-section--has-banner' : '';
  const bannerStyle = watermarkUrl ? pdfWatermarkStyleAttr(watermarkUrl) : '';

  return `${renderPdfBannerPage(section, resolveAsset)}
<section class="pdf-section${bannerClass}" id="${secId}"${bannerStyle}>
  <header class="pdf-section__head">
    <h1 class="pdf-section__title">${escapeHtml(section.title)}</h1>
  </header>
  ${renderPdfSectionIndex(section, bhajans)}
  ${articlesHtml}
</section>`;
}

const PRINT_TOOLBAR = `<div class="pdf-print-toolbar no-print" role="region" aria-label="मुद्रण">
  <a class="pdf-print-toolbar__back" href="index.html">← मुख पृष्ठ</a>
  <button type="button" class="pdf-print-toolbar__btn" id="pdf-print-btn">Save as PDF</button>
  <p class="pdf-print-toolbar__hint">Use Chrome or Edge. Enable &ldquo;Background graphics&rdquo;.</p>
</div>`;

const PRINT_TOOLBAR_SCRIPT = `
(function () {
  function doPrint() {
    window.print();
  }
  document.getElementById('pdf-print-btn')?.addEventListener('click', doPrint);
  if (new URLSearchParams(window.location.search).get('print') === '1') {
    function schedule() {
      setTimeout(doPrint, 600);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule);
    } else {
      schedule();
    }
  }
})();
`;

function renderPdfDocument(config, sectionPayloads, options = {}) {
  const resolveAsset =
    options.resolveAsset ||
    ((relativePath) => {
      const url = assetFileURL(relativePath);
      return { full: url, blur: url, thumb: url };
    });
  const cssHref =
    options.cssHref || pathToFileURL(path.join(ROOT, 'assets', 'css', 'pdf-export.css'));
  const date = new Date().toISOString().slice(0, 10);
  const coverAssets = config.home_banner
    ? resolvePdfAsset(resolveAsset, config.home_banner)
    : { full: '', blur: '', thumb: '' };
  const showToolbar = Boolean(options.showPrintToolbar);

  const watermarkBySlug = options.watermarkBySlug || {};
  const sectionsHtml = sectionPayloads
    .map(({ section, bhajans }) =>
      renderPdfSection(section, bhajans, resolveAsset, watermarkBySlug)
    )
    .join('\n');

  const coverBanner = coverAssets.full
    ? renderPdfBannerFill(coverAssets, config.site_title || 'भजन संग्रह')
    : '';

  const toolbar = showToolbar ? PRINT_TOOLBAR : '';
  const toolbarScript = showToolbar ? `<script>${PRINT_TOOLBAR_SCRIPT}</script>` : '';

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(config.site_title || 'भजन संग्रह')} — PDF</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${cssHref}">
</head>
<body class="pdf-export${showToolbar ? ' pdf-export--with-toolbar' : ''}">
${toolbar}
<section class="pdf-cover">
  ${coverBanner}
  <div class="pdf-cover__text">
    <h1 class="pdf-cover__title">${escapeHtml(config.site_title || 'भजन संग्रह')}</h1>
    <p class="pdf-cover__meta">संपूर्ण भजन संग्रह · ${date}</p>
  </div>
</section>
${renderPdfLanding(config, sectionPayloads, resolveAsset)}
<div class="pdf-page-frame" aria-hidden="true">${renderOmFrameDecor()}</div>
${sectionsHtml}
${toolbarScript}
</body>
</html>`;
}

module.exports = {
  renderPdfDocument,
  sectionAnchorId,
  pathToFileURL,
  assetFileURL,
};
