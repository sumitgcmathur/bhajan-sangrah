const { renderPage } = require('./template');

function renderSpellcheckPage(config, sections, base) {
  const body = `<main class="content-main content-main--spellcheck">
  <h1 class="section-title">स्पेल चेक</h1>
  <p class="spellcheck-intro">अज्ञात शब्द ढूँढें, शब्दकोश में जोड़ें, या सभी भजनों में सुधार करें। बदलाव लागू करने के लिए JSON निर्यात करके <code>node scripts/apply-spellcheck-changes.js</code> चलाएँ।</p>
  <div id="spellcheck-app" class="spellcheck-app">
    <div class="spellcheck-toolbar">
      <input type="search" id="spellcheck-filter" class="spellcheck-filter" placeholder="शब्द खोजें…" spellcheck="false">
      <span id="spellcheck-stats" class="spellcheck-stats"></span>
      <button type="button" id="spellcheck-refresh" class="spellcheck-btn spellcheck-btn--ghost">डेटा ताज़ा करें</button>
      <button type="button" id="spellcheck-export" class="spellcheck-btn">बदलाव निर्यात (JSON)</button>
    </div>
    <div class="spellcheck-bulk-bar">
      <button type="button" id="spellcheck-select-filtered" class="spellcheck-btn spellcheck-btn--ghost">दिख रहे सब चुनें</button>
      <button type="button" id="spellcheck-clear-selection" class="spellcheck-btn spellcheck-btn--ghost">चयन हटाएँ</button>
      <button type="button" id="spellcheck-bulk-add" class="spellcheck-btn" disabled>चयनित शब्दकोश में जोड़ें</button>
    </div>
    <div class="spellcheck-layout">
      <ul id="spellcheck-word-list" class="spellcheck-word-list" role="listbox" aria-multiselectable="true"></ul>
      <div id="spellcheck-detail" class="spellcheck-detail">
        <p class="spellcheck-detail__empty">बाएँ से कोई शब्द चुनें।</p>
      </div>
    </div>
    <aside id="spellcheck-pending" class="spellcheck-pending" aria-label="लंबित बदलाव">
      <h2 class="spellcheck-pending__title">लंबित बदलाव</h2>
      <ul id="spellcheck-pending-list" class="spellcheck-pending__list"></ul>
    </aside>
  </div>
</main>`;

  const spellCss = `${base}assets/css/spellcheck.css`;
  const page = renderPage({
    pageTitle: `स्पेल चेक — ${config.site_title}`,
    body,
    config,
    sections,
    base,
    currentSlug: null,
    bodyClass: 'page-spellcheck',
  });

  return page
    .replace('</head>', `<link rel="stylesheet" href="${spellCss}">\n</head>`)
    .replace(
      `<script src="${base}assets/js/search.js"></script>`,
      `<script src="${base}assets/js/spellcheck.js"></script>\n<script src="${base}assets/js/search.js"></script>`
    );
}

/** Minimal standalone page for local .spellcheck/ (not deployed). */
function renderLocalSpellcheckPage(config) {
  const title = `स्पेल चेक — ${config.site_title || 'भजन संग्रह'}`;
  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/spellcheck.css">
</head>
<body data-site-base="./">
<main class="content-main content-main--spellcheck" style="margin:0 auto; max-width:1100px; padding:1.5rem 1rem 2rem;">
  <h1 class="section-title">स्पेल चेक</h1>
  <p class="spellcheck-intro">स्थानीय उपकरण — GitHub पर नहीं जाता। बदलाव लागू करने के लिए JSON निर्यात करके <code>node scripts/apply-spellcheck-changes.js</code> चलाएँ, फिर <code>node scripts/build.js</code>।</p>
  <div id="spellcheck-app" class="spellcheck-app">
    <div class="spellcheck-toolbar">
      <input type="search" id="spellcheck-filter" class="spellcheck-filter" placeholder="शब्द खोजें…" spellcheck="false">
      <span id="spellcheck-stats" class="spellcheck-stats"></span>
      <button type="button" id="spellcheck-refresh" class="spellcheck-btn spellcheck-btn--ghost">डेटा ताज़ा करें</button>
      <button type="button" id="spellcheck-export" class="spellcheck-btn">बदलाव निर्यात (JSON)</button>
    </div>
    <div class="spellcheck-bulk-bar">
      <button type="button" id="spellcheck-select-filtered" class="spellcheck-btn spellcheck-btn--ghost">दिख रहे सब चुनें</button>
      <button type="button" id="spellcheck-clear-selection" class="spellcheck-btn spellcheck-btn--ghost">चयन हटाएँ</button>
      <button type="button" id="spellcheck-bulk-add" class="spellcheck-btn" disabled>चयनित शब्दकोश में जोड़ें</button>
    </div>
    <div class="spellcheck-layout">
      <ul id="spellcheck-word-list" class="spellcheck-word-list" role="listbox" aria-multiselectable="true"></ul>
      <div id="spellcheck-detail" class="spellcheck-detail">
        <p class="spellcheck-detail__empty">बाएँ से कोई शब्द चुनें।</p>
      </div>
    </div>
    <aside id="spellcheck-pending" class="spellcheck-pending" aria-label="लंबित बदलाव">
      <h2 class="spellcheck-pending__title">लंबित बदलाव</h2>
      <ul id="spellcheck-pending-list" class="spellcheck-pending__list"></ul>
    </aside>
  </div>
</main>
<script src="assets/js/spellcheck.js"></script>
</body>
</html>`;
}

module.exports = { renderSpellcheckPage, renderLocalSpellcheckPage };
